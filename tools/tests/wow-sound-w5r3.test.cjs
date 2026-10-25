// wow-sound wave 5 round 3 (Oct 24 2026): merged with the hotfix's engine contract (no engine until the player's
// settings are known, preload says whether it loaded anything). A preload that lands before the engine may start
// must not be remembered as done, or the day's first Daily 3 check, chest pop or catch decodes on first play and
// rings late. Real engine on the silent TraceBackend, virtual clock. Nothing here can make a sound.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { traceEngine } = require('./helpers/studio-trace-harness.cjs');

const root = path.resolve(__dirname, '../..');
const src = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
async function run(e, ms) { for (let i = 0; i < ms / 20; i++) { e.clock.advance(20); await flush(); } }
const starts = (e, t0, prefix) => e.Trace.traceEvents().filter((x) => x.kind === 'sound' && x.t >= t0 && x.name.startsWith(prefix)).map((x) => ({ t: x.t - t0, name: x.name }));

function heldEngine() {
  const e = traceEngine();
  e.Catch.resetCatchSoundForTests();
  e.Loop.resetLoopSoundForTests();
  e.Power.resetBatterySaver();
  // The app's launch state: the engine waits for the player's settings (SoundEffectProvider).
  e.GameAudio.holdUntilSettings();
  return e;
}

test('fix 2: a loop preload before the settings are in is not remembered; the next call once sound is on decodes for real', async () => {
  const e = heldEngine();
  e.Loop.preloadLoopMoments();
  await run(e, 200);
  assert.equal(e.GameAudio.wantsAudio(), false);
  e.GameAudio.settingsKnown();
  e.Loop.preloadLoopMoments();
  await run(e, 400);
  const t0 = e.clock.now;
  assert.equal(e.Loop.playDaily3(1), true);
  await run(e, 100);
  const s = starts(e, t0, 'moment:loop.daily3Check:primary')[0];
  assert.ok(s, 'the first check of the day rings');
  // Same start as a check preloaded the normal way (40 on this 20 ms virtual clock); a first-play decode starts at 60.
  assert.ok(s.t <= 40, `the first check starts like a preloaded one, not after a decode (${s.t})`);
  const decodes = e.Trace.traceEvents().filter((x) => x.t >= t0 && x.kind === 'legacy' && x.name === 'file');
  assert.equal(decodes.length, 0, 'nothing decodes on the first check');
});

test('fix 2: the same for the catch moments (catchAudio caches its preload the same way)', async () => {
  const e = heldEngine();
  const files = () => e.Trace.traceEvents().filter((x) => x.kind === 'legacy' && x.name === 'file' && /^moment:catch\./.test(x.detail ?? ''));
  await e.Catch.preloadCatchAudio();
  await run(e, 200);
  assert.equal(files().length, 0, 'nothing decodes while the engine waits for the settings');
  e.GameAudio.settingsKnown();
  await e.Catch.preloadCatchAudio();
  await run(e, 400);
  assert.ok(files().length > 0, 'the catch moments decode once sound can start');
});

test('fix 2: preloadMoments reports whether it loaded anything, and both callers drop their flag on false', () => {
  assert.match(src('src/gamekit/audio/playMoment.ts'), /export function preloadMoments\(names: readonly MomentName\[\]\): Promise<boolean> \{\s*if \(!isStudioSoundOn\(\) \|\| !GameAudio\.isSfxEnabled\(\)\) return Promise\.resolve\(false\);/);
  assert.match(src('src/gamekit/audio/loopSound.ts'), /preloadMoments\(LOOP_MOMENTS\)\.then\(\(ok\) => \{ if \(!ok\) preloaded = false; \}/);
  assert.match(src('src/screens/ExploreScreen/ridePhoto/catchAudio.ts'), /preloadMoments\(CATCH_MOMENTS\)\.then\(\(ok\) => \{ if \(!ok\) momentsReady = false; \}/);
  assert.match(src('src/gamekit/audio/GameAudio.ts'), /async preload\(names\?: string\[\]\): Promise<boolean> \{[\s\S]{0,300}if \(!this\.sfxEnabled\) return false;\s*await this\.init\(\);\s*if \(!this\.backend\) return false;/);
});
