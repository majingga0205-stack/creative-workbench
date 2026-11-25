// 회차별 비교: 회차마다 현재 버전의 지표를 한 표와 선 그래프로
import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { METRIC_DEFS, summarizeRhythm } from '../../core/rhythm';
import type { Chapter } from '../../db/types';
import { Select } from '../../shared/ui';
import { C, ChartBox, TooltipBox, axisProps } from './charts';
import { activeVersion, num, pct, rhythmOf, type SerialSettings } from './useSerial';

export const formatMetric = (kind: string, v: number) => (kind === 'ratio' ? pct(v) : num(v));

export function ChaptersTab({ chapters, settings, onOpen }: { chapters: Chapter[]; settings: SerialSettings; onOpen: (id: string) => void }) {
  const [metricKey, setMetricKey] = useState('sentenceMean');
  const rows = useMemo(
    () =>
      chapters.map((c) => {
        const v = activeVersion(c);
        return { chapter: c, version: v, s: summarizeRhythm(rhythmOf(v.id, v.text, settings.rhythmOptions)) };
      }),
    [chapters, settings.rhythmOptions],
  );
  const def = METRIC_DEFS.find((d) => d.key === metricKey) ?? METRIC_DEFS[0];
  const data = rows.map((r) => ({ number: r.chapter.number, title: r.chapter.title, value: r.s[def.key], tag: r.chapter.endingTag }));

  return (
    <div className="space-y-4">
      <ChartBox
        title={`회차별 ${def.label}`}
        legend={
          <Select aria-label="그래프 지표" className="!w-48 !py-1" value={metricKey} onChange={(e) => setMetricKey(e.target.value)}>
            {METRIC_DEFS.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </Select>
        }
        note="각 회차의 현재 버전 기준이에요."
      >
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="number" {...axisProps} tickFormatter={(n) => `${n}화`} />
              <YAxis {...axisProps} tickFormatter={(v) => (def.kind === 'ratio' ? `${Math.round(v * 100)}%` : String(v))} />
              <Tooltip
                content={({ active, payload }) => {
                  const p = active && (payload?.[0]?.payload as (typeof data)[number] | undefined);
                  if (!p) return null;
                  return (
                    <TooltipBox>
                      <div className="font-medium">
                        {p.number}화 {p.title}
                      </div>
                      <div>
                        {def.label}: {formatMetric(def.kind, p.value)}
                      </div>
                      {p.tag && <div className="text-stone-500">엔딩: {p.tag}</div>}
                    </TooltipBox>
                  );
                }}
              />
              <Line dataKey="value" stroke={C.s1} strokeWidth={2} dot={{ r: 4, fill: C.s1, stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartBox>

      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="w-full min-w-[900px] text-sm" data-testid="chapters-table">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
              <th className="sticky left-0 bg-white px-3 py-2 font-medium">회차</th>
              <th className="px-2 py-2 font-medium">엔딩</th>
              {METRIC_DEFS.map((d) => (
                <th key={d.key} className="px-2 py-2 text-right font-medium">
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.chapter.id} className="border-b border-stone-100 hover:bg-stone-50">
                <td className="sticky left-0 bg-white px-3 py-1.5">
                  <button type="button" className="text-left hover:underline" onClick={() => onOpen(r.chapter.id)}>
                    {r.chapter.number}화 <span className="text-stone-500">{r.chapter.title}</span>
                  </button>
                </td>
                <td className="px-2 py-1.5 text-stone-600">{r.chapter.endingTag ?? '—'}</td>
                {METRIC_DEFS.map((d) => (
                  <td key={d.key} className="px-2 py-1.5 text-right tabular-nums">
                    {formatMetric(d.kind, r.s[d.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
