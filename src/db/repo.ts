// 작품·캐릭터·회차 저장 함수. 모든 쓰기는 updatedAt을 갱신한다.
import { db } from './database';
import type { Being, BeingRelation, Boss, Chapter, ChapterVersion, Character, ElementChoice, GlossaryEntry, Hypothesis, LintEntry, LintResolution, NetworkEdit, ReaderSnapshot, Work, WorkKind } from './types';

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
  await db.transaction('rw', [db.works, db.characters, db.chapters, db.readerSnapshots, db.hypotheses, db.glossary, db.lintResolutions, db.networkEdits, db.bosses], async () => {
    await db.bosses.where('workId').equals(workId).delete();
    await db.networkEdits.where('workId').equals(workId).delete();
    await db.glossary.where('workId').equals(workId).delete();
    await db.lintResolutions.where('workId').equals(workId).delete();
    await db.characters.where('workId').equals(workId).delete();
    await db.chapters.where('workId').equals(workId).delete();
    await db.readerSnapshots.where('workId').equals(workId).delete();
    await db.hypotheses.where('workId').equals(workId).delete();
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

/** 캐릭터와 그 캐릭터가 들어간 관계망 수동 보정을 함께 지운다. 호출 전에 확인 창을 띄울 것. */
export async function deleteCharacter(id: string) {
  await db.transaction('rw', [db.characters, db.networkEdits, db.bosses], async () => {
    await db.networkEdits.filter((e) => e.a === id || e.b === id).delete();
    // 이 캐릭터가 보스 주인이면 연결만 푼다 (보스는 남긴다)
    await db.bosses.filter((b) => b.characterId === id).modify((b) => {
      delete b.characterId;
      b.updatedAt = now();
    });
    await db.characters.delete(id);
  });
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

/** 회차와 그 회차의 독자 지표 기록을 함께 지운다. 호출 전에 확인 창을 띄울 것. */
export async function deleteChapter(id: string) {
  await db.transaction('rw', [db.chapters, db.readerSnapshots, db.lintResolutions], async () => {
    await db.readerSnapshots.where('chapterId').equals(id).delete();
    await db.lintResolutions.where('chapterId').equals(id).delete();
    await db.chapters.delete(id);
  });
}

// ── 연재 실험실: 독자 지표 기록 · 가설 ──

export async function saveSnapshot(s: Omit<ReaderSnapshot, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string }) {
  const t = now();
  const rec: ReaderSnapshot = { ...s, id: s.id ?? newId(), createdAt: s.createdAt ?? t, updatedAt: t };
  await db.readerSnapshots.put(rec);
  return rec;
}

export async function deleteSnapshot(id: string) {
  await db.readerSnapshots.delete(id);
}

export async function createHypothesis(workId: string, h: Omit<Hypothesis, 'id' | 'workId' | 'createdAt' | 'updatedAt' | 'status'>) {
  const t = now();
  const rec: Hypothesis = { ...h, id: newId(), workId, status: '대기', createdAt: t, updatedAt: t };
  await db.hypotheses.add(rec);
  return rec;
}

export async function updateHypothesis(id: string, patch: Partial<Omit<Hypothesis, 'id' | 'workId' | 'createdAt'>>) {
  await db.hypotheses.update(id, { ...patch, updatedAt: now() });
}

export async function deleteHypothesis(id: string) {
  await db.hypotheses.delete(id);
}

// ── 시대 고증 린터: 고증 항목 · SF 용어집 · 처리 기록 ──

export async function saveLintEntry(e: LintEntry) {
  await db.lintEntries.put({ ...e, updatedAt: now() });
}

export async function deleteLintEntry(id: string) {
  await db.lintEntries.delete(id);
}

export async function saveGlossary(g: Omit<GlossaryEntry, 'updatedAt'>) {
  await db.glossary.put({ ...g, updatedAt: now() });
}

export async function deleteGlossary(id: string) {
  await db.glossary.delete(id);
}

export async function saveResolution(r: Omit<LintResolution, 'id' | 'createdAt' | 'updatedAt'>) {
  const t = now();
  const rec: LintResolution = { ...r, id: newId(), createdAt: t, updatedAt: t };
  await db.lintResolutions.add(rec);
  return rec;
}

export async function deleteResolution(id: string) {
  await db.lintResolutions.delete(id);
}

// ── 인물 네트워크: 수동 보정 ──

const samePair = (e: NetworkEdit, a: string, b: string) => (e.a === a && e.b === b) || (e.a === b && e.b === a);

/**
 * 두 인물 사이 수동 보정을 정한다.
 * - 'add'/'remove'는 서로 바꿔 끼우는 관계라 한 쌍에 하나만 둔다. null이면 지운다.
 */
export async function setEdgeOverride(workId: string, a: string, b: string, action: 'add' | 'remove' | null) {
  await db.transaction('rw', db.networkEdits, async () => {
    await db.networkEdits.where('workId').equals(workId).filter((e) => samePair(e, a, b) && e.action !== 'label').delete();
    if (action) {
      const t = now();
      await db.networkEdits.add({ id: newId(), workId, a, b, action, createdAt: t, updatedAt: t });
    }
  });
}

/** 관계 라벨. 빈 글이면 지운다 */
export async function setEdgeLabel(workId: string, a: string, b: string, label: string) {
  await db.transaction('rw', db.networkEdits, async () => {
    await db.networkEdits.where('workId').equals(workId).filter((e) => samePair(e, a, b) && e.action === 'label').delete();
    if (label.trim()) {
      const t = now();
      await db.networkEdits.add({ id: newId(), workId, a, b, action: 'label', label: label.trim(), createdAt: t, updatedAt: t });
    }
  });
}

// ── 신화 원형 아카이브: 존재 · 존재 관계 · 캐릭터 대조 ──

export async function saveBeing(b: Being) {
  await db.beings.put({ ...b, updatedAt: now() });
}

/** 존재를 지우면 그 존재가 들어간 관계도 지우고, 연결된 캐릭터(모든 작품)의 연결과 선택을 푼다. 호출 전에 확인 창을 띄울 것. */
export async function deleteBeing(id: string) {
  await db.transaction('rw', [db.beings, db.beingRelations, db.characters], async () => {
    await db.beingRelations.filter((r) => r.fromId === id || r.toId === id).delete();
    await db.characters.filter((c) => c.archetypeId === id).modify((c) => {
      delete c.archetypeId;
      delete c.archetypeChoices;
      c.updatedAt = now();
    });
    await db.beings.delete(id);
  });
}

export async function saveBeingRelation(r: Omit<BeingRelation, 'updatedAt'>) {
  await db.beingRelations.put({ ...r, updatedAt: now() });
}

export async function deleteBeingRelation(id: string) {
  await db.beingRelations.delete(id);
}

/** 캐릭터를 존재에 연결한다. 다른 존재로 바꾸면 요소 선택은 비운다. undefined면 연결을 푼다. */
export async function linkArchetype(characterId: string, beingId: string | undefined) {
  await db.characters.where('id').equals(characterId).modify((c) => {
    if (c.archetypeId !== beingId) delete c.archetypeChoices;
    if (beingId) c.archetypeId = beingId;
    else delete c.archetypeId;
    c.updatedAt = now();
  });
}

/** 요소 하나의 선택(가져옴·변형함·버림·충돌, 없으면 제안을 따름)과 의도함 */
export async function setElementChoice(characterId: string, elementId: string, patch: { choice?: ElementChoice | null; intended?: boolean }) {
  await db.characters.where('id').equals(characterId).modify((c) => {
    const all = { ...(c.archetypeChoices ?? {}) };
    const cur = { ...(all[elementId] ?? {}) };
    if (patch.choice === null) delete cur.choice;
    else if (patch.choice) cur.choice = patch.choice;
    if (patch.intended !== undefined) cur.intended = patch.intended;
    if (!cur.choice && !cur.intended) delete all[elementId];
    else all[elementId] = cur;
    c.archetypeChoices = all;
    c.updatedAt = now();
  });
}

// ── 보스 페이즈 설계 보드 ──

export async function saveBoss(b: Boss) {
  await db.bosses.put({ ...b, updatedAt: now() });
}

export async function deleteBoss(id: string) {
  await db.bosses.delete(id);
}
