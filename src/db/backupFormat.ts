// 백업 파일 만들기·검사·마이그레이션·합치기 계획. 전부 순수 함수이고 Dexie를 import하지 않는다.
import type { ZodType } from 'zod';
import { envelopeHeaderSchema, RECORD_SCHEMAS } from './schema';
import {
  APP_ID,
  EXPORT_MIGRATIONS,
  SCHEMA_VERSION,
  type ExportMigration,
  type RawEnvelope,
} from './migrations';
import { TABLE_DEFS, describeRecord, tablesForScope, type ExportScope, type TableDef } from './tables';

export type Rec = Record<string, unknown>;
export type TableData = Record<string, Rec[]>;

export type Envelope = {
  app: typeof APP_ID;
  schemaVersion: number;
  exportedAt: string;
  scope: ExportScope;
  workId?: string;
  workTitle?: string;
  data: TableData;
};

export function buildEnvelope(
  scope: ExportScope,
  data: TableData,
  opts: { workId?: string; workTitle?: string; now?: Date } = {},
): Envelope {
  const env: Envelope = {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: (opts.now ?? new Date()).toISOString(),
    scope,
    data,
  };
  if (opts.workId) env.workId = opts.workId;
  if (opts.workTitle !== undefined) env.workTitle = opts.workTitle;
  return env;
}

export type ParseOk = { ok: true; envelope: Envelope; migratedFrom?: number };
export type ParseFail = { ok: false; error: string; details: string[] };
export type ParseResult = ParseOk | ParseFail;

type ParseOptions = {
  currentVersion?: number;
  migrations?: ExportMigration[];
  schemas?: Record<string, ZodType>;
  defs?: TableDef[];
};

const fail = (error: string, details: string[] = []): ParseFail => ({ ok: false, error, details });

/** 백업 파일 텍스트를 검사하고, 버전이 낮으면 마이그레이션한다. */
export function parseBackup(text: string, opts: ParseOptions = {}): ParseResult {
  const currentVersion = opts.currentVersion ?? SCHEMA_VERSION;
  const migrations = opts.migrations ?? EXPORT_MIGRATIONS;
  const schemas = opts.schemas ?? RECORD_SCHEMAS;
  const defs = opts.defs ?? TABLE_DEFS;

  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return fail('JSON 형식이 아니에요. 창작 작업대에서 내보낸 .json 파일인지 확인해 주세요.');
  }
  if (typeof raw !== 'object' || raw === null || (raw as Rec).app !== APP_ID) {
    return fail('창작 작업대 백업 파일이 아니에요. (app 값이 "creative-workbench"가 아님)');
  }
  const head = envelopeHeaderSchema.safeParse(raw);
  if (!head.success) {
    return fail('백업 파일의 머리 정보가 올바르지 않아요.', formatIssues(head.error.issues));
  }
  let env: RawEnvelope = head.data;

  if (env.schemaVersion > currentVersion) {
    return fail(
      `이 파일은 더 새로운 버전의 앱(데이터 구조 v${env.schemaVersion})에서 만들어졌어요. ` +
        `지금 앱은 v${currentVersion}까지만 읽을 수 있어요. 앱을 최신으로 바꾼 뒤 불러와 주세요.`,
    );
  }

  const migratedFrom = env.schemaVersion < currentVersion ? env.schemaVersion : undefined;
  while (env.schemaVersion < currentVersion) {
    const step = migrations.find((m) => m.from === env.schemaVersion);
    if (!step) {
      return fail(`데이터 구조 v${env.schemaVersion} → v${env.schemaVersion + 1} 마이그레이션이 없어요.`);
    }
    try {
      env = step.migrate(env);
    } catch (e) {
      return fail(`v${step.from} 파일을 바꾸는 중 오류가 났어요: ${(e as Error).message}`);
    }
  }

  const scope = env.scope as ExportScope;
  const allowed = new Set(tablesForScope(scope, defs).map((d) => d.name));
  const unknownTables = Object.keys(env.data).filter((t) => !allowed.has(t));
  if (unknownTables.length > 0) {
    return fail(`'${scope}' 범위 파일에 들어 있으면 안 되는 데이터가 있어요: ${unknownTables.join(', ')}`);
  }

  const details: string[] = [];
  const data: TableData = {};
  for (const def of tablesForScope(scope, defs)) {
    const rows = env.data[def.name] ?? [];
    const schema = schemas[def.name];
    const out: Rec[] = [];
    const seen = new Set<string>();
    rows.forEach((row, i) => {
      const r = schema ? schema.safeParse(row) : { success: true as const, data: row };
      if (!r.success) {
        details.push(...formatIssues(r.error.issues, `${def.name}[${i}]`));
        return;
      }
      const rec = r.data as Rec;
      const key = String(rec[def.key]);
      if (seen.has(key)) details.push(`${def.name}[${i}]: 같은 ${def.key}(${key})가 두 번 나와요`);
      seen.add(key);
      out.push(rec);
    });
    data[def.name] = out;
  }

  // 작품에 딸린 레코드가 파일 안의 작품을 가리키는지 확인
  if (scope === 'all' || scope === 'work') {
    const workIds = new Set((data.works ?? []).map((w) => String(w.id)));
    if (scope === 'work') {
      if (!env.workId) details.push("'작품 하나' 파일에 workId가 없어요");
      else if (workIds.size !== 1 || !workIds.has(env.workId))
        details.push("'작품 하나' 파일에는 그 작품 하나만 들어 있어야 해요");
    }
    for (const def of defs) {
      if (def.group !== 'work' || def.name === 'works' || !def.workKey) continue;
      (data[def.name] ?? []).forEach((rec) => {
        const wid = String(rec[def.workKey!]);
        if (!workIds.has(wid)) {
          details.push(`${describeRecord(def.name, rec)}: 파일 안에 없는 작품(${wid})을 가리켜요`);
        }
      });
    }
    const chapterIds = new Set((data.chapters ?? []).map((c) => String(c.id)));
    (data.readerSnapshots ?? []).forEach((rec) => {
      if (!chapterIds.has(String(rec.chapterId))) {
        details.push(`${describeRecord('readerSnapshots', rec)}: 파일 안에 없는 회차(${String(rec.chapterId)})를 가리켜요`);
      }
    });
  }

  if (details.length > 0) {
    return fail('파일 내용 중 올바르지 않은 부분이 있어요. 아무것도 불러오지 않았어요.', details);
  }

  const envelope: Envelope = {
    app: APP_ID,
    schemaVersion: currentVersion,
    exportedAt: env.exportedAt,
    scope,
    data,
  };
  if (env.workId) envelope.workId = env.workId;
  if (env.workTitle !== undefined) envelope.workTitle = env.workTitle;
  return migratedFrom === undefined ? { ok: true, envelope } : { ok: true, envelope, migratedFrom };
}

function formatIssues(
  issues: { path: PropertyKey[]; message: string }[],
  prefix = '',
): string[] {
  return issues.map((iss) => {
    const path = iss.path.map((p) => (typeof p === 'number' ? `[${p}]` : `.${String(p)}`)).join('');
    return `${prefix}${path}: ${iss.message}`;
  });
}

// ───────────────────────── 합치기·교체 계획 ─────────────────────────

export type Conflict = { local: Rec; incoming: Rec; reason: string; label: string };

export type TablePlan = {
  table: string;
  label: string;
  /** 이 기기에 없는 레코드 */
  add: Rec[];
  /** 파일 쪽이 더 최근이라 덮어쓸 레코드 */
  update: { local: Rec; incoming: Rec; label: string }[];
  /** 이 기기 쪽이 더 최근이거나 시각이 같은데 내용이 달라서 이 기기 것을 남기는 레코드 */
  conflicts: Conflict[];
  unchanged: number;
  /** '교체'를 고르면 지워질 이 기기의 레코드 수 (불러오는 범위 안) */
  removeOnReplace: number;
  /** '교체'를 고르면 들어올 레코드 수 */
  incomingCount: number;
};

export type ImportPlan = {
  tables: TablePlan[];
  totals: { add: number; update: number; conflicts: number; unchanged: number; removeOnReplace: number; incoming: number };
};

/**
 * @param existing  각 테이블의 이 기기 레코드 전체 (id 비교용)
 * @param incoming  파일 레코드
 * @param inScope   '교체' 시 지워질 레코드인지 (예: 작품 하나 범위면 그 작품 것만)
 */
export function computeImportPlan(
  existing: TableData,
  incoming: TableData,
  defs: TableDef[],
  inScope: (def: TableDef, rec: Rec) => boolean = () => true,
): ImportPlan {
  const tables: TablePlan[] = defs.map((def) => {
    const local = new Map((existing[def.name] ?? []).map((r) => [String(r[def.key]), r]));
    const plan: TablePlan = {
      table: def.name,
      label: def.label,
      add: [],
      update: [],
      conflicts: [],
      unchanged: 0,
      removeOnReplace: (existing[def.name] ?? []).filter((r) => inScope(def, r)).length,
      incomingCount: (incoming[def.name] ?? []).length,
    };
    for (const rec of incoming[def.name] ?? []) {
      const mine = local.get(String(rec[def.key]));
      if (!mine) {
        plan.add.push(rec);
        continue;
      }
      if (stableStringify(mine) === stableStringify(rec)) {
        plan.unchanged++;
        continue;
      }
      const label = describeRecord(def.name, rec);
      const a = String(mine.updatedAt ?? '');
      const b = String(rec.updatedAt ?? '');
      if (b > a) plan.update.push({ local: mine, incoming: rec, label });
      else
        plan.conflicts.push({
          local: mine,
          incoming: rec,
          label,
          reason: b === a ? '수정 시각이 같은데 내용이 달라요 — 이 기기 것을 남겨요' : '이 기기 쪽이 더 최근이에요 — 이 기기 것을 남겨요',
        });
    }
    return plan;
  });
  const sum = (f: (t: TablePlan) => number) => tables.reduce((n, t) => n + f(t), 0);
  return {
    tables,
    totals: {
      add: sum((t) => t.add.length),
      update: sum((t) => t.update.length),
      conflicts: sum((t) => t.conflicts.length),
      unchanged: sum((t) => t.unchanged),
      removeOnReplace: sum((t) => t.removeOnReplace),
      incoming: sum((t) => t.incomingCount),
    },
  };
}

/** 키 순서와 상관없이 같은 내용이면 같은 문자열 */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Rec;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

export function backupFileName(scope: ExportScope, now: Date, opts: { workTitle?: string; auto?: boolean } = {}): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  const kind = opts.auto
    ? '자동백업'
    : scope === 'work'
      ? `작품-${sanitize(opts.workTitle ?? '')}`
      : { all: '전체', lint: '고증DB', myth: '신화DB', work: '작품' }[scope];
  return `창작작업대-${kind}-${stamp}.json`;
}

function sanitize(s: string): string {
  return s.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40) || '제목없음';
}
