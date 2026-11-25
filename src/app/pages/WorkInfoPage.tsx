import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { countWorkChildren, deleteWork } from '../../db/repo';
import { WORK_KINDS, type Work, type WorkKind } from '../../db/types';
import { useUI } from '../../store/ui';
import { confirmDialog, toast } from '../../shared/dialogs';
import { useAutosave } from '../../shared/useAutosave';
import { NewWorkModal } from '../../shared/WorkSelector';
import { Button, Card, Empty, Field, Input, PageHeader, SaveStatus, Select, formatDateTime } from '../../shared/ui';

export function useCurrentWork() {
  const workId = useUI((s) => s.workId);
  return useLiveQuery(async () => (workId ? ((await db.works.get(workId)) ?? null) : null), [workId]);
}

export function NoWork() {
  const [creating, setCreating] = useState(false);
  return (
    <div className="mx-auto max-w-xl pt-10">
      <Empty title="작품을 먼저 만들어 주세요">
        <p>작품이 최상위 단위예요. 캐릭터와 회차 원고는 작품 안에 들어가요.</p>
        <Button variant="primary" className="mt-4" onClick={() => setCreating(true)}>
          새 작품 만들기
        </Button>
      </Empty>
      {creating && <NewWorkModal onClose={() => setCreating(false)} />}
    </div>
  );
}

export default function WorkInfoPage() {
  const work = useCurrentWork();
  if (work === undefined) return null;
  if (work === null) return <NoWork />;
  return <WorkForm key={work.id} work={work} />;
}

type Draft = {
  id: string;
  title: string;
  kind: WorkKind;
  useSetting: boolean;
  label: string;
  yearFrom: string;
  yearTo: string;
  region: string;
};

function toDraft(w: Work): Draft {
  return {
    id: w.id,
    title: w.title,
    kind: w.kind,
    useSetting: !!w.setting,
    label: w.setting?.label ?? '',
    yearFrom: w.setting ? String(w.setting.yearFrom) : '',
    yearTo: w.setting ? String(w.setting.yearTo) : '',
    region: w.setting?.region ?? '한반도',
  };
}

function validate(d: Draft): { yearFrom?: string; yearTo?: string } {
  if (!d.useSetting) return {};
  const err: { yearFrom?: string; yearTo?: string } = {};
  const isInt = (s: string) => /^-?\d+$/.test(s.trim());
  if (!isInt(d.yearFrom)) err.yearFrom = '연도를 숫자로 적어 주세요 (기원전은 음수)';
  if (!isInt(d.yearTo)) err.yearTo = '연도를 숫자로 적어 주세요 (기원전은 음수)';
  if (!err.yearFrom && !err.yearTo && Number(d.yearFrom) > Number(d.yearTo)) err.yearTo = '끝 연도가 시작 연도보다 앞서요';
  return err;
}

async function saveDraft(d: Draft) {
  const patch: Partial<Work> = {
    title: d.title,
    kind: d.kind,
    setting: d.useSetting
      ? { label: d.label, yearFrom: Number(d.yearFrom), yearTo: Number(d.yearTo), region: d.region }
      : undefined,
    updatedAt: new Date().toISOString(),
  };
  await db.works.update(d.id, patch);
}

function WorkForm({ work }: { work: Work }) {
  const [draft, setDraft] = useState(() => toDraft(work));
  const errors = validate(draft);
  const valid = Object.keys(errors).length === 0;
  const { status } = useAutosave(draft, saveDraft, { valid });
  const counts = useLiveQuery(() => countWorkChildren(work.id), [work.id]);
  const { selectWork, setView } = useUI();

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const remove = async () => {
    const ok = await confirmDialog({
      title: `작품 「${work.title}」 지우기`,
      message: (
        <>
          캐릭터 {counts?.characters ?? 0}개와 회차 {counts?.chapters ?? 0}개도 함께 지워져요. 되돌릴 수 없으니 필요하면 먼저
          <b> 설정 · 백업</b>에서 작품 하나 내보내기를 해 두세요.
        </>
      ),
      confirmLabel: '작품 지우기',
      danger: true,
    });
    if (!ok) return;
    await deleteWork(work.id);
    selectWork(undefined);
    toast(`작품을 지웠어요: 「${work.title}」`);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="작품 정보" sub={`만든 날 ${formatDateTime(work.createdAt)}`} right={<SaveStatus status={status} />} />
      <div className="space-y-4">
        <Card title="기본 정보">
          <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
            <Field label="제목">
              <Input value={draft.title} onChange={(e) => set('title', e.target.value)} />
            </Field>
            <Field label="종류">
              <Select value={draft.kind} onChange={(e) => set('kind', e.target.value as WorkKind)}>
                {WORK_KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-4 flex gap-6 text-sm text-stone-600">
            <button type="button" className="hover:underline" onClick={() => setView('characters')}>
              캐릭터 {counts?.characters ?? '…'}명
            </button>
            <button type="button" className="hover:underline" onClick={() => setView('chapters')}>
              회차 {counts?.chapters ?? '…'}개
            </button>
          </div>
        </Card>

        <Card
          title="시대 설정"
          actions={
            <label className="flex items-center gap-2 text-sm text-stone-600">
              <input type="checkbox" checked={draft.useSetting} onChange={(e) => set('useSetting', e.target.checked)} />
              사용
            </label>
          }
        >
          {draft.useSetting ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="시대 이름" hint="화면에 보일 이름이에요. 판정은 아래 연도 범위로만 해요.">
                <Input value={draft.label} onChange={(e) => set('label', e.target.value)} placeholder="예: 조선 중기" />
              </Field>
              <Field label="지역">
                <Input value={draft.region} onChange={(e) => set('region', e.target.value)} placeholder="예: 한반도" />
              </Field>
              <Field label="시작 연도" error={errors.yearFrom}>
                <Input inputMode="numeric" value={draft.yearFrom} onChange={(e) => set('yearFrom', e.target.value)} placeholder="1550" />
              </Field>
              <Field label="끝 연도" error={errors.yearTo}>
                <Input inputMode="numeric" value={draft.yearTo} onChange={(e) => set('yearTo', e.target.value)} placeholder="1650" />
              </Field>
            </div>
          ) : (
            <p className="text-sm text-stone-500">
              시대 고증 린터(4단계)가 쓰는 기본값이에요. 현대물이나 가상 세계라면 꺼 둬도 돼요.
            </p>
          )}
        </Card>

        <div className="flex justify-end">
          <Button variant="danger" onClick={remove}>
            이 작품 지우기
          </Button>
        </div>
      </div>
    </div>
  );
}
