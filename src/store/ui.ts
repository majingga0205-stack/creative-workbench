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

/** 다른 모듈에서 '회차 원고의 그 자리'로 갈 때 고를 범위 (원문 start/end) */
export type PendingSelection = { chapterId: string; versionId: string; start: number; end: number; label: string };

type UIState = {
  view: View;
  pendingSelection?: PendingSelection;
  /** 회차 원고 편집 화면을 열고 그 버전의 start~end를 골라 둔다 */
  jumpToChapterText: (sel: PendingSelection) => void;
  clearPendingSelection: () => void;
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
      jumpToChapterText: (sel) => set({ chapterId: sel.chapterId, view: 'chapters', pendingSelection: sel }),
      clearPendingSelection: () => set({ pendingSelection: undefined }),
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
