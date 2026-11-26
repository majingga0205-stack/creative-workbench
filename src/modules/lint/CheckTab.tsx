// 검사: 원고 하이라이트(왼쪽) + 지적 목록·필터·항목 카드(오른쪽), 처리 상태, 리포트
import { useEffect, useMemo, useRef, useState } from 'react';
import { applyResolutions, buildReportHtml, buildReportMarkdown, formatAppears, formatSources, highlightSpans, lintText, type FindingColor, type ResolvedFinding } from '../../core/lint';
import { db } from '../../db/database';
import { deleteResolution, saveResolution, updateChapter } from '../../db/repo';
import type { Chapter, GlossaryEntry, LintEntry, LintResolution, Work, WorkSetting } from '../../db/types';
import { toast } from '../../shared/dialogs';
import { downloadText } from '../../shared/files';
import { Badge, Button, Card, Empty, Input, Select, TextArea } from '../../shared/ui';
import { useUI } from '../../store/ui';
import { useTextRules } from '../../shared/useTextRules';
import { activeVersion, chapterLabel } from '../serial/useSerial';
import { eraOf, eraText, useEraPresets } from './useLint';

const COLOR: Record<FindingColor, { mark: string; dot: string; label: string }> = {
  red: { mark: 'bg-red-100 text-red-950 ring-1 ring-red-300', dot: 'bg-red-600', label: '빨강' },
  yellow: { mark: 'bg-amber-100 text-amber-950 ring-1 ring-amber-300', dot: 'bg-amber-500', label: '노랑' },
  blue: { mark: 'bg-sky-100 text-sky-950 ring-1 ring-sky-300', dot: 'bg-sky-600', label: '파랑' },
};

type Item = ResolvedFinding & { chapterId: string; key: string };
type KindFilter = '' | 'not_yet' | 'meaning_shift' | 'glossary';

export function CheckTab({
  work,
  chapters,
  entries,
  glossary,
  resolutions,
}: {
  work: Work;
  chapters: Chapter[];
  entries: LintEntry[];
  glossary: GlossaryEntry[];
  resolutions: LintResolution[];
}) {
  const presets = useEraPresets() ?? [];
  const { lintEra, lintGlossary, setLintOptions, setView } = useUI();
  const [mode, setMode] = useState<'chapters' | 'paste'>(chapters.length ? 'chapters' : 'paste');
  const [checked, setChecked] = useState<string[]>(() => (chapters[0] ? [chapters[0].id] : []));
  const [viewId, setViewId] = useState<string | undefined>(chapters[0]?.id);
  const [paste, setPaste] = useState('');
  const [pasteEra, setPasteEra] = useState<string>('work'); // 'work' 또는 프리셋 번호
  const [filters, setFilters] = useState<{ color: '' | FindingColor; kind: KindFilter; chapter: string; status: string }>({ color: '', kind: '', chapter: '', status: '' });
  const [active, setActive] = useState<string | null>(null);
  const [checkedAt] = useState(() => new Date());
  const textRef = useRef<HTMLDivElement>(null);

  const entryById = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const rules = useTextRules();
  const opts = { era: lintEra, glossary: lintGlossary, josa: rules?.josa };

  const targets = useMemo(() => {
    if (mode === 'paste') {
      const era = pasteEra === 'work' ? work.setting : presets[Number(pasteEra)];
      return [{ id: 'paste', label: '붙여넣은 글', text: paste, era }];
    }
    return chapters.filter((c) => checked.includes(c.id)).map((c) => ({ id: c.id, label: chapterLabel(c), text: activeVersion(c).text, era: eraOf(work, c) }));
  }, [mode, paste, pasteEra, presets, chapters, checked, work]);

  const items: Item[] = useMemo(
    () =>
      targets.flatMap((t) =>
        applyResolutions(lintText(t.text, entries, t.era ?? null, glossary, opts), mode === 'paste' ? [] : resolutions, mode === 'paste' ? undefined : t.id).map((f) => ({
          ...f,
          chapterId: t.id,
          key: `${t.id}:${f.ruleKey}:${f.start}`,
        })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targets, entries, glossary, resolutions, lintEra, lintGlossary, mode, rules],
  );

  const visible = items.filter(
    (f) =>
      (!filters.color || f.color === filters.color) &&
      (!filters.kind || (filters.kind === 'glossary' ? f.source === 'glossary' : f.source === 'era' && entryById.get(f.entryId)?.kind === filters.kind)) &&
      (!filters.chapter || f.chapterId === filters.chapter) &&
      (!filters.status || f.status === filters.status),
  );

  const viewTarget = targets.find((t) => t.id === (mode === 'paste' ? 'paste' : viewId)) ?? targets[0];
  const viewItems = items.filter((f) => f.chapterId === viewTarget?.id);
  const activeItem = items.find((f) => f.key === active);

  // 지적을 누르면 그 회차를 열고 원문 위치로 이동
  useEffect(() => {
    if (!activeItem) return;
    const el = textRef.current?.querySelector(`[data-start="${activeItem.start}"]`) ?? [...(textRef.current?.querySelectorAll('[data-start]') ?? [])].find((m) => {
      const s = Number(m.getAttribute('data-start'));
      const e = Number(m.getAttribute('data-end'));
      return s <= activeItem.start && activeItem.start < e;
    });
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeItem, viewTarget?.id]);

  const open = (f: Item) => {
    if (mode === 'chapters') setViewId(f.chapterId);
    setActive(f.key);
  };

  const counts = { red: items.filter((f) => f.color === 'red').length, yellow: items.filter((f) => f.color === 'yellow').length, blue: items.filter((f) => f.color === 'blue').length };

  const report = (kind: 'md' | 'html') => {
    const eras = [...new Set(targets.map((t) => eraText(t.era)))];
    const input = {
      workTitle: work.title,
      eraLabel: eras.length === 1 ? eras[0] : `회차마다 다름 — ${eras.join(' / ')}`,
      checkedAt,
      chapters: targets.map((t) => ({ label: t.label, text: t.text, findings: items.filter((f) => f.chapterId === t.id) })),
      entries,
      glossary,
    };
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const base = `고증리포트-${work.title.replace(/[\\/:*?"<>|\s]+/g, '_')}-${stamp}`;
    if (kind === 'md') downloadText(`${base}.md`, buildReportMarkdown(input), 'text/markdown');
    else downloadText(`${base}.html`, buildReportHtml(input), 'text/html');
    toast(kind === 'md' ? 'Markdown 리포트를 저장했어요' : '인쇄용 HTML을 저장했어요. 브라우저로 열어 인쇄 → PDF로 저장하세요.');
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3 text-sm">
          <fieldset className="flex items-center gap-3">
            <legend className="sr-only">검사 대상</legend>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={mode === 'chapters'} disabled={!chapters.length} onChange={() => setMode('chapters')} /> 회차
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={mode === 'paste'} onChange={() => setMode('paste')} /> 붙여넣기
            </label>
          </fieldset>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={lintEra} onChange={(e) => setLintOptions({ lintEra: e.target.checked })} /> 시대 판정
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={lintGlossary} onChange={(e) => setLintOptions({ lintGlossary: e.target.checked })} /> SF 용어집
          </label>
          <span className="flex-1" />
          <span className="flex items-center gap-2 text-xs text-stone-600" data-testid="lint-counts">
            <Dot c="red" /> {counts.red} <Dot c="yellow" /> {counts.yellow} <Dot c="blue" /> {counts.blue}
          </span>
          <Button size="sm" onClick={() => report('md')} disabled={!targets.length}>
            리포트 Markdown
          </Button>
          <Button size="sm" onClick={() => report('html')} disabled={!targets.length}>
            인쇄용 HTML
          </Button>
        </div>
        {mode === 'chapters' ? (
          <div className="mt-3">
            <div className="mb-1 flex items-center gap-3 text-xs text-stone-500">
              <span>검사할 회차 (현재 버전)</span>
              <button type="button" className="underline" onClick={() => setChecked(chapters.map((c) => c.id))}>
                모두
              </button>
              <button type="button" className="underline" onClick={() => setChecked([])}>
                비우기
              </button>
            </div>
            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-auto" aria-label="검사할 회차">
              {chapters.map((c) => (
                <label key={c.id} className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${checked.includes(c.id) ? 'border-teal-600 bg-teal-50' : 'border-stone-300 bg-white'}`}>
                  <input
                    type="checkbox"
                    checked={checked.includes(c.id)}
                    onChange={(e) => {
                      setChecked((xs) => (e.target.checked ? [...xs, c.id] : xs.filter((x) => x !== c.id)));
                      if (e.target.checked) setViewId(c.id);
                    }}
                  />
                  {chapterLabel(c)}
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_260px]">
            <TextArea aria-label="검사할 글" rows={4} className="manuscript" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="검사할 글을 붙여넣으세요. 붙여넣기 검사는 처리 기록을 남기지 않아요." />
            <Select aria-label="붙여넣기 검사 시대" value={pasteEra} onChange={(e) => setPasteEra(e.target.value)}>
              <option value="work">작품 시대: {eraText(work.setting)}</option>
              {presets.map((p, k) => (
                <option key={k} value={k}>
                  프리셋: {eraText(p)}
                </option>
              ))}
            </Select>
          </div>
        )}
      </Card>

      {!targets.length ? (
        <Empty title="검사할 회차를 고르세요" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="min-w-0 space-y-3">
            {mode === 'chapters' && targets.length > 1 && (
              <div className="flex flex-wrap gap-1" role="tablist" aria-label="보는 회차">
                {targets.map((t) => (
                  <button key={t.id} type="button" role="tab" aria-selected={t.id === viewTarget.id} onClick={() => setViewId(t.id)} className={`rounded-md border px-2 py-1 text-xs ${t.id === viewTarget.id ? 'border-teal-600 bg-teal-50' : 'border-stone-300 bg-white'}`}>
                    {t.label} ({items.filter((f) => f.chapterId === t.id).length})
                  </button>
                ))}
              </div>
            )}
            {mode === 'chapters' && (
              <ChapterEra work={work} chapter={chapters.find((c) => c.id === viewTarget.id)!} presets={presets} onEditWork={() => setView('work')} />
            )}
            {!viewTarget.era && lintEra && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">시대 설정이 없어서 시대 판정을 하지 않았어요. 작품 정보나 위 회차 시대에서 정하세요.</p>
            )}
            <Card title={viewTarget.label}>
              <Highlighted refEl={textRef} text={viewTarget.text} items={viewItems} activeKey={active} onPick={open} />
            </Card>
          </div>
          <div className="min-w-0 space-y-3">
            {activeItem && (
              <FindingCard
                chapter={mode === 'chapters' ? chapters.find((c) => c.id === activeItem.chapterId) : undefined}
                f={activeItem}
                entry={activeItem.source === 'era' ? entryById.get(activeItem.entryId) : undefined}
                term={activeItem.source === 'glossary' ? glossary.find((g) => g.id === activeItem.entryId) : undefined}
                work={work}
                canResolve={mode === 'chapters'}
              />
            )}
            <Card title={`지적 ${visible.length}개`}>
              <div className="mb-2 grid grid-cols-2 gap-1.5">
                <Select aria-label="색 필터" className="!py-1 text-xs" value={filters.color} onChange={(e) => setFilters({ ...filters, color: e.target.value as '' | FindingColor })}>
                  <option value="">색 전체</option>
                  <option value="red">빨강 — 없던 것·금지어</option>
                  <option value="yellow">노랑 — 경계·현대 뜻·표기</option>
                  <option value="blue">파랑 — 뜻 확인</option>
                </Select>
                <Select aria-label="종류 필터" className="!py-1 text-xs" value={filters.kind} onChange={(e) => setFilters({ ...filters, kind: e.target.value as KindFilter })}>
                  <option value="">종류 전체</option>
                  <option value="not_yet">없던 것</option>
                  <option value="meaning_shift">뜻 변화</option>
                  <option value="glossary">SF 용어집</option>
                </Select>
                {mode === 'chapters' && (
                  <Select aria-label="회차 필터" className="!py-1 text-xs" value={filters.chapter} onChange={(e) => setFilters({ ...filters, chapter: e.target.value })}>
                    <option value="">회차 전체</option>
                    {targets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                )}
                <Select aria-label="처리 상태 필터" className="!py-1 text-xs" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                  <option value="">처리 상태 전체</option>
                  <option>미처리</option>
                  <option>의도함</option>
                  <option>무시</option>
                </Select>
              </div>
              <ul className="max-h-[60vh] space-y-1 overflow-auto" data-testid="finding-list">
                {visible.map((f) => (
                  <li key={f.key}>
                    <button type="button" onClick={() => open(f)} className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${f.key === active ? 'bg-teal-50 ring-1 ring-teal-600' : 'hover:bg-stone-100'} ${f.status !== '미처리' ? 'opacity-60' : ''}`}>
                      <div className="flex items-center gap-1.5">
                        <Dot c={f.color} />
                        <b>{f.text}</b>
                        <span className="text-xs text-stone-600">{f.reason}</span>
                        <span className="flex-1" />
                        {f.disputed && <Badge tone="amber">이설 있음</Badge>}
                        {f.unverified && <Badge>미검증</Badge>}
                        {f.status !== '미처리' && <Badge tone="teal">{f.status}</Badge>}
                      </div>
                      <div className="truncate text-xs text-stone-500">
                        {mode === 'chapters' && targets.length > 1 ? `${targets.find((t) => t.id === f.chapterId)?.label} · ` : ''}…{f.context}…
                      </div>
                    </button>
                  </li>
                ))}
                {!visible.length && <li className="px-2 py-3 text-sm text-stone-500">지적이 없어요.</li>}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

const Dot = ({ c }: { c: FindingColor }) => <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${COLOR[c].dot}`} title={COLOR[c].label} aria-label={COLOR[c].label} />;

function Highlighted({ refEl, text, items, activeKey, onPick }: { refEl: React.RefObject<HTMLDivElement | null>; text: string; items: Item[]; activeKey: string | null; onPick: (f: Item) => void }) {
  const spans = highlightSpans(items);
  const active = items.find((f) => f.key === activeKey);
  const parts: React.ReactNode[] = [];
  let pos = 0;
  spans.forEach((f, k) => {
    if (f.start > pos) parts.push(<span key={`t${k}`}>{text.slice(pos, f.start)}</span>);
    const isActive = !!active && active.start < f.end && f.start < active.end;
    parts.push(
      <mark
        key={f.key}
        data-start={f.start}
        data-end={f.end}
        data-active={isActive ? 'true' : undefined}
        onClick={() => onPick(f)}
        className={`cursor-pointer rounded-sm px-px ${COLOR[f.color].mark} ${f.status !== '미처리' ? 'opacity-50' : ''} ${isActive ? 'outline-2 outline-offset-1 outline-teal-700' : ''}`}
        title={`${f.reason}${f.status !== '미처리' ? ` · ${f.status}` : ''}`}
      >
        {text.slice(f.start, f.end)}
      </mark>,
    );
    pos = f.end;
  });
  parts.push(<span key="end">{text.slice(pos)}</span>);
  return (
    <div ref={refEl} className="manuscript max-h-[65vh] overflow-auto whitespace-pre-wrap text-stone-800" data-testid="lint-text">
      {text ? parts : <span className="text-stone-400">원고가 비어 있어요.</span>}
    </div>
  );
}

function FindingCard({ f, entry, term, work, canResolve, chapter }: { f: Item; entry?: LintEntry; term?: GlossaryEntry; work: Work; canResolve: boolean; chapter?: Chapter }) {
  const jump = useUI((s) => s.jumpToChapterText);
  const resolve = async (status: '의도함' | '무시', scope: LintResolution['scope']) => {
    // 같은 자리·범위의 예전 기록은 바꾼다
    const old = await db.lintResolutions.where('workId').equals(work.id).filter((r) => r.ruleKey === f.ruleKey && r.scope === scope && (scope === 'work' || r.chapterId === f.chapterId) && (scope !== 'position' || r.context === f.context)).toArray();
    await Promise.all(old.map((r) => deleteResolution(r.id)));
    await saveResolution({ workId: work.id, ruleKey: f.ruleKey, status, scope, ...(scope !== 'work' ? { chapterId: f.chapterId } : {}), ...(scope === 'position' ? { context: f.context } : {}) });
  };
  return (
    <Card title={`${entry ? entry.term : term ? `용어 · ${term.canonical}` : f.form} — ${f.reason}`} actions={<Badge tone={f.status === '미처리' ? 'stone' : 'teal'}>{f.status}{f.resolution ? ` · ${{ position: '이 위치', chapter: '이 회차', work: '작품 전체' }[f.resolution.scope]}` : ''}</Badge>}>
      <div className="space-y-2 text-sm" data-testid="finding-card">
        <p className="manuscript rounded bg-stone-50 px-2 py-1 text-stone-700">…{f.context}…</p>
        {entry && (
          <dl className="grid grid-cols-[72px_1fr] gap-y-1 text-[13px]">
            <dt className="text-stone-500">시기</dt>
            <dd>{entry.kind === 'not_yet' ? formatAppears(entry.appears) : `통하던 뜻: ${f.sense ?? '—'}`}</dd>
            {entry.kind === 'meaning_shift' && (
              <>
                <dt className="text-stone-500">뜻</dt>
                <dd>{(entry.senses ?? []).map((s) => s.label).join(' / ')}</dd>
              </>
            )}
            {f.contextWord && (
              <>
                <dt className="text-stone-500">문맥어</dt>
                <dd>앞뒤 30자 안에 ‘{f.contextWord}’ — 현대 뜻으로 쓴 듯해요</dd>
              </>
            )}
            <dt className="text-stone-500">근거</dt>
            <dd>{formatSources(entry) || '—'}</dd>
            <dt className="text-stone-500">이설</dt>
            <dd>{entry.disputed ? entry.disputeNote || '이설 있음' : '없음'}</dd>
            <dt className="text-stone-500">검증</dt>
            <dd>{entry.verified ? '검증됨 (원문 확인)' : '미검증 — 출처 원문을 확인하기 전까지 참고만'}</dd>
          </dl>
        )}
        {term && (
          <p className="text-[13px]">
            {term.status === '금지' ? `이 세계에 없는 말이에요.${term.replacement ? ` 대체어: ${term.replacement}` : ''}` : `정식 표기는 ‘${term.canonical}’예요.`}
            {term.note && <span className="block text-stone-500">{term.note}</span>}
          </p>
        )}
        {chapter && (
          <Button size="sm" variant="secondary" onClick={() => jump({ chapterId: chapter.id, versionId: activeVersion(chapter).id, start: f.start, end: f.end, label: `고증 지적 ‘${f.text}’ (${chapterLabel(chapter)})` })}>
            회차 원고에서 고치기 →
          </Button>
        )}
        {canResolve ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <Button size="sm" onClick={() => resolve('의도함', 'position')}>
              의도함
            </Button>
            <span className="text-xs text-stone-500">무시:</span>
            <Button size="sm" variant="ghost" onClick={() => resolve('무시', 'position')}>
              이 위치만
            </Button>
            <Button size="sm" variant="ghost" onClick={() => resolve('무시', 'chapter')}>
              이 회차
            </Button>
            <Button size="sm" variant="ghost" onClick={() => resolve('무시', 'work')}>
              이 작품 전체
            </Button>
            {f.resolution && (
              <Button size="sm" variant="ghost" onClick={() => deleteResolution(f.resolution!.id)}>
                처리 취소
              </Button>
            )}
          </div>
        ) : (
          <p className="text-xs text-stone-500">붙여넣기 검사는 처리 기록을 남기지 않아요. 회차로 검사하세요.</p>
        )}
      </div>
    </Card>
  );
}

/** 이 회차의 시대: 작품 기본값을 쓰거나 회차만 따로 정한다 */
function ChapterEra({ work, chapter, presets, onEditWork }: { work: Work; chapter: Chapter; presets: WorkSetting[]; onEditWork: () => void }) {
  const own = chapter.setting;
  const [d, setD] = useState({ label: own?.label ?? '', from: String(own?.yearFrom ?? work.setting?.yearFrom ?? ''), to: String(own?.yearTo ?? work.setting?.yearTo ?? ''), region: own?.region ?? work.setting?.region ?? '한반도' });
  useEffect(() => {
    setD({ label: own?.label ?? '', from: String(own?.yearFrom ?? work.setting?.yearFrom ?? ''), to: String(own?.yearTo ?? work.setting?.yearTo ?? ''), region: own?.region ?? work.setting?.region ?? '한반도' });
  }, [chapter.id, own, work.setting]);
  const save = (s: WorkSetting | undefined) => updateChapter(chapter.id, (c) => ({ ...c, setting: s }));
  const ok = /^-?\d+$/.test(d.from.trim()) && /^-?\d+$/.test(d.to.trim()) && Number(d.from) <= Number(d.to);

  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm" data-testid="chapter-era">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-stone-500">이 회차 시대:</span>
        <b>{eraText(own ?? work.setting)}</b>
        <span className="text-xs text-stone-500">{own ? '(이 회차만 따로 정함)' : '(작품 기본값)'}</span>
        <span className="flex-1" />
        {own ? (
          <Button size="sm" variant="ghost" onClick={() => save(undefined)}>
            작품 기본값으로
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={onEditWork}>
            작품 시대 고치기
          </Button>
        )}
      </div>
      <details className="mt-1">
        <summary className="cursor-pointer text-xs text-stone-500">이 회차만 다른 시대로</summary>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Select aria-label="프리셋" className="!w-auto !py-1 text-xs" value="" onChange={(e) => e.target.value !== '' && save(presets[Number(e.target.value)])}>
            <option value="">프리셋 적용…</option>
            {presets.map((p, k) => (
              <option key={k} value={k}>
                {eraText(p)}
              </option>
            ))}
          </Select>
          <Input aria-label="회차 시대 이름" className="!w-28 !py-1" placeholder="이름" value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} />
          <Input aria-label="회차 시작 연도" className="!w-20 !py-1" value={d.from} onChange={(e) => setD({ ...d, from: e.target.value })} />
          ~
          <Input aria-label="회차 끝 연도" className="!w-20 !py-1" value={d.to} onChange={(e) => setD({ ...d, to: e.target.value })} />
          <Input aria-label="회차 지역" className="!w-24 !py-1" value={d.region} onChange={(e) => setD({ ...d, region: e.target.value })} />
          <Button size="sm" disabled={!ok} onClick={() => save({ label: d.label.trim(), yearFrom: Number(d.from), yearTo: Number(d.to), region: d.region.trim() })}>
            이 회차에 적용
          </Button>
        </div>
      </details>
    </div>
  );
}
