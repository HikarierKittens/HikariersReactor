#!/usr/bin/env node
/**
 * Test runner: discovers every `tests/**\/*.test.ts` file instead of a hand-maintained list.
 *
 * Why this exists: the previous `test` script enumerated 82 files by hand, so adding a test file
 * meant editing package.json (and forgetting it silently skipped the file). Discovery removes
 * that upkeep. It also supports running a subset, which is what agents want most of the time:
 *
 *   npm test                          # everything: all module tests + retained VM suites
 *   npm test -- save barracks         # only files whose path contains "save" or "barracks"
 *   npm test -- save --vm             # subset plus the retained VM suites
 *
 * Exit code is non-zero when any test fails, so `npm run check` keeps working.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TSX = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

/** Recursively collect test files so tests/fixtures/*.test.ts is included too. */
function collect(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full, acc);
    else if (entry.name.endsWith('.test.ts')) acc.push(path.relative(ROOT, full).replace(/\\/g, '/'));
  }
  return acc;
}

const args = process.argv.slice(2);
const withVm = args.includes('--vm');
const filters = args.filter(arg => !arg.startsWith('--'));

const all = collect(path.join(ROOT, 'tests')).sort();
const selected = filters.length ? all.filter(file => filters.some(filter => file.includes(filter))) : all;

if (!selected.length) {
  console.error(`No test file matches: ${filters.join(', ')}`);
  process.exit(1);
}

console.log(filters.length
  ? `Running ${selected.length}/${all.length} test files matching: ${filters.join(', ')}`
  : `Running all ${selected.length} test files.`);

const result = spawnSync(process.execPath, [TSX, '--test', ...selected], { stdio: 'inherit', cwd: ROOT });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);

// The VM regression suites drive the real game loop; a keyword run skips them for speed.
if (filters.length && !withVm) {
  console.log('Skipped retained VM suites (keyword run). Add --vm to include them.');
  process.exit(0);
}

const vm = spawnSync(process.execPath, [path.join(ROOT, 'tests', 'run.cjs')], { stdio: 'inherit', cwd: ROOT });
if (vm.error) throw vm.error;
process.exit(vm.status || 0);
