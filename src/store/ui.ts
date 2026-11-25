import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type View =
  | 'work'
  | 'characters'
  | 'chapters'
  | 'lint'
  | 'network'
  | 'serial'
  | 'myth'
  | 'boss'
  | 'settings';

type UIState = {
  view: View;
  workId?: string;
  chapterId?: string;
  characterId?: string;
  setView: (view: View) => void;
  selectWork: (workId: string | undefined) => void;
  openChapter: (chapterId: string | undefined) => void;
  openCharacter: (characterId: string | undefined) => void;
};

// 화면 위치는 브라우저 localStorage에 기억한다 (작품 데이터는 IndexedDB).
export const useUI = create<UIState>()(
  persist(
    (set) => ({
      view: 'work',
      setView: (view) => set({ view }),
      selectWork: (workId) => set({ workId, chapterId: undefined, characterId: undefined }),
      openChapter: (chapterId) => set({ chapterId }),
      openCharacter: (characterId) => set({ characterId }),
    }),
    {
      name: 'creative-workbench-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ view: s.view, workId: s.workId, chapterId: s.chapterId, characterId: s.characterId }),
    },
  ),
);

/** 이번 접속 동안만 유지하는 값 */
type SessionState = {
  backupBannerDismissed: boolean;
  persistStatus: 'unknown' | 'granted' | 'denied' | 'unsupported';
  dismissBackupBanner: () => void;
  setPersistStatus: (s: SessionState['persistStatus']) => void;
};

export const useSession = create<SessionState>()((set) => ({
  backupBannerDismissed: false,
  persistStatus: 'unknown',
  dismissBackupBanner: () => set({ backupBannerDismissed: true }),
  setPersistStatus: (persistStatus) => set({ persistStatus }),
}));
