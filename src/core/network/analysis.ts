// 중심성, 인물 빼기 실험, 존재감 하락 경고 (SPEC 모듈 B). Cytoscape를 화면 없이(headless) 써서 계산한다.
import cytoscape, { type Core, type EdgeSingular } from 'cytoscape';
import type { NetworkData, NetworkNode } from './aggregate';


export type CentralityKey = 'degree' | 'betweenness' | 'closeness';

export const CENTRALITY_LABELS: Record<CentralityKey, { label: string; reading: string }> = {
  degree: { label: '연결 정도(가중)', reading: '누가 가장 많은 인물과 얽히나' },
  betweenness: { label: '매개 중심성', reading: '집단과 집단을 잇는 연결 고리' },
  closeness: { label: '근접 중심성', reading: '이야기의 한가운데에 있는 인물' },
};

export type Centrality = { id: string; degree: number; betweenness: number; closeness: number };

/** 그래프 만들기. 최단 경로는 가중치를 거리로 쓰므로 거리 = 1 / 가중치 (자주 함께 나올수록 가까움) */
function buildCy(data: Pick<NetworkData, 'nodes' | 'edges'>, without?: string): Core {
  const nodes = data.nodes.filter((n) => n.id !== without);
  const ids = new Set(nodes.map((n) => n.id));
  return cytoscape({
    headless: true,
    styleEnabled: false,
    elements: [
      ...nodes.map((n) => ({ group: 'nodes' as const, data: { id: n.id } })),
      ...data.edges
        .filter((e) => ids.has(e.a) && ids.has(e.b) && e.weight > 0)
        .map((e) => ({ group: 'edges' as const, data: { id: `${e.a}|${e.b}`, source: e.a, target: e.b, weight: e.weight, dist: 1 / e.weight } })),
    ],
  });
}

const dist = (e: EdgeSingular) => e.data('dist') as number;
const weight = (e: EdgeSingular) => e.data('weight') as number;

/**
 * 중심성 (Cytoscape 내장 함수)
 * - 연결 정도(가중): degreeCentrality(alpha 1) = 간선 가중치 합
 * - 매개 중심성: betweennessCentrality 정규화(0~1), 거리 = 1/가중치
 * - 근접 중심성: closenessCentralityNormalized(조화 평균 방식, 0~1), 거리 = 1/가중치. 끊긴 그래프에서도 계산된다.
 */
export function computeCentrality(data: Pick<NetworkData, 'nodes' | 'edges'>, without?: string): Centrality[] {
  const cy = buildCy(data, without);
  if (cy.nodes().length === 0) return [];
  const bc = cy.elements().betweennessCentrality({ weight: dist, directed: false });
  const cc = cy.elements().closenessCentralityNormalized({ weight: dist, directed: false, harmonic: true });
  return cy.nodes().map((n) => ({
    id: n.id(),
    degree: (cy.elements().degreeCentrality({ root: n, weight, alpha: 1, directed: false }) as { degree: number }).degree,
    betweenness: cy.nodes().length > 2 ? bc.betweennessNormalized(n) : 0,
    closeness: cy.edges().length ? cc.closeness(n) : 0,
  }));
}

/** 값이 큰 순서의 순위 (1부터, 같으면 같은 순위) */
export function ranks(cs: Centrality[], key: CentralityKey): Map<string, number> {
  const sorted = [...cs].sort((x, y) => y[key] - x[key]);
  const out = new Map<string, number>();
  sorted.forEach((c, i) => out.set(c.id, i > 0 && Math.abs(c[key] - sorted[i - 1][key]) < 1e-12 ? out.get(sorted[i - 1].id)! : i + 1));
  return out;
}

export type Structure = {
  /** 연결 요소(조각): 인물 id 묶음. 간선이 없는 인물은 혼자 한 조각 */
  components: string[][];
  /** 간선이 하나도 없는 인물 */
  isolated: string[];
  /** 이어진 인물 쌍 사이 최단 경로(거리 = 1/가중치)의 평균. 이어진 쌍이 없으면 null */
  avgShortestPath: number | null;
};

export function structure(data: Pick<NetworkData, 'nodes' | 'edges'>, without?: string): Structure {
  const cy = buildCy(data, without);
  const components = cy
    .elements()
    .components()
    .map((c) => c.nodes().map((n) => n.id()).sort());
  const isolated = cy.nodes().filter((n) => n.degree(false) === 0).map((n) => n.id());
  const fw = cy.elements().floydWarshall({ weight: (e) => (e as unknown as EdgeSingular).data('dist') as number, directed: false });
  const ns = cy.nodes();
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < ns.length; i++)
    for (let j = i + 1; j < ns.length; j++) {
      const d = fw.distance(ns[i], ns[j]);
      if (Number.isFinite(d)) {
        sum += d;
        pairs++;
      }
    }
  return { components, isolated, avgShortestPath: pairs ? sum / pairs : null };
}

export type RemovalResult = {
  removed: string;
  before: Structure;
  after: Structure;
  /** 남은 인물들의 조각 수 (빼기 전 → 뺀 뒤). 고립 인물도 한 조각으로 센다 */
  piecesBefore: number;
  piecesAfter: number;
  /** 뺀 인물이 속해 있던 조각이 뺀 뒤 나뉜 모양 */
  pieces: string[][];
  /** 관계망이 쪼개지나: 뺀 인물이 속한 조각이 두 개 이상으로 나뉨 (구조상 빠질 수 없는 인물) */
  splits: boolean;
  /** 빼기 전에 간선이 있었는데 빼고 나서 고립된 인물 */
  newlyIsolated: string[];
  /** 남은 인물의 순위 변화 (delta가 +면 올라감) */
  rankChange: Record<CentralityKey, Map<string, { before: number; after: number; delta: number }>>;
};

/** 인물 빼기 실험: 그 노드를 뺀 그래프로 다시 계산해 전후를 비교한다 */
export function removalExperiment(data: Pick<NetworkData, 'nodes' | 'edges'>, removed: string): RemovalResult {
  const before = structure(data);
  const after = structure(data, removed);
  const home = (before.components.find((c) => c.includes(removed)) ?? []).filter((id) => id !== removed);
  const pieces = after.components.filter((c) => c.some((id) => home.includes(id)));
  const newlyIsolated = pieces.filter((c) => c.length === 1).map((c) => c[0]);
  const piecesBefore = before.components.map((c) => c.filter((id) => id !== removed)).filter((c) => c.length).length;
  const cb = computeCentrality(data);
  const ca = computeCentrality(data, removed);
  const rankChange = {} as RemovalResult['rankChange'];
  for (const key of ['degree', 'betweenness', 'closeness'] as CentralityKey[]) {
    const rb = ranks(cb.filter((c) => c.id !== removed), key);
    const ra = ranks(ca, key);
    rankChange[key] = new Map([...ra].map(([id, aft]) => [id, { before: rb.get(id) ?? aft, after: aft, delta: (rb.get(id) ?? aft) - aft }]));
  }
  return { removed, before, after, piecesBefore, piecesAfter: after.components.length, pieces, splits: pieces.length > 1, newlyIsolated, rankChange };
}

/** 일괄 실험: 모든 인물을 하나씩 빼 본다 */
export function batchExperiment(data: Pick<NetworkData, 'nodes' | 'edges'>): RemovalResult[] {
  return data.nodes.map((n) => removalExperiment(data, n.id));
}

const NUM = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
/** 받침에 따라 을/를 */
export function objectJosa(word: string): string {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return '을(를)';
  return code % 28 ? '을' : '를';
}

/** “OO를 빼면 관계망이 두 조각으로 나뉘어요: {A, B} / {C, D, E}” */
export function describeRemoval(r: RemovalResult, nameOf: (id: string) => string): string {
  const name = nameOf(r.removed);
  const head = `‘${name}’${objectJosa(name)} 빼면`;
  if (!r.pieces.length) return `${head}: 원래 아무와도 이어져 있지 않았어요.`;
  if (!r.splits) return `${head} 관계망은 그대로 이어져 있어요.`;
  const n = NUM[r.pieces.length] ?? String(r.pieces.length);
  return `${head} 관계망이 ${n} 조각으로 나뉘어요: ${r.pieces.map((c) => `{${c.map(nameOf).join(', ')}}`).join(' / ')}`;
}

export type PresenceWarning = { id: string; recentRatio: number; earlierRatio: number; recent: number[]; };

/**
 * 존재감 하락 경고: 전체 등장(장면 수) 상위 30% 인물 중,
 * 최근 N화 등장 비율(등장한 회차 수 ÷ N)이 그 전 회차들의 등장 비율의 절반 아래로 떨어진 인물.
 */
export function presenceWarnings(nodes: NetworkNode[], chapterNumbers: number[], recentCount: number, topShare = 0.3): PresenceWarning[] {
  const sorted = [...chapterNumbers].sort((a, b) => a - b);
  const n = Math.max(1, Math.floor(recentCount));
  if (sorted.length <= n) return [];
  const recent = sorted.slice(-n);
  const earlier = sorted.slice(0, -n);
  const active = nodes.filter((x) => x.scenes > 0).sort((a, b) => b.scenes - a.scenes);
  const top = active.slice(0, Math.max(1, Math.ceil(active.length * topShare)));
  const out: PresenceWarning[] = [];
  for (const node of top) {
    const r = node.chapters.filter((c) => recent.includes(c)).length / recent.length;
    const e = node.chapters.filter((c) => earlier.includes(c)).length / earlier.length;
    if (e > 0 && r < e / 2) out.push({ id: node.id, recentRatio: r, earlierRatio: e, recent });
  }
  return out;
}
