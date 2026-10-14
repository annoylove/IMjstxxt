/**
 * 语法检查脚本：对 src 与 test 下所有 .js/.mjs 文件执行 node --check
 * 用法: npm run lint
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const DIRS = ['src', 'test'];
const files = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|mjs)$/.test(e)) files.push(p);
  }
}

for (const d of DIRS) walk(path.join(ROOT, d));

let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (err) {
    failed++;
    console.error(`✗ ${path.relative(ROOT, f)}`);
    console.error(String(err.stderr || err.message).trim());
  }
}

console.log(`checked ${files.length} files, ${failed} failed`);
process.exit(failed ? 1 : 0);
