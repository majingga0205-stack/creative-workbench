// 고증 DB 편집기 (SPEC 모듈 A): 목록(검색·필터)과 편집 폼, 출처 필수, 검증 체크, 예문 테스트 칸
import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { deleteLintEntry, newId, saveLintEntry } from '../../db/repo';
import { LINT_CATEGORIES, LINT_SOURCE_TYPES, type LintCategory, type LintEntry, type LintSource } from '../../db/types';
import { findTerm } from '../../core/korean';
import { formatAppears, validateLintEntry } from '../../core/lint';
import { confirmDialog, toast } from '../../shared/dialogs';
import { useAutosave } from '../../shared/useAutosave';
import { useTextRules } from '../../shared/useTextRules';
import { Badge, Button, Card, Empty, Field, Input, SaveStatus, Select, TextArea, parseList } from '../../shared/ui';

const REGIONS = ['한반도', '중국', '일본', '서양', '전체'];

export function EntryEditor() {
  const entries = useLiveQuery(async () => (await db.lintEntries.toArray()).sort((a, b) => a.term.localeCompare(b.term, 'ko')), []);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<'' | LintCategory>('');
  const [kind, setKind] = useState<'' | LintEntry['kind']>('');
  const [ver, setVer] = useState<'' | 'yes' | 'no'>('');
  const [selected, setSelected] = useState<string | null>(null);
  const [draftNew, setDraftNew] = useState<LintEntry | null>(null);

  const list = useMemo(
    () =>
      (entries ?? []).filter(
        (e) =>
          (!q.trim() || [e.term, ...e.aliases].some((t) => t.includes(q.trim()))) &&
          (!cat || e.category === cat) &&
          (!kind || e.kind === kind) &&
          (!ver || (ver === 'yes') === e.verified),
      ),
    [entries, q, cat, kind, ver],
  );
  if (!entries) return null;
  const current = draftNew ?? entries.find((e) => e.id === selected) ?? null;

  const startNew = () => {
    setSelected(null);
    setDraftNew({
      id: newId(),
      term: '',
      aliases: [],
      matchMode: 'word',
      exclude: [],
      category: '물건',
      kind: 'not_yet',
      region: '한반도',
      appears: { from: 1800, to: 1800, precision: '연도' },
      sources: [{ title: '', type: '1차 사료' }],
      disputed: false,
      verified: false,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="space-y-2">
        <div className="flex gap-1.5">
          <Input aria-label="고증 항목 검색" placeholder="검색 (표제어·별칭)" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button variant="primary" onClick={startNew}>
            새 항목
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <Select aria-label="분류 필터" className="!py-1 text-xs" value={cat} onChange={(e) => setCat(e.target.value as LintCategory | '')}>
            <option value="">분류 전체</option>
            {LINT_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Select aria-label="종류 필터" className="!py-1 text-xs" value={kind} onChange={(e) => setKind(e.target.value as LintEntry['kind'] | '')}>
            <option value="">종류 전체</option>
            <option value="not_yet">없던 것</option>
            <option value="meaning_shift">뜻 변화</option>
          </Select>
          <Select aria-label="검증 필터" className="!py-1 text-xs" value={ver} onChange={(e) => setVer(e.target.value as '' | 'yes' | 'no')}>
            <option value="">검증 전체</option>
            <option value="yes">검증됨</option>
            <option value="no">미검증</option>
          </Select>
        </div>
        <ul className="space-y-1" aria-label="고증 항목 목록">
          {list.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => {
                  setDraftNew(null);
                  setSelected(e.id);
                }}
                className={`w-full rounded-md px-3 py-2 text-left text-sm ${current?.id === e.id ? 'bg-white shadow-sm ring-1 ring-stone-200' : 'hover:bg-stone-200/60'}`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">{e.term}</span>
                  <span className="text-xs text-stone-500">{e.category}</span>
                  <span className="flex-1" />
                  {e.disputed && <Badge tone="amber">이설</Badge>}
                  {e.verified ? <Badge tone="teal">검증됨</Badge> : <Badge>미검증</Badge>}
                </div>
                <div className="text-xs text-stone-500">
                  {e.kind === 'not_yet' ? `없던 것 · ${formatAppears(e.appears)}` : `뜻 변화 · 뜻 ${e.senses?.length ?? 0}개`} · {e.region}
                </div>
              </button>
            </li>
          ))}
          {!list.length && <li className="px-3 py-2 text-sm text-stone-500">맞는 항목이 없어요.</li>}
        </ul>
      </div>
      <div className="min-w-0">
        {current ? (
          <EntryForm
            key={current.id}
            entry={current}
            isNew={!!draftNew}
            onSaved={() => {
              if (draftNew) {
                setSelected(draftNew.id);
                setDraftNew(null);
              }
            }}
            onDeleted={() => {
              setSelected(null);
              setDraftNew(null);
            }}
          />
        ) : (
          <Empty title="항목을 고르거나 새로 만드세요">
            시드 5개는 통설을 적은 예시라 전부 ‘미검증’이에요. 출처 원문을 직접 확인한 뒤 ‘원문에서 직접 확인함’에 체크하세요.
          </Empty>
        )}
      </div>
    </div>
  );
}

type Draft = Omit<LintEntry, 'aliases' | 'exclude' | 'appears' | 'senses'> & {
  aliases: string;
  exclude: string;
  appears: { from: string; to: string; precision: '연도' | '시기' | '세기' };
  senses: { label: string; from: string; to: string; contextWords: string }[];
};

const toDraft = (e: LintEntry): Draft => ({
  ...e,
  aliases: e.aliases.join(', '),
  exclude: e.exclude.join(', '),
  appears: { from: String(e.appears?.from ?? ''), to: String(e.appears?.to ?? ''), precision: e.appears?.precision ?? '연도' },
  senses: (e.senses ?? []).map((s) => ({ label: s.label, from: s.from === undefined ? '' : String(s.from), to: s.to === undefined ? '' : String(s.to), contextWords: s.contextWords.join(', ') })),
});

const optNum = (s: string) => (s.trim() === '' ? undefined : Number(s));

function fromDraft(d: Draft): LintEntry {
  const e: LintEntry = {
    ...d,
    term: d.term.trim(),
    aliases: parseList(d.aliases),
    exclude: parseList(d.exclude),
    region: d.region.trim(),
    // 제목·종류는 늘 남기고, 비어 있는 선택 칸(저자·연도·위치·주소)만 뺀다
    sources: d.sources.map((s) => ({ ...(Object.fromEntries(Object.entries(s).filter(([, v]) => v !== '' && v !== undefined)) as Partial<LintSource>), title: s.title ?? '', type: s.type })),
    appears: undefined,
    senses: undefined,
  };
  if (d.kind === 'not_yet') e.appears = { from: Number(d.appears.from), to: Number(d.appears.to), precision: d.appears.precision };
  else e.senses = d.senses.map((s) => ({ label: s.label.trim(), from: optNum(s.from), to: optNum(s.to), contextWords: parseList(s.contextWords) }));
  if (!e.disputed) delete e.disputeNote;
  return e;
}

function EntryForm({ entry, isNew, onSaved, onDeleted }: { entry: LintEntry; isNew: boolean; onSaved: () => void; onDeleted: () => void }) {
  const [d, setD] = useState<Draft>(() => toDraft(entry));
  const value = fromDraft(d);
  const errors = validateLintEntry(value);
  // 지우거나 만들기를 취소한 뒤 남은 자동 저장이 항목을 되살리지 않도록
  const gone = useRef(false);
  const { status } = useAutosave(value, async (v: LintEntry) => {
    if (gone.current) return;
    await saveLintEntry(v);
    onSaved();
  }, { valid: errors.length === 0 });
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  // SPEC: 출처를 고치면 '검증됨'이 다시 꺼진다
  const setSources = (sources: LintSource[]) => setD((x) => ({ ...x, sources, verified: false }));

  const remove = async () => {
    if (isNew) {
      gone.current = true;
      return onDeleted();
    }
    if (await confirmDialog({ title: `고증 항목 ‘${entry.term}’ 지우기`, message: '모든 작품의 검사에서 빠져요. 되돌릴 수 없어요.', confirmLabel: '지우기', danger: true })) {
      gone.current = true;
      await deleteLintEntry(entry.id);
      toast(`고증 항목을 지웠어요: ${entry.term}`);
      onDeleted();
    }
  };

  return (
    <Card title={isNew ? '새 고증 항목' : `고증 항목 · ${entry.term}`} actions={<SaveStatus status={status} />}>
      <div className="space-y-4" data-testid="entry-form">
        {errors.length > 0 && (
          <ul className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900" role="alert">
            {errors.map((e) => (
              <li key={e}>· {e}</li>
            ))}
          </ul>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="표제어">
            <Input value={d.term} onChange={(e) => set('term', e.target.value)} />
          </Field>
          <Field label="별칭" hint="쉼표로 구분">
            <Input value={d.aliases} onChange={(e) => set('aliases', e.target.value)} />
          </Field>
          <Field label="예외" hint="이 말 안의 매칭은 버림 (예: 경제육전)">
            <Input value={d.exclude} onChange={(e) => set('exclude', e.target.value)} />
          </Field>
          <Field label="매칭 모드">
            <Select value={d.matchMode} onChange={(e) => set('matchMode', e.target.value as Draft['matchMode'])}>
              <option value="word">word — 조사만 허용</option>
              <option value="prefix">prefix — 복합어 앞부분도</option>
            </Select>
          </Field>
          <Field label="분류">
            <Select value={d.category} onChange={(e) => set('category', e.target.value as LintCategory)}>
              {LINT_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="지역" hint="설정 지역과 같거나 ‘전체’일 때만 적용">
            <Input list="lint-regions" value={d.region} onChange={(e) => set('region', e.target.value)} />
            <datalist id="lint-regions">
              {REGIONS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </Field>
        </div>

        <fieldset>
          <legend className="mb-1 text-[13px] font-medium text-stone-600">종류</legend>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={d.kind === 'not_yet'} onChange={() => set('kind', 'not_yet')} /> 그 시대에 아직 없던 것
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={d.kind === 'meaning_shift'}
                onChange={() => setD((x) => ({ ...x, kind: 'meaning_shift', senses: x.senses.length ? x.senses : [{ label: '', from: '', to: '', contextWords: '' }, { label: '', from: '', to: '', contextWords: '' }] }))}
              />{' '}
              뜻이 바뀐 말
            </label>
          </div>
        </fieldset>

        {d.kind === 'not_yet' ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="등장 시작 연도">
              <Input inputMode="numeric" value={d.appears.from} onChange={(e) => set('appears', { ...d.appears, from: e.target.value })} />
            </Field>
            <Field label="등장 끝 연도" hint="설정 시대가 이보다 뒤면 표시 안 함">
              <Input inputMode="numeric" value={d.appears.to} onChange={(e) => set('appears', { ...d.appears, to: e.target.value })} />
            </Field>
            <Field label="정밀도">
              <Select value={d.appears.precision} onChange={(e) => set('appears', { ...d.appears, precision: e.target.value as Draft['appears']['precision'] })}>
                <option>연도</option>
                <option>시기</option>
                <option>세기</option>
              </Select>
            </Field>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-[13px] font-medium text-stone-600">뜻 (2개 이상)</div>
            {d.senses.map((s, k) => (
              <div key={k} className="grid gap-2 rounded-md border border-stone-200 p-2 sm:grid-cols-[1fr_80px_80px_1fr_auto]">
                <Input aria-label={`뜻 ${k + 1}`} placeholder="뜻 (예: 조선: 세상을 다스림)" value={s.label} onChange={(e) => set('senses', d.senses.map((x, j) => (j === k ? { ...x, label: e.target.value } : x)))} />
                <Input aria-label={`뜻 ${k + 1} 시작 연도`} placeholder="부터" value={s.from} onChange={(e) => set('senses', d.senses.map((x, j) => (j === k ? { ...x, from: e.target.value } : x)))} />
                <Input aria-label={`뜻 ${k + 1} 끝 연도`} placeholder="까지" value={s.to} onChange={(e) => set('senses', d.senses.map((x, j) => (j === k ? { ...x, to: e.target.value } : x)))} />
                <Input aria-label={`뜻 ${k + 1} 문맥어`} placeholder="문맥어 (쉼표)" value={s.contextWords} onChange={(e) => set('senses', d.senses.map((x, j) => (j === k ? { ...x, contextWords: e.target.value } : x)))} />
                <Button size="sm" variant="ghost" onClick={() => set('senses', d.senses.filter((_, j) => j !== k))}>
                  빼기
                </Button>
              </div>
            ))}
            <Button size="sm" onClick={() => set('senses', [...d.senses, { label: '', from: '', to: '', contextWords: '' }])}>
              + 뜻 추가
            </Button>
            <p className="text-xs text-stone-500">설정 시대에 통하던 뜻이 아닌 다른 뜻의 문맥어가 앞뒤 30자 안에 있으면 ‘현대 뜻으로 쓴 듯함’(노랑)으로 올려요.</p>
          </div>
        )}

        <div className="space-y-2">
          <div className="text-[13px] font-medium text-stone-600">출처 (1개 이상)</div>
          {d.sources.map((s, k) => (
            <div key={k} className="grid gap-2 rounded-md border border-stone-200 p-2 sm:grid-cols-6">
              <Input className="sm:col-span-2" aria-label={`출처 ${k + 1} 제목`} placeholder="제목" value={s.title} onChange={(e) => setSources(d.sources.map((x, j) => (j === k ? { ...x, title: e.target.value } : x)))} />
              <Input aria-label={`출처 ${k + 1} 저자`} placeholder="저자" value={s.author ?? ''} onChange={(e) => setSources(d.sources.map((x, j) => (j === k ? { ...x, author: e.target.value } : x)))} />
              <Input aria-label={`출처 ${k + 1} 연도`} placeholder="연도" value={s.year ?? ''} onChange={(e) => setSources(d.sources.map((x, j) => (j === k ? { ...x, year: e.target.value } : x)))} />
              <Select aria-label={`출처 ${k + 1} 종류`} value={s.type} onChange={(e) => setSources(d.sources.map((x, j) => (j === k ? { ...x, type: e.target.value as LintSource['type'] } : x)))}>
                {LINT_SOURCE_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
              <Button size="sm" variant="ghost" onClick={() => setSources(d.sources.filter((_, j) => j !== k))}>
                빼기
              </Button>
              <Input className="sm:col-span-3" aria-label={`출처 ${k + 1} 위치`} placeholder="위치 (권·쪽·항목)" value={s.locator ?? ''} onChange={(e) => setSources(d.sources.map((x, j) => (j === k ? { ...x, locator: e.target.value } : x)))} />
              <Input className="sm:col-span-3" aria-label={`출처 ${k + 1} 주소`} placeholder="주소 (선택)" value={s.url ?? ''} onChange={(e) => setSources(d.sources.map((x, j) => (j === k ? { ...x, url: e.target.value } : x)))} />
            </div>
          ))}
          <Button size="sm" onClick={() => setSources([...d.sources, { title: '', type: '1차 사료' }])}>
            + 출처 추가
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={d.disputed} onChange={(e) => set('disputed', e.target.checked)} /> 이설 있음
            </label>
            {d.disputed && <TextArea className="mt-2" rows={2} aria-label="이설 메모" placeholder="이설 메모" value={d.disputeNote ?? ''} onChange={(e) => set('disputeNote', e.target.value)} />}
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={d.verified} onChange={(e) => set('verified', e.target.checked)} /> 원문에서 직접 확인함
            </label>
            <p className="mt-1 text-xs text-stone-500">출처를 고치면 다시 꺼져요.</p>
          </div>
        </div>
        <Field label="메모">
          <TextArea rows={2} value={d.note ?? ''} onChange={(e) => set('note', e.target.value)} />
        </Field>

        <SampleTest entry={value} />

        <div className="flex justify-end">
          <Button variant="danger" size="sm" onClick={remove}>
            {isNew ? '만들기 취소' : '항목 지우기'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** 예문 테스트 칸: 문장을 넣으면 이 항목이 어디에 매칭되는지 바로 보여준다 */
function SampleTest({ entry }: { entry: LintEntry }) {
  const [text, setText] = useState('');
  const rules = useTextRules();
  const matches = text && entry.term ? findTerm(text, { term: entry.term, aliases: entry.aliases, mode: entry.matchMode, exclude: entry.exclude }, { josa: rules?.josa }) : [];
  const parts: { t: string; m?: (typeof matches)[number] }[] = [];
  let pos = 0;
  for (const m of matches) {
    parts.push({ t: text.slice(pos, m.start) }, { t: text.slice(m.start, m.end), m });
    pos = m.end;
  }
  parts.push({ t: text.slice(pos) });
  return (
    <div className="rounded-md bg-stone-50 p-3">
      <Field label="예문 테스트" hint="문장을 넣으면 이 항목이 매칭되는지 바로 보여줘요. 오탐을 잡을 때 쓰세요.">
        <Input aria-label="예문" value={text} onChange={(e) => setText(e.target.value)} placeholder="예: 그는 감자를 캐다 말고 감자밭을 보았다" />
      </Field>
      {text && (
        <div className="mt-2 text-sm" data-testid="sample-result">
          <p className="manuscript">
            {parts.map((p, k) =>
              p.m ? (
                <mark key={k} className="rounded-sm bg-teal-100 px-0.5 text-teal-900">
                  {p.t}
                </mark>
              ) : (
                <span key={k}>{p.t}</span>
              ),
            )}
          </p>
          <p className="mt-1 text-xs text-stone-600">
            {matches.length ? `매칭 ${matches.length}곳: ${matches.map((m) => `‘${m.text}’${m.josa ? `(조사 ${m.josa})` : ''}`).join(', ')}` : '매칭 안 됨'}
          </p>
        </div>
      )}
    </div>
  );
}
