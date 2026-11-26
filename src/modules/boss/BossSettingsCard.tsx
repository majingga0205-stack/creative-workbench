// 설정 · 백업 화면의 '보스 보드 압박도' 카드: 공식을 그대로 보여주고 가중치·기준값을 바꾼다
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { readSetting, setSetting } from '../../db/meta';
import type { PressureSettings } from '../../core/boss';
import { useAutosave } from '../../shared/useAutosave';
import { Card, SaveStatus } from '../../shared/ui';
import { NumberField } from './parts';

export function BossSettingsCard() {
  const rows = useLiveQuery(() => db.settings.toArray(), []);
  if (!rows) return null;
  return <Form initial={readSetting(rows, 'boss.pressure')} />;
}

function Form({ initial }: { initial: PressureSettings }) {
  const [s, setS] = useState(initial);
  const valid = s.reactionMaxMs > s.reactionMinMs && s.recoveryRefMs > 0;
  const { status } = useAutosave(s, (v: PressureSettings) => setSetting('boss.pressure', v), { valid });
  const w = s.weights;
  const setW = (k: keyof PressureSettings['weights'], n: number) => setS({ ...s, weights: { ...w, [k]: n } });
  return (
    <Card title="보스 보드 — 압박도 공식" actions={<SaveStatus status={status} />}>
      <div className="rounded-md bg-stone-50 p-3 font-mono text-sm" data-testid="pressure-formula">
        압박도 = 10 × ({w.D}·D + {w.R}·R + {w.H}·H + {w.P}·P)
        <ul className="mt-2 space-y-0.5 font-sans text-xs text-stone-600">
          <li>D(공격 밀도) = 공격 시간 ÷ 패턴 한 주기(전조+공격+후딜+쿨다운)</li>
          <li>R(반응 압박) = ({s.reactionMaxMs} − 전조ms) ÷ ({s.reactionMaxMs} − {s.reactionMinMs})</li>
          <li>H(피해) = 패턴 피해 ÷ 플레이어 최대 체력</li>
          <li>P(반격 기회 부족) = 1 − 후딜ms ÷ {s.recoveryRefMs}</li>
          <li>각 항은 시퀀스 비중으로 가중 평균한 패턴 값이고 0~1로 자른다. 결과는 0~10.</li>
        </ul>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <NumberField label="D 가중치" value={w.D} onChange={(n) => setW('D', n)} />
        <NumberField label="R 가중치" value={w.R} onChange={(n) => setW('R', n)} />
        <NumberField label="H 가중치" value={w.H} onChange={(n) => setW('H', n)} />
        <NumberField label="P 가중치" value={w.P} onChange={(n) => setW('P', n)} />
        <NumberField label="R 기준: 느긋한 전조" unit="ms" value={s.reactionMaxMs} onChange={(n) => setS({ ...s, reactionMaxMs: n })} />
        <NumberField label="R 기준: 가장 빠른 전조" unit="ms" value={s.reactionMinMs} onChange={(n) => setS({ ...s, reactionMinMs: n })} />
        <NumberField label="P 기준: 넉넉한 후딜" unit="ms" min={1} value={s.recoveryRefMs} onChange={(n) => setS({ ...s, recoveryRefMs: n })} />
        <NumberField label="경고: 전조 미만" unit="ms" value={s.telegraphWarnMs} onChange={(n) => setS({ ...s, telegraphWarnMs: n })} />
        <NumberField label="곡선: 차이 강조 기준" value={s.gapThreshold} onChange={(n) => setS({ ...s, gapThreshold: n })} />
      </div>
      {!valid && <p className="mt-2 text-xs text-red-700">느긋한 전조가 가장 빠른 전조보다 커야 하고, 넉넉한 후딜은 0보다 커야 해요.</p>}
      <p className="mt-2 text-xs text-stone-500">가중치 합이 1이면 압박도가 0~10 사이로 나와요 (지금 {(w.D + w.R + w.H + w.P).toFixed(2)}).</p>
    </Card>
  );
}
