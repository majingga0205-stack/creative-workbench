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
  // SPEC 타입에는 없지만 '모든 레코드에 updatedAt' 규칙에 따라 추가
  createdAt: string;
  updatedAt: string;
};

/** 사용자 설정값 하나. value는 JSON으로 저장 가능한 값. */
export type Setting = {
  key: string;
  value: unknown;
  updatedAt: string;
};
