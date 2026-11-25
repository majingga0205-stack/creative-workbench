import { describe, expect, it } from 'vitest';
import { isSceneBreakLine, splitParagraphs, splitScenes, splitSentences } from './split';
import type { Span } from './types';

const texts = (xs: { text: string }[]) => xs.map((x) => x.text);
/** 모든 결과가 원문.slice(start, end)와 같은지 */
const sliced = (text: string, xs: (Span & { text: string })[]) =>
  xs.every((x) => text.slice(x.start, x.end) === x.text);

describe('splitSentences', () => {
  it('마침표 뒤 공백에서 나눈다', () => {
    const t = '그가 왔다. 그리고 갔다.';
    const s = splitSentences(t);
    expect(texts(s)).toEqual(['그가 왔다.', '그리고 갔다.']);
    expect(s.map((x) => x.index)).toEqual([0, 1]);
    expect(sliced(t, s)).toBe(true);
  });

  it('대사 안 마침표: 대사 안에서도 나누고, 조각마다 대사로 표시한다', () => {
    const t = '“가자. 지금 당장.” 그가 말했다.';
    const s = splitSentences(t);
    expect(texts(s)).toEqual(['“가자.', '지금 당장.”', '그가 말했다.']);
    expect(s.map((x) => x.isDialogue)).toEqual([true, true, false]);
    expect(sliced(t, s)).toBe(true);
  });

  it('닫는 따옴표는 앞 문장에 붙이고, 그 뒤가 경계다', () => {
    const t = '“왔구나.”\n그가 말했다.';
    const s = splitSentences(t);
    expect(texts(s)).toEqual(['“왔구나.”', '그가 말했다.']);
    expect(s.map((x) => x.isDialogue)).toEqual([true, false]);
    expect(s[1].start).toBe(t.indexOf('그가'));
  });

  it('닫는 따옴표 뒤에 공백 없이 글이 이어지면 한 문장이다', () => {
    expect(texts(splitSentences('그는 “가자.”라고 말했다.'))).toEqual(['그는 “가자.”라고 말했다.']);
  });

  it('말줄임표 ...와 …', () => {
    expect(texts(splitSentences('그게... 아니야.'))).toEqual(['그게...', '아니야.']);
    expect(texts(splitSentences('그게…… 아니야.'))).toEqual(['그게……', '아니야.']);
    const t = '“정말…?” 그녀가 물었다.';
    const s = splitSentences(t);
    expect(texts(s)).toEqual(['“정말…?”', '그녀가 물었다.']);
    expect(s[0].isDialogue).toBe(true);
  });

  it('?! 같은 연속 부호는 한 번에 끝난다', () => {
    expect(texts(splitSentences('뭐?! 진짜?'))).toEqual(['뭐?!', '진짜?']);
  });

  it('숫자 속 마침표는 경계가 아니다', () => {
    expect(texts(splitSentences('3.14를 외웠다.'))).toEqual(['3.14를 외웠다.']);
  });

  it('줄바꿈은 언제나 경계 (마침표가 없어도)', () => {
    expect(texts(splitSentences('그는 멈췄다\n다음 줄'))).toEqual(['그는 멈췄다', '다음 줄']);
  });

  it('「 」, 『 』, 곧은 따옴표도 대사로 본다', () => {
    expect(splitSentences('「됐다.」 그가 웃었다.').map((x) => x.isDialogue)).toEqual([true, false]);
    expect(splitSentences('『그만.』').map((x) => x.isDialogue)).toEqual([true]);
    expect(splitSentences('"가자." 그가 말했다.').map((x) => x.isDialogue)).toEqual([true, false]);
  });

  it('닫는 따옴표 뒤에 인용 표현(하고·라고 등)이 오면 한 문장이다', () => {
    expect(texts(splitSentences('그는 ‘이상하다.’ 하고 생각했다.'))).toEqual(['그는 ‘이상하다.’ 하고 생각했다.']);
    const s = splitSentences('“불이야!” 하는 소리가 들렸다. 모두 뛰었다.');
    expect(texts(s)).toEqual(['“불이야!” 하는 소리가 들렸다.', '모두 뛰었다.']);
    expect(s[0].isDialogue).toBe(false);
    // 인용 표현 목록은 바꿀 수 있다
    expect(splitSentences('‘이상하다.’ 하고 생각했다.', { quotatives: [] })).toHaveLength(2);
  });

  it('따옴표가 닫힌 뒤 서술이 이어지는 문장은 대사가 아니다 (책 제목 『 』 등)', () => {
    expect(splitSentences('『경제육전』을 덮었다.')[0].isDialogue).toBe(false);
    expect(splitSentences('“가자,” 그가 말했다.')[0].isDialogue).toBe(false);
    expect(splitSentences('“가자.”')[0].isDialogue).toBe(true);
    expect(splitSentences('“가자” “어디로”')[0].isDialogue).toBe(true);
  });

  it('작은따옴표(생각)는 대사가 아니지만 닫는 부호는 앞 문장에 붙는다', () => {
    const s = splitSentences('‘이상하다.’ 그는 생각했다.');
    expect(texts(s)).toEqual(['‘이상하다.’', '그는 생각했다.']);
    expect(s.map((x) => x.isDialogue)).toEqual([false, false]);
  });

  it('줄바꿈만 있는 웹소설식 원고', () => {
    const t = '문이 열렸다.\n“누구냐.”\n대답은 없었다.';
    const s = splitSentences(t);
    expect(texts(s)).toEqual(['문이 열렸다.', '“누구냐.”', '대답은 없었다.']);
    expect(s.map((x) => x.isDialogue)).toEqual([false, true, false]);
    expect(sliced(t, s)).toBe(true);
  });

  it('빈 줄로 문단을 나눈 원고에서도 빈 문장이 생기지 않는다', () => {
    const t = '문이 열렸다.\n\n\n대답은 없었다.\n';
    expect(texts(splitSentences(t))).toEqual(['문이 열렸다.', '대답은 없었다.']);
  });

  it('들여쓰기(공백·전각 공백)는 문장 위치에서 뺀다', () => {
    const t = '  첫 문장.\n　둘째 문장.';
    const s = splitSentences(t);
    expect(texts(s)).toEqual(['첫 문장.', '둘째 문장.']);
    expect(s[0].start).toBe(2);
    expect(sliced(t, s)).toBe(true);
  });

  it('장면 구분선 줄은 문장이 아니다', () => {
    expect(texts(splitSentences('가.\n=====\n나.'))).toEqual(['가.', '나.']);
  });

  it('줄 안에서 닫히지 않은 따옴표는 그 줄 끝까지 대사로 본다', () => {
    const s = splitSentences('“이건 길다. 아직 안 끝났다');
    expect(s.map((x) => x.isDialogue)).toEqual([true, true]);
  });

  it('빈 글', () => {
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences('\n\n  \n')).toEqual([]);
  });
});

describe('splitParagraphs', () => {
  const webNovel = '문이 열렸다.\n“누구냐.”\n\n대답은 없었다.';

  it("'line' 모드(기본): 빈 줄이 아닌 줄 하나가 문단 하나", () => {
    const p = splitParagraphs(webNovel);
    expect(texts(p)).toEqual(['문이 열렸다.', '“누구냐.”', '대답은 없었다.']);
    expect(sliced(webNovel, p)).toBe(true);
  });

  it("'blank' 모드: 빈 줄로 나뉜 덩어리가 문단 하나", () => {
    const p = splitParagraphs(webNovel, { mode: 'blank' });
    expect(texts(p)).toEqual(['문이 열렸다.\n“누구냐.”', '대답은 없었다.']);
    expect(sliced(webNovel, p)).toBe(true);
  });

  it('빈 줄로 문단을 나눈 원고는 두 모드 결과가 같다', () => {
    const t = '첫째 문단.\n\n둘째 문단.\n\n\n셋째 문단.\n';
    expect(texts(splitParagraphs(t))).toEqual(['첫째 문단.', '둘째 문단.', '셋째 문단.']);
    expect(texts(splitParagraphs(t, { mode: 'blank' }))).toEqual(['첫째 문단.', '둘째 문단.', '셋째 문단.']);
  });

  it('장면 구분선은 문단이 아니고, blank 모드에서는 경계가 된다', () => {
    expect(texts(splitParagraphs('가.\n===\n나.'))).toEqual(['가.', '나.']);
    expect(texts(splitParagraphs('가.\n나.\n===\n다.', { mode: 'blank' }))).toEqual(['가.\n나.', '다.']);
  });

  it('앞뒤 공백은 문단 위치에서 뺀다', () => {
    const t = '  들여쓴 문단.  \n';
    const [p] = splitParagraphs(t);
    expect(p.text).toBe('들여쓴 문단.');
    expect(p.start).toBe(2);
  });
});

describe('isSceneBreakLine', () => {
  it.each(['=', '=====', '= = =', '***', '* * *', '---', '◆', '◇◇◇', '  ===  ', '＝＝＝', '＊ ＊ ＊'])('구분선: %j', (line) => {
    expect(isSceneBreakLine(line)).toBe(true);
  });

  it.each(['……', '...', '!', '?', '~~~', 'A=B', '=*=', '=a=', '', '   ', '◆◇'])('구분선 아님: %j', (line) => {
    expect(isSceneBreakLine(line)).toBe(false);
  });

  it('기호 목록을 바꿀 수 있다', () => {
    expect(isSceneBreakLine('###', ['#'])).toBe(true);
    expect(isSceneBreakLine('===', ['#'])).toBe(false);
  });
});

describe('splitScenes', () => {
  it('구분선(=, =====, = = =, ***)으로 나눈다', () => {
    const t = '첫 장면.\n=\n둘째 장면.\n=====\n셋째 장면.\n= = =\n넷째.\n***\n다섯째.';
    const s = splitScenes(t);
    expect(texts(s)).toEqual(['첫 장면.', '둘째 장면.', '셋째 장면.', '넷째.', '다섯째.']);
    expect(s.map((x) => x.index)).toEqual([0, 1, 2, 3, 4]);
    expect(sliced(t, s)).toBe(true);
  });

  it('회차마다 기호가 바뀌어도 목록 안의 기호면 모두 잡는다', () => {
    expect(splitScenes('가.\n◆\n나.\n---\n다.')).toHaveLength(3);
  });

  it('구분선이 아닌 줄(……, A=B, =*=)에서는 나누지 않는다', () => {
    const t = '그는 말이 없었다.\n……\nA=B라는 식.\n=*=\n끝.';
    expect(splitScenes(t)).toHaveLength(1);
  });

  it('장면 안의 빈 줄과 여러 줄은 그대로 둔다', () => {
    const t = '가.\n\n나.\n=====\n\n다.\n';
    expect(texts(splitScenes(t))).toEqual(['가.\n\n나.', '다.']);
  });

  it('맨 앞·맨 끝·연속 구분선은 빈 장면을 만들지 않는다', () => {
    expect(texts(splitScenes('===\n가.\n===\n===\n나.\n==='))).toEqual(['가.', '나.']);
  });

  it('구분선이 없으면 글 전체가 장면 하나', () => {
    const t = '\n  하나뿐인 장면.\n';
    const s = splitScenes(t);
    expect(texts(s)).toEqual(['하나뿐인 장면.']);
    expect(s[0].start).toBe(3);
  });

  it('빈 글은 장면이 없다', () => {
    expect(splitScenes('')).toEqual([]);
    expect(splitScenes('=====')).toEqual([]);
  });

  it('기호 목록을 바꿀 수 있다', () => {
    expect(splitScenes('가.\n###\n나.', { sceneBreakSymbols: ['#'] })).toHaveLength(2);
    expect(splitScenes('가.\n===\n나.', { sceneBreakSymbols: ['#'] })).toHaveLength(1);
  });
});
