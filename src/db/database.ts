import Dexie, { type EntityTable, type Table } from 'dexie';
import type { Being, BeingRelation, Boss, Chapter, Character, GlossaryEntry, Hypothesis, LintEntry, LintResolution, NetworkEdit, ReaderSnapshot, Setting, Work } from './types';
import { LINT_SEED } from '../seed/lintSeed';
import { MYTH_SEED } from '../seed/mythSeed';

/** 이 브라우저에만 해당하는 값 (백업 파일에 넣지 않음). 예: lastBackupAt */
export type Meta = { key: string; value: unknown };

export const DB_NAME = 'creative-workbench';

export class WorkbenchDB extends Dexie {
  works!: EntityTable<Work, 'id'>;
  characters!: EntityTable<Character, 'id'>;
  chapters!: EntityTable<Chapter, 'id'>;
  readerSnapshots!: EntityTable<ReaderSnapshot, 'id'>;
  hypotheses!: EntityTable<Hypothesis, 'id'>;
  lintEntries!: EntityTable<LintEntry, 'id'>;
  glossary!: EntityTable<GlossaryEntry, 'id'>;
  lintResolutions!: EntityTable<LintResolution, 'id'>;
  networkEdits!: EntityTable<NetworkEdit, 'id'>;
  beings!: EntityTable<Being, 'id'>;
  beingRelations!: EntityTable<BeingRelation, 'id'>;
  bosses!: EntityTable<Boss, 'id'>;
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
    // v2 (3단계): 연재 실험실 독자 지표 스냅샷·가설. 새 테이블만 더하므로 기존 데이터 변환은 없다.
    this.version(2).stores({
      readerSnapshots: 'id, workId, chapterId, updatedAt',
      hypotheses: 'id, workId, updatedAt',
    });
    // v3 (4단계): 시대 고증 린터. 고증 DB(공용)·SF 용어집·처리 기록(작품별). 고증 DB에는 SPEC 시드 5개를 넣는다.
    this.version(3)
      .stores({
        lintEntries: 'id, term, updatedAt',
        glossary: 'id, workId, updatedAt',
        lintResolutions: 'id, workId, chapterId, ruleKey, updatedAt',
      })
      .upgrade(async (tx) => {
        const t = tx.table('lintEntries');
        if ((await t.count()) === 0) await t.bulkAdd(LINT_SEED);
      });
    // v4 (5단계): 인물 네트워크 수동 보정. 새 테이블만 더한다.
    this.version(4).stores({ networkEdits: 'id, workId, updatedAt' });
    // v5 (6단계): 신화 원형 아카이브. 존재·존재 관계(공용). 신화 DB에는 SPEC 시드 3개를 넣는다.
    this.version(5)
      .stores({ beings: 'id, name, updatedAt', beingRelations: 'id, fromId, toId, updatedAt' })
      .upgrade(async (tx) => {
        const t = tx.table('beings');
        if ((await t.count()) === 0) await t.bulkAdd(MYTH_SEED);
      });
    // v6 (7단계): 보스 페이즈 설계 보드. 보스(작품별, 페이즈·패턴을 안에 담음). 새 테이블만 더한다.
    this.version(6).stores({ bosses: 'id, workId, updatedAt' });
    // 새로 만든 DB에도 시드를 넣는다
    this.on('populate', async (tx) => {
      await tx.table('lintEntries').bulkAdd(LINT_SEED);
      await tx.table('beings').bulkAdd(MYTH_SEED);
    });
  }

  /** tables.ts의 테이블 이름으로 Dexie 테이블 찾기 */
  tableByName(name: string): Table<Record<string, unknown>, string> {
    return this.table(name) as Table<Record<string, unknown>, string>;
  }
}

export const db = new WorkbenchDB();
