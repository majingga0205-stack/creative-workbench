import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { createWork } from '../db/repo';
import { WORK_KINDS, type WorkKind } from '../db/types';
import { useUI } from '../store/ui';
import { Modal, toast } from './dialogs';
import { Button, Field, Input, Select } from './ui';

export function WorkSelector() {
  const works = useLiveQuery(async () => (await db.works.toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), []);
  const { workId, selectWork } = useUI();
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold tracking-wide text-stone-500">작품</div>
      <div className="flex gap-1.5">
        <Select
          aria-label="작품 선택"
          value={workId ?? ''}
          onChange={(e) => selectWork(e.target.value || undefined)}
          className="min-w-0 flex-1 !py-1"
        >
          {!works?.length && <option value="">작품 없음</option>}
          {works?.length ? !works.some((w) => w.id === workId) && <option value="">작품을 고르세요</option> : null}
          {works?.map((w) => (
            <option key={w.id} value={w.id}>
              {w.title || '(제목 없음)'}
            </option>
          ))}
        </Select>
        <Button size="sm" className="!h-[34px]" onClick={() => setCreating(true)} aria-label="새 작품" title="새 작품">
          +
        </Button>
      </div>
      {creating && <NewWorkModal onClose={() => setCreating(false)} />}
    </div>
  );
}

export function NewWorkModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<WorkKind>('소설');
  const { selectWork, setView } = useUI();

  const submit = async () => {
    if (!title.trim()) return;
    const w = await createWork(title.trim(), kind);
    selectWork(w.id);
    setView('work');
    toast(`새 작품을 만들었어요: 「${w.title}」`);
    onClose();
  };

  return (
    <Modal title="새 작품" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="제목">
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 귀향" />
        </Field>
        <Field label="종류">
          <Select value={kind} onChange={(e) => setKind(e.target.value as WorkKind)}>
            {WORK_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>취소</Button>
          <Button type="submit" variant="primary" disabled={!title.trim()}>
            만들기
          </Button>
        </div>
      </form>
    </Modal>
  );
}
