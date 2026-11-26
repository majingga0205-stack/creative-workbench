// 보스 기획서: 인쇄용 A4 가로 페이지 (표지 · 긴장도 곡선 · 페이즈 카드와 패턴 표 · 타이밍 막대 · 전조/공격 장면 스냅샷)
// PDF는 브라우저 인쇄로, PNG는 html-to-image로 페이지마다 저장한다.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toPng } from 'html-to-image';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { BOSS_W, DT, SHAPE_LABELS, makeContext, phaseSummary, runSim, tensionCurve, type PressureSettings } from '../../core/boss';
import type { Boss, Character, Pattern, Phase } from '../../db/types';
import { toast } from '../../shared/dialogs';
import { Button } from '../../shared/ui';
import { C } from '../serial/charts';
import { renderSnapshot } from './Preview';
import { SEGMENT_STYLE } from './parts';

export function BossPlan({ boss, workTitle, characters, settings, onClose }: { boss: Boss; workTitle: string; characters: Character[]; settings: PressureSettings; onClose: () => void }) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const phases = [...boss.phases].sort((a, b) => a.order - b.order);
  const owner = characters.find((c) => c.id === boss.characterId)?.name;

  useEffect(() => {
    document.body.classList.add('plan-open');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('plan-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const savePngs = async () => {
    const pages = [...(pagesRef.current?.querySelectorAll<HTMLElement>('.plan-page') ?? [])];
    setBusy(true);
    try {
      for (let i = 0; i < pages.length; i++) {
        const url = await toPng(pages[i], { pixelRatio: 2, backgroundColor: '#ffffff', skipFonts: true });
        const a = document.createElement('a');
        a.href = url;
        a.download = `기획서-${boss.name.replace(/[\\/:*?"<>|\s]+/g, '_')}-${String(i + 1).padStart(2, '0')}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      toast(`기획서 PNG ${pages.length}장을 저장했어요`);
    } catch (e) {
      toast(`PNG를 만들지 못했어요: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="plan-root fixed inset-0 z-50 overflow-auto bg-stone-300 p-6" role="dialog" aria-label="보스 기획서" data-testid="boss-plan">
      <div className="plan-toolbar sticky top-0 z-10 mx-auto mb-4 flex max-w-[297mm] items-center gap-2 rounded-lg bg-white px-4 py-2 shadow">
        <b className="text-sm">기획서 미리보기 — A4 가로 {2 + phases.length * 2}쪽</b>
        <span className="flex-1" />
        <Button size="sm" variant="primary" onClick={() => window.print()}>인쇄 · PDF로 저장</Button>
        <Button size="sm" onClick={savePngs} disabled={busy}>{busy ? 'PNG 만드는 중…' : 'PNG 일괄 저장'}</Button>
        <Button size="sm" variant="ghost" onClick={onClose}>닫기</Button>
      </div>
      <div ref={pagesRef} className="flex flex-col items-center gap-6">
        <Page>
          <div className="flex h-full flex-col justify-center">
            <p className="text-sm tracking-widest text-stone-500">보스 기획서</p>
            <h1 className="mt-2 text-5xl font-bold">{boss.name}</h1>
            <p className="mt-4 text-lg text-stone-600">「{workTitle}」{owner ? ` · 보스 주인: ${owner}` : ''}</p>
            <table className="mt-10 w-[70%] text-sm">
              <thead>
                <tr className="border-b border-stone-300 text-left text-xs text-stone-500">
                  <th className="py-1">페이즈</th><th>감정</th><th>무기</th><th>체력</th><th className="text-right">의도한 긴장도</th><th className="text-right">압박도</th><th className="text-right">패턴</th>
                </tr>
              </thead>
              <tbody>
                {phases.map((ph, i) => {
                  const s = phaseSummary(ph, boss.player.maxHp, settings);
                  return (
                    <tr key={ph.id} className="border-b border-stone-100">
                      <td className="py-1">{i + 1}. {ph.name}</td><td>{ph.emotion}</td><td>{ph.weapon}</td><td>{ph.hpFrom}~{ph.hpTo}%</td>
                      <td className="text-right">{ph.intendedTension}</td><td className="text-right">{s.pressure?.toFixed(1) ?? '—'}</td><td className="text-right">{s.patternCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-auto text-xs text-stone-400">창작 작업대 · {new Date().toLocaleDateString('ko-KR')} · 횡스크롤 · 아레나 {boss.arena.width}×{boss.arena.height}px · 플레이어 체력 {boss.player.maxHp}</p>
          </div>
        </Page>
        <Page title="긴장도 곡선">
          <CurveStatic boss={boss} settings={settings} />
        </Page>
        {phases.map((ph, i) => (
          <PhasePages key={ph.id} phase={ph} index={i} boss={boss} settings={settings} />
        ))}
      </div>
    </div>,
    document.body,
  );
}

function Page({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="plan-page shadow-lg">
      {title && <h2 className="mb-4 border-b border-stone-200 pb-2 text-xl font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

function CurveStatic({ boss, settings }: { boss: Boss; settings: PressureSettings }) {
  const data = tensionCurve(boss, settings).map((c) => ({ ...c, label: `${c.name}${c.emotion ? ` · ${c.emotion}` : ''}`, pressure: c.pressure === null ? null : Math.round(c.pressure * 10) / 10 }));
  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-stone-600">
        <span><span className="mr-1 inline-block h-0.5 w-4 align-middle" style={{ background: C.s1 }} />의도한 긴장도</span>
        <span><span className="mr-1 inline-block h-0.5 w-4 align-middle" style={{ background: C.s2 }} />계산된 압박도</span>
      </div>
      <LineChart width={1000} height={420} data={data} margin={{ top: 10, right: 30, bottom: 10, left: 0 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#44403c' }} interval={0} />
        <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fontSize: 12, fill: '#78716c' }} />
        <Line dataKey="intended" stroke={C.s1} strokeWidth={2} isAnimationActive={false} dot={{ r: 5, fill: C.s1 }} />
        <Line dataKey="pressure" stroke={C.s2} strokeWidth={2} isAnimationActive={false} connectNulls dot={{ r: 5, fill: C.s2 }} />
      </LineChart>
      <ul className="mt-2 space-y-0.5 text-sm">
        {data.filter((d) => d.flag).map((d) => (
          <li key={d.phaseId}>{d.intendedGap ? '' : '⚠ '}{d.name}: {d.flag} — 의도 {d.intended}, 압박도 {d.pressure}{d.intendedGap ? ' (의도함)' : ''}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-stone-500">압박도 = 10 × ({settings.weights.D}·D + {settings.weights.R}·R + {settings.weights.H}·H + {settings.weights.P}·P)</p>
    </div>
  );
}

function PhasePages({ phase, index, boss, settings }: { phase: Phase; index: number; boss: Boss; settings: PressureSettings }) {
  const s = phaseSummary(phase, boss.player.maxHp, settings);
  const weightOf = (id: string) => phase.sequence.find((x) => x.patternId === id)?.weight ?? 0;
  const scale = Math.max(3000, ...phase.patterns.map((p) => p.telegraphMs + p.activeMs + p.recoveryMs + p.cooldownMs));
  return (
    <>
      <Page title={`${index + 1}. ${phase.name}${phase.emotion ? ` — ${phase.emotion}` : ''}`}>
        <div className="grid grid-cols-[1fr_260px] gap-6 text-sm">
          <div>
            <p className="whitespace-pre-wrap leading-relaxed">{phase.narrative || '서사 메모 없음'}</p>
          </div>
          <dl className="grid grid-cols-[90px_1fr] gap-y-1 text-[13px]">
            <dt className="text-stone-500">무기</dt><dd>{phase.weapon || '—'}</dd>
            <dt className="text-stone-500">체력 구간</dt><dd>{phase.hpFrom}~{phase.hpTo}%</dd>
            <dt className="text-stone-500">전환</dt><dd>{phase.transition || '—'}</dd>
            <dt className="text-stone-500">의도한 긴장도</dt><dd>{phase.intendedTension}</dd>
            <dt className="text-stone-500">압박도</dt><dd>{s.pressure?.toFixed(1) ?? '—'}</dd>
            <dt className="text-stone-500">평균 후딜</dt><dd>{s.avgRecoveryMs === null ? '—' : `${Math.round(s.avgRecoveryMs)}ms`}</dd>
          </dl>
        </div>
        <table className="mt-5 w-full text-[12px]">
          <thead>
            <tr className="border-b border-stone-300 text-left text-stone-500">
              <th className="py-1">패턴</th><th>모양</th><th>대응</th><th className="text-right">전조</th><th className="text-right">공격</th><th className="text-right">후딜</th><th className="text-right">쿨다운</th><th className="text-right">피해</th><th className="text-right">비중</th><th className="pl-3">대사</th>
            </tr>
          </thead>
          <tbody>
            {phase.patterns.map((p) => (
              <tr key={p.id} className="border-b border-stone-100">
                <td className="py-1">{p.name}</td><td>{SHAPE_LABELS[p.shape]}</td><td>{p.counter}</td>
                <td className="text-right">{p.telegraphMs}</td><td className="text-right">{p.activeMs}</td><td className="text-right">{p.recoveryMs}</td><td className="text-right">{p.cooldownMs}</td>
                <td className="text-right">{p.damage}</td><td className="text-right">{weightOf(p.id)}</td><td className="pl-3">{p.line ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-5 space-y-2">
          <div className="flex gap-3 text-[11px] text-stone-600">
            {SEGMENT_STYLE.map((x) => <span key={x.key}><span className={`mr-1 inline-block h-2.5 w-2.5 ${x.cls}`} />{x.label}</span>)}
            <span>막대 전체 = {(scale / 1000).toFixed(1)}초</span>
          </div>
          {phase.patterns.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <span className="w-28 truncate text-[12px]">{p.name}</span>
              <div className="flex h-4 flex-1 overflow-hidden rounded-sm bg-stone-100">
                {SEGMENT_STYLE.map((x) => <div key={x.key} className={x.cls} style={{ width: `${(p[x.key] / scale) * 100}%` }} />)}
              </div>
            </div>
          ))}
        </div>
        {s.warnings.length > 0 && <ul className="mt-3 text-[12px] text-orange-800">{s.warnings.map((w, k) => <li key={k}>⚠ {phase.patterns.find((p) => p.id === w.patternId)?.name}: {w.message}</li>)}</ul>}
      </Page>
      <Page title={`${index + 1}. ${phase.name} — 패턴 장면 (전조 · 공격)`}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          {phase.patterns.map((p) => <PatternShots key={p.id} pattern={p} boss={boss} />)}
        </div>
        {!phase.patterns.length && <p className="text-sm text-stone-500">패턴 없음</p>}
      </Page>
    </>
  );
}

function PatternShots({ pattern, boss }: { pattern: Pattern; boss: Boss }) {
  const shots = useMemo(() => {
    const ctx = makeContext(boss, [pattern], { kind: 'pattern', patternId: pattern.id }, 60_000);
    ctx.playerStartX = ctx.bossHomeX - BOSS_W / 2 - 140 - boss.player.width / 2;
    const at = (ms: number) => renderSnapshot(runSim(ctx, Math.max(1, Math.round(ms / DT))), ctx, 230);
    return { telegraph: at(pattern.telegraphMs * 0.6), active: at(pattern.telegraphMs + Math.max(120, pattern.activeMs) * 0.5) };
  }, [pattern, boss]);
  return (
    <figure>
      <figcaption className="mb-1 text-[12px]"><b>{pattern.name}</b> <span className="text-stone-500">({SHAPE_LABELS[pattern.shape]} · {pattern.counter})</span>{pattern.line ? <span className="text-stone-600"> “{pattern.line}”</span> : null}</figcaption>
      <div className="grid grid-cols-2 gap-2">
        <div><img src={shots.telegraph} alt={`${pattern.name} 전조`} className="w-full rounded border border-stone-200" /><div className="text-center text-[10px] text-stone-500">전조</div></div>
        <div><img src={shots.active} alt={`${pattern.name} 공격`} className="w-full rounded border border-stone-200" /><div className="text-center text-[10px] text-stone-500">공격</div></div>
      </div>
    </figure>
  );
}
