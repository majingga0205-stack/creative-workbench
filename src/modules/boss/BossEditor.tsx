// 보스 편집: 보스 정보, 긴장도 곡선, 페이즈 카드(끌어서 순서·복제), 패턴 타이밍 편집, 30초 타임라인
import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  DEFAULT_PARAMS,
  PARAM_CHOICES,
  PARAM_LABELS,
  SHAPE_LABELS,
  buildTimeline,
  duplicatePhase,
  newPattern,
  newPhase,
  patternWarnings,
  phaseSummary,
  reorderPhases,
  tensionCurve,
  type PressureSettings,
} from '../../core/boss';
import { deleteBoss, newId, saveBoss } from '../../db/repo';
import { PATTERN_COUNTERS, PATTERN_SHAPES, type Boss, type Character, type Pattern, type PatternShape, type Phase } from '../../db/types';
import { confirmDialog, toast } from '../../shared/dialogs';
import { useAutosave } from '../../shared/useAutosave';
import { Badge, Button, Card, Field, Input, SaveStatus, Select, TextArea } from '../../shared/ui';
import { C, ChartBox, LegendDot, TooltipBox, axisProps } from '../serial/charts';
import { NumberField, SEGMENT_STYLE, Timeline, TimingBar } from './parts';
import { PreviewCard } from './Preview';

export function BossEditor({ boss, characters, settings, onDeleted }: { boss: Boss; characters: Character[]; settings: PressureSettings; onDeleted: () => void }) {
  const [b, setB] = useState<Boss>(boss);
  const { status } = useAutosave(b, saveBoss, { valid: b.name.trim().length > 0 });
  const phases = useMemo(() => [...b.phases].sort((x, y) => x.order - y.order), [b.phases]);
  const [sel, setSel] = useState<string | null>(phases[0]?.id ?? null);
  const selPhase = phases.find((p) => p.id === sel);

  const setPhases = (f: (ps: Phase[]) => Phase[]) => setB((x) => ({ ...x, phases: f(x.phases) }));
  const updPhase = (id: string, patch: Partial<Phase>) => setPhases((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const addPhase = () => {
    const ph = newPhase(newId(), phases.length);
    setPhases((ps) => [...ps, ph]);
    setSel(ph.id);
  };

  const remove = async () => {
    if (await confirmDialog({ title: `보스 ‘${boss.name}’ 지우기`, message: `페이즈 ${b.phases.length}개와 패턴이 모두 지워져요. 되돌릴 수 없어요.`, confirmLabel: '지우기', danger: true })) {
      await deleteBoss(boss.id);
      toast(`보스를 지웠어요: ${boss.name}`);
      onDeleted();
    }
  };

  return (
    <div className="space-y-4">
      <Card title="보스 정보" actions={<SaveStatus status={status} />}>
        <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
          <Field label="보스 이름">
            <Input value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} />
          </Field>
          <Field label="보스 주인 (캐릭터)">
            <Select value={b.characterId ?? ''} onChange={(e) => setB({ ...b, characterId: e.target.value || undefined })}>
              <option value="">없음</option>
              {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-stone-600">아레나 · 플레이어 (횡스크롤, 8단계 미리보기와 압박도의 피해 비율에 씀)</summary>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            <NumberField label="아레나 폭" unit="px" min={100} value={b.arena.width} onChange={(n) => setB({ ...b, arena: { ...b.arena, width: n } })} />
            <NumberField label="아레나 높이" unit="px" min={100} value={b.arena.height} onChange={(n) => setB({ ...b, arena: { ...b.arena, height: n } })} />
            <NumberField label="최대 체력" min={1} value={b.player.maxHp} onChange={(n) => setB({ ...b, player: { ...b.player, maxHp: n } })} />
            <NumberField label="이동 속도" unit="px/s" value={b.player.speed} onChange={(n) => setB({ ...b, player: { ...b.player, speed: n } })} />
            <NumberField label="몸통 폭" unit="px" min={1} value={b.player.width} onChange={(n) => setB({ ...b, player: { ...b.player, width: n } })} />
            <NumberField label="몸통 높이" unit="px" min={1} value={b.player.height} onChange={(n) => setB({ ...b, player: { ...b.player, height: n } })} />
            <NumberField label="점프 높이" unit="px" value={b.player.jump.height} onChange={(n) => setB({ ...b, player: { ...b.player, jump: { ...b.player.jump, height: n } } })} />
            <NumberField label="체공 시간" unit="ms" value={b.player.jump.durationMs} onChange={(n) => setB({ ...b, player: { ...b.player, jump: { ...b.player.jump, durationMs: n } } })} />
            <NumberField label="회피 거리" unit="px" value={b.player.dodge.distance} onChange={(n) => setB({ ...b, player: { ...b.player, dodge: { ...b.player.dodge, distance: n } } })} />
            <NumberField label="회피 시간" unit="ms" value={b.player.dodge.durationMs} onChange={(n) => setB({ ...b, player: { ...b.player, dodge: { ...b.player.dodge, durationMs: n } } })} />
            <NumberField label="무적 시간" unit="ms" value={b.player.dodge.iframeMs} onChange={(n) => setB({ ...b, player: { ...b.player, dodge: { ...b.player.dodge, iframeMs: n } } })} />
            <NumberField label="회피 쿨다운" unit="ms" value={b.player.dodge.cooldownMs} onChange={(n) => setB({ ...b, player: { ...b.player, dodge: { ...b.player.dodge, cooldownMs: n } } })} />
          </div>
        </details>
      </Card>

      <TensionCurve boss={b} settings={settings} onIntend={(id, v) => updPhase(id, { gapIntended: v })} />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-800">페이즈 카드 <span className="text-xs font-normal text-stone-500">끌어서 순서를 바꿔요</span></h2>
          <Button size="sm" variant="primary" onClick={addPhase}>+ 페이즈</Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="phase-cards">
          {phases.map((ph, i) => (
            <PhaseCard
              key={ph.id}
              phase={ph}
              index={i}
              selected={ph.id === sel}
              maxHp={b.player.maxHp}
              settings={settings}
              onSelect={() => setSel(ph.id)}
              onChange={(patch) => updPhase(ph.id, patch)}
              onMove={(from, to) => setPhases((ps) => reorderPhases(ps, from, to))}
              onDuplicate={() => {
                const d = duplicatePhase(ph, newId, phases.length);
                setPhases((ps) => [...ps, d]);
                setSel(d.id);
              }}
              onDelete={async () => {
                if (await confirmDialog({ title: `‘${ph.name}’ 지우기`, message: `패턴 ${ph.patterns.length}개도 함께 지워져요.`, confirmLabel: '지우기', danger: true })) {
                  setPhases((ps) => ps.filter((p) => p.id !== ph.id).sort((x, y) => x.order - y.order).map((p, k) => ({ ...p, order: k })));
                  if (sel === ph.id) setSel(null);
                }
              }}
            />
          ))}
        </div>
      </div>

      {selPhase && <PatternEditor key={selPhase.id} phase={selPhase} settings={settings} onChange={(patch) => updPhase(selPhase.id, patch)} />}
      {selPhase && <PreviewCard boss={b} phase={selPhase} />}

      <div className="flex justify-end">
        <Button variant="danger" size="sm" onClick={remove}>보스 지우기</Button>
      </div>
    </div>
  );
}

// ───────────── 긴장도 곡선 ─────────────

function TensionCurve({ boss, settings, onIntend }: { boss: Boss; settings: PressureSettings; onIntend: (phaseId: string, v: boolean) => void }) {
  const curve = tensionCurve(boss, settings);
  if (!curve.length) return null;
  const data = curve.map((c) => ({ ...c, label: c.name, pressure: c.pressure === null ? null : Math.round(c.pressure * 10) / 10 }));
  type Pt = (typeof data)[number];
  const flagged = curve.filter((c) => c.flag);
  const Tick = ({ x, y, payload }: { x?: number; y?: number; payload?: { index: number } }) => {
    const p = data[payload?.index ?? 0];
    return (
      <g transform={`translate(${x},${y})`}>
        <text dy={14} textAnchor="middle" fontSize={11} fill="#44403c">{p?.name}</text>
        <text dy={28} textAnchor="middle" fontSize={11} fill="#78716c">{p?.emotion || ' '}</text>
      </g>
    );
  };
  const Dot = (color: string) => (props: { cx?: number; cy?: number; index?: number; payload?: Pt }) => {
    const p = props.payload;
    if (props.cx === undefined || props.cy === undefined || !p) return <g key={props.index} />;
    const warn = !!p.flag && !p.intendedGap;
    return (
      <g key={`${color}${props.index}`}>
        {warn && <circle cx={props.cx} cy={props.cy} r={10} fill="none" stroke={C.warn} strokeWidth={2} strokeDasharray="3 2" />}
        <circle cx={props.cx} cy={props.cy} r={5} fill={color} stroke="#fff" strokeWidth={2} />
      </g>
    );
  };
  return (
    <ChartBox
      title="긴장도 곡선"
      legend={
        <>
          <LegendDot color={C.s1} shape="line">의도한 긴장도</LegendDot>
          <LegendDot color={C.s2} shape="line">계산된 압박도</LegendDot>
          <span className="flex items-center gap-1"><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="6" fill="none" stroke={C.warn} strokeWidth="2" strokeDasharray="3 2" /></svg>⚠ {settings.gapThreshold} 이상 차이</span>
        </>
      }
    >
      <div className="h-64" data-testid="tension-curve">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 24, bottom: 20, left: -16 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="label" {...axisProps} tick={<Tick />} interval={0} height={40} />
            <YAxis {...axisProps} domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} />
            <Tooltip
              content={({ active, payload }) => {
                const p = active ? (payload?.[0]?.payload as Pt | undefined) : undefined;
                if (!p) return null;
                return (
                  <TooltipBox>
                    <div className="font-medium">{p.name}{p.emotion ? ` · ${p.emotion}` : ''}</div>
                    <div>의도한 긴장도 {p.intended}</div>
                    <div>압박도 {p.pressure ?? '— (패턴 없음)'}</div>
                    {p.flag && <div className="font-medium text-orange-700">⚠ {p.flag}{p.intendedGap ? ' (의도함)' : ''}</div>}
                  </TooltipBox>
                );
              }}
            />
            <Line dataKey="intended" stroke={C.s1} strokeWidth={2} dot={Dot(C.s1)} isAnimationActive={false} />
            <Line dataKey="pressure" stroke={C.s2} strokeWidth={2} dot={Dot(C.s2)} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {flagged.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm" data-testid="gap-list">
          {flagged.map((c) => (
            <li key={c.phaseId} className={`flex flex-wrap items-center gap-2 rounded px-2 py-1 ${c.intendedGap ? 'bg-stone-50 text-stone-500' : 'bg-orange-50 text-orange-900'}`}>
              <span>{c.intendedGap ? '' : '⚠ '}<b>{c.name}</b>{c.emotion ? ` (${c.emotion})` : ''}: {c.flag} — 의도 {c.intended}, 압박도 {c.pressure?.toFixed(1)}</span>
              <label className="ml-auto flex items-center gap-1 text-xs">
                <input type="checkbox" checked={c.intendedGap} onChange={(e) => onIntend(c.phaseId, e.target.checked)} /> 의도함 (감정은 높이되 압박은 낮추는 식)
              </label>
            </li>
          ))}
        </ul>
      )}
    </ChartBox>
  );
}

// ───────────── 페이즈 카드 ─────────────

function PhaseCard({
  phase,
  index,
  selected,
  maxHp,
  settings,
  onSelect,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
}: {
  phase: Phase;
  index: number;
  selected: boolean;
  maxHp: number;
  settings: PressureSettings;
  onSelect: () => void;
  onChange: (p: Partial<Phase>) => void;
  onMove: (from: number, to: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const s = phaseSummary(phase, maxHp, settings);
  const [over, setOver] = useState(false);
  return (
    <section
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/phase-index', String(index))}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const from = Number(e.dataTransfer.getData('text/phase-index'));
        if (Number.isFinite(from) && from !== index) onMove(from, index);
      }}
      onClick={onSelect}
      aria-label={`페이즈 카드 ${phase.name}`}
      className={`cursor-grab rounded-lg border bg-white p-3 ${selected ? 'border-teal-600 ring-1 ring-teal-600' : 'border-stone-200'} ${over ? 'outline-2 outline-dashed outline-teal-500' : ''}`}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-xs font-semibold text-stone-400">{index + 1}</span>
        <Input aria-label="페이즈 이름" className="!py-1 font-medium" value={phase.name} onChange={(e) => onChange({ name: e.target.value })} />
        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onDuplicate(); }} title="복제">복제</Button>
        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="지우기">✕</Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input aria-label="감정" className="!py-1" placeholder="감정 (예: 부정)" value={phase.emotion} onChange={(e) => onChange({ emotion: e.target.value })} />
        <Input aria-label="무기" className="!py-1" placeholder="무기" value={phase.weapon} onChange={(e) => onChange({ weapon: e.target.value })} />
      </div>
      <TextArea aria-label="서사 메모" rows={2} className="mt-2 !py-1 text-sm" placeholder="이 페이즈가 전할 감정과, 그걸 메커닉으로 어떻게 보여주나" value={phase.narrative} onChange={(e) => onChange({ narrative: e.target.value })} />
      <div className="mt-2 grid grid-cols-[1fr_1fr_2fr] gap-2">
        <NumberField label="체력 시작" unit="%" max={100} value={phase.hpFrom} onChange={(n) => onChange({ hpFrom: n })} />
        <NumberField label="체력 끝" unit="%" max={100} value={phase.hpTo} onChange={(n) => onChange({ hpTo: n })} />
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-stone-500">전환 조건·연출</span>
          <Input aria-label="전환 조건" className="!py-1" value={phase.transition} onChange={(e) => onChange({ transition: e.target.value })} />
        </label>
      </div>
      <label className="mt-2 block">
        <span className="flex justify-between text-[11px] text-stone-500"><span>의도한 긴장도</span><b className="text-stone-700">{phase.intendedTension}</b></span>
        <input aria-label="의도한 긴장도" type="range" min={0} max={10} step={0.5} value={phase.intendedTension} onChange={(e) => onChange({ intendedTension: Number(e.target.value) })} className="w-full accent-teal-700" />
      </label>
      <div className="mt-1 flex flex-wrap gap-1">
        {phase.patterns.map((p) => (
          <span key={p.id} className="rounded-full bg-stone-100 px-2 py-0.5 text-xs" title={p.line ? `대사: ${p.line}` : undefined}>
            {p.name}
          </span>
        ))}
        {!phase.patterns.length && <span className="text-xs text-stone-400">패턴 없음 — 카드를 누르고 아래에서 더해요</span>}
      </div>
      {phase.patterns.some((p) => p.line) && (
        <ul className="mt-1 space-y-0.5 text-xs text-stone-600">
          {phase.patterns.filter((p) => p.line).map((p) => <li key={p.id}>“{p.line}”</li>)}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-stone-100 pt-2 text-xs text-stone-600" data-testid="phase-summary">
        <span>패턴 {s.patternCount}개</span>
        <span>평균 후딜 {s.avgRecoveryMs === null ? '—' : `${Math.round(s.avgRecoveryMs)}ms`}</span>
        <span>압박도 <b className="text-stone-800">{s.pressure === null ? '—' : s.pressure.toFixed(1)}</b></span>
        {s.warnings.length > 0 && <Badge tone="amber">⚠ 경고 {s.warnings.length}</Badge>}
      </div>
    </section>
  );
}

// ───────────── 패턴 타이밍 편집 ─────────────

function PatternEditor({ phase, settings, onChange }: { phase: Phase; settings: PressureSettings; onChange: (p: Partial<Phase>) => void }) {
  const scale = Math.max(3000, ...phase.patterns.map((p) => p.telegraphMs + p.activeMs + p.recoveryMs + p.cooldownMs));
  const weightOf = (id: string) => phase.sequence.find((x) => x.patternId === id)?.weight ?? 0;
  const setPatterns = (patterns: Pattern[]) => onChange({ patterns });
  const upd = (id: string, patch: Partial<Pattern>) => setPatterns(phase.patterns.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const setWeight = (id: string, w: number) =>
    onChange({ sequence: [...phase.sequence.filter((x) => x.patternId !== id), ...(w > 0 ? [{ patternId: id, weight: w }] : [])] });
  const add = (shape: PatternShape) => {
    const p = newPattern(newId(), shape);
    onChange({ patterns: [...phase.patterns, p], sequence: [...phase.sequence, { patternId: p.id, weight: 1 }] });
  };
  const nameOf = (id: string) => phase.patterns.find((p) => p.id === id)?.name ?? '?';

  return (
    <Card
      title={`패턴 타이밍 — ${phase.name}`}
      actions={
        <span className="flex flex-wrap gap-1">
          {PATTERN_SHAPES.map((s) => (
            <Button key={s} size="sm" onClick={() => add(s)}>+ {SHAPE_LABELS[s]}</Button>
          ))}
        </span>
      }
    >
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-stone-600">
        {SEGMENT_STYLE.map((s) => <span key={s.key} className="flex items-center gap-1"><span className={`inline-block h-3 w-3 rounded-sm ${s.cls}`} />{s.label}</span>)}
        <span>막대 전체 = {(scale / 1000).toFixed(1)}초 · 구간 오른쪽 끝을 끌거나(10ms 단위) 숫자를 넣어요</span>
      </div>
      <div className="space-y-3" data-testid="pattern-editor">
        {phase.patterns.map((p) => {
          const warns = patternWarnings(p, settings);
          return (
            <div key={p.id} className="rounded-md border border-stone-200 p-3">
              <div className="flex flex-wrap items-end gap-2">
                <label className="block w-36">
                  <span className="mb-0.5 block text-[11px] text-stone-500">패턴 이름</span>
                  <Input aria-label="패턴 이름" className="!py-1" value={p.name} onChange={(e) => upd(p.id, { name: e.target.value })} />
                </label>
                <label className="block w-28">
                  <span className="mb-0.5 block text-[11px] text-stone-500">모양</span>
                  <Select aria-label="모양" className="!py-1" value={p.shape} onChange={(e) => upd(p.id, { shape: e.target.value as PatternShape, params: { ...DEFAULT_PARAMS[e.target.value as PatternShape] } })}>
                    {PATTERN_SHAPES.map((s) => <option key={s} value={s}>{SHAPE_LABELS[s]}</option>)}
                  </Select>
                </label>
                <label className="block w-24">
                  <span className="mb-0.5 block text-[11px] text-stone-500">대응</span>
                  <Select aria-label="대응" className="!py-1" value={p.counter} onChange={(e) => upd(p.id, { counter: e.target.value as Pattern['counter'] })}>
                    {PATTERN_COUNTERS.map((c) => <option key={c}>{c}</option>)}
                  </Select>
                </label>
                <NumberField className="w-20" label="피해" value={p.damage} onChange={(n) => upd(p.id, { damage: n })} />
                <NumberField className="w-20" label="출현 비중" value={weightOf(p.id)} onChange={(n) => setWeight(p.id, n)} />
                <label className="block min-w-40 flex-1">
                  <span className="mb-0.5 block text-[11px] text-stone-500">대사 (패턴 전)</span>
                  <Input aria-label="대사" className="!py-1" value={p.line ?? ''} onChange={(e) => upd(p.id, { line: e.target.value || undefined })} />
                </label>
                <Button size="sm" variant="ghost" onClick={() => onChange({ patterns: phase.patterns.filter((x) => x.id !== p.id), sequence: phase.sequence.filter((x) => x.patternId !== p.id) })}>빼기</Button>
              </div>
              <div className="mt-3"><TimingBar pattern={p} scaleMs={scale} onChange={(patch) => upd(p.id, patch)} /></div>
              <div className="mt-2 grid grid-cols-4 gap-2">
                <NumberField label="전조" unit="ms" value={p.telegraphMs} onChange={(n) => upd(p.id, { telegraphMs: n })} />
                <NumberField label="공격" unit="ms" value={p.activeMs} onChange={(n) => upd(p.id, { activeMs: n })} />
                <NumberField label="후딜" unit="ms" value={p.recoveryMs} onChange={(n) => upd(p.id, { recoveryMs: n })} />
                <NumberField label="쿨다운" unit="ms" value={p.cooldownMs} onChange={(n) => upd(p.id, { cooldownMs: n })} />
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-stone-500">{SHAPE_LABELS[p.shape]} 값 (8단계 미리보기에 씀)</summary>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {Object.entries(p.params).map(([k, v]) =>
                    PARAM_CHOICES[k] ? (
                      <label key={k} className="block">
                        <span className="mb-0.5 block text-[11px] text-stone-500">{PARAM_LABELS[k] ?? k}</span>
                        <Select aria-label={PARAM_LABELS[k] ?? k} className="!py-1" value={String(v)} onChange={(e) => upd(p.id, { params: { ...p.params, [k]: e.target.value } })}>
                          {PARAM_CHOICES[k].map((c) => <option key={c}>{c}</option>)}
                        </Select>
                      </label>
                    ) : (
                      <NumberField key={k} label={PARAM_LABELS[k] ?? k} min={-100000} value={Number(v)} onChange={(n) => upd(p.id, { params: { ...p.params, [k]: n } })} />
                    ),
                  )}
                </div>
              </details>
              {warns.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-orange-800">
                  {warns.map((w) => <li key={w.kind}>⚠ {w.message}</li>)}
                </ul>
              )}
            </div>
          );
        })}
        {!phase.patterns.length && <p className="text-sm text-stone-500">위 버튼으로 패턴을 더하세요.</p>}
      </div>
      <div className="mt-4">
        <div className="mb-1 text-sm font-medium text-stone-700">페이즈 타임라인 (30초, 출현 비중대로 · 고정 시드라 매번 같은 배열)</div>
        <Timeline slots={buildTimeline(phase)} nameOf={nameOf} />
      </div>
    </Card>
  );
}
