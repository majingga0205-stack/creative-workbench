// 신화 원형 아카이브 (SPEC 모듈 D)
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useCurrentWork } from '../../app/pages/WorkInfoPage';
import { PageHeader } from '../../shared/ui';
import { BeingsTab } from './BeingsTab';
import { CompareTab } from './CompareTab';
import { GraphTab } from './GraphTab';

type Tab = 'compare' | 'beings' | 'graph';

const TABS: { id: Tab; label: string }[] = [
  { id: 'compare', label: '내 캐릭터 대조' },
  { id: 'beings', label: '존재' },
  { id: 'graph', label: '관계 그래프' },
];

export default function MythModule() {
  const [tab, setTab] = useState<Tab>('compare');
  const work = useCurrentWork();
  const beings = useLiveQuery(async () => (await db.beings.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'ko')), []);
  const relations = useLiveQuery(() => db.beingRelations.toArray(), []);
  const characters = useLiveQuery(() => (work ? db.characters.where('workId').equals(work.id).sortBy('createdAt') : []), [work?.id]);
  if (!beings || !relations || !characters || work === undefined) return null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="신화 원형 아카이브" sub="신화·설화 존재의 원형 요소를 쌓고, 내 캐릭터가 원형에서 무엇을 가져오고 바꾸고 버렸는지 봐요." />
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
      {tab === 'compare' && <CompareTab characters={characters} beings={beings} />}
      {tab === 'beings' && <BeingsTab beings={beings} />}
      {tab === 'graph' && <GraphTab beings={beings} relations={relations} characters={characters} />}
    </div>
  );
}
