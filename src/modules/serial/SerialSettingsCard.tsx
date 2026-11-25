// 설정 · 백업 화면의 '연재 실험실 기준값' 카드
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { readSetting, setSetting, type ReaderMetricDef } from '../../db/meta';
import type { ParagraphMode } from '../../core/korean';
import type { RhythmThresholds } from '../../core/rhythm';
import { useAutosave } from '../../shared/useAutosave';
import { Button, Card, Field, Input, SaveStatus, Select } from '../../shared/ui';

const FIELDS: { key: keyof RhythmThresholds; label: string; unit: string; int?: boolean; min: number }[] = [
  { key: 'shortSentence', label: '짧은 문장 (이하)', unit: '자', min: 1 },
  { key: 'longSentence', label: '긴 문장 (이상)', unit: '자', min: 1 },
  { key: 'wallParagraph', label: '벽 문단 (초과)', unit: '자', min: 1 },
  { key: 'movingAverageWindow', label: '이동 평균 창', unit: '문장', int: true, min: 1 },
  { key: 'cutMaxLength', label: '엔딩 절단: 마지막 문장 (이하)', unit: '자', min: 0 },
  { key: 'summaryMinLength', label: '엔딩 정리: 마지막 문단 (이상)', unit: '자', min: 0 },
  { key: 'breakDropPoints', label: '꺾이는 구간: 중앙값보다', unit: '%p 낮음', min: 0 },
  { key: 'lowSampleSize', label: '표본 부족 (미만)', unit: '화', int: true, min: 1 },
  { key: 'compareDay', label: '비교 기준 일수', unit: '일차', int: true, min: 0 },
];

export function SerialSettingsCard() {
  const rows = useLiveQuery(() => db.settings.toArray(), []);
  if (!rows) return null;
  return (
    <SerialSettingsForm
      thresholds={readSetting(rows, 'serial.thresholds')}
      paragraphMode={readSetting(rows, 'serial.paragraphMode')}
      metrics={readSetting(rows, 'serial.readerMetrics')}
      retention={readSetting(rows, 'serial.retentionMetric')}
    />
  );
}

type Draft = { th: Record<string, string>; paragraphMode: ParagraphMode; metrics: ReaderMetricDef[]; retention: string };

function SerialSettingsForm(props: { thresholds: RhythmThresholds; paragraphMode: ParagraphMode; metrics: ReaderMetricDef[]; retention: string }) {
  const [d, setD] = useState<Draft>(() => ({
    th: Object.fromEntries(FIELDS.map((f) => [f.key, String(props.thresholds[f.key])])),
    paragraphMode: props.paragraphMode,
    metrics: props.metrics,
    retention: props.retention,
  }));

  const errors: Record<string, string> = {};
  for (const f of FIELDS) {
    const n = Number(d.th[f.key]);
    if (d.th[f.key].trim() === '' || !Number.isFinite(n) || n < f.min || (f.int && !Number.isInteger(n)))
      errors[f.key] = f.int ? `${f.min} 이상 정수` : `${f.min} 이상 숫자`;
  }
  const metricsOk = d.metrics.length > 0 && d.metrics.every((m) => m.label.trim());
  const valid = Object.keys(errors).length === 0 && metricsOk;

  const { status } = useAutosave(
    d,
    async (v: Draft) => {
      await setSetting('serial.thresholds', Object.fromEntries(FIELDS.map((f) => [f.key, Number(v.th[f.key])])));
      await setSetting('serial.paragraphMode', v.paragraphMode);
      await setSetting('serial.readerMetrics', v.metrics.map((m) => ({ key: m.key, label: m.label.trim() })));
      await setSetting('serial.retentionMetric', v.metrics.some((m) => m.key === v.retention) ? v.retention : v.metrics[0].key);
    },
    { valid },
  );

  const setMetric = (k: number, label: string) => setD({ ...d, metrics: d.metrics.map((m, j) => (j === k ? { ...m, label } : m)) });

  return (
    <Card title="연재 실험실 기준값" actions={<SaveStatus status={status} />}>
      <div className="grid gap-3 sm:grid-cols-3" data-testid="serial-settings">
        {FIELDS.map((f) => (
          <Field key={f.key} label={`${f.label} (${f.unit})`} error={errors[f.key]}>
            <Input inputMode="decimal" value={d.th[f.key]} onChange={(e) => setD({ ...d, th: { ...d.th, [f.key]: e.target.value } })} />
          </Field>
        ))}
        <Field label="문단 단위" hint="빈 줄 = 한 문단을 여러 줄로 쓴 원고">
          <Select value={d.paragraphMode} onChange={(e) => setD({ ...d, paragraphMode: e.target.value as ParagraphMode })}>
            <option value="line">줄바꿈</option>
            <option value="blank">빈 줄</option>
          </Select>
        </Field>
      </div>

      <div className="mt-5">
        <div className="mb-1 text-[13px] font-medium text-stone-600">독자 지표 항목</div>
        <p className="mb-2 text-xs text-stone-500">
          기본은 노벨피아 기준 임시 이름이에요. 실제 화면의 이름과 다르면 고치세요. 이름을 바꿔도 기록한 값은 그대로 이어져요. 항목을 지우면 그 값은 화면에서만 숨겨져요.
        </p>
        <div className="space-y-2">
          {d.metrics.map((m, k) => (
            <div key={m.key} className="flex items-center gap-2">
              <Input aria-label={`지표 ${k + 1} 이름`} className="!w-48" value={m.label} onChange={(e) => setMetric(k, e.target.value)} />
              <label className="flex items-center gap-1 text-xs text-stone-600">
                <input type="radio" name="retention-metric" checked={d.retention === m.key} onChange={() => setD({ ...d, retention: m.key })} />
                연독률 계산에 사용
              </label>
              <Button size="sm" variant="ghost" disabled={d.metrics.length <= 1} onClick={() => setD({ ...d, metrics: d.metrics.filter((_, j) => j !== k) })}>
                빼기
              </Button>
            </div>
          ))}
        </div>
        <Button
          size="sm"
          className="mt-2"
          onClick={() => setD({ ...d, metrics: [...d.metrics, { key: `m${Date.now().toString(36)}`, label: '새 지표' }] })}
        >
          + 지표 추가
        </Button>
        {!metricsOk && <p className="mt-1 text-xs text-red-700">지표 이름을 비울 수 없어요.</p>}
      </div>
    </Card>
  );
}
