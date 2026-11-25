// 시대 고증 린터 (SPEC 모듈 A)
import { useState } from 'react';
import { PageHeader } from '../../shared/ui';
import { EntryEditor } from './EntryEditor';

type Tab = 'check' | 'db' | 'glossary';

const TABS: { id: Tab; label: string }[] = [
  { id: 'check', label: '검사' },
  { id: 'db', label: '고증 DB' },
  { id: 'glossary', label: 'SF 용어집' },
];

export default function LintModule() {
  const [tab, setTab] = useState<Tab>('db');
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="시대 고증 린터" sub="원고에서 그 시대에 아직 없던 것과 뜻이 바뀐 말을 찾아요. 경고는 지적일 뿐, 의도한 설정은 ‘의도함’으로 정리하세요." />
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
    </div>
  );
}
