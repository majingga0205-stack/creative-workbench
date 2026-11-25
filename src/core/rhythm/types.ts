// 연재 실험실 계산 타입과 기준값. React·Dexie를 import하지 않는다.
import type { EndingTag } from '../../db/types';
import type { ParagraphMode } from '../korean';

export type { EndingTag };

/** 설정 화면에서 바꿀 수 있는 기준값 (SPEC 모듈 C) */
export type RhythmThresholds = {
  /** 이 길이 이하면 짧은 문장 (공백 제외 글자 수) */
  shortSentence: number;
  /** 이 길이 이상이면 긴 문장 */
  longSentence: number;
  /** 이 길이를 넘으면 '벽 문단' */
  wallParagraph: number;
  /** 문장 길이 이동 평균 창 크기 (문장 수) */
  movingAverageWindow: number;
  /** 엔딩 추정: 마지막 문장이 이 길이 이하면 절단 */
  cutMaxLength: number;
  /** 엔딩 추정: 마지막 문단이 서술이고 이 길이 이상이면 정리 */
  summaryMinLength: number;
  /** 직전 대비 연독률이 중앙값보다 이만큼(%p) 이상 낮으면 '꺾이는 구간' */
  breakDropPoints: number;
  /** 가설 비교에서 한쪽 집단이 이 회차 수보다 적으면 '표본 부족' */
  lowSampleSize: number;
  /** 독자 지표를 비교할 기준 '게시 후 일수' */
  compareDay: number;
};

export const DEFAULT_RHYTHM_THRESHOLDS: RhythmThresholds = {
  shortSentence: 15,
  longSentence: 60,
  wallParagraph: 200,
  movingAverageWindow: 5,
  cutMaxLength: 20,
  summaryMinLength: 80,
  breakDropPoints: 10,
  lowSampleSize: 5,
  compareDay: 3,
};

export type RhythmOptions = {
  thresholds?: Partial<RhythmThresholds>;
  paragraphMode?: ParagraphMode;
  sceneBreakSymbols?: readonly string[];
};

export type SentenceStat = {
  index: number;
  start: number;
  end: number;
  text: string;
  /** 공백 제외 글자 수 */
  length: number;
  isDialogue: boolean;
  endsWith: { exclaim: boolean; question: boolean; ellipsis: boolean };
};

export type ParagraphStat = { index: number; start: number; end: number; length: number };

export type HistogramBin = { from: number; to: number | null; label: string; count: number };

export type RhythmMetrics = {
  chars: { withSpaces: number; withoutSpaces: number };
  sentences: SentenceStat[];
  wave: { lengths: number[]; movingAverage: number[] };
  sentenceStats: { count: number; mean: number; median: number; stdev: number; shortRatio: number; longRatio: number };
  dialogue: { charRatio: number; sentenceRatio: number; dialogueChars: number; totalChars: number };
  paragraphs: { count: number; items: ParagraphStat[]; walls: ParagraphStat[]; histogram: HistogramBin[] };
  punctuation: { exclaimRatio: number; questionRatio: number; ellipsisRatio: number };
};
