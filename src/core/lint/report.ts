// 검사 리포트 (SPEC 모듈 A '검사 리포트'): Markdown과 인쇄용 HTML. 순수 함수.
import type { GlossaryEntry, LintEntry } from '../../db/types';
import { formatAppears, formatSources, type FindingColor, type ResolvedFinding } from './lint';

export type ReportChapter = { label: string; text: string; findings: ResolvedFinding[] };

export type ReportInput = {
  workTitle: string;
  eraLabel: string;
  checkedAt: Date;
  chapters: ReportChapter[];
  entries: LintEntry[];
  glossary: GlossaryEntry[];
};

export const COLOR_LABEL: Record<FindingColor, string> = { red: '빨강', yellow: '노랑', blue: '파랑' };

export type ReportRow = {
  chapter: string;
  before: string;
  match: string;
  after: string;
  item: string;
  reason: string;
  color: FindingColor;
  period: string;
  basis: string;
  verified: string;
  status: string;
};

/** 리포트 한 줄씩: [회차 · 앞뒤 20자 발췌 · 항목 · 시기 · 근거 · 검증 여부 · 처리 상태] */
export function reportRows(input: ReportInput): ReportRow[] {
  const entries = new Map(input.entries.map((e) => [e.id, e]));
  const terms = new Map(input.glossary.map((g) => [g.id, g]));
  return input.chapters.flatMap((ch) =>
    ch.findings.map((f) => {
      const e = f.source === 'era' ? entries.get(f.entryId) : undefined;
      const g = f.source === 'glossary' ? terms.get(f.entryId) : undefined;
      const oneLine = (s: string) => s.replace(/\s+/g, ' ');
      return {
        chapter: ch.label,
        before: oneLine(ch.text.slice(Math.max(0, f.start - 20), f.start)),
        match: f.text,
        after: oneLine(ch.text.slice(f.end, f.end + 20)),
        item: e ? e.term : g ? `[용어집] ${g.canonical}` : f.form,
        reason: `${COLOR_LABEL[f.color]} · ${f.reason}${f.contextWord ? ` (문맥어 ‘${f.contextWord}’)` : ''}${f.suggestion ? ` → ${f.suggestion}` : ''}`,
        color: f.color,
        period: e ? (e.kind === 'not_yet' ? formatAppears(e.appears) : f.sense ?? '—') : '—',
        basis: e ? formatSources(e) || '—' : g?.note || '—',
        verified: e ? `${e.verified ? '검증됨' : '미검증'}${e.disputed ? ' · 이설 있음' : ''}` : '—',
        status: f.status + (f.resolution ? ` (${scopeLabel(f.resolution.scope)})` : ''),
      };
    }),
  );
}

const scopeLabel = (s: 'position' | 'chapter' | 'work') => ({ position: '이 위치', chapter: '이 회차', work: '작품 전체' })[s];

function counts(input: ReportInput) {
  const all = input.chapters.flatMap((c) => c.findings);
  return { red: all.filter((f) => f.color === 'red').length, yellow: all.filter((f) => f.color === 'yellow').length, blue: all.filter((f) => f.color === 'blue').length, total: all.length };
}

const dateText = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function buildReportMarkdown(input: ReportInput): string {
  const c = counts(input);
  const md = (s: string) => s.replace(/([\\|*_`[\]])/g, '\\$1');
  const lines = [
    `# 시대 고증 검사 리포트 — ${md(input.workTitle)}`,
    '',
    `- 회차: ${input.chapters.map((ch) => md(ch.label)).join(', ') || '—'}`,
    `- 설정 시대: ${md(input.eraLabel)}`,
    `- 검사일: ${dateText(input.checkedAt)}`,
    `- 지적: 빨강 ${c.red} · 노랑 ${c.yellow} · 파랑 ${c.blue} (모두 ${c.total})`,
    '',
    '| 회차 | 발췌 | 항목 | 판정 | 시기 | 근거 | 검증 | 처리 |',
    '|---|---|---|---|---|---|---|---|',
    ...reportRows(input).map(
      (r) => `| ${md(r.chapter)} | …${md(r.before)}**${md(r.match)}**${md(r.after)}… | ${md(r.item)} | ${md(r.reason)} | ${md(r.period)} | ${md(r.basis)} | ${r.verified} | ${r.status} |`,
    ),
    '',
    '> 미검증 항목은 출처 원문을 직접 확인하기 전까지 참고용이다.',
    '',
  ];
  return lines.join('\n');
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** 인쇄용 HTML (브라우저에서 PDF로 저장). 외부 글꼴·스크립트 없음 */
export function buildReportHtml(input: ReportInput): string {
  const c = counts(input);
  const color = { red: '#b91c1c', yellow: '#a16207', blue: '#1d4ed8' };
  const rows = reportRows(input)
    .map(
      (r) => `<tr><td>${esc(r.chapter)}</td><td>…${esc(r.before)}<mark style="background:${color[r.color]}22;color:${color[r.color]};font-weight:600">${esc(r.match)}</mark>${esc(r.after)}…</td><td>${esc(r.item)}</td><td>${esc(r.reason)}</td><td>${esc(r.period)}</td><td>${esc(r.basis)}</td><td>${esc(r.verified)}</td><td>${esc(r.status)}</td></tr>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>시대 고증 검사 리포트 — ${esc(input.workTitle)}</title>
<style>
  @page { size: A4 landscape; margin: 14mm; }
  body { font-family: 'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; color: #1c1917; font-size: 11px; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  ul { margin: 0 0 14px; padding-left: 18px; line-height: 1.7; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #e7e5e4; padding: 5px 6px; text-align: left; vertical-align: top; }
  th { font-size: 10px; color: #78716c; font-weight: 600; }
  tr { break-inside: avoid; }
  .note { margin-top: 12px; color: #78716c; }
</style></head><body>
<h1>시대 고증 검사 리포트 — ${esc(input.workTitle)}</h1>
<ul>
  <li>회차: ${esc(input.chapters.map((ch) => ch.label).join(', ') || '—')}</li>
  <li>설정 시대: ${esc(input.eraLabel)}</li>
  <li>검사일: ${dateText(input.checkedAt)}</li>
  <li>지적: 빨강 ${c.red} · 노랑 ${c.yellow} · 파랑 ${c.blue} (모두 ${c.total})</li>
</ul>
<table><thead><tr><th>회차</th><th>발췌</th><th>항목</th><th>판정</th><th>시기</th><th>근거</th><th>검증</th><th>처리</th></tr></thead>
<tbody>
${rows}
</tbody></table>
<p class="note">미검증 항목은 출처 원문을 직접 확인하기 전까지 참고용이다.</p>
</body></html>`;
}
