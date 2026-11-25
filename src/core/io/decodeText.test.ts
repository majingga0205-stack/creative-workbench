import { describe, expect, it } from 'vitest';
import { decodeText, guessChapterNumber, guessChapterTitle, normalizeNewlines } from './decodeText';

const utf8 = (s: string) => new TextEncoder().encode(s);

describe('decodeText', () => {
  it('UTF-8을 그대로 읽는다', () => {
    expect(decodeText(utf8('감자를 캐다'))).toEqual({ text: '감자를 캐다', encoding: 'utf-8' });
  });

  it('UTF-8 BOM을 떼어 낸다', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('첫 줄')]);
    expect(decodeText(bytes).text).toBe('첫 줄');
  });

  it('UTF-8로 깨지면 EUC-KR로 다시 읽는다', () => {
    // '감자' = B0 A8 C0 DA (EUC-KR), 뒤에 공백·'1화'
    const bytes = new Uint8Array([0xb0, 0xa8, 0xc0, 0xda, 0x20, 0x31, 0xc8, 0xad]);
    expect(decodeText(bytes)).toEqual({ text: '감자 1화', encoding: 'euc-kr' });
  });

  it('UTF-16LE BOM 파일을 읽는다', () => {
    const s = '고구마';
    const bytes = new Uint8Array(2 + s.length * 2);
    bytes[0] = 0xff;
    bytes[1] = 0xfe;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      bytes[2 + i * 2] = c & 0xff;
      bytes[3 + i * 2] = c >> 8;
    }
    expect(decodeText(bytes)).toEqual({ text: '고구마', encoding: 'utf-16le' });
  });

  it('줄바꿈을 LF로 맞춘다', () => {
    expect(decodeText(utf8('가\r\n나\r다')).text).toBe('가\n나\n다');
    expect(normalizeNewlines('a\r\n\r\nb')).toBe('a\n\nb');
  });

  it('ArrayBuffer도 받는다', () => {
    const u = utf8('담배');
    expect(decodeText(u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer).text).toBe('담배');
  });
});

describe('파일 이름에서 회차 정보 추정', () => {
  it.each([
    ['03화_시작.txt', 3, '시작'],
    ['제12화 귀향.txt', 12, '귀향'],
    ['5. 밤길.txt', 5, '밤길'],
    ['프롤로그.txt', undefined, '프롤로그'],
    ['chapter 7.txt', 7, 'chapter 7'],
  ])('%s', (name, num, title) => {
    expect(guessChapterNumber(name)).toBe(num);
    expect(guessChapterTitle(name)).toBe(title);
  });
});
