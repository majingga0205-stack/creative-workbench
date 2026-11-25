// 조사 인식 매처 (SPEC '한국어 텍스트 코어').
// 형태소 분석기 없이 '표제어 + 조사' 규칙으로 찾는다. 나중에 분석기를 붙일 수 있게 TermMatcher 인터페이스로 내보낸다.
import { prepareText, type PreparedText } from './normalize';
import type { MatchMode, MatchOptions, TermMatch, TermMatcher, TermQuery } from './types';

/** 허용 조사 (SPEC 목록 그대로). 설정에서 바꿀 수 있게 options.josa로 받는다. */
export const DEFAULT_JOSA: readonly string[] = [
  '이', '가', '을', '를', '은', '는', '의', '에', '에서', '에게', '한테', '로', '으로', '와', '과',
  '도', '만', '까지', '부터', '처럼', '보다', '이나', '나', '랑', '이랑', '하고',
  // 서술격
  '다', '이다', '였', '이었', '인',
];

const isHangulSyllable = (c: string | undefined) => !!c && c >= '가' && c <= '힣';
/** 끝·공백·문장부호: 글자(문자·숫자·결합 부호)가 아니면 경계로 본다 */
const isBoundary = (c: string | undefined) => c === undefined || !/[\p{L}\p{N}\p{M}]/u.test(c);

export type MatchTermOptions = MatchOptions & { mode?: MatchMode; exclude?: string[] };

/**
 * 표제어 하나를 찾는다.
 * - 앞: 글 처음이거나 한글 음절이 아님
 * - 뒤(word 모드): 글 끝·공백·문장부호이거나 허용 조사로 시작
 * - 뒤(prefix 모드): 무엇이든 (복합어 앞부분도 매칭)
 * - exclude 목록의 말 안에 들어 있는 매칭은 버린다
 * 위치는 원문 기준이다. 같은 글에 여러 번 쓸 땐 prepareText()로 한 번 준비한 글을 넘기면 빠르다.
 */
export function matchTerm(text: string | PreparedText, term: string, options: MatchTermOptions = {}): TermMatch[] {
  const p = typeof text === 'string' ? prepareText(text) : text;
  const t = term.normalize('NFC');
  if (!t) return [];
  const mode = options.mode ?? 'word';
  const josaList = [...(options.josa ?? DEFAULT_JOSA)].map((j) => j.normalize('NFC')).filter(Boolean).sort((a, b) => b.length - a.length);
  const excludeRanges = findAll(p.norm, (options.exclude ?? []).map((x) => x.normalize('NFC')).filter(Boolean));

  const out: TermMatch[] = [];
  for (let i = p.norm.indexOf(t); i !== -1; i = p.norm.indexOf(t, i + 1)) {
    if (isHangulSyllable(p.norm[i - 1])) continue;
    const end = i + t.length;
    let josa: string | undefined;
    if (mode === 'word') {
      if (!isBoundary(p.norm[end])) {
        josa = josaList.find((j) => p.norm.startsWith(j, end));
        if (!josa) continue;
      }
    }
    if (excludeRanges.some(([xs, xe]) => xs <= i && end <= xe)) continue;
    const start = p.toOriginal(i);
    const oEnd = p.toOriginal(end);
    const m: TermMatch = { start, end: oEnd, text: p.original.slice(start, oEnd), form: term };
    if (josa) m.josa = josa;
    out.push(m);
  }
  return out;
}

/** 표제어와 별칭을 모두 찾고, 겹치면 더 긴 것 하나만 남긴다. 결과는 위치 순서. */
export function findTerm(text: string | PreparedText, query: TermQuery, options: MatchOptions = {}): TermMatch[] {
  const p = typeof text === 'string' ? prepareText(text) : text;
  const forms = [...new Set([query.term, ...(query.aliases ?? [])].filter((f) => f.trim()))];
  const all = forms.flatMap((form) => matchTerm(p, form, { ...options, mode: query.mode, exclude: query.exclude }));
  const kept: TermMatch[] = [];
  // 긴 것부터 자리를 차지한다
  for (const m of all.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start)) {
    if (!kept.some((k) => m.start < k.end && k.start < m.end)) kept.push(m);
  }
  return kept.sort((a, b) => a.start - b.start);
}

/** 규칙 기반 매처 (기본 구현) */
export const ruleMatcher: TermMatcher = {
  find: (text, query, options) => findTerm(text, query, options),
};

function findAll(haystack: string, needles: string[]): [number, number][] {
  const ranges: [number, number][] = [];
  for (const n of needles) {
    for (let i = haystack.indexOf(n); i !== -1; i = haystack.indexOf(n, i + 1)) ranges.push([i, i + n.length]);
  }
  return ranges;
}
