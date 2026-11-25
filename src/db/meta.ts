import { db as defaultDb, type WorkbenchDB } from './database';
import type { Setting } from './types';

export async function getMeta<T>(key: string, database: WorkbenchDB = defaultDb): Promise<T | undefined> {
  return (await database.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown, database: WorkbenchDB = defaultDb) {
  await database.meta.put({ key, value });
}

// ── 사용자 설정 (백업 파일에 포함) ──

export const SETTING_DEFAULTS = {
  /** 마지막 백업 후 며칠이 지나면 알림을 띄울지 */
  backupReminderDays: 7,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function setSetting(key: SettingKey, value: unknown, database: WorkbenchDB = defaultDb) {
  const rec: Setting = { key, value, updatedAt: new Date().toISOString() };
  await database.settings.put(rec);
}

export function readSetting<K extends SettingKey>(
  rows: Setting[] | undefined,
  key: K,
): (typeof SETTING_DEFAULTS)[K] {
  const found = rows?.find((r) => r.key === key);
  return (found?.value as (typeof SETTING_DEFAULTS)[K]) ?? SETTING_DEFAULTS[key];
}
