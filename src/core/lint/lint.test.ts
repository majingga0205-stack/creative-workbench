import { describe, expect, it } from 'vitest';
import { LINT_SEED } from '../../seed/lintSeed';
import type { GlossaryEntry, LintEntry, LintResolution } from '../../db/types';
import {
  applyResolutions,
  buildReportHtml,
  buildReportMarkdown,
  eraSenseIndex,
  formatAppears,
  highlightSpans,
  judgeNotYet,
  lintText,
  regionApplies,
  reportRows,
  validateLintEntry,
  type Era,
} from './index';

const era = (yearFrom: number, yearTo: number, region = '한반도'): Era => ({ yearFrom, yearTo, region });
const seed = (id: string) => LINT_SEED.find((e) => e.id === id)!;
const T = '2026-11-25T00:00:00.000Z';

describe('시드 데이터', () => {
  it('SPEC 표의 5개만, 전부 미검증, 저장 조건을 만족한다', () => {
    expect(LINT_SEED.map((e) => e.term)).toEqual(['감자', '고구마', '고추', '담배', '경제']);
    expect(LINT_SEED.every((e) => e.verified === false)).toBe(true);
    for (const e of LINT_SEED) expect(validateLintEntry(e)).toEqual([]);
  });

  it("시기 규칙: '세기 초 = 01~20년, 전반 = 01~50년'", () => {
    expect(seed('seed-potato').appears).toMatchObject({ from: 1801, to: 1850 });
    expect(seed('seed-chili').appears).toMatchObject({ from: 1601, to: 1620 });
    expect(seed('seed-tobacco').appears).toMatchObject({ from: 1601, to: 1620 });
    expect(seed('seed-sweet-potato').appears).toMatchObject({ from: 1763, to: 1764 });
  });
});

describe('시대 판정 (not_yet)', () => {
  it("설정 1500~1550년에서 '감자'는 빨강, 1800~1850년에서는 노랑", () => {
    const text = '그는 감자를 캐다 말고 하늘을 보았다.';
    const red = lintText(text, LINT_SEED, era(1500, 1550));
    expect(red).toHaveLength(1);
    expect(red[0]).toMatchObject({ color: 'red', reason: '없던 것', text: '감자', start: 3, end: 5, disputed: true, unverified: true });
    expect(lintText(text, LINT_SEED, era(1800, 1850))[0]).toMatchObject({ color: 'yellow', reason: '경계' });
  });

  it('설정 시작이 등장 끝 이후면 표시하지 않는다', () => {
    expect(lintText('감자를 캤다.', LINT_SEED, era(1850, 1900))).toEqual([]);
    expect(judgeNotYet({ from: 1801, to: 1850, precision: '시기' }, era(1851, 1900))).toBeNull();
    expect(judgeNotYet({ from: 1801, to: 1850, precision: '시기' }, era(1700, 1801))).toBe('yellow');
  });

  it('조선 중기(1550~1700) 기본 프리셋으로 시드를 판정하면', () => {
    const text = '고추와 담배, 감자, 고구마를 실었다.';
    const f = lintText(text, LINT_SEED, era(1550, 1700));
    expect(f.map((x) => [x.text, x.color])).toEqual([
      ['고추', 'yellow'],
      ['담배', 'yellow'],
      ['감자', 'red'],
      ['고구마', 'red'],
    ]);
  });

  it("지역이 같거나 '전체'일 때만 적용", () => {
    expect(regionApplies({ region: '한반도' }, era(1500, 1550, '중국'))).toBe(false);
    expect(regionApplies({ region: '전체' }, era(1500, 1550, '중국'))).toBe(true);
    expect(regionApplies({ region: '한반도' }, era(1500, 1550, ''))).toBe(true);
    expect(lintText('감자', LINT_SEED, era(1500, 1550, '서양'))).toEqual([]);
  });

  it('시대 설정이 없거나 시대 판정을 끄면 아무것도 지적하지 않는다', () => {
    expect(lintText('감자', LINT_SEED, null)).toEqual([]);
    expect(lintText('감자', LINT_SEED, era(1500, 1550), [], { era: false })).toEqual([]);
  });
});

describe('뜻 변화 (meaning_shift)', () => {
  it("'경제'는 파랑이고, 앞뒤 30자에 '시장'이 있으면 노랑", () => {
    const blue = lintText('그는 경제를 논하며 백성을 걱정했다.', LINT_SEED, era(1550, 1700));
    expect(blue[0]).toMatchObject({ color: 'blue', reason: '뜻 확인', sense: '조선: 세상을 다스리고 백성을 구제함' });
    const y = lintText('시장이 얼어붙자 경제가 흔들렸다.', LINT_SEED, era(1550, 1700));
    expect(y[0]).toMatchObject({ color: 'yellow', reason: '현대 뜻으로 쓴 듯함', contextWord: '시장' });
  });

  it('문맥어가 30자 밖이면 파랑 그대로', () => {
    const far = `시장${'가'.repeat(31)} 경제를 논했다.`;
    expect(lintText(far, LINT_SEED, era(1550, 1700))[0].color).toBe('blue');
  });

  it("예외 '경제육전'은 지적하지 않는다", () => {
    expect(lintText('『경제육전』을 펼쳤다.', LINT_SEED, era(1550, 1700))).toEqual([]);
  });

  it('연도가 적힌 뜻이 있으면 그 시대의 뜻을 고른다', () => {
    const e = { senses: [{ label: '옛 뜻', to: 1880, contextWords: [] }, { label: '새 뜻', from: 1881, contextWords: [] }] };
    expect(eraSenseIndex(e, era(1550, 1700))).toBe(0);
    expect(eraSenseIndex(e, era(1900, 1950))).toBe(1);
  });
});

describe('SF 세계관 용어집', () => {
  const glossary: GlossaryEntry[] = [
    { id: 'g1', workId: 'w', canonical: '스마트폰', variants: ['휴대폰'], status: '금지', replacement: '통신석', updatedAt: T },
    { id: 'g2', workId: 'w', canonical: '나노테크 팔찌', variants: ['나노 팔찌'], status: '사용', updatedAt: T },
  ];

  it('금지어는 빨강 + 대체어, 표기 흔들림은 노랑 + 정식 표기', () => {
    const f = lintText('그는 휴대폰 대신 나노 팔찌를 켰다. 나노테크 팔찌는 빛났다.', [], null, glossary, { glossary: true });
    expect(f.map((x) => [x.text, x.color, x.reason, x.suggestion])).toEqual([
      ['휴대폰', 'red', '금지어', '통신석'],
      ['나노 팔찌', 'yellow', '표기 흔들림', '나노테크 팔찌'],
    ]);
  });

  it('시대 판정과 따로 켜고 끈다', () => {
    expect(lintText('스마트폰', [], null, glossary)).toEqual([]);
    const both = lintText('감자와 스마트폰', LINT_SEED, era(1500, 1550), glossary, { glossary: true });
    expect(both.map((x) => x.source)).toEqual(['era', 'glossary']);
    expect(lintText('감자와 스마트폰', LINT_SEED, era(1500, 1550), glossary, { glossary: true, era: false })).toHaveLength(1);
  });
});

describe('처리 상태', () => {
  const text = '감자를 캤다. 다시 감자를 캤다.';
  const findings = lintText(text, LINT_SEED, era(1500, 1550));
  const res = (r: Partial<LintResolution>): LintResolution => ({
    id: 'r', workId: 'w', ruleKey: 'era:seed-potato', status: '무시', scope: 'work', createdAt: T, updatedAt: T, ...r,
  });

  it('처리 기록이 없으면 미처리', () => {
    expect(applyResolutions(findings, []).map((f) => f.status)).toEqual(['미처리', '미처리']);
  });

  it('이 위치만: 앞뒤 글자가 같은 자리에만 적용', () => {
    const r = res({ status: '의도함', scope: 'position', chapterId: 'c1', context: findings[1].context });
    expect(applyResolutions(findings, [r], 'c1').map((f) => f.status)).toEqual(['미처리', '의도함']);
    expect(applyResolutions(findings, [r], 'c2').map((f) => f.status)).toEqual(['미처리', '미처리']);
  });

  it('이 회차 / 작품 전체', () => {
    expect(applyResolutions(findings, [res({ scope: 'chapter', chapterId: 'c1' })], 'c1').map((f) => f.status)).toEqual(['무시', '무시']);
    expect(applyResolutions(findings, [res({ scope: 'chapter', chapterId: 'c1' })], 'c2').map((f) => f.status)).toEqual(['미처리', '미처리']);
    expect(applyResolutions(findings, [res({ scope: 'work' })], 'c9').map((f) => f.status)).toEqual(['무시', '무시']);
  });

  it('좁은 범위가 앞선다', () => {
    const rs = [res({ scope: 'work', status: '무시' }), res({ id: 'p', scope: 'position', chapterId: 'c1', status: '의도함', context: findings[0].context })];
    expect(applyResolutions(findings, rs, 'c1').map((f) => f.status)).toEqual(['의도함', '무시']);
  });

  it('멀리 떨어진 곳을 고쳐 위치가 바뀌어도 앞뒤 10자가 같으면 이어지고, 바로 옆을 고치면 미처리로 돌아간다', () => {
    const body = '첫 문장은 충분히 길게 써 둔다. 그는 감자를 캤다.';
    const before = lintText(body, LINT_SEED, era(1500, 1550));
    const r = res({ status: '의도함', scope: 'position', chapterId: 'c1', context: before[0].context });
    const far = lintText(`새 문장을 맨 앞에 더했다.\n${body}`, LINT_SEED, era(1500, 1550));
    expect(far[0].start).not.toBe(before[0].start);
    expect(applyResolutions(far, [r], 'c1')[0].status).toBe('의도함');
    const near = lintText(body.replace('그는 감자를', '그녀는 감자를'), LINT_SEED, era(1500, 1550));
    expect(applyResolutions(near, [r], 'c1')[0].status).toBe('미처리');
  });
});

describe('보조 함수', () => {
  it('하이라이트는 겹치지 않게 고른다 (빨강 우선)', () => {
    const spans = highlightSpans([
      { start: 0, end: 3, color: 'blue' as const },
      { start: 1, end: 2, color: 'red' as const },
      { start: 5, end: 7, color: 'yellow' as const },
    ]);
    expect(spans.map((s) => [s.start, s.color])).toEqual([
      [1, 'red'],
      [5, 'yellow'],
    ]);
  });

  it('저장 조건: 출처 1개 이상, not_yet은 시기, meaning_shift는 뜻 2개 이상', () => {
    const base = { ...seed('seed-potato'), sources: [] } as LintEntry;
    expect(validateLintEntry(base)).toContain('출처를 1개 이상 적어 주세요');
    expect(validateLintEntry({ ...seed('seed-potato'), appears: undefined })).toContain('등장 시기를 적어 주세요');
    expect(validateLintEntry({ ...seed('seed-potato'), appears: { from: 1900, to: 1800, precision: '연도' } })).toHaveLength(1);
    expect(validateLintEntry({ ...seed('seed-economy'), senses: [{ label: '하나', contextWords: [] }] })).toContain('뜻을 2개 이상 적어 주세요');
    expect(formatAppears(seed('seed-sweet-potato').appears)).toBe('1763~1764년 (연도)');
  });
});

describe('리포트', () => {
  const text = '시장이 얼어붙자 경제가 흔들렸다. 그는 감자를 캤다.';
  const findings = applyResolutions(lintText(text, LINT_SEED, era(1500, 1550)), []);
  const input = {
    workTitle: '귀향',
    eraLabel: '조선 중기 (1500~1550, 한반도)',
    checkedAt: new Date(2026, 10, 25),
    chapters: [{ label: '1화 돌아온 길', text, findings }],
    entries: LINT_SEED,
    glossary: [],
  };

  it('줄마다 [회차 · 앞뒤 20자 발췌 · 항목 · 시기 · 근거 · 검증 여부 · 처리 상태]', () => {
    const rows = reportRows(input);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ chapter: '1화 돌아온 길', match: '감자', item: '감자', period: '1801~1850년 (시기)', verified: '미검증 · 이설 있음', status: '미처리' });
    expect(rows[1].before.length).toBeLessThanOrEqual(20);
    expect(rows[1].basis).toContain('오주연문장전산고');
  });

  it('Markdown: 머리 정보와 색별 개수', () => {
    const md = buildReportMarkdown(input);
    expect(md).toContain('# 시대 고증 검사 리포트 — 귀향');
    expect(md).toContain('검사일: 2026-11-25');
    expect(md).toContain('빨강 1 · 노랑 1 · 파랑 0');
    expect(md).toContain('**감자**');
  });

  it('HTML: 글자를 이스케이프하고 A4 가로 인쇄 설정', () => {
    const html = buildReportHtml({ ...input, workTitle: '<귀향>' });
    expect(html).toContain('&lt;귀향&gt;');
    expect(html).toContain('size: A4 landscape');
    expect(html).not.toMatch(/https?:\/\//);
  });
});
