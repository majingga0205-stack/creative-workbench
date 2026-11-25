// 백업 파일 마이그레이션. Dexie를 import하지 않는다.
//
// 저장 구조를 바꿀 때 해야 할 일 (CLAUDE.md '데이터 보존'):
//   1. SCHEMA_VERSION을 1 올린다.
//   2. database.ts에 this.version(새 번호).stores(...).upgrade(...)를 추가해
//      브라우저에 이미 있는 데이터를 바꾼다.
//   3. 아래 EXPORT_MIGRATIONS에 { from: 이전 번호, migrate } 를 추가해
//      예전 백업 파일도 불러올 수 있게 한다. migrate는 순수 함수여야 하고 테스트를 붙인다.

export const APP_ID = 'creative-workbench';
export const SCHEMA_VERSION = 2;

/** schemaVersion이 from인 백업 파일 내용을 from+1 구조로 바꾼다. */
export type ExportMigration = {
  from: number;
  migrate: (envelope: RawEnvelope) => RawEnvelope;
};

export type RawEnvelope = {
  app: string;
  schemaVersion: number;
  exportedAt: string;
  scope: string;
  workId?: string;
  workTitle?: string;
  data: Record<string, unknown[]>;
};

export const EXPORT_MIGRATIONS: ExportMigration[] = [
  // v1 → v2: 독자 지표 스냅샷·가설 테이블이 새로 생겼다. v1 파일에는 없으니 빈 목록으로 본다.
  { from: 1, migrate: (env) => ({ ...env, schemaVersion: 2 }) },
];
