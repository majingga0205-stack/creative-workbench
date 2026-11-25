import { describe, expect, it } from 'vitest';
import { backupFileName, buildEnvelope, computeImportPlan, parseBackup, stableStringify } from './backupFormat';
import { TABLE_DEFS, tablesForScope } from './tables';
import type { Chapter, Character, Work } from './types';

const T1 = '2026-11-01T00:00:00.000Z';
const T2 = '2026-11-02T00:00:00.000Z';

const work = (id: string, title = id, updatedAt = T1): Work => ({
  id, title, kind: '소설', createdAt: T1, updatedAt,
});
const chapter = (id: string, workId: string, number: number, text = '본문', updatedAt = T1): Chapter => ({
  id, workId, number, title: `${number}화`,
  versions: [{ id: `${id}-v1`, label: '초고', text, createdAt: T1 }],
  activeVersionId: `${id}-v1`, createdAt: T1, updatedAt,
});
const character = (id: string, workId: string, name: string): Character => ({
  id, workId, name, aliases: [], traits: [], note: '', createdAt: T1, updatedAt: T1,
});

const allData = () => ({
  works: [work('w1', '귀향'), work('w2', '연재작')],
  characters: [character('c1', 'w1', '하람')],
  chapters: [chapter('ch1', 'w1', 1), chapter('ch2', 'w2', 1)],
  settings: [{ key: 'backupReminderDays', value: 7, updatedAt: T1 }],
});

describe('parseBackup', () => {
  it('정상 파일을 읽는다', () => {
    const env = buildEnvelope('all', allData(), { now: new Date(T2) });
    const r = parseBackup(JSON.stringify(env));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.envelope.data.works).toHaveLength(2);
      expect(r.migratedFrom).toBeUndefined();
    }
  });

  it('JSON이 아니면 거부한다', () => {
    const r = parseBackup('{ 깨진');
    expect(r.ok).toBe(false);
  });

  it('다른 앱 파일은 거부한다', () => {
    const r = parseBackup(JSON.stringify({ app: 'other', schemaVersion: 1, data: {} }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('백업 파일이 아니에요');
  });

  it('스키마 버전이 더 높은 파일은 이유와 함께 거부한다', () => {
    const env = { ...buildEnvelope('all', allData()), schemaVersion: 9 };
    const r = parseBackup(JSON.stringify(env));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('v9');
  });

  it('스키마 버전이 낮은 파일은 마이그레이션을 거쳐 읽는다', () => {
    // v1 파일 → v2 앱. v2에서는 작품 kind에 기본값을 채운다고 가정한 가짜 마이그레이션
    // 지금 버전 V 파일 → V+1 앱. V+1에서는 작품 kind에 기본값을 채운다고 가정한 가짜 마이그레이션
    const old = buildEnvelope('all', { works: [{ ...work('w1'), kind: undefined }] as never });
    const V = old.schemaVersion;
    const r = parseBackup(JSON.stringify(old), {
      currentVersion: V + 1,
      migrations: [
        {
          from: V,
          migrate: (e) => ({
            ...e,
            schemaVersion: V + 1,
            data: { ...e.data, works: e.data.works.map((w) => ({ ...(w as object), kind: '기타' })) },
          }),
        },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.migratedFrom).toBe(V);
      expect(r.envelope.schemaVersion).toBe(V + 1);
      expect((r.envelope.data.works[0] as Work).kind).toBe('기타');
    }
  });

  it('실제 v1 백업 파일(1단계에서 내보낸 것)은 v2로 바꿔 읽는다', () => {
    const v1 = { ...buildEnvelope('all', allData()), schemaVersion: 1 };
    const r = parseBackup(JSON.stringify(v1));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.migratedFrom).toBe(1);
      expect(r.envelope.schemaVersion).toBe(2);
      expect(r.envelope.data.readerSnapshots).toEqual([]);
      expect(r.envelope.data.works).toHaveLength(2);
    }
  });

  it('파일 안에 없는 회차를 가리키는 독자 지표 기록은 거부한다', () => {
    const snap = { id: 's1', workId: 'w1', chapterId: '없는회차', recordedAt: '2026-11-01', daysAfter: 3, values: { views: 10 }, createdAt: T1, updatedAt: T1 };
    const r = parseBackup(JSON.stringify(buildEnvelope('all', { ...allData(), readerSnapshots: [snap] })));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.details.join()).toContain('없는 회차');
  });

  it('마이그레이션이 빠져 있으면 거부한다', () => {
    const old = buildEnvelope('all', allData());
    const r = parseBackup(JSON.stringify(old), { currentVersion: old.schemaVersion + 1, migrations: [] });
    expect(r.ok).toBe(false);
  });

  it('레코드 형식이 틀리면 위치를 알려 주고 아무것도 받지 않는다', () => {
    const data = allData();
    (data.chapters[1] as { activeVersionId: string }).activeVersionId = '없는버전';
    const r = parseBackup(JSON.stringify(buildEnvelope('all', data)));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.details.join('\n')).toContain('chapters[1]');
  });

  it('파일 안에 없는 작품을 가리키는 회차는 거부한다', () => {
    const data = allData();
    data.chapters.push(chapter('ch9', 'w-없음', 3));
    const r = parseBackup(JSON.stringify(buildEnvelope('all', data)));
    expect(r.ok).toBe(false);
  });

  it('같은 id가 두 번 나오면 거부한다', () => {
    const data = allData();
    data.works.push(work('w1'));
    const r = parseBackup(JSON.stringify(buildEnvelope('all', data)));
    expect(r.ok).toBe(false);
  });

  it("'작품 하나' 파일은 그 작품 데이터만 있어야 한다", () => {
    const d = allData();
    const ok = buildEnvelope(
      'work',
      { works: [d.works[0]], characters: d.characters, chapters: [d.chapters[0]] },
      { workId: 'w1', workTitle: '귀향' },
    );
    expect(parseBackup(JSON.stringify(ok)).ok).toBe(true);

    const bad = buildEnvelope('work', { works: d.works, characters: [], chapters: [] }, { workId: 'w1' });
    expect(parseBackup(JSON.stringify(bad)).ok).toBe(false);

    const withSettings = { ...ok, data: { ...ok.data, settings: d.settings } };
    expect(parseBackup(JSON.stringify(withSettings)).ok).toBe(false);
  });
});

describe('computeImportPlan', () => {
  const defs = tablesForScope('all', TABLE_DEFS);

  it('추가·변경·충돌·같음을 나눈다', () => {
    const existing = {
      works: [work('w1', '귀향', T1), work('w2', '로컬이 최신', T2), work('w3', '같음', T1)],
      characters: [],
      chapters: [],
      settings: [],
    };
    const incoming = {
      works: [
        work('w1', '귀향 (파일이 최신)', T2), // 변경
        work('w2', '파일이 예전', T1), // 충돌: 로컬이 최신
        work('w3', '같음', T1), // 같음
        work('w4', '새 작품', T1), // 추가
      ],
      characters: [],
      chapters: [chapter('ch1', 'w4', 1)],
      settings: [],
    };
    const plan = computeImportPlan(existing, incoming, defs);
    expect(plan.totals).toMatchObject({ add: 2, update: 1, conflicts: 1, unchanged: 1, removeOnReplace: 3, incoming: 5 });
    const works = plan.tables.find((t) => t.table === 'works')!;
    expect(works.update[0].incoming.title).toBe('귀향 (파일이 최신)');
    expect(works.conflicts[0].local.title).toBe('로컬이 최신');
    expect(works.conflicts[0].reason).toContain('이 기기 쪽이 더 최근');
  });

  it('수정 시각이 같은데 내용이 다르면 충돌로 본다', () => {
    const plan = computeImportPlan(
      { works: [work('w1', 'A', T1)] },
      { works: [work('w1', 'B', T1)] },
      defs.filter((d) => d.name === 'works'),
    );
    expect(plan.totals.conflicts).toBe(1);
    expect(plan.tables[0].conflicts[0].reason).toContain('같은데');
  });

  it('교체 시 지울 개수는 범위 안 레코드만 센다', () => {
    const plan = computeImportPlan(
      { works: [work('w1'), work('w2')] },
      { works: [work('w1')] },
      defs.filter((d) => d.name === 'works'),
      (_def, rec) => rec.id === 'w1',
    );
    expect(plan.totals.removeOnReplace).toBe(1);
  });
});

describe('보조 함수', () => {
  it('stableStringify는 키 순서를 무시한다', () => {
    expect(stableStringify({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(stableStringify({ b: [1, { d: 3, c: 2 }], a: 1 }));
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }));
  });

  it('백업 파일 이름', () => {
    const d = new Date(2026, 10, 25, 9, 5, 3);
    expect(backupFileName('all', d)).toBe('창작작업대-전체-20261125-090503.json');
    expect(backupFileName('work', d, { workTitle: '귀향: 1부' })).toBe('창작작업대-작품-귀향_1부-20261125-090503.json');
    expect(backupFileName('all', d, { auto: true })).toBe('창작작업대-자동백업-20261125-090503.json');
  });
});
