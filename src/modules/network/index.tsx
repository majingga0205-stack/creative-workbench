// 인물 네트워크 (SPEC 모듈 B)
import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { readSetting } from '../../db/meta';
import type { Character, NetworkEdit } from '../../db/types';
import {
  CENTRALITY_LABELS,
  aggregate,
  applyEdits,
  batchExperiment,
  computeCentrality,
  describeRemoval,
  novelSource,
  pairKey,
  presenceWarnings,
  ranks,
  removalExperiment,
  type Centrality,
  type CentralityKey,
  type NetworkData,
} from '../../core/network';
import { NoWork, useCurrentWork } from '../../app/pages/WorkInfoPage';
import { textRulesOf, type TextRules } from '../../shared/useTextRules';
import { NetworkGraph, type GraphEdge, type GraphNode, type NetworkGraphHandle } from '../../shared/NetworkGraph';
import { dataUrlToBlob, saveFileWithToast } from '../../shared/files';
import { Badge, Button, Card, Empty, PageHeader, Select } from '../../shared/ui';
import { useUI } from '../../store/ui';
import { activeVersion, useChapters } from '../serial/useSerial';
import { CharacterPanel } from './CharacterPanel';

// 순차 팔레트(파랑 한 색, 옅음 → 짙음). dataviz 기본 팔레트의 blue 단계
const RAMP = ['#cce3fd', '#9dc8f7', '#6aabf1', '#338ced', '#2370cd', '#1757ac', '#0e3d7e'];
const rampColor = (t: number) => RAMP[Math.min(RAMP.length - 1, Math.max(0, Math.floor(t * RAMP.length)))];
const fmt = (k: CentralityKey, v: number) => (k === 'degree' ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : v.toFixed(3));

export default function NetworkModule() {
  const work = useCurrentWork();
  const chapters = useChapters(work?.id ?? undefined);
  const characters = useLiveQuery(() => (work ? db.characters.where('workId').equals(work.id).sortBy('createdAt') : []), [work?.id]);
  const edits = useLiveQuery(() => (work ? db.networkEdits.where('workId').equals(work.id).toArray() : []), [work?.id]);
  const settingRows = useLiveQuery(() => db.settings.toArray(), []);
  const { setView } = useUI();

  if (work === undefined || !chapters || !characters || !edits || !settingRows) return null;
  if (work === null) return <NoWork />;

  const missing = !chapters.length ? '회차 원고' : characters.length < 2 ? '캐릭터(2명 이상)' : null;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="인물 네트워크" sub="같은 장면에 함께 나온 횟수로 관계망을 그리고, 중심성과 ‘인물 빼기’ 실험으로 이야기 구조를 봐요. (프랑코 모레티의 『햄릿』 네트워크 분석 방식)" />
      {missing ? (
        <Empty title={`${missing}이(가) 필요해요`}>
          <button type="button" className="underline" onClick={() => setView(!chapters.length ? 'chapters' : 'characters')}>
            {missing.replace(/\(.*\)/, '')}
          </button>
          을(를) 먼저 넣어 주세요.
        </Empty>
      ) : (
        <NetworkView
          key={work.id}
          workId={work.id}
          chapters={chapters}
          characters={characters}
          edits={edits}
          per={readSetting(settingRows, 'network.paragraphsPerScene')}
          bonus={readSetting(settingRows, 'network.sameParagraphBonus')}
          recent={readSetting(settingRows, 'network.recentChapters')}
          rules={textRulesOf(settingRows)}
          workTitle={work.title}
        />
      )}
    </div>
  );
}

function NetworkView({
  workId,
  workTitle,
  chapters,
  characters,
  edits,
  per,
  bonus,
  recent,
  rules,
}: {
  workId: string;
  workTitle: string;
  chapters: NonNullable<ReturnType<typeof useChapters>>;
  characters: Character[];
  edits: NetworkEdit[];
  per: number;
  bonus: number;
  recent: number;
  rules: TextRules;
}) {
  const numbers = chapters.map((c) => c.number);
  const [from, setFrom] = useState(numbers[0]);
  const [to, setTo] = useState(numbers[numbers.length - 1]);
  const [metric, setMetric] = useState<CentralityKey>('betweenness');
  const [selected, setSelected] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string>('');
  const graphRef = useRef<NetworkGraphHandle>(null);
  const { openCharacter, setView } = useUI();

  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const inRange = useMemo(() => chapters.filter((c) => c.number >= lo && c.number <= hi), [chapters, lo, hi]);

  const data: NetworkData = useMemo(() => {
    const base = aggregate(
      inRange.map((c) => ({ id: c.id, number: c.number, text: activeVersion(c).text })),
      characters.map((c) => ({ id: c.id, name: c.name, aliases: c.aliases, nameRequiredAliases: c.nameRequiredAliases })),
      novelSource({ paragraphsPerScene: per, sceneBreakSymbols: rules.sceneBreakSymbols }),
      { sameParagraphBonus: bonus, josa: rules.josa },
    );
    return applyEdits(base, edits.map((e) => ({ a: e.a, b: e.b, action: e.action, label: e.label })));
  }, [inRange, characters, edits, per, bonus, rules]);

  const cs = useMemo(() => computeCentrality(data), [data]);
  const csById = useMemo(() => new Map(cs.map((c) => [c.id, c])), [cs]);
  const rankBy = useMemo(() => ({ degree: ranks(cs, 'degree'), betweenness: ranks(cs, 'betweenness'), closeness: ranks(cs, 'closeness') }), [cs]);
  const warnings = useMemo(() => presenceWarnings(data.nodes, data.chapterNumbers, recent), [data, recent]);
  const batch = useMemo(() => batchExperiment(data), [data]);
  const nameOf = (id: string) => characters.find((c) => c.id === id)?.name ?? id;

  const maxScenes = Math.max(1, ...data.nodes.map((n) => n.scenes));
  const maxW = Math.max(1, ...data.edges.map((e) => e.weight));
  const maxM = Math.max(1e-9, ...cs.map((c) => c[metric]));
  const gNodes: GraphNode[] = data.nodes.map((n) => ({
    id: n.id,
    label: n.name,
    size: 22 + 40 * Math.sqrt(n.scenes / maxScenes),
    color: rampColor((csById.get(n.id)?.[metric] ?? 0) / maxM),
    faded: n.scenes === 0,
  }));
  const gEdges: GraphEdge[] = data.edges.map((e) => ({
    id: pairKey(e.a, e.b),
    source: e.a,
    target: e.b,
    width: 1.5 + 7 * (e.weight / maxW),
    label: e.label,
    dashed: e.manual,
  }));

  const savePng = async () => {
    const uri = graphRef.current?.png();
    if (!uri) return;
    await saveFileWithToast(`관계망-${workTitle.replace(/[\\/:*?"<>|\s]+/g, '_')}-${lo}~${hi}화.png`, dataUrlToBlob(uri), '관계망 그림을 저장했어요', 'image/png');
  };

  const exp = removeId ? removalExperiment(data, removeId) : null;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-stone-600">회차 범위</span>
          <Select aria-label="시작 회차" className="!w-24" value={from} onChange={(e) => setFrom(Number(e.target.value))}>
            {numbers.map((n) => (
              <option key={n} value={n}>
                {n}화
              </option>
            ))}
          </Select>
          ~
          <Select aria-label="끝 회차" className="!w-24" value={to} onChange={(e) => setTo(Number(e.target.value))}>
            {numbers.map((n) => (
              <option key={n} value={n}>
                {n}화
              </option>
            ))}
          </Select>
          <span className="text-xs text-stone-500" data-testid="network-summary">
            회차 {inRange.length}개 · 장면 {data.sceneCount}개 · 관계 {data.edges.length}개
          </span>
          <span className="flex-1" />
          <span className="text-stone-600">노드 색</span>
          <Select aria-label="노드 색 지표" className="!w-40" value={metric} onChange={(e) => setMetric(e.target.value as CentralityKey)}>
            {(Object.keys(CENTRALITY_LABELS) as CentralityKey[]).map((k) => (
              <option key={k} value={k}>
                {CENTRALITY_LABELS[k].label}
              </option>
            ))}
          </Select>
          <Button size="sm" onClick={() => graphRef.current?.relayout()}>
            다시 배치
          </Button>
          <Button size="sm" onClick={savePng}>
            PNG 저장
          </Button>
        </div>
      </Card>

      {warnings.length > 0 && (
        <div role="status" className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900" data-testid="presence-warnings">
          ⚠ 존재감 하락:{' '}
          {warnings.map((w) => `${nameOf(w.id)} (최근 ${w.recent.length}화 등장 ${Math.round(w.recentRatio * 100)}% · 그 전 ${Math.round(w.earlierRatio * 100)}%)`).join(', ')}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <figure className="rounded-lg border border-stone-200 bg-white p-3">
          <NetworkGraph ref={graphRef} nodes={gNodes} edges={gEdges} selectedId={selected} onNodeClick={setSelected} />
          <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-600">
            <span className="flex items-center gap-1">
              {CENTRALITY_LABELS[metric].label} 낮음
              <span className="flex">
                {RAMP.map((c) => (
                  <span key={c} className="h-2.5 w-4" style={{ background: c }} />
                ))}
              </span>
              높음
            </span>
            <span>노드 크기 = 등장 장면 수</span>
            <span>간선 굵기 = 가중치(함께 나온 장면 수)</span>
            <span>점선 = 직접 더한 관계</span>
          </figcaption>
        </figure>
        <div className="min-w-0">
          {selected && csById.has(selected) ? (
            <CharacterPanel
              workId={workId}
              character={characters.find((c) => c.id === selected)!}
              node={data.nodes.find((n) => n.id === selected)!}
              data={data}
              centrality={csById.get(selected)!}
              rankBy={rankBy}
              characters={characters}
              edits={edits}
              onOpenCard={() => {
                openCharacter(selected);
                setView('characters');
              }}
            />
          ) : (
            <Empty title="노드를 누르면 캐릭터 카드와 등장 회차가 보여요">관계 라벨과 간선 더하기·빼기도 거기서 해요.</Empty>
          )}
        </div>
      </div>

      <CentralityTable cs={cs} data={data} rankBy={rankBy} metric={metric} nameOf={nameOf} warned={new Set(warnings.map((w) => w.id))} onPick={setSelected} />

      <Card title="인물 빼기 실험">
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="뺄 인물" className="!w-48" value={removeId} onChange={(e) => setRemoveId(e.target.value)}>
            <option value="">인물을 고르세요</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {exp && <p className="text-sm font-medium" data-testid="removal-sentence">{describeRemoval(exp, nameOf)}</p>}
        </div>
        {exp && (
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <table className="text-sm">
              <tbody>
                <tr className="border-b border-stone-100"><td className="py-1 pr-4 text-stone-600">조각 수</td><td className="tabular-nums">{exp.piecesBefore} → {exp.piecesAfter}</td></tr>
                <tr className="border-b border-stone-100"><td className="py-1 pr-4 text-stone-600">새로 고립되는 인물</td><td>{exp.newlyIsolated.map(nameOf).join(', ') || '없음'}</td></tr>
                <tr><td className="py-1 pr-4 text-stone-600">평균 최단 경로</td><td className="tabular-nums">{exp.before.avgShortestPath?.toFixed(3) ?? '—'} → {exp.after.avgShortestPath?.toFixed(3) ?? '—'}</td></tr>
              </tbody>
            </table>
            <div>
              <div className="mb-1 text-xs text-stone-500">남은 인물의 {CENTRALITY_LABELS[metric].label} 순위 변화</div>
              <ul className="space-y-0.5 text-sm">
                {[...exp.rankChange[metric]].sort((x, y) => x[1].after - y[1].after).map(([id, r]) => (
                  <li key={id} className="flex gap-2 tabular-nums">
                    <span className="w-24 truncate">{nameOf(id)}</span>
                    <span>{r.before}위 → {r.after}위</span>
                    <span className={r.delta > 0 ? 'text-teal-700' : r.delta < 0 ? 'text-orange-700' : 'text-stone-400'}>{r.delta > 0 ? `▲${r.delta}` : r.delta < 0 ? `▼${-r.delta}` : '–'}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Card>

      <Card title="일괄 실험 — 모든 인물을 하나씩 빼 보기" actions={<Badge tone="amber">쪼개짐 {batch.filter((r) => r.splits).length}명</Badge>}>
        <table className="w-full text-sm" data-testid="batch-table">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
              <th className="py-1.5 font-medium">뺀 인물</th>
              <th className="py-1.5 font-medium">결과</th>
              <th className="py-1.5 text-right font-medium">조각 수</th>
              <th className="py-1.5 font-medium pl-3">새로 고립</th>
              <th className="py-1.5 text-right font-medium">평균 최단 경로</th>
            </tr>
          </thead>
          <tbody>
            {[...batch].sort((x, y) => Number(y.splits) - Number(x.splits) || y.pieces.length - x.pieces.length).map((r) => (
              <tr key={r.removed} className={`border-b border-stone-100 ${r.splits ? 'bg-amber-50' : ''}`}>
                <td className="py-1.5">{nameOf(r.removed)}</td>
                <td className="py-1.5">{r.splits ? <b className="text-amber-800">⚠ 관계망이 {r.pieces.length}조각으로 쪼개짐</b> : <span className="text-stone-500">그대로 이어짐</span>}</td>
                <td className="py-1.5 text-right tabular-nums">{r.piecesBefore} → {r.piecesAfter}</td>
                <td className="py-1.5 pl-3">{r.newlyIsolated.map(nameOf).join(', ') || '—'}</td>
                <td className="py-1.5 text-right tabular-nums">{r.before.avgShortestPath?.toFixed(3) ?? '—'} → {r.after.avgShortestPath?.toFixed(3) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-stone-500">빼면 관계망이 쪼개지는 인물이 구조상 빠질 수 없는 인물이에요. 거리는 1/가중치라서 자주 함께 나올수록 가까워요.</p>
      </Card>
    </div>
  );
}

function CentralityTable({
  cs,
  data,
  rankBy,
  metric,
  nameOf,
  warned,
  onPick,
}: {
  cs: Centrality[];
  data: NetworkData;
  rankBy: Record<CentralityKey, Map<string, number>>;
  metric: CentralityKey;
  nameOf: (id: string) => string;
  warned: Set<string>;
  onPick: (id: string) => void;
}) {
  const sorted = [...cs].sort((a, b) => b[metric] - a[metric]);
  return (
    <Card title="중심성 표">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm" data-testid="centrality-table">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
              <th className="py-1.5 font-medium">인물</th>
              <th className="py-1.5 text-right font-medium">등장 장면</th>
              {(Object.keys(CENTRALITY_LABELS) as CentralityKey[]).map((k) => (
                <th key={k} className={`py-1.5 text-right font-medium ${k === metric ? 'text-stone-800' : ''}`} title={CENTRALITY_LABELS[k].reading}>
                  {CENTRALITY_LABELS[k].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.id} className="border-b border-stone-100 hover:bg-stone-50">
                <td className="py-1.5">
                  <button type="button" className="hover:underline" onClick={() => onPick(c.id)}>
                    {nameOf(c.id)}
                  </button>
                  {warned.has(c.id) && <span className="ml-1 text-xs text-amber-700">⚠ 존재감 하락</span>}
                </td>
                <td className="py-1.5 text-right tabular-nums">{data.nodes.find((n) => n.id === c.id)?.scenes ?? 0}</td>
                {(Object.keys(CENTRALITY_LABELS) as CentralityKey[]).map((k) => (
                  <td key={k} className={`py-1.5 text-right tabular-nums ${k === metric ? 'font-medium' : 'text-stone-600'}`}>
                    {fmt(k, c[k])} <span className="text-xs text-stone-400">({rankBy[k].get(c.id)}위)</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-stone-500">연결 정도 = 간선 가중치 합 · 매개 = 다른 인물 사이 최단 경로에 끼는 비율(0~1) · 근접 = 모든 인물까지 거리로 본 가까움(0~1, 끊긴 관계망도 계산되는 조화 평균 방식)</p>
    </Card>
  );
}
