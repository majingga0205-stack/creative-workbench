// 분석용 정규화와 위치 대응표.
// 맥에서 만든 파일처럼 한글이 자모로 풀어진(NFD) 원고도 같은 글자로 보이게 NFC로 합쳐서 분석하고,
// 결과 위치는 대응표로 원문 기준으로 되돌린다. (SPEC '원문 위치 보존')

export type PreparedText = {
  original: string;
  /** 분석용 글 (NFC) */
  norm: string;
  /** 정규화가 아무것도 바꾸지 않았으면 true (위치가 그대로) */
  identity: boolean;
  /** 분석용 글의 위치 → 원문 위치. 0 ≤ i ≤ norm.length */
  toOriginal: (i: number) => number;
};

const identityMap = (i: number) => i;

let segmenter: Intl.Segmenter | undefined;

export function prepareText(text: string): PreparedText {
  const nfc = text.normalize('NFC');
  if (nfc === text) return { original: text, norm: text, identity: true, toOriginal: identityMap };

  // 글자(grapheme) 단위로 나눠 각각 NFC로 합친다. 한글 자모 묶음(초성+중성+종성)은 한 글자로 묶인다.
  segmenter ??= new Intl.Segmenter('ko', { granularity: 'grapheme' });
  const map: number[] = [];
  let norm = '';
  for (const { segment, index } of segmenter.segment(text)) {
    const n = segment.normalize('NFC');
    for (let k = 0; k < n.length; k++) map.push(index);
    norm += n;
  }
  map.push(text.length);
  return { original: text, norm, identity: false, toOriginal: (i) => map[Math.max(0, Math.min(i, map.length - 1))] };
}
