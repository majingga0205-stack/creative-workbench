// SF 세계관 용어집 (작품별): 금지어 → 빨강 + 대체어, 표기 흔들림 → 노랑 + 정식 표기
import { useState } from 'react';
import { deleteGlossary, newId, saveGlossary } from '../../db/repo';
import type { GlossaryEntry } from '../../db/types';
import { confirmDialog } from '../../shared/dialogs';
import { useAutosave } from '../../shared/useAutosave';
import { Button, Card, Empty, Input, SaveStatus, Select, parseList } from '../../shared/ui';

export function GlossaryTab({ workId, glossary }: { workId: string; glossary: GlossaryEntry[] }) {
  const [canonical, setCanonical] = useState('');
  const [status, setStatus] = useState<GlossaryEntry['status']>('사용');
  const add = async () => {
    if (!canonical.trim()) return;
    await saveGlossary({ id: newId(), workId, canonical: canonical.trim(), variants: [], status });
    setCanonical('');
  };
  return (
    <div className="space-y-4">
      <Card title="용어 추가">
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <Input aria-label="정식 표기" className="!w-56" placeholder="정식 표기 (예: 나노테크 팔찌)" value={canonical} onChange={(e) => setCanonical(e.target.value)} />
          <Select aria-label="용어 상태" className="!w-28" value={status} onChange={(e) => setStatus(e.target.value as GlossaryEntry['status'])}>
            <option value="사용">사용</option>
            <option value="금지">금지</option>
          </Select>
          <Button type="submit" variant="primary" disabled={!canonical.trim()}>추가</Button>
          <p className="w-full text-xs text-stone-500">
            ‘금지’ = 이 세계에 없는 것(예: 스마트폰) → 빨강 + 대체어 제안. ‘사용’ = 정식 표기, 변형 표기를 찾으면 노랑 + 정식 표기 안내. 검사 탭에서 ‘SF 용어집’을 켜야 검사해요.
          </p>
        </form>
      </Card>
      {glossary.length === 0 ? (
        <Empty title="용어집이 비어 있어요" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full min-w-[760px] text-sm" data-testid="glossary-table">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
                <th className="px-3 py-2 font-medium">정식 표기</th>
                <th className="px-2 py-2 font-medium">상태</th>
                <th className="px-2 py-2 font-medium">변형 표기 (쉼표)</th>
                <th className="px-2 py-2 font-medium">대체어 (금지어)</th>
                <th className="px-2 py-2 font-medium">메모</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {glossary.map((g) => (
                <GlossaryRow key={g.id} g={g} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type Draft = { id: string; workId: string; canonical: string; status: GlossaryEntry['status']; variants: string; replacement: string; note: string };

function GlossaryRow({ g }: { g: GlossaryEntry }) {
  const [d, setD] = useState<Draft>({ id: g.id, workId: g.workId, canonical: g.canonical, status: g.status, variants: g.variants.join(', '), replacement: g.replacement ?? '', note: g.note ?? '' });
  const { status } = useAutosave(
    d,
    (v: Draft) =>
      saveGlossary({
        id: v.id,
        workId: v.workId,
        canonical: v.canonical.trim(),
        status: v.status,
        variants: parseList(v.variants),
        ...(v.replacement.trim() ? { replacement: v.replacement.trim() } : {}),
        ...(v.note.trim() ? { note: v.note.trim() } : {}),
      }),
    { valid: d.canonical.trim().length > 0 },
  );
  const remove = async () => {
    if (await confirmDialog({ title: `용어 ‘${g.canonical}’ 지우기`, message: '되돌릴 수 없어요.', confirmLabel: '지우기', danger: true })) await deleteGlossary(g.id);
  };
  return (
    <tr className="border-b border-stone-100 align-top">
      <td className="px-3 py-1.5"><Input aria-label="정식 표기" className="!py-1" value={d.canonical} onChange={(e) => setD({ ...d, canonical: e.target.value })} /></td>
      <td className="px-2 py-1.5">
        <Select aria-label="상태" className="!py-1" value={d.status} onChange={(e) => setD({ ...d, status: e.target.value as Draft['status'] })}>
          <option value="사용">사용</option>
          <option value="금지">금지</option>
        </Select>
      </td>
      <td className="px-2 py-1.5"><Input aria-label="변형 표기" className="!py-1" value={d.variants} onChange={(e) => setD({ ...d, variants: e.target.value })} /></td>
      <td className="px-2 py-1.5"><Input aria-label="대체어" className="!py-1" disabled={d.status !== '금지'} value={d.replacement} onChange={(e) => setD({ ...d, replacement: e.target.value })} /></td>
      <td className="px-2 py-1.5"><Input aria-label="메모" className="!py-1" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></td>
      <td className="px-2 py-1.5 whitespace-nowrap">
        <SaveStatus status={status} />
        <Button size="sm" variant="ghost" onClick={remove}>지우기</Button>
      </td>
    </tr>
  );
}
