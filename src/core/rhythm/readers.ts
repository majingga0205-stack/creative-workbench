// 독자 지표와 연독률 (SPEC 모듈 C '독자 지표와 연독률')
import { median } from './stats';

export type ChapterRef = { id: string; number: number };

/** 스냅샷 하나: 어떤 회차를, 게시 후 며칠째에, 어떤 값으로 기록했나 */
export type SnapshotLike = {
  chapterId: string;
  daysAfter: number;
  recordedAt: string;
  values: Record<string, number | undefined>;
};

export type PickedValue = {
  chapterId: string;
  number: number;
  value?: number;
  daysAfter?: number;
  /** 기준 일수와 같은 스냅샷인가. false면 화면에 '기준 다름' */
  exactDay: boolean;
};

/**
 * 회차마다 비교에 쓸 값 하나를 고른다.
 * 기준 일수(targetDay)와 같은 스냅샷이 있으면 그것, 없으면 일수가 가장 가까운 것(같으면 더 이른 일수).
 * 같은 일수가 여럿이면 가장 늦게 기록한 것.
 */
export function pickValues(
  chapters: ChapterRef[],
  snapshots: SnapshotLike[],
  metric: string,
  targetDay: number,
): PickedValue[] {
  return [...chapters]
    .sort((a, b) => a.number - b.number)
    .map((ch) => {
      const cands = snapshots.filter((s) => s.chapterId === ch.id && typeof s.values[metric] === 'number');
      if (!cands.length) return { chapterId: ch.id, number: ch.number, exactDay: false };
      cands.sort(
        (a, b) =>
          Math.abs(a.daysAfter - targetDay) - Math.abs(b.daysAfter - targetDay) ||
          a.daysAfter - b.daysAfter ||
          b.recordedAt.localeCompare(a.recordedAt),
      );
      const best = cands[0];
      return {
        chapterId: ch.id,
        number: ch.number,
        value: best.values[metric],
        daysAfter: best.daysAfter,
        exactDay: best.daysAfter === targetDay,
      };
    });
}

export type RetentionRow = PickedValue & {
  /** 1화 대비 = 조회(n) ÷ 조회(첫 회차) */
  fromFirst?: number;
  /** 직전 대비 = 조회(n) ÷ 조회(바로 앞 회차) */
  fromPrev?: number;
  isBreak: boolean;
};

export type Retention = {
  rows: RetentionRow[];
  /** 직전 대비 연독률의 중앙값 */
  medianFromPrev?: number;
  /** 이 값보다 낮으면 꺾이는 구간 */
  breakBelow?: number;
  /** 값이 있는 회차 수 */
  valuedCount: number;
};

/** 연독률과 꺾이는 구간. picked는 회차 순서대로 (pickValues 결과). */
export function computeRetention(picked: PickedValue[], dropPoints: number): Retention {
  const first = picked[0]?.value;
  const rows: RetentionRow[] = picked.map((p, i) => {
    const prev = i > 0 ? picked[i - 1].value : undefined;
    const row: RetentionRow = { ...p, isBreak: false };
    if (p.value !== undefined && first) row.fromFirst = p.value / first;
    if (p.value !== undefined && prev) row.fromPrev = p.value / prev;
    return row;
  });
  const prevRatios = rows.map((r) => r.fromPrev).filter((x): x is number => x !== undefined);
  if (!prevRatios.length) return { rows, valuedCount: picked.filter((p) => p.value !== undefined).length };
  const med = median(prevRatios);
  const breakBelow = med - dropPoints / 100;
  for (const r of rows) r.isBreak = r.fromPrev !== undefined && r.fromPrev < breakBelow;
  return { rows, medianFromPrev: med, breakBelow, valuedCount: picked.filter((p) => p.value !== undefined).length };
}

/** 게시일과 기록일로 게시 후 일수 계산 (YYYY-MM-DD). 게시일 당일 = 0일차 */
export function daysBetween(publishedAt: string, recordedAt: string): number | undefined {
  const a = Date.parse(publishedAt.slice(0, 10));
  const b = Date.parse(recordedAt.slice(0, 10));
  if (Number.isNaN(a) || Number.isNaN(b)) return undefined;
  return Math.round((b - a) / 86_400_000);
}
