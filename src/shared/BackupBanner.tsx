import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { readSetting } from '../db/meta';
import { useSession } from '../store/ui';
import { exportToFile } from './backupActions';
import { toast } from './dialogs';
import { Button } from './ui';

const DAY = 24 * 60 * 60 * 1000;

/** 마지막 전체 백업 후 N일(설정)이 지나면 상단에 띄우는 알림 */
export function BackupBanner() {
  const dismissed = useSession((s) => s.backupBannerDismissed);
  const dismiss = useSession((s) => s.dismissBackupBanner);
  const info = useLiveQuery(async () => {
    const [last, settings, works] = await Promise.all([db.meta.get('lastBackupAt'), db.settings.toArray(), db.works.toArray()]);
    const firstWork = works.reduce<string | undefined>((m, w) => (!m || w.createdAt < m ? w.createdAt : m), undefined);
    return { last: last?.value as string | undefined, days: readSetting(settings, 'backupReminderDays'), firstWork };
  }, []);

  if (dismissed || !info || !info.firstWork) return null;
  // 백업한 적이 없으면 첫 작품을 만든 때부터 센다
  const since = info.last ?? info.firstWork;
  const elapsed = Math.floor((Date.now() - new Date(since).getTime()) / DAY);
  if (elapsed < info.days) return null;

  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-sm text-amber-900">
      <span className="flex-1">
        {info.last ? `마지막 전체 백업 후 ${elapsed}일이 지났어요.` : '아직 전체 백업을 한 적이 없어요.'} 브라우저 데이터를 지우면 원고가
        사라질 수 있으니 백업 파일을 저장해 두세요.
      </span>
      <Button
        size="sm"
        variant="primary"
        onClick={async () => {
          const r = await exportToFile('all');
          if (r.ok) toast(`백업 파일을 저장했어요: ${r.name}`);
          else toast(r.message, r.reason === 'declined' ? 'info' : 'error');
        }}
      >
        지금 전체 백업
      </Button>
      <Button size="sm" variant="ghost" onClick={dismiss}>
        나중에
      </Button>
    </div>
  );
}
