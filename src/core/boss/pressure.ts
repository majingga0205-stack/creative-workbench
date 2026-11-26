// 보스 페이즈 압박도·요약·경고·타임라인·곡선 (SPEC 모듈 E). 순수 함수, React·Dexie를 import하지 않는다.
import type { Boss, Pattern, PatternShape, Phase } from '../../db/types';

/** 설정 화면에서 바꾸는 압박도 가중치와 기준값 */
export type PressureSettings = {
  weights: { D: number; R: number; H: number; P: number };
  /** R(반응 압박) = (reactionMaxMs − 전조) ÷ (reactionMaxMs − reactionMinMs) */
  reactionMaxMs: number;
  reactionMinMs: number;
  /** P(반격 기회 부족) = 1 − 후딜 ÷ recoveryRefMs */
  recoveryRefMs: number;
  /** 경고: 전조가 이보다 짧으면 '반응하기 어려움' */
  telegraphWarnMs: number;
  /** 곡선: 의도한 긴장도와 압박도가 이만큼 이상 벌어지면 강조 */
  gapThreshold: number;
};

export const DEFAULT_PRESSURE: PressureSettings = {
  weights: { D: 0.35, R: 0.25, H: 0.25, P: 0.15 },
  reactionMaxMs: 1000,
  reactionMinMs: 250,
  recoveryRefMs: 1000,
  telegraphWarnMs: 250,
  gapThreshold: 2,
};

export const resolvePressure = (s?: Partial<PressureSettings>): PressureSettings => ({
  ...DEFAULT_PRESSURE,
  ...s,
  weights: { ...DEFAULT_PRESSURE.weights, ...s?.weights },
});

const clip01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

export type PressureTerms = { D: number; R: number; H: number; P: number };

/** 패턴 하나의 네 항 (각각 0~1로 자름) */
export function patternTerms(p: Pattern, playerMaxHp: number, s: PressureSettings = DEFAULT_PRESSURE): PressureTerms {
  const cycle = p.telegraphMs + p.activeMs + p.recoveryMs + p.cooldownMs;
  return {
    D: clip01(cycle > 0 ? p.activeMs / cycle : 0),
    R: clip01((s.reactionMaxMs - p.telegraphMs) / (s.reactionMaxMs - s.reactionMinMs)),
    H: clip01(playerMaxHp > 0 ? p.damage / playerMaxHp : 0),
    P: clip01(1 - p.recoveryMs / s.recoveryRefMs),
  };
}

/** 페이즈에서 쓰는 패턴과 비중: 시퀀스가 있으면 그 비중(0보다 큰 것만), 없으면 모든 패턴을 같은 비중으로 */
export function weightedPatterns(phase: Pick<Phase, 'patterns' | 'sequence'>): { pattern: Pattern; weight: number }[] {
  const byId = new Map(phase.patterns.map((p) => [p.id, p]));
  const seq = phase.sequence.filter((x) => byId.has(x.patternId) && x.weight > 0);
  if (seq.length) return seq.map((x) => ({ pattern: byId.get(x.patternId)!, weight: x.weight }));
  return phase.patterns.map((pattern) => ({ pattern, weight: 1 }));
}

export type PhasePressure = { terms: PressureTerms; pressure: number };

/**
 * 압박도 = 10 (wD·D + wR·R + wH·H + wP·P). 각 항은 시퀀스 비중으로 가중 평균한 패턴 값(0~1).
 * 패턴이 없으면 null.
 */
export function phasePressure(phase: Pick<Phase, 'patterns' | 'sequence'>, playerMaxHp: number, settings?: Partial<PressureSettings>): PhasePressure | null {
  const s = resolvePressure(settings);
  const wp = weightedPatterns(phase);
  const total = wp.reduce((n, x) => n + x.weight, 0);
  if (!total) return null;
  const avg = (k: keyof PressureTerms) => wp.reduce((n, x) => n + x.weight * patternTerms(x.pattern, playerMaxHp, s)[k], 0) / total;
  const terms = { D: avg('D'), R: avg('R'), H: avg('H'), P: avg('P') };
  const w = s.weights;
  const pressure = 10 * (w.D * terms.D + w.R * terms.R + w.H * terms.H + w.P * terms.P);
  return { terms, pressure: Math.min(10, Math.max(0, pressure)) };
}

export type PatternWarning = { patternId: string; kind: 'telegraph' | 'recovery'; message: string };

/** 경고: 전조가 기준보다 짧으면 반응하기 어려움, 후딜 0이면 반격 기회 없음 */
export function patternWarnings(p: Pattern, settings?: Partial<PressureSettings>): PatternWarning[] {
  const s = resolvePressure(settings);
  const out: PatternWarning[] = [];
  if (p.telegraphMs < s.telegraphWarnMs) out.push({ patternId: p.id, kind: 'telegraph', message: `전조 ${p.telegraphMs}ms — ${s.telegraphWarnMs}ms 미만이라 반응하기 어려워요` });
  if (p.recoveryMs <= 0) out.push({ patternId: p.id, kind: 'recovery', message: '후딜 0 — 반격 기회가 없어요' });
  return out;
}

export type PhaseSummary = { patternCount: number; avgRecoveryMs: number | null; pressure: number | null; warnings: PatternWarning[] };

/** 카드 아래 요약: 패턴 수, 평균 후딜(시퀀스 비중 가중), 압박도, 경고 */
export function phaseSummary(phase: Phase, playerMaxHp: number, settings?: Partial<PressureSettings>): PhaseSummary {
  const wp = weightedPatterns(phase);
  const total = wp.reduce((n, x) => n + x.weight, 0);
  return {
    patternCount: phase.patterns.length,
    avgRecoveryMs: total ? wp.reduce((n, x) => n + x.weight * x.pattern.recoveryMs, 0) / total : null,
    pressure: phasePressure(phase, playerMaxHp, settings)?.pressure ?? null,
    warnings: phase.patterns.flatMap((p) => patternWarnings(p, settings)),
  };
}

// ── 고정 시드 타임라인 ──

/** 글자열 → 32비트 시드 (FNV-1a) */
export function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 고정 시드 난수 (mulberry32): 같은 시드면 같은 수열 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type TimelineSlot = { patternId: string; start: number; telegraphEnd: number; activeEnd: number; recoveryEnd: number; end: number };

/** 시퀀스를 비중대로 durationMs(기본 30초) 분량 펼친다. 시드가 같으면 같은 배열 */
export function buildTimeline(phase: Pick<Phase, 'id' | 'patterns' | 'sequence'>, durationMs = 30_000, seed = seedOf(phase.id)): TimelineSlot[] {
  const wp = weightedPatterns(phase);
  const total = wp.reduce((n, x) => n + x.weight, 0);
  if (!total) return [];
  const rand = rng(seed);
  const out: TimelineSlot[] = [];
  let t = 0;
  while (t < durationMs && out.length < 10_000) {
    let r = rand() * total;
    const pick = wp.find((x) => (r -= x.weight) < 0) ?? wp[wp.length - 1];
    const p = pick.pattern;
    const telegraphEnd = t + p.telegraphMs;
    const activeEnd = telegraphEnd + p.activeMs;
    const recoveryEnd = activeEnd + p.recoveryMs;
    const end = Math.max(recoveryEnd + p.cooldownMs, t + 1);
    out.push({ patternId: p.id, start: t, telegraphEnd, activeEnd, recoveryEnd, end });
    t = end;
  }
  return out;
}

// ── 곡선 ──

export type CurvePoint = {
  phaseId: string;
  order: number;
  name: string;
  emotion: string;
  intended: number;
  pressure: number | null;
  /** 압박도 − 의도한 긴장도 */
  gap: number | null;
  /** 차이가 기준 이상이면 '의도보다 쉬움'(압박도가 낮음) / '의도보다 어려움'(높음) */
  flag: '의도보다 쉬움' | '의도보다 어려움' | null;
  intendedGap: boolean;
};

export function tensionCurve(boss: Pick<Boss, 'phases' | 'player'>, settings?: Partial<PressureSettings>): CurvePoint[] {
  const s = resolvePressure(settings);
  return [...boss.phases]
    .sort((a, b) => a.order - b.order)
    .map((ph) => {
      const pressure = phasePressure(ph, boss.player.maxHp, s)?.pressure ?? null;
      const gap = pressure === null ? null : pressure - ph.intendedTension;
      const flag = gap === null || Math.abs(gap) < s.gapThreshold ? null : gap < 0 ? '의도보다 쉬움' : '의도보다 어려움';
      return { phaseId: ph.id, order: ph.order, name: ph.name, emotion: ph.emotion, intended: ph.intendedTension, pressure, gap, flag, intendedGap: !!ph.gapIntended };
    });
}

// ── 새로 만들 때 기본값 (게임 설계 출발값, 화면에서 고친다) ──

export const DEFAULT_PARAMS: Record<PatternShape, Record<string, number | string>> = {
  projectile: { count: 5, spreadDeg: 30, speed: 400, intervalMs: 100, aim: 'player', angleDeg: 180, radius: 8 },
  arc: { radius: 140, angleDeg: 120, direction: 'player' },
  thrust: { length: 220, width: 40 },
  area: { form: 'rect', size: 160, at: 'player' },
  dash: { distance: 400, width: 60 },
};

export const SHAPE_LABELS: Record<PatternShape, string> = {
  projectile: '탄막',
  arc: '휘두르기',
  thrust: '찌르기',
  area: '범위',
  dash: '돌진',
};

export const PARAM_LABELS: Record<string, string> = {
  count: '탄 수',
  spreadDeg: '퍼짐 각도(°)',
  speed: '속도(px/s)',
  intervalMs: '발사 간격(ms)',
  aim: '조준',
  angleDeg: '각도(°)',
  radius: '반지름(px)',
  direction: '방향',
  length: '길이(px)',
  width: '폭(px)',
  form: '모양',
  size: '크기(px)',
  at: '위치',
  distance: '거리(px)',
};

export const PARAM_CHOICES: Record<string, string[]> = {
  aim: ['player', 'fixed', 'spiral'],
  direction: ['player', 'fixed'],
  form: ['circle', 'rect'],
  at: ['player', 'boss'],
};

export function newPattern(id: string, shape: PatternShape, name = SHAPE_LABELS[shape]): Pattern {
  return { id, name, shape, telegraphMs: 500, activeMs: 300, recoveryMs: 400, cooldownMs: 800, damage: 10, counter: '회피', params: { ...DEFAULT_PARAMS[shape] } };
}

export function newPhase(id: string, order: number): Phase {
  return { id, order, name: `${order + 1}페이즈`, emotion: '', narrative: '', weapon: '', hpFrom: 100, hpTo: 0, transition: '', intendedTension: 5, sequence: [], patterns: [] };
}

export function newBossDefaults(): Pick<Boss, 'arena' | 'player'> {
  return {
    arena: { width: 960, height: 400 },
    player: { maxHp: 100, speed: 280, width: 32, height: 56, jump: { height: 120, durationMs: 700 }, dodge: { distance: 140, durationMs: 300, iframeMs: 200, cooldownMs: 600 } },
  };
}

/** 페이즈 순서를 0부터 다시 매긴다 (끌어서 순서를 바꾼 뒤) */
export function reorderPhases(phases: Phase[], fromIndex: number, toIndex: number): Phase[] {
  const sorted = [...phases].sort((a, b) => a.order - b.order);
  const [moved] = sorted.splice(fromIndex, 1);
  sorted.splice(Math.max(0, Math.min(sorted.length, toIndex)), 0, moved);
  return sorted.map((p, i) => ({ ...p, order: i }));
}

/** 페이즈 복제: 새 id를 받아 패턴 id도 새로 바꾸고 시퀀스를 맞춘다 */
export function duplicatePhase(phase: Phase, newId: () => string, order: number): Phase {
  const map = new Map(phase.patterns.map((p) => [p.id, newId()]));
  return {
    ...structuredClone(phase),
    id: newId(),
    order,
    name: `${phase.name} (복제)`,
    patterns: phase.patterns.map((p) => ({ ...structuredClone(p), id: map.get(p.id)! })),
    sequence: phase.sequence.filter((x) => map.has(x.patternId)).map((x) => ({ ...x, patternId: map.get(x.patternId)! })),
  };
}
