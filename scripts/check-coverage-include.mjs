// scripts/check-coverage-include.mjs
// BL-34 (R5): every source file added to src/utils, src/api or src/components must
// be listed in coverage.include (vitest.config.ts). Legacy files that existed before
// the gate are grandfathered via scripts/coverage-include-legacy.txt.
//
// Exit 0 = OK, exit 1 = a new file is missing from coverage.include.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CONFIG = path.join(ROOT, 'vitest.config.ts');
const LEGACY = path.join(ROOT, 'scripts', 'coverage-include-legacy.txt');
const DIRS = ['src/utils', 'src/api', 'src/components'];
const EXTS = new Set(['.ts', '.tsx']);

function parseCoverageInclude(text) {
  const incMatch = text.match(/include:\s*\[\n([\s\S]*?)\]/);
  if (!incMatch) throw new Error('coverage.include not found');
  const entries = [];
  for (const m of incMatch[1].matchAll(/'([^']+)'/g)) entries.push(m[1]);
  return new Set(entries);
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (EXTS.has(path.extname(e.name))) out.push(full.replace(/\\/g, '/'));
  }
  return out;
}

const configText = fs.readFileSync(CONFIG, 'utf8');
const included = parseCoverageInclude(configText);

const legacy = new Set();
if (fs.existsSync(LEGACY)) {
  for (const line of fs.readFileSync(LEGACY, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (t && !t.startsWith('#')) legacy.add(t.replace(/\\/g, '/'));
  }
}

const offenders = [];
for (const d of DIRS) {
  for (const f of walk(d)) {
    if (included.has(f)) continue;
    if (legacy.has(f)) continue;
    offenders.push(f);
  }
}

if (offenders.length) {
  console.error('::error::New files in src/utils|api|components are missing from coverage.include (BL-34 R5):');
  for (const f of offenders) console.error('  ' + f);
  console.error('');
  console.error('Add each file to coverage.include in vitest.config.ts, or (for legacy files) add to scripts/coverage-include-legacy.txt.');
  process.exit(1);
}

console.log('OK: all new files in src/utils|api|components are covered by coverage.include (' + DIRS.join(', ') + ')');
