import { describe, expect, it } from 'vitest';
import { prepareText } from './normalize';

describe('prepareText (분석용 정규화 + 위치 대응표)', () => {
  it('이미 NFC인 글은 그대로 쓰고 위치도 그대로다', () => {
    const p = prepareText('감자를 캐다');
    expect(p.norm).toBe('감자를 캐다');
    expect(p.identity).toBe(true);
    expect(p.toOriginal(3)).toBe(3);
    expect(p.toOriginal(p.norm.length)).toBe('감자를 캐다'.length);
  });

  it('자모가 풀어진(NFD) 한글을 합치고, 위치는 원문 기준으로 되돌린다', () => {
    const original = '감자'.normalize('NFD') + '를 캐다'; // 감 = 3자, 자 = 2자
    expect(original.length).toBe(9);
    const p = prepareText(original);
    expect(p.norm).toBe('감자를 캐다');
    expect(p.identity).toBe(false);
    // 정규화 글의 '자'(1) → 원문 3, '를'(2) → 원문 5, 끝(6) → 원문 끝(9)
    expect(p.toOriginal(0)).toBe(0);
    expect(p.toOriginal(1)).toBe(3);
    expect(p.toOriginal(2)).toBe(5);
    expect(p.toOriginal(p.norm.length)).toBe(original.length);
    expect(original.slice(p.toOriginal(0), p.toOriginal(2))).toBe('감자'.normalize('NFD'));
  });

  it('빈 글', () => {
    const p = prepareText('');
    expect(p.norm).toBe('');
    expect(p.toOriginal(0)).toBe(0);
  });
});
