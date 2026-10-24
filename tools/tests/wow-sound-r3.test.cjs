// wow-sound round 3 (Oct 24 2026): beat haptics that never wait, ducks without a polling timer,
// the Battery Saver bed rest, the trace switch toggle and the HUD frame window.
// Everything runs on the silent TraceBackend on a virtual clock. Nothing here can make a sound.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { traceEngine } = require('./helpers/studio-trace-harness.cjs');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const flush = () => new Promise((r) => setImmediate(r));

test('beat haptics fire in the same call, never behind the 120 ms gate, and keep the gate for everyone else', () => {
  const e = traceEngine();
  const t0 = e.clock.now;
  e.Haptics.queueHaptic('tapLight', 1); // a map press buzz
  e.Haptics.beatHaptic('tapLight'); // the catch tap, 0 ms later
  e.clock.advance(5);
  e.Haptics.queueHaptic('tickSelection', 0); // anyone else right after the beat waits for the window
  e.clock.advance(300);
  const at = e.haptics.map((h) => [h.t - t0, h.intent]);
  assert.deepEqual(at.slice(0, 2), [[0, 'tapLight'], [0, 'tapLight']], 'the beat is not held 120 ms behind the press');
  assert.equal(at[2][0], 120, 'the gate restarts from the beat');
});

test('beatHaptic drops a weaker pulse waiting for the window (the beat replaced it)', () => {
  const e = traceEngine();
  const t0 = e.clock.now;
  e.Haptics.queueHaptic('tapLight', 1);
  e.Haptics.queueHaptic('tickSelection', 0); // waits
  e.Haptics.beatHaptic('comboHeavy');
  e.clock.advance(400);
  assert.deepEqual(e.haptics.map((h) => [h.t - t0, h.intent]), [[0, 'tapLight'], [0, 'comboHeavy']]);
});

test('catch haptics: inside the beat window they never wait; outside it they use the gate as before (switch off too)', () => {
  const e = traceEngine({ trace: false });
  e.Catch.resetCatchSoundForTests();
  const t0 = e.clock.now;
  e.Haptics.queueHaptic('tapLight', 1);
  e.Catch.catchMark('tap');
  e.Catch.catchHaptic('tapLight', 3);
  e.clock.advance(200);
  e.Catch.catchHaptic('tickSelection', 2);
  e.clock.advance(2000);
  e.Haptics.queueHaptic('tapLight', 1);
  e.Catch.catchHaptic('success', 4); // the land, long after the beats: gated
  e.clock.advance(300);
  const at = e.haptics.map((h) => h.t - t0);
  assert.deepEqual(at.slice(0, 3), [0, 0, 200], 'tap and wobble on their beats');
  assert.equal(at[4] - at[3], 120, 'after the window the shared gate is back');
});

test('duckSegment: one straight piece at a time, the hold is flat, the deepest duck wins', () => {
  const mix = loadTs('src/gamekit/core/audioMix.ts');
  const d = { start: 1000, db: 6, a: 60, h: 400, r: 400 };
  const depth = Math.pow(10, -6 / 20);
  const s0 = mix.duckSegment([d], 1000);
  assert.equal(s0.nextAt, 1060);
  assert.ok(Math.abs(s0.target - depth) < 1e-9 && s0.rampMs === 60, 'attack');
  const s1 = mix.duckSegment([d], 1060);
  assert.ok(Math.abs(s1.target - s1.gain) < 1e-9 && s1.nextAt === 1460, 'hold: flat');
  const s2 = mix.duckSegment([d], 1460);
  assert.ok(s2.target === 1 && s2.rampMs === 400 && s2.nextAt === 1860, 'release');
  assert.equal(mix.duckSegment([d], 1860).nextAt, null, 'over');
  const deep = { start: 1100, db: 12, a: 60, h: 100, r: 100 };
  assert.ok(mix.duckSegment([d, deep], 1160).target < depth, 'a deeper duck on top wins');
});

test('a duck costs a few gain ramps, not a 30 ms polling timer', async () => {
  const e = traceEngine();
  await e.GameAudio.init();
  await e.GameAudio.music.play('chris.track1', 0);
  await flush();
  e.Trace.clearTrace();
  const t0 = e.clock.now;
  e.GameAudio.duck(6, 60, 400, 400);
  let timers = 0;
  for (let t = 0; t < 1000; t += 5) { if (e.clock.nextAt() <= e.clock.now + 5) timers++; e.clock.advance(5); }
  const gains = e.Trace.traceEvents().filter((x) => x.kind === 'music' && x.name.startsWith('gain') && x.t >= t0);
  assert.ok(gains.length >= 2 && gains.length <= 3, `attack and release (the hold costs nothing): ${gains.length} gain ramps`);
  assert.match(gains[0].detail, /over 60 ms/);
  const g = (x) => Number(x.detail.split(' ')[0]);
  assert.match(gains[gains.length - 1].detail, /over 400 ms/, 'the release is one 400 ms ramp');
  assert.ok(g(gains[gains.length - 1]) > g(gains[0]) * 1.9, 'back up by 6 dB');
  assert.ok(timers <= 4, `about one timer per envelope piece (${timers})`);
  assert.doesNotMatch(read('src/gamekit/audio/GameAudio.ts'), /duckTimer = setInterval/);
});

test('useGameMusic: Battery Saver plus 2 idle minutes rests the bed and resumes only a bed it paused', () => {
  const src = read('src/gamekit/audio/useGameMusic.ts');
  assert.match(src, /const rest = power\.lowPower && power\.idle;/);
  assert.match(src, /if \(GameAudio\.music\.playing\) \{\s+restPaused\.current = true;\s+void GameAudio\.music\.pause\(400\);/);
  assert.match(src, /\} else if \(restPaused\.current\) \{\s+restPaused\.current = false;\s+void GameAudio\.music\.resume\(300\);/);
  // Walking keeps the music, 3 dB lower, and the background fade is the shell's hold (already shipped).
  assert.match(read('src/gamekit/GameShellV2.tsx'), /GameAudio\.music\.setTrimDb\(moving \? -3 : 0, 300\)/);
  assert.match(read('src/gamekit/GameShellV2.tsx'), /void GameAudio\.music\.pause\(300\)/);
});

test('trace captures can flip the switch off to trace what today plays on the same catch', async () => {
  const e = traceEngine();
  e.Catch.resetCatchSoundForTests();
  assert.equal(e.Switch.isStudioSoundOn(), true);
  e.Switch.setStudioSoundOverride(false);
  assert.equal(e.Switch.isStudioSoundOn(), false);
  e.Trace.clearTrace();
  e.Catch.catchMark('tap');
  e.Catch.catchMark('burst');
  assert.equal(e.Trace.traceEvents().filter((x) => x.kind === 'moment').length, 0, 'no studio moment with the switch off');
  e.Switch.setStudioSoundOverride(null);
  assert.equal(e.Switch.isStudioSoundOn(), true);
  assert.match(read('src/gamekit/audio/studioSwitch.ts'), /setSwitch: \(on: boolean \| null\) =>/);
});

test('HUD frame window: p5 fps is the 95th percentile frame time', () => {
  const src = read('src/gamekit/audio/StudioTraceHud.tsx');
  const fn = src.slice(src.indexOf('export function perfWindow'), src.indexOf('\n}\n', src.indexOf('export function perfWindow')) + 2)
    .replace(/^export /, '').replace(/: \{[^}]*\} \{/, ' {').replace(/\(list: readonly number\[\] = frames\)/, '(list)');
  // eslint-disable-next-line no-new-func
  const perfWindow = new Function(`${fn}; return perfWindow;`)();
  const frames = [...Array(95).fill(16.7), ...Array(5).fill(33.4)];
  const w = perfWindow(frames);
  assert.equal(w.frames, 100);
  assert.ok(w.fpsP5 >= 29 && w.fpsP5 <= 31, `p5 ${w.fpsP5}`);
  assert.equal(w.jankPct, 5);
  assert.equal(perfWindow(Array(60).fill(16.7)).fpsP5, 59.9);
});

test('Core Haptics: a binary with the TpsCoreHaptics module turns the shaped patterns on with no JS change', () => {
  const stubs = { 'expo-haptics': new Proxy({}, { get: (_t, k) => (typeof k === 'string' && /Async$/.test(k) ? async () => undefined : {}) }) };
  const without = loadTs('src/gamekit/Haptics.ts', stubs, {});
  assert.equal(without.hasNativeHaptics(), false, 'no module in this binary: expo-haptics fallbacks');
  const played = [];
  const expo = { modules: { TpsCoreHaptics: { isSupported: () => true, playPattern: (json, delay) => played.push({ ahap: JSON.parse(json), delay }) } } };
  const withMod = loadTs('src/gamekit/Haptics.ts', stubs, { expo });
  // vm contexts expose their globals on globalThis; the module looks for globalThis.expo.modules.TpsCoreHaptics.
  assert.equal(withMod.hasNativeHaptics(), true, 'the module registers itself on first use');
  assert.equal(withMod.playPattern('momentCatch'), true);
  assert.equal(played.length, 1, 'the catch pattern went to Core Haptics');
  assert.equal(played[0].ahap.Pattern[0].Event.Time, 0, 'the burst is t = 0');
  const off = loadTs('src/gamekit/Haptics.ts', stubs, { expo: { modules: { TpsCoreHaptics: { isSupported: () => false, playPattern: () => { throw new Error('never'); } } } } });
  assert.equal(off.hasNativeHaptics(), false, 'a phone without Core Haptics keeps the fallbacks');
  for (const name of ['momentCatch', 'momentCatchGather', 'momentComboTier', 'momentFeverStart', 'momentStreakIgnite', 'momentChestOpen', 'momentParkArrival']) {
    const ahap = JSON.parse(read(`assets/haptics/${name}.ahap`));
    assert.ok(Array.isArray(ahap.Pattern) && ahap.Pattern.length > 0, `${name}.ahap is a playable pattern`);
  }
});
