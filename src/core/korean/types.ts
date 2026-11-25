// 한국어 텍스트 코어 결과 타입.
// 위치(start/end)는 언제나 '원문' 기준 JS 문자열 인덱스(UTF-16 코드 단위)다. end는 포함하지 않는다.
// 즉 원문.slice(start, end)가 그 결과의 글자이고, textarea.setSelectionRange(start, end)로 바로 고를 수 있다.

export type Span = { start: number; end: number };

export type Sentence = Span & {
  index: number;
  text: string;
  /** 따옴표(“ ” " " 「 」 『 』) 안에서 시작한 문장 */
  isDialogue: boolean;
};

export type Paragraph = Span & { index: number; text: string };

export type Scene = Span & { index: number; text: string };

export type MatchMode = 'word' | 'prefix';

/** 찾을 항목 하나 (고증 항목, 캐릭터 이름 등) */
export type TermQuery = {
  term: string;
  aliases?: string[];
  /** 기본 'word' */
  mode?: MatchMode;
  /** 이 말 안에 들어 있는 매칭은 버린다 (예: '경제' 항목의 '경제육전') */
  exclude?: string[];
};

export type TermMatch = Span & {
  /** 원문에서 찾은 글자 그대로 */
  text: string;
  /** 어떤 표기로 찾았나 (표제어 또는 별칭) */
  form: string;
  /** 뒤에 붙은 조사 (word 모드에서 조사로 경계를 인정했을 때) */
  josa?: string;
};

export type MatchOptions = {
  /** 허용 조사 목록. 기본 DEFAULT_JOSA */
  josa?: readonly string[];
};

/** 나중에 형태소 분석기(Kiwi 등)를 오프라인으로 붙일 수 있도록 매처를 인터페이스로 둔다. */
export interface TermMatcher {
  find(text: string, query: TermQuery, options?: MatchOptions): TermMatch[];
}

export type ParagraphMode = 'line' | 'blank';

export type SplitOptions = {
  /** 장면 구분 기호 목록 (기본 DEFAULT_SCENE_BREAK_SYMBOLS). 구분선 줄은 문장·문단에서 빠진다. */
  sceneBreakSymbols?: readonly string[];
};

export type SentenceOptions = SplitOptions & {
  /** 닫는 따옴표 뒤 공백 다음에 이 말이 오면 문장을 나누지 않는다 (‘…’ 하고 생각했다). 기본 DEFAULT_QUOTATIVES */
  quotatives?: readonly string[];
};

export type ParagraphOptions = SplitOptions & {
  /** 'line' = 빈 줄이 아닌 줄 하나가 문단 하나 (기본), 'blank' = 빈 줄로 나뉜 덩어리가 문단 하나 */
  mode?: ParagraphMode;
};
