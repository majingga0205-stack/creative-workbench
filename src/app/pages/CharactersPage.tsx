import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { createCharacter, deleteCharacter } from '../../db/repo';
import type { Character } from '../../db/types';
import { useUI } from '../../store/ui';
import { confirmDialog, toast } from '../../shared/dialogs';
import { useAutosave } from '../../shared/useAutosave';
import { Button, Card, Empty, Field, Input, PageHeader, SaveStatus, TextArea, parseList } from '../../shared/ui';
import { NoWork, useCurrentWork } from './WorkInfoPage';

export default function CharactersPage() {
  const work = useCurrentWork();
  const { characterId, openCharacter } = useUI();
  const characters = useLiveQuery(
    () => (work ? db.characters.where('workId').equals(work.id).sortBy('createdAt') : []),
    [work?.id],
  );
  const [newName, setNewName] = useState('');

  if (work === undefined || characters === undefined) return null;
  if (work === null) return <NoWork />;

  const selected = characters.find((c) => c.id === characterId) ?? characters[0];

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    const c = await createCharacter(work.id, name);
    setNewName('');
    openCharacter(c.id);
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="캐릭터" sub={`「${work.title}」 · ${characters.length}명`} />
      <div className="grid gap-4 md:grid-cols-[240px_1fr]">
        <div className="space-y-3">
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="새 캐릭터 이름" aria-label="새 캐릭터 이름" />
            <Button type="submit" variant="primary" disabled={!newName.trim()}>
              추가
            </Button>
          </form>
          <ul className="space-y-1" aria-label="캐릭터 목록">
            {characters.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => openCharacter(c.id)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                    selected?.id === c.id ? 'bg-white font-medium shadow-sm ring-1 ring-stone-200' : 'hover:bg-stone-200/60'
                  }`}
                >
                  <div>{c.name || '(이름 없음)'}</div>
                  {c.aliases.length > 0 && <div className="truncate text-xs text-stone-500">{c.aliases.join(', ')}</div>}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          {selected ? (
            <CharacterForm key={selected.id} character={selected} />
          ) : (
            <Empty title="아직 캐릭터가 없어요">왼쪽에서 이름을 넣고 추가하세요.</Empty>
          )}
        </div>
      </div>
    </div>
  );
}

type Draft = { id: string; name: string; aliases: string; traits: string; note: string };

const toDraft = (c: Character): Draft => ({
  id: c.id,
  name: c.name,
  aliases: c.aliases.join(', '),
  traits: c.traits.join(', '),
  note: c.note,
});

async function saveDraft(d: Draft) {
  await db.characters.update(d.id, {
    name: d.name.trim(),
    aliases: parseList(d.aliases),
    traits: parseList(d.traits),
    note: d.note,
    updatedAt: new Date().toISOString(),
  });
}

function CharacterForm({ character }: { character: Character }) {
  const [draft, setDraft] = useState(() => toDraft(character));
  const { status } = useAutosave(draft, saveDraft, { valid: draft.name.trim().length > 0 });
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const openCharacter = useUI((s) => s.openCharacter);

  const remove = async () => {
    const ok = await confirmDialog({
      title: `캐릭터 ‘${character.name}’ 지우기`,
      message: '되돌릴 수 없어요.',
      confirmLabel: '지우기',
      danger: true,
    });
    if (!ok) return;
    await deleteCharacter(character.id);
    openCharacter(undefined);
    toast(`캐릭터를 지웠어요: ${character.name}`);
  };

  return (
    <Card title="캐릭터 카드" actions={<SaveStatus status={status} />}>
      <div className="space-y-4">
        <Field label="이름" error={draft.name.trim() ? undefined : '이름을 적어 주세요'}>
          <Input value={draft.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="별칭" hint="쉼표로 구분해요. 인물 네트워크(5단계)가 원고에서 이 인물을 찾을 때 이름과 함께 써요.">
          <Input value={draft.aliases} onChange={(e) => set('aliases', e.target.value)} placeholder="예: 하 대리, 연구원" />
        </Field>
        <Field label="특성" hint="쉼표로 구분해요. 신화 원형 아카이브(6단계)가 원형과 대조할 때 써요.">
          <Input value={draft.traits} onChange={(e) => set('traits', e.target.value)} placeholder="예: 여우 구슬, 둔갑" />
        </Field>
        <Field label="메모">
          <TextArea rows={6} value={draft.note} onChange={(e) => set('note', e.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Button variant="danger" size="sm" onClick={remove}>
            캐릭터 지우기
          </Button>
        </div>
      </div>
    </Card>
  );
}
