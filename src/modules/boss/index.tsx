// 보스 페이즈 설계 보드 (SPEC 모듈 E) — 7단계: 카드·타이밍·곡선 (2D 미리보기·검사·기획서는 8단계)
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { readSetting } from '../../db/meta';
import { newId, saveBoss } from '../../db/repo';
import { newBossDefaults, newPhase } from '../../core/boss';
import { NoWork, useCurrentWork } from '../../app/pages/WorkInfoPage';
import { Button, Empty, Input, PageHeader } from '../../shared/ui';
import { BossEditor } from './BossEditor';

export default function BossModule() {
  const work = useCurrentWork();
  const bosses = useLiveQuery(async () => (work ? (await db.bosses.where('workId').equals(work.id).toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : []), [work?.id]);
  const characters = useLiveQuery(() => (work ? db.characters.where('workId').equals(work.id).sortBy('createdAt') : []), [work?.id]);
  const settingRows = useLiveQuery(() => db.settings.toArray(), []);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState('');

  if (work === undefined || !bosses || !characters || !settingRows) return null;
  if (work === null) return <NoWork />;
  const current = bosses.find((b) => b.id === selected) ?? bosses[0];

  const create = async () => {
    if (!name.trim()) return;
    const t = new Date().toISOString();
    const id = newId();
    await saveBoss({ id, workId: work.id, name: name.trim(), ...newBossDefaults(), phases: [newPhase(newId(), 0)], createdAt: t, updatedAt: t });
    setName('');
    setSelected(id);
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="보스 페이즈 설계 보드" sub="페이즈 카드로 보스 전투를 설계하고, 패턴 타이밍으로 계산한 압박도를 의도한 긴장도와 겹쳐 봐요. (횡스크롤 · 2D 미리보기는 8단계)" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {bosses.map((b) => (
          <Button key={b.id} variant={current?.id === b.id ? 'primary' : 'secondary'} size="sm" onClick={() => setSelected(b.id)}>
            {b.name || '(이름 없음)'}
          </Button>
        ))}
        <form className="ml-auto flex gap-1.5" onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <Input aria-label="새 보스 이름" className="!w-48" placeholder="새 보스 이름" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={!name.trim()}>보스 만들기</Button>
        </form>
      </div>
      {current ? (
        <BossEditor key={current.id} boss={current} characters={characters} settings={readSetting(settingRows, 'boss.pressure')} onDeleted={() => setSelected(null)} />
      ) : (
        <Empty title="아직 보스가 없어요">이름을 넣고 ‘보스 만들기’를 누르세요. 페이즈 하나로 시작해요.</Empty>
      )}
    </div>
  );
}
