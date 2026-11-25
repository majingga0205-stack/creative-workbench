// 연재 실험실 (SPEC 모듈 C)
import { useMemo, useState } from 'react';
import { effectiveStatus } from '../../core/rhythm';
import { useUI } from '../../store/ui';
import { NoWork, useCurrentWork } from '../../app/pages/WorkInfoPage';
import { Empty, PageHeader } from '../../shared/ui';
import { ChaptersTab } from './ChaptersTab';
import { HypothesesTab } from './HypothesesTab';
import { ReadersTab } from './ReadersTab';
import { RhythmTab } from './RhythmTab';
import { VersionsTab } from './VersionsTab';
import { buildChapterRows, useChapters, useHypotheses, useSerialSettings, useSnapshots } from './useSerial';

type Tab = 'rhythm' | 'chapters' | 'versions' | 'readers' | 'hypotheses';

const TABS: { id: Tab; label: string }[] = [
  { id: 'rhythm', label: '회차 리듬' },
  { id: 'chapters', label: '회차별 비교' },
  { id: 'versions', label: '버전 비교' },
  { id: 'readers', label: '독자 지표' },
  { id: 'hypotheses', label: '가설' },
];

export default function SerialModule() {
  const work = useCurrentWork();
  const chapters = useChapters(work?.id ?? undefined);
  const settings = useSerialSettings();
  const { chapterId, openChapter, setView } = useUI();
  const [tab, setTab] = useState<Tab>('rhythm');
  const [versionId, setVersionId] = useState<string | undefined>();
  const snapshots = useSnapshots(work?.id ?? undefined);
  const hypotheses = useHypotheses(work?.id ?? undefined);
  const rows = useMemo(
    () => (chapters && snapshots && settings ? buildChapterRows(chapters, snapshots, settings) : []),
    [chapters, snapshots, settings],
  );
  const dueCount = (hypotheses ?? []).filter((h) => effectiveStatus(h, rows) === '확인할 때 됨').length;

  if (work === undefined || chapters === undefined || !settings || !snapshots) return null;
  if (work === null) return <NoWork />;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="연재 실험실" sub={`「${work.title}」 · 회차 ${chapters.length}개`} />
      {dueCount > 0 && (
        <div role="status" className="mb-4 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900" data-testid="due-banner">
          <span>⏰ 확인할 가설 {dueCount}개 — 확인 회차의 지표가 들어왔어요.</span>
          <button type="button" className="font-medium underline" onClick={() => setTab('hypotheses')}>
            가설 보기
          </button>
        </div>
      )}
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
          {tab === 'readers' && <ReadersTab workId={work.id} chapters={chapters} snapshots={snapshots} settings={settings} />}
          {tab === 'hypotheses' && <HypothesesTab workId={work.id} rows={rows} settings={settings} />}
        </>
      )}
    </div>
  );
}
