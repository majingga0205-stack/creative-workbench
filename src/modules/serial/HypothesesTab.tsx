// 가설 기록·결과 확인. 앱은 숫자만 보여주고 지지·기각은 사용자가 누른다.
import { useState } from 'react';
import { effectiveStatus, evaluateHypothesis, type ChapterRow, type HypothesisField, type HypothesisOp } from '../../core/rhythm';
import { createHypothesis, deleteHypothesis, updateHypothesis } from '../../db/repo';
import type { Hypothesis, HypothesisStatus } from '../../db/types';
import { confirmDialog, toast } from '../../shared/dialogs';
import { useAutosave } from '../../shared/useAutosave';
import { Badge, Button, Card, Empty, Field, Input, SaveStatus, Select, TextArea } from '../../shared/ui';
import { num, useHypotheses, type SerialSettings } from './useSerial';

const FIELD_LABEL: Record<HypothesisField, string> = {
  endingTag: '엔딩 태그',
  dialogueRatio: '대사 비율(%)',
  length: '글자 수(공백 제외)',
  custom: '직접 고른 회차',
};

export function describeCondition(c: Hypothesis['condition']) {
  if (c.field === 'endingTag') return `엔딩 태그가 ‘${c.value}’인 회차`;
  if (c.field === 'custom') return `직접 고른 회차 (${c.value})`;
  const op = c.op === '>' ? '보다 큰' : c.op === '<' ? '보다 작은' : '와 같은';
  return `${FIELD_LABEL[c.field]}가 ${c.value}${op} 회차`;
}

export function HypothesesTab({ workId, rows, settings }: { workId: string; rows: ChapterRow[]; settings: SerialSettings }) {
  return (
    <div className="space-y-4">
      <HypothesisForm workId={workId} settings={settings} lastChapter={rows[rows.length - 1]?.number ?? 1} />
      <HypothesisList workId={workId} rows={rows} settings={settings} />
    </div>
  );
}

function HypothesisForm({ workId, settings, lastChapter }: { workId: string; settings: SerialSettings; lastChapter: number }) {
  const [statement, setStatement] = useState('');
  const [field, setField] = useState<HypothesisField>('endingTag');
  const [op, setOp] = useState<HypothesisOp>('=');
  const [value, setValue] = useState('절단');
  const [metric, setMetric] = useState(settings.retentionMetric);
  const [target, setTarget] = useState<'same' | 'next'>('next');
  const [check, setCheck] = useState(String(lastChapter + 5));

  const changeField = (f: HypothesisField) => {
    setField(f);
    setOp(f === 'endingTag' || f === 'custom' ? '=' : '>');
    setValue(f === 'endingTag' ? '절단' : '');
    setTarget(f === 'endingTag' ? 'next' : 'same'); // 엔딩 가설은 다음 화 지표가 기본
  };

  const valid = statement.trim() && value.trim() !== '' && (field === 'endingTag' || field === 'custom' || Number.isFinite(Number(value))) && Number.isFinite(Number(check));

  const submit = async () => {
    if (!valid) return;
    await createHypothesis(workId, {
      statement: statement.trim(),
      condition: { field, op, value: field === 'endingTag' || field === 'custom' ? value.trim() : Number(value) },
      metric,
      target,
      checkAfterChapter: Number(check),
    });
    setStatement('');
    toast('가설을 기록했어요');
  };

  return (
    <Card title="새 가설">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="가설">
          <Input value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="예: 엔딩을 끊어 치면 다음 화 유지율이 오른다" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[180px_90px_1fr]">
          <Field label="조건">
            <Select value={field} onChange={(e) => changeField(e.target.value as HypothesisField)}>
              {(Object.keys(FIELD_LABEL) as HypothesisField[]).map((f) => (
                <option key={f} value={f}>
                  {FIELD_LABEL[f]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="비교">
            <Select value={op} onChange={(e) => setOp(e.target.value as HypothesisOp)} disabled={field === 'endingTag' || field === 'custom'}>
              <option value="=">=</option>
              <option value=">">&gt;</option>
              <option value="<">&lt;</option>
            </Select>
          </Field>
          <Field label="값" hint={field === 'custom' ? '회차 번호를 쉼표로 (예: 3, 5, 7)' : field === 'dialogueRatio' ? '퍼센트 (예: 50)' : undefined}>
            {field === 'endingTag' ? (
              <Select value={value} onChange={(e) => setValue(e.target.value)}>
                <option>절단</option>
                <option>여운</option>
                <option>정리</option>
              </Select>
            ) : (
              <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode={field === 'custom' ? 'text' : 'numeric'} />
            )}
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="비교할 지표">
            <Select value={metric} onChange={(e) => setMetric(e.target.value)}>
              {settings.readerMetrics.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="어느 회차의 지표">
            <Select value={target} onChange={(e) => setTarget(e.target.value as 'same' | 'next')}>
              <option value="next">다음 화</option>
              <option value="same">같은 화</option>
            </Select>
          </Field>
          <Field label="확인할 회차" hint="이 회차의 지표가 들어오면 ‘확인할 때 됨’">
            <Input inputMode="numeric" value={check} onChange={(e) => setCheck(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={!valid}>
            가설 기록
          </Button>
        </div>
      </form>
    </Card>
  );
}

function HypothesisList({ workId, rows, settings }: { workId: string; rows: ChapterRow[]; settings: SerialSettings }) {
  const list = useHypotheses(workId);
  if (!list) return null;
  if (!list.length) return <Empty title="기록한 가설이 없어요">가설을 적어 두면, 지표가 쌓였을 때 조건에 맞는 회차와 나머지를 나란히 비교해 줘요.</Empty>;
  return (
    <div className="space-y-3" data-testid="hypothesis-list">
      {list.map((h) => (
        <HypothesisCard key={h.id} h={h} rows={rows} settings={settings} />
      ))}
    </div>
  );
}

const STATUS_TONE: Record<HypothesisStatus, 'stone' | 'teal' | 'amber' | 'red'> = {
  대기: 'stone',
  '확인할 때 됨': 'amber',
  지지됨: 'teal',
  기각: 'red',
  보류: 'stone',
};

function HypothesisCard({ h, rows, settings }: { h: Hypothesis; rows: ChapterRow[]; settings: SerialSettings }) {
  const status = effectiveStatus(h, rows);
  const r = evaluateHypothesis(h, rows, settings.thresholds.lowSampleSize);
  const metricLabel = settings.readerMetrics.find((m) => m.key === h.metric)?.label ?? h.metric;
  const [note, setNote] = useState({ id: h.id, text: h.resultNote ?? '' });
  const { status: saveStatus } = useAutosave(note, (n) => updateHypothesis(n.id, { resultNote: n.text }));

  const judge = (s: HypothesisStatus) => updateHypothesis(h.id, { status: s });
  const remove = async () => {
    if (await confirmDialog({ title: '가설 지우기', message: `「${h.statement}」을(를) 지울까요? 되돌릴 수 없어요.`, confirmLabel: '지우기', danger: true }))
      await deleteHypothesis(h.id);
  };

  return (
    <Card
      title={h.statement}
      actions={<Badge tone={STATUS_TONE[status]}>{status === '확인할 때 됨' ? '⏰ ' : ''}{status}</Badge>}
    >
      <p className="text-sm text-stone-600">
        {describeCondition(h.condition)} vs 나머지 · {h.target === 'next' ? '다음 화' : '같은 화'} {metricLabel} · {h.checkAfterChapter}화 이후 확인
      </p>
      <table className="mt-3 w-full max-w-lg text-sm" data-testid="hypothesis-result">
        <thead>
          <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
            <th className="py-1.5 font-medium">집단</th>
            <th className="py-1.5 text-right font-medium">회차 수</th>
            <th className="py-1.5 text-right font-medium">평균</th>
            <th className="py-1.5 text-right font-medium">중앙값</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['조건에 맞는 회차', r.inGroup],
            ['나머지', r.outGroup],
          ].map(([label, g]) => {
            const s = g as typeof r.inGroup;
            return (
              <tr key={label as string} className="border-b border-stone-100" title={s.numbers.length ? `회차: ${s.numbers.join(', ')}` : ''}>
                <td className="py-1.5">{label as string}</td>
                <td className="py-1.5 text-right tabular-nums">{s.n}</td>
                <td className="py-1.5 text-right tabular-nums">{s.n ? num(s.mean) : '—'}</td>
                <td className="py-1.5 text-right tabular-nums">{s.n ? num(s.median) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-2 space-y-1 text-xs text-stone-500">
        {r.lowSample && (
          <p>
            <Badge tone="amber">표본 부족 — 참고만</Badge> 한쪽 집단이 {settings.thresholds.lowSampleSize}화 미만이에요.
          </p>
        )}
        <p>두 집단의 숫자가 함께 움직여도, 그 조건이 원인이라는 뜻은 아니에요.</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-stone-500">판정:</span>
        {(['지지됨', '기각', '보류'] as HypothesisStatus[]).map((s) => (
          <Button key={s} size="sm" variant={h.status === s ? 'primary' : 'secondary'} onClick={() => judge(s)}>
            {s}
          </Button>
        ))}
        {h.status !== '대기' && (
          <Button size="sm" variant="ghost" onClick={() => judge('대기')}>
            대기로 되돌리기
          </Button>
        )}
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={remove}>
          지우기
        </Button>
      </div>
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[13px] font-medium text-stone-600">결과 메모</span>
          <SaveStatus status={saveStatus} />
        </div>
        <TextArea rows={2} value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })} />
      </div>
    </Card>
  );
}
