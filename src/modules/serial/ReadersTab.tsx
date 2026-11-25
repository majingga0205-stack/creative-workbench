// 독자 지표: 스냅샷 입력, 연독률(1화 대비·직전 대비), 꺾이는 구간
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { computeRetention, daysBetween, pickValues } from '../../core/rhythm';
import { deleteSnapshot, saveSnapshot } from '../../db/repo';
import type { Chapter, EndingTag, ReaderSnapshot } from '../../db/types';
import { confirmDialog, toast } from '../../shared/dialogs';
import { Badge, Button, Card, Field, Input } from '../../shared/ui';
import { C, ChartBox, LegendDot, TooltipBox, axisProps } from './charts';
import { chapterLabel, num, pct, type SerialSettings } from './useSerial';

/** 연독률 그래프를 보여줄 최소 회차 수 (SPEC 3단계 완료 조건) */
const MIN_CHAPTERS_FOR_CHART = 5;

const today = () => new Date().toISOString().slice(0, 10);

export function ReadersTab({ workId, chapters, snapshots, settings }: { workId: string; chapters: Chapter[]; snapshots: ReaderSnapshot[]; settings: SerialSettings }) {
  const metricDef = settings.readerMetrics.find((m) => m.key === settings.retentionMetric) ?? settings.readerMetrics[0];
  const day = settings.thresholds.compareDay;
  const retention = useMemo(() => {
    if (!metricDef) return null;
    return computeRetention(pickValues(chapters, snapshots, metricDef.key, day), settings.thresholds.breakDropPoints);
  }, [chapters, snapshots, metricDef, day, settings.thresholds.breakDropPoints]);

  return (
    <div className="space-y-4">
      <SnapshotForm workId={workId} chapters={chapters} settings={settings} />
      {metricDef && retention && (
        <RetentionView retention={retention} chapters={chapters} metricLabel={metricDef.label} settings={settings} />
      )}
      <SnapshotList chapters={chapters} snapshots={snapshots} settings={settings} />
    </div>
  );
}

// ───────────── 입력 ─────────────

function SnapshotForm({ workId, chapters, settings }: { workId: string; chapters: Chapter[]; settings: SerialSettings }) {
  const [recordedAt, setRecordedAt] = useState(today);
  const [manualDay, setManualDay] = useState(String(settings.thresholds.compareDay));
  const [vals, setVals] = useState<Record<string, Record<string, string>>>({});
  const metrics = settings.readerMetrics;

  const dayFor = (c: Chapter) => (c.publishedAt ? daysBetween(c.publishedAt, recordedAt) : undefined);

  const save = async () => {
    let saved = 0;
    for (const c of chapters) {
      const row = vals[c.id] ?? {};
      const values: Record<string, number> = {};
      for (const m of metrics) {
        const raw = (row[m.key] ?? '').replace(/,/g, '').trim();
        if (raw !== '' && Number.isFinite(Number(raw))) values[m.key] = Number(raw);
      }
      if (!Object.keys(values).length) continue;
      const d = dayFor(c) ?? Number(manualDay);
      if (!Number.isInteger(d) || d < 0) {
        toast(`${c.number}화의 게시 후 일수를 알 수 없어요. 게시일을 넣거나 일수를 직접 적어 주세요.`, 'error');
        return;
      }
      await saveSnapshot({ workId, chapterId: c.id, recordedAt, daysAfter: d, values });
      saved++;
    }
    if (saved) {
      setVals({});
      toast(`회차 ${saved}개의 독자 지표를 기록했어요`);
    } else toast('입력한 값이 없어요', 'error');
  };

  return (
    <Card title="독자 지표 기록" actions={<Button variant="primary" size="sm" onClick={save}>기록 저장</Button>}>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Field label="기록일">
            <Input type="date" value={recordedAt} onChange={(e) => setRecordedAt(e.target.value)} />
          </Field>
        </div>
        <div className="w-44">
          <Field label="게시 후 일수 (게시일 없는 회차)" hint="게시일이 있으면 자동 계산">
            <Input inputMode="numeric" value={manualDay} onChange={(e) => setManualDay(e.target.value)} />
          </Field>
        </div>
        <p className="flex-1 text-xs text-stone-500">
          조회수는 시간이 지나면 쌓이므로, 회차끼리는 ‘게시 후 {settings.thresholds.compareDay}일차’ 기록을 비교해요. 같은 일수가 없으면 가장 가까운 기록을 쓰고 ‘기준 다름’으로 표시해요.
        </p>
      </div>
      <div className="max-h-80 overflow-auto">
        <table className="w-full text-sm" data-testid="snapshot-form">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
              <th className="w-px py-1.5 pr-3 font-medium whitespace-nowrap">회차</th>
              <th className="w-px py-1.5 pr-3 font-medium whitespace-nowrap">게시 후 일수</th>
              {metrics.map((m) => (
                <th key={m.key} className="py-1.5 font-medium">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chapters.map((c) => {
              const d = dayFor(c);
              return (
                <tr key={c.id} className="border-b border-stone-100">
                  <td className="py-1 pr-3 whitespace-nowrap">{chapterLabel(c)}</td>
                  <td className="py-1 pr-3 whitespace-nowrap text-stone-500 tabular-nums">{d !== undefined ? `${d}일` : `${manualDay}일 (직접)`}</td>
                  {metrics.map((m) => (
                    <td key={m.key} className="py-1 pr-2">
                      <Input
                        aria-label={`${c.number}화 ${m.label}`}
                        inputMode="numeric"
                        className="!w-32 !py-1"
                        value={vals[c.id]?.[m.key] ?? ''}
                        onChange={(e) => setVals((v) => ({ ...v, [c.id]: { ...v[c.id], [m.key]: e.target.value } }))}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ───────────── 연독률 ─────────────

const SHAPE: Record<EndingTag | 'none', 'triangle' | 'circle' | 'square'> = { 절단: 'triangle', 여운: 'circle', 정리: 'square', none: 'circle' };

function TagDot({ cx, cy, tag }: { cx?: number; cy?: number; tag?: EndingTag }) {
  if (cx === undefined || cy === undefined) return null;
  const shape = SHAPE[tag ?? 'none'];
  const common = { fill: tag ? C.s1 : '#fff', stroke: tag ? '#fff' : C.s1, strokeWidth: 2 };
  if (shape === 'triangle') return <path d={`M${cx} ${cy - 6} L${cx + 6} ${cy + 5} L${cx - 6} ${cy + 5} Z`} {...common} />;
  if (shape === 'square') return <rect x={cx - 5} y={cy - 5} width={10} height={10} {...common} />;
  return <circle cx={cx} cy={cy} r={5} {...common} />;
}

function RetentionView({
  retention,
  chapters,
  metricLabel,
  settings,
}: {
  retention: ReturnType<typeof computeRetention>;
  chapters: Chapter[];
  metricLabel: string;
  settings: SerialSettings;
}) {
  const byId = new Map(chapters.map((c) => [c.id, c]));
  const data = retention.rows.map((r) => ({
    number: r.number,
    title: byId.get(r.chapterId)?.title ?? '',
    tag: byId.get(r.chapterId)?.endingTag,
    value: r.value ?? null,
    fromPrev: r.fromPrev !== undefined ? Math.round(r.fromPrev * 1000) / 10 : null,
    fromFirst: r.fromFirst,
    isBreak: r.isBreak,
    exactDay: r.exactDay,
    daysAfter: r.daysAfter,
  }));
  type Pt = (typeof data)[number];
  const tip = ({ active, payload }: { active?: boolean; payload?: readonly { payload?: unknown }[] }) => {
    const p = active ? (payload?.[0]?.payload as Pt | undefined) : undefined;
    if (!p) return null;
    return (
      <TooltipBox>
        <div className="font-medium">
          {p.number}화 {p.title}
        </div>
        <div>
          {metricLabel}: {p.value === null ? '—' : num(p.value)}
          {p.value !== null && !p.exactDay ? ` (${p.daysAfter}일차, 기준 다름)` : ''}
        </div>
        <div>직전 대비: {p.fromPrev === null ? '—' : `${p.fromPrev}%`}</div>
        <div>1화 대비: {p.fromFirst === undefined ? '—' : pct(p.fromFirst)}</div>
        {p.tag && <div className="text-stone-500">엔딩: {p.tag}</div>}
        {p.isBreak && <div className="font-medium text-orange-700">⚠ 꺾이는 구간</div>}
      </TooltipBox>
    );
  };

  if (retention.valuedCount < MIN_CHAPTERS_FOR_CHART) {
    return (
      <Card title="연독률">
        <p className="text-sm text-stone-600" data-testid="retention-waiting">
          {metricLabel} 기록이 있는 회차가 {retention.valuedCount}개예요. {MIN_CHAPTERS_FOR_CHART}개 이상이면 연독률 그래프와 꺾이는 구간이 보여요.
        </p>
      </Card>
    );
  }
  const med = retention.medianFromPrev !== undefined ? Math.round(retention.medianFromPrev * 1000) / 10 : undefined;
  const below = retention.breakBelow !== undefined ? Math.round(retention.breakBelow * 1000) / 10 : undefined;
  const breaks = data.filter((d) => d.isBreak);

  return (
    <div className="space-y-4" data-testid="retention">
      {/* 두 값은 단위가 달라서 y축 두 개를 겹치지 않고, 같은 x축(회차)으로 위아래에 둔다 */}
      <ChartBox
        title={`회차별 ${metricLabel} (게시 후 ${settings.thresholds.compareDay}일차)`}
        legend={
          <>
            <LegendDot color={C.s1} shape="triangle">절단</LegendDot>
            <LegendDot color={C.s1} shape="circle">여운</LegendDot>
            <LegendDot color={C.s1} shape="square">정리</LegendDot>
            <span className="text-stone-400">빈 원 = 태그 없음</span>
          </>
        }
      >
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} syncId="retention" margin={{ top: 10, right: 16, bottom: 4, left: 4 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="number" {...axisProps} tickFormatter={(n) => `${n}화`} />
              <YAxis {...axisProps} tickFormatter={(v) => Number(v).toLocaleString('ko-KR')} width={56} />
              <Tooltip content={tip} />
              <Line
                dataKey="value"
                stroke={C.s1}
                strokeWidth={2}
                isAnimationActive={false}
                connectNulls
                dot={(p: { cx?: number; cy?: number; index?: number; payload?: Pt }) => <TagDot key={`t${p.index}`} cx={p.cx} cy={p.cy} tag={p.payload?.tag} />}
                activeDot={{ r: 7 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartBox>
      <ChartBox
        title="직전 대비 연독률"
        legend={
          <>
            <LegendDot color={C.s1} shape="square">직전 대비</LegendDot>
            <LegendDot color={C.warn} shape="square">⚠ 꺾이는 구간</LegendDot>
            <LegendDot color="#57534e" shape="line">중앙값 {med}%</LegendDot>
          </>
        }
        note={`직전 대비 연독률이 중앙값보다 ${settings.thresholds.breakDropPoints}%p 이상 낮으면(${below}% 미만) 꺾이는 구간이에요.`}
      >
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} syncId="retention" margin={{ top: 10, right: 16, bottom: 4, left: 4 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="number" {...axisProps} tickFormatter={(n) => `${n}화`} />
              <YAxis {...axisProps} unit="%" width={56} />
              <Tooltip content={tip} cursor={{ fill: '#f5f5f4' }} />
              {med !== undefined && <ReferenceLine y={med} stroke="#57534e" strokeDasharray="4 3" />}
              <Bar dataKey="fromPrev" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {data.map((d, k) => (
                  <Cell key={k} fill={d.isBreak ? C.warn : C.s1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartBox>
      <Card title="연독률 표" actions={breaks.length ? <Badge tone="amber">⚠ 꺾이는 구간 {breaks.length}곳</Badge> : <Badge>꺾이는 구간 없음</Badge>}>
        <table className="w-full text-sm" data-testid="retention-table">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
              <th className="py-1.5 font-medium">회차</th>
              <th className="py-1.5 font-medium">엔딩</th>
              <th className="py-1.5 text-right font-medium">{metricLabel}</th>
              <th className="py-1.5 text-right font-medium">1화 대비</th>
              <th className="py-1.5 text-right font-medium">직전 대비</th>
              <th className="py-1.5 pl-3 font-medium">비고</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.number} className={`border-b border-stone-100 ${d.isBreak ? 'bg-orange-50' : ''}`}>
                <td className="py-1.5">
                  {d.number}화 <span className="text-stone-500">{d.title}</span>
                </td>
                <td className="py-1.5 text-stone-600">{d.tag ?? '—'}</td>
                <td className="py-1.5 text-right tabular-nums">{d.value === null ? '—' : num(d.value)}</td>
                <td className="py-1.5 text-right tabular-nums">{d.fromFirst === undefined ? '—' : pct(d.fromFirst)}</td>
                <td className="py-1.5 text-right tabular-nums">{d.fromPrev === null ? '—' : `${d.fromPrev}%`}</td>
                <td className="py-1.5 pl-3 text-xs">
                  {d.isBreak && <span className="font-medium text-orange-700">⚠ 꺾이는 구간 </span>}
                  {d.value !== null && !d.exactDay && <Badge tone="amber">기준 다름 ({d.daysAfter}일차)</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ───────────── 기록 목록 ─────────────

function SnapshotList({ chapters, snapshots, settings }: { chapters: Chapter[]; snapshots: ReaderSnapshot[]; settings: SerialSettings }) {
  const byId = new Map(chapters.map((c) => [c.id, c]));
  const sorted = [...snapshots].sort((a, b) => (byId.get(a.chapterId)?.number ?? 0) - (byId.get(b.chapterId)?.number ?? 0) || a.daysAfter - b.daysAfter);
  if (!sorted.length) return null;
  const remove = async (s: ReaderSnapshot) => {
    const c = byId.get(s.chapterId);
    const ok = await confirmDialog({ title: '기록 지우기', message: `${c ? `${c.number}화` : ''} ${s.daysAfter}일차 기록을 지울까요? 되돌릴 수 없어요.`, confirmLabel: '지우기', danger: true });
    if (ok) await deleteSnapshot(s.id);
  };
  return (
    <Card title={`기록 ${sorted.length}개`}>
      <div className="max-h-72 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
              <th className="py-1.5 font-medium">회차</th>
              <th className="py-1.5 font-medium">기록일</th>
              <th className="py-1.5 font-medium">일차</th>
              {settings.readerMetrics.map((m) => (
                <th key={m.key} className="py-1.5 text-right font-medium">
                  {m.label}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.id} className="border-b border-stone-100">
                <td className="py-1">{byId.get(s.chapterId)?.number}화</td>
                <td className="py-1 text-stone-600">{s.recordedAt}</td>
                <td className="py-1 text-stone-600">{s.daysAfter}일</td>
                {settings.readerMetrics.map((m) => (
                  <td key={m.key} className="py-1 text-right tabular-nums">
                    {s.values[m.key] === undefined ? '—' : num(s.values[m.key])}
                  </td>
                ))}
                <td className="py-1 text-right">
                  <Button size="sm" variant="ghost" onClick={() => remove(s)}>
                    지우기
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
