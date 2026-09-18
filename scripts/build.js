#!/usr/bin/env node
/**
 * 빌드 = src/ 를 dist/ 로 복사하면서
 *   ① 환경변수를 config.js 에 주입하고
 *   ② 모든 에셋 URL에 내용 기반 버전(?v=해시)을 붙인다.
 *
 * ②가 없으면 브라우저가 옛 JS를 캐시한 채 새 HTML을 받아
 * "새 HTML + 옛 JS" 조합으로 화면이 죽는다. 실제로 한 번 당했다.
 * 해시는 내용에서 나오므로, 코드가 바뀌면 URL이 바뀌고 캐시는 자동으로 무효화된다.
 *
 *   로컬:    .env 파일에서 읽음
 *   Netlify: 사이트 환경변수에서 읽음 (process.env)
 */
import {
  readFileSync, writeFileSync, mkdirSync, readdirSync,
  copyFileSync, rmSync, statSync, existsSync,
} from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

/** .env 를 읽어 process.env 에 없는 값만 채웁니다. */
function loadDotenv() {
  const p = join(ROOT, '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from)) {
    const s = join(from, entry);
    const d = join(to, entry);
    if (statSync(s).isDirectory()) copyDir(s, d);
    else if (entry !== 'config.template.js') copyFileSync(s, d);
  }
}

function listFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) listFiles(p, out);
    else out.push(p);
  }
  return out;
}

loadDotenv();
rmSync(DIST, { recursive: true, force: true });
copyDir(SRC, DIST);

// ── ① 환경변수 주입 ──────────────────────────────────────────────────────
const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_ANON_KEY ?? '';

writeFileSync(
  join(DIST, 'config.js'),
  readFileSync(join(SRC, 'config.template.js'), 'utf8')
    .replace('%%SUPABASE_URL%%', url)
    .replace('%%SUPABASE_ANON_KEY%%', key)
);

// ── ② 내용 기반 버전 붙이기 ──────────────────────────────────────────────
const assets = listFiles(DIST).filter((f) => ['.js', '.css'].includes(extname(f)));

const hash = createHash('sha256');
for (const f of assets.sort()) hash.update(readFileSync(f));
const V = hash.digest('hex').slice(0, 10);

// HTML 안의 <script src> / <link href>
for (const f of listFiles(DIST).filter((f) => extname(f) === '.html')) {
  const out = readFileSync(f, 'utf8')
    .replace(/(<script[^>]+src=")([^"?]+\.js)(")/g, `$1$2?v=${V}$3`)
    .replace(/(<link[^>]+href=")([^"?:]+\.css)(")/g, `$1$2?v=${V}$3`);
  writeFileSync(f, out);
}

// JS 안의 import 경로 — 이걸 빼먹으면 엔트리만 새로 받고 모듈은 옛 것을 쓴다.
for (const f of assets.filter((f) => extname(f) === '.js')) {
  const out = readFileSync(f, 'utf8')
    .replace(/(from\s+['"])(\.\/[^'"?]+\.js)(['"])/g, `$1$2?v=${V}$3`)
    .replace(/(import\(\s*['"])(\.\/[^'"?]+\.js)(['"])/g, `$1$2?v=${V}$3`);
  writeFileSync(f, out);
}

if (url && key) {
  console.log(`✓ Supabase 연결됨 → ${url}`);
} else {
  console.warn('⚠ SUPABASE_URL / SUPABASE_ANON_KEY 가 없습니다.');
  console.warn('  계산기는 정상 동작하지만 결과 저장·상담 신청은 비활성화됩니다.');
  console.warn('  Netlify → Site settings → Environment variables 에서 설정하세요.');
}
console.log(`✓ 에셋 버전 v=${V} (${assets.length}개 파일)`);
console.log('✓ 빌드 완료 → dist/');
