// 회차 리듬: 버전 하나의 리듬 지표와 엔딩 태그
import { useMemo, useRef } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { estimateEnding, type RhythmMetrics } from '../../core/rhythm';
import { updateChapter } from '../../db/repo';
import type { Chapter, EndingTag } from '../../db/types';
import { Badge, Button, Card, Select } from '../../shared/ui';
import { C, ChartBox, LegendDot, TooltipBox, axisProps } from './charts';
import { activeVersion, chapterLabel, num, pct, rhythmOf, type SerialSettings } from './useSerial';

export function ChapterVersionPicker({
  chapters,
  chapterId,
  versionId,
  onChange,
  label = '회차',
}: {
  chapters: Chapter[];
  chapterId?: string;
  versionId?: string;
  onChange: (chapterId: string, versionId: string) => void;
  label?: string;
}) {
  const ch = chapters.find((c) => c.id === chapterId) ?? chapters[0];
  const vId = ch?.versions.some((v) => v.id === versionId) ? versionId : ch && activeVersion(ch).id;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select aria-label={`${label} 선택`} className="!w-56" value={ch?.id ?? ''} onChange={(e) => {
        const next = chapters.find((c) => c.id === e.target.value)!;
        onChange(next.id, activeVersion(next).id);
      }}>
        {chapters.map((c) => (
          <option key={c.id} value={c.id}>
            {chapterLabel(c)}
          </option>
        ))}
      </Select>
      <Select aria-label={`${label} 버전 선택`} className="!w-40" value={vId ?? ''} onChange={(e) => ch && onChange(ch.id, e.target.value)}>
        {ch?.versions.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
            {v.id === ch.activeVersionId ? ' (현재)' : ''}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function RhythmTab({
  chapters,
  chapterId,
  versionId,
  onPick,
  settings,
}: {
  chapters: Chapter[];
  chapterId?: string;
  versionId?: string;
  onPick: (chapterId: string, versionId: string) => void;
  settings: SerialSettings;
}) {
  const ch = chapters.find((c) => c.id === chapterId) ?? chapters[0];
  const version = ch?.versions.find((v) => v.id === versionId) ?? (ch && activeVersion(ch));
  const m = useMemo(
    () => (version ? rhythmOf(version.id, version.text, settings.rhythmOptions) : undefined),
    [version, settings.rhythmOptions],
  );
  if (!ch || !version || !m) return null;
  const th = settings.thresholds;

  return (
    <div className="space-y-4">
      <ChapterVersionPicker chapters={chapters} chapterId={ch.id} versionId={version.id} onChange={onPick} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="rhythm-summary">
        <Stat label="글자 수 (공백 포함)" value={num(m.chars.withSpaces)} sub={`공백 제외 ${num(m.chars.withoutSpaces)}`} />
        <Stat label="문장" value={`${num(m.sentenceStats.count)}개`} sub={`평균 ${num(m.sentenceStats.mean)}자 · 중앙값 ${num(m.sentenceStats.median)}자`} />
        <Stat label="대사 비율 (글자)" value={pct(m.dialogue.charRatio)} sub={`문장 기준 ${pct(m.dialogue.sentenceRatio)}`} />
        <Stat
          label="문단"
          value={`${num(m.paragraphs.count)}개`}
          sub={m.paragraphs.walls.length ? `벽 문단 ${m.paragraphs.walls.length}개 (${th.wallParagraph}자 초과)` : '벽 문단 없음'}
          warn={m.paragraphs.walls.length > 0}
        />
      </div>

      <Waveform m={m} window={th.movingAverageWindow} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="문장 길이 통계">
          <table className="w-full text-sm">
            <tbody>
              <Row label="평균" value={`${num(m.sentenceStats.mean)}자`} />
              <Row label="중앙값" value={`${num(m.sentenceStats.median)}자`} />
              <Row label="표준편차" value={`${num(m.sentenceStats.stdev)}자`} />
              <Row label={`짧은 문장 (${th.shortSentence}자 이하)`} value={pct(m.sentenceStats.shortRatio)} />
              <Row label={`긴 문장 (${th.longSentence}자 이상)`} value={pct(m.sentenceStats.longRatio)} />
            </tbody>
          </table>
          <p className="mt-2 text-xs text-stone-500">문장 길이는 공백을 뺀 글자 수예요. 기준값은 설정 · 백업에서 바꿀 수 있어요.</p>
        </Card>
        <Card title="대사 비율 · 문장부호">
          <RatioBar label="글자 기준" value={m.dialogue.charRatio} />
          <RatioBar label="문장 기준" value={m.dialogue.sentenceRatio} />
          <table className="mt-3 w-full text-sm">
            <tbody>
              <Row label="! 로 끝나는 문장" value={pct(m.punctuation.exclaimRatio)} />
              <Row label="? 로 끝나는 문장" value={pct(m.punctuation.questionRatio)} />
              <Row label="… 로 끝나는 문장" value={pct(m.punctuation.ellipsisRatio)} />
            </tbody>
          </table>
        </Card>
      </div>

      <ParagraphSection text={version.text} m={m} wall={th.wallParagraph} />

      <EndingPanel chapter={ch} settings={settings} />
    </div>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className={`mt-0.5 text-xs ${warn ? 'text-orange-700' : 'text-stone-500'}`}>{warn ? '⚠ ' : ''}{sub}</div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-stone-100 last:border-0">
      <td className="py-1.5 text-stone-600">{label}</td>
      <td className="py-1.5 text-right font-medium tabular-nums">{value}</td>
    </tr>
  );
}

function RatioBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="mb-2">
      <div className="mb-1 flex justify-between text-xs text-stone-600">
        <span>{label}</span>
        <span className="tabular-nums">
          대사 {pct(value)} · 서술 {pct(1 - value)}
        </span>
      </div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-sm" role="img" aria-label={`${label} 대사 ${pct(value)}`}>
        <div style={{ width: `${value * 100}%`, background: C.s2 }} className="rounded-l-sm" />
        <div style={{ width: `${(1 - value) * 100}%`, background: C.s1 }} className="rounded-r-sm" />
      </div>
    </div>
  );
}

type WavePoint = { i: number; len: number; avg: number; dialogue: boolean; text: string };

export function Waveform({ m, window }: { m: RhythmMetrics; window: number }) {
  const data: WavePoint[] = m.sentences.map((s, k) => ({
    i: k + 1,
    len: s.length,
    avg: Math.round(m.wave.movingAverage[k] * 10) / 10,
    dialogue: s.isDialogue,
    text: s.text,
  }));
  return (
    <ChartBox
      title="문장 길이 파형"
      legend={
        <>
          <LegendDot color={C.s1}>서술 문장</LegendDot>
          <LegendDot color={C.s2}>대사 문장</LegendDot>
          <LegendDot color="#57534e" shape="line">
            {window}문장 이동 평균
          </LegendDot>
        </>
      }
      note="x = 문장 순서, y = 공백 제외 글자 수. 점에 마우스를 올리면 문장이 보여요."
    >
      <div className="h-64" data-testid="waveform">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="i" type="number" domain={[1, Math.max(1, data.length)]} {...axisProps} allowDecimals={false} />
            <YAxis {...axisProps} allowDecimals={false} />
            <Tooltip
              cursor={{ stroke: C.grid }}
              content={({ active, payload }) => {
                const p = active && (payload?.[0]?.payload as WavePoint | undefined);
                if (!p) return null;
                return (
                  <TooltipBox>
                    <div className="font-medium">
                      {p.i}번째 문장 · {p.len}자 · {p.dialogue ? '대사' : '서술'}
                    </div>
                    <div className="mt-1 text-stone-500">이동 평균 {p.avg}자</div>
                    <div className="mt-1 line-clamp-3">{p.text}</div>
                  </TooltipBox>
                );
              }}
            />
            <Line
              dataKey="len"
              stroke="none"
              isAnimationActive={false}
              dot={(props: { cx?: number; cy?: number; index?: number; payload?: WavePoint }) => (
                <circle
                  key={`d${props.index}`}
                  cx={props.cx}
                  cy={props.cy}
                  r={3.5}
                  fill={props.payload?.dialogue ? C.s2 : C.s1}
                  stroke="#fff"
                  strokeWidth={1}
                />
              )}
              activeDot={{ r: 6 }}
            />
            <Line dataKey="avg" stroke="#57534e" strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartBox>
  );
}

function ParagraphSection({ text, m, wall }: { text: string; m: RhythmMetrics; wall: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const pieces = useMemo(() => {
    const out: { text: string; wallIndex?: number }[] = [];
    let pos = 0;
    m.paragraphs.walls.forEach((w, k) => {
      if (w.start > pos) out.push({ text: text.slice(pos, w.start) });
      out.push({ text: text.slice(w.start, w.end), wallIndex: k });
      pos = w.end;
    });
    out.push({ text: text.slice(pos) });
    return out;
  }, [text, m.paragraphs.walls]);

  const jump = (k: number) => ref.current?.querySelector(`[data-wall="${k}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <ChartBox
        title="문단 길이 분포"
        legend={
          <>
            <LegendDot color={C.s1} shape="square">문단 수</LegendDot>
            <LegendDot color={C.warn} shape="square">⚠ 벽 문단 ({wall}자 초과)</LegendDot>
          </>
        }
        note="문단 길이는 공백을 뺀 글자 수예요."
      >
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={m.paragraphs.histogram} margin={{ top: 8, right: 8, bottom: 4, left: -20 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: '#f5f5f4' }}
                content={({ active, payload }) => {
                  const b = active && (payload?.[0]?.payload as { label: string; count: number; to: number | null } | undefined);
                  if (!b) return null;
                  return (
                    <TooltipBox>
                      {b.label}자 문단 {b.count}개{b.to === null ? ' — 벽 문단' : ''}
                    </TooltipBox>
                  );
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {m.paragraphs.histogram.map((b, k) => (
                  <Cell key={k} fill={b.to === null ? C.warn : C.s1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartBox>
      <Card
        title="원고 (벽 문단 표시)"
        actions={
          m.paragraphs.walls.length > 0 && (
            <span className="flex flex-wrap gap-1">
              {m.paragraphs.walls.map((w, k) => (
                <Button key={k} size="sm" variant="ghost" onClick={() => jump(k)}>
                  ⚠ {w.length}자
                </Button>
              ))}
            </span>
          )
        }
      >
        <div ref={ref} className="manuscript max-h-80 overflow-auto whitespace-pre-wrap text-stone-700" data-testid="manuscript-view">
          {pieces.map((p, k) =>
            p.wallIndex === undefined ? (
              <span key={k}>{p.text}</span>
            ) : (
              <mark key={k} data-wall={p.wallIndex} className="rounded-sm bg-orange-100 text-stone-900 ring-1 ring-orange-300" title={`벽 문단: ${m.paragraphs.walls[p.wallIndex].length}자`}>
                {p.text}
              </mark>
            ),
          )}
        </div>
      </Card>
    </div>
  );
}

const TAGS: EndingTag[] = ['절단', '여운', '정리'];

function EndingPanel({ chapter, settings }: { chapter: Chapter; settings: SerialSettings }) {
  const text = activeVersion(chapter).text;
  const est = useMemo(() => estimateEnding(text, settings.rhythmOptions), [text, settings.rhythmOptions]);
  const setTag = (tag: EndingTag | undefined, source: 'auto' | 'user') =>
    updateChapter(chapter.id, (c) => ({ ...c, endingTag: tag, endingTagSource: tag ? source : undefined }));

  return (
    <Card
      title="마지막 문단 유형 (엔딩 태그)"
      actions={
        chapter.endingTag ? (
          <Badge tone="teal">
            정한 태그: {chapter.endingTag}
            {chapter.endingTagSource === 'auto' ? ' (추정 그대로)' : ''}
          </Badge>
        ) : (
          <Badge>아직 안 정함</Badge>
        )
      }
    >
      <div data-testid="ending-panel">
        {est ? (
          <div className="space-y-3 text-sm">
            <p>
              자동 추정: <b>{est.tag}</b> <span className="text-xs text-stone-500">(참고용 — 최종 태그는 직접 고르세요. 현재 버전 기준)</span>
            </p>
            <ul className="list-disc space-y-0.5 pl-5 text-stone-600">
              {est.reasons.map((r, k) => (
                <li key={k}>{r}</li>
              ))}
            </ul>
            <blockquote className="manuscript border-l-2 border-stone-300 pl-3 text-stone-600">
              <span className="text-xs text-stone-400">마지막 문장 · </span>
              {est.lastSentence.text}
            </blockquote>
          </div>
        ) : (
          <p className="text-sm text-stone-500">원고가 비어 있어요.</p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {TAGS.map((t) => (
            <Button key={t} size="sm" variant={chapter.endingTag === t ? 'primary' : 'secondary'} onClick={() => setTag(t, 'user')}>
              {t}
            </Button>
          ))}
          {est && (
            <Button size="sm" variant="ghost" onClick={() => setTag(est.tag, 'auto')}>
              추정대로 정하기
            </Button>
          )}
          {chapter.endingTag && (
            <Button size="sm" variant="ghost" onClick={() => setTag(undefined, 'user')}>
              태그 지우기
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
