// 시대 고증 판정 (SPEC 모듈 A). 순수 함수만 있고 React·Dexie를 import하지 않는다.
import { findTerm, prepareText, type MatchOptions, type PreparedText } from '../korean';
import type { GlossaryEntry, LintEntry, LintResolution } from '../../db/types';

export type Era = { yearFrom: number; yearTo: number; region: string };

export type FindingColor = 'red' | 'yellow' | 'blue';
export type FindingReason = '없던 것' | '경계' | '뜻 확인' | '현대 뜻으로 쓴 듯함' | '금지어' | '표기 흔들림';
export type FindingStatus = '미처리' | '의도함' | '무시';

export type Finding = {
  /** 'era:<항목 id>' 또는 'glossary:<용어 id>' */
  ruleKey: string;
  source: 'era' | 'glossary';
  entryId: string;
  /** 원문 위치 */
  start: number;
  end: number;
  /** 원문에서 찾은 글자 */
  text: string;
  /** 어떤 표기로 찾았나 (표제어·별칭·변형 표기) */
  form: string;
  color: FindingColor;
  reason: FindingReason;
  /** 이설 있음 / 미검증 (고증 항목만) */
  disputed: boolean;
  unverified: boolean;
  /** 뜻 변화 항목: 설정 시대에 통하던 뜻 */
  sense?: string;
  /** 현대 뜻으로 쓴 듯할 때 걸린 문맥어 */
  contextWord?: string;
  /** 금지어의 대체어, 표기 흔들림의 정식 표기 */
  suggestion?: string;
  /** 처리 기록을 알아보는 발췌 (앞뒤 10자 + 매칭) */
  context: string;
};

export type LintOptions = MatchOptions & {
  /** 시대 판정 켜기 (기본 true) */
  era?: boolean;
  /** SF 세계관 용어집 판정 켜기 (기본 false) */
  glossary?: boolean;
  /** 뜻 변화 문맥어를 찾을 범위 (앞뒤 글자 수, 기본 30) */
  contextWindow?: number;
};

const COLOR_RANK: Record<FindingColor, number> = { red: 0, yellow: 1, blue: 2 };

/** 항목이 설정 지역에 적용되나: 같은 지역이거나 '전체'. 설정 지역이 비었으면 모두 적용 */
export function regionApplies(entry: Pick<LintEntry, 'region'>, era: Era): boolean {
  return !era.region.trim() || entry.region === '전체' || entry.region.trim() === era.region.trim();
}

/** not_yet 판정: 설정 시대 전체가 등장 이전 → 빨강, 겹침 → 노랑, 설정 시작이 등장 끝 이후 → 표시 안 함 */
export function judgeNotYet(appears: NonNullable<LintEntry['appears']>, era: Era): 'red' | 'yellow' | null {
  if (era.yearTo < appears.from) return 'red';
  if (era.yearFrom >= appears.to) return null;
  return 'yellow';
}

/** 뜻 변화 항목에서 설정 시대에 통하던 뜻의 번호. 연도가 적힌 뜻 중 시대와 겹치는 첫 뜻, 없으면 0 */
export function eraSenseIndex(entry: Pick<LintEntry, 'senses'>, era: Era): number {
  const senses = entry.senses ?? [];
  const k = senses.findIndex(
    (s) => (s.from !== undefined || s.to !== undefined) && (s.from ?? -Infinity) <= era.yearTo && (s.to ?? Infinity) >= era.yearFrom,
  );
  return k === -1 ? 0 : k;
}

const excerpt = (text: string, start: number, end: number, n: number) => text.slice(Math.max(0, start - n), Math.min(text.length, end + n));

/** 원고 하나를 검사한다. 결과는 위치 순서 (같은 위치면 빨강 → 노랑 → 파랑). */
export function lintText(
  text: string | PreparedText,
  entries: LintEntry[],
  era: Era | null,
  glossary: GlossaryEntry[] = [],
  options: LintOptions = {},
): Finding[] {
  const p = typeof text === 'string' ? prepareText(text) : text;
  const original = p.original;
  const win = options.contextWindow ?? 30;
  const out: Finding[] = [];
  const base = (ruleKey: string, source: Finding['source'], entryId: string, m: { start: number; end: number; text: string; form: string }) => ({
    ruleKey,
    source,
    entryId,
    start: m.start,
    end: m.end,
    text: m.text,
    form: m.form,
    context: excerpt(original, m.start, m.end, 10),
  });

  if (options.era !== false && era) {
    for (const e of entries) {
      if (!regionApplies(e, era)) continue;
      const q = { term: e.term, aliases: e.aliases, mode: e.matchMode, exclude: e.exclude };
      if (e.kind === 'not_yet') {
        if (!e.appears) continue;
        const color = judgeNotYet(e.appears, era);
        if (!color) continue;
        for (const m of findTerm(p, q, options)) {
          out.push({ ...base(`era:${e.id}`, 'era', e.id, m), color, reason: color === 'red' ? '없던 것' : '경계', disputed: e.disputed, unverified: !e.verified });
        }
      } else {
        const senses = e.senses ?? [];
        const k = eraSenseIndex(e, era);
        const otherWords = senses.flatMap((s, j) => (j === k ? [] : s.contextWords)).filter((w) => w.trim());
        for (const m of findTerm(p, q, options)) {
          const before = original.slice(Math.max(0, m.start - win), m.start);
          const after = original.slice(m.end, m.end + win);
          const hit = otherWords.find((w) => before.includes(w) || after.includes(w));
          out.push({
            ...base(`era:${e.id}`, 'era', e.id, m),
            color: hit ? 'yellow' : 'blue',
            reason: hit ? '현대 뜻으로 쓴 듯함' : '뜻 확인',
            disputed: e.disputed,
            unverified: !e.verified,
            sense: senses[k]?.label,
            contextWord: hit,
          });
        }
      }
    }
  }

  if (options.glossary) {
    for (const g of glossary) {
      if (g.status === '금지') {
        for (const m of findTerm(p, { term: g.canonical, aliases: g.variants }, options)) {
          out.push({ ...base(`glossary:${g.id}`, 'glossary', g.id, m), color: 'red', reason: '금지어', disputed: false, unverified: false, suggestion: g.replacement });
        }
      } else if (g.variants.length) {
        // 변형 표기만 찾는다. 변형 목록에 정식 표기가 섞여 있어도 정식 표기 자리는 지적하지 않는다
        for (const m of findTerm(p, { term: g.variants[0], aliases: g.variants.slice(1) }, options)) {
          if (original.slice(m.start, m.end).normalize('NFC') === g.canonical.normalize('NFC')) continue;
          out.push({ ...base(`glossary:${g.id}`, 'glossary', g.id, m), color: 'yellow', reason: '표기 흔들림', disputed: false, unverified: false, suggestion: g.canonical });
        }
      }
    }
  }

  return out.sort((a, b) => a.start - b.start || COLOR_RANK[a.color] - COLOR_RANK[b.color] || b.end - a.end);
}

export type ResolvedFinding = Finding & { status: FindingStatus; resolution?: LintResolution };

/** 처리 기록을 지적에 붙인다. 이 위치만 > 이 회차 > 이 작품 전체 순으로 앞선다. */
export function applyResolutions(findings: Finding[], resolutions: LintResolution[], chapterId?: string): ResolvedFinding[] {
  return findings.map((f) => {
    const mine = resolutions.filter((r) => r.ruleKey === f.ruleKey);
    const hit =
      mine.find((r) => r.scope === 'position' && chapterId && r.chapterId === chapterId && r.context === f.context) ??
      mine.find((r) => r.scope === 'chapter' && chapterId && r.chapterId === chapterId) ??
      mine.find((r) => r.scope === 'work');
    return hit ? { ...f, status: hit.status, resolution: hit } : { ...f, status: '미처리' };
  });
}

/** 원고 하이라이트용: 겹치지 않는 구간만 고른다 (빨강 > 노랑 > 파랑, 같으면 긴 것) */
export function highlightSpans<T extends Pick<Finding, 'start' | 'end' | 'color'>>(findings: T[]): T[] {
  const sorted = [...findings].sort((a, b) => COLOR_RANK[a.color] - COLOR_RANK[b.color] || b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept: T[] = [];
  for (const f of sorted) if (!kept.some((k) => f.start < k.end && k.start < f.end)) kept.push(f);
  return kept.sort((a, b) => a.start - b.start);
}

/** 고증 항목 저장 조건 (SPEC 고증 DB 편집기). 빈 목록이면 저장 가능 */
export function validateLintEntry(e: LintEntry): string[] {
  const errs: string[] = [];
  if (!e.term.trim()) errs.push('표제어를 적어 주세요');
  if (!e.sources.some((s) => s.title.trim())) errs.push('출처를 1개 이상 적어 주세요');
  if (e.kind === 'not_yet') {
    if (!e.appears) errs.push('등장 시기를 적어 주세요');
    else if (!Number.isFinite(e.appears.from) || !Number.isFinite(e.appears.to) || e.appears.from > e.appears.to)
      errs.push('등장 시기의 시작 연도가 끝 연도보다 늦어요');
  } else {
    const senses = (e.senses ?? []).filter((s) => s.label.trim());
    if (senses.length < 2) errs.push('뜻을 2개 이상 적어 주세요');
  }
  return errs;
}

/** '1801~1850 (시기)' */
export function formatAppears(a?: LintEntry['appears']): string {
  if (!a) return '—';
  return `${a.from === a.to ? a.from : `${a.from}~${a.to}`}년 (${a.precision})`;
}

export function formatSources(e: Pick<LintEntry, 'sources'>): string {
  return e.sources
    .filter((s) => s.title.trim())
    .map((s) => [s.author, `『${s.title}』`, s.year && `(${s.year})`, s.locator].filter(Boolean).join(' '))
    .join('; ');
}
