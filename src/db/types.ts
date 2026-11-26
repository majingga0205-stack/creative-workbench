// 공통 데이터 타입 (SPEC '공통 기능').
// 이 파일은 Dexie·React를 import하지 않는다. src/core에서도 타입만 가져다 쓸 수 있다.

export type WorkKind = '소설' | '게임' | '기타';
export const WORK_KINDS: WorkKind[] = ['소설', '게임', '기타'];

export type WorkSetting = {
  label: string;
  yearFrom: number;
  yearTo: number;
  region: string;
};

export type Work = {
  id: string;
  title: string;
  kind: WorkKind;
  setting?: WorkSetting;
  createdAt: string;
  updatedAt: string;
};

export type Character = {
  id: string;
  workId: string;
  name: string;
  aliases: string[];
  archetypeId?: string;
  /** 연결한 원형의 요소마다 고른 것 (요소 id → 선택·의도함) — 6단계 */
  archetypeChoices?: ArchetypeChoices;
  /** 같은 장면에 본명이 나왔을 때만 인정하는 별칭 (‘연구원’ 같은 호칭) — 5단계 */
  nameRequiredAliases?: string[];
  traits: string[];
  note: string;
  // SPEC 타입에는 없지만 '모든 레코드에 updatedAt' 규칙에 따라 추가 (PROJECT_STATE 참고)
  createdAt: string;
  updatedAt: string;
};

export type ChapterVersion = {
  id: string;
  label: string;
  text: string;
  createdAt: string;
};

export type EndingTag = '절단' | '여운' | '정리';

export type Chapter = {
  id: string;
  workId: string;
  number: number;
  title: string;
  versions: ChapterVersion[];
  activeVersionId: string;
  publishedAt?: string;
  endingTag?: EndingTag;
  endingTagSource?: 'auto' | 'user';
  /** 이 회차만 다른 시대 설정 (없으면 작품 시대 설정을 쓴다) — 4단계 */
  setting?: WorkSetting;
  // SPEC 타입에는 없지만 '모든 레코드에 updatedAt' 규칙에 따라 추가
  createdAt: string;
  updatedAt: string;
};

/** 독자 지표 스냅샷 (연재 실험실). 회차 하나를 게시 후 며칠째에 기록한 값들 */
export type ReaderSnapshot = {
  id: string;
  workId: string;
  chapterId: string;
  /** 기록일 YYYY-MM-DD */
  recordedAt: string;
  /** 게시 후 일수 (게시일 = 0) */
  daysAfter: number;
  /** 지표 key → 값 (지표 이름은 설정의 독자 지표 목록) */
  values: Record<string, number>;
  createdAt: string;
  updatedAt: string;
};

export type HypothesisStatus = '대기' | '확인할 때 됨' | '지지됨' | '기각' | '보류';

/** 가설 (SPEC 모듈 C). updatedAt은 '모든 레코드에 updatedAt' 규칙으로 추가 */
export type Hypothesis = {
  id: string;
  workId: string;
  statement: string;
  condition: { field: 'endingTag' | 'dialogueRatio' | 'length' | 'custom'; op: '=' | '>' | '<'; value: string | number };
  metric: string;
  target: 'same' | 'next';
  checkAfterChapter: number;
  status: HypothesisStatus;
  resultNote?: string;
  createdAt: string;
  updatedAt: string;
};

// ── 시대 고증 린터 (4단계) ──

export type LintCategory = '물건' | '음식' | '제도' | '단어' | '개념' | '호칭' | '기타';
export const LINT_CATEGORIES: LintCategory[] = ['물건', '음식', '제도', '단어', '개념', '호칭', '기타'];
export type LintSourceType = '1차 사료' | '연구서·논문' | '사전' | '기타';
export const LINT_SOURCE_TYPES: LintSourceType[] = ['1차 사료', '연구서·논문', '사전', '기타'];

export type LintSource = { title: string; author?: string; year?: string; locator?: string; type: LintSourceType; url?: string };

/** 고증 항목 (SPEC 모듈 A, 공용 라이브러리) */
export type LintEntry = {
  id: string;
  term: string;
  aliases: string[];
  matchMode: 'word' | 'prefix';
  exclude: string[];
  category: LintCategory;
  kind: 'not_yet' | 'meaning_shift';
  /** '한반도', '중국', '서양', '전체' … */
  region: string;
  appears?: { from: number; to: number; precision: '연도' | '시기' | '세기' };
  senses?: { label: string; from?: number; to?: number; contextWords: string[] }[];
  sources: LintSource[];
  disputed: boolean;
  disputeNote?: string;
  /** 사용자가 출처 원문을 직접 확인했는가 */
  verified: boolean;
  note?: string;
  updatedAt: string;
};

/** SF 세계관 용어집 (작품별) */
export type GlossaryEntry = {
  id: string;
  workId: string;
  canonical: string;
  variants: string[];
  status: '사용' | '금지';
  replacement?: string;
  note?: string;
  updatedAt: string;
};

/** 지적 처리 기록 (작품별). 'position'은 회차 안의 그 자리(앞뒤 글자로 알아봄), 'chapter'는 그 회차 전체, 'work'는 작품 전체 */
export type LintResolution = {
  id: string;
  workId: string;
  /** 'era:<항목 id>' 또는 'glossary:<용어 id>' */
  ruleKey: string;
  status: '의도함' | '무시';
  scope: 'position' | 'chapter' | 'work';
  chapterId?: string;
  /** scope 'position'일 때: 매칭 앞뒤 글자를 포함한 발췌 */
  context?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

/** 인물 네트워크 수동 보정 (작품별). 계산 결과와 따로 저장해서 다시 계산해도 유지한다 — 5단계 */
export type NetworkEdit = {
  id: string;
  workId: string;
  /** 두 캐릭터 id */
  a: string;
  b: string;
  action: 'add' | 'remove' | 'label';
  /** action 'label': 관계 라벨 (가족·동료·적대 등 자유 입력) */
  label?: string;
  createdAt: string;
  updatedAt: string;
};

// ── 신화 원형 아카이브 (6단계) ──

export type ElementCategory = '외형' | '능력' | '성격' | '금기·약점' | '서사 기능' | '출현 장소';
export const ELEMENT_CATEGORIES: ElementCategory[] = ['외형', '능력', '성격', '금기·약점', '서사 기능', '출현 장소'];
export type ElementWeight = 'core' | 'common' | 'variant';

export type ArchetypeElement = {
  id: string;
  label: string;
  category: ElementCategory;
  /** 핵심 3 · 흔함 2 · 일부 판본 1 */
  weight: ElementWeight;
  /** 캐릭터 특성에서 이 요소를 알아볼 말 */
  keywords: string[];
  /** 이 요소와 정면으로 어긋나는 말 */
  opposite: string[];
  /** 출처는 고증 린터와 같은 타입 */
  sources: LintSource[];
  verified: boolean;
  note?: string;
};

export type Trap = { id: string; claim: string; correction: string; triggerWords: string[]; sources: LintSource[]; verified: boolean };

/** 신화·설화 존재 (공용 라이브러리) */
export type Being = { id: string; name: string; aliases: string[]; summary: string; elements: ArchetypeElement[]; traps: Trap[]; updatedAt: string };

export type BeingRelation = { id: string; fromId: string; toId: string; label: string; sources: LintSource[]; updatedAt: string };

export type ElementChoice = '가져옴' | '변형함' | '버림' | '충돌';
export type ArchetypeChoices = Record<string, { choice?: ElementChoice; intended?: boolean }>;

// ── 보스 페이즈 설계 보드 (7·8단계, 횡스크롤) ──

export type PatternShape = 'projectile' | 'arc' | 'thrust' | 'area' | 'dash';
export const PATTERN_SHAPES: PatternShape[] = ['projectile', 'arc', 'thrust', 'area', 'dash'];
export type PatternCounter = '회피' | '패링' | '방어' | '점프' | '기타';
export const PATTERN_COUNTERS: PatternCounter[] = ['회피', '패링', '방어', '점프', '기타'];

export type Pattern = {
  id: string;
  name: string;
  shape: PatternShape;
  telegraphMs: number;
  activeMs: number;
  recoveryMs: number;
  cooldownMs: number;
  damage: number;
  counter: PatternCounter;
  /** 모양별 값 (SPEC 표) */
  params: Record<string, number | string>;
  /** 패턴 전에 보스가 하는 대사 */
  line?: string;
  note?: string;
};

export type Phase = {
  id: string;
  order: number;
  name: string;
  emotion: string;
  narrative: string;
  weapon: string;
  /** 체력 구간(%) */
  hpFrom: number;
  hpTo: number;
  transition: string;
  /** 0~10, 설계자가 의도한 긴장도 */
  intendedTension: number;
  /** 패턴 출현 비중 */
  sequence: { patternId: string; weight: number }[];
  patterns: Pattern[];
  /** 의도한 긴장도와 압박도가 일부러 어긋나게 설계함 (SPEC '의도함') */
  gapIntended?: boolean;
};

/** 보스 (작품별). 횡스크롤: 아레나 바닥 = 아래쪽 끝 */
export type Boss = {
  id: string;
  workId: string;
  name: string;
  /** 보스 주인 캐릭터 */
  characterId?: string;
  arena: { width: number; height: number };
  player: {
    maxHp: number;
    /** 좌우 이동 속도 px/s */
    speed: number;
    /** 몸통 크기 px */
    width: number;
    height: number;
    jump: { height: number; durationMs: number };
    dodge: { distance: number; durationMs: number; iframeMs: number; cooldownMs: number };
  };
  phases: Phase[];
  createdAt: string;
  updatedAt: string;
};

/** 사용자 설정값 하나. value는 JSON으로 저장 가능한 값. */
export type Setting = {
  key: string;
  value: unknown;
  updatedAt: string;
};
