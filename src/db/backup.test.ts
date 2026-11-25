// IndexedDB 왕복 테스트 (fake-indexeddb). 1단계 완료 조건을 코드로도 확인한다:
// 작품 2개에 회차를 넣고 전체 내보내기 → 데이터 삭제 → 불러오기 → 그대로 복원.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './database';
import { applyImport, exportData, planImport } from './backup';
import { parseBackup } from './backupFormat';
import Dexie from 'dexie';
import { WorkbenchDB } from './database';
import { createChapter, createCharacter, createHypothesis, createWork, deleteChapter, deleteCharacter, deleteWork, saveGlossary, saveResolution, saveSnapshot, saveWork, setEdgeLabel, setEdgeOverride, updateChapter, makeVersion } from './repo';
import { SCHEMA_VERSION } from './migrations';
import { LINT_SEED } from '../seed/lintSeed';
import { setSetting } from './meta';

async function seed() {
  const a = await createWork('귀향', '게임');
  await saveWork({ ...a, setting: { label: '조선 중기', yearFrom: 1550, yearTo: 1650, region: '한반도' } });
  const b = await createWork('연재작', '소설');
  const haram = await createCharacter(a.id, '하람');
  const sua = await createCharacter(a.id, '수아');
  await setEdgeLabel(a.id, haram.id, sua.id, '가족');
  const ch1 = await createChapter(a.id, { title: '돌아온 길', text: '“왔구나.”\n그가 말했다.' });
  await updateChapter(ch1.id, (c) => {
    const v = makeVersion('개선1', '“왔구나…”\n그는 짧게 말했다.');
    return { ...c, versions: [...c.versions, v], activeVersionId: v.id };
  });
  await createChapter(a.id, { title: '밤길', text: '감자를 캐다.' });
  await createChapter(b.id, { number: 1, title: '시작', text: '첫 문장.' });
  await saveSnapshot({ workId: a.id, chapterId: ch1.id, recordedAt: '2026-11-04', daysAfter: 3, values: { views: 120, comments: 4 } });
  await createHypothesis(a.id, {
    statement: '엔딩을 끊어 치면 다음 화 유지율이 오른다',
    condition: { field: 'endingTag', op: '=', value: '절단' },
    metric: 'views',
    target: 'next',
    checkAfterChapter: 10,
  });
  await saveGlossary({ id: 'g1', workId: a.id, canonical: '나노테크 팔찌', variants: ['나노 팔찌'], status: '사용' });
  await saveResolution({ workId: a.id, ruleKey: 'era:seed-potato', status: '의도함', scope: 'chapter', chapterId: ch1.id });
  await setSetting('backupReminderDays', 3);
  return { a, b };
}

async function dumpAll() {
  return {
    works: await db.works.orderBy('id').toArray(),
    characters: await db.characters.orderBy('id').toArray(),
    chapters: await db.chapters.orderBy('id').toArray(),
    readerSnapshots: await db.readerSnapshots.orderBy('id').toArray(),
    hypotheses: await db.hypotheses.orderBy('id').toArray(),
    glossary: await db.glossary.orderBy('id').toArray(),
    lintResolutions: await db.lintResolutions.orderBy('id').toArray(),
    lintEntries: await db.lintEntries.orderBy('id').toArray(),
    networkEdits: await db.networkEdits.orderBy('id').toArray(),
    settings: await db.settings.orderBy('key').toArray(),
  };
}

async function wipe() {
  await db.delete();
  await db.open();
}

beforeEach(async () => {
  await wipe();
});

describe('전체 내보내기 → 삭제 → 불러오기', () => {
  it('그대로 복원된다', async () => {
    await seed();
    const before = await dumpAll();
    const file = JSON.stringify(await exportData('all'));

    await wipe();
    expect(await db.works.count()).toBe(0);

    const parsed = parseBackup(file);
    if (!parsed.ok) throw new Error(parsed.error + parsed.details.join('\n'));
    const plan = await planImport(parsed.envelope);
    // 시드 고증 항목은 새 DB에도 들어 있으므로 '같음'으로 잡힌다
    expect(plan.totals.add + plan.totals.unchanged).toBe(Object.values(before).reduce((n, rows) => n + rows.length, 0));
    expect(plan.totals.unchanged).toBe(LINT_SEED.length);
    await applyImport(parsed.envelope, 'replace');

    expect(await dumpAll()).toEqual(before);
  });

  it('합치기: 새 것은 추가하고, 이 기기 쪽이 최신인 것은 남긴다', async () => {
    const { a } = await seed();
    const file = JSON.stringify(await exportData('all'));

    // 내보낸 뒤 이 기기에서 작품 이름을 바꾸고 회차 하나를 지운다
    const cur = (await db.works.get(a.id))!;
    await new Promise((r) => setTimeout(r, 5));
    await saveWork({ ...cur, title: '귀향 (수정)' });
    const someChapter = (await db.chapters.where('workId').equals(a.id).first())!;
    await db.chapters.delete(someChapter.id);

    const parsed = parseBackup(file);
    if (!parsed.ok) throw new Error(parsed.error);
    const plan = await planImport(parsed.envelope);
    expect(plan.totals.conflicts).toBe(1);
    expect(plan.totals.add).toBe(1);

    const res = await applyImport(parsed.envelope, 'merge');
    expect(res.keptLocal).toBe(1);
    expect((await db.works.get(a.id))!.title).toBe('귀향 (수정)');
    expect(await db.chapters.get(someChapter.id)).toBeTruthy();
  });

  it('작품 하나 교체는 다른 작품을 건드리지 않는다', async () => {
    const { a, b } = await seed();
    const file = JSON.stringify(await exportData('work', { workId: a.id }));
    await createChapter(a.id, { title: '내보낸 뒤 추가' });

    const parsed = parseBackup(file);
    if (!parsed.ok) throw new Error(parsed.error);
    const plan = await planImport(parsed.envelope);
    expect(plan.totals.removeOnReplace).toBe(1 + 2 + 3 + 1 + 1 + 1 + 1 + 1); // 작품 1, 캐릭터 2, 회차 3, 독자 지표 1, 가설 1, 용어 1, 처리 기록 1, 관계망 보정 1
    await applyImport(parsed.envelope, 'replace');

    expect(await db.chapters.where('workId').equals(a.id).count()).toBe(2);
    expect(await db.chapters.where('workId').equals(b.id).count()).toBe(1);
    expect(await db.settings.count()).toBe(1);
  });
});

describe('지우기와 DB 구조 변경', () => {
  it('회차를 지우면 그 회차의 독자 지표 기록도, 작품을 지우면 딸린 것 전부가 지워진다', async () => {
    const { a } = await seed();
    const snap = (await db.readerSnapshots.toArray())[0];
    await deleteChapter(snap.chapterId);
    expect(await db.readerSnapshots.count()).toBe(0);
    await deleteWork(a.id);
    expect(await db.hypotheses.where('workId').equals(a.id).count()).toBe(0);
    expect(await db.chapters.where('workId').equals(a.id).count()).toBe(0);
  });

  it('v1 구조 DB(1단계)에 있던 데이터는 지금 버전으로 열어도 그대로 남고, 고증 시드가 들어간다', async () => {
    const name = 'upgrade-test';
    const old = new Dexie(name);
    old.version(1).stores({
      works: 'id, updatedAt',
      characters: 'id, workId, updatedAt',
      chapters: 'id, workId, [workId+number], updatedAt',
      settings: 'key',
      meta: 'key',
    });
    await old.open();
    await old.table('works').add({ id: 'w1', title: '귀향', kind: '게임', createdAt: 't', updatedAt: 't' });
    old.close();

    const upgraded = new WorkbenchDB(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(SCHEMA_VERSION);
    expect((await upgraded.works.get('w1'))?.title).toBe('귀향');
    expect(await upgraded.readerSnapshots.count()).toBe(0);
    expect(await upgraded.lintEntries.count()).toBe(LINT_SEED.length);
    upgraded.close();
    await Dexie.delete(name);
  });
});

describe('4단계: 고증 DB', () => {
  it('새 DB에는 고증 시드 5개가 들어 있다 (전부 미검증)', async () => {
    const all = await db.lintEntries.toArray();
    expect(all.map((e) => e.term).sort()).toEqual(['감자', '경제', '고구마', '고추', '담배']);
    expect(all.every((e) => !e.verified)).toBe(true);
  });

  it("'고증 DB만' 내보내기 → 불러오기", async () => {
    await db.lintEntries.update('seed-potato', { verified: true, updatedAt: '2026-12-01T00:00:00.000Z' });
    const file = JSON.stringify(await exportData('lint'));
    const parsed = parseBackup(file);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(Object.keys(parsed.envelope.data)).toEqual(['lintEntries']);
    await wipe();
    await applyImport(parsed.envelope, 'merge');
    expect((await db.lintEntries.get('seed-potato'))?.verified).toBe(true);
  });

  it("예전(v2) '전체' 백업으로 교체해도 그 파일에 없던 고증 DB·용어집은 지우지 않는다", async () => {
    const { a } = await seed();
    const v2 = { ...(await exportData('all')), schemaVersion: 2 } as Record<string, unknown> & { data: Record<string, unknown[]> };
    for (const t of ['lintEntries', 'glossary', 'lintResolutions']) delete v2.data[t];
    await db.lintEntries.update('seed-economy', { note: '이 기기에서 고침' });
    const parsed = parseBackup(JSON.stringify(v2));
    if (!parsed.ok) throw new Error(parsed.error + parsed.details.join());
    expect(parsed.migratedFrom).toBe(2);
    const plan = await planImport(parsed.envelope);
    expect(plan.tables.map((t) => t.table)).not.toContain('lintEntries');
    await applyImport(parsed.envelope, 'replace');
    expect((await db.lintEntries.get('seed-economy'))?.note).toBe('이 기기에서 고침');
    expect(await db.glossary.where('workId').equals(a.id).count()).toBe(1);
  });

  it('회차·작품을 지우면 처리 기록·용어집도 지운다', async () => {
    const { a } = await seed();
    const r = (await db.lintResolutions.toArray())[0];
    await deleteChapter(r.chapterId!);
    expect(await db.lintResolutions.count()).toBe(0);
    await deleteWork(a.id);
    expect(await db.glossary.count()).toBe(0);
  });
});

describe('5단계: 관계망 수동 보정', () => {
  it("추가·삭제는 한 쌍에 하나만 남고, 라벨은 따로 둔다. 빈 라벨은 지운다", async () => {
    const { a } = await seed();
    const [x, y] = await db.characters.where('workId').equals(a.id).toArray();
    await setEdgeOverride(a.id, x.id, y.id, 'add');
    await setEdgeOverride(a.id, y.id, x.id, 'remove');
    const edits = await db.networkEdits.toArray();
    expect(edits.filter((e) => e.action !== 'label').map((e) => e.action)).toEqual(['remove']);
    expect(edits.find((e) => e.action === 'label')?.label).toBe('가족');
    await setEdgeOverride(a.id, x.id, y.id, null);
    await setEdgeLabel(a.id, x.id, y.id, '  ');
    expect(await db.networkEdits.count()).toBe(0);
  });

  it('캐릭터를 지우면 그 캐릭터가 들어간 보정도 지운다', async () => {
    const { a } = await seed();
    const [x] = await db.characters.where('workId').equals(a.id).toArray();
    await deleteCharacter(x.id);
    expect(await db.networkEdits.count()).toBe(0);
  });
});
