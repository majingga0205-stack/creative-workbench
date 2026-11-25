// 가설 기록·결과 확인 (SPEC 모듈 C). 앱은 숫자만 보여주고 지지·기각은 사용자가 정한다.
import { mean, median } from './stats';
import type { EndingTag } from './types';

export type HypothesisField = 'endingTag' | 'dialogueRatio' | 'length' | 'custom';
export type HypothesisOp = '=' | '>' | '<';
export type HypothesisStatus = '대기' | '확인할 때 됨' | '지지됨' | '기각' | '보류';

export type HypothesisCondition = { field: HypothesisField; op: HypothesisOp; value: string | number };

export type HypothesisLike = {
  condition: HypothesisCondition;
  metric: string;
  target: 'same' | 'next';
  checkAfterChapter: number;
  status: HypothesisStatus;
};

/** 회차 하나의 요약: 원고 지표 + 독자 지표 */
export type ChapterRow = {
  number: number;
  endingTag?: EndingTag;
  /** 대사 비율(글자 기준) 0~1 */
  dialogueRatio: number;
  /** 공백 제외 글자 수 */
  length: number;
  metrics: Record<string, number | undefined>;
};

/**
 * 조건에 맞는 회차인가.
 * - endingTag: 태그가 값과 같음 ('=')
 * - dialogueRatio: 값은 % (예: 50 → 50%)
 * - length: 공백 제외 글자 수
 * - custom: 값은 회차 번호 목록 ("3, 5, 7") — 직접 고른 회차
 */
export function matchesCondition(row: ChapterRow, c: HypothesisCondition): boolean {
  const cmp = (x: number, v: number) => (c.op === '>' ? x > v : c.op === '<' ? x < v : x === v);
  switch (c.field) {
    case 'endingTag':
      return row.endingTag !== undefined && row.endingTag === c.value;
    case 'dialogueRatio':
      return cmp(Math.round(row.dialogueRatio * 1000) / 10, Number(c.value));
    case 'length':
      return cmp(row.length, Number(c.value));
    case 'custom':
      return parseChapterList(String(c.value)).includes(row.number);
  }
}

export function parseChapterList(s: string): number[] {
  return s
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

export type GroupStat = { n: number; mean: number; median: number; numbers: number[] };

export type HypothesisResult = {
  inGroup: GroupStat;
  outGroup: GroupStat;
  /** 한쪽 집단이 기준보다 적다 → '표본 부족 — 참고만' */
  lowSample: boolean;
};

/**
 * 조건에 맞는 회차 집단과 나머지의 지표를 비교한다.
 * target 'next'면 그 회차 '다음 회차'의 지표를 쓴다 (엔딩 가설의 기본).
 * rows는 회차 순서대로.
 */
export function evaluateHypothesis(h: HypothesisLike, rows: ChapterRow[], lowSampleSize: number): HypothesisResult {
  const sorted = [...rows].sort((a, b) => a.number - b.number);
  const inVals: number[] = [];
  const outVals: number[] = [];
  const inNums: number[] = [];
  const outNums: number[] = [];
  sorted.forEach((row, i) => {
    const targetRow = h.target === 'next' ? sorted[i + 1] : row;
    const v = targetRow?.metrics[h.metric];
    if (v === undefined) return;
    if (matchesCondition(row, h.condition)) {
      inVals.push(v);
      inNums.push(row.number);
    } else {
      outVals.push(v);
      outNums.push(row.number);
    }
  });
  const stat = (vals: number[], numbers: number[]): GroupStat => ({ n: vals.length, mean: mean(vals), median: median(vals), numbers });
  return {
    inGroup: stat(inVals, inNums),
    outGroup: stat(outVals, outNums),
    lowSample: Math.min(inVals.length, outVals.length) < lowSampleSize,
  };
}

/** '대기' 가설의 확인 회차(또는 그 뒤)에 지표가 들어왔으면 '확인할 때 됨' */
export function effectiveStatus(h: HypothesisLike, rows: ChapterRow[]): HypothesisStatus {
  if (h.status !== '대기') return h.status;
  const due = rows.some((r) => r.number >= h.checkAfterChapter && r.metrics[h.metric] !== undefined);
  return due ? '확인할 때 됨' : '대기';
}
