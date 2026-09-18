#!/usr/bin/env node
/**
 * 빌드 = src/ 를 dist/ 로 복사하면서 config.template.js 에 환경변수를 주입.
 * 번들러도 의존성도 없습니다.
 *
 *   로컬:   .env 파일에서 읽음
 *   Netlify: 사이트 환경변수에서 읽음 (process.env)
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, rmSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

loadDotenv();
rmSync(DIST, { recursive: true, force: true });
copyDir(SRC, DIST);

const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_ANON_KEY ?? '';

writeFileSync(
  join(DIST, 'config.js'),
  readFileSync(join(SRC, 'config.template.js'), 'utf8')
    .replace('%%SUPABASE_URL%%', url)
    .replace('%%SUPABASE_ANON_KEY%%', key)
);

if (url && key) {
  console.log(`✓ Supabase 연결됨 → ${url}`);
} else {
  console.warn('⚠ SUPABASE_URL / SUPABASE_ANON_KEY 가 없습니다.');
  console.warn('  계산기는 정상 동작하지만 결과 저장·상담 신청은 비활성화됩니다.');
  console.warn('  Netlify → Site settings → Environment variables 에서 설정하세요.');
}
console.log('✓ 빌드 완료 → dist/');
