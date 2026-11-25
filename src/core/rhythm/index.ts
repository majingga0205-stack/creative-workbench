// 연재 실험실 계산. 순수 함수만 있고 React·Dexie를 import하지 않는다.
export * from './types';
export { METRIC_DEFS, computeRhythm, countChars, paragraphHistogram, resolveThresholds, sentenceEnding, summarizeRhythm, type MetricDef, type MetricKind } from './metrics';
export { estimateEnding, type EndingEstimate } from './ending';
export { computeRetention, daysBetween, pickValues, type ChapterRef, type PickedValue, type Retention, type RetentionRow, type SnapshotLike } from './readers';
export {
  effectiveStatus,
  evaluateHypothesis,
  matchesCondition,
  parseChapterList,
  type ChapterRow,
  type GroupStat,
  type HypothesisCondition,
  type HypothesisField,
  type HypothesisLike,
  type HypothesisOp,
  type HypothesisResult,
  type HypothesisStatus,
} from './hypothesis';
export { compareMetrics, diffSentences, type MetricDiffRow, type SentenceDiffOp } from './compare';
export { mean, median, movingAverage, stdev } from './stats';
