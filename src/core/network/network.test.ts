import { describe, expect, it } from 'vitest';
import {
  aggregate,
  applyEdits,
  batchExperiment,
  computeCentrality,
  describeRemoval,
  novelSource,
  objectJosa,
  pairKey,
  presenceWarnings,
  ranks,
  removalExperiment,
  structure,
  type CharacterInput,
  type NetworkData,
} from './index';

// 인물 5명: {하람, 수아} 무리와 {도윤, 지호} 무리를 미르가 잇는다
const cast: CharacterInput[] = [
  { id: 'haram', name: '하람', aliases: ['연구원'], nameRequiredAliases: ['연구원'] },
  { id: 'sua', name: '수아', aliases: [] },
  { id: 'mir', name: '미르', aliases: [] },
  { id: 'doyun', name: '도윤', aliases: [] },
  { id: 'jiho', name: '지호', aliases: [] },
];

const ch1 = [
  '하람이 문을 열었다. 수아가 뒤따랐다.',
  '=',
  '하람과 수아는 미르를 만났다.',
  '=',
  '미르가 도윤에게 편지를 건넸다.',
  '=',
  '도윤은 지호와 걸었다.',
  '=',
  '지호가 도윤을 불렀다.',
].join('\n');

const nameOf = (id: string) => cast.find((c) => c.id === id)!.name;
const weightOf = (d: NetworkData, x: string, y: string) => d.edges.find((e) => pairKey(e.a, e.b) === pairKey(x, y))?.weight;

describe('집계', () => {
  const data = aggregate([{ id: 'c1', number: 1, text: ch1 }], cast, novelSource());

  it('장면마다 등장 인물을 찾고 함께 나온 장면 수를 센다', () => {
    expect(data.sceneCount).toBe(5);
    expect(weightOf(data, 'haram', 'sua')).toBe(2);
    expect(weightOf(data, 'haram', 'mir')).toBe(1);
    expect(weightOf(data, 'sua', 'mir')).toBe(1);
    expect(weightOf(data, 'mir', 'doyun')).toBe(1);
    expect(weightOf(data, 'doyun', 'jiho')).toBe(2);
    expect(weightOf(data, 'haram', 'doyun')).toBeUndefined();
    expect(data.nodes.find((n) => n.id === 'mir')).toMatchObject({ scenes: 2, chapters: [1] });
  });

  it("호칭 별칭은 '같은 장면에 본명이 나왔을 때만' 인정해 오탐을 막는다", () => {
    const text = '연구원이 들어왔다. 도윤이 인사했다.\n=\n하람이 왔다. 연구원은 웃었다. 지호가 봤다.';
    const strict = aggregate([{ id: 'c', number: 1, text }], cast, novelSource());
    expect(weightOf(strict, 'haram', 'doyun')).toBeUndefined();
    expect(weightOf(strict, 'haram', 'jiho')).toBe(1);
    expect(strict.nodes.find((n) => n.id === 'haram')).toMatchObject({ scenes: 1, mentions: 2 });
    // 옵션을 끄면 첫 장면의 '연구원'도 하람으로 센다
    const loose = aggregate([{ id: 'c', number: 1, text }], cast.map((c) => ({ ...c, nameRequiredAliases: [] })), novelSource());
    expect(weightOf(loose, 'haram', 'doyun')).toBe(1);
  });

  it('구분선이 없는 회차는 문단 8개(설정 가능)씩 끊어 장면으로 본다', () => {
    const paras = Array.from({ length: 10 }, (_, i) => (i === 0 ? '하람이 왔다.' : i === 9 ? '수아가 왔다.' : `문단 ${i}.`)).join('\n');
    expect(aggregate([{ id: 'c', number: 1, text: paras }], cast, novelSource()).sceneCount).toBe(2);
    expect(weightOf(aggregate([{ id: 'c', number: 1, text: paras }], cast, novelSource()), 'haram', 'sua')).toBeUndefined();
    const big = aggregate([{ id: 'c', number: 1, text: paras }], cast, novelSource({ paragraphsPerScene: 10 }));
    expect(big.sceneCount).toBe(1);
    expect(weightOf(big, 'haram', 'sua')).toBe(1);
  });

  it('같은 문단에 함께 나오면 추가 가중치 (기본 0)', () => {
    const text = '하람과 수아가 웃었다.\n수아는 혼자 걸었다.\n하람이 뒤따랐다.';
    expect(weightOf(aggregate([{ id: 'c', number: 1, text }], cast, novelSource()), 'haram', 'sua')).toBe(1);
    const d = aggregate([{ id: 'c', number: 1, text }], cast, novelSource(), { sameParagraphBonus: 0.5 });
    expect(d.edges[0]).toMatchObject({ scenes: 1, paragraphs: 1, weight: 1.5 });
  });

  it('회차 범위: 넣은 회차만 센다', () => {
    const d = aggregate([{ id: 'c1', number: 1, text: ch1 }, { id: 'c2', number: 2, text: '하람과 지호가 만났다.' }], cast, novelSource());
    expect(weightOf(d, 'haram', 'jiho')).toBe(1);
    expect(d.chapterNumbers).toEqual([1, 2]);
    expect(weightOf(aggregate([{ id: 'c1', number: 1, text: ch1 }], cast, novelSource()), 'haram', 'jiho')).toBeUndefined();
  });

  it('수동 보정: 추가·삭제·라벨은 계산 결과 위에 얹고, 다시 계산해도 유지된다', () => {
    const edits = [
      { a: 'haram', b: 'jiho', action: 'add' as const },
      { a: 'doyun', b: 'jiho', action: 'remove' as const },
      { a: 'sua', b: 'haram', action: 'label' as const, label: '가족' },
    ];
    const d = applyEdits(data, edits);
    expect(d.edges.find((e) => pairKey(e.a, e.b) === pairKey('haram', 'jiho'))).toMatchObject({ manual: true, weight: 1 });
    expect(weightOf(d, 'doyun', 'jiho')).toBeUndefined();
    expect(d.edges.find((e) => pairKey(e.a, e.b) === pairKey('haram', 'sua'))?.label).toBe('가족');
    const again = applyEdits(aggregate([{ id: 'c1', number: 1, text: ch1 }], cast, novelSource()), edits);
    expect(again.edges).toEqual(d.edges);
  });
});

describe('중심성과 인물 빼기 실험', () => {
  const data = aggregate([{ id: 'c1', number: 1, text: ch1 }], cast, novelSource());

  it('두 무리를 잇는 인물이 매개 중심성 1위', () => {
    const cs = computeCentrality(data);
    expect(ranks(cs, 'betweenness').get('mir')).toBe(1);
    // 연결 정도(가중) = 간선 가중치 합
    expect(cs.find((c) => c.id === 'haram')!.degree).toBe(3);
    expect(cs.find((c) => c.id === 'mir')!.degree).toBe(3);
  });

  it('거리 = 1/가중치: 자주 함께 나올수록 가깝다', () => {
    const s = structure(data);
    expect(s.components).toHaveLength(1);
    expect(s.avgShortestPath).toBeGreaterThan(0);
  });

  it('두 무리를 잇는 인물을 빼면 조각이 2개가 된다', () => {
    const r = removalExperiment(data, 'mir');
    expect(r.splits).toBe(true);
    expect(r.pieces).toEqual([
      ['haram', 'sua'],
      ['doyun', 'jiho'],
    ]);
    expect(r.piecesBefore).toBe(1);
    expect(r.piecesAfter).toBe(2);
    expect(describeRemoval(r, nameOf)).toBe('‘미르’를 빼면 관계망이 두 조각으로 나뉘어요: {하람, 수아} / {도윤, 지호}');
  });

  it('끝에 있는 인물을 빼면 그대로 이어져 있다', () => {
    const r = removalExperiment(data, 'jiho');
    expect(r.splits).toBe(false);
    expect(describeRemoval(r, nameOf)).toBe('‘지호’를 빼면 관계망은 그대로 이어져 있어요.');
  });

  it('도윤을 빼면 지호가 혼자 남는다', () => {
    const r = removalExperiment(data, 'doyun');
    expect(r.splits).toBe(true);
    expect(r.newlyIsolated).toEqual(['jiho']);
  });

  it('남은 인물의 순위 변화', () => {
    const r = removalExperiment(data, 'mir');
    const haram = r.rankChange.betweenness.get('haram')!;
    expect(haram.after).toBeGreaterThanOrEqual(1);
    expect(r.rankChange.degree.has('mir')).toBe(false);
  });

  it('일괄 실험: 빼면 쪼개지는 인물 = 미르, 도윤', () => {
    const rows = batchExperiment(data);
    expect(rows.filter((r) => r.splits).map((r) => r.removed).sort()).toEqual(['doyun', 'mir']);
  });

  it('간선이 없는 인물', () => {
    const lonely = { nodes: [...data.nodes, { id: 'x', name: '엑스', scenes: 0, mentions: 0, chapters: [] }], edges: data.edges };
    expect(structure(lonely).isolated).toEqual(['x']);
    expect(describeRemoval(removalExperiment(lonely, 'x'), (id) => (id === 'x' ? '엑스' : nameOf(id)))).toContain('원래 아무와도');
  });
});

describe('존재감 하락 경고', () => {
  const chapters = Array.from({ length: 10 }, (_, i) => i + 1);
  const node = (id: string, scenes: number, chs: number[]) => ({ id, name: id, scenes, mentions: scenes, chapters: chs });

  it('상위 30% 인물 중 최근 N화 등장 비율이 그 전의 절반 아래로 떨어진 인물', () => {
    const nodes = [
      node('주인공', 30, chapters),
      node('조연', 20, [1, 2, 3, 4, 5, 6, 7]), // 최근 3화 0/3, 그 전 7/7 → 경고
      node('동료', 15, chapters),
      ...[1, 2, 3, 4, 5, 6, 7].map((n) => node(`단역${n}`, 1, [n])),
    ];
    // 10명 중 상위 30% = 주인공·조연·동료. 단역은 판단하지 않는다
    const w = presenceWarnings(nodes, chapters, 3);
    expect(w.map((x) => x.id)).toEqual(['조연']);
    expect(w[0]).toMatchObject({ recentRatio: 0, earlierRatio: 1 });
  });

  it('회차가 최근 N화보다 적으면 판단하지 않는다', () => {
    expect(presenceWarnings([node('a', 5, [1, 2])], [1, 2], 5)).toEqual([]);
  });
});

it('받침에 따라 을/를', () => {
  expect(objectJosa('하람')).toBe('을');
  expect(objectJosa('미르')).toBe('를');
  expect(objectJosa('Mir')).toBe('을(를)');
});
