import { describe, expect, it } from 'vitest';
import type { Pattern, PatternShape } from '../../db/types';
import {
  DT,
  NO_INPUT,
  PATTERN_SHAPES_FOR_TEST,
  dodgeCheck,
  initState,
  makeContext,
  newBossDefaults,
  newPattern,
  patternHazards,
  runSim,
  sceneOf,
  stepSim,
  type SimContext,
  type SimInput,
  type SimState,
} from './testkit';

const boss = newBossDefaults(); // 아레나 960×400, 플레이어 체력 100·속도 280·몸통 32×56·점프 120/700·회피 140/300/무적 200/쿨 600
const pat = (shape: PatternShape, extra: Partial<Pattern> = {}, params: Record<string, number | string> = {}): Pattern => {
  const p = newPattern(`p-${shape}`, shape);
  return { ...p, ...extra, params: { ...p.params, ...params } };
};
const single = (p: Pattern): SimContext => makeContext(boss, [p], { kind: 'pattern', patternId: p.id });
/** 지금 패턴 안에서 몇 ms째인가 */
const relOf = (s: SimState, ctx: SimContext) => s.t - ctx.slots[s.slot].start;

describe('시뮬레이션 기본', () => {
  it('같은 시드·같은 조작이면 같은 결과', () => {
    const phase = { id: 'ph', patterns: [pat('area'), pat('arc'), pat('projectile')], sequence: [] };
    const ctx = makeContext(boss, phase.patterns, { kind: 'phase', phase });
    const inputs = (i: number): SimInput => ({ left: i % 90 < 30, right: i % 90 > 60, jump: i % 120 === 0, dodge: i % 200 === 50 });
    const a = runSim(ctx, 900, inputs);
    const b = runSim(makeContext(boss, phase.patterns, { kind: 'phase', phase }), 900, inputs);
    expect(a).toEqual(b);
    expect(a.t).toBeCloseTo(900 * DT);
  });

  it('스텝은 입력 상태를 바꾸지 않는다', () => {
    const ctx = single(pat('area'));
    const s0 = initState(ctx);
    const copy = structuredClone(s0);
    stepSim(s0, { left: true, right: false, jump: true, dodge: true }, ctx);
    expect(s0).toEqual(copy);
  });

  it('다섯 모양이 모두 전조 윤곽과 공격 판정을 만든다', () => {
    for (const shape of PATTERN_SHAPES_FOR_TEST) {
      const p = pat(shape);
      const ctx = single(p);
      const snap = initState(ctx).snapshots[0];
      expect(patternHazards(p, snap, 10, ctx).some((h) => h.phase === 'telegraph')).toBe(true);
      expect(patternHazards(p, snap, p.telegraphMs + 50, ctx).some((h) => h.phase === 'active')).toBe(true);
    }
  });

  it('점프는 포물선, 회피는 무적 시간 동안 맞지 않는다', () => {
    const ctx = single(pat('area', { telegraphMs: 600 }));
    let s = stepSim(initState(ctx), { ...NO_INPUT, jump: true }, ctx);
    s = runSim(ctx, 20, () => NO_INPUT, s); // 약 350ms 뒤 = 체공 절반쯤
    expect(s.player.y).toBeGreaterThan(100);
    s = runSim(ctx, 30, () => NO_INPUT, s);
    expect(s.player.y).toBe(0);
    const d = stepSim(initState(ctx), { ...NO_INPUT, dodge: true, left: true }, ctx);
    expect(sceneOf(d, ctx).invulnerable).toBe(true);
    expect(d.player.x).toBeLessThan(160);
  });
});

describe('피하면 피격 수가 줄어든다', () => {
  const seconds = (n: number) => Math.round((n * 1000) / DT);

  it('플레이어 발밑 범위: 가만히 vs 전조 동안 걸어서 벗어나기', () => {
    const p = pat('area'); // 전조 500ms, 크기 160, at player
    const ctx = single(p);
    const still = runSim(ctx, seconds(10));
    expect(still.player.hits).toBeGreaterThanOrEqual(4);
    // 패턴마다 번갈아 왼쪽·오른쪽으로 걷는다 (벽에 막히지 않게)
    const walk = runSim(ctx, seconds(10), (_, s) => {
      const goRight = s.slot % 2 === 0;
      return { ...NO_INPUT, left: !goRight, right: goRight };
    });
    expect(walk.player.hits).toBeLessThan(still.player.hits);
    expect(walk.player.hits).toBe(0);
  });

  it('낮게 찌르기: 전조 끝에 점프하면 넘긴다', () => {
    const p = pat('thrust', {}, { length: 400 }); // 가까이 붙여 두려고 길게
    const ctx = { ...single(p), playerStartX: 960 - 160 - 32 - 60 };
    const still = runSim(ctx, seconds(8));
    expect(still.player.hits).toBeGreaterThan(0);
    const jumped = runSim(ctx, seconds(8), (_, s) => ({ ...NO_INPUT, jump: Math.abs(relOf(s, ctx) - (p.telegraphMs - 150)) < DT / 2 + 0.01 }));
    expect(jumped.player.hits).toBeLessThan(still.player.hits);
  });

  it('짧은 휘두르기: 공격 순간 회피(무적)로 넘긴다', () => {
    const p = pat('arc', { activeMs: 150 }); // 무적 200ms 안에 끝남
    const ctx = { ...single(p), playerStartX: 960 - 160 - 32 - 40 };
    const still = runSim(ctx, seconds(8));
    expect(still.player.hits).toBeGreaterThan(0);
    const rolled = runSim(ctx, seconds(8), (_, s) => ({ ...NO_INPUT, dodge: Math.abs(relOf(s, ctx) - (p.telegraphMs - 20)) < DT / 2 + 0.01 }));
    expect(rolled.player.hits).toBeLessThan(still.player.hits);
  });

  it('탄은 맞으면 사라지고 탄마다 한 번씩 센다', () => {
    const p = pat('projectile', {}, { count: 3, spreadDeg: 0, intervalMs: 150, aim: 'player', speed: 600 });
    const ctx = single(p);
    const s = runSim(ctx, Math.round(2500 / DT));
    expect(s.player.hits).toBe(3);
    expect(s.player.damage).toBe(30);
  });
});

describe('피할 수 있나 검사', () => {
  it('플레이어 발밑 범위(전조 500ms): 어느 거리든 맞을 수 있고 걸어서 피할 수 있다', () => {
    const r = dodgeCheck(pat('area'), boss);
    expect(r.map((x) => x.distance)).toEqual(['가까움', '중간', '멀음']);
    expect(r.every((x) => x.hitWhenStill && x.walk)).toBe(true);
  });

  it('전조가 0이면 걸어서는 못 피한다', () => {
    const r = dodgeCheck(pat('area', { telegraphMs: 0 }), boss);
    expect(r.every((x) => !x.walk)).toBe(true);
  });

  it('찌르기(길이 220)는 가까우면 맞고 점프로 넘길 수 있으며, 멀면 닿지 않는다', () => {
    const r = dodgeCheck(pat('thrust'), boss);
    expect(r[0]).toMatchObject({ distance: '가까움', hitWhenStill: true, jump: true });
    expect(r[2]).toMatchObject({ distance: '멀음', hitWhenStill: false });
  });

  it('긴 휘두르기는 무적 시간보다 길어 회피로 못 넘기고, 짧으면 넘긴다', () => {
    // 360° 휘두르기라 보스 뒤로 굴러 빠져나갈 수도 없다 (보스와 몸이 부딪히지 않으므로 앞쪽만 휘두르면 뒤로 굴러 피할 수 있다)
    expect(dodgeCheck(pat('arc', { activeMs: 1000 }, { radius: 300, angleDeg: 360 }), boss)[0].dodge).toBe(false);
    expect(dodgeCheck(pat('arc', { activeMs: 150 }), boss)[0].dodge).toBe(true);
  });
});
