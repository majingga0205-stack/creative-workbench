// 2D 패턴 미리보기 (횡스크롤). 계산은 src/core/boss의 stepSim, Canvas는 그리기만 한다.
import { useEffect, useMemo, useRef, useState } from 'react';
import { BOSS_H, BOSS_W, DT, SHAPE_LABELS, dodgeCheck, initState, makeContext, sceneOf, stepSim, type Scene, type Shape, type SimContext, type SimInput, type SimState } from '../../core/boss';
import type { Boss, Pattern, Phase } from '../../db/types';
import { Badge, Button, Card, Select } from '../../shared/ui';

const SPEEDS = [0.25, 0.5, 1, 1.5, 2];

type Status = { pattern?: string; shape?: string; part?: string; hits: number; damage: number; hp: number; invulnerable: boolean; seconds: number };

export function PreviewCard({ boss, phase }: { boss: Pick<Boss, 'arena' | 'player'>; phase: Phase }) {
  const [mode, setMode] = useState<string>('phase'); // 'phase' 또는 패턴 id
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [status, setStatus] = useState<Status>({ hits: 0, damage: 0, hp: boss.player.maxHp, invulnerable: false, seconds: 0 });
  const [played, setPlayed] = useState<string[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<SimState | null>(null);
  const held = useRef({ left: false, right: false });
  const pressed = useRef({ jump: false, dodge: false });

  const key = JSON.stringify([boss.arena, boss.player, phase.patterns, phase.sequence, phase.id, mode]);
  const ctx = useMemo<SimContext>(() => {
    const m = mode !== 'phase' && phase.patterns.some((p) => p.id === mode) ? { kind: 'pattern' as const, patternId: mode } : { kind: 'phase' as const, phase };
    return makeContext(boss, phase.patterns, m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const draw = () => {
    const s = stateRef.current;
    const c = canvas.current;
    if (!s || !c) return;
    const scene = sceneOf(s, ctx);
    drawScene(c, scene, ctx);
    setStatus({
      pattern: scene.current?.pattern.name,
      shape: scene.current ? SHAPE_LABELS[scene.current.pattern.shape] : undefined,
      part: scene.current?.part,
      hits: s.player.hits,
      damage: s.player.damage,
      hp: s.player.hp,
      invulnerable: scene.invulnerable,
      seconds: s.t / 1000,
    });
    if (scene.current) {
      const shape = SHAPE_LABELS[scene.current.pattern.shape];
      setPlayed((xs) => (xs.includes(shape) ? xs : [...xs, shape]));
    }
  };

  const reset = () => {
    stateRef.current = initState(ctx);
    setPlayed([]);
    draw();
  };

  useEffect(reset, [ctx]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = () => {
    const s = stateRef.current;
    if (!s) return;
    const input: SimInput = { left: held.current.left, right: held.current.right, jump: pressed.current.jump, dodge: pressed.current.dodge };
    pressed.current = { jump: false, dodge: false };
    stateRef.current = stepSim(s, input, ctx);
  };

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      acc += Math.min(100, now - last) * speed;
      last = now;
      let n = 0;
      while (acc >= DT && n < 12) {
        step();
        acc -= DT;
        n++;
      }
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, ctx]);

  const onKey = (down: boolean) => (e: React.KeyboardEvent) => {
    const k = e.code;
    if (k === 'KeyA' || k === 'ArrowLeft') held.current.left = down;
    else if (k === 'KeyD' || k === 'ArrowRight') held.current.right = down;
    else if ((k === 'KeyW' || k === 'ArrowUp') && down && !e.repeat) pressed.current.jump = true;
    else if (k === 'Space' && down && !e.repeat) pressed.current.dodge = true;
    else return;
    e.preventDefault();
  };

  if (!phase.patterns.length) return null;

  return (
    <Card
      title={`2D 미리보기 — ${phase.name} (횡스크롤)`}
      actions={
        <span className="flex flex-wrap items-center gap-1.5">
          <Select aria-label="재생할 것" className="!w-44 !py-1" value={mode} onChange={(e) => { setMode(e.target.value); setPlaying(false); }}>
            <option value="phase">페이즈 시퀀스</option>
            {phase.patterns.map((p) => <option key={p.id} value={p.id}>패턴 하나 반복: {p.name}</option>)}
          </Select>
          <Button size="sm" variant="primary" onClick={() => setPlaying(!playing)}>{playing ? '일시정지' : '재생'}</Button>
          <Button size="sm" disabled={playing} onClick={() => { step(); draw(); }}>한 프레임</Button>
          <Button size="sm" onClick={reset}>처음부터</Button>
          <Select aria-label="속도" className="!w-20 !py-1" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
          </Select>
        </span>
      }
    >
      <div
        tabIndex={0}
        role="application"
        aria-label="미리보기 조작: A·D 이동, W 점프, Space 회피"
        onKeyDown={onKey(true)}
        onKeyUp={onKey(false)}
        onBlur={() => (held.current = { left: false, right: false })}
        className="rounded-md outline-none focus:ring-2 focus:ring-teal-600"
        data-testid="preview-stage"
      >
        <canvas ref={canvas} className="block w-full rounded-md bg-stone-50" style={{ aspectRatio: `${boss.arena.width} / ${boss.arena.height}` }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" data-testid="preview-status">
        <span>지금: <b>{status.pattern ?? '—'}</b>{status.shape ? ` (${status.shape})` : ''} · {status.part ?? '—'}</span>
        <span>피격 <b data-testid="hit-count">{status.hits}</b>회 · 받은 피해 {status.damage} · 체력 {status.hp}/{boss.player.maxHp}</span>
        {status.invulnerable && <Badge tone="teal">무적</Badge>}
        <span className="text-xs text-stone-500">{status.seconds.toFixed(1)}초</span>
      </div>
      <p className="mt-1 text-xs text-stone-500">
        화면을 누르고 <b>A·D(←·→)</b> 이동, <b>W(↑)</b> 점프, <b>Space</b> 회피(구르기, 무적). 전조는 점선 윤곽, 공격은 칠한 범위예요. 재생한 모양: <span data-testid="played-shapes">{played.join(', ') || '—'}</span>
      </p>
      <DodgeTable boss={boss} patterns={phase.patterns} />
    </Card>
  );
}

// ───────────── 그리기 ─────────────

function drawScene(c: HTMLCanvasElement, scene: Scene, ctx: SimContext) {
  const W = ctx.arena.width;
  const H = ctx.arena.height;
  const ratio = window.devicePixelRatio || 1;
  const cssW = c.clientWidth || W;
  const scale = cssW / W;
  if (c.width !== Math.round(cssW * ratio)) {
    c.width = Math.round(cssW * ratio);
    c.height = Math.round(H * scale * ratio);
  }
  const g = c.getContext('2d');
  if (!g) return;
  g.setTransform(ratio * scale, 0, 0, ratio * scale, 0, 0);
  g.clearRect(0, 0, W, H);
  // 바닥
  g.fillStyle = '#e7e5e4';
  g.fillRect(0, H - 2, W, 2);
  const Y = (y: number) => H - y;

  const path = (s: Shape) => {
    g.beginPath();
    if (s.kind === 'rect') g.rect(s.x, Y(s.y + s.h), s.w, s.h);
    else if (s.kind === 'circle') g.arc(s.cx, Y(s.cy), s.r, 0, Math.PI * 2);
    else if (s.kind === 'sector') {
      g.moveTo(s.cx, Y(s.cy));
      g.arc(s.cx, Y(s.cy), s.r, -(s.mid + s.half), -(s.mid - s.half));
      g.closePath();
    } else {
      g.moveTo(s.x1, Y(s.y1));
      g.lineTo(s.x2, Y(s.y2));
    }
  };

  // 위험 범위: 전조 = 점선 윤곽, 공격 = 칠함
  for (const h of scene.hazards) {
    path(h.shape);
    if (h.phase === 'telegraph') {
      g.setLineDash([6, 4]);
      g.strokeStyle = 'rgba(217, 119, 6, 0.9)';
      g.lineWidth = 2;
      g.stroke();
      if (h.shape.kind !== 'line') {
        g.fillStyle = 'rgba(251, 191, 36, 0.15)';
        g.fill();
      }
      g.setLineDash([]);
    } else {
      g.fillStyle = 'rgba(220, 38, 38, 0.55)';
      g.fill();
      g.strokeStyle = 'rgba(153, 27, 27, 0.9)';
      g.lineWidth = 1;
      g.stroke();
    }
  }

  // 보스
  g.fillStyle = '#44403c';
  g.fillRect(scene.bossX - BOSS_W / 2, Y(BOSS_H), BOSS_W, BOSS_H);
  g.fillStyle = '#fafaf9';
  g.font = '12px Pretendard Variable, Pretendard, sans-serif';
  g.textAlign = 'center';
  g.fillText('보스', scene.bossX, Y(BOSS_H) + 16);

  // 플레이어
  const p = scene.player;
  g.fillStyle = scene.invulnerable ? 'rgba(13, 148, 136, 0.35)' : '#0d9488';
  g.fillRect(p.x, Y(p.y + p.h), p.w, p.h);
  if (scene.invulnerable) {
    g.strokeStyle = '#0f766e';
    g.lineWidth = 2;
    g.strokeRect(p.x, Y(p.y + p.h), p.w, p.h);
  }

  // 지금 패턴
  if (scene.current) {
    g.textAlign = 'left';
    g.fillStyle = '#292524';
    g.font = '14px Pretendard Variable, Pretendard, sans-serif';
    g.fillText(`${scene.current.pattern.name} · ${scene.current.part}`, 12, 22);
  }
}

/** 기획서 스냅샷용: 상태 하나를 그린 PNG 주소 */
export function renderSnapshot(state: SimState, ctx: SimContext, width = 480): string {
  const c = document.createElement('canvas');
  c.style.width = `${width}px`;
  Object.defineProperty(c, 'clientWidth', { value: width });
  drawScene(c, sceneOf(state, ctx), ctx);
  return c.toDataURL('image/png');
}

// ───────────── 피할 수 있나 ─────────────

function DodgeTable({ boss, patterns }: { boss: Pick<Boss, 'arena' | 'player'>; patterns: Pattern[] }) {
  const rows = useMemo(() => patterns.map((p) => ({ p, r: dodgeCheck(p, boss) })), [patterns, boss]);
  const mark = (ok: boolean) => (ok ? <span className="text-teal-700">✓</span> : <span className="text-red-700">✗</span>);
  return (
    <div className="mt-4">
      <div className="mb-1 text-sm font-medium text-stone-700">피할 수 있나 — 패턴 시작(전조 시작) 순간 그 거리에 서 있을 때</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm" data-testid="dodge-table">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
              <th className="py-1.5 font-medium">패턴 (의도한 대응)</th>
              {rows[0]?.r.map((x) => <th key={x.distance} className="py-1.5 font-medium">{x.distance} ({x.gapPx}px)</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, r }) => {
              const reach = r.filter((x) => x.hitWhenStill);
              const want = p.counter === '점프' ? 'jump' : p.counter === '회피' ? 'dodge' : null;
              const intendedFails = want && reach.length > 0 && !reach.some((x) => x[want]);
              return (
                <tr key={p.id} className="border-b border-stone-100 align-top">
                  <td className="py-1.5 pr-2">
                    <b>{p.name}</b> <span className="text-xs text-stone-500">({SHAPE_LABELS[p.shape]} · {p.counter})</span>
                    {intendedFails && <div className="text-xs text-orange-700">⚠ 의도한 대응({p.counter})으로는 어느 거리에서도 못 피해요</div>}
                  </td>
                  {r.map((x) => (
                    <td key={x.distance} className="py-1.5 text-xs">
                      {!x.hitWhenStill ? (
                        <span className="text-stone-400">닿지 않음</span>
                      ) : (
                        <span className="flex flex-wrap gap-x-2">
                          <span>걸어서 {mark(x.walk)}</span>
                          <span>회피 {mark(x.dodge)}</span>
                          <span>점프 {mark(x.jump)}</span>
                          {!x.walk && !x.dodge && !x.jump && <b className="text-red-700">못 피함</b>}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-xs text-stone-500">걸어서 = 전조 시작부터 한쪽으로 계속 걸음 · 회피 = 한 번 굴러 무적 시간으로 넘김 · 점프 = 한 번 뛰어 범위 위로 넘김. 보스와 몸은 부딪히지 않아요(보스 뒤로 굴러 빠져나갈 수 있음).</p>
    </div>
  );
}
