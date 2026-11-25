import { describe, expect, it } from 'vitest';
import { DEFAULT_JOSA, findTerm, matchTerm, ruleMatcher } from './matchTerm';

const spans = (ms: { start: number; end: number }[]) => ms.map((m) => [m.start, m.end]);

describe('matchTerm — word 모드 (기본)', () => {
  it("'감자를 캐다' → '감자' 매칭 (조사 '를')", () => {
    const ms = matchTerm('감자를 캐다', '감자');
    expect(ms).toHaveLength(1);
    expect(ms[0]).toMatchObject({ start: 0, end: 2, text: '감자', form: '감자', josa: '를' });
  });

  it("'감자밭' → 매칭 안 됨", () => {
    expect(matchTerm('감자밭을 갈았다', '감자')).toEqual([]);
  });

  it('뒤가 끝·공백·문장부호면 매칭', () => {
    expect(spans(matchTerm('고구마와 감자', '감자'))).toEqual([[5, 7]]);
    expect(spans(matchTerm('감자, 고추.', '감자'))).toEqual([[0, 2]]);
    expect(spans(matchTerm('“감자!”', '감자'))).toEqual([[1, 3]]);
    expect(matchTerm('감자 한 알', '감자')[0].josa).toBeUndefined();
  });

  it('앞이 한글 음절이면 매칭 안 됨', () => {
    expect(matchTerm('왕감자를 샀다', '감자')).toEqual([]);
    expect(matchTerm('푼고추를 샀다', '고추')).toEqual([]);
  });

  it('조사가 겹쳐도 첫 조사로 인정하고, 가장 긴 조사를 기록한다', () => {
    expect(matchTerm('감자만으로도 충분', '감자')[0].josa).toBe('만');
    expect(matchTerm('감자에서 싹이', '감자')[0].josa).toBe('에서');
    expect(matchTerm('이것은 감자이다.', '감자')[0].josa).toBe('이다');
    expect(matchTerm('그것은 담배였다.', '담배')[0].josa).toBe('였');
  });

  it('조사가 아닌 글자가 붙으면 매칭 안 됨', () => {
    expect(matchTerm('경제적 이유', '경제')).toEqual([]);
    expect(matchTerm('감자3개', '감자')).toEqual([]);
  });

  it("알려진 한계: 조사와 같은 글자로 시작하는 낱말('경제인')도 잡히고, 예외 목록으로 막는다", () => {
    expect(matchTerm('경제인 모임', '경제')).toHaveLength(1);
    expect(matchTerm('경제인 모임', '경제', { exclude: ['경제인'] })).toEqual([]);
  });

  it('여러 번 나오면 모두 찾는다', () => {
    expect(spans(matchTerm('감자와 감자를', '감자'))).toEqual([
      [0, 2],
      [4, 6],
    ]);
  });

  it('조사 목록을 바꿀 수 있다', () => {
    expect(matchTerm('감자와 고추', '감자', { josa: ['를'] })).toEqual([]);
    expect(matchTerm('감자를 캐다', '감자', { josa: ['를'] })).toHaveLength(1);
    expect(DEFAULT_JOSA).toContain('이었');
  });

  it('빈 표제어는 아무것도 찾지 않는다', () => {
    expect(matchTerm('감자', '')).toEqual([]);
  });
});

describe('matchTerm — prefix 모드', () => {
  it("'감자밭' → prefix 모드에서는 매칭", () => {
    expect(spans(matchTerm('감자밭을 갈았다', '감자', { mode: 'prefix' }))).toEqual([[0, 2]]);
  });

  it('prefix 모드도 앞이 한글이면 안 됨', () => {
    expect(matchTerm('왕감자밭', '감자', { mode: 'prefix' })).toEqual([]);
  });
});

describe('예외 목록', () => {
  it("'경제육전' 예외 → '경제' 매칭 안 됨", () => {
    const text = '『경제육전』을 펴냈다. 경제가 어렵다.';
    expect(spans(matchTerm(text, '경제', { mode: 'prefix' }))).toEqual([
      [1, 3],
      [13, 15],
    ]);
    expect(spans(matchTerm(text, '경제', { mode: 'prefix', exclude: ['경제육전'] }))).toEqual([[13, 15]]);
    expect(spans(matchTerm(text, '경제', { exclude: ['경제육전'] }))).toEqual([[13, 15]]);
  });
});

describe('findTerm — 표제어 + 별칭', () => {
  it("'푼고추' → '고추'는 안 됨, 별칭에 '푼고추'를 넣으면 매칭", () => {
    expect(findTerm('푼고추를 넣었다', { term: '고추' })).toEqual([]);
    const ms = findTerm('푼고추를 넣었다', { term: '고추', aliases: ['푼고추'] });
    expect(ms).toHaveLength(1);
    expect(ms[0]).toMatchObject({ start: 0, end: 3, form: '푼고추', josa: '를' });
  });

  it('겹치는 매칭은 더 긴 것 하나만 남긴다', () => {
    const ms = findTerm('고추장과 고추', { term: '고추', aliases: ['고추장'], mode: 'prefix' });
    expect(ms.map((m) => [m.start, m.end, m.form])).toEqual([
      [0, 3, '고추장'],
      [5, 7, '고추'],
    ]);
  });

  it('결과는 원문 위치 순서', () => {
    const ms = findTerm('하 대리가 왔다. 하람은 웃었다.', { term: '하람', aliases: ['하 대리'] });
    expect(ms.map((m) => m.form)).toEqual(['하 대리', '하람']);
  });

  it('ruleMatcher는 TermMatcher 인터페이스로 같은 결과를 준다', () => {
    expect(ruleMatcher.find('감자를', { term: '감자' })).toEqual(findTerm('감자를', { term: '감자' }));
  });
});

describe('위치는 원문 기준', () => {
  it('자모가 풀어진(NFD) 원문에서도 원문 위치를 돌려준다', () => {
    const text = '그는 ' + '감자'.normalize('NFD') + '를 캤다';
    const [m] = matchTerm(text, '감자');
    expect(m.start).toBe(3);
    expect(m.end).toBe(8);
    expect(text.slice(m.start, m.end)).toBe(m.text);
    expect(m.text.normalize('NFC')).toBe('감자');
  });

  it('찾은 글자는 언제나 원문.slice(start, end)와 같다', () => {
    const text = '“고추장은 고추로 만든다.” 고추, 고추를, 고추밭';
    for (const m of findTerm(text, { term: '고추', aliases: ['고추장'] })) {
      expect(text.slice(m.start, m.end)).toBe(m.text);
    }
  });
});
