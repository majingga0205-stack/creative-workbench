import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { applyImport, countAll, planImport, type ImportMode } from '../../db/backup';
import { parseBackup, type Envelope, type ImportPlan, type ParseFail } from '../../db/backupFormat';
import { SCHEMA_VERSION } from '../../db/migrations';
import { readSetting, setSetting } from '../../db/meta';
import { SCOPE_LABELS, TABLE_DEFS, tablesForScope, type ExportScope } from '../../db/tables';
import { useSession } from '../../store/ui';
import { autoBackupToFile, exportToFile } from '../../shared/backupActions';
import { confirmDialog, toast } from '../../shared/dialogs';
import { requestPersist } from '../../shared/storagePersist';
import { useAutosave } from '../../shared/useAutosave';
import { SerialSettingsCard } from '../../modules/serial/SerialSettingsCard';
import { LintSettingsCard } from '../../modules/lint/LintSettingsCard';
import { NetworkSettingsCard } from '../../modules/network/NetworkSettingsCard';
import { BossSettingsCard } from '../../modules/boss/BossSettingsCard';
import { Badge, Button, Card, Field, Input, PageHeader, SaveStatus, Select, formatDateTime } from '../../shared/ui';

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="설정 · 백업" sub="데이터는 이 브라우저(IndexedDB)에만 저장돼요. 백업 파일을 따로 보관하세요." />
      <ExportCard />
      <ImportCard />
      <ReminderCard />
      <SerialSettingsCard />
      <LintSettingsCard />
      <NetworkSettingsCard />
      <BossSettingsCard />
      <StorageCard />
    </div>
  );
}

// ───────────────────────── 내보내기 ─────────────────────────

function ExportCard() {
  const works = useLiveQuery(async () => (await db.works.toArray()).sort((a, b) => a.title.localeCompare(b.title, 'ko')), []);
  const lastBackup = useLiveQuery(async () => (await db.meta.get('lastBackupAt'))?.value as string | undefined, []);
  const [scope, setScope] = useState<ExportScope>('all');
  const [workId, setWorkId] = useState('');
  const effectiveWorkId = workId || works?.[0]?.id || '';

  const available = (s: ExportScope) => tablesForScope(s).length > 0;
  const comingStage: Partial<Record<ExportScope, string>> = { lint: '4단계', myth: '6단계' };

  const run = async () => {
    try {
      const name = await exportToFile(scope, scope === 'work' ? effectiveWorkId : undefined);
      toast(`내보냈어요: ${name}`);
    } catch (e) {
      toast(`내보내지 못했어요: ${(e as Error).message}`, 'error');
    }
  };

  return (
    <Card title="내보내기" actions={<span className="text-xs text-stone-500">마지막 전체 백업: {formatDateTime(lastBackup)}</span>}>
      <fieldset className="space-y-2">
        <legend className="sr-only">내보낼 범위</legend>
        {(Object.keys(SCOPE_LABELS) as ExportScope[]).map((s) => (
          <label key={s} className={`flex items-center gap-2 text-sm ${available(s) ? '' : 'text-stone-400'}`}>
            <input type="radio" name="export-scope" value={s} checked={scope === s} disabled={!available(s)} onChange={() => setScope(s)} />
            {SCOPE_LABELS[s]}
            {!available(s) && <Badge>{comingStage[s]}에서 추가</Badge>}
            {s === 'all' && <span className="text-xs text-stone-500">— 모든 작품과 설정</span>}
          </label>
        ))}
      </fieldset>
      {scope === 'work' && (
        <div className="mt-3 max-w-xs">
          <Select aria-label="내보낼 작품" value={effectiveWorkId} onChange={(e) => setWorkId(e.target.value)}>
            {works?.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div className="mt-4">
        <Button variant="primary" onClick={run} disabled={scope === 'work' && !effectiveWorkId}>
          JSON 파일로 내보내기
        </Button>
      </div>
    </Card>
  );
}

// ───────────────────────── 불러오기 ─────────────────────────

type Loaded = { fileName: string; envelope: Envelope; migratedFrom?: number; plan: ImportPlan };

function ImportCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<(ParseFail & { fileName: string }) | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File) => {
    setError(null);
    setLoaded(null);
    const text = await file.text();
    const parsed = parseBackup(text);
    if (!parsed.ok) {
      setError({ ...parsed, fileName: file.name });
      return;
    }
    const plan = await planImport(parsed.envelope);
    setLoaded({ fileName: file.name, envelope: parsed.envelope, migratedFrom: parsed.migratedFrom, plan });
    setMode('merge');
  };

  const run = async () => {
    if (!loaded) return;
    const { envelope, plan } = loaded;
    const scopeText =
      envelope.scope === 'work' ? `작품 「${envelope.workTitle ?? ''}」` : `${SCOPE_LABELS[envelope.scope]} 범위`;
    const ok = await confirmDialog({
      title: mode === 'replace' ? '교체해서 불러올까요?' : '합쳐서 불러올까요?',
      message: (
        <>
          {mode === 'replace' ? (
            <p>
              이 기기의 {scopeText} 데이터 <b>{plan.totals.removeOnReplace}개</b>를 지우고 파일의 <b>{plan.totals.incoming}개</b>로
              바꿔요.
            </p>
          ) : (
            <p>
              추가 {plan.totals.add}개, 변경 {plan.totals.update}개를 반영하고, 충돌 {plan.totals.conflicts}개는 이 기기 것을 남겨요.
            </p>
          )}
          <p className="mt-2">실행 전에 현재 전체 데이터를 자동 백업 파일로 먼저 저장해요.</p>
        </>
      ),
      confirmLabel: '백업하고 불러오기',
      danger: mode === 'replace',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const backupName = await autoBackupToFile();
      const res = await applyImport(envelope, mode);
      toast(
        `불러왔어요: ${res.written}개 저장${res.removed ? `, ${res.removed}개 교체` : ''}${res.keptLocal ? `, 충돌 ${res.keptLocal}개는 이 기기 것 유지` : ''}. 자동 백업: ${backupName}`,
      );
      setLoaded(null);
    } catch (e) {
      toast(`불러오지 못했어요. 데이터는 바뀌지 않았어요: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="불러오기">
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        data-testid="import-file-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void onFile(f);
        }}
      />
      <div className="flex items-center gap-3">
        <Button onClick={() => fileRef.current?.click()}>백업 파일 고르기</Button>
        <span className="text-xs text-stone-500">파일을 고르면 먼저 검사하고 미리보기를 보여줘요. 아직 아무것도 바뀌지 않아요.</span>
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">
            {error.fileName}: {error.error}
          </p>
          {error.details.length > 0 && (
            <ul className="mt-2 max-h-48 list-disc space-y-0.5 overflow-auto pl-5 text-xs">
              {error.details.slice(0, 50).map((d, i) => (
                <li key={i}>{d}</li>
              ))}
              {error.details.length > 50 && <li>…외 {error.details.length - 50}개</li>}
            </ul>
          )}
        </div>
      )}

      {loaded && <ImportPreview loaded={loaded} mode={mode} setMode={setMode} onRun={run} onCancel={() => setLoaded(null)} busy={busy} />}
    </Card>
  );
}

function ImportPreview({
  loaded,
  mode,
  setMode,
  onRun,
  onCancel,
  busy,
}: {
  loaded: Loaded;
  mode: ImportMode;
  setMode: (m: ImportMode) => void;
  onRun: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const { envelope, plan } = loaded;
  const conflicts = plan.tables.flatMap((t) => t.conflicts);
  const updates = plan.tables.flatMap((t) => t.update);
  return (
    <div className="mt-4 space-y-4" data-testid="import-preview">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-stone-600">
        <span>파일: {loaded.fileName}</span>
        <span>
          범위: {SCOPE_LABELS[envelope.scope]}
          {envelope.scope === 'work' && ` (「${envelope.workTitle ?? ''}」)`}
        </span>
        <span>내보낸 때: {formatDateTime(envelope.exportedAt)}</span>
        <span>
          데이터 구조 v{envelope.schemaVersion}
          {loaded.migratedFrom !== undefined && <Badge tone="amber">v{loaded.migratedFrom} 파일을 변환함</Badge>}
        </span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
            <th className="py-1.5 font-medium">종류</th>
            <th className="py-1.5 text-right font-medium">추가</th>
            <th className="py-1.5 text-right font-medium">변경</th>
            <th className="py-1.5 text-right font-medium">충돌</th>
            <th className="py-1.5 text-right font-medium">같음</th>
            <th className="py-1.5 text-right font-medium">교체 시 지움 → 들어옴</th>
          </tr>
        </thead>
        <tbody>
          {plan.tables.map((t) => (
            <tr key={t.table} className="border-b border-stone-100">
              <td className="py-1.5">{t.label}</td>
              <td className="py-1.5 text-right tabular-nums">{t.add.length}</td>
              <td className="py-1.5 text-right tabular-nums">{t.update.length}</td>
              <td className={`py-1.5 text-right tabular-nums ${t.conflicts.length ? 'font-semibold text-amber-700' : ''}`}>
                {t.conflicts.length}
              </td>
              <td className="py-1.5 text-right tabular-nums text-stone-500">{t.unchanged}</td>
              <td className="py-1.5 text-right tabular-nums text-stone-500">
                {t.removeOnReplace} → {t.incomingCount}
              </td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-1.5">합계</td>
            <td className="py-1.5 text-right tabular-nums" data-testid="total-add">
              {plan.totals.add}
            </td>
            <td className="py-1.5 text-right tabular-nums">{plan.totals.update}</td>
            <td className="py-1.5 text-right tabular-nums">{plan.totals.conflicts}</td>
            <td className="py-1.5 text-right tabular-nums">{plan.totals.unchanged}</td>
            <td className="py-1.5 text-right tabular-nums">
              {plan.totals.removeOnReplace} → {plan.totals.incoming}
            </td>
          </tr>
        </tbody>
      </table>

      {conflicts.length > 0 && (
        <details open className="rounded-md border border-amber-200 bg-amber-50/60 p-3 text-sm">
          <summary className="cursor-pointer font-medium text-amber-900">충돌 {conflicts.length}개 — 합치기에서는 이 기기 것을 남겨요</summary>
          <ul className="mt-2 space-y-1 text-[13px]">
            {conflicts.map((c, i) => (
              <li key={i}>
                <b>{c.label}</b> · 이 기기 {formatDateTime(String(c.local.updatedAt))} / 파일 {formatDateTime(String(c.incoming.updatedAt))}
                <span className="text-stone-500"> — {c.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {updates.length > 0 && (
        <details className="rounded-md border border-stone-200 p-3 text-sm">
          <summary className="cursor-pointer font-medium">파일 쪽이 더 최근이라 바뀌는 것 {updates.length}개</summary>
          <ul className="mt-2 space-y-1 text-[13px]">
            {updates.map((u, i) => (
              <li key={i}>
                <b>{u.label}</b> · 이 기기 {formatDateTime(String(u.local.updatedAt))} → 파일 {formatDateTime(String(u.incoming.updatedAt))}
              </li>
            ))}
          </ul>
        </details>
      )}

      <fieldset className="space-y-2">
        <legend className="mb-1 text-[13px] font-medium text-stone-600">불러오는 방식</legend>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="import-mode" checked={mode === 'merge'} onChange={() => setMode('merge')} className="mt-1" />
          <span>
            <b>합치기</b> — 이 기기 데이터를 남기고, 같은 항목은 수정 시각이 더 최근인 쪽을 써요.
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="import-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} className="mt-1" />
          <span>
            <b>교체</b> — 이 기기의 {envelope.scope === 'work' ? '그 작품' : SCOPE_LABELS[envelope.scope]} 데이터를 지우고 파일 내용으로 바꿔요.
          </span>
        </label>
      </fieldset>

      <div className="flex gap-2">
        <Button variant={mode === 'replace' ? 'danger' : 'primary'} onClick={onRun} disabled={busy}>
          {busy ? '불러오는 중…' : mode === 'replace' ? '교체해서 불러오기' : '합쳐서 불러오기'}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          취소
        </Button>
      </div>
    </div>
  );
}

// ───────────────────────── 백업 알림 · 저장소 ─────────────────────────

function ReminderCard() {
  const settings = useLiveQuery(() => db.settings.toArray(), []);
  if (!settings) return null;
  return <ReminderForm initial={readSetting(settings, 'backupReminderDays')} />;
}

function ReminderForm({ initial }: { initial: number }) {
  const [days, setDays] = useState(String(initial));
  const n = Number(days);
  const valid = Number.isInteger(n) && n >= 1 && n <= 365;
  const { status } = useAutosave(days, (d) => setSetting('backupReminderDays', Number(d)), { valid });
  return (
    <Card title="백업 알림" actions={<SaveStatus status={status} />}>
      <div className="max-w-xs">
        <Field label="마지막 전체 백업 후 며칠이 지나면 알릴까요?" error={valid ? undefined : '1~365 사이 정수로 적어 주세요'}>
          <Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
      </div>
    </Card>
  );
}

function StorageCard() {
  const persist = useSession((s) => s.persistStatus);
  const [usage, setUsage] = useState<{ usage?: number; quota?: number } | null>(null);
  const counts = useLiveQuery(() => countAll(), []);
  useEffect(() => {
    navigator.storage?.estimate?.().then(setUsage).catch(() => setUsage(null));
  }, [counts]);

  const mb = (b?: number) => (b === undefined ? '?' : `${(b / 1024 / 1024).toFixed(1)}MB`);

  return (
    <Card title="저장소">
      <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
        <dt className="text-stone-500">저장소 보호</dt>
        <dd className="flex items-center gap-2">
          {persist === 'granted' && <Badge tone="teal">켜짐</Badge>}
          {persist === 'denied' && (
            <>
              <Badge tone="amber">꺼짐</Badge>
              <span className="text-xs text-stone-500">브라우저가 공간이 부족할 때 데이터를 지울 수 있어요. 백업을 자주 해 두세요.</span>
              <Button size="sm" onClick={() => void requestPersist()}>
                다시 요청
              </Button>
            </>
          )}
          {persist === 'unsupported' && <Badge>이 브라우저는 지원하지 않음</Badge>}
          {persist === 'unknown' && <span className="text-stone-400">확인 중</span>}
        </dd>
        <dt className="text-stone-500">사용량</dt>
        <dd>
          {mb(usage?.usage)} / {mb(usage?.quota)}
        </dd>
        <dt className="text-stone-500">데이터 구조</dt>
        <dd>v{SCHEMA_VERSION}</dd>
        <dt className="text-stone-500">레코드 수</dt>
        <dd>{counts ? TABLE_DEFS.map((d) => `${d.label} ${counts[d.name] ?? 0}`).join(' · ') : '…'}</dd>
      </dl>
    </Card>
  );
}
