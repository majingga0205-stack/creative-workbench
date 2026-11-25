import Dexie, { type EntityTable, type Table } from 'dexie';
import type { Chapter, Character, Setting, Work } from './types';

/** 이 브라우저에만 해당하는 값 (백업 파일에 넣지 않음). 예: lastBackupAt */
export type Meta = { key: string; value: unknown };

export const DB_NAME = 'creative-workbench';

export class WorkbenchDB extends Dexie {
  works!: EntityTable<Work, 'id'>;
  characters!: EntityTable<Character, 'id'>;
  chapters!: EntityTable<Chapter, 'id'>;
  settings!: EntityTable<Setting, 'key'>;
  meta!: EntityTable<Meta, 'key'>;

  constructor(name = DB_NAME) {
    super(name);
    // Dexie 버전 번호 = migrations.ts의 SCHEMA_VERSION.
    // 구조를 바꿀 땐 아래 블록을 지우지 말고 새 version(N)을 추가하고 .upgrade()로 기존 데이터를 바꾼다.
    this.version(1).stores({
      works: 'id, updatedAt',
      characters: 'id, workId, updatedAt',
      chapters: 'id, workId, [workId+number], updatedAt',
      settings: 'key',
      meta: 'key',
    });
  }

  /** tables.ts의 테이블 이름으로 Dexie 테이블 찾기 */
  tableByName(name: string): Table<Record<string, unknown>, string> {
    return this.table(name) as Table<Record<string, unknown>, string>;
  }
}

export const db = new WorkbenchDB();
