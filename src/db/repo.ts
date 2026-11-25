// 작품·캐릭터·회차 저장 함수. 모든 쓰기는 updatedAt을 갱신한다.
import { db } from './database';
import type { Chapter, ChapterVersion, Character, Work, WorkKind } from './types';

export const newId = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// ── 작품 ──

export async function createWork(title: string, kind: WorkKind): Promise<Work> {
  const t = now();
  const work: Work = { id: newId(), title, kind, createdAt: t, updatedAt: t };
  await db.works.add(work);
  return work;
}

export async function saveWork(work: Work) {
  await db.works.put({ ...work, updatedAt: now() });
}

/** 작품과 딸린 캐릭터·회차를 함께 지운다. 호출 전에 확인 창을 띄울 것. */
export async function deleteWork(workId: string) {
  await db.transaction('rw', [db.works, db.characters, db.chapters], async () => {
    await db.characters.where('workId').equals(workId).delete();
    await db.chapters.where('workId').equals(workId).delete();
    await db.works.delete(workId);
  });
}

export async function countWorkChildren(workId: string) {
  const [characters, chapters] = await Promise.all([
    db.characters.where('workId').equals(workId).count(),
    db.chapters.where('workId').equals(workId).count(),
  ]);
  return { characters, chapters };
}

// ── 캐릭터 ──

export async function createCharacter(workId: string, name: string): Promise<Character> {
  const t = now();
  const c: Character = { id: newId(), workId, name, aliases: [], traits: [], note: '', createdAt: t, updatedAt: t };
  await db.characters.add(c);
  return c;
}

export async function saveCharacter(c: Character) {
  await db.characters.put({ ...c, updatedAt: now() });
}

export async function deleteCharacter(id: string) {
  await db.characters.delete(id);
}

// ── 회차 ──

export function makeVersion(label: string, text: string): ChapterVersion {
  return { id: newId(), label, text, createdAt: now() };
}

export async function nextChapterNumber(workId: string): Promise<number> {
  const list = await db.chapters.where('workId').equals(workId).toArray();
  return list.reduce((m, c) => Math.max(m, c.number), 0) + 1;
}

export async function createChapter(
  workId: string,
  opts: { number?: number; title?: string; text?: string; versionLabel?: string } = {},
): Promise<Chapter> {
  const t = now();
  const v = makeVersion(opts.versionLabel ?? '초고', opts.text ?? '');
  const ch: Chapter = {
    id: newId(),
    workId,
    number: opts.number ?? (await nextChapterNumber(workId)),
    title: opts.title ?? '',
    versions: [v],
    activeVersionId: v.id,
    createdAt: t,
    updatedAt: t,
  };
  await db.chapters.add(ch);
  return ch;
}

export async function saveChapter(ch: Chapter) {
  await db.chapters.put({ ...ch, updatedAt: now() });
}

/** 저장된 최신 회차를 읽어 바꾼 뒤 저장 (버전 추가·삭제처럼 구조를 바꿀 때) */
export async function updateChapter(id: string, change: (ch: Chapter) => Chapter) {
  await db.transaction('rw', db.chapters, async () => {
    const cur = await db.chapters.get(id);
    if (!cur) throw new Error('회차를 찾을 수 없어요');
    await db.chapters.put({ ...change(cur), updatedAt: now() });
  });
}

export async function deleteChapter(id: string) {
  await db.chapters.delete(id);
}
