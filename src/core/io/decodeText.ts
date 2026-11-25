// .txt 원고 읽기. UTF-8로 먼저 읽고, 깨지면 EUC-KR로 다시 읽는다. (SPEC 연재 실험실 '원고 입력')

export type TextEncodingName = 'utf-8' | 'utf-16le' | 'utf-16be' | 'euc-kr';

export type DecodedText = { text: string; encoding: TextEncodingName };

export function decodeText(input: ArrayBuffer | Uint8Array): DecodedText {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: normalizeNewlines(new TextDecoder('utf-16le').decode(bytes.subarray(2))), encoding: 'utf-16le' };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: normalizeNewlines(new TextDecoder('utf-16be').decode(bytes.subarray(2))), encoding: 'utf-16be' };
  }

  try {
    // fatal: 잘못된 UTF-8 바이트가 있으면 예외. ignoreBOM: false라서 UTF-8 BOM은 자동으로 빠진다.
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { text: normalizeNewlines(text), encoding: 'utf-8' };
  } catch {
    const text = new TextDecoder('euc-kr').decode(bytes);
    return { text: normalizeNewlines(text), encoding: 'euc-kr' };
  }
}

/** CRLF·CR을 LF로. 저장되는 원문은 이 결과이므로 이후 start/end 위치는 이 텍스트 기준이다. */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** 파일 이름에서 회차 번호 추정: '03화_시작.txt' → 3, 번호가 없으면 undefined */
export function guessChapterNumber(fileName: string): number | undefined {
  const base = fileName.replace(/\.[^.]+$/, '');
  const m = base.match(/(\d+)\s*(?:화|회|장|편)/) ?? base.match(/(\d+)/);
  return m ? Number(m[1]) : undefined;
}

/** 파일 이름에서 회차 제목 추정: 확장자와 앞쪽 번호를 뗀 나머지 */
export function guessChapterTitle(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/^\s*(?:제\s*)?\d+\s*(?:화|회|장|편)?[\s._\-–—:)]*/, '')
    .trim();
}
