// 연재 실험실 차트 공용 조각. 색은 dataviz 기본 팔레트(검증된 순서)에서 가져온다.
import type { ReactNode } from 'react';

export const C = {
  s1: '#257de0', // 1번 계열 (파랑): 서술, A 버전, 조회수
  s2: '#f47230', // 2번 계열 (주황): 대사, B 버전
  grid: '#e7e5e4',
  axis: '#78716c',
  warn: '#c2410c', // 꺾이는 구간·벽 문단 (아이콘·글자와 함께 씀)
};

export const axisProps = {
  stroke: C.axis,
  tick: { fontSize: 11, fill: C.axis },
  tickLine: false,
  axisLine: { stroke: C.grid },
} as const;

export function ChartBox({ title, legend, children, note }: { title: string; legend?: ReactNode; children: ReactNode; note?: ReactNode }) {
  return (
    <figure className="rounded-lg border border-stone-200 bg-white p-4">
      <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-stone-800">{title}</span>
        {legend && <span className="flex flex-wrap items-center gap-3 text-xs text-stone-600">{legend}</span>}
      </figcaption>
      {children}
      {note && <p className="mt-2 text-xs text-stone-500">{note}</p>}
    </figure>
  );
}

export function LegendDot({ color, children, shape = 'circle' }: { color: string; children: ReactNode; shape?: 'circle' | 'line' | 'square' | 'triangle' }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="14" height="10" aria-hidden="true">
        {shape === 'line' && <line x1="0" y1="5" x2="14" y2="5" stroke={color} strokeWidth="2" />}
        {shape === 'circle' && <circle cx="7" cy="5" r="4" fill={color} />}
        {shape === 'square' && <rect x="3" y="1" width="8" height="8" fill={color} />}
        {shape === 'triangle' && <path d="M7 0.5 L12 9.5 L2 9.5 Z" fill={color} />}
      </svg>
      {children}
    </span>
  );
}

export function TooltipBox({ children }: { children: ReactNode }) {
  return <div className="max-w-xs rounded-md border border-stone-200 bg-white px-3 py-2 text-xs text-stone-700 shadow-md">{children}</div>;
}
