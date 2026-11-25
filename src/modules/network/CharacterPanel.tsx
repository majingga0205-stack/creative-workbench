// 노드를 누르면 보이는 캐릭터 카드: 등장 회차, 중심성, 관계 목록과 수동 보정
import { useEffect, useState } from 'react';
import { CENTRALITY_LABELS, pairKey, type Centrality, type CentralityKey, type NetworkData, type NetworkNode } from '../../core/network';
import { setEdgeLabel, setEdgeOverride } from '../../db/repo';
import type { Character, NetworkEdit } from '../../db/types';
import { Badge, Button, Card, Input } from '../../shared/ui';

export function CharacterPanel({
  workId,
  character,
  node,
  data,
  centrality,
  rankBy,
  characters,
  edits,
  onOpenCard,
}: {
  workId: string;
  character: Character;
  node: NetworkNode;
  data: NetworkData;
  centrality: Centrality;
  rankBy: Record<CentralityKey, Map<string, number>>;
  characters: Character[];
  edits: NetworkEdit[];
  onOpenCard: () => void;
}) {
  const others = characters.filter((c) => c.id !== character.id);
  return (
    <Card title={`캐릭터 · ${character.name}`} actions={<Button size="sm" variant="ghost" onClick={onOpenCard}>캐릭터 카드 열기</Button>}>
      <div className="space-y-3 text-sm" data-testid="character-panel">
        {character.aliases.length > 0 && <p className="text-stone-600">별칭: {character.aliases.join(', ')}</p>}
        {character.traits.length > 0 && <p className="text-stone-600">특성: {character.traits.join(', ')}</p>}
        <p>
          등장 장면 {node.scenes}개 · 등장 회차{' '}
          <span className="tabular-nums">{node.chapters.length ? node.chapters.map((n) => `${n}화`).join(', ') : '없음'}</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(CENTRALITY_LABELS) as CentralityKey[]).map((k) => (
            <Badge key={k}>
              {CENTRALITY_LABELS[k].label} {rankBy[k].get(character.id)}위
            </Badge>
          ))}
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-stone-500">관계 (라벨·보정은 다시 계산해도 유지)</div>
          <ul className="max-h-72 space-y-1 overflow-auto">
            {others.map((o) => (
              <RelationRow key={o.id} workId={workId} a={character.id} other={o} data={data} edits={edits} />
            ))}
          </ul>
        </div>
        <p className="text-xs text-stone-500">근접 {centrality.closeness.toFixed(3)} · 매개 {centrality.betweenness.toFixed(3)} · 연결 정도 {centrality.degree}</p>
      </div>
    </Card>
  );
}

function RelationRow({ workId, a, other, data, edits }: { workId: string; a: string; other: Character; data: NetworkData; edits: NetworkEdit[] }) {
  const edge = data.edges.find((e) => pairKey(e.a, e.b) === pairKey(a, other.id));
  const mine = edits.filter((e) => pairKey(e.a, e.b) === pairKey(a, other.id));
  const override = mine.find((e) => e.action !== 'label')?.action;
  const savedLabel = mine.find((e) => e.action === 'label')?.label ?? '';
  const [label, setLabel] = useState(savedLabel);
  useEffect(() => setLabel(savedLabel), [savedLabel]);

  return (
    <li className={`flex flex-wrap items-center gap-1.5 rounded-md px-2 py-1 ${edge ? 'bg-stone-50' : ''}`}>
      <span className="w-20 truncate font-medium">{other.name}</span>
      <span className="w-24 text-xs text-stone-500 tabular-nums">
        {edge ? (edge.manual ? '직접 더함' : `함께 ${edge.scenes}장면`) : override === 'remove' ? '직접 뺌' : '관계 없음'}
      </span>
      <Input
        aria-label={`${other.name} 관계 라벨`}
        className="!w-28 !py-0.5 text-xs"
        placeholder="라벨 (가족 등)"
        value={label}
        disabled={!edge}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => label !== savedLabel && setEdgeLabel(workId, a, other.id, label)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {override ? (
        <Button size="sm" variant="ghost" onClick={() => setEdgeOverride(workId, a, other.id, null)}>
          보정 취소
        </Button>
      ) : edge ? (
        <Button size="sm" variant="ghost" onClick={() => setEdgeOverride(workId, a, other.id, 'remove')}>
          간선 빼기
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setEdgeOverride(workId, a, other.id, 'add')}>
          간선 더하기
        </Button>
      )}
    </li>
  );
}
