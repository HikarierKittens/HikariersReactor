#!/usr/bin/env node
/**
 * Generate a real save fixture from a previous release, for save-compatibility regression tests.
 *
 * Hand-building these JSONs does not work: older releases ship an older `createInitialState`, so a
 * save synthesised from the current registry either gains fields the old release never writes or
 * misses fields its validator requires. The only reliable source is the old release itself, which
 * this script runs in a throwaway git worktree.
 *
 *   npm run fixtures:make -- <git-ref> <fixture-name> [--malformed <json-patch>]
 *
 * Examples:
 *   npm run fixtures:make -- beta-0.9.4 pre-beta-0.9.5-schema31
 *   npm run fixtures:make -- d6d5648 pre-beta-0.9.5-schema31-malformed \
 *     --malformed '{"hospitalProgress":5}'
 *
 * The worktree is created under tmp/ (gitignored) and removed afterwards; the fixture lands in
 * tests/fixtures/<name>.json. Register the fixture in a previous-release test before shipping.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, 'tmp');

function fail(message) {
  console.error(`fixtures:make: ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  return result;
}

const argv = process.argv.slice(2);
let malformedPatch = null;
const positional = [];
for (let index = 0; index < argv.length; index++) {
  if (argv[index] === '--malformed') {
    malformedPatch = argv[++index] ?? null;
    continue;
  }
  if (!argv[index].startsWith('--')) positional.push(argv[index]);
}

const [ref, name] = positional;
if (!ref || !name) {
  fail('usage: npm run fixtures:make -- <git-ref> <fixture-name> [--malformed <json-patch>]');
}
if (!/^[\w.-]+$/.test(name)) fail(`invalid fixture name "${name}"`);
if (malformedPatch !== null) {
  try { JSON.parse(malformedPatch); } catch { fail(`--malformed must be valid JSON, received: ${malformedPatch}`); }
}

const worktree = path.resolve(TMP, `fixture-${name}`);
// Guard every destructive step against a computed path escaping tmp/.
if (path.dirname(worktree) !== path.resolve(TMP)) fail(`refusing to use worktree path ${worktree}`);

fs.mkdirSync(TMP, { recursive: true });
if (fs.existsSync(worktree)) {
  console.log(`Removing leftover worktree ${path.relative(ROOT, worktree)}`);
  run('git', ['worktree', 'remove', '--force', worktree]);
}

console.log(`Checking out ${ref} into tmp/fixture-${name}`);
const added = run('git', ['worktree', 'add', '--detach', worktree, ref]);
if (added.status !== 0) fail(`git worktree add failed: ${added.stderr.trim()}`);

try {
  // The old tree has no node_modules; reuse the current one so tsx and its deps resolve.
  const link = path.join(worktree, 'node_modules');
  if (!fs.existsSync(link)) {
    if (process.platform === 'win32') run('cmd', ['/c', 'mklink', '/J', link, path.join(ROOT, 'node_modules')]);
    else fs.symlinkSync(path.join(ROOT, 'node_modules'), link, 'dir');
  }

  // Snapshot whatever that release considers a canonical state. Using its own modules is the
  // whole point: the JSON must reflect the old schema, not today's.
  const dump = path.join(worktree, 'dump-save.mjs');
  fs.writeFileSync(dump, `
    import { CONFIG } from './src/data/config.ts';
    import { createInitialState } from './src/state/create-state.ts';
    const state = createInitialState(CONFIG.version, 600, 0);
    process.stdout.write(JSON.stringify(state));
  `, 'utf8');

  const tsx = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const dumped = spawnSync(process.execPath, [tsx, dump], { cwd: worktree, encoding: 'utf8' });
  if (dumped.status !== 0) fail(`running the ${ref} build failed:\n${dumped.stderr.trim()}`);
  fs.rmSync(dump, { force: true });

  let save;
  try { save = JSON.parse(dumped.stdout); } catch { fail('the old build did not return valid JSON'); }

  if (malformedPatch !== null) Object.assign(save, JSON.parse(malformedPatch));

  const target = path.join(ROOT, 'tests', 'fixtures', `${name}.json`);
  fs.writeFileSync(target, JSON.stringify(save), 'utf8');
  console.log(`Wrote tests/fixtures/${name}.json (schema ${save.version}, ${JSON.stringify(save).length} bytes)`);
  console.log('Next: add a load/roundtrip/reject test that reads this fixture.');
} finally {
  run('git', ['worktree', 'remove', '--force', worktree]);
  run('git', ['worktree', 'prune']);
  // mklink /J creates a junction, not a directory git cleans; remove it if the worktree kept it.
  if (fs.existsSync(worktree)) fs.rmSync(worktree, { recursive: true, force: true });
}
