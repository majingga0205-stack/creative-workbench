// 시대 고증 린터 화면에서 함께 쓰는 데이터 훅
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { readSetting } from '../../db/meta';
import type { Chapter, Work, WorkSetting } from '../../db/types';

export function useLintEntries() {
  return useLiveQuery(() => db.lintEntries.toArray(), []);
}

export function useGlossary(workId: string | undefined) {
  return useLiveQuery(async () => (workId ? (await db.glossary.where('workId').equals(workId).toArray()).sort((a, b) => a.canonical.localeCompare(b.canonical, 'ko')) : []), [workId]);
}

export function useResolutions(workId: string | undefined) {
  return useLiveQuery(() => (workId ? db.lintResolutions.where('workId').equals(workId).toArray() : []), [workId]);
}

export function useEraPresets() {
  const rows = useLiveQuery(() => db.settings.toArray(), []);
  return rows ? readSetting(rows, 'lint.eraPresets') : undefined;
}

/** 회차의 시대: 회차에 따로 정했으면 그것, 아니면 작품 시대 설정 */
export const eraOf = (work: Work, chapter?: Chapter): WorkSetting | undefined => chapter?.setting ?? work.setting;

export const eraText = (s?: WorkSetting) => (s ? `${s.label || '이름 없음'} (${s.yearFrom}~${s.yearTo}, ${s.region || '지역 없음'})` : '시대 설정 없음');
