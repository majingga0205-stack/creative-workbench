// 시대 고증 린터 (SPEC 모듈 A)
import { useState } from 'react';
import { NoWork, useCurrentWork } from '../../app/pages/WorkInfoPage';
import { PageHeader } from '../../shared/ui';
import { useUI } from '../../store/ui';
import { useChapters } from '../serial/useSerial';
import { CheckTab } from './CheckTab';
import { EntryEditor } from './EntryEditor';
import { GlossaryTab } from './GlossaryTab';
import { useGlossary, useLintEntries, useResolutions } from './useLint';

type Tab = 'check' | 'db' | 'glossary';

const TABS: { id: Tab; label: string }[] = [
  { id: 'check', label: '검사' },
  { id: 'db', label: '고증 DB' },
  { id: 'glossary', label: 'SF 용어집' },
];

export default function LintModule() {
  const [tab, setTab] = useState<Tab>('check');
  const work = useCurrentWork();
  const chapters = useChapters(work?.id ?? undefined);
  const entries = useLintEntries();
  const glossary = useGlossary(work?.id ?? undefined);
  const resolutions = useResolutions(work?.id ?? undefined);
  const setView = useUI((s) => s.setView);

  if (work === undefined || !chapters || !entries || !glossary || !resolutions) return null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="시대 고증 린터" sub="원고에서 그 시대에 아직 없던 것과 뜻이 바뀐 말을 찾아요. 경고는 지적일 뿐이니, 일부러 바꾼 설정은 ‘의도함’으로 정리하세요." />
      <div className="mb-4 flex gap-1 border-b border-stone-200" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.id ? 'border-teal-700 font-medium text-teal-800' : 'border-transparent text-stone-600 hover:text-stone-900'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'db' && <EntryEditor />}
      {tab !== 'db' && work === null && <NoWork />}
      {tab === 'check' && work && !chapters.length && (
        <p className="mb-3 text-sm text-stone-500">
          회차 원고가 없어서 붙여넣기로 검사해요.{' '}
          <button type="button" className="underline" onClick={() => setView('chapters')}>회차 원고</button>에 원고를 넣으면 회차로 검사하고 처리 기록을 남길 수 있어요.
        </p>
      )}
      {tab === 'check' && work && <CheckTab key={work.id} work={work} chapters={chapters} entries={entries} glossary={glossary} resolutions={resolutions} />}
      {tab === 'glossary' && work && <GlossaryTab workId={work.id} glossary={glossary} />}
    </div>
  );
}
