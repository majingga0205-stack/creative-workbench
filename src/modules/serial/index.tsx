// 연재 실험실 (SPEC 모듈 C)
import { useState } from 'react';
import { useUI } from '../../store/ui';
import { NoWork, useCurrentWork } from '../../app/pages/WorkInfoPage';
import { Empty, PageHeader } from '../../shared/ui';
import { ChaptersTab } from './ChaptersTab';
import { RhythmTab } from './RhythmTab';
import { VersionsTab } from './VersionsTab';
import { useChapters, useSerialSettings } from './useSerial';

type Tab = 'rhythm' | 'chapters' | 'versions';

const TABS: { id: Tab; label: string }[] = [
  { id: 'rhythm', label: '회차 리듬' },
  { id: 'chapters', label: '회차별 비교' },
  { id: 'versions', label: '버전 비교' },
];

export default function SerialModule() {
  const work = useCurrentWork();
  const chapters = useChapters(work?.id ?? undefined);
  const settings = useSerialSettings();
  const { chapterId, openChapter, setView } = useUI();
  const [tab, setTab] = useState<Tab>('rhythm');
  const [versionId, setVersionId] = useState<string | undefined>();

  if (work === undefined || chapters === undefined || !settings) return null;
  if (work === null) return <NoWork />;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="연재 실험실" sub={`「${work.title}」 · 회차 ${chapters.length}개`} />
      {chapters.length === 0 ? (
        <Empty title="회차 원고가 없어요">
          <button type="button" className="underline" onClick={() => setView('chapters')}>
            회차 원고
          </button>
          에서 원고를 넣으면 여기서 리듬을 재요.
        </Empty>
      ) : (
        <>
          <div className="mb-4 flex gap-1 border-b border-stone-200" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                  tab === t.id ? 'border-teal-700 font-medium text-teal-800' : 'border-transparent text-stone-600 hover:text-stone-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'rhythm' && (
            <RhythmTab
              chapters={chapters}
              chapterId={chapterId}
              versionId={versionId}
              settings={settings}
              onPick={(c, v) => {
                openChapter(c);
                setVersionId(v);
              }}
            />
          )}
          {tab === 'chapters' && (
            <ChaptersTab
              chapters={chapters}
              settings={settings}
              onOpen={(id) => {
                openChapter(id);
                setVersionId(undefined);
                setTab('rhythm');
              }}
            />
          )}
          {tab === 'versions' && <VersionsTab key={chapterId} chapters={chapters} chapterId={chapterId} settings={settings} />}
        </>
      )}
    </div>
  );
}
