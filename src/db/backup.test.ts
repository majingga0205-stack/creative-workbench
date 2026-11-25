// IndexedDB 왕복 테스트 (fake-indexeddb). 1단계 완료 조건을 코드로도 확인한다:
// 작품 2개에 회차를 넣고 전체 내보내기 → 데이터 삭제 → 불러오기 → 그대로 복원.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './database';
import { applyImport, exportData, planImport } from './backup';
import { parseBackup } from './backupFormat';
import { createChapter, createCharacter, createWork, saveWork, updateChapter, makeVersion } from './repo';
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
  await setSetting('backupReminderDays', 3);
  return { a, b };
}

async function dumpAll() {
  return {
    works: await db.works.orderBy('id').toArray(),
    characters: await db.characters.orderBy('id').toArray(),
    chapters: await db.chapters.orderBy('id').toArray(),
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
    expect(plan.totals.add).toBe(before.works.length + before.characters.length + before.chapters.length + before.settings.length);
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
    expect(plan.totals.removeOnReplace).toBe(1 + 1 + 3); // 작품 1, 캐릭터 1, 회차 3
    await applyImport(parsed.envelope, 'replace');

    expect(await db.chapters.where('workId').equals(a.id).count()).toBe(2);
    expect(await db.chapters.where('workId').equals(b.id).count()).toBe(1);
    expect(await db.settings.count()).toBe(1);
  });
});
