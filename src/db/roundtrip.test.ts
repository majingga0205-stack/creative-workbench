// 9단계 통합 점검: 모든 모듈에 데이터를 넣은 상태에서 전체 내보내기 → 삭제 → 불러오기 왕복.
// TABLE_DEFS의 모든 테이블을 다룬다. 테이블이 새로 생기면 아래 '빠진 테이블' 테스트가 실패해서 알려 준다.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './database';
import { applyImport, exportData, planImport } from './backup';
import { parseBackup } from './backupFormat';
import { SETTING_DEFAULTS, setSetting, type SettingKey } from './meta';
import { TABLE_DEFS } from './tables';
import { PATTERN_SHAPES, type Being, type Boss, type Chapter, type Character, type LintEntry } from './types';
import { newBossDefaults, newPattern, newPhase } from '../core/boss';

const T = '2026-11-26T01:00:00.000Z';

async function wipe() {
  await db.delete();
  await db.open();
}

/** 모든 테이블을 키 순서로 */
async function dumpAll() {
  const out: Record<string, unknown[]> = {};
  for (const def of TABLE_DEFS) {
    const rows = await db.tableByName(def.name).toArray();
    out[def.name] = rows.sort((a, b) => String(a[def.key]).localeCompare(String(b[def.key])));
  }
  return out;
}

/** 모든 모듈에 데이터를 넣는다 */
async function seedEverything() {
  const works = [
    { id: 'w1', title: '귀향', kind: '게임' as const, setting: { label: '조선 중기', yearFrom: 1550, yearTo: 1700, region: '한반도' }, createdAt: T, updatedAt: T },
    { id: 'w2', title: '연재작', kind: '소설' as const, createdAt: T, updatedAt: T },
  ];
  await db.works.bulkPut(works);

  const characters: Character[] = [
    { id: 'c1', workId: 'w1', name: '하람', aliases: ['하 대리', '연구원'], nameRequiredAliases: ['연구원'], archetypeId: 'b-custom', archetypeChoices: { e1: { choice: '변형함' }, e2: { intended: true } }, traits: ['뿔', '과묵함'], note: '메모', createdAt: T, updatedAt: T },
    { id: 'c2', workId: 'w1', name: '수아', aliases: [], traits: [], note: '', createdAt: T, updatedAt: T },
    { id: 'c3', workId: 'w2', name: '도윤', aliases: [], traits: [], note: '', createdAt: T, updatedAt: T },
  ];
  await db.characters.bulkPut(characters);

  const chapters: Chapter[] = [
    {
      id: 'ch1', workId: 'w1', number: 1, title: '돌아온 길',
      versions: [{ id: 'v1', label: '초고', text: '“왔구나.”\n하람이 감자를 캤다.\n=\n수아가 웃었다.', createdAt: T }, { id: 'v2', label: '개선1', text: '“왔구나…”\n하람은 감자를 캤다.', createdAt: T }],
      activeVersionId: 'v2', publishedAt: '2026-11-01', endingTag: '절단', endingTagSource: 'user',
      setting: { label: '조선 후기', yearFrom: 1700, yearTo: 1800, region: '한반도' }, createdAt: T, updatedAt: T,
    },
    { id: 'ch2', workId: 'w1', number: 2, title: '', versions: [{ id: 'v3', label: '초고', text: '수아와 하람.', createdAt: T }], activeVersionId: 'v3', createdAt: T, updatedAt: T },
    { id: 'ch3', workId: 'w2', number: 1, title: '시작', versions: [{ id: 'v4', label: '초고', text: '도윤이 왔다.', createdAt: T }], activeVersionId: 'v4', createdAt: T, updatedAt: T },
  ];
  await db.chapters.bulkPut(chapters);

  await db.readerSnapshots.bulkPut([{ id: 's1', workId: 'w1', chapterId: 'ch1', recordedAt: '2026-11-04', daysAfter: 3, values: { views: 1200, comments: 8 }, createdAt: T, updatedAt: T }]);
  await db.hypotheses.bulkPut([
    { id: 'h1', workId: 'w1', statement: '절단 엔딩이면 다음 화 조회수가 오른다', condition: { field: 'endingTag', op: '=', value: '절단' }, metric: 'views', target: 'next', checkAfterChapter: 5, status: '지지됨', resultNote: '표본 부족', createdAt: T, updatedAt: T },
  ]);
  await db.glossary.bulkPut([{ id: 'g1', workId: 'w1', canonical: '스마트폰', variants: ['휴대폰'], status: '금지', replacement: '통신석', note: 'SF 금지어', updatedAt: T }]);
  await db.lintResolutions.bulkPut([{ id: 'r1', workId: 'w1', ruleKey: 'era:seed-potato', status: '의도함', scope: 'position', chapterId: 'ch1', context: '하람은 감자를 캤다', createdAt: T, updatedAt: T }]);
  await db.networkEdits.bulkPut([
    { id: 'n1', workId: 'w1', a: 'c1', b: 'c2', action: 'label', label: '가족', createdAt: T, updatedAt: T },
    { id: 'n2', workId: 'w1', a: 'c1', b: 'c2', action: 'add', createdAt: T, updatedAt: T },
  ]);

  const phase = {
    ...newPhase('ph1', 0),
    name: '평온',
    emotion: '평온',
    gapIntended: true,
    patterns: PATTERN_SHAPES.map((s, i) => ({ ...newPattern(`pt${i}`, s), line: i === 0 ? '아직은 괜찮아.' : undefined })).map((p) => (p.line === undefined ? (({ line: _l, ...rest }) => rest)(p) : p)),
    sequence: PATTERN_SHAPES.map((_, i) => ({ patternId: `pt${i}`, weight: i + 1 })),
  };
  const boss: Boss = { id: 'boss1', workId: 'w1', name: '죽음의 다섯 단계', characterId: 'c1', ...newBossDefaults(), phases: [phase, { ...newPhase('ph2', 1), intendedTension: 8 }], createdAt: T, updatedAt: T };
  await db.bosses.bulkPut([boss]);

  const entry: LintEntry = {
    id: 'l-custom', term: '양반전', aliases: ['양반 전'], matchMode: 'prefix', exclude: ['양반전기'], category: '기타', kind: 'not_yet', region: '한반도',
    appears: { from: 1780, to: 1800, precision: '시기' }, sources: [{ title: '예시 출처', author: '저자', year: '1800', locator: '1쪽', type: '기타', url: 'https://example.invalid' }],
    disputed: true, disputeNote: '이설', verified: true, note: '테스트용', updatedAt: T,
  };
  await db.lintEntries.bulkPut([entry]);
  const being: Being = {
    id: 'b-custom', name: '두억시니', aliases: ['두억신'], summary: '테스트용 존재',
    elements: [
      { id: 'e1', label: '머리를 짓누름', category: '능력', weight: 'core', keywords: ['짓누름'], opposite: ['가벼움'], sources: [{ title: '사전', type: '사전' }], verified: true, note: '메모' },
      { id: 'e2', label: '밤에 나타남', category: '출현 장소', weight: 'variant', keywords: ['밤'], opposite: [], sources: [], verified: false },
    ],
    traps: [{ id: 't1', claim: '오해', correction: '바로잡음', triggerWords: ['뿔'], sources: [], verified: false }],
    updatedAt: T,
  };
  await db.beings.bulkPut([being]);
  await db.beingRelations.bulkPut([{ id: 'br1', fromId: 'b-custom', toId: 'seed-dokkaebi', label: '함께 나옴', sources: [{ title: '출처', type: '기타' }], updatedAt: T }]);

  // 설정: 모든 키를 기본값과 다르게
  const changed: Record<SettingKey, unknown> = {
    backupReminderDays: 3,
    'serial.thresholds': { ...SETTING_DEFAULTS['serial.thresholds'], wallParagraph: 150 },
    'serial.paragraphMode': 'blank',
    'serial.readerMetrics': [{ key: 'views', label: '조회' }, { key: 'm2', label: '선호작' }],
    'serial.retentionMetric': 'views',
    'lint.eraPresets': [{ label: '조선 중기', yearFrom: 1550, yearTo: 1700, region: '한반도' }, { label: '고려 말', yearFrom: 1300, yearTo: 1392, region: '한반도' }],
    'network.paragraphsPerScene': 6,
    'network.sameParagraphBonus': 0.5,
    'network.recentChapters': 3,
    'boss.pressure': { ...SETTING_DEFAULTS['boss.pressure'], gapThreshold: 1.5 },
    'text.josa': ['을', '를'],
    'text.sceneBreakSymbols': ['=', '#'],
    'text.quotatives': ['하고'],
  };
  for (const [k, v] of Object.entries(changed)) await setSetting(k as SettingKey, v);
}

beforeEach(wipe);

describe('9단계: 모든 모듈 데이터 왕복', () => {
  it('빠진 테이블이 없다 — 테이블이 새로 생기면 seedEverything에 데이터를 넣어 주세요', async () => {
    await seedEverything();
    const empty: string[] = [];
    for (const def of TABLE_DEFS) if ((await db.tableByName(def.name).count()) === 0) empty.push(def.name);
    expect(empty).toEqual([]);
    expect(Object.keys(SETTING_DEFAULTS).length).toBe(await db.settings.count());
  });

  it('전체 내보내기 → 삭제 → 교체로 불러오기 → 모든 테이블이 그대로', async () => {
    await seedEverything();
    const before = await dumpAll();
    const file = JSON.stringify(await exportData('all'));
    await wipe();
    const parsed = parseBackup(file);
    if (!parsed.ok) throw new Error(`${parsed.error}\n${parsed.details.join('\n')}`);
    await applyImport(parsed.envelope, 'replace');
    expect(await dumpAll()).toEqual(before);
  });

  it('전체 내보내기 → 삭제 → 합치기로 불러오기 → 모든 테이블이 그대로 (시드는 같음으로 잡힘)', async () => {
    await seedEverything();
    const before = await dumpAll();
    const file = JSON.stringify(await exportData('all'));
    await wipe();
    const parsed = parseBackup(file);
    if (!parsed.ok) throw new Error(parsed.error);
    const plan = await planImport(parsed.envelope);
    expect(plan.totals.conflicts).toBe(0);
    expect(plan.totals.add + plan.totals.unchanged).toBe(Object.values(before).reduce((n, rows) => n + rows.length, 0));
    await applyImport(parsed.envelope, 'merge');
    expect(await dumpAll()).toEqual(before);
  });

  it('두 번 왕복해도 같다 (불러온 데이터를 다시 내보낸 파일 = 처음 파일의 데이터)', async () => {
    await seedEverything();
    const first = await exportData('all');
    await wipe();
    const p1 = parseBackup(JSON.stringify(first));
    if (!p1.ok) throw new Error(p1.error);
    await applyImport(p1.envelope, 'replace');
    const second = await exportData('all');
    expect(second.data).toEqual(first.data);
  });

  it('작품 하나 범위 왕복은 그 작품의 모든 모듈 데이터를 담는다', async () => {
    await seedEverything();
    const env = await exportData('work', { workId: 'w1' });
    const counts = Object.fromEntries(Object.entries(env.data).map(([k, v]) => [k, v.length]));
    expect(counts).toEqual({ works: 1, characters: 2, chapters: 2, readerSnapshots: 1, hypotheses: 1, glossary: 1, lintResolutions: 1, networkEdits: 2, bosses: 1 });
    const before = await dumpAll();
    await db.chapters.delete('ch2');
    const parsed = parseBackup(JSON.stringify(env));
    if (!parsed.ok) throw new Error(parsed.error);
    await applyImport(parsed.envelope, 'replace');
    expect(await dumpAll()).toEqual(before);
  });
});
