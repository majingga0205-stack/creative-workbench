import { useEffect, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/database';
import { useSession, useUI, type View } from './store/ui';
import { WorkSelector } from './shared/WorkSelector';
import { BackupBanner } from './shared/BackupBanner';
import { DialogHost } from './shared/dialogs';
import { ErrorBoundary } from './shared/ErrorBoundary';
import { requestPersist } from './shared/storagePersist';
import WorkInfoPage from './app/pages/WorkInfoPage';
import CharactersPage from './app/pages/CharactersPage';
import ChaptersPage from './app/pages/ChaptersPage';
import SettingsPage from './app/pages/SettingsPage';
import LintModule from './modules/lint';
import NetworkModule from './modules/network';
import SerialModule from './modules/serial';
import MythModule from './modules/myth';
import BossModule from './modules/boss';

const WORK_NAV: { view: View; label: string }[] = [
  { view: 'work', label: '작품 정보' },
  { view: 'characters', label: '캐릭터' },
  { view: 'chapters', label: '회차 원고' },
];

const MODULE_NAV: { view: View; label: string; stage: string }[] = [
  { view: 'lint', label: '시대 고증 린터', stage: '4' },
  { view: 'network', label: '인물 네트워크', stage: '5' },
  { view: 'serial', label: '연재 실험실', stage: '3' },
  { view: 'myth', label: '신화 원형 아카이브', stage: '6' },
  { view: 'boss', label: '보스 페이즈 설계 보드', stage: '7·8' },
];

const PAGES: Record<View, () => ReactNode> = {
  work: () => <WorkInfoPage />,
  characters: () => <CharactersPage />,
  chapters: () => <ChaptersPage />,
  lint: () => <LintModule />,
  network: () => <NetworkModule />,
  serial: () => <SerialModule />,
  myth: () => <MythModule />,
  boss: () => <BossModule />,
  settings: () => <SettingsPage />,
};

export default function App() {
  const { view, setView, workId, selectWork } = useUI();
  const persistStatus = useSession((s) => s.persistStatus);
  const workIds = useLiveQuery(() => db.works.toCollection().primaryKeys(), []);

  useEffect(() => {
    void requestPersist();
  }, []);

  // 골라 둔 작품이 지워졌거나 없으면 첫 작품으로
  useEffect(() => {
    if (!workIds) return;
    if (workId && workIds.includes(workId)) return;
    if (workIds[0] !== workId) selectWork(workIds[0]);
  }, [workIds, workId, selectWork]);

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-stone-200 bg-stone-50">
        <div className="px-4 pt-4 pb-3">
          <div className="text-[15px] font-bold tracking-tight">창작 작업대</div>
        </div>
        <div className="px-3 pb-3">
          <WorkSelector />
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-3" aria-label="메뉴">
          <NavGroup>
            {WORK_NAV.map((n) => (
              <NavItem key={n.view} active={view === n.view} onClick={() => setView(n.view)}>
                {n.label}
              </NavItem>
            ))}
          </NavGroup>
          <div className="mt-4 mb-1 px-2 text-[11px] font-semibold tracking-wide text-stone-500">모듈</div>
          <NavGroup>
            {MODULE_NAV.map((n) => (
              <NavItem key={n.view} active={view === n.view} onClick={() => setView(n.view)}>
                <span className="flex-1 truncate">{n.label}</span>
                <span className="text-[10px] text-stone-400">{n.stage}단계</span>
              </NavItem>
            ))}
          </NavGroup>
        </nav>
        <div className="border-t border-stone-200 p-2">
          <NavItem active={view === 'settings'} onClick={() => setView('settings')}>
            설정 · 백업
          </NavItem>
          <div className="px-2 pt-1.5 text-[11px] text-stone-400" title="브라우저가 저장 공간을 임의로 지우지 않도록 요청한 결과">
            저장소 보호:{' '}
            {{ granted: '켜짐', denied: '꺼짐', unsupported: '지원 안 함', unknown: '확인 중' }[persistStatus]}
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <BackupBanner />
        <main className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          <ErrorBoundary key={view}>{PAGES[view]()}</ErrorBoundary>
        </main>
      </div>
      <DialogHost />
    </div>
  );
}

function NavGroup({ children }: { children: ReactNode }) {
  return <ul className="space-y-0.5">{children}</ul>;
}

function NavItem({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
          active ? 'bg-white font-medium text-teal-800 shadow-sm ring-1 ring-stone-200' : 'text-stone-700 hover:bg-stone-200/60'
        }`}
      >
        {children}
      </button>
    </li>
  );
}
