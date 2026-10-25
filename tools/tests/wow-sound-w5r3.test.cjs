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

test('fix 4: the beam lands on its slam beat: buzz, star-slam sound and landing frame together, the heavy still on the burst 120 ms later', async () => {
  const { wowMapCatch } = require('../audio/wowmap-catch-beats.cjs');
  const e = traceEngine();
  e.Catch.resetCatchSoundForTests(); e.Loop.resetLoopSoundForTests(); e.Power.resetBatterySaver();
  await e.GameAudio.init();
  const r = await wowMapCatch(e, { n: 10 });
  const hs = e.haptics.filter((h) => h.t >= r.t0).map((h) => ({ t: h.t - r.clock0, intent: h.intent }));
  const slam = hs.find((h) => h.intent === 'hitRigid');
  const heavy = hs.find((h) => h.intent === 'comboHeavy');
  const lucky = e.Trace.traceEvents().find((x) => x.kind === 'sound' && x.t >= r.t0 && x.name.startsWith('moment:catch.lucky:primary'));
  const beamMark = r.delivered.find((d) => d.name === 'beam');
  assert.equal(beamMark.at, 550, 'the beam lands 50 ms before the held frame');
  assert.equal(slam.t, 550, 'the slam buzz on the landing frame');
  assert.ok(lucky.t - r.clock0 - 550 <= 20, `the slam sound leaves in the same turn (+${lucky.t - r.clock0 - 550} ms output)`);
  assert.equal(heavy.t, 670, 'the heavy on the burst frame');
  assert.equal(heavy.t - slam.t, 120);
  const mw = src('src/components/map/alive/mapWow.ts');
  const plan = src('src/gamekit/audio/catchSoundPlan.ts');
  assert.match(mw, /landLeadMs: 50/);
  assert.match(plan, /export const BEAM_SLAM_BUZZ_LEAD_MS = 50;/, 'the slam buzz lead and the beam landing lead stay equal');
});

test('fix 5: a mono file decoded to two identical channels is kept as one (half the cache and half of every voice), a stereo bed is kept as it is', () => {
  const { loadTs } = require('./helpers/ts-module.cjs');
  const B = loadTs('src/gamekit/audio/backends.ts', {
    'expo-av': { Audio: {} }, 'expo-asset': { Asset: {} }, 'expo-file-system': {},
    'react-native': { Platform: { OS: 'ios' } },
  });
  const made = [];
  const ctx = { createBuffer: (ch, len, sr) => { const data = Array.from({ length: ch }, () => new Float32Array(len)); const b = { numberOfChannels: ch, length: len, sampleRate: sr, data,
    getChannelData: (c) => data[c], copyToChannel: (src, c, at) => data[c].set(src.subarray(0, len - at), at) }; made.push(b); return b; } };
  const decoded = (l, r) => ({ numberOfChannels: 2, length: l.length, sampleRate: 48000, getChannelData: (c) => (c ? r : l) });
  const tone = Float32Array.from({ length: 4801 }, (_, i) => Math.sin(i / 7));
  const mono = B.dualMonoToMono(ctx, decoded(tone, Float32Array.from(tone)));
  assert.ok(mono, 'dual mono becomes mono');
  assert.equal(mono.numberOfChannels, 1);
  assert.equal(mono.length, tone.length);
  assert.deepEqual(Array.from(mono.data[0]), Array.from(tone), 'sample for sample the same sound');
  const wide = Float32Array.from(tone, (v, i) => (i % 5 ? v : -v));
  assert.equal(B.dualMonoToMono(ctx, decoded(tone, wide)), null, 'a real stereo file is kept');
  const lastOnly = Float32Array.from(tone); lastOnly[tone.length - 1] = 9;
  assert.equal(B.dualMonoToMono(ctx, decoded(tone, lastOnly)), null);
  assert.equal(B.dualMonoToMono(ctx, { numberOfChannels: 1, length: 3, getChannelData: () => tone }), null, 'already mono: nothing to do');
  assert.equal(B.dualMonoToMono({}, decoded(tone, tone)), null, 'no createBuffer: nothing changes');
  assert.equal(B.dualMonoToMono(ctx, { numberOfChannels: 2, length: 10, getChannelData: () => { throw new Error('gone'); } }), null, 'never throws');
  const src = fs.readFileSync(path.join(root, 'src/gamekit/audio/backends.ts'), 'utf8');
  assert.match(src, /const buffer = dualMonoToMono\(this\.ctx, decoded\) \?\? decoded;/);
});
