// 설정 · 백업 화면의 '시대 프리셋' 카드
import { useState } from 'react';
import { setSetting } from '../../db/meta';
import type { WorkSetting } from '../../db/types';
import { useAutosave } from '../../shared/useAutosave';
import { Button, Card, Input, SaveStatus } from '../../shared/ui';
import { useEraPresets } from './useLint';

export function LintSettingsCard() {
  const presets = useEraPresets();
  if (!presets) return null;
  return <PresetForm initial={presets} />;
}

type Row = { label: string; from: string; to: string; region: string };

function PresetForm({ initial }: { initial: WorkSetting[] }) {
  const [rows, setRows] = useState<Row[]>(initial.map((p) => ({ label: p.label, from: String(p.yearFrom), to: String(p.yearTo), region: p.region })));
  const isInt = (s: string) => /^-?\d+$/.test(s.trim());
  const bad = rows.map((r) => !r.label.trim() || !isInt(r.from) || !isInt(r.to) || Number(r.from) > Number(r.to));
  const { status } = useAutosave(
    rows,
    (rs: Row[]) => setSetting('lint.eraPresets', rs.map((r) => ({ label: r.label.trim(), yearFrom: Number(r.from), yearTo: Number(r.to), region: r.region.trim() }))),
    { valid: !bad.some(Boolean) },
  );
  const set = (k: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === k ? { ...r, ...patch } : r)));
  return (
    <Card title="시대 고증 린터 — 시대 프리셋" actions={<SaveStatus status={status} />}>
      <p className="mb-3 text-xs text-stone-500">
        ‘조선 중기’ 같은 시대 이름은 학자마다 구분이 달라요. 프리셋은 연도 범위를 고칠 수 있는 기본값일 뿐이고, 판정은 연도와 지역으로만 해요. 기본 ‘조선 중기 1550~1700’은 임시값이에요.
      </p>
      <div className="space-y-2" data-testid="era-presets">
        {rows.map((r, k) => (
          <div key={k} className="flex flex-wrap items-center gap-1.5">
            <Input aria-label={`프리셋 ${k + 1} 이름`} className="!w-36" value={r.label} onChange={(e) => set(k, { label: e.target.value })} />
            <Input aria-label={`프리셋 ${k + 1} 시작 연도`} className="!w-24" value={r.from} onChange={(e) => set(k, { from: e.target.value })} />
            ~
            <Input aria-label={`프리셋 ${k + 1} 끝 연도`} className="!w-24" value={r.to} onChange={(e) => set(k, { to: e.target.value })} />
            <Input aria-label={`프리셋 ${k + 1} 지역`} className="!w-28" value={r.region} onChange={(e) => set(k, { region: e.target.value })} />
            <Button size="sm" variant="ghost" onClick={() => setRows(rows.filter((_, j) => j !== k))}>빼기</Button>
            {bad[k] && <span className="text-xs text-red-700">이름과 연도(시작 ≤ 끝)를 확인하세요</span>}
          </div>
        ))}
      </div>
      <Button size="sm" className="mt-2" onClick={() => setRows([...rows, { label: '새 시대', from: '1600', to: '1700', region: '한반도' }])}>+ 프리셋 추가</Button>
    </Card>
  );
}
