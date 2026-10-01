const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = 'src/services/lineplay/partCountdown.ts';
const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(code, { module: moduleRef, exports: moduleRef.exports }, { filename: file });
const countdown = (...args) => JSON.parse(JSON.stringify(moduleRef.exports.partCountdown(...args)));

test('queue countdown moves smoothly but waits for a verified milestone', () => {
  const verifiedAt = 1_000_000;
  assert.deepEqual(countdown(590, verifiedAt, verifiedAt, 600), {
    progressSeconds: 590, remainingSeconds: 10, checking: false, estimated: true, needsCheck: false,
  });
  assert.deepEqual(countdown(590, verifiedAt, verifiedAt + 5_000, 600), {
    progressSeconds: 595, remainingSeconds: 5, checking: false, estimated: true, needsCheck: false,
  });
  assert.deepEqual(countdown(590, verifiedAt, verifiedAt + 11_000, 600), {
    progressSeconds: 600, remainingSeconds: 0, checking: true, estimated: true, needsCheck: false,
  });
  assert.deepEqual(countdown(600, verifiedAt + 30_000, verifiedAt + 30_000, 600), {
    progressSeconds: 0, remainingSeconds: 600, checking: false, estimated: true, needsCheck: false,
  });
});

test('the display stops predicting when nearby verification goes stale', () => {
  // Stale means past the server's 90 s credit gap, not one missed heartbeat.
  assert.deepEqual(countdown(500, 1_000_000, 1_091_000, 600), {
    progressSeconds: 500, remainingSeconds: 100, checking: false, estimated: false, needsCheck: true,
  });
  assert.deepEqual(countdown(590, null, 1_000_000, 600), {
    progressSeconds: 590, remainingSeconds: 10, checking: false, estimated: false, needsCheck: true,
  });
});

test('a guest standing still in line never flips to "Checking" between heartbeats', () => {
  // QA P2-1: every minute or so the countdown read "Checking you're in line…"
  // while the guest stood in line. Heartbeats verify every 30 s; one late or
  // missed beat must not stop the countdown.
  let verified = 0, verifiedAt = 0;
  for (let t = 0; t <= 300_000; t += 1_000) {
    if (t > 0 && t % 60_000 === 0) { verified += 60; verifiedAt = t; } // every other beat lands
    const c = countdown(verified, verifiedAt, t, 600);
    assert.equal(c.needsCheck, false, `still estimating at ${t / 1000}s`);
  }
  assert.equal(moduleRef.exports.PART_ESTIMATE_WINDOW_MS, 90_000, 'matches mobile.line_max_credit_gap_seconds');
});

test('a still guest requests a fresh fix on every heartbeat, and stillness never pauses play', () => {
  const hook = fs.readFileSync(path.join(root, 'src/services/lineplay/useLinePlaySession.ts'), 'utf8');
  const gap = Number(hook.match(/FRESH_FIX_MIN_GAP_MS = ([\d_]+)/)[1].replace(/_/g, ''));
  const beat = Number(hook.match(/QUEUE_HEARTBEAT_MS = ([\d_]+)/)[1].replace(/_/g, ''));
  assert.ok(gap < beat, 'the fresh-fix gate is shorter than the heartbeat');
  assert.match(hook, /< FRESH_FIX_MIN_GAP_MS\) return false/);
  const session = fs.readFileSync(path.join(root, 'src/services/lineplay/LinePlaySession.ts'), 'utf8');
  assert.match(session, /export type PauseReason = 'manual';/, 'only the guest pauses play');
});
