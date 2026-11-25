// 마지막 문단 유형 추정 (SPEC 모듈 C). 참고용이고, 최종 태그는 사용자가 고른다.
import { splitParagraphs, splitSentences } from '../korean';
import { countChars, resolveThresholds, sentenceEnding } from './metrics';
import type { EndingTag, RhythmOptions } from './types';

export type EndingEstimate = {
  tag: EndingTag;
  reasons: string[];
  lastSentence: { start: number; end: number; text: string; length: number; isDialogue: boolean };
  lastParagraph: { start: number; end: number; text: string; length: number; isNarration: boolean };
};

/**
 * 절단 = 마지막 문장이 대사이거나 ? ! … — 로 끝나거나 cutMaxLength 이하
 * 정리 = (절단이 아니고) 마지막 문단이 서술이고 summaryMinLength 이상
 * 여운 = 그 밖
 * 원고가 비었으면 null
 */
export function estimateEnding(text: string, options: RhythmOptions = {}): EndingEstimate | null {
  const th = resolveThresholds(options.thresholds);
  const split = { sceneBreakSymbols: options.sceneBreakSymbols };
  const sentences = splitSentences(text, split);
  const paragraphs = splitParagraphs(text, { ...split, mode: options.paragraphMode });
  if (!sentences.length || !paragraphs.length) return null;

  const s = sentences[sentences.length - 1];
  const p = paragraphs[paragraphs.length - 1];
  const sLen = countChars(s.text).withoutSpaces;
  const pLen = countChars(p.text).withoutSpaces;
  const pSentences = sentences.filter((x) => x.start >= p.start && x.end <= p.end);
  const isNarration = pSentences.length > 0 && pSentences.every((x) => !x.isDialogue);

  const lastSentence = { start: s.start, end: s.end, text: s.text, length: sLen, isDialogue: s.isDialogue };
  const lastParagraph = { start: p.start, end: p.end, text: p.text, length: pLen, isNarration };

  const cut: string[] = [];
  if (s.isDialogue) cut.push('마지막 문장이 대사예요');
  const e = sentenceEnding(s.text);
  const marks = [e.question && '?', e.exclaim && '!', e.ellipsis && '…', e.dash && '—'].filter(Boolean);
  if (marks.length) cut.push(`마지막 문장이 ${marks.join(' ')}(으)로 끝나요`);
  if (sLen <= th.cutMaxLength) cut.push(`마지막 문장이 ${sLen}자로 짧아요 (${th.cutMaxLength}자 이하)`);
  if (cut.length) return { tag: '절단', reasons: cut, lastSentence, lastParagraph };

  if (isNarration && pLen >= th.summaryMinLength) {
    return {
      tag: '정리',
      reasons: [`마지막 문단이 서술이고 ${pLen}자예요 (${th.summaryMinLength}자 이상)`],
      lastSentence,
      lastParagraph,
    };
  }

  return {
    tag: '여운',
    reasons: [
      `절단·정리 조건에 해당하지 않아요 — 마지막 문장 ${sLen}자, 마지막 문단 ${pLen}자${isNarration ? '' : '(대사 포함)'}`,
    ],
    lastSentence,
    lastParagraph,
  };
}
