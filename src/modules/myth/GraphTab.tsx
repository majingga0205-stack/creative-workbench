// 존재 간 관계 그래프: 인물 네트워크의 그래프 부품을 다시 쓴다. 존재(육각형) 위에 현재 작품의 캐릭터(원)를 겹친다.
import { useState } from 'react';
import { deleteBeingRelation, newId, saveBeingRelation } from '../../db/repo';
import type { Being, BeingRelation, Character } from '../../db/types';
import { NetworkGraph, type GraphEdge, type GraphNode } from '../../shared/NetworkGraph';
import { confirmDialog } from '../../shared/dialogs';
import { Button, Card, Input, Select } from '../../shared/ui';
import { SourceRows } from './BeingsTab';

const BEING = '#257de0';
const CHARACTER = '#f47230';

export function GraphTab({ beings, relations, characters }: { beings: Being[]; relations: BeingRelation[]; characters: Character[] }) {
  const linked = characters.filter((c) => c.archetypeId && beings.some((b) => b.id === c.archetypeId));
  const nodes: GraphNode[] = [
    ...beings.map((b) => ({ id: b.id, label: b.name, size: 46, color: BEING, shape: 'hexagon' as const })),
    ...linked.map((c) => ({ id: `ch:${c.id}`, label: c.name, size: 30, color: CHARACTER, shape: 'ellipse' as const })),
  ];
  const edges: GraphEdge[] = [
    ...relations.filter((r) => beings.some((b) => b.id === r.fromId) && beings.some((b) => b.id === r.toId)).map((r) => ({ id: r.id, source: r.fromId, target: r.toId, width: 3, label: r.label })),
    ...linked.map((c) => ({ id: `link:${c.id}`, source: `ch:${c.id}`, target: c.archetypeId!, width: 1.5, dashed: true })),
  ];
  return (
    <div className="space-y-4">
      <figure className="rounded-lg border border-stone-200 bg-white p-3">
        <NetworkGraph nodes={nodes} edges={edges} height={420} />
        <figcaption className="mt-2 flex flex-wrap gap-4 text-xs text-stone-600">
          <span className="flex items-center gap-1.5"><svg width="14" height="12" aria-hidden="true"><polygon points="3,0 11,0 14,6 11,12 3,12 0,6" fill={BEING} /></svg> 신화 존재</span>
          <span className="flex items-center gap-1.5"><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="6" fill={CHARACTER} /></svg> 이 작품의 캐릭터 (점선 = 기대는 원형)</span>
          <span>실선 = 존재 간 관계</span>
        </figcaption>
      </figure>
      <RelationsEditor beings={beings} relations={relations} />
    </div>
  );
}

function RelationsEditor({ beings, relations }: { beings: Being[]; relations: BeingRelation[] }) {
  const [from, setFrom] = useState(beings[0]?.id ?? '');
  const [to, setTo] = useState(beings[1]?.id ?? '');
  const [label, setLabel] = useState('');
  const nameOf = (id: string) => beings.find((b) => b.id === id)?.name ?? '(지운 존재)';
  return (
    <Card title="존재 관계">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!from || !to || from === to) return;
          void saveBeingRelation({ id: newId(), fromId: from, toId: to, label: label.trim(), sources: [] });
          setLabel('');
        }}
      >
        <Select aria-label="관계 시작 존재" className="!w-40" value={from} onChange={(e) => setFrom(e.target.value)}>
          {beings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        —
        <Select aria-label="관계 끝 존재" className="!w-40" value={to} onChange={(e) => setTo(e.target.value)}>
          {beings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Input aria-label="관계 라벨" className="!w-56" placeholder="관계 (자유 입력)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Button type="submit" disabled={!from || !to || from === to}>관계 추가</Button>
      </form>
      <ul className="mt-3 space-y-2">
        {relations.map((r) => (
          <li key={r.id} className="rounded-md border border-stone-200 p-2 text-sm">
            <RelationRow r={r} nameOf={nameOf} />
          </li>
        ))}
        {!relations.length && <li className="text-sm text-stone-500">관계가 없어요. 관계 라벨은 자유 입력이고 출처를 달 수 있어요.</li>}
      </ul>
    </Card>
  );
}

function RelationRow({ r, nameOf }: { r: BeingRelation; nameOf: (id: string) => string }) {
  const [label, setLabel] = useState(r.label);
  const [open, setOpen] = useState(false);
  const save = (patch: Partial<BeingRelation>) => saveBeingRelation({ ...r, ...patch });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <b>{nameOf(r.fromId)}</b> — <b>{nameOf(r.toId)}</b>
        <Input aria-label="라벨" className="!w-56 !py-1" value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => label !== r.label && save({ label: label.trim() })} />
        <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>출처 {r.sources.length}</Button>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={async () => (await confirmDialog({ title: '관계 지우기', message: '되돌릴 수 없어요.', confirmLabel: '지우기', danger: true })) && deleteBeingRelation(r.id)}>지우기</Button>
      </div>
      {open && <SourceRows sources={r.sources} onChange={(sources) => save({ sources })} />}
    </div>
  );
}
