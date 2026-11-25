// IndexedDB 왕복 테스트 (fake-indexeddb). 1단계 완료 조건을 코드로도 확인한다:
// 작품 2개에 회차를 넣고 전체 내보내기 → 데이터 삭제 → 불러오기 → 그대로 복원.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './database';
import { applyImport, exportData, planImport } from './backup';
import { parseBackup } from './backupFormat';
import Dexie from 'dexie';
import { WorkbenchDB } from './database';
import { createChapter, createCharacter, createHypothesis, createWork, deleteChapter, deleteWork, saveSnapshot, saveWork, updateChapter, makeVersion } from './repo';
import { setSetting } from './meta';

async function seed() {
  const a = await createWork('귀향', '게임');
  await saveWork({ ...a, setting: { label: '조선 중기', yearFrom: 1550, yearTo: 1650, region: '한반도' } });
  const b = await createWork('연재작', '소설');
  await createCharacter(a.id, '하람');
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
    expect(plan.totals.add).toBe(Object.values(before).reduce((n, rows) => n + rows.length, 0));
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
    expect(plan.totals.removeOnReplace).toBe(1 + 1 + 3 + 1 + 1); // 작품 1, 캐릭터 1, 회차 3, 독자 지표 1, 가설 1
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

  it('v1 구조 DB(1단계)에 있던 데이터는 v2로 열어도 그대로 남는다', async () => {
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
    expect(upgraded.verno).toBe(2);
    expect((await upgraded.works.get('w1'))?.title).toBe('귀향');
    expect(await upgraded.readerSnapshots.count()).toBe(0);
    upgraded.close();
    await Dexie.delete(name);
  });
});
