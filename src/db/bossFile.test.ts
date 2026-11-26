import { describe, expect, it } from 'vitest';
import { newBossDefaults, newPattern, newPhase } from '../core/boss';
import { buildBossFile, parseBossFile } from './bossFile';
import type { Boss } from './types';

const T = '2026-11-26T00:00:00.000Z';
const boss: Boss = {
  id: 'b1', workId: 'w-other', name: '평온의 궁수', characterId: 'c-other', ...newBossDefaults(),
  phases: [{ ...newPhase('ph1', 0), patterns: [newPattern('p1', 'projectile', '활 탄막')], sequence: [{ patternId: 'p1', weight: 1 }] }],
  createdAt: T, updatedAt: T,
};
const target = { workId: 'w-mine', characterIds: ['c-mine'], existingNames: [] as string[], newId: () => 'new-id' };

describe('보스 하나 JSON', () => {
  it('내보낸 파일을 이 작품의 새 보스로 불러온다 (새 id, 다른 작품의 보스 주인은 뺌)', () => {
    const r = parseBossFile(JSON.stringify(buildBossFile(boss)), target);
    if (!r.ok) throw new Error(r.error);
    expect(r.boss).toMatchObject({ id: 'new-id', workId: 'w-mine', name: '평온의 궁수' });
    expect(r.boss.characterId).toBeUndefined();
    expect(r.boss.phases[0].patterns[0].name).toBe('활 탄막');
  });

  it('같은 캐릭터가 있으면 보스 주인을 남기고, 이름이 겹치면 (불러옴)을 붙인다', () => {
    const r = parseBossFile(JSON.stringify(buildBossFile(boss)), { ...target, characterIds: ['c-other'], existingNames: ['평온의 궁수'] });
    if (!r.ok) throw new Error(r.error);
    expect(r.boss.characterId).toBe('c-other');
    expect(r.boss.name).toBe('평온의 궁수 (불러옴)');
  });

  it('다른 파일·더 새 버전·깨진 내용은 거부한다', () => {
    expect(parseBossFile('{', target).ok).toBe(false);
    expect(parseBossFile(JSON.stringify({ app: 'creative-workbench', scope: 'all' }), target).ok).toBe(false);
    expect(parseBossFile(JSON.stringify({ ...buildBossFile(boss), schemaVersion: 999 }), target).ok).toBe(false);
    const broken = buildBossFile({ ...boss, arena: { width: -1, height: 400 } });
    expect(parseBossFile(JSON.stringify(broken), target).ok).toBe(false);
  });
});
