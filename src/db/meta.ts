import { db as defaultDb, type WorkbenchDB } from './database';
import { DEFAULT_RHYTHM_THRESHOLDS, type RhythmThresholds } from '../core/rhythm/types';
import { DEFAULT_JOSA, DEFAULT_QUOTATIVES, DEFAULT_SCENE_BREAK_SYMBOLS, type ParagraphMode } from '../core/korean';
import { DEFAULT_PRESSURE, type PressureSettings } from '../core/boss/pressure';
import type { Setting, WorkSetting } from './types';

export async function getMeta<T>(key: string, database: WorkbenchDB = defaultDb): Promise<T | undefined> {
  return (await database.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown, database: WorkbenchDB = defaultDb) {
  await database.meta.put({ key, value });
}

// ── 사용자 설정 (백업 파일에 포함) ──

export type ReaderMetricDef = { key: string; label: string };

type SettingValues = {
  /** 마지막 백업 후 며칠이 지나면 알림을 띄울지 */
  backupReminderDays: number;
  /** 연재 실험실 기준값 */
  'serial.thresholds': RhythmThresholds;
  /** 문단 단위: 줄바꿈('line') 또는 빈 줄('blank') */
  'serial.paragraphMode': ParagraphMode;
  /** 독자 지표 목록. 기본은 노벨피아 기준 임시값 (SPEC 모듈 C) */
  'serial.readerMetrics': ReaderMetricDef[];
  /** 연독률을 계산할 지표 key */
  'serial.retentionMetric': string;
  /** 시대 프리셋. '조선 중기' 같은 이름은 학자마다 구분이 달라서 고칠 수 있는 기본값으로만 둔다 (SPEC 모듈 A) */
  'lint.eraPresets': WorkSetting[];
  /** 인물 네트워크: 구분선 없는 회차를 문단 몇 개씩 장면으로 끊나 */
  'network.paragraphsPerScene': number;
  /** 인물 네트워크: 같은 문단에 함께 나오면 더하는 가중치 */
  'network.sameParagraphBonus': number;
  /** 인물 네트워크: 존재감 하락 경고의 '최근 N화' */
  'network.recentChapters': number;
  /** 보스 보드: 압박도 가중치·기준값 */
  'boss.pressure': PressureSettings;
  /** 한국어 텍스트 규칙: 허용 조사 목록 (SPEC '조사 목록은 설정에서 고칠 수 있다') */
  'text.josa': string[];
  /** 한국어 텍스트 규칙: 장면 구분 기호 (한 글자씩) */
  'text.sceneBreakSymbols': string[];
  /** 한국어 텍스트 규칙: 닫는 따옴표 뒤 인용 표현 */
  'text.quotatives': string[];
};

export const SETTING_DEFAULTS: SettingValues = {
  backupReminderDays: 7,
  'serial.thresholds': DEFAULT_RHYTHM_THRESHOLDS,
  'serial.paragraphMode': 'line',
  'serial.readerMetrics': [
    { key: 'views', label: '조회수' },
    { key: 'recommends', label: '추천수' },
    { key: 'comments', label: '댓글수' },
  ],
  'serial.retentionMetric': 'views',
  // 2026-11-25 정함: 조선 중기 = 16세기 중반~17세기(양란 포함). 임시 기본값
  'lint.eraPresets': [{ label: '조선 중기', yearFrom: 1550, yearTo: 1700, region: '한반도' }],
  'network.paragraphsPerScene': 8,
  'network.sameParagraphBonus': 0,
  'network.recentChapters': 5,
  'boss.pressure': DEFAULT_PRESSURE,
  'text.josa': [...DEFAULT_JOSA],
  'text.sceneBreakSymbols': [...DEFAULT_SCENE_BREAK_SYMBOLS],
  'text.quotatives': [...DEFAULT_QUOTATIVES],
};

export type SettingKey = keyof SettingValues;

export async function setSetting(key: SettingKey, value: unknown, database: WorkbenchDB = defaultDb) {
  const rec: Setting = { key, value, updatedAt: new Date().toISOString() };
  await database.settings.put(rec);
}

export function readSetting<K extends SettingKey>(rows: Setting[] | undefined, key: K): SettingValues[K] {
  const found = rows?.find((r) => r.key === key)?.value as SettingValues[K] | undefined;
  const def = SETTING_DEFAULTS[key];
  if (found === undefined || found === null) return def;
  // 기준값처럼 항목이 여러 개인 설정은 새로 생긴 항목이 기본값으로 채워지도록 합친다
  if (typeof def === 'object' && !Array.isArray(def) && typeof found === 'object' && !Array.isArray(found)) {
    return { ...def, ...found } as SettingValues[K];
  }
  return found;
}
