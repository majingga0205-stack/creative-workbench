// 설정 · 백업 화면의 '한국어 텍스트 규칙' 카드: 조사 목록·장면 구분 기호·인용 표현
import { useState } from 'react';
import { setSetting, SETTING_DEFAULTS } from '../db/meta';
import { useAutosave } from './useAutosave';
import { useTextRules, type TextRules } from './useTextRules';
import { Button, Card, Field, SaveStatus, TextArea, parseList } from './ui';

export function TextRulesCard() {
  const rules = useTextRules();
  if (!rules) return null;
  return <Form initial={rules} />;
}

type Draft = { josa: string; scene: string; quotatives: string };
const toDraft = (r: TextRules): Draft => ({ josa: r.josa.join(', '), scene: r.sceneBreakSymbols.join(', '), quotatives: r.quotatives.join(', ') });

function Form({ initial }: { initial: TextRules }) {
  const [d, setD] = useState<Draft>(() => toDraft(initial));
  const josa = parseList(d.josa);
  const scene = parseList(d.scene);
  const longSymbols = scene.filter((s) => [...s].length !== 1);
  const errors = {
    josa: josa.length ? undefined : '조사를 하나 이상 적어 주세요',
    scene: !scene.length ? '기호를 하나 이상 적어 주세요' : longSymbols.length ? `기호는 한 글자씩 적어 주세요: ${longSymbols.join(', ')}` : undefined,
  };
  const { status } = useAutosave(
    d,
    async (v: Draft) => {
      await setSetting('text.josa', parseList(v.josa));
      await setSetting('text.sceneBreakSymbols', parseList(v.scene));
      await setSetting('text.quotatives', parseList(v.quotatives));
    },
    { valid: !errors.josa && !errors.scene },
  );
  const reset = (k: keyof Draft) =>
    setD({ ...d, [k]: (k === 'josa' ? SETTING_DEFAULTS['text.josa'] : k === 'scene' ? SETTING_DEFAULTS['text.sceneBreakSymbols'] : SETTING_DEFAULTS['text.quotatives']).join(', ') });
  return (
    <Card title="한국어 텍스트 규칙" actions={<SaveStatus status={status} />}>
      <p className="mb-3 text-xs text-stone-500">연재 실험실·시대 고증 린터·인물 네트워크·신화 원형 아카이브가 함께 쓰는 규칙이에요. 쉼표로 구분해요.</p>
      <div className="space-y-3" data-testid="text-rules">
        <Field label="허용 조사 — 낱말 뒤에 이 말이 붙어도 그 낱말로 찾아요 (‘감자를’ → 감자)" error={errors.josa}>
          <TextArea aria-label="허용 조사" rows={2} value={d.josa} onChange={(e) => setD({ ...d, josa: e.target.value })} />
        </Field>
        <Button size="sm" variant="ghost" onClick={() => reset('josa')}>조사 기본값으로</Button>
        <Field label="장면 구분 기호 — 이 기호 한 종류만 반복된 줄은 장면 구분선 (예: =, ===, = = =)" error={errors.scene}>
          <TextArea aria-label="장면 구분 기호" rows={1} value={d.scene} onChange={(e) => setD({ ...d, scene: e.target.value })} />
        </Field>
        <Button size="sm" variant="ghost" onClick={() => reset('scene')}>기호 기본값으로</Button>
        <Field label="인용 표현 — 닫는 따옴표 뒤에 이 말이 오면 문장을 나누지 않아요 (‘이상하다.’ 하고 생각했다)">
          <TextArea aria-label="인용 표현" rows={1} value={d.quotatives} onChange={(e) => setD({ ...d, quotatives: e.target.value })} />
        </Field>
        <Button size="sm" variant="ghost" onClick={() => reset('quotatives')}>인용 표현 기본값으로</Button>
      </div>
    </Card>
  );
}
