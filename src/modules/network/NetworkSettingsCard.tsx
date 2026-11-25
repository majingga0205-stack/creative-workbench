// 설정 · 백업 화면의 '인물 네트워크 기준값' 카드
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { readSetting, setSetting } from '../../db/meta';
import { useAutosave } from '../../shared/useAutosave';
import { Card, Field, Input, SaveStatus } from '../../shared/ui';

export function NetworkSettingsCard() {
  const rows = useLiveQuery(() => db.settings.toArray(), []);
  if (!rows) return null;
  return <Form per={readSetting(rows, 'network.paragraphsPerScene')} bonus={readSetting(rows, 'network.sameParagraphBonus')} recent={readSetting(rows, 'network.recentChapters')} />;
}

function Form(props: { per: number; bonus: number; recent: number }) {
  const [d, setD] = useState({ per: String(props.per), bonus: String(props.bonus), recent: String(props.recent) });
  const isInt = (s: string, min: number) => /^\d+$/.test(s.trim()) && Number(s) >= min;
  const errs = {
    per: isInt(d.per, 1) ? undefined : '1 이상 정수',
    bonus: d.bonus.trim() !== '' && Number.isFinite(Number(d.bonus)) && Number(d.bonus) >= 0 ? undefined : '0 이상 숫자',
    recent: isInt(d.recent, 1) ? undefined : '1 이상 정수',
  };
  const { status } = useAutosave(
    d,
    async (v: typeof d) => {
      await setSetting('network.paragraphsPerScene', Number(v.per));
      await setSetting('network.sameParagraphBonus', Number(v.bonus));
      await setSetting('network.recentChapters', Number(v.recent));
    },
    { valid: !errs.per && !errs.bonus && !errs.recent },
  );
  return (
    <Card title="인물 네트워크 기준값" actions={<SaveStatus status={status} />}>
      <div className="grid gap-3 sm:grid-cols-3" data-testid="network-settings">
        <Field label="구분선 없는 회차: 문단 몇 개씩 한 장면" error={errs.per}>
          <Input inputMode="numeric" value={d.per} onChange={(e) => setD({ ...d, per: e.target.value })} />
        </Field>
        <Field label="같은 문단에 함께 나오면 더하는 가중치" error={errs.bonus}>
          <Input inputMode="decimal" value={d.bonus} onChange={(e) => setD({ ...d, bonus: e.target.value })} />
        </Field>
        <Field label="존재감 하락: 최근 몇 화" error={errs.recent}>
          <Input inputMode="numeric" value={d.recent} onChange={(e) => setD({ ...d, recent: e.target.value })} />
        </Field>
      </div>
    </Card>
  );
}
