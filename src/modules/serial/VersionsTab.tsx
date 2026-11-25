// 버전 비교: 지표 차이 표, 문장 길이 파형 겹쳐 보기, 본문 차이(같은 회차일 때)
import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { compareMetrics, diffSentences, type SentenceDiffOp } from '../../core/rhythm';
import type { Chapter } from '../../db/types';
import { Card, Empty } from '../../shared/ui';
import { C, ChartBox, LegendDot, TooltipBox, axisProps } from './charts';
import { formatMetric } from './ChaptersTab';
import { ChapterVersionPicker } from './RhythmTab';
import { activeVersion, chapterLabel, rhythmOf, type SerialSettings } from './useSerial';

type Pick = { chapterId: string; versionId: string };

export function VersionsTab({ chapters, chapterId, settings }: { chapters: Chapter[]; chapterId?: string; settings: SerialSettings }) {
  const start = chapters.find((c) => c.id === chapterId) ?? chapters[0];
  const [a, setA] = useState<Pick>(() => ({
    chapterId: start.id,
    versionId: (start.versions.find((v) => v.id !== start.activeVersionId) ?? start.versions[0]).id,
  }));
  const [b, setB] = useState<Pick>(() => ({ chapterId: start.id, versionId: activeVersion(start).id }));
  const [smooth, setSmooth] = useState(false);

  const resolve = (p: Pick) => {
    const ch = chapters.find((c) => c.id === p.chapterId) ?? chapters[0];
    const v = ch.versions.find((x) => x.id === p.versionId) ?? activeVersion(ch);
    return { ch, v };
  };
  const A = resolve(a);
  const B = resolve(b);
  const ma = rhythmOf(A.v.id, A.v.text, settings.rhythmOptions);
  const mb = rhythmOf(B.v.id, B.v.text, settings.rhythmOptions);
  const rows = compareMetrics(ma, mb);
  const sameChapter = A.ch.id === B.ch.id;
  const ops = useMemo(
    () => (sameChapter && A.v.id !== B.v.id ? diffSentences(A.v.text, B.v.text) : null),
    [sameChapter, A.v.id, A.v.text, B.v.id, B.v.text],
  );
  const nameA = `${sameChapter ? '' : `${A.ch.number}화 `}${A.v.label}`;
  const nameB = `${sameChapter ? '' : `${B.ch.number}화 `}${B.v.label}`;

  const wave = Array.from({ length: Math.max(ma.sentences.length, mb.sentences.length) }, (_, k) => ({
    i: k + 1,
    a: smooth ? ma.wave.movingAverage[k] : ma.wave.lengths[k],
    b: smooth ? mb.wave.movingAverage[k] : mb.wave.lengths[k],
  }));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border-l-4 bg-white p-3" style={{ borderColor: C.s1 }}>
          <div className="mb-2 text-xs font-semibold text-stone-500">A</div>
          <ChapterVersionPicker label="A" chapters={chapters} chapterId={a.chapterId} versionId={a.versionId} onChange={(chapterId, versionId) => setA({ chapterId, versionId })} />
        </div>
        <div className="rounded-lg border-l-4 bg-white p-3" style={{ borderColor: C.s2 }}>
          <div className="mb-2 text-xs font-semibold text-stone-500">B</div>
          <ChapterVersionPicker label="B" chapters={chapters} chapterId={b.chapterId} versionId={b.versionId} onChange={(chapterId, versionId) => setB({ chapterId, versionId })} />
        </div>
      </div>

      <Card title="지표 차이 (A → B)">
        <table className="w-full text-sm" data-testid="metric-diff">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
              <th className="py-1.5 font-medium">지표</th>
              <th className="py-1.5 text-right font-medium">A · {nameA}</th>
              <th className="py-1.5 text-right font-medium">B · {nameB}</th>
              <th className="py-1.5 text-right font-medium">차이</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = Math.abs(r.delta) < 1e-9 ? 0 : r.delta;
              return (
                <tr key={r.key} className="border-b border-stone-100 last:border-0">
                  <td className="py-1.5 text-stone-600">{r.label}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatMetric(r.kind, r.a)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatMetric(r.kind, r.b)}</td>
                  <td className={`py-1.5 text-right font-medium tabular-nums ${d > 0 ? 'text-teal-700' : d < 0 ? 'text-orange-700' : 'text-stone-400'}`}>
                    {d > 0 ? '▲ ' : d < 0 ? '▼ ' : ''}
                    {d === 0 ? '같음' : r.kind === 'ratio' ? `${(Math.abs(d) * 100).toFixed(1)}%p` : formatMetric(r.kind, Math.abs(d))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-stone-500">▲ 늘어남 · ▼ 줄어듦. 좋고 나쁨이 아니라 방향만 보여줘요.</p>
      </Card>

      <ChartBox
        title="문장 길이 파형 겹쳐 보기"
        legend={
          <>
            <LegendDot color={C.s1} shape="line">A · {nameA}</LegendDot>
            <LegendDot color={C.s2} shape="line">B · {nameB}</LegendDot>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={smooth} onChange={(e) => setSmooth(e.target.checked)} /> 이동 평균으로
            </label>
          </>
        }
        note="x = 문장 순서. 문장 수가 다르면 짧은 쪽이 먼저 끝나요."
      >
        <div className="h-64" data-testid="wave-overlay">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={wave} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="i" type="number" domain={[1, Math.max(1, wave.length)]} {...axisProps} allowDecimals={false} />
              <YAxis {...axisProps} allowDecimals={false} />
              <Tooltip
                content={({ active, payload }) => {
                  const p = active && (payload?.[0]?.payload as (typeof wave)[number] | undefined);
                  if (!p) return null;
                  const f = (v?: number) => (v === undefined ? '—' : `${Math.round(v * 10) / 10}자`);
                  return (
                    <TooltipBox>
                      <div className="font-medium">{p.i}번째 문장</div>
                      <div>A: {f(p.a)}</div>
                      <div>B: {f(p.b)}</div>
                    </TooltipBox>
                  );
                }}
              />
              <Line dataKey="a" stroke={C.s1} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
              <Line dataKey="b" stroke={C.s2} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartBox>

      {!sameChapter ? (
        <Empty title="본문 차이는 같은 회차의 버전끼리만 보여줘요">다른 회차끼리는 위의 지표 차이만 비교해요.</Empty>
      ) : !ops ? (
        <Empty title="같은 버전을 골랐어요">A와 B에 서로 다른 버전을 고르면 본문 차이가 보여요.</Empty>
      ) : (
        <SentenceDiff ops={ops} title={`본문 차이 — ${chapterLabel(A.ch)}`} />
      )}
    </div>
  );
}

function SentenceDiff({ ops, title }: { ops: SentenceDiffOp[]; title: string }) {
  const [showSame, setShowSame] = useState(false);
  const count = (t: SentenceDiffOp['type']) => ops.filter((o) => o.type === t).length;
  // 같은 문장이 이어지는 구간은 접는다
  const blocks: ({ kind: 'same'; ops: SentenceDiffOp[] } | { kind: 'op'; op: SentenceDiffOp })[] = [];
  for (const op of ops) {
    const last = blocks[blocks.length - 1];
    if (op.type === 'same') {
      if (last?.kind === 'same') last.ops.push(op);
      else blocks.push({ kind: 'same', ops: [op] });
    } else blocks.push({ kind: 'op', op });
  }
  return (
    <Card
      title={title}
      actions={
        <span className="flex items-center gap-3 text-xs text-stone-600" data-testid="diff-counts">
          <span>변경 {count('changed')}</span>
          <span>추가 {count('added')}</span>
          <span>삭제 {count('removed')}</span>
          <span>같음 {count('same')}</span>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={showSame} onChange={(e) => setShowSame(e.target.checked)} /> 같은 문장도 보기
          </label>
        </span>
      }
    >
      <ol className="manuscript space-y-1.5" data-testid="sentence-diff">
        {blocks.map((blk, k) => {
          if (blk.kind === 'same') {
            if (!showSame) return <li key={k} className="text-xs text-stone-400">… 같은 문장 {blk.ops.length}개 …</li>;
            return blk.ops.map((o, j) => (
              <li key={`${k}-${j}`} className="text-stone-500">
                {o.type === 'same' && o.b.text}
              </li>
            ));
          }
          const o = blk.op;
          if (o.type === 'added')
            return (
              <li key={k} className="rounded bg-teal-50 px-2 py-1">
                <span className="mr-2 text-xs font-semibold text-teal-800">+ 추가</span>
                {o.b.text}
              </li>
            );
          if (o.type === 'removed')
            return (
              <li key={k} className="rounded bg-orange-50 px-2 py-1">
                <span className="mr-2 text-xs font-semibold text-orange-800">− 삭제</span>
                <span className="line-through decoration-orange-400">{o.a.text}</span>
              </li>
            );
          if (o.type === 'changed')
            return (
              <li key={k} className="rounded bg-stone-50 px-2 py-1">
                <span className="mr-2 text-xs font-semibold text-stone-600">~ 변경</span>
                <span className="text-stone-500 line-through decoration-stone-400">{o.a.text}</span>
                <span className="mx-1.5 text-stone-400">→</span>
                {o.b.text}
              </li>
            );
          return null;
        })}
      </ol>
    </Card>
  );
}
