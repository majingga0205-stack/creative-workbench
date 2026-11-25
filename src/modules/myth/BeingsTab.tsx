// 존재 목록·편집: 원형 요소 체크리스트(범주별, 가중치·출처·검증 배지)와 고증 함정
import { useState } from 'react';
import { deleteBeing, newId, saveBeing } from '../../db/repo';
import { ELEMENT_CATEGORIES, LINT_SOURCE_TYPES, type ArchetypeElement, type Being, type LintSource, type Trap } from '../../db/types';
import { WEIGHT_LABEL } from '../../core/archetype';
import { confirmDialog, toast } from '../../shared/dialogs';
import { useAutosave } from '../../shared/useAutosave';
import { Badge, Button, Card, Empty, Field, Input, SaveStatus, Select, TextArea, parseList } from '../../shared/ui';

export function BeingsTab({ beings }: { beings: Being[] }) {
  const [selected, setSelected] = useState<string | null>(beings[0]?.id ?? null);
  const [name, setName] = useState('');
  const current = beings.find((b) => b.id === selected);

  const add = async () => {
    if (!name.trim()) return;
    const b: Being = { id: newId(), name: name.trim(), aliases: [], summary: '', elements: [], traps: [], updatedAt: new Date().toISOString() };
    await saveBeing(b);
    setName('');
    setSelected(b.id);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <div className="space-y-2">
        <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <Input aria-label="새 존재 이름" placeholder="새 존재 이름" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" variant="primary" disabled={!name.trim()}>추가</Button>
        </form>
        <ul className="space-y-1" aria-label="존재 목록">
          {beings.map((b) => (
            <li key={b.id}>
              <button type="button" onClick={() => setSelected(b.id)} className={`w-full rounded-md px-3 py-2 text-left text-sm ${selected === b.id ? 'bg-white shadow-sm ring-1 ring-stone-200' : 'hover:bg-stone-200/60'}`}>
                <div className="font-medium">{b.name}</div>
                <div className="text-xs text-stone-500">요소 {b.elements.length}개 · 함정 {b.traps.length}개 · 검증 {b.elements.filter((e) => e.verified).length}/{b.elements.length}</div>
              </button>
            </li>
          ))}
        </ul>
        <p className="px-1 text-xs text-stone-500">시드(구미호·도깨비·산군)는 널리 알려진 특징만 적은 예시라 전부 미검증이고 출처가 비어 있어요. 『한국민속대백과사전』 등에서 확인한 뒤 채우세요.</p>
      </div>
      <div className="min-w-0">{current ? <BeingForm key={current.id} being={current} onDeleted={() => setSelected(null)} /> : <Empty title="존재를 고르세요" />}</div>
    </div>
  );
}

function BeingForm({ being, onDeleted }: { being: Being; onDeleted: () => void }) {
  const [b, setB] = useState<Being>(being);
  const [aliases, setAliases] = useState(being.aliases.join(', '));
  const value: Being = { ...b, name: b.name.trim(), aliases: parseList(aliases) };
  const { status } = useAutosave(value, saveBeing, { valid: value.name.length > 0 });
  const [open, setOpen] = useState<string | null>(null);

  const setEl = (id: string, patch: Partial<ArchetypeElement>) => setB((x) => ({ ...x, elements: x.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  const setTrap = (id: string, patch: Partial<Trap>) => setB((x) => ({ ...x, traps: x.traps.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const addEl = () => {
    const e: ArchetypeElement = { id: newId(), label: '새 요소', category: '외형', weight: 'common', keywords: [], opposite: [], sources: [], verified: false };
    setB((x) => ({ ...x, elements: [...x.elements, e] }));
    setOpen(e.id);
  };
  const remove = async () => {
    if (await confirmDialog({ title: `존재 ‘${being.name}’ 지우기`, message: '이 존재가 들어간 관계를 지우고, 연결된 캐릭터(모든 작품)의 연결과 요소 선택을 풀어요. 되돌릴 수 없어요.', confirmLabel: '지우기', danger: true })) {
      await deleteBeing(being.id);
      toast(`존재를 지웠어요: ${being.name}`);
      onDeleted();
    }
  };

  return (
    <div className="space-y-4">
      <Card title={`존재 · ${being.name}`} actions={<SaveStatus status={status} />}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="이름">
            <Input value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} />
          </Field>
          <Field label="별칭" hint="쉼표로 구분">
            <Input value={aliases} onChange={(e) => setAliases(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="요약">
              <TextArea rows={2} value={b.summary} onChange={(e) => setB({ ...b, summary: e.target.value })} />
            </Field>
          </div>
        </div>
      </Card>

      <Card title="원형 요소 체크리스트" actions={<Button size="sm" onClick={addEl}>+ 요소 추가</Button>}>
        <div className="space-y-4" data-testid="element-list">
          {ELEMENT_CATEGORIES.filter((cat) => b.elements.some((e) => e.category === cat)).map((cat) => (
            <div key={cat}>
              <div className="mb-1 text-xs font-semibold text-stone-500">{cat}</div>
              <ul className="space-y-1">
                {b.elements.filter((e) => e.category === cat).map((e) => (
                  <li key={e.id} className="rounded-md border border-stone-200">
                    <button type="button" className="flex w-full flex-wrap items-center gap-1.5 px-3 py-2 text-left text-sm" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}>
                      <span className="font-medium">{e.label}</span>
                      <span className="flex-1" />
                      <Badge tone={e.weight === 'core' ? 'teal' : 'stone'}>{WEIGHT_LABEL[e.weight]}</Badge>
                      {e.sources.some((s) => s.title.trim()) ? <Badge>출처 {e.sources.length}</Badge> : <Badge tone="amber">출처 없음</Badge>}
                      {e.verified ? <Badge tone="teal">검증됨</Badge> : <Badge>미검증</Badge>}
                    </button>
                    {open === e.id && <ElementEditor e={e} onChange={(p) => setEl(e.id, p)} onRemove={() => setB((x) => ({ ...x, elements: x.elements.filter((y) => y.id !== e.id) }))} />}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!b.elements.length && <p className="text-sm text-stone-500">요소가 없어요.</p>}
        </div>
      </Card>

      <Card
        title="고증 함정"
        actions={
          <Button size="sm" onClick={() => setB((x) => ({ ...x, traps: [...x.traps, { id: newId(), claim: '', correction: '', triggerWords: [], sources: [], verified: false }] }))}>
            + 함정 추가
          </Button>
        }
      >
        <div className="space-y-3">
          {b.traps.map((t) => (
            <div key={t.id} className="space-y-2 rounded-md border border-stone-200 p-3">
              <Field label="흔한 오해">
                <TextArea rows={2} value={t.claim} onChange={(e) => setTrap(t.id, { claim: e.target.value })} />
              </Field>
              <Field label="바로잡은 내용">
                <TextArea rows={2} value={t.correction} onChange={(e) => setTrap(t.id, { correction: e.target.value })} />
              </Field>
              <ListInput label="트리거 낱말" hint="캐릭터 특성·메모에 나오면 경고 (쉼표)" value={t.triggerWords} onChange={(v) => setTrap(t.id, { triggerWords: v })} />
              <SourceRows sources={t.sources} onChange={(sources) => setTrap(t.id, { sources, verified: false })} />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={t.verified} onChange={(e) => setTrap(t.id, { verified: e.target.checked })} /> 원문에서 직접 확인함
                </label>
                <Button size="sm" variant="ghost" onClick={() => setB((x) => ({ ...x, traps: x.traps.filter((y) => y.id !== t.id) }))}>함정 빼기</Button>
              </div>
            </div>
          ))}
          {!b.traps.length && <p className="text-sm text-stone-500">함정이 없어요.</p>}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button variant="danger" size="sm" onClick={remove}>존재 지우기</Button>
      </div>
    </div>
  );
}

function ElementEditor({ e, onChange, onRemove }: { e: ArchetypeElement; onChange: (p: Partial<ArchetypeElement>) => void; onRemove: () => void }) {
  return (
    <div className="space-y-2 border-t border-stone-200 bg-stone-50 p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="요소">
          <Input value={e.label} onChange={(x) => onChange({ label: x.target.value })} />
        </Field>
        <Field label="범주">
          <Select value={e.category} onChange={(x) => onChange({ category: x.target.value as ArchetypeElement['category'] })}>
            {ELEMENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="가중치">
          <Select value={e.weight} onChange={(x) => onChange({ weight: x.target.value as ArchetypeElement['weight'] })}>
            <option value="core">핵심 (3)</option>
            <option value="common">흔함 (2)</option>
            <option value="variant">일부 판본 (1)</option>
          </Select>
        </Field>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <ListInput label="알아볼 말 (keywords)" hint="캐릭터 특성에 있으면 ‘가져옴’ 제안" value={e.keywords} onChange={(v) => onChange({ keywords: v })} />
        <ListInput label="어긋나는 말 (opposite)" hint="캐릭터 특성에 있으면 ‘충돌’ 제안" value={e.opposite} onChange={(v) => onChange({ opposite: v })} />
      </div>
      <SourceRows sources={e.sources} onChange={(sources) => onChange({ sources, verified: false })} />
      <Field label="메모">
        <Input value={e.note ?? ''} onChange={(x) => onChange({ note: x.target.value || undefined })} />
      </Field>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={e.verified} onChange={(x) => onChange({ verified: x.target.checked })} /> 원문에서 직접 확인함 <span className="text-xs text-stone-500">(출처를 고치면 꺼져요)</span>
        </label>
        <Button size="sm" variant="ghost" onClick={onRemove}>요소 빼기</Button>
      </div>
    </div>
  );
}

/** 쉼표 목록 입력 (입력하는 동안은 글 그대로, 칸을 떠날 때 목록으로) */
function ListInput({ label, hint, value, onChange }: { label: string; hint?: string; value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value.join(', '));
  return (
    <Field label={label} hint={hint}>
      <Input value={text} onChange={(x) => { setText(x.target.value); onChange(parseList(x.target.value)); }} />
    </Field>
  );
}

export function SourceRows({ sources, onChange }: { sources: LintSource[]; onChange: (s: LintSource[]) => void }) {
  const set = (k: number, p: Partial<LintSource>) => onChange(sources.map((s, j) => (j === k ? { ...s, ...p } : s)));
  return (
    <div className="space-y-1.5">
      <div className="text-[13px] font-medium text-stone-600">출처</div>
      {sources.map((s, k) => (
        <div key={k} className="grid gap-1.5 sm:grid-cols-[2fr_1fr_80px_1.5fr_110px_auto]">
          <Input aria-label={`출처 ${k + 1} 제목`} placeholder="제목" value={s.title} onChange={(x) => set(k, { title: x.target.value })} />
          <Input aria-label={`출처 ${k + 1} 저자`} placeholder="저자" value={s.author ?? ''} onChange={(x) => set(k, { author: x.target.value || undefined })} />
          <Input aria-label={`출처 ${k + 1} 연도`} placeholder="연도" value={s.year ?? ''} onChange={(x) => set(k, { year: x.target.value || undefined })} />
          <Input aria-label={`출처 ${k + 1} 위치`} placeholder="위치 (항목·쪽)" value={s.locator ?? ''} onChange={(x) => set(k, { locator: x.target.value || undefined })} />
          <Select aria-label={`출처 ${k + 1} 종류`} value={s.type} onChange={(x) => set(k, { type: x.target.value as LintSource['type'] })}>
            {LINT_SOURCE_TYPES.map((t) => <option key={t}>{t}</option>)}
          </Select>
          <Button size="sm" variant="ghost" onClick={() => onChange(sources.filter((_, j) => j !== k))}>빼기</Button>
        </div>
      ))}
      <Button size="sm" onClick={() => onChange([...sources, { title: '', type: '사전' }])}>+ 출처 추가</Button>
    </div>
  );
}
