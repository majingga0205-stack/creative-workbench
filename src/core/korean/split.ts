// 문장·문단·장면 분리 (SPEC '한국어 텍스트 코어'). 모든 결과는 원문 기준 start/end를 갖는다.
import type { Paragraph, ParagraphOptions, Scene, Sentence, SentenceOptions, Span, SplitOptions } from './types';

/** 기본 장면 구분 기호. '='은 지금 원고에서 쓰는 기호. 설정에서 바꿀 수 있다. */
export const DEFAULT_SCENE_BREAK_SYMBOLS: readonly string[] = ['=', '*', '-', '◆', '◇'];

/** 문장을 끝내는 부호. 연달아 나오면(?!, ……, ...) 한 덩어리로 본다. */
const TERMINATORS = new Set(['.', '!', '?', '…', '‥', '。']);
/** 대사를 여는·닫는 따옴표 (곧은 따옴표 "는 따로 처리) */
const DIALOGUE_OPEN = new Set(['“', '「', '『']);
const DIALOGUE_CLOSE = new Set(['”', '」', '』']);
/** 문장 끝 부호 뒤에 붙어 앞 문장에 포함되는 닫는 부호 (대사가 아닌 것 포함) */
const OTHER_CLOSERS = new Set(['’', "'", ')', '）', ']', '》', '〉', '」', '』', '”']);

const isSpace = (c: string | undefined) => c !== undefined && /\s/.test(c);

function lineSpans(text: string): Span[] {
  const out: Span[] = [];
  let start = 0;
  for (;;) {
    const nl = text.indexOf('\n', start);
    if (nl === -1) {
      out.push({ start, end: text.length });
      return out;
    }
    out.push({ start, end: nl });
    start = nl + 1;
  }
}

/** 앞뒤 공백(전각 공백·\r 포함)을 뺀 범위. 비었으면 start === end */
function trimSpan(text: string, s: number, e: number): Span {
  while (s < e && isSpace(text[s])) s++;
  while (e > s && isSpace(text[e - 1])) e--;
  return { start: s, end: e };
}

/**
 * 장면 구분선인가: 구분 기호 한 종류가 1번 이상 반복되고(사이 공백 허용) 다른 글자가 없는 줄.
 * 전각 기호(＝, ＊)는 반각과 같이 본다.
 */
export function isSceneBreakLine(line: string, symbols: readonly string[] = DEFAULT_SCENE_BREAK_SYMBOLS): boolean {
  const chars = [...line.replace(/\s+/g, '')].map((c) => c.normalize('NFKC'));
  if (chars.length === 0) return false;
  const first = chars[0];
  if (!chars.every((c) => c === first)) return false;
  return symbols.some((s) => s.normalize('NFKC') === first);
}

/** 내용이 있는 줄만 (빈 줄·장면 구분선 제외), 앞뒤 공백을 뺀 범위로 */
function contentLines(text: string, symbols: readonly string[]): (Span & { isBreak: boolean; isBlank: boolean })[] {
  return lineSpans(text).map((l) => {
    const t = trimSpan(text, l.start, l.end);
    const isBlank = t.start === t.end;
    return { ...t, isBlank, isBreak: !isBlank && isSceneBreakLine(text.slice(t.start, t.end), symbols) };
  });
}

/** 닫는 따옴표 뒤에 오면 앞 인용과 한 문장으로 보는 말 (‘이상하다.’ 하고 생각했다) */
export const DEFAULT_QUOTATIVES: readonly string[] = ['하고', '하며', '하면서', '하는', '하자', '라고', '라며', '라는', '이라고'];

const QUOTE_MARKS = new Set(['”', '」', '』', '’', "'", '"']);

/**
 * 문장 분리.
 * - 줄바꿈은 언제나 경계 (줄 하나에서 시작한 따옴표는 그 줄 안에서만 센다)
 * - 줄 안에서는 . ! ? … ... (연속 부호는 한 덩어리) 뒤에 닫는 따옴표·괄호를 붙인 다음, 공백이 오면 나눈다
 *   단, 닫는 따옴표 뒤 공백 다음에 인용 표현(하고·라고 등)이 오면 나누지 않는다
 * - 대사 안에서도 같은 규칙으로 나눈다
 * - isDialogue: 따옴표(“ ” " " 「 」 『 』) 안에서 시작하고, 따옴표가 닫힌 뒤 서술이 이어지지 않는 문장
 * - 빈 줄과 장면 구분선 줄은 문장이 아니다
 */
export function splitSentences(text: string, options: SentenceOptions = {}): Sentence[] {
  const symbols = options.sceneBreakSymbols ?? DEFAULT_SCENE_BREAK_SYMBOLS;
  const quotatives = options.quotatives ?? DEFAULT_QUOTATIVES;
  const out: Sentence[] = [];

  for (const line of contentLines(text, symbols)) {
    if (line.isBlank || line.isBreak) continue;
    let depth = 0; // “ 「 『 깊이
    let straightOpen = false; // 곧은 따옴표 " 열림
    const inQuote = () => depth > 0 || straightOpen;
    const startsDialogue = (k: number) =>
      inQuote() || DIALOGUE_OPEN.has(text[k]) || (text[k] === '"' && !straightOpen);

    let sentStart = line.start;
    let sentDialogue = startsDialogue(sentStart);
    /** 이 문장에서 대사 따옴표가 마지막으로 모두 닫힌 위치 (닫는 부호 다음) */
    let closedAt: number | null = null;

    /** 따옴표 하나를 처리하고, 모두 닫혔으면 closedAt을 적는다 */
    const track = (k: number) => {
      const c = text[k];
      const was = inQuote();
      if (DIALOGUE_OPEN.has(c)) depth++;
      else if (DIALOGUE_CLOSE.has(c)) depth = Math.max(0, depth - 1);
      else if (c === '"') straightOpen = !straightOpen;
      if (was && !inQuote()) closedAt = k + 1;
    };
    const push = (s: number, e: number) => {
      const t = trimSpan(text, s, e);
      if (t.start >= t.end) return;
      const isDialogue = sentDialogue && (closedAt === null || closedAt >= t.end);
      out.push({ index: out.length, ...t, text: text.slice(t.start, t.end), isDialogue });
    };

    let i = line.start;
    while (i < line.end) {
      const c = text[i];
      track(i);
      if (!TERMINATORS.has(c)) {
        i++;
        continue;
      }
      // 끝 부호 덩어리
      let j = i;
      while (j < line.end && TERMINATORS.has(text[j])) j++;
      // 닫는 따옴표·괄호를 앞 문장에 붙인다
      let closedQuote = false;
      while (j < line.end) {
        const d = text[j];
        if (d === '"' && !straightOpen) break;
        if (d !== '"' && !OTHER_CLOSERS.has(d)) break;
        track(j);
        if (QUOTE_MARKS.has(d)) closedQuote = true;
        j++;
      }
      if (j >= line.end || !isSpace(text[j])) {
        i = j;
        continue;
      }
      let k = j;
      while (k < line.end && isSpace(text[k])) k++;
      if (closedQuote && quotatives.some((q) => q && text.startsWith(q, k))) {
        i = k;
        continue;
      }
      push(sentStart, j);
      sentStart = k;
      sentDialogue = startsDialogue(k);
      closedAt = null;
      i = k;
    }
    push(sentStart, line.end);
  }
  return out;
}

/**
 * 문단 분리.
 * - 'line'(기본): 빈 줄이 아닌 줄 하나가 문단 하나 (웹소설식 원고, 빈 줄로 나눈 원고 모두)
 * - 'blank': 빈 줄로 나뉜 덩어리가 문단 하나 (한 문단을 여러 줄로 쓴 원고)
 * 장면 구분선 줄은 문단이 아니고, 'blank' 모드에서는 경계가 된다.
 */
export function splitParagraphs(text: string, options: ParagraphOptions = {}): Paragraph[] {
  const symbols = options.sceneBreakSymbols ?? DEFAULT_SCENE_BREAK_SYMBOLS;
  const mode = options.mode ?? 'line';
  const out: Paragraph[] = [];
  const push = (s: number, e: number) => out.push({ index: out.length, start: s, end: e, text: text.slice(s, e) });

  let group: Span | null = null;
  for (const line of contentLines(text, symbols)) {
    if (line.isBlank || line.isBreak) {
      if (group) push(group.start, group.end);
      group = null;
      continue;
    }
    if (mode === 'line') push(line.start, line.end);
    else group = group ? { start: group.start, end: line.end } : { start: line.start, end: line.end };
  }
  if (group) push(group.start, group.end);
  return out;
}

/**
 * 장면 분리: 장면 구분선 줄 사이의 글. 앞뒤 공백을 뺀 범위이고, 빈 장면은 만들지 않는다.
 * 구분선이 없으면 글 전체가 장면 하나. (구분선 없는 회차를 문단 8개씩 끊는 규칙은 인물 네트워크(5단계)의 집계 규칙)
 */
export function splitScenes(text: string, options: SplitOptions = {}): Scene[] {
  const symbols = options.sceneBreakSymbols ?? DEFAULT_SCENE_BREAK_SYMBOLS;
  const out: Scene[] = [];
  const push = (s: number, e: number) => {
    const t = trimSpan(text, s, e);
    if (t.start < t.end) out.push({ index: out.length, ...t, text: text.slice(t.start, t.end) });
  };

  let segStart = 0;
  const lines = lineSpans(text);
  for (const line of lines) {
    if (!isSceneBreakLine(text.slice(line.start, line.end), symbols)) continue;
    push(segStart, line.start);
    segStart = line.end;
  }
  push(segStart, text.length);
  return out;
}
