// 내 캐릭터 대조·보존도·고증 함정 (SPEC 모듈 D). 순수 함수, React·Dexie를 import하지 않는다.
import { findTerm, type MatchMode } from '../korean';
import type { ArchetypeChoices, ArchetypeElement, Being, ElementChoice, ElementWeight, Trap } from '../../db/types';

export const WEIGHT: Record<ElementWeight, number> = { core: 3, common: 2, variant: 1 };
export const WEIGHT_LABEL: Record<ElementWeight, string> = { core: '핵심', common: '흔함', variant: '일부 판본' };

/** 말 목록 중 글에 나오는 것 (조사 인식 매처) */
function wordsIn(text: string, words: string[], mode: MatchMode): string[] {
  return words.filter((w) => w.trim() && findTerm(text, { term: w.trim(), mode }).length > 0);
}

export type ElementRow = {
  element: ArchetypeElement;
  /** 자동 제안: 특성에 keywords → 가져옴, opposite → 충돌 (둘 다면 충돌) */
  suggestion?: { choice: '가져옴' | '충돌'; words: string[]; traits: string[] };
  /** 사용자가 확정한 선택 */
  choice?: ElementChoice;
  /** 확정이 있으면 확정, 없으면 제안 */
  effective?: ElementChoice;
  intended: boolean;
  /** 출처가 없으면 대조 결과에서 회색 */
  noSource: boolean;
};

export type TrapHit = { trap: Trap; words: string[] };

export type Comparison = {
  rows: ElementRow[];
  cells: { kept: ElementRow[]; changed: ElementRow[]; droppedCore: ElementRow[]; conflicts: ElementRow[] };
  /** 핵심이 아닌 버린 요소 */
  droppedOther: ElementRow[];
  /** 아직 고르지도, 제안되지도 않은 요소 */
  undecided: ElementRow[];
  /** 어느 요소에도 걸리지 않은 캐릭터 특성 */
  added: string[];
  /** 보존도 0~1 = (Σ가져옴 w + 0.5 Σ변형함 w) ÷ Σ전체 요소 w */
  score: number;
  traps: TrapHit[];
};

/**
 * 캐릭터를 존재(원형)와 대조한다.
 * - 요소의 keywords·opposite는 특성마다 조사 인식 매처(word 모드)로 찾는다
 * - 함정 triggerWords는 특성과 메모에서 prefix 모드로 찾는다 (‘뿔이’, ‘호피무늬’도 잡도록)
 */
export function compareCharacter(being: Being, traits: string[], note: string, choices: ArchetypeChoices = {}): Comparison {
  const usedTraits = new Set<string>();
  const rows: ElementRow[] = being.elements.map((element) => {
    const kwTraits = traits.filter((t) => wordsIn(t, element.keywords, 'word').length);
    const opTraits = traits.filter((t) => wordsIn(t, element.opposite, 'word').length);
    [...kwTraits, ...opTraits].forEach((t) => usedTraits.add(t));
    let suggestion: ElementRow['suggestion'];
    if (opTraits.length) suggestion = { choice: '충돌', traits: opTraits, words: opTraits.flatMap((t) => wordsIn(t, element.opposite, 'word')) };
    else if (kwTraits.length) suggestion = { choice: '가져옴', traits: kwTraits, words: kwTraits.flatMap((t) => wordsIn(t, element.keywords, 'word')) };
    const c = choices[element.id] ?? {};
    return {
      element,
      suggestion,
      choice: c.choice,
      effective: c.choice ?? suggestion?.choice,
      intended: !!c.intended,
      noSource: !element.sources.some((s) => (s.title ?? '').trim()),
    };
  });

  const by = (ch: ElementChoice) => rows.filter((r) => r.effective === ch);
  const total = rows.reduce((n, r) => n + WEIGHT[r.element.weight], 0);
  const kept = by('가져옴');
  const changed = by('변형함');
  const score = total ? (kept.reduce((n, r) => n + WEIGHT[r.element.weight], 0) + 0.5 * changed.reduce((n, r) => n + WEIGHT[r.element.weight], 0)) / total : 0;

  const text = [...traits, note].join('\n');
  const traps = being.traps
    .map((trap) => ({ trap, words: wordsIn(text, trap.triggerWords, 'prefix') }))
    .filter((h) => h.words.length > 0);

  return {
    rows,
    cells: { kept, changed, droppedCore: by('버림').filter((r) => r.element.weight === 'core'), conflicts: by('충돌') },
    droppedOther: by('버림').filter((r) => r.element.weight !== 'core'),
    undecided: rows.filter((r) => !r.effective),
    added: traits.filter((t) => t.trim() && !usedTraits.has(t)),
    score,
    traps,
  };
}

/** 존재 이름·별칭이 캐릭터 이름이나 특성에 들어 있나 (연결 후보 찾기용) */
export function beingMentioned(being: Pick<Being, 'name' | 'aliases'>, text: string): boolean {
  return [being.name, ...being.aliases].some((n) => n.trim() && findTerm(text, { term: n.trim(), mode: 'prefix' }).length > 0);
}
