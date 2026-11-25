// 내보내기·불러오기 실행 (Dexie 사용). 판정 로직은 backupFormat.ts의 순수 함수에 있다.
import { db as defaultDb, type WorkbenchDB } from './database';
import {
  buildEnvelope,
  computeImportPlan,
  type Envelope,
  type ImportPlan,
  type Rec,
  type TableData,
} from './backupFormat';
import { TABLE_DEFS, tablesForScope, type ExportScope, type TableDef } from './tables';
import { setMeta } from './meta';

function inScopeFn(scope: ExportScope, workId?: string) {
  return (def: TableDef, rec: Rec) =>
    scope === 'work' ? def.workKey !== undefined && rec[def.workKey] === workId : true;
}

async function readScope(database: WorkbenchDB, scope: ExportScope, workId?: string): Promise<TableData> {
  const data: TableData = {};
  for (const def of tablesForScope(scope)) {
    const table = database.tableByName(def.name);
    if (scope === 'work') {
      data[def.name] = await table.where(def.workKey!).equals(workId!).toArray();
    } else {
      data[def.name] = await table.toArray();
    }
  }
  return data;
}

export async function exportData(
  scope: ExportScope,
  opts: { workId?: string; database?: WorkbenchDB; now?: Date } = {},
): Promise<Envelope> {
  const database = opts.database ?? defaultDb;
  if (scope === 'work' && !opts.workId) throw new Error('작품을 골라 주세요');
  const data = await readScope(database, scope, opts.workId);
  let workTitle: string | undefined;
  if (scope === 'work') {
    const work = await database.works.get(opts.workId!);
    if (!work) throw new Error('작품을 찾을 수 없어요');
    workTitle = work.title;
  }
  return buildEnvelope(scope, data, { workId: opts.workId, workTitle, now: opts.now });
}

/** 불러오기 미리보기 계획. 합치기는 id 전체를, 교체는 불러오는 범위만 기준으로 센다. */
/** 파일에 들어 있는 테이블만 (예전 버전 파일에 없던 테이블은 건드리지 않는다) */
const presentDefs = (envelope: Envelope) => tablesForScope(envelope.scope).filter((d) => d.name in envelope.data);

export async function planImport(envelope: Envelope, database: WorkbenchDB = defaultDb): Promise<ImportPlan> {
  const defs = presentDefs(envelope);
  const existing: TableData = {};
  for (const def of defs) existing[def.name] = await database.tableByName(def.name).toArray();
  return computeImportPlan(existing, envelope.data, defs, inScopeFn(envelope.scope, envelope.workId));
}

export type ImportMode = 'merge' | 'replace';

export type ImportSummary = { written: number; removed: number; keptLocal: number };

/**
 * 불러오기 실행. 한 트랜잭션 안에서 처리해서 중간에 실패하면 아무것도 바뀌지 않는다.
 * 실행 전 자동 백업은 호출하는 쪽(화면)이 먼저 한다.
 */
export async function applyImport(
  envelope: Envelope,
  mode: ImportMode,
  database: WorkbenchDB = defaultDb,
): Promise<ImportSummary> {
  const defs = presentDefs(envelope);
  const tables = defs.map((d) => database.tableByName(d.name));
  return database.transaction('rw', tables, async () => {
    let written = 0;
    let removed = 0;
    let keptLocal = 0;
    if (mode === 'replace') {
      for (const def of defs) {
        const table = database.tableByName(def.name);
        if (envelope.scope === 'work') {
          removed += await table.where(def.workKey!).equals(envelope.workId!).delete();
        } else {
          removed += await table.count();
          await table.clear();
        }
        const rows = envelope.data[def.name] ?? [];
        await table.bulkPut(rows);
        written += rows.length;
      }
    } else {
      const existing: TableData = {};
      for (const def of defs) existing[def.name] = await database.tableByName(def.name).toArray();
      const plan = computeImportPlan(existing, envelope.data, defs);
      for (const tp of plan.tables) {
        const rows = [...tp.add, ...tp.update.map((u) => u.incoming)];
        await database.tableByName(tp.table).bulkPut(rows);
        written += rows.length;
        keptLocal += tp.conflicts.length;
      }
    }
    return { written, removed, keptLocal };
  });
}

/** 자동 백업용: 현재 전체 데이터 */
export async function snapshotAll(database: WorkbenchDB = defaultDb): Promise<Envelope> {
  return exportData('all', { database });
}

export async function markBackedUp(when = new Date(), database: WorkbenchDB = defaultDb) {
  await setMeta('lastBackupAt', when.toISOString(), database);
}

/** 데이터 개수 (설정 화면 표시용) */
export async function countAll(database: WorkbenchDB = defaultDb): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const def of TABLE_DEFS) out[def.name] = await database.tableByName(def.name).count();
  return out;
}
