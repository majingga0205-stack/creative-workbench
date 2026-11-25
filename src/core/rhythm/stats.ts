// 작은 통계 도구

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 모표준편차 */
export function stdev(xs: number[]): number {
  if (!xs.length) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** 가운데 맞춤 이동 평균. 양 끝은 있는 값만으로 평균 낸다. */
export function movingAverage(xs: number[], window: number): number[] {
  const w = Math.max(1, Math.floor(window));
  const left = Math.floor((w - 1) / 2);
  const right = w - 1 - left;
  return xs.map((_, i) => mean(xs.slice(Math.max(0, i - left), Math.min(xs.length, i + right + 1))));
}

export const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : 0);
