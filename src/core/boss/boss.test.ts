import { describe, expect, it } from 'vitest';
import type { Pattern, Phase } from '../../db/types';
import {
  DEFAULT_PRESSURE,
  buildTimeline,
  duplicatePhase,
  newBossDefaults,
  newPattern,
  newPhase,
  patternTerms,
  patternWarnings,
  phasePressure,
  phaseSummary,
  reorderPhases,
  rng,
  seedOf,
  tensionCurve,
  weightedPatterns,
} from './index';

const pat = (id: string, t: Partial<Pattern> = {}): Pattern => ({ ...newPattern(id, 'projectile'), ...t });
const phase = (id: string, order: number, patterns: Pattern[], extra: Partial<Phase> = {}): Phase => ({ ...newPhase(id, order), patterns, ...extra });

describe('압박도', () => {
  it('패턴 하나의 네 항: D·R·H·P (0~1로 자름)', () => {
    const p = pat('a', { telegraphMs: 500, activeMs: 300, recoveryMs: 400, cooldownMs: 800, damage: 20 });
    const t = patternTerms(p, 100);
    expect(t.D).toBeCloseTo(300 / 2000); // 공격 ÷ 한 주기
    expect(t.R).toBeCloseTo((1000 - 500) / 750); // (1000 − 전조) ÷ (1000 − 250)
    expect(t.H).toBeCloseTo(0.2); // 피해 ÷ 최대 체력
    expect(t.P).toBeCloseTo(0.6); // 1 − 후딜 ÷ 1000
    const extreme = patternTerms(pat('b', { telegraphMs: 100, damage: 500, recoveryMs: 0, activeMs: 0 }), 100);
    expect(extreme).toMatchObject({ R: 1, H: 1, P: 1, D: 0 });
    expect(patternTerms(pat('c', { telegraphMs: 2000, recoveryMs: 2000 }), 100)).toMatchObject({ R: 0, P: 0 });
  });

  it('압박도 = 10 (0.35D + 0.25R + 0.25H + 0.15P)', () => {
    const p = pat('a', { telegraphMs: 500, activeMs: 300, recoveryMs: 400, cooldownMs: 800, damage: 20 });
    const r = phasePressure({ patterns: [p], sequence: [] }, 100)!;
    expect(r.pressure).toBeCloseTo(10 * (0.35 * 0.15 + 0.25 * (500 / 750) + 0.25 * 0.2 + 0.15 * 0.6));
  });

  it('각 항은 시퀀스 비중으로 가중 평균한다', () => {
    const fast = pat('fast', { telegraphMs: 250 }); // R = 1
    const slow = pat('slow', { telegraphMs: 1000 }); // R = 0
    const r = phasePressure({ patterns: [fast, slow], sequence: [{ patternId: 'fast', weight: 3 }, { patternId: 'slow', weight: 1 }] }, 100)!;
    expect(r.terms.R).toBeCloseTo(0.75);
    // 시퀀스가 비면 모든 패턴을 같은 비중으로
    expect(phasePressure({ patterns: [fast, slow], sequence: [] }, 100)!.terms.R).toBeCloseTo(0.5);
    // 비중 0인 패턴은 빠진다
    expect(weightedPatterns({ patterns: [fast, slow], sequence: [{ patternId: 'fast', weight: 1 }, { patternId: 'slow', weight: 0 }] }).map((x) => x.pattern.id)).toEqual(['fast']);
  });

  it('가중치·기준값을 바꿀 수 있다', () => {
    const p = pat('a', { damage: 50 });
    const onlyH = phasePressure({ patterns: [p], sequence: [] }, 100, { weights: { D: 0, R: 0, H: 1, P: 0 } })!;
    expect(onlyH.pressure).toBeCloseTo(5);
    const r = phasePressure({ patterns: [pat('b', { telegraphMs: 500 })], sequence: [] }, 100, { reactionMaxMs: 2000, reactionMinMs: 0, weights: { D: 0, R: 1, H: 0, P: 0 } })!;
    expect(r.pressure).toBeCloseTo(7.5);
    expect(DEFAULT_PRESSURE.weights).toEqual({ D: 0.35, R: 0.25, H: 0.25, P: 0.15 });
  });

  it('패턴이 없으면 압박도 없음', () => {
    expect(phasePressure({ patterns: [], sequence: [] }, 100)).toBeNull();
  });
});

describe('경고와 요약', () => {
  it('전조 250ms 미만 → 반응하기 어려움, 후딜 0 → 반격 기회 없음 (기준값 조정 가능)', () => {
    expect(patternWarnings(pat('a', { telegraphMs: 200, recoveryMs: 0 })).map((w) => w.kind)).toEqual(['telegraph', 'recovery']);
    expect(patternWarnings(pat('a', { telegraphMs: 250, recoveryMs: 100 }))).toEqual([]);
    expect(patternWarnings(pat('a', { telegraphMs: 300 }), { telegraphWarnMs: 400 }).map((w) => w.kind)).toEqual(['telegraph']);
  });

  it('카드 요약: 패턴 수, 평균 후딜(비중 가중), 압박도', () => {
    const ph = phase('p', 0, [pat('a', { recoveryMs: 200 }), pat('b', { recoveryMs: 600 })], { sequence: [{ patternId: 'a', weight: 1 }, { patternId: 'b', weight: 3 }] });
    const s = phaseSummary(ph, 100);
    expect(s.patternCount).toBe(2);
    expect(s.avgRecoveryMs).toBe(500);
    expect(s.pressure).toBeGreaterThan(0);
  });
});

describe('30초 타임라인', () => {
  const ph = phase('phase-1', 0, [pat('a'), pat('b', { telegraphMs: 300 })], { sequence: [{ patternId: 'a', weight: 1 }, { patternId: 'b', weight: 2 }] });

  it('고정 시드라 매번 같은 배열', () => {
    expect(buildTimeline(ph)).toEqual(buildTimeline(ph));
    expect(rng(seedOf('x'))()).toBe(rng(seedOf('x'))());
  });

  it('30초 분량을 이어 붙이고, 구간은 전조 → 공격 → 후딜 → 쿨다운 순', () => {
    const t = buildTimeline(ph);
    expect(t[0].start).toBe(0);
    expect(t[t.length - 1].start).toBeLessThan(30_000);
    expect(t[t.length - 1].end).toBeGreaterThanOrEqual(30_000);
    for (let i = 1; i < t.length; i++) expect(t[i].start).toBe(t[i - 1].end);
    const s = t[0];
    expect(s.start <= s.telegraphEnd && s.telegraphEnd <= s.activeEnd && s.activeEnd <= s.recoveryEnd && s.recoveryEnd <= s.end).toBe(true);
  });

  it('비중이 클수록 자주 나온다', () => {
    const t = buildTimeline(ph, 300_000);
    const b = t.filter((x) => x.patternId === 'b').length;
    const a = t.filter((x) => x.patternId === 'a').length;
    expect(b).toBeGreaterThan(a);
  });

  it('패턴이 없으면 빈 타임라인', () => {
    expect(buildTimeline(phase('e', 0, []))).toEqual([]);
  });
});

describe('긴장도 곡선', () => {
  // 페이즈 4개: 의도한 긴장도 2 / 5 / 8 / 3
  const gentle = pat('g', { telegraphMs: 900, activeMs: 200, recoveryMs: 900, cooldownMs: 1500, damage: 5 });
  const brutal = pat('x', { telegraphMs: 200, activeMs: 800, recoveryMs: 0, cooldownMs: 200, damage: 60 });
  const boss = {
    ...newBossDefaults(),
    phases: [
      phase('p0', 0, [gentle], { intendedTension: 2, emotion: '평온' }),
      phase('p1', 1, [gentle], { intendedTension: 5, emotion: '부정' }),
      phase('p2', 2, [brutal], { intendedTension: 8, emotion: '분노' }),
      phase('p3', 3, [brutal], { intendedTension: 3, emotion: '타협', gapIntended: true }),
    ],
  };

  it('페이즈마다 두 값(의도한 긴장도, 압박도)과 2 이상 차이 강조', () => {
    const c = tensionCurve(boss);
    expect(c.map((x) => x.emotion)).toEqual(['평온', '부정', '분노', '타협']);
    expect(c.every((x) => x.pressure !== null)).toBe(true);
    expect(c[0].flag).toBeNull();
    expect(c[1].flag).toBe('의도보다 쉬움');
    expect(c[3].flag).toBe('의도보다 어려움');
    expect(c[3].intendedGap).toBe(true);
  });

  it('차이 기준을 바꿀 수 있다', () => {
    expect(tensionCurve(boss, { gapThreshold: 100 }).every((x) => x.flag === null)).toBe(true);
  });
});

describe('페이즈 카드 조작', () => {
  const phases = [phase('a', 0, []), phase('b', 1, []), phase('c', 2, [])];

  it('끌어서 순서 바꾸기: 순서를 0부터 다시 매긴다', () => {
    expect(reorderPhases(phases, 2, 0).map((p) => [p.id, p.order])).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 2],
    ]);
  });

  it('복제: 패턴 id를 새로 만들고 시퀀스를 맞춘다', () => {
    let n = 0;
    const src = phase('a', 0, [pat('p1')], { sequence: [{ patternId: 'p1', weight: 2 }] });
    const d = duplicatePhase(src, () => `new${++n}`, 3);
    expect(d.id).not.toBe('a');
    expect(d.order).toBe(3);
    expect(d.patterns[0].id).not.toBe('p1');
    expect(d.sequence).toEqual([{ patternId: d.patterns[0].id, weight: 2 }]);
    expect(src.patterns[0].id).toBe('p1');
  });
});
