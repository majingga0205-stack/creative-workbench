import { describe, expect, it } from 'vitest';
import {
  compareMetrics,
  computeRetention,
  computeRhythm,
  countChars,
  daysBetween,
  diffSentences,
  effectiveStatus,
  estimateEnding,
  evaluateHypothesis,
  matchesCondition,
  movingAverage,
  median,
  paragraphHistogram,
  pickValues,
  stdev,
  summarizeRhythm,
  type ChapterRow,
  type HypothesisLike,
} from './index';

describe('통계 도구', () => {
  it('중앙값·표준편차·이동 평균', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
    // 5칸 가운데 맞춤, 양 끝은 있는 값만
    expect(movingAverage([1, 2, 3, 4, 5], 5)).toEqual([2, 2.5, 3, 3.5, 4]);
    expect(movingAverage([10], 5)).toEqual([10]);
  });
});

describe('computeRhythm — 리듬 지표', () => {
  const text = '“가자.” 그가 말했다.\n\n바람이 불었다. 아주 오래도록 멈추지 않을 것처럼 거세게 불어왔다!\n“정말?”';
  const m = computeRhythm(text);

  it('글자 수: 공백 포함(줄바꿈 제외)·공백 제외', () => {
    expect(countChars('가 나\n다')).toEqual({ withSpaces: 4, withoutSpaces: 3 });
    expect(countChars('가 나 다')).toEqual({ withSpaces: 5, withoutSpaces: 3 });
    expect(m.chars.withoutSpaces).toBe([...text.replace(/\s/g, '')].length);
  });

  it('문장 길이 파형: 문장마다 공백 제외 글자 수', () => {
    expect(m.sentences.map((s) => s.text)).toEqual([
      '“가자.”',
      '그가 말했다.',
      '바람이 불었다.',
      '아주 오래도록 멈추지 않을 것처럼 거세게 불어왔다!',
      '“정말?”',
    ]);
    expect(m.wave.lengths).toEqual([5, 6, 7, 22, 5]);
    expect(m.wave.movingAverage).toHaveLength(5);
    expect(m.sentences.map((s) => s.isDialogue)).toEqual([true, false, false, false, true]);
  });

  it('문장 길이 통계와 짧은·긴 문장 비율 (기준값 설정 가능)', () => {
    expect(m.sentenceStats.count).toBe(5);
    expect(m.sentenceStats.mean).toBe(9);
    expect(m.sentenceStats.median).toBe(6);
    expect(m.sentenceStats.shortRatio).toBe(4 / 5); // 15자 이하
    expect(m.sentenceStats.longRatio).toBe(0); // 60자 이상
    const m2 = computeRhythm(text, { thresholds: { longSentence: 20, shortSentence: 5 } });
    expect(m2.sentenceStats.longRatio).toBe(1 / 5);
    expect(m2.sentenceStats.shortRatio).toBe(2 / 5);
  });

  it('대사 비율: 글자 기준과 문장 기준', () => {
    expect(m.dialogue.dialogueChars).toBe(10);
    expect(m.dialogue.charRatio).toBeCloseTo(10 / 45);
    expect(m.dialogue.sentenceRatio).toBe(2 / 5);
  });

  it('문장부호로 끝나는 문장 비율', () => {
    expect(m.punctuation.exclaimRatio).toBe(1 / 5);
    expect(m.punctuation.questionRatio).toBe(1 / 5);
    expect(computeRhythm('그게… 아니. 정말...').punctuation.ellipsisRatio).toBe(2 / 3);
  });

  it('문단 길이와 벽 문단 위치 (원문 위치)', () => {
    const wall = '가'.repeat(201);
    const t = `짧은 문단.\n${wall}\n또 짧은 문단.`;
    const r = computeRhythm(t);
    expect(r.paragraphs.count).toBe(3);
    expect(r.paragraphs.walls).toHaveLength(1);
    const w = r.paragraphs.walls[0];
    expect(t.slice(w.start, w.end)).toBe(wall);
    expect(computeRhythm(t, { thresholds: { wallParagraph: 300 } }).paragraphs.walls).toHaveLength(0);
  });

  it('문단 모드: line / blank', () => {
    const t = '첫 줄.\n둘째 줄.\n\n셋째.';
    expect(computeRhythm(t).paragraphs.count).toBe(3);
    expect(computeRhythm(t, { paragraphMode: 'blank' }).paragraphs.count).toBe(2);
  });

  it('문단 길이 히스토그램: 벽 기준을 4칸 + 넘는 칸', () => {
    const bins = paragraphHistogram([10, 50, 51, 200, 201, 500], 200);
    expect(bins.map((b) => b.label)).toEqual(['1–50', '51–100', '101–150', '151–200', '201+']);
    expect(bins.map((b) => b.count)).toEqual([2, 1, 0, 1, 2]);
  });

  it('빈 원고도 NaN 없이 0', () => {
    const e = computeRhythm('');
    expect(Object.values(summarizeRhythm(e)).every((v) => v === 0)).toBe(true);
  });
});

describe('estimateEnding — 마지막 문단 유형', () => {
  const long = '그날 밤 그는 오래도록 잠들지 못했고, 창밖으로 보이는 마을의 불빛이 하나둘 꺼지는 것을 끝까지 지켜보았다. 내일이면 모든 것이 달라질 것이라는 생각이 그를 놓아주지 않았고 새벽이 올 때까지 그 생각은 이어졌다.';

  it('절단: 마지막 문장이 대사', () => {
    const e = estimateEnding('그가 돌아섰다.\n“거기 서.”')!;
    expect(e.tag).toBe('절단');
    expect(e.reasons.join()).toContain('대사');
  });

  it('절단: ? ! … — 로 끝나거나 20자 이하', () => {
    expect(estimateEnding(`${long}\n그때, 문이 열렸다…`)!.tag).toBe('절단');
    expect(estimateEnding(`${long}\n그리고 그는—`)!.reasons.join()).toContain('—');
    const short = estimateEnding(`${long}\n문이 열렸다.`)!;
    expect(short.tag).toBe('절단');
    expect(short.reasons.join()).toContain('20자 이하');
  });

  it('정리: 마지막 문단이 서술이고 80자 이상', () => {
    const e = estimateEnding(`“가자.”\n${long}`)!;
    expect(e.tag).toBe('정리');
    expect(e.lastParagraph.isNarration).toBe(true);
    expect(e.lastParagraph.length).toBeGreaterThanOrEqual(80);
  });

  it('여운: 그 밖', () => {
    const e = estimateEnding('그는 아무 말 없이 창밖의 불빛을 오래도록 바라보았다.')!;
    expect(e.tag).toBe('여운');
  });

  it('기준값을 바꿀 수 있다', () => {
    expect(estimateEnding(`${long}\n문이 열렸다.`, { thresholds: { cutMaxLength: 3 } })!.tag).toBe('여운');
  });

  it('근거의 위치는 원문 기준', () => {
    const t = `첫 문단.\n${long}`;
    const e = estimateEnding(t)!;
    expect(t.slice(e.lastParagraph.start, e.lastParagraph.end)).toBe(long);
  });

  it('빈 원고는 null', () => {
    expect(estimateEnding('')).toBeNull();
  });
});

describe('독자 지표 — 스냅샷 고르기와 연독률', () => {
  const chapters = [1, 2, 3, 4, 5, 6].map((n) => ({ id: `c${n}`, number: n }));
  const snap = (n: number, day: number, views: number, recordedAt = '2026-11-01') => ({
    chapterId: `c${n}`,
    daysAfter: day,
    recordedAt,
    values: { views },
  });

  it('기준 일수와 같은 스냅샷을 쓰고, 없으면 가장 가까운 것 (기준 다름 표시)', () => {
    const picked = pickValues(chapters.slice(0, 2), [snap(1, 1, 50), snap(1, 3, 100), snap(2, 5, 80), snap(2, 2, 70)], 'views', 3);
    expect(picked[0]).toMatchObject({ value: 100, daysAfter: 3, exactDay: true });
    // 2화: 2일차와 5일차 중 3일차에 더 가까운 2일차
    expect(picked[1]).toMatchObject({ value: 70, daysAfter: 2, exactDay: false });
  });

  it('같은 일수 스냅샷이 여럿이면 가장 늦게 기록한 것', () => {
    const p = pickValues(chapters.slice(0, 1), [snap(1, 3, 100, '2026-11-01'), snap(1, 3, 120, '2026-11-02')], 'views', 3);
    expect(p[0].value).toBe(120);
  });

  it('연독률: 1화 대비·직전 대비, 꺾이는 구간 (중앙값보다 10%p 이상 낮음)', () => {
    const views = [1000, 900, 810, 729, 400, 380];
    const picked = pickValues(chapters, views.map((v, i) => snap(i + 1, 3, v)), 'views', 3);
    const r = computeRetention(picked, 10);
    expect(r.rows[0].fromFirst).toBe(1);
    expect(r.rows[1].fromPrev).toBeCloseTo(0.9);
    expect(r.rows[5].fromFirst).toBeCloseTo(0.38);
    // 직전 대비: 0.9, 0.9, 0.9, 0.549, 0.95 → 중앙값 0.9, 기준 0.8
    expect(r.medianFromPrev).toBeCloseTo(0.9);
    expect(r.rows.map((x) => x.isBreak)).toEqual([false, false, false, false, true, false]);
    expect(r.valuedCount).toBe(6);
  });

  it('값이 빠진 회차는 연독률을 건너뛴다', () => {
    const picked = pickValues(chapters.slice(0, 3), [snap(1, 3, 100), snap(3, 3, 50)], 'views', 3);
    const r = computeRetention(picked, 10);
    expect(r.rows[1].fromPrev).toBeUndefined();
    expect(r.rows[2].fromPrev).toBeUndefined(); // 직전(2화)이 비었음
    expect(r.rows[2].fromFirst).toBe(0.5);
  });

  it('게시 후 일수 계산', () => {
    expect(daysBetween('2026-11-01', '2026-11-04')).toBe(3);
    expect(daysBetween('2026-11-01', '2026-11-01')).toBe(0);
    expect(daysBetween('', '2026-11-01')).toBeUndefined();
  });
});

describe('가설', () => {
  const rows: ChapterRow[] = [
    { number: 1, endingTag: '절단', dialogueRatio: 0.6, length: 4000, metrics: { views: 1000 } },
    { number: 2, endingTag: '여운', dialogueRatio: 0.3, length: 5000, metrics: { views: 950 } },
    { number: 3, endingTag: '절단', dialogueRatio: 0.55, length: 4200, metrics: { views: 900 } },
    { number: 4, endingTag: '정리', dialogueRatio: 0.2, length: 6000, metrics: { views: 880 } },
    { number: 5, endingTag: '절단', dialogueRatio: 0.5, length: 4100, metrics: {} },
  ];
  const h: HypothesisLike = {
    condition: { field: 'endingTag', op: '=', value: '절단' },
    metric: 'views',
    target: 'next',
    checkAfterChapter: 6,
    status: '대기',
  };

  it('조건 판정', () => {
    expect(matchesCondition(rows[0], { field: 'endingTag', op: '=', value: '절단' })).toBe(true);
    expect(matchesCondition(rows[0], { field: 'dialogueRatio', op: '>', value: 50 })).toBe(true);
    expect(matchesCondition(rows[1], { field: 'dialogueRatio', op: '>', value: 50 })).toBe(false);
    expect(matchesCondition(rows[3], { field: 'length', op: '>', value: 5000 })).toBe(true);
    expect(matchesCondition(rows[2], { field: 'custom', op: '=', value: '3, 5' })).toBe(true);
    expect(matchesCondition(rows[1], { field: 'custom', op: '=', value: '3, 5' })).toBe(false);
  });

  it("엔딩 가설은 '다음 화' 지표로 집단을 비교한다", () => {
    const r = evaluateHypothesis(h, rows, 5);
    // 절단: 1화→2화 950, 3화→4화 880 (5화는 다음 화가 없음) / 나머지: 2화→3화 900, 4화→5화 값 없음
    expect(r.inGroup).toMatchObject({ n: 2, mean: 915, numbers: [1, 3] });
    expect(r.outGroup).toMatchObject({ n: 1, mean: 900, numbers: [2] });
    expect(r.lowSample).toBe(true);
  });

  it("'같은 화' 지표", () => {
    const r = evaluateHypothesis({ ...h, target: 'same' }, rows, 2);
    expect(r.inGroup.n).toBe(2); // 1화, 3화 (5화는 값 없음)
    expect(r.outGroup.n).toBe(2);
    expect(r.lowSample).toBe(false);
  });

  it("확인 회차에 지표가 들어오면 '확인할 때 됨'", () => {
    expect(effectiveStatus(h, rows)).toBe('대기');
    expect(effectiveStatus({ ...h, checkAfterChapter: 4 }, rows)).toBe('확인할 때 됨');
    expect(effectiveStatus({ ...h, checkAfterChapter: 4, status: '지지됨' }, rows)).toBe('지지됨');
  });
});

describe('버전 비교', () => {
  const a = '그가 왔다. 문이 열렸다. 바람이 불었다.';
  const b = '그가 왔다. 문이 천천히 열렸다. 바람이 불었다. 새가 울었다.';

  it('문장 단위 차이: 같음·변경·추가', () => {
    const ops = diffSentences(a, b);
    expect(ops.map((o) => o.type)).toEqual(['same', 'changed', 'same', 'added']);
    const changed = ops[1];
    if (changed.type !== 'changed') throw new Error();
    expect(changed.a.text).toBe('문이 열렸다.');
    expect(changed.b.text).toBe('문이 천천히 열렸다.');
    expect(b.slice(changed.b.start, changed.b.end)).toBe(changed.b.text);
  });

  it('삭제', () => {
    expect(diffSentences(b, a).map((o) => o.type)).toEqual(['same', 'changed', 'same', 'removed']);
  });

  it('지표 차이 표', () => {
    const rows = compareMetrics(computeRhythm(a), computeRhythm(b));
    const sc = rows.find((r) => r.key === 'sentenceCount')!;
    expect(sc).toMatchObject({ a: 3, b: 4, delta: 1 });
  });
});
