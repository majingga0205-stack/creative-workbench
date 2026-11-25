import { describe, expect, it } from 'vitest';
import { MYTH_SEED } from '../../seed/mythSeed';
import type { Being } from '../../db/types';
import { beingMentioned, compareCharacter, WEIGHT } from './index';

const being = (id: string) => MYTH_SEED.find((b) => b.id === id)!;
const dokkaebi = being('seed-dokkaebi');
const gumiho = being('seed-gumiho');

describe('시드', () => {
  it('SPEC 표의 구미호·도깨비·산군만, 전부 미검증, 출처는 비어 있다', () => {
    expect(MYTH_SEED.map((b) => b.name)).toEqual(['구미호', '도깨비', '산군(호랑이)']);
    const els = MYTH_SEED.flatMap((b) => b.elements);
    expect(els.map((e) => e.label)).toEqual([
      '꼬리 아홉 달린 여우', '사람·주로 여인으로 둔갑', '사람의 간이나 정기를 노림', '여우 구슬',
      '사람 손때 묻은 낡은 물건이 변함', '요술 방망이', '씨름·내기를 좋아함', '도깨비불', '메밀묵을 좋아함',
      '산신 또는 산신의 사자로 모셔짐', '산신도에 산신과 함께 그려짐',
    ]);
    expect(els.map((e) => e.weight)).toEqual(['core', 'core', 'common', 'common', 'common', 'common', 'common', 'common', 'variant', 'core', 'common']);
    expect([...els, ...MYTH_SEED.flatMap((b) => b.traps)].every((x) => !x.verified && x.sources.length === 0)).toBe(true);
    expect(els.every((e) => e.opposite.length === 0)).toBe(true);
  });

  it("도깨비 함정 트리거는 '뿔'·'호피'·'쇠몽둥이'이고 '방망이'는 넣지 않는다", () => {
    expect(dokkaebi.traps[0].triggerWords).toEqual(['뿔', '호피', '쇠몽둥이']);
  });
});

describe('고증 함정 경고', () => {
  it("특성에 '뿔'을 넣으면 경고, '방망이'만 넣으면 경고 없음", () => {
    expect(compareCharacter(dokkaebi, ['뿔'], '').traps.map((t) => t.words)).toEqual([['뿔']]);
    expect(compareCharacter(dokkaebi, ['방망이'], '').traps).toEqual([]);
    expect(compareCharacter(dokkaebi, ['요술 방망이'], '').traps).toEqual([]);
  });

  it('메모(설명)에서도 찾고, 붙어 쓴 말(뿔이 난, 호피무늬)도 잡는다', () => {
    expect(compareCharacter(dokkaebi, [], '머리에 뿔이 난 거인').traps).toHaveLength(1);
    expect(compareCharacter(dokkaebi, ['호피무늬 옷'], '').traps[0].words).toEqual(['호피']);
  });
});

describe('내 캐릭터 대조', () => {
  it('특성에 keywords가 있으면 가져옴을 제안한다', () => {
    const r = compareCharacter(dokkaebi, ['요술 방망이', '씨름을 좋아함', '말이 많음'], '');
    const club = r.rows.find((x) => x.element.id === 'dokkaebi-club')!;
    expect(club.suggestion).toMatchObject({ choice: '가져옴', words: ['요술 방망이', '방망이'] });
    expect(club.effective).toBe('가져옴');
    expect(r.cells.kept.map((x) => x.element.id)).toEqual(['dokkaebi-club', 'dokkaebi-wrestling']);
    expect(r.added).toEqual(['말이 많음']);
  });

  it('opposite가 있으면 충돌을 제안하고, 확정 선택이 제안보다 앞선다', () => {
    const custom: Being = {
      ...gumiho,
      elements: gumiho.elements.map((e) => (e.id === 'gumiho-shapeshift' ? { ...e, opposite: ['둔갑하지 못함'] } : e)),
    };
    const r = compareCharacter(custom, ['둔갑하지 못함'], '');
    expect(r.cells.conflicts.map((x) => x.element.id)).toEqual(['gumiho-shapeshift']);
    const confirmed = compareCharacter(custom, ['둔갑하지 못함'], '', { 'gumiho-shapeshift': { choice: '변형함' } });
    expect(confirmed.cells.conflicts).toEqual([]);
    expect(confirmed.cells.changed.map((x) => x.element.id)).toEqual(['gumiho-shapeshift']);
  });

  it('네 칸: 가져온 것 / 바꾼 것 / 버린 핵심 요소 / 원형과 충돌', () => {
    const r = compareCharacter(gumiho, [], '', {
      'gumiho-tails': { choice: '가져옴' },
      'gumiho-shapeshift': { choice: '버림', intended: true },
      'gumiho-liver': { choice: '버림' },
      'gumiho-bead': { choice: '충돌' },
    });
    expect(r.cells.kept.map((x) => x.element.id)).toEqual(['gumiho-tails']);
    expect(r.cells.droppedCore.map((x) => x.element.id)).toEqual(['gumiho-shapeshift']);
    expect(r.cells.droppedCore[0].intended).toBe(true);
    expect(r.droppedOther.map((x) => x.element.id)).toEqual(['gumiho-liver']);
    expect(r.cells.conflicts.map((x) => x.element.id)).toEqual(['gumiho-bead']);
  });

  it('보존도 = (Σ가져옴 w + 0.5 Σ변형함 w) ÷ Σ전체 w, 핵심 3 · 흔함 2 · 일부 판본 1', () => {
    expect(WEIGHT).toEqual({ core: 3, common: 2, variant: 1 });
    const r = compareCharacter(gumiho, [], '', {
      'gumiho-tails': { choice: '가져옴' }, // 3
      'gumiho-shapeshift': { choice: '변형함' }, // 3 × 0.5
      'gumiho-liver': { choice: '버림' },
    });
    expect(r.score).toBeCloseTo((3 + 1.5) / (3 + 3 + 2 + 2));
    expect(r.undecided.map((x) => x.element.id)).toEqual(['gumiho-bead']);
  });

  it('출처가 없는 요소는 표시한다 (대조 결과에서 회색)', () => {
    expect(compareCharacter(gumiho, [], '').rows.every((x) => x.noSource)).toBe(true);
    const withSource = { ...gumiho, elements: [{ ...gumiho.elements[0], sources: [{ title: '한국민속대백과사전', type: '사전' as const }] }] };
    expect(compareCharacter(withSource, [], '').rows[0].noSource).toBe(false);
  });

  it('특성이 없으면 보존도 0, 제안 없음', () => {
    const r = compareCharacter(dokkaebi, [], '');
    expect(r.score).toBe(0);
    expect(r.undecided).toHaveLength(5);
  });
});

it('존재 이름·별칭이 들어 있나', () => {
  expect(beingMentioned(being('seed-sangun'), '호랑이 혼을 받은 산사람')).toBe(true);
  expect(beingMentioned(gumiho, '여우 같은 사람')).toBe(false);
});
