// 원고 버전 비교 (SPEC 모듈 C '원고 버전 비교')
import { diffArrays } from 'diff';
import { splitSentences, type Sentence, type SentenceOptions } from '../korean';
import { METRIC_DEFS, type MetricKind } from './metrics';
import type { RhythmMetrics } from './types';

export type MetricDiffRow = { key: string; label: string; kind: MetricKind; a: number; b: number; delta: number };

/** 두 원고(버전·회차)의 지표 차이 표 */
export function compareMetrics(a: RhythmMetrics, b: RhythmMetrics): MetricDiffRow[] {
  return METRIC_DEFS.map((d) => {
    const va = d.get(a);
    const vb = d.get(b);
    return { key: d.key, label: d.label, kind: d.kind, a: va, b: vb, delta: vb - va };
  });
}

export type SentenceDiffOp =
  | { type: 'same'; a: Sentence; b: Sentence }
  | { type: 'removed'; a: Sentence }
  | { type: 'added'; b: Sentence }
  | { type: 'changed'; a: Sentence; b: Sentence };

/**
 * 문장 단위 본문 차이. 같은 문장(앞뒤 공백 무시)은 'same',
 * 연달아 지워지고 더해진 문장은 순서대로 짝지어 'changed', 남는 것은 'removed'/'added'.
 * 위치(start/end)는 각 원고 기준이다.
 */
export function diffSentences(aText: string, bText: string, options: SentenceOptions = {}): SentenceDiffOp[] {
  const as = splitSentences(aText, options);
  const bs = splitSentences(bText, options);
  const parts = diffArrays(
    as.map((s) => s.text),
    bs.map((s) => s.text),
  );
  const ops: SentenceDiffOp[] = [];
  let ia = 0;
  let ib = 0;
  let removed: Sentence[] = [];
  let added: Sentence[] = [];
  const flush = () => {
    const pairs = Math.min(removed.length, added.length);
    for (let k = 0; k < pairs; k++) ops.push({ type: 'changed', a: removed[k], b: added[k] });
    for (const a of removed.slice(pairs)) ops.push({ type: 'removed', a });
    for (const b of added.slice(pairs)) ops.push({ type: 'added', b });
    removed = [];
    added = [];
  };
  for (const part of parts) {
    const count = part.value.length;
    if (part.removed) {
      removed.push(...as.slice(ia, ia + count));
      ia += count;
    } else if (part.added) {
      added.push(...bs.slice(ib, ib + count));
      ib += count;
    } else {
      flush();
      for (let k = 0; k < count; k++) ops.push({ type: 'same', a: as[ia + k], b: bs[ib + k] });
      ia += count;
      ib += count;
    }
  }
  flush();
  return ops;
}
