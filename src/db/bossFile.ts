// 보스 하나 JSON 파일 (팀원과 주고받기용). 순수 함수, Dexie를 import하지 않는다.
import { bossSchema } from './schema';
import { APP_ID, SCHEMA_VERSION } from './migrations';
import type { Boss } from './types';

export type BossFile = { app: typeof APP_ID; kind: 'boss'; schemaVersion: number; exportedAt: string; boss: Boss };

export function buildBossFile(boss: Boss, now = new Date()): BossFile {
  return { app: APP_ID, kind: 'boss', schemaVersion: SCHEMA_VERSION, exportedAt: now.toISOString(), boss };
}

export type BossParse = { ok: true; boss: Boss } | { ok: false; error: string };

/**
 * 보스 파일을 이 작품의 새 보스로 바꾼다: 새 id, 이 작품 id, 보스 주인은 이 작품에 같은 캐릭터가 있을 때만 남긴다.
 * 이름이 겹치면 ' (불러옴)'을 붙인다.
 */
export function parseBossFile(
  text: string,
  target: { workId: string; characterIds: string[]; existingNames: string[]; newId: () => string; now?: Date },
): BossParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return { ok: false, error: 'JSON 형식이 아니에요.' };
  }
  const r = raw as Partial<BossFile>;
  if (!r || r.app !== APP_ID || r.kind !== 'boss') return { ok: false, error: '창작 작업대의 보스 파일이 아니에요.' };
  if (typeof r.schemaVersion !== 'number' || r.schemaVersion > SCHEMA_VERSION)
    return { ok: false, error: `더 새로운 버전의 앱(데이터 구조 v${r.schemaVersion})에서 만든 파일이에요. 앱을 최신으로 바꾼 뒤 불러와 주세요.` };
  const parsed = bossSchema.safeParse(r.boss);
  if (!parsed.success) return { ok: false, error: `보스 내용이 올바르지 않아요: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}` };
  const b = parsed.data as Boss;
  const t = (target.now ?? new Date()).toISOString();
  const boss: Boss = {
    ...b,
    id: target.newId(),
    workId: target.workId,
    name: target.existingNames.includes(b.name) ? `${b.name} (불러옴)` : b.name,
    createdAt: t,
    updatedAt: t,
  };
  if (!b.characterId || !target.characterIds.includes(b.characterId)) delete boss.characterId;
  return { ok: true, boss };
}
