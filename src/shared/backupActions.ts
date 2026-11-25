// 화면에서 쓰는 백업 동작 (파일 저장까지)
import { exportData, markBackedUp, snapshotAll } from '../db/backup';
import { backupFileName } from '../db/backupFormat';
import type { ExportScope } from '../db/tables';
import { downloadText } from './files';

export async function exportToFile(scope: ExportScope, workId?: string): Promise<string> {
  const now = new Date();
  const env = await exportData(scope, { workId, now });
  const name = backupFileName(scope, now, { workTitle: env.workTitle });
  downloadText(name, JSON.stringify(env, null, 2));
  // 백업 알림은 '전체' 백업 기준
  if (scope === 'all') await markBackedUp(now);
  return name;
}

/** 불러오기 직전 자동 백업 */
export async function autoBackupToFile(): Promise<string> {
  const now = new Date();
  const env = await snapshotAll();
  const name = backupFileName('all', now, { auto: true });
  downloadText(name, JSON.stringify(env, null, 2));
  await markBackedUp(now);
  return name;
}
