// 리듬 지표 (SPEC 모듈 C '리듬 지표'). 버전 하나의 원고를 받아 계산한다.
import { splitParagraphs, splitSentences } from '../korean';
import { mean, median, movingAverage, ratio, stdev, sum } from './stats';
import {
  DEFAULT_RHYTHM_THRESHOLDS,
  type HistogramBin,
  type ParagraphStat,
  type RhythmMetrics,
  type RhythmOptions,
  type RhythmThresholds,
  type SentenceStat,
} from './types';

/** 글자 수 (코드 포인트 기준). 공백 포함은 줄바꿈을 빼고 센다. */
export function countChars(s: string): { withSpaces: number; withoutSpaces: number } {
  return {
    withSpaces: [...s.replace(/[\r\n]/g, '')].length,
    withoutSpaces: [...s.replace(/\s/g, '')].length,
  };
}

const CLOSERS = /[”"’'」』)）\]》〉]+$/;

/** 문장 끝 부호 (닫는 따옴표·괄호를 뗀 뒤) */
export function sentenceEnding(text: string): SentenceStat['endsWith'] & { dash: boolean } {
  const t = text.trimEnd().replace(CLOSERS, '');
  const run = t.match(/[.!?…‥。—―]+$/)?.[0] ?? '';
  return {
    exclaim: run.includes('!'),
    question: run.includes('?'),
    ellipsis: run.includes('…') || run.includes('‥') || run.includes('..'),
    dash: run.endsWith('—') || run.endsWith('―'),
  };
}

export function resolveThresholds(t?: Partial<RhythmThresholds>): RhythmThresholds {
  return { ...DEFAULT_RHYTHM_THRESHOLDS, ...t };
}

export function computeRhythm(text: string, options: RhythmOptions = {}): RhythmMetrics {
  const th = resolveThresholds(options.thresholds);
  const split = { sceneBreakSymbols: options.sceneBreakSymbols };

  const sentences: SentenceStat[] = splitSentences(text, split).map((s) => {
    const e = sentenceEnding(s.text);
    return {
      index: s.index,
      start: s.start,
      end: s.end,
      text: s.text,
      length: countChars(s.text).withoutSpaces,
      isDialogue: s.isDialogue,
      endsWith: { exclaim: e.exclaim, question: e.question, ellipsis: e.ellipsis },
    };
  });
  const lengths = sentences.map((s) => s.length);
  const n = sentences.length;

  const totalChars = sum(lengths);
  const dialogueChars = sum(sentences.filter((s) => s.isDialogue).map((s) => s.length));

  const items: ParagraphStat[] = splitParagraphs(text, { ...split, mode: options.paragraphMode }).map((p) => ({
    index: p.index,
    start: p.start,
    end: p.end,
    length: countChars(p.text).withoutSpaces,
  }));

  return {
    chars: countChars(text),
    sentences,
    wave: { lengths, movingAverage: movingAverage(lengths, th.movingAverageWindow) },
    sentenceStats: {
      count: n,
      mean: mean(lengths),
      median: median(lengths),
      stdev: stdev(lengths),
      shortRatio: ratio(lengths.filter((l) => l <= th.shortSentence).length, n),
      longRatio: ratio(lengths.filter((l) => l >= th.longSentence).length, n),
    },
    dialogue: {
      charRatio: ratio(dialogueChars, totalChars),
      sentenceRatio: ratio(sentences.filter((s) => s.isDialogue).length, n),
      dialogueChars,
      totalChars,
    },
    paragraphs: {
      count: items.length,
      items,
      walls: items.filter((p) => p.length > th.wallParagraph),
      histogram: paragraphHistogram(items.map((p) => p.length), th.wallParagraph),
    },
    punctuation: {
      exclaimRatio: ratio(sentences.filter((s) => s.endsWith.exclaim).length, n),
      questionRatio: ratio(sentences.filter((s) => s.endsWith.question).length, n),
      ellipsisRatio: ratio(sentences.filter((s) => s.endsWith.ellipsis).length, n),
    },
  };
}

/** 문단 길이 분포: 벽 문단 기준을 4칸으로 나누고, 기준을 넘는 칸 하나를 더한다. 구간은 (from, to]. */
export function paragraphHistogram(lengths: number[], wall: number): HistogramBin[] {
  const w = Math.max(1, Math.ceil(wall / 4));
  const bins: HistogramBin[] = [];
  for (let from = 0; from < wall; from += w) {
    const to = Math.min(from + w, wall);
    bins.push({ from, to, label: `${from + 1}–${to}`, count: lengths.filter((l) => l > from && l <= to).length });
  }
  bins.push({ from: wall, to: null, label: `${wall + 1}+`, count: lengths.filter((l) => l > wall).length });
  return bins;
}

/** 회차 비교 표·그래프와 버전 비교에 쓰는 지표 목록 */
export type MetricKind = 'count' | 'number' | 'ratio';
export type MetricDef = { key: string; label: string; kind: MetricKind; get: (m: RhythmMetrics) => number };

export const METRIC_DEFS: MetricDef[] = [
  { key: 'charsWithSpaces', label: '글자 수(공백 포함)', kind: 'count', get: (m) => m.chars.withSpaces },
  { key: 'charsWithoutSpaces', label: '글자 수(공백 제외)', kind: 'count', get: (m) => m.chars.withoutSpaces },
  { key: 'sentenceCount', label: '문장 수', kind: 'count', get: (m) => m.sentenceStats.count },
  { key: 'sentenceMean', label: '평균 문장 길이', kind: 'number', get: (m) => m.sentenceStats.mean },
  { key: 'sentenceMedian', label: '문장 길이 중앙값', kind: 'number', get: (m) => m.sentenceStats.median },
  { key: 'sentenceStdev', label: '문장 길이 표준편차', kind: 'number', get: (m) => m.sentenceStats.stdev },
  { key: 'shortRatio', label: '짧은 문장 비율', kind: 'ratio', get: (m) => m.sentenceStats.shortRatio },
  { key: 'longRatio', label: '긴 문장 비율', kind: 'ratio', get: (m) => m.sentenceStats.longRatio },
  { key: 'dialogueCharRatio', label: '대사 비율(글자)', kind: 'ratio', get: (m) => m.dialogue.charRatio },
  { key: 'dialogueSentenceRatio', label: '대사 비율(문장)', kind: 'ratio', get: (m) => m.dialogue.sentenceRatio },
  { key: 'paragraphCount', label: '문단 수', kind: 'count', get: (m) => m.paragraphs.count },
  { key: 'wallCount', label: '벽 문단 수', kind: 'count', get: (m) => m.paragraphs.walls.length },
  { key: 'exclaimRatio', label: '! 로 끝나는 문장', kind: 'ratio', get: (m) => m.punctuation.exclaimRatio },
  { key: 'questionRatio', label: '? 로 끝나는 문장', kind: 'ratio', get: (m) => m.punctuation.questionRatio },
  { key: 'ellipsisRatio', label: '… 로 끝나는 문장', kind: 'ratio', get: (m) => m.punctuation.ellipsisRatio },
];

export function summarizeRhythm(m: RhythmMetrics): Record<string, number> {
  return Object.fromEntries(METRIC_DEFS.map((d) => [d.key, d.get(m)]));
}
