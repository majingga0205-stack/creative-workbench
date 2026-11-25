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
  /** 시대 고증 린터: 시대 판정·SF 용어집 켜고 끄기 */
  lintEra: boolean;
  lintGlossary: boolean;
  setLintOptions: (o: Partial<Pick<UIState, 'lintEra' | 'lintGlossary'>>) => void;
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
      lintEra: true,
      lintGlossary: false,
      setLintOptions: (o) => set(o),
      setView: (view) => set({ view }),
      selectWork: (workId) => set({ workId, chapterId: undefined, characterId: undefined }),
      openChapter: (chapterId) => set({ chapterId }),
      openCharacter: (characterId) => set({ characterId }),
    }),
    {
      name: 'creative-workbench-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ view: s.view, workId: s.workId, chapterId: s.chapterId, characterId: s.characterId, lintEra: s.lintEra, lintGlossary: s.lintGlossary }),
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
