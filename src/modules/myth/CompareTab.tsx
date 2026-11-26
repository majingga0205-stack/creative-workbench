// 내 캐릭터 대조: 존재에 연결 → 함정 경고, 요소별 가져옴/변형함/버림/충돌, 네 칸 결과, 보존도
import { useState } from 'react';
import { compareCharacter, WEIGHT_LABEL, type ElementRow } from '../../core/archetype';
import { db } from '../../db/database';
import { linkArchetype, setElementChoice } from '../../db/repo';
import type { Being, Character, ElementChoice } from '../../db/types';
import { useAutosave } from '../../shared/useAutosave';
import { Badge, Button, Card, Empty, Field, Input, SaveStatus, Select, TextArea, parseList } from '../../shared/ui';
import { useUI } from '../../store/ui';
import { useTextRules } from '../../shared/useTextRules';

const CHOICES: ElementChoice[] = ['가져옴', '변형함', '버림', '충돌'];

export function CompareTab({ characters, beings }: { characters: Character[]; beings: Being[] }) {
  const { characterId, openCharacter, setView } = useUI();
  const ch = characters.find((c) => c.id === characterId) ?? characters[0];
  if (!ch)
    return (
      <Empty title="캐릭터가 없어요">
        <button type="button" className="underline" onClick={() => setView('characters')}>캐릭터</button>에서 먼저 만들어 주세요.
      </Empty>
    );
  const being = beings.find((b) => b.id === ch.archetypeId);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-stone-600">캐릭터</span>
          <Select aria-label="대조할 캐릭터" className="!w-44" value={ch.id} onChange={(e) => openCharacter(e.target.value)}>
            {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <span className="text-stone-600">→ 원형</span>
          <Select aria-label="연결할 존재" className="!w-44" value={ch.archetypeId ?? ''} onChange={(e) => linkArchetype(ch.id, e.target.value || undefined)}>
            <option value="">연결 안 함</option>
            {beings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          {ch.archetypeChoices && Object.keys(ch.archetypeChoices).length > 0 && <span className="text-xs text-stone-500">다른 존재로 바꾸면 요소 선택은 비워져요</span>}
        </div>
      </Card>
      <TraitsEditor key={ch.id} character={ch} />
      {being ? <Result character={ch} being={being} /> : <Empty title="캐릭터를 존재(원형)에 연결하세요">연결하면 요소마다 가져옴·변형함·버림을 고르고, 함정 경고와 보존도를 보여줘요.</Empty>}
    </div>
  );
}

function TraitsEditor({ character }: { character: Character }) {
  const [d, setD] = useState({ id: character.id, traits: character.traits.join(', '), note: character.note });
  const { status } = useAutosave(d, (v: typeof d) => db.characters.update(v.id, { traits: parseList(v.traits), note: v.note, updatedAt: new Date().toISOString() }));
  return (
    <Card title={`${character.name}의 특성`} actions={<SaveStatus status={status} />}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="특성" hint="쉼표로 구분. 캐릭터 화면의 특성과 같아요.">
          <Input aria-label="특성" value={d.traits} onChange={(e) => setD({ ...d, traits: e.target.value })} placeholder="예: 요술 방망이, 씨름을 좋아함" />
        </Field>
        <Field label="설명 (메모)">
          <TextArea aria-label="설명" rows={2} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} />
        </Field>
      </div>
    </Card>
  );
}

function Result({ character, being }: { character: Character; being: Being }) {
  const rules = useTextRules();
  const r = compareCharacter(being, character.traits, character.note, character.archetypeChoices, { josa: rules?.josa });
  const set = (id: string, patch: { choice?: ElementChoice | null; intended?: boolean }) => setElementChoice(character.id, id, patch);
  return (
    <>
      {r.traps.map((h) => (
        <div key={h.trap.id} role="alert" className="rounded-lg border border-orange-300 bg-orange-50 p-4 text-sm text-orange-950" data-testid="trap-warning">
          <div className="mb-1 font-semibold">⚠ 고증 함정 — ‘{h.words.join('’, ‘')}’</div>
          <p><span className="text-orange-800">흔한 오해:</span> {h.trap.claim}</p>
          <p className="mt-1"><span className="text-orange-800">바로잡은 내용:</span> {h.trap.correction}</p>
          <p className="mt-1 text-xs text-orange-800">
            근거: {h.trap.sources.length ? h.trap.sources.map((s) => s.title).join('; ') : '출처 없음'} · {h.trap.verified ? '검증됨' : '미검증 — 참고만'}
          </p>
          <p className="mt-1 text-xs text-orange-800">경고는 지적일 뿐이에요. 일부러 그렇게 설정했다면 그대로 두세요.</p>
        </div>
      ))}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="four-cells">
        <Cell title="가져온 것" rows={r.cells.kept} tone="teal" />
        <Cell title="바꾼 것" rows={r.cells.changed} tone="stone" />
        <Cell title="버린 핵심 요소" rows={r.cells.droppedCore} tone="amber" onIntend={(id, v) => set(id, { intended: v })} />
        <Cell title="원형과 충돌" rows={r.cells.conflicts} tone="red" onIntend={(id, v) => set(id, { intended: v })} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title={`요소별 대조 — ${being.name}`}>
          <table className="w-full text-sm" data-testid="element-table">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
                <th className="py-1.5 font-medium">요소</th>
                <th className="py-1.5 font-medium">자동 제안</th>
                <th className="py-1.5 font-medium">선택</th>
              </tr>
            </thead>
            <tbody>
              {r.rows.map((row) => (
                <tr key={row.element.id} className={`border-b border-stone-100 align-top ${row.noSource ? 'text-stone-500' : ''}`}>
                  <td className="py-2 pr-2">
                    <div className="font-medium">{row.element.label}</div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      <Badge tone={row.element.weight === 'core' ? 'teal' : 'stone'}>{WEIGHT_LABEL[row.element.weight]}</Badge>
                      {row.noSource && <Badge>출처 없음</Badge>}
                      {!row.element.verified && <Badge>미검증</Badge>}
                    </div>
                  </td>
                  <td className="py-2 pr-2 text-xs">
                    {row.suggestion ? (
                      <span className={row.suggestion.choice === '충돌' ? 'text-red-700' : 'text-teal-800'}>
                        {row.suggestion.choice} <span className="text-stone-500">(‘{row.suggestion.words.join('’, ‘')}’)</span>
                      </span>
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      {CHOICES.map((c) => (
                        <Button key={c} size="sm" variant={row.effective === c ? (row.choice ? 'primary' : 'secondary') : 'ghost'} className={row.effective === c && !row.choice ? 'ring-1 ring-teal-600' : ''} onClick={() => set(row.element.id, { choice: c })}>
                          {c}
                        </Button>
                      ))}
                      {row.choice && (
                        <Button size="sm" variant="ghost" onClick={() => set(row.element.id, { choice: null })} title="확정을 지우고 자동 제안을 따름">
                          제안대로
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-stone-500">테두리만 있는 버튼 = 자동 제안(아직 확정 안 함). 출처가 없는 요소는 회색이에요.</p>
        </Card>
        <div className="space-y-4">
          <Card title="보존도">
            <div className="text-3xl font-semibold tabular-nums" data-testid="preservation">{Math.round(r.score * 100)}%</div>
            <p className="mt-2 text-xs leading-relaxed text-stone-600">
              높을수록 좋은 점수가 아니라, 이 캐릭터가 원형에 <b>얼마나 기대나</b>를 뜻해요. (가져옴 가중치 + 변형함 가중치 × 0.5) ÷ 전체 요소 가중치 — 핵심 3 · 흔함 2 · 일부 판본 1.
            </p>
            {r.undecided.length > 0 && <p className="mt-1 text-xs text-stone-500">아직 안 고른 요소 {r.undecided.length}개는 보존도에서 0으로 세요.</p>}
          </Card>
          <Card title="새로 더함">
            {r.added.length ? (
              <ul className="flex flex-wrap gap-1.5" data-testid="added-traits">
                {r.added.map((t) => <li key={t}><Badge tone="teal">{t}</Badge></li>)}
              </ul>
            ) : (
              <p className="text-sm text-stone-500">어느 요소에도 걸리지 않은 특성이 없어요.</p>
            )}
            {r.droppedOther.length > 0 && <p className="mt-2 text-xs text-stone-500">버린 요소(핵심 아님): {r.droppedOther.map((x) => x.element.label).join(', ')}</p>}
          </Card>
        </div>
      </div>
    </>
  );
}

function Cell({ title, rows, tone, onIntend }: { title: string; rows: ElementRow[]; tone: 'teal' | 'stone' | 'amber' | 'red'; onIntend?: (id: string, v: boolean) => void }) {
  const border = { teal: 'border-teal-200', stone: 'border-stone-200', amber: 'border-amber-200', red: 'border-red-200' }[tone];
  return (
    <section className={`rounded-lg border bg-white p-3 ${border}`} aria-label={title}>
      <h3 className="mb-2 text-sm font-semibold">
        {title} <span className="text-stone-400">{rows.length}</span>
      </h3>
      <ul className="space-y-1 text-sm">
        {rows.map((r) => (
          <li key={r.element.id} className={`flex items-center gap-1.5 ${r.noSource ? 'text-stone-500' : ''}`}>
            <span className="flex-1">{r.element.label}</span>
            {!r.choice && <span className="text-[11px] text-stone-400">제안</span>}
            {onIntend && (
              <label className="flex items-center gap-1 text-[11px] text-stone-600">
                <input type="checkbox" checked={r.intended} onChange={(e) => onIntend(r.element.id, e.target.checked)} /> 의도함
              </label>
            )}
          </li>
        ))}
        {!rows.length && <li className="text-xs text-stone-400">없음</li>}
      </ul>
    </section>
  );
}
