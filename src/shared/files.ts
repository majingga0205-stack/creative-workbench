import { decodeText, type DecodedText } from '../core/io/decodeText';
import { toast } from './dialogs';

// ── 파일 저장 ──
// 내 컴퓨터에서 실행하면 브라우저 다운로드로 저장한다.
// claude.ai 링크(아티팩트)로 열면 페이지가 직접 내려받을 수 없어서, 화면 쪽 '파일 저장' 기능(downloads)에 맡긴다.
// 이때는 저장 확인 창이 뜨고, 사용자가 취소할 수 있다.

export type SaveResult = { ok: true } | { ok: false; reason: 'declined' | 'unavailable' | 'error'; message: string };

type DownloadsApi = { save(req: { filename: string; data: string | Blob }): Promise<unknown> };
type ClaudeHost = { use(name: string): Promise<unknown> };

function claudeHost(): ClaudeHost | undefined {
  const c = (globalThis as { claude?: { use?: unknown } }).claude;
  return c && typeof c.use === 'function' ? (c as ClaudeHost) : undefined;
}

/** claude.ai 링크(아티팩트)로 열었는지. 이때는 인쇄·직접 다운로드가 안 된다. */
export function inArtifactView(): boolean {
  return claudeHost() !== undefined;
}

let downloadsApi: Promise<DownloadsApi | null> | undefined;
function getDownloads(host: ClaudeHost): Promise<DownloadsApi | null> {
  downloadsApi ??= host
    .use('downloads')
    .then((d) => (d as DownloadsApi | null) ?? null)
    .catch(() => null);
  return downloadsApi;
}

function anchorDownload(fileName: string, data: string | Blob, mime: string) {
  const blob = typeof data === 'string' ? new Blob([data], { type: `${mime};charset=utf-8` }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function failure(code: string | undefined): SaveResult {
  switch (code) {
    case 'declined':
      return { ok: false, reason: 'declined', message: '파일 저장을 취소했어요' };
    case 'rate_limited':
      return { ok: false, reason: 'error', message: '저장 확인 창이 이미 떠 있거나 너무 자주 저장했어요. 잠시 뒤 다시 해 보세요' };
    case 'too_large':
      return { ok: false, reason: 'error', message: '파일이 너무 커서 저장하지 못했어요' };
    case 'host_unavailable':
      return { ok: false, reason: 'unavailable', message: '이 앱에서는 파일을 저장할 수 없어요. 브라우저나 컴퓨터에서 열어 주세요' };
    case 'bad_request':
    case 'rejected_extension':
    case 'transform_error':
      return { ok: false, reason: 'error', message: `파일을 저장하지 못했어요 (${code})` };
    default:
      return { ok: false, reason: 'unavailable', message: '이 화면에서는 파일 저장을 쓸 수 없어요' };
  }
}

/** 파일 하나를 저장한다. 저장했으면 ok: true (내 컴퓨터 실행에서는 다운로드를 시작하면 저장한 것으로 본다) */
export async function saveFile(fileName: string, data: string | Blob, mime = 'application/json'): Promise<SaveResult> {
  const host = claudeHost();
  if (!host) {
    try {
      anchorDownload(fileName, data, mime);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: 'error', message: `파일을 저장하지 못했어요: ${(e as Error).message}` };
    }
  }
  const downloads = await getDownloads(host);
  if (!downloads) return failure('unavailable');
  try {
    await downloads.save({ filename: fileName, data });
    return { ok: true };
  } catch (e) {
    return failure((e as { code?: string } | undefined)?.code);
  }
}

/** 저장하고 결과를 알림으로 보여준다. 취소는 오류가 아니라 안내로 */
export async function saveFileWithToast(fileName: string, data: string | Blob, okText: string, mime?: string): Promise<boolean> {
  const r = await saveFile(fileName, data, mime);
  if (r.ok) toast(okText);
  else toast(r.message, r.reason === 'declined' ? 'info' : 'error');
  return r.ok;
}

/** data: URL(그림)을 Blob으로 */
export function dataUrlToBlob(url: string): Blob {
  const comma = url.indexOf(',');
  const head = url.slice(0, comma);
  const body = url.slice(comma + 1);
  const mime = /^data:([^;,]+)/.exec(head)?.[1] ?? 'application/octet-stream';
  if (!head.includes(';base64')) return new Blob([decodeURIComponent(body)], { type: mime });
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// ── 파일 읽기 ──

export async function readTextFile(file: File): Promise<DecodedText & { name: string }> {
  const buf = await file.arrayBuffer();
  return { ...decodeText(buf), name: file.name };
}

export const ENCODING_LABEL: Record<DecodedText['encoding'], string> = {
  'utf-8': 'UTF-8',
  'utf-16le': 'UTF-16',
  'utf-16be': 'UTF-16',
  'euc-kr': 'EUC-KR',
};
