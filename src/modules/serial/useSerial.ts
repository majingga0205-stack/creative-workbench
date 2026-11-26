// 연재 실험실 화면에서 함께 쓰는 데이터 훅
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { readSetting } from '../../db/meta';
import { textRulesOf } from '../../shared/useTextRules';
import type { Chapter, ChapterVersion, ReaderSnapshot } from '../../db/types';
import { computeRhythm, pickValues, type ChapterRow, type RhythmMetrics, type RhythmOptions } from '../../core/rhythm';

export function useSerialSettings() {
  const rows = useLiveQuery(() => db.settings.toArray(), []);
  return useMemo(() => {
    if (!rows) return undefined;
    const thresholds = readSetting(rows, 'serial.thresholds');
    const paragraphMode = readSetting(rows, 'serial.paragraphMode');
    const readerMetrics = readSetting(rows, 'serial.readerMetrics');
    const retentionMetric = readSetting(rows, 'serial.retentionMetric');
    const text = textRulesOf(rows);
    const rhythmOptions: RhythmOptions = { thresholds, paragraphMode, sceneBreakSymbols: text.sceneBreakSymbols, quotatives: text.quotatives };
    return { thresholds, paragraphMode, readerMetrics, retentionMetric, rhythmOptions };
  }, [rows]);
}

export type SerialSettings = NonNullable<ReturnType<typeof useSerialSettings>>;

/** 작품의 회차 (번호 순) */
export function useChapters(workId: string | undefined) {
  return useLiveQuery(
    () => (workId ? db.chapters.where('[workId+number]').between([workId, -Infinity], [workId, Infinity]).toArray() : []),
    [workId],
  );
}

export const activeVersion = (ch: Chapter): ChapterVersion =>
  ch.versions.find((v) => v.id === ch.activeVersionId) ?? ch.versions[0];

/** 원고 계산 결과를 글이 바뀔 때만 다시 계산 */
const cache = new Map<string, { text: string; key: string; m: RhythmMetrics }>();
export function rhythmOf(versionId: string, text: string, options: RhythmOptions): RhythmMetrics {
  const key = JSON.stringify(options);
  const hit = cache.get(versionId);
  if (hit && hit.text === text && hit.key === key) return hit.m;
  const m = computeRhythm(text, options);
  cache.set(versionId, { text, key, m });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return m;
}

export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;
export const num = (x: number, digits = 1) => (Number.isInteger(x) ? x.toLocaleString('ko-KR') : x.toFixed(digits));
export const chapterLabel = (c: Pick<Chapter, 'number' | 'title'>) => `${c.number}화${c.title ? ` ${c.title}` : ''}`;

// ── 독자 지표 · 가설용 ──

export function useSnapshots(workId: string | undefined) {
  return useLiveQuery(() => (workId ? db.readerSnapshots.where('workId').equals(workId).toArray() : []), [workId]);
}

export function useHypotheses(workId: string | undefined) {
  return useLiveQuery(
    async () => (workId ? (await db.hypotheses.where('workId').equals(workId).toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : []),
    [workId],
  );
}

/** 가설 비교용 회차 요약: 현재 버전의 원고 지표 + 기준 일수의 독자 지표 */
export function buildChapterRows(chapters: Chapter[], snapshots: ReaderSnapshot[], settings: SerialSettings): ChapterRow[] {
  const picked = Object.fromEntries(
    settings.readerMetrics.map((m) => [m.key, pickValues(chapters, snapshots, m.key, settings.thresholds.compareDay)]),
  );
  return chapters.map((c) => {
    const v = activeVersion(c);
    const r = rhythmOf(v.id, v.text, settings.rhythmOptions);
    const metrics: Record<string, number | undefined> = {};
    for (const m of settings.readerMetrics) metrics[m.key] = picked[m.key].find((p) => p.chapterId === c.id)?.value;
    return { number: c.number, endingTag: c.endingTag, dialogueRatio: r.dialogue.charRatio, length: r.chars.withoutSpaces, metrics };
  });
}
