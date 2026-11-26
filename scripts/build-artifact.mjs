// claude.ai 링크(아티팩트)로 올릴 묶음을 만든다.
//   node scripts/build-artifact.mjs [출력 폴더]   (기본: dist-artifact)
// 만드는 것:
//   - 상대 경로(base './')로 빌드한 assets/ (JS·CSS·Pretendard 글꼴)
//   - artifact.html: 아티팩트 페이지 조각 (doctype·html·head·body 없이 — 올릴 때 감싸진다)
//   - files.json: 함께 올릴 파일 목록 [{ path, contentType }]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'vite';

const outDir = process.argv[2] ?? 'dist-artifact';
await build({ base: './', logLevel: 'warn', build: { outDir, emptyOutDir: true } });

const html = readFileSync(join(outDir, 'index.html'), 'utf8');
const rel = (p) => p.replace(/^\.\//, '');
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)].map((m) => rel(m[1]));
const styles = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g)].map((m) => rel(m[1]));
if (scripts.length === 0) throw new Error('빌드 결과에서 스크립트를 찾지 못했어요');

const page = [
  '<title>창작 작업대</title>',
  '<style>:root{color-scheme:light}</style>',
  ...styles.map((h) => `<link rel="stylesheet" href="${h}">`),
  '<div id="root"></div>',
  ...scripts.map((s) => `<script type="module" src="${s}"></script>`),
  '',
].join('\n');
writeFileSync(join(outDir, 'artifact.html'), page);

const TYPES = { js: 'text/javascript', css: 'text/css', woff2: 'font/woff2', woff: 'font/woff', png: 'image/png', svg: 'image/svg+xml' };
const files = readdirSync(join(outDir, 'assets'))
  .sort()
  .map((f) => ({ path: `assets/${f}`, contentType: TYPES[f.split('.').pop()] ?? 'application/octet-stream' }));
if (files.length > 250) throw new Error(`올릴 파일이 너무 많아요: ${files.length}개`);
writeFileSync(join(outDir, 'files.json'), JSON.stringify(files, null, 2));
console.log(`아티팩트 묶음: ${outDir}/artifact.html + 파일 ${files.length}개`);
