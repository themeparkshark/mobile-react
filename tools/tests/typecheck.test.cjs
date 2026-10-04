'use strict';
// The guard tests are mostly regex checks: they pass on a merged file that does not compile
// (duplicate declarations after a hunk-only conflict resolution). This runs the compiler.
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '../..');
const tsc = path.join(root, 'node_modules/typescript/bin/tsc');

test('the app compiles: tsc --noEmit is clean', { timeout: 300_000 }, () => {
  assert.ok(fs.existsSync(tsc), 'typescript is installed (a missing compiler fails, it never skips)');
  const run = spawnSync(process.execPath, [tsc, '--noEmit', '-p', root], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, `tsc failed:\n${(run.stdout + run.stderr).split('\n').slice(0, 40).join('\n')}`);
});

test('Marker.tsx: one declaration of each hook binding, and it never returns null (a merge trap)', () => {
  const marker = fs.readFileSync(path.join(root, 'src/components/map/Marker.tsx'), 'utf8');
  for (const name of ['laidOut', 'setLaidOut', 'onLayout', 'last', 'tappable']) {
    const decls = marker.match(new RegExp(`\\b(const|let|var)\\s+(\\[[^\\]]*\\b${name}\\b|${name}\\b)`, 'g')) || [];
    assert.ok(decls.length <= 1, `${name} is declared ${decls.length} times`);
  }
  assert.doesNotMatch(marker, /return null/, 'a Marker never unmounts its MarkerView');
});
