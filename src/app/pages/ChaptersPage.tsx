import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { createChapter, deleteChapter, makeVersion, nextChapterNumber, updateChapter } from '../../db/repo';
import type { Chapter, ChapterVersion } from '../../db/types';
import { guessChapterNumber, guessChapterTitle } from '../../core/io/decodeText';
import { useUI } from '../../store/ui';
import { Modal, confirmDialog, toast } from '../../shared/dialogs';
import { ENCODING_LABEL, readTextFile } from '../../shared/files';
import { useAutosave } from '../../shared/useAutosave';
import { Badge, Button, Card, Empty, Field, Input, PageHeader, SaveStatus, TextArea } from '../../shared/ui';
import { NoWork, useCurrentWork } from './WorkInfoPage';

export default function ChaptersPage() {
  const work = useCurrentWork();
  const { chapterId, openChapter } = useUI();
  const chapters = useLiveQuery(
    () => (work ? db.chapters.where('[workId+number]').between([work.id, -Infinity], [work.id, Infinity]).toArray() : []),
    [work?.id],
  );
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (work === undefined || chapters === undefined) return null;
  if (work === null) return <NoWork />;

  const selected = chapters.find((c) => c.id === chapterId) ?? chapters[0];

  const importFiles = async (files: FileList) => {
    const list = [...files].sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }));
    const used = new Set(chapters.map((c) => c.number));
    let last: Chapter | undefined;
    const notes: string[] = [];
    for (const f of list) {
      const { text, encoding } = await readTextFile(f);
      let num = guessChapterNumber(f.name);
      if (num === undefined || used.has(num)) num = Math.max(0, ...used) + 1;
      used.add(num);
      last = await createChapter(work.id, { number: num, title: guessChapterTitle(f.name), text });
      if (encoding !== 'utf-8') notes.push(`${f.name}: ${ENCODING_LABEL[encoding]}로 읽음`);
    }
    if (last) openChapter(last.id);
    toast(`회차 ${list.length}개를 불러왔어요${notes.length ? ` (${notes.join(', ')})` : ''}`);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="회차 원고"
        sub={`「${work.title}」 · ${chapters.length}개 회차`}
        right={
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,text/plain"
              multiple
              className="hidden"
              data-testid="chapter-file-input"
              onChange={(e) => {
                if (e.target.files?.length) void importFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <Button onClick={() => fileRef.current?.click()}>.txt로 회차 추가</Button>
            <Button variant="primary" onClick={() => setCreating(true)}>
              새 회차
            </Button>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <ul className="space-y-1" aria-label="회차 목록">
          {chapters.map((c) => {
            const active = c.versions.find((v) => v.id === c.activeVersionId);
            const dup = chapters.filter((x) => x.number === c.number).length > 1;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => openChapter(c.id)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                    selected?.id === c.id ? 'bg-white shadow-sm ring-1 ring-stone-200' : 'hover:bg-stone-200/60'
                  }`}
                >
                  <div className="flex items-baseline gap-1.5">
                    <span className={`shrink-0 font-semibold ${dup ? 'text-amber-700' : ''}`}>{c.number}화</span>
                    <span className="truncate">{c.title}</span>
                  </div>
                  <div className="text-xs text-stone-500">
                    버전 {c.versions.length} · 현재: {active?.label}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="min-w-0">
          {selected ? (
            <ChapterEditor key={selected.id} chapter={selected} siblings={chapters} />
          ) : (
            <Empty title="아직 회차가 없어요">‘새 회차’로 원고를 붙여넣거나, ‘.txt로 회차 추가’로 파일 여러 개를 한꺼번에 불러오세요.</Empty>
          )}
        </div>
      </div>
      {creating && <NewChapterModal workId={work.id} onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewChapterModal({ workId, onClose }: { workId: string; onClose: () => void }) {
  const suggested = useLiveQuery(() => nextChapterNumber(workId), [workId]);
  const [number, setNumber] = useState('');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const openChapter = useUI((s) => s.openChapter);
  const num = number.trim() === '' ? suggested : Number(number);
  const valid = num !== undefined && Number.isFinite(num);

  const submit = async () => {
    if (!valid) return;
    const ch = await createChapter(workId, { number: num, title: title.trim(), text });
    openChapter(ch.id);
    onClose();
  };

  return (
    <Modal title="새 회차" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="grid grid-cols-[100px_1fr] gap-3">
          <Field label="회차 번호" error={valid ? undefined : '숫자로 적어 주세요'}>
            <Input inputMode="decimal" value={number} onChange={(e) => setNumber(e.target.value)} placeholder={String(suggested ?? '')} />
          </Field>
          <Field label="제목">
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
        </div>
        <Field label="원고" hint="붙여넣으세요. 비워 두고 나중에 써도 돼요. 첫 버전 이름은 ‘초고’예요.">
          <TextArea rows={10} className="manuscript" value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>취소</Button>
          <Button type="submit" variant="primary" disabled={!valid}>
            만들기
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ───────────────────────── 회차 편집 ─────────────────────────

type MetaDraft = { id: string; number: string; title: string; publishedAt: string };

async function saveMeta(d: MetaDraft) {
  await db.chapters.update(d.id, {
    number: Number(d.number),
    title: d.title,
    publishedAt: d.publishedAt || undefined,
    updatedAt: new Date().toISOString(),
  });
}

function ChapterEditor({ chapter, siblings }: { chapter: Chapter; siblings: Chapter[] }) {
  const [meta, setMeta] = useState<MetaDraft>(() => ({
    id: chapter.id,
    number: String(chapter.number),
    title: chapter.title,
    publishedAt: chapter.publishedAt ?? '',
  }));
  const numOk = meta.number.trim() !== '' && Number.isFinite(Number(meta.number));
  const { status } = useAutosave(meta, saveMeta, { valid: numOk });
  const dup = numOk && siblings.some((c) => c.id !== chapter.id && c.number === Number(meta.number));
  const [viewId, setViewId] = useState(chapter.activeVersionId);
  const version = chapter.versions.find((v) => v.id === viewId) ?? chapter.versions.find((v) => v.id === chapter.activeVersionId)!;
  const fileRef = useRef<HTMLInputElement>(null);
  const openChapter = useUI((s) => s.openChapter);

  const addVersion = async (text: string, label?: string) => {
    const v = makeVersion(label ?? `개선${chapter.versions.length}`, text);
    await updateChapter(chapter.id, (c) => ({ ...c, versions: [...c.versions, v] }));
    setViewId(v.id);
    return v;
  };

  const removeVersion = async (v: ChapterVersion) => {
    if (chapter.versions.length <= 1) return;
    const ok = await confirmDialog({
      title: `버전 ‘${v.label}’ 지우기`,
      message: v.id === chapter.activeVersionId ? '현재 버전이라서, 지우면 남은 첫 버전이 현재 버전이 돼요.' : '되돌릴 수 없어요.',
      confirmLabel: '버전 지우기',
      danger: true,
    });
    if (!ok) return;
    await updateChapter(chapter.id, (c) => {
      const versions = c.versions.filter((x) => x.id !== v.id);
      return { ...c, versions, activeVersionId: c.activeVersionId === v.id ? versions[0].id : c.activeVersionId };
    });
    setViewId(chapter.activeVersionId === v.id ? chapter.versions.find((x) => x.id !== v.id)!.id : chapter.activeVersionId);
  };

  const removeChapter = async () => {
    const ok = await confirmDialog({
      title: `${chapter.number}화 지우기`,
      message: `버전 ${chapter.versions.length}개가 모두 지워져요. 되돌릴 수 없어요.`,
      confirmLabel: '회차 지우기',
      danger: true,
    });
    if (!ok) return;
    await deleteChapter(chapter.id);
    openChapter(undefined);
  };

  return (
    <div className="space-y-4">
      <Card title="회차 정보" actions={<SaveStatus status={status} />}>
        <div className="grid gap-3 sm:grid-cols-[110px_1fr_170px]">
          <Field label="번호" error={!numOk ? '숫자로 적어 주세요' : dup ? '같은 번호의 회차가 있어요' : undefined}>
            <Input inputMode="decimal" value={meta.number} onChange={(e) => setMeta({ ...meta, number: e.target.value })} />
          </Field>
          <Field label="제목">
            <Input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
          </Field>
          <Field label="게시일">
            <Input type="date" value={meta.publishedAt} onChange={(e) => setMeta({ ...meta, publishedAt: e.target.value })} />
          </Field>
        </div>
      </Card>

      <Card
        title="원고"
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              data-testid="version-file-input"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                const { text, encoding } = await readTextFile(f);
                const v = await addVersion(text);
                toast(`‘${v.label}’ 버전으로 불러왔어요${encoding !== 'utf-8' ? ` (${ENCODING_LABEL[encoding]}로 읽음)` : ''}`);
              }}
            />
            <Button size="sm" onClick={() => void addVersion(version.text)}>
              + 이 버전 복사
            </Button>
            <Button size="sm" onClick={() => void addVersion('')}>
              + 빈 버전
            </Button>
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              + .txt로 새 버전
            </Button>
          </>
        }
      >
        <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="버전">
          {chapter.versions.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={v.id === version.id}
              onClick={() => setViewId(v.id)}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm ${
                v.id === version.id ? 'border-teal-600 bg-teal-50 text-teal-900' : 'border-stone-300 bg-white hover:bg-stone-50'
              }`}
            >
              {v.label || '(이름 없음)'}
              {v.id === chapter.activeVersionId && <Badge tone="teal">현재</Badge>}
            </button>
          ))}
        </div>
        <VersionEditor
          key={version.id}
          chapterId={chapter.id}
          version={version}
          isActive={version.id === chapter.activeVersionId}
          canDelete={chapter.versions.length > 1}
          onDelete={() => void removeVersion(version)}
        />
      </Card>

      <div className="flex justify-end">
        <Button variant="danger" onClick={removeChapter}>
          이 회차 지우기
        </Button>
      </div>
    </div>
  );
}

type VersionDraft = { chapterId: string; versionId: string; label: string; text: string };

async function saveVersion(d: VersionDraft) {
  await updateChapter(d.chapterId, (c) => ({
    ...c,
    versions: c.versions.map((v) => (v.id === d.versionId ? { ...v, label: d.label, text: d.text } : v)),
  }));
}

function VersionEditor({
  chapterId,
  version,
  isActive,
  canDelete,
  onDelete,
}: {
  chapterId: string;
  version: ChapterVersion;
  isActive: boolean;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<VersionDraft>(() => ({
    chapterId,
    versionId: version.id,
    label: version.label,
    text: version.text,
  }));
  const { status } = useAutosave(draft, saveVersion);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Input
          aria-label="버전 이름"
          className="!w-40"
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
        />
        {isActive ? (
          <span className="text-xs text-stone-500">다른 모듈은 이 버전을 써요</span>
        ) : (
          <Button
            size="sm"
            onClick={() => updateChapter(chapterId, (c) => ({ ...c, activeVersionId: version.id }))}
          >
            현재 버전으로 정하기
          </Button>
        )}
        <span className="flex-1" />
        <SaveStatus status={status} />
        <Button size="sm" variant="ghost" disabled={!canDelete} onClick={onDelete} title={canDelete ? '' : '버전이 하나뿐이라 지울 수 없어요'}>
          버전 지우기
        </Button>
      </div>
      <TextArea
        aria-label="원고 본문"
        className="manuscript min-h-[60vh] resize-y"
        value={draft.text}
        onChange={(e) => setDraft({ ...draft, text: e.target.value })}
        placeholder="원고를 붙여넣거나 쓰세요. 입력 후 0.5초 뒤 자동으로 저장돼요."
      />
    </div>
  );
}
