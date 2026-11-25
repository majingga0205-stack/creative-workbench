// 한국어 텍스트 코어. 순수 함수만 있고 React·Dexie를 import하지 않는다.
export * from './types';
export { prepareText, type PreparedText } from './normalize';
export { DEFAULT_JOSA, findTerm, matchTerm, ruleMatcher, type MatchTermOptions } from './matchTerm';
export { DEFAULT_QUOTATIVES, DEFAULT_SCENE_BREAK_SYMBOLS, isSceneBreakLine, splitParagraphs, splitScenes, splitSentences } from './split';
