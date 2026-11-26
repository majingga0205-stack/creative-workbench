// 화면에서 쓰는 백업 동작 (파일 저장까지)
import { exportData, markBackedUp, snapshotAll } from '../db/backup';
import { backupFileName } from '../db/backupFormat';
import type { ExportScope } from '../db/tables';
import { saveFile, type SaveResult } from './files';

export type BackupSaveResult = SaveResult & { name: string };

export async function exportToFile(scope: ExportScope, workId?: string): Promise<BackupSaveResult> {
  const now = new Date();
  const env = await exportData(scope, { workId, now });
  const name = backupFileName(scope, now, { workTitle: env.workTitle });
  const r = await saveFile(name, JSON.stringify(env, null, 2));
  // 백업 알림은 '전체' 백업 기준. 파일을 실제로 저장했을 때만 백업한 것으로 친다.
  if (r.ok && scope === 'all') await markBackedUp(now);
  return { ...r, name };
}

/** 불러오기 직전 자동 백업 */
export async function autoBackupToFile(): Promise<BackupSaveResult> {
  const now = new Date();
  const env = await snapshotAll();
  const name = backupFileName('all', now, { auto: true });
  const r = await saveFile(name, JSON.stringify(env, null, 2));
  if (r.ok) await markBackedUp(now);
  return { ...r, name };
}
