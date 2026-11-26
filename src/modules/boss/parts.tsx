// 보스 보드 화면 조각: 숫자 칸, 패턴 타이밍 막대(구간 끝 끌기), 30초 타임라인
import { useEffect, useRef, useState } from 'react';
import type { Pattern } from '../../db/types';
import type { TimelineSlot } from '../../core/boss';
import { Input } from '../../shared/ui';

/** 숫자 칸: 입력 중엔 글 그대로, 올바른 숫자일 때만 바깥에 알린다 */
export function NumberField({ label, value, onChange, min = 0, max, step, unit, className = '' }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; unit?: string; className?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const n = Number(text);
  const ok = text.trim() !== '' && Number.isFinite(n) && n >= min && (max === undefined || n <= max);
  return (
    <label className={`block ${className}`}>
      <span className="mb-0.5 block text-[11px] text-stone-500">
        {label}
        {unit ? ` (${unit})` : ''}
      </span>
      <Input
        inputMode="decimal"
        step={step}
        aria-label={label}
        className={`!py-1 ${ok ? '' : '!border-red-400'}`}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value);
          if (e.target.value.trim() !== '' && Number.isFinite(v) && v >= min && (max === undefined || v <= max)) onChange(v);
        }}
      />
    </label>
  );
}

const SEGMENTS: { key: keyof Pick<Pattern, 'telegraphMs' | 'activeMs' | 'recoveryMs' | 'cooldownMs'>; label: string; cls: string }[] = [
  { key: 'telegraphMs', label: '전조', cls: 'bg-amber-300' },
  { key: 'activeMs', label: '공격', cls: 'bg-red-500' },
  { key: 'recoveryMs', label: '후딜', cls: 'bg-teal-500' },
  { key: 'cooldownMs', label: '쿨다운', cls: 'bg-stone-300' },
];

export const SEGMENT_STYLE = SEGMENTS;

/**
 * 패턴 타이밍 막대: 전조 → 공격 → 후딜 → 쿨다운. 각 구간의 오른쪽 끝을 끌면 그 구간 길이가 바뀐다(10ms 단위).
 * scaleMs = 막대 전체 폭이 나타내는 시간
 */
export function TimingBar({ pattern, scaleMs, onChange }: { pattern: Pattern; scaleMs: number; onChange: (patch: Partial<Pattern>) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ key: (typeof SEGMENTS)[number]['key']; startX: number; startMs: number } | null>(null);

  const onDown = (key: (typeof SEGMENTS)[number]['key']) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { key, startX: e.clientX, startMs: pattern[key] };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !box.current) return;
    const msPerPx = scaleMs / box.current.clientWidth;
    const next = Math.max(0, Math.round((d.startMs + (e.clientX - d.startX) * msPerPx) / 10) * 10);
    if (next !== pattern[d.key]) onChange({ [d.key]: next });
  };
  const onUp = () => (drag.current = null);

  return (
    <div ref={box} className="relative flex h-7 w-full select-none overflow-hidden rounded bg-stone-100" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} data-testid="timing-bar">
      {SEGMENTS.map((s) => {
        const w = (pattern[s.key] / scaleMs) * 100;
        return (
          <div key={s.key} className={`relative h-full shrink-0 ${s.cls}`} style={{ width: `${w}%` }} title={`${s.label} ${pattern[s.key]}ms`}>
            {w > 7 && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-medium text-stone-900/80">{s.label}</span>}
            <span
              role="slider"
              aria-label={`${s.label} 끝 끌기`}
              aria-valuenow={pattern[s.key]}
              tabIndex={0}
              onPointerDown={onDown(s.key)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') onChange({ [s.key]: pattern[s.key] + 10 });
                if (e.key === 'ArrowLeft') onChange({ [s.key]: Math.max(0, pattern[s.key] - 10) });
              }}
              className="absolute top-0 right-0 z-10 h-full w-2 translate-x-1 cursor-ew-resize rounded-sm bg-stone-800/0 hover:bg-stone-800/40 focus:bg-stone-800/40 focus:outline-none"
            />
          </div>
        );
      })}
    </div>
  );
}

/** 30초 타임라인: 슬롯마다 전조·공격·후딜·쿨다운을 이어 그린다 */
export function Timeline({ slots, nameOf, durationMs = 30_000 }: { slots: TimelineSlot[]; nameOf: (id: string) => string; durationMs?: number }) {
  if (!slots.length) return <p className="text-sm text-stone-500">패턴이 없어요.</p>;
  const pct = (ms: number) => `${(Math.min(ms, durationMs) / durationMs) * 100}%`;
  return (
    <div>
      <div className="relative h-10 w-full overflow-hidden rounded bg-stone-100" data-testid="phase-timeline">
        {slots.map((s, k) => (
          <div key={k} className="absolute top-0 flex h-full" style={{ left: pct(s.start), width: `calc(${pct(s.end)} - ${pct(s.start)})` }} title={`${nameOf(s.patternId)} · ${(s.start / 1000).toFixed(1)}초`}>
            {[
              [s.start, s.telegraphEnd, 'bg-amber-300'],
              [s.telegraphEnd, s.activeEnd, 'bg-red-500'],
              [s.activeEnd, s.recoveryEnd, 'bg-teal-500'],
              [s.recoveryEnd, s.end, 'bg-stone-300'],
            ].map(([a, b, cls], j) => (
              <div key={j} className={`h-full ${cls as string}`} style={{ width: `${(((b as number) - (a as number)) / Math.max(1, s.end - s.start)) * 100}%` }} />
            ))}
            <div className="absolute inset-y-0 left-0 w-px bg-white" />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-stone-500">
        {[0, 5, 10, 15, 20, 25, 30].map((t) => <span key={t}>{t}초</span>)}
      </div>
      <p className="mt-1 text-xs text-stone-500">
        패턴 {slots.filter((s) => s.start < durationMs).length}번 · 순서: {slots.slice(0, 12).map((s) => nameOf(s.patternId)).join(' → ')}
        {slots.length > 12 ? ' …' : ''}
      </p>
    </div>
  );
}
