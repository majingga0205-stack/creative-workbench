// 인물 네트워크 집계 (SPEC 모듈 B '집계 규칙'). 순수 함수, React·Dexie를 import하지 않는다.
import { findTerm, isSceneBreakLine, prepareText, splitParagraphs, splitScenes, type MatchOptions, type Span } from '../korean';

/** 집계에 쓰는 장면 하나. 입력 어댑터가 만든다 (지금은 소설 회차, 나중에 희곡을 붙일 자리). */
export type SceneUnit = Span & {
  chapterId: string;
  chapterNumber: number;
  index: number;
  /** 장면 안 문단 위치 (같은 문단 가중치용) */
  paragraphs: Span[];
};

export type ChapterInput = { id: string; number: number; text: string };

/** 입력 어댑터: 원고 → 장면 목록 */
export interface SceneSource {
  scenes(chapter: ChapterInput): SceneUnit[];
}

export type NovelSourceOptions = { paragraphsPerScene?: number; sceneBreakSymbols?: readonly string[] };

/**
 * 소설 회차 어댑터: 장면 구분선으로 나누고, 구분선이 하나도 없는 회차는 문단 N개(기본 8)씩 끊은 구간을 장면으로 본다.
 */
export function novelSource(options: NovelSourceOptions = {}): SceneSource {
  const per = Math.max(1, Math.floor(options.paragraphsPerScene ?? 8));
  const split = { sceneBreakSymbols: options.sceneBreakSymbols };
  return {
    scenes(ch) {
      const paras = splitParagraphs(ch.text, split);
      const hasBreak = ch.text.split('\n').some((l) => isSceneBreakLine(l, options.sceneBreakSymbols));
      const spans: Span[] = hasBreak
        ? splitScenes(ch.text, split)
        : Array.from({ length: Math.ceil(paras.length / per) }, (_, k) => {
            const group = paras.slice(k * per, (k + 1) * per);
            return { start: group[0].start, end: group[group.length - 1].end };
          });
      return spans.map((s, index) => ({
        chapterId: ch.id,
        chapterNumber: ch.number,
        index,
        start: s.start,
        end: s.end,
        paragraphs: paras.filter((p) => p.start >= s.start && p.end <= s.end),
      }));
    },
  };
}

export type CharacterInput = {
  id: string;
  name: string;
  aliases: string[];
  /** 같은 장면에 본명이 나왔을 때만 인정하는 별칭 (‘연구원’ 같은 호칭) */
  nameRequiredAliases?: string[];
};

export type NetworkNode = {
  id: string;
  name: string;
  /** 등장 장면 수 */
  scenes: number;
  /** 이름·별칭이 잡힌 횟수 */
  mentions: number;
  /** 등장한 회차 번호 (오름차순) */
  chapters: number[];
};

export type NetworkEdge = {
  /** 두 인물 id (사전순으로 a < b) */
  a: string;
  b: string;
  /** 함께 나온 장면 수 */
  scenes: number;
  /** 같은 문단에 함께 나온 횟수 */
  paragraphs: number;
  /** 간선 가중치 = 장면 수 + 같은 문단 가중치 × 같은 문단 수 (수동 보정 간선은 manualWeight) */
  weight: number;
  manual?: boolean;
  label?: string;
};

export type NetworkData = {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  sceneCount: number;
  chapterNumbers: number[];
};

export type AggregateOptions = MatchOptions & {
  /** 같은 문단에 함께 나오면 더하는 가중치 (기본 0) */
  sameParagraphBonus?: number;
};

export const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

/**
 * 회차들의 장면마다 등장 인물을 찾고, 두 인물이 함께 나온 장면 수를 센다.
 * 인물 인식은 공통 매처(word 모드)로 이름과 별칭을 찾는다.
 */
export function aggregate(chapters: ChapterInput[], characters: CharacterInput[], source: SceneSource, options: AggregateOptions = {}): NetworkData {
  const bonus = options.sameParagraphBonus ?? 0;
  const nodes = new Map<string, NetworkNode>(characters.map((c) => [c.id, { id: c.id, name: c.name, scenes: 0, mentions: 0, chapters: [] }]));
  const edges = new Map<string, NetworkEdge>();
  let sceneCount = 0;

  for (const ch of [...chapters].sort((x, y) => x.number - y.number)) {
    const prepared = prepareText(ch.text);
    // 인물마다 원고 전체에서 한 번 찾고, 장면에 나눠 담는다
    const found = characters.map((c) => ({
      c,
      matches: findTerm(prepared, { term: c.name, aliases: c.aliases, mode: 'word' }, options),
    }));
    for (const scene of source.scenes(ch)) {
      sceneCount++;
      const present: { id: string; spans: Span[] }[] = [];
      for (const { c, matches } of found) {
        const inScene = matches.filter((m) => m.start >= scene.start && m.end <= scene.end);
        const strict = new Set(c.nameRequiredAliases ?? []);
        const hasName = inScene.some((m) => m.form === c.name);
        const counted = inScene.filter((m) => !strict.has(m.form) || hasName);
        if (!counted.length) continue;
        present.push({ id: c.id, spans: counted });
        const node = nodes.get(c.id)!;
        node.scenes++;
        node.mentions += counted.length;
        if (!node.chapters.includes(ch.number)) node.chapters.push(ch.number);
      }
      for (let i = 0; i < present.length; i++) {
        for (let j = i + 1; j < present.length; j++) {
          const [a, b] = [present[i].id, present[j].id].sort();
          const key = pairKey(a, b);
          const e = edges.get(key) ?? { a, b, scenes: 0, paragraphs: 0, weight: 0 };
          e.scenes++;
          const together = scene.paragraphs.filter(
            (p) => present[i].spans.some((s) => s.start >= p.start && s.end <= p.end) && present[j].spans.some((s) => s.start >= p.start && s.end <= p.end),
          ).length;
          e.paragraphs += together;
          e.weight = e.scenes + bonus * e.paragraphs;
          edges.set(key, e);
        }
      }
    }
  }

  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    sceneCount,
    chapterNumbers: [...new Set(chapters.map((c) => c.number))].sort((x, y) => x - y),
  };
}

export type EdgeEdit = { a: string; b: string; action: 'add' | 'remove' | 'label'; label?: string; weight?: number };

/**
 * 수동 보정을 계산 결과 위에 얹는다 (계산 결과와 따로 저장해서 다시 계산해도 유지).
 * - add: 계산에 없는 간선을 더한다 (가중치 기본 1). 이미 있으면 그대로 두고 표시만 한다.
 * - remove: 간선을 뺀다.
 * - label: 관계 라벨 (가족·동료·적대 등 자유 입력)
 */
export function applyEdits(data: NetworkData, edits: EdgeEdit[]): NetworkData {
  const ids = new Set(data.nodes.map((n) => n.id));
  const edges = new Map(data.edges.map((e) => [pairKey(e.a, e.b), { ...e }]));
  for (const ed of edits) {
    if (!ids.has(ed.a) || !ids.has(ed.b) || ed.a === ed.b) continue;
    const key = pairKey(ed.a, ed.b);
    const [a, b] = [ed.a, ed.b].sort();
    if (ed.action === 'remove') edges.delete(key);
    else if (ed.action === 'add' && !edges.has(key)) edges.set(key, { a, b, scenes: 0, paragraphs: 0, weight: ed.weight ?? 1, manual: true });
  }
  for (const ed of edits) {
    if (ed.action !== 'label') continue;
    const e = edges.get(pairKey(ed.a, ed.b));
    if (e) e.label = ed.label;
  }
  return { ...data, edges: [...edges.values()] };
}
