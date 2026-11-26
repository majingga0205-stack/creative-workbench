// 보스 패턴 시뮬레이션 (SPEC 모듈 E '2D 패턴 미리보기', 횡스크롤).
// 1/60초 고정 스텝 함수: (상태, 조작) → 다음 상태. 난수는 타임라인의 고정 시드뿐이라 같은 입력이면 같은 결과다.
// 좌표: x는 오른쪽, y는 바닥(0)에서 위로. 그리기(Canvas)는 화면 쪽에서 y를 뒤집는다.
import type { Boss, Pattern, Phase } from '../../db/types';
import { buildTimeline } from './pressure';

export const DT = 1000 / 60;
export const BOSS_W = 64;
export const BOSS_H = 96;
/** 탄·휘두르기·찌르기가 나오는 높이 (보스 몸 기준) */
const MUZZLE_Y = BOSS_H * 0.6;
const ARC_Y = BOSS_H * 0.55;
const THRUST_Y = BOSS_H * 0.5;

export type Rect = { kind: 'rect'; x: number; y: number; w: number; h: number };
export type Circle = { kind: 'circle'; cx: number; cy: number; r: number };
/** 부채꼴: 가운데 각 mid, 반쪽 폭 half (라디안, y 위쪽 기준 반시계) */
export type Sector = { kind: 'sector'; cx: number; cy: number; r: number; mid: number; half: number };
export type Line = { kind: 'line'; x1: number; y1: number; x2: number; y2: number };
export type Shape = Rect | Circle | Sector | Line;

export type Slot = { index: number; patternId: string; start: number; end: number };

/** 패턴이 시작할 때(전조 시작) 찍어 두는 값: 플레이어를 노리는 패턴은 이 순간의 위치를 쓴다 */
export type Snapshot = { slot: number; patternId: string; start: number; facing: -1 | 1; targetX: number; aim: number };

export type SimContext = {
  arena: Boss['arena'];
  player: Boss['player'];
  patterns: Map<string, Pattern>;
  slots: Slot[];
  bossHomeX: number;
  playerStartX: number;
};

export type SimMode = { kind: 'pattern'; patternId: string } | { kind: 'phase'; phase: Pick<Phase, 'id' | 'patterns' | 'sequence'> };

const cycleOf = (p: Pattern) => p.telegraphMs + p.activeMs + p.recoveryMs + p.cooldownMs;

/** 시뮬레이션 준비: 패턴 하나 반복이면 주기를 이어 붙이고, 페이즈 시퀀스면 고정 시드 타임라인을 쓴다 */
export function makeContext(boss: Pick<Boss, 'arena' | 'player'>, patterns: Pattern[], mode: SimMode, durationMs = 10 * 60 * 1000): SimContext {
  const map = new Map(patterns.map((p) => [p.id, p]));
  let slots: Slot[] = [];
  if (mode.kind === 'pattern') {
    const p = map.get(mode.patternId);
    if (p) {
      const c = Math.max(1, cycleOf(p));
      for (let t = 0, i = 0; t < durationMs; t += c, i++) slots.push({ index: i, patternId: p.id, start: t, end: t + c });
    }
  } else {
    slots = buildTimeline(mode.phase, durationMs).map((s, i) => ({ index: i, patternId: s.patternId, start: s.start, end: s.end }));
  }
  return { arena: boss.arena, player: boss.player, patterns: map, slots, bossHomeX: boss.arena.width - 160, playerStartX: 160 };
}

// ───────────── 겹침 판정 ─────────────

const rectRect = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function circleRect(c: Circle, r: Rect) {
  const nx = Math.max(r.x, Math.min(c.cx, r.x + r.w));
  const ny = Math.max(r.y, Math.min(c.cy, r.y + r.h));
  return (c.cx - nx) ** 2 + (c.cy - ny) ** 2 <= c.r * c.r;
}

const angleDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

function inSector(s: Sector, x: number, y: number) {
  const dx = x - s.cx;
  const dy = y - s.cy;
  return dx * dx + dy * dy <= s.r * s.r && angleDiff(Math.atan2(dy, dx), s.mid) <= s.half;
}

/** 부채꼴과 직사각형: 직사각형의 모서리·변 가운데·중심 9곳 중 하나라도 부채꼴 안이거나, 부채꼴 중심이 직사각형 안이면 겹침 */
function sectorRect(s: Sector, r: Rect) {
  if (s.cx >= r.x && s.cx <= r.x + r.w && s.cy >= r.y && s.cy <= r.y + r.h) return true;
  for (const fx of [0, 0.5, 1]) for (const fy of [0, 0.5, 1]) if (inSector(s, r.x + fx * r.w, r.y + fy * r.h)) return true;
  return false;
}

export function overlaps(shape: Shape, r: Rect): boolean {
  switch (shape.kind) {
    case 'rect':
      return rectRect(shape, r);
    case 'circle':
      return circleRect(shape, r);
    case 'sector':
      return sectorRect(shape, r);
    case 'line':
      return false;
  }
}

// ───────────── 패턴의 판정 도형 ─────────────

const num = (p: Pattern, k: string, d: number) => {
  const v = Number(p.params[k]);
  return Number.isFinite(v) ? v : d;
};
const str = (p: Pattern, k: string, d: string) => (typeof p.params[k] === 'string' ? (p.params[k] as string) : d);

/** 탄 방향들 (라디안) */
function bulletAngles(p: Pattern, snap: Snapshot): number[] {
  const count = Math.max(0, Math.floor(num(p, 'count', 1)));
  const spread = (num(p, 'spreadDeg', 0) * Math.PI) / 180;
  const fixed = (num(p, 'angleDeg', 180) * Math.PI) / 180;
  const aim = str(p, 'aim', 'player');
  return Array.from({ length: count }, (_, k) => {
    if (aim === 'spiral') return fixed + k * spread;
    const base = aim === 'player' ? snap.aim : fixed;
    return count > 1 ? base - spread / 2 + (k * spread) / (count - 1) : base;
  });
}

/** 돌진하는 보스의 x (전조 동안 제자리 → 공격 동안 이동 → 후딜 동안 도착한 곳 → 쿨다운엔 제자리로) */
export function bossXAt(p: Pattern | undefined, snap: Snapshot | undefined, rel: number, ctx: SimContext): number {
  if (!p || !snap || p.shape !== 'dash') return ctx.bossHomeX;
  const T = p.telegraphMs;
  const A = Math.max(1, p.activeMs);
  const dist = num(p, 'distance', 300) * snap.facing;
  if (rel < T) return ctx.bossHomeX;
  if (rel < T + A) return ctx.bossHomeX + (dist * (rel - T)) / A;
  if (rel < T + A + p.recoveryMs) return ctx.bossHomeX + dist;
  return ctx.bossHomeX;
}

export type Hazard = { key: string; shape: Shape; phase: 'telegraph' | 'active' };

/** 탄이 아레나를 벗어날 때까지 걸리는 최대 시간 */
function flightMs(p: Pattern, ctx: SimContext) {
  const speed = Math.max(1, num(p, 'speed', 400));
  return (Math.hypot(ctx.arena.width, ctx.arena.height) / speed) * 1000;
}

/** 이 패턴이 시작 후 rel ms일 때 위험한 범위 (전조는 윤곽, 공격은 판정) */
export function patternHazards(p: Pattern, snap: Snapshot, rel: number, ctx: SimContext): Hazard[] {
  const T = p.telegraphMs;
  const A = p.activeMs;
  const phase: Hazard['phase'] | null = rel < 0 ? null : rel < T ? 'telegraph' : rel < T + A ? 'active' : null;
  const f = snap.facing;
  const bx = ctx.bossHomeX;
  const front = bx + (f * BOSS_W) / 2;
  const key = String(snap.slot);
  const out: Hazard[] = [];

  switch (p.shape) {
    case 'projectile': {
      const angles = bulletAngles(p, snap);
      const speed = num(p, 'speed', 400);
      const radius = num(p, 'radius', 8);
      const interval = num(p, 'intervalMs', 0);
      if (rel >= 0 && rel < T) for (const a of angles) out.push({ key, phase: 'telegraph', shape: { kind: 'line', x1: bx, y1: MUZZLE_Y, x2: bx + Math.cos(a) * 140, y2: MUZZLE_Y + Math.sin(a) * 140 } });
      angles.forEach((a, k) => {
        const emit = T + k * interval;
        if (rel < emit) return;
        const d = (speed * (rel - emit)) / 1000;
        const cx = bx + Math.cos(a) * d;
        const cy = MUZZLE_Y + Math.sin(a) * d;
        if (cx < -radius || cx > ctx.arena.width + radius || cy < -radius || cy > ctx.arena.height + radius) return;
        out.push({ key: `${snap.slot}:${k}`, phase: 'active', shape: { kind: 'circle', cx, cy, r: radius } });
      });
      return out;
    }
    case 'arc': {
      if (!phase) return out;
      const facing = str(p, 'direction', 'player') === 'player' ? f : -1;
      const half = (num(p, 'angleDeg', 120) * Math.PI) / 360;
      out.push({ key, phase, shape: { kind: 'sector', cx: bx, cy: ARC_Y, r: num(p, 'radius', 140), mid: facing > 0 ? 0 : Math.PI, half } });
      return out;
    }
    case 'thrust': {
      if (!phase) return out;
      const len = num(p, 'length', 220);
      const w = num(p, 'width', 40);
      out.push({ key, phase, shape: { kind: 'rect', x: f > 0 ? front : front - len, y: THRUST_Y - w / 2, w: len, h: w } });
      return out;
    }
    case 'area': {
      if (!phase) return out;
      const size = num(p, 'size', 160);
      const cx = str(p, 'at', 'player') === 'player' ? snap.targetX : bx;
      const shape: Shape = str(p, 'form', 'rect') === 'circle' ? { kind: 'circle', cx, cy: 0, r: size / 2 } : { kind: 'rect', x: cx - size / 2, y: 0, w: size, h: size * 0.8 };
      out.push({ key, phase, shape });
      return out;
    }
    case 'dash': {
      if (!phase) return out;
      const w = num(p, 'width', BOSS_W);
      const dist = num(p, 'distance', 300) * f;
      if (phase === 'telegraph') {
        const x0 = Math.min(bx, bx + dist) - w / 2;
        out.push({ key, phase, shape: { kind: 'rect', x: x0, y: 0, w: Math.abs(dist) + w, h: BOSS_H } });
      } else {
        const x = bossXAt(p, snap, rel, ctx);
        out.push({ key, phase, shape: { kind: 'rect', x: x - w / 2, y: 0, w, h: BOSS_H } });
      }
      return out;
    }
  }
}

/** 이 패턴의 위험이 남아 있는 시간 (탄은 날아가는 동안) */
export function lifetimeMs(p: Pattern, ctx: SimContext) {
  return p.shape === 'projectile' ? p.telegraphMs + Math.max(0, num(p, 'count', 1) - 1) * num(p, 'intervalMs', 0) + flightMs(p, ctx) : cycleOf(p);
}

// ───────────── 상태와 스텝 ─────────────

export type PlayerState = {
  x: number;
  y: number;
  facing: -1 | 1;
  jumpStart: number | null;
  dodgeStart: number | null;
  dodgeDir: -1 | 1;
  dodgeReadyAt: number;
  hp: number;
  hits: number;
  damage: number;
};

export type SimState = { t: number; player: PlayerState; slot: number; snapshots: Snapshot[]; hitKeys: string[] };

/** 이번 스텝의 조작. jump·dodge는 이번 스텝에 눌렀을 때만 true */
export type SimInput = { left: boolean; right: boolean; jump: boolean; dodge: boolean };
export const NO_INPUT: SimInput = { left: false, right: false, jump: false, dodge: false };

export const playerRect = (p: Pick<PlayerState, 'x' | 'y'>, ctx: SimContext): Rect => ({ kind: 'rect', x: p.x - ctx.player.width / 2, y: p.y, w: ctx.player.width, h: ctx.player.height });

function snapshotFor(slot: Slot, player: PlayerState, ctx: SimContext): Snapshot {
  const facing: -1 | 1 = player.x < ctx.bossHomeX ? -1 : 1;
  const aim = Math.atan2(player.y + ctx.player.height / 2 - MUZZLE_Y, player.x - ctx.bossHomeX);
  return { slot: slot.index, patternId: slot.patternId, start: slot.start, facing, targetX: player.x, aim };
}

export function initState(ctx: SimContext): SimState {
  const player: PlayerState = { x: ctx.playerStartX, y: 0, facing: 1, jumpStart: null, dodgeStart: null, dodgeDir: 1, dodgeReadyAt: 0, hp: ctx.player.maxHp, hits: 0, damage: 0 };
  const first = ctx.slots[0];
  return { t: 0, player, slot: first ? 0 : -1, snapshots: first ? [snapshotFor(first, player, ctx)] : [], hitKeys: [] };
}

export const isInvulnerable = (p: PlayerState, t: number, ctx: SimContext) => p.dodgeStart !== null && t - p.dodgeStart < ctx.player.dodge.iframeMs;

/** 1/60초 고정 스텝: (상태, 조작) → 다음 상태. 입력 상태는 바꾸지 않는다. */
export function stepSim(state: SimState, input: SimInput, ctx: SimContext): SimState {
  const t0 = state.t;
  const t1 = t0 + DT;
  const cfg = ctx.player;
  const p: PlayerState = { ...state.player };

  // 회피(구르기): 쿨다운이 끝났으면 시작. 방향은 누르고 있는 쪽, 없으면 바라보는 쪽
  if (p.dodgeStart !== null && t0 - p.dodgeStart >= cfg.dodge.durationMs) p.dodgeStart = null;
  if (input.dodge && p.dodgeStart === null && t0 >= p.dodgeReadyAt) {
    p.dodgeStart = t0;
    p.dodgeDir = input.right && !input.left ? 1 : input.left && !input.right ? -1 : p.facing;
    p.dodgeReadyAt = t0 + cfg.dodge.cooldownMs;
  }
  // 점프: 땅에 있을 때만
  if (input.jump && p.jumpStart === null) p.jumpStart = t0;

  // 좌우 이동 (구르는 동안은 구르기 속도)
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir) p.facing = dir > 0 ? 1 : -1;
  const dx = p.dodgeStart !== null && cfg.dodge.durationMs > 0 ? (p.dodgeDir * cfg.dodge.distance * DT) / cfg.dodge.durationMs : (dir * cfg.speed * DT) / 1000;
  p.x = Math.min(ctx.arena.width - cfg.width / 2, Math.max(cfg.width / 2, p.x + dx));

  // 점프 높이: 체공 시간 동안 포물선
  if (p.jumpStart !== null) {
    const s = cfg.jump.durationMs > 0 ? (t1 - p.jumpStart) / cfg.jump.durationMs : 1;
    if (s >= 1) {
      p.y = 0;
      p.jumpStart = null;
    } else p.y = 4 * cfg.jump.height * s * (1 - s);
  }

  // 패턴 진행: 새 패턴이 시작되면 그 순간 플레이어 위치를 찍어 둔다
  let slot = state.slot;
  let snapshots = state.snapshots;
  while (slot + 1 < ctx.slots.length && ctx.slots[slot + 1].start <= t1) {
    slot++;
    snapshots = [...snapshots, snapshotFor(ctx.slots[slot], p, ctx)];
  }
  snapshots = snapshots.filter((s) => {
    const pat = ctx.patterns.get(s.patternId);
    return pat && t1 - s.start < lifetimeMs(pat, ctx);
  });

  // 피격: 회피 무적이 아니면, 아직 맞지 않은 판정마다 한 번
  let hitKeys = state.hitKeys;
  if (!isInvulnerable(p, t1, ctx)) {
    const body = playerRect(p, ctx);
    for (const s of snapshots) {
      const pat = ctx.patterns.get(s.patternId)!;
      for (const h of patternHazards(pat, s, t1 - s.start, ctx)) {
        if (h.phase !== 'active' || hitKeys.includes(h.key) || !overlaps(h.shape, body)) continue;
        hitKeys = [...hitKeys, h.key];
        p.hits++;
        p.damage += pat.damage;
        p.hp = Math.max(0, p.hp - pat.damage);
      }
    }
  }
  const alive = new Set(snapshots.map((s) => String(s.slot)));
  hitKeys = hitKeys.filter((k) => alive.has(k.split(':')[0]));

  return { t: t1, player: p, slot, snapshots, hitKeys };
}

/** 여러 스텝을 한 번에 (조작은 스텝 번호로 고른다) */
export function runSim(ctx: SimContext, steps: number, inputAt: (step: number, s: SimState) => SimInput = () => NO_INPUT, from = initState(ctx)): SimState {
  let s = from;
  for (let i = 0; i < steps; i++) s = stepSim(s, inputAt(i, s), ctx);
  return s;
}

export type Scene = {
  bossX: number;
  player: Rect;
  invulnerable: boolean;
  airborne: boolean;
  hazards: Hazard[];
  current?: { pattern: Pattern; part: '전조' | '공격' | '후딜' | '쿨다운'; slot: number };
};

/** 그리기용 장면: 보스·플레이어 위치, 전조 윤곽과 공격 판정(맞은 탄은 빼고), 지금 패턴과 구간 */
export function sceneOf(state: SimState, ctx: SimContext): Scene {
  const hit = new Set(state.hitKeys);
  const hazards = state.snapshots.flatMap((s) => patternHazards(ctx.patterns.get(s.patternId)!, s, state.t - s.start, ctx)).filter((h) => !(h.phase === 'active' && h.key.includes(':') && hit.has(h.key)));
  const curSnap = state.snapshots.find((s) => s.slot === state.slot);
  const pat = curSnap ? ctx.patterns.get(curSnap.patternId) : undefined;
  let current: Scene['current'];
  if (pat && curSnap) {
    const rel = state.t - curSnap.start;
    const part = rel < pat.telegraphMs ? '전조' : rel < pat.telegraphMs + pat.activeMs ? '공격' : rel < pat.telegraphMs + pat.activeMs + pat.recoveryMs ? '후딜' : '쿨다운';
    current = { pattern: pat, part, slot: state.slot };
  }
  return {
    bossX: bossXAt(pat, curSnap, curSnap ? state.t - curSnap.start : 0, ctx),
    player: playerRect(state.player, ctx),
    invulnerable: isInvulnerable(state.player, state.t, ctx),
    airborne: state.player.y > 0,
    hazards,
    current,
  };
}

// ───────────── 피할 수 있나 ─────────────

export type DodgeDistance = '가까움' | '중간' | '멀음';
export const DODGE_GAPS: Record<DodgeDistance, number> = { 가까움: 20, 중간: 200, 멀음: 400 };

export type DodgeCheck = {
  distance: DodgeDistance;
  /** 보스 몸 앞쪽과 플레이어 몸 사이 가로 거리 */
  gapPx: number;
  /** 가만히 있으면 맞나 (안 맞으면 나머지는 모두 ✓) */
  hitWhenStill: boolean;
  /** ① 전조 시작부터 한쪽으로 걸어서 피할 수 있나 */
  walk: boolean;
  /** ② 회피 무적(구르기)으로 넘길 수 있나 */
  dodge: boolean;
  /** ③ 점프로 판정 위를 넘길 수 있나 */
  jump: boolean;
};

/**
 * 패턴 하나를 가까움·중간·멀음 거리에서 기하 계산으로 판정한다.
 * 패턴 시작(전조 시작) 순간 플레이어가 그 자리에 서 있다고 보고, 1/60초 간격으로 위험 범위와 겹치는지 본다.
 */
export function dodgeCheck(p: Pattern, boss: Pick<Boss, 'arena' | 'player'>): DodgeCheck[] {
  const ctx = makeContext(boss, [p], { kind: 'pattern', patternId: p.id }, 1);
  const cfg = boss.player;
  const horizon = p.shape === 'projectile' ? lifetimeMs(p, ctx) : p.telegraphMs + p.activeMs;
  const times: number[] = [];
  for (let t = 0; t <= horizon; t += DT) times.push(t);
  const front = ctx.bossHomeX - BOSS_W / 2;
  const clampX = (x: number) => Math.min(boss.arena.width - cfg.width / 2, Math.max(cfg.width / 2, x));

  return (Object.keys(DODGE_GAPS) as DodgeDistance[]).map((distance) => {
    const gapPx = DODGE_GAPS[distance];
    const x0 = clampX(front - gapPx - cfg.width / 2);
    const start: PlayerState = { x: x0, y: 0, facing: 1, jumpStart: null, dodgeStart: null, dodgeDir: -1, dodgeReadyAt: 0, hp: cfg.maxHp, hits: 0, damage: 0 };
    const snap = snapshotFor({ index: 0, patternId: p.id, start: 0, end: 1 }, start, ctx);
    const hitAt = (x: number, y: number, t: number) => patternHazards(p, snap, t, ctx).some((h) => h.phase === 'active' && overlaps(h.shape, playerRect({ x, y }, ctx)));

    const hitWhenStill = times.some((t) => hitAt(x0, 0, t));
    if (!hitWhenStill) return { distance, gapPx, hitWhenStill, walk: true, dodge: true, jump: true };

    const walk = ([-1, 1] as const).some((d) => times.every((t) => !hitAt(clampX(x0 + (d * cfg.speed * t) / 1000), 0, t)));

    const starts = times.filter((_, i) => i % 2 === 0);
    const dodge = ([-1, 1] as const).some((d) =>
      starts.some((s) =>
        times.every((t) => {
          if (t >= s && t < s + cfg.dodge.iframeMs) return true;
          const k = t < s ? 0 : Math.min(1, (t - s) / Math.max(1, cfg.dodge.durationMs));
          return !hitAt(clampX(x0 + d * cfg.dodge.distance * k), 0, t);
        }),
      ),
    );

    const jump = starts.some((s) =>
      times.every((t) => {
        const k = (t - s) / Math.max(1, cfg.jump.durationMs);
        const y = k > 0 && k < 1 ? 4 * cfg.jump.height * k * (1 - k) : 0;
        return !hitAt(x0, y, t);
      }),
    );

    return { distance, gapPx, hitWhenStill, walk, dodge, jump };
  });
}
