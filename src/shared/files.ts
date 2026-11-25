import { decodeText, type DecodedText } from '../core/io/decodeText';

export function downloadText(fileName: string, text: string, mime = 'application/json') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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
