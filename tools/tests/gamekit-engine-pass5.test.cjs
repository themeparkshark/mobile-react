'use strict';
/**
 * Studio engine pass 5: on twos and line boil, particle twos, fly-to-score and
 * digit roll, camera presets (linear decay, no cap), the Whack flash governor
 * (merge), haptic tail cuts, explicit expo fallbacks, Trivia haptic
 * signatures, mesh sprites (tail wave, head-row follow-through caps, spine
 * chain), gyro parallax, audio routes and the speaker policy, beat layers and
 * their look-ahead player, route-gated pan, the unified shell props, and the
 * upstreamed engine fixes (no AudioParam automation, kill() above claim()).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');

const root = path.resolve(__dirname, '../..');
const twos = loadTs('src/gamekit/core/twos.ts');
const particles = loadTs('src/gamekit/core/particles.ts');
const scoreFx = loadTs('src/gamekit/core/scoreFx.ts');
const camera = loadTs('src/gamekit/core/camera.ts');
const gov = loadTs('src/gamekit/core/fxGovernor.ts');
const bus = loadTs('src/gamekit/core/hapticBus.ts');
const pat = loadTs('src/gamekit/core/hapticPattern.ts');
const grammar = loadTs('src/gamekit/core/hapticGrammar.ts');
const mesh = loadTs('src/gamekit/core/mesh.ts');
const parallax = loadTs('src/gamekit/core/parallax.ts');
const route = loadTs('src/gamekit/core/audioRoute.ts');
const layers = loadTs('src/gamekit/core/beatLayers.ts');
const session = loadTs('src/gamekit/core/session.ts');
const scoring = loadTs('src/gamekit/core/scoring.ts');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// On twos and line boil
// ---------------------------------------------------------------------------

test('twos: one drawing frame every 83 ms; jitter holds inside a frame and re-picks on the next', () => {
  assert.equal(twos.twosFrame(0), 0);
  assert.equal(twos.twosFrame(83), 0);
  assert.equal(twos.twosFrame(84), 1);
  assert.equal(twos.twosFrame(1000), 12);
  const a = twos.twosJitter(7, 3, 1, 8);
  assert.equal(twos.twosJitter(7, 3, 1, 8), a, 'deterministic');
  let changed = 0;
  for (let f = 0; f < 20; f++) {
    const v = twos.twosJitter(7, f, 1, 8);
    assert.ok(Math.abs(v) <= 8);
    if (v !== twos.twosJitter(7, f + 1, 1, 8)) changed++;
  }
  assert.ok(changed >= 18, 'a new pose almost every drawing frame');
  assert.equal(twos.flipbookFrame(0, 0, 4, false), 0);
  assert.equal(twos.flipbookFrame(170, 0, 4, false), 2);
  assert.equal(twos.flipbookFrame(5000, 0, 4, false), 3, 'one-shot holds its last frame');
  assert.equal(twos.flipbookFrame(5000, 0, 4, true), twos.twosFrame(5000) % 4);
});

test('line boil: 3 sets normalized to the amplitude (0.75 pt reading surface, 1.5 pt world), cycled at 12 fps', () => {
  for (const amp of [0.75, 1.5]) {
    const b = twos.createBoilSets(32, amp, 3, 4);
    assert.ok(Math.abs(twos.boilMaxOffset(b) - amp) < 1e-9, `max offset is exactly ${amp}`);
  }
  const b = twos.createBoilSets(16, 1.5);
  assert.deepEqual([0, 90, 170, 260].map((ms) => twos.boilSetAt(b, ms)), [0, 1, 2, 0]);
  const xs = Array.from({ length: 16 }, (_, i) => i * 10);
  const ys = xs.map(() => 50);
  const ox = xs.slice(), oy = ys.slice();
  twos.applyBoil(b, 1, xs, ys, ox, oy, 0);
  assert.deepEqual(plain(ox), plain(xs), 'scale 0 (reduced motion) is the clean line');
  twos.applyBoil(b, 1, xs, ys, ox, oy, 1);
  for (let i = 0; i < 16; i++) assert.ok(Math.hypot(ox[i] - xs[i], oy[i] - ys[i]) <= 1.5 + 1e-9);
});

test('particles on twos: hand-drawn emitters step rotation (+/-8 deg) and scale (+/-6%) per drawing frame; procedural ones stay smooth', () => {
  assert.equal(particles.EMITTERS.stars.twos, true);
  assert.equal(particles.EMITTERS.impact.twos, true);
  assert.equal(particles.EMITTERS.sparks.twos, undefined, 'velocity-aligned streaks stay smooth');
  assert.equal(particles.EMITTERS.confetti.twos, undefined, 'flutter keeps its own frames');
  const pool = particles.createParticlePool(32, 3);
  particles.emit(pool, particles.EMITTERS.stars, 100, 100, { count: 1 });
  particles.emit(pool, particles.EMITTERS.sparks, 100, 100, { count: 1 });
  const star = 0, spark = 1;
  const phase = pool.twPhase[star];
  assert.ok(phase >= 0 && phase < 1000 / 12);
  const t0 = 1000 / 12 * 5 - phase + 1;
  const r0 = particles.particleTwosRot(pool, star, t0);
  assert.equal(particles.particleTwosRot(pool, star, t0 + 80), r0, 'holds for the whole drawing frame');
  assert.ok(Math.abs(r0) <= (8 * Math.PI) / 180 + 1e-12);
  const s0 = particles.particleTwosScale(pool, star, t0);
  assert.ok(s0 >= 0.94 - 1e-12 && s0 <= 1.06 + 1e-12);
  assert.equal(particles.particleTwosRot(pool, spark, t0), 0);
  assert.equal(particles.particleTwosScale(pool, spark, t0), 1);
  pool.twosOn = false;
  assert.equal(particles.particleTwosRot(pool, star, t0), 0, 'reduced motion: no boil');
  const fb = particles.createParticlePool(4, 1);
  particles.emit(fb, { ...particles.EMITTERS.puff, sprite: 20, frames: 4, flipbook: true }, 0, 0, { count: 1 });
  fb.twPhase[0] = 0;
  const frames = [0, 0.09, 0.17, 0.26, 0.4].map((age) => { fb.age[0] = age; return particles.particleSprite(fb, 0) - 20; });
  assert.deepEqual(frames, [0, 1, 2, 3, 3], 'flipbook on twos from birth, holding the last frame');
});

// ---------------------------------------------------------------------------
// Fly-to-score and digit roll
// ---------------------------------------------------------------------------

test('fly-to-score: overshoot 1.3 with a tilt, hold 250 ms, curve to the header in 350 ms, then gone', () => {
  const tilt = (6 * Math.PI) / 180;
  const pose = (t) => scoreFx.flyToPose(t, 100, 400, 330, 40, 250, 350, tilt, 1.3);
  assert.ok(Math.abs(pose(70)[2] - 1.3) < 1e-9, 'peak overshoot at 70 ms');
  assert.ok(Math.abs(pose(140)[2] - 1) < 1e-9, 'settled by 140 ms');
  assert.deepEqual(plain(pose(300).slice(0, 2)), [100, 400], 'holds in place');
  assert.equal(pose(300)[3], tilt);
  const mid = pose(140 + 250 + 175);
  assert.ok(mid[1] < 400 && mid[0] > 100, 'travelling up and over');
  const end = pose(140 + 250 + 350);
  assert.ok(Math.abs(end[0] - 330) < 1e-6 && Math.abs(end[1] - 40) < 1e-6, 'lands on the score');
  assert.equal(end[4], 0, 'gone on arrival');
  assert.equal(scoreFx.flyToDurationMs(), 740);
});

test('digit roll: 200 ms count with a 1.12 squash that settles, exact final value', () => {
  assert.deepEqual(plain(scoreFx.digitRollAt(1200, 1350, 0)), [1200, 1.12]);
  const mid = scoreFx.digitRollAt(1200, 1350, 100);
  assert.ok(mid[0] > 1200 && mid[0] < 1350 && mid[1] > 1 && mid[1] < 1.12);
  assert.deepEqual(plain(scoreFx.digitRollAt(1200, 1350, 200)), [1350, 1]);
});

// ---------------------------------------------------------------------------
// Camera presets and the flash governor
// ---------------------------------------------------------------------------

test('camera: Whack preset decays linearly to zero over 250 ms with no cap; the default stays capped', () => {
  const c = camera.createCamera(camera.CAMERA_PRESETS.whack, 3);
  camera.addTrauma(c, 0.45);
  for (let t = 0; t < 200; t += 10) camera.stepCamera(c, 10);
  assert.ok(c.trauma > 0.05 && c.trauma < 0.1, `linear: about 20% left at 200 ms (${c.trauma})`);
  for (let t = 0; t < 60; t += 10) camera.stepCamera(c, 10);
  assert.equal(c.trauma, 0, 'zero by 250 ms');
  assert.equal(c.cfg.maxOffset, 16);
  const d = camera.createCamera({}, 3);
  camera.addTrauma(d, 0.45);
  for (let t = 0; t < 200; t += 10) camera.stepCamera(d, 10);
  assert.ok(d.trauma < c.trauma + 0.2, 'default collapses after its 120 ms cap');
  const b = camera.createCamera({ ...camera.CAMERA_PRESETS.boss }, 3);
  camera.addTrauma(b, 0.8);
  for (let t = 0; t < 300; t += 10) camera.stepCamera(b, 10);
  assert.ok(Math.abs(b.trauma - (0.8 - 1.6 * 0.3)) < 1e-6, 'boss: 1.6/s, never cut short');
  const lin = camera.createCamera({ exponent: 1, maxOffset: 10 }, 9);
  camera.addTrauma(lin, 0.5);
  camera.stepCamera(lin, 16);
  assert.ok(Math.abs(lin.x) <= 10 * lin.trauma + 1e-9);
});

test('flash governor: Whack v5 = 334 ms gap, 3 per second, and a flash inside the gap merges (no bloom)', () => {
  const g = gov.createFxGovernor(gov.GOVERNOR_PRESETS.whack);
  assert.ok(gov.govFlash(g, 0, 0.3) > 0);
  assert.equal(gov.govFlash(g, 100, 0.3), 0);
  assert.equal(g.lastFlashVerdict, gov.FLASH_MERGED);
  assert.equal(g.merged, 1);
  assert.ok(gov.govFlash(g, 340, 0.3) > 0);
  assert.ok(gov.govFlash(g, 680, 0.3) > 0);
  assert.equal(gov.govFlash(g, 1020, 0.3) > 0, true, 'the first flash left the 1 s window');
  const d = gov.createFxGovernor();
  gov.govFlash(d, 0, 0.3);
  assert.equal(gov.govFlash(d, 100, 0.3), 0);
  assert.equal(d.lastFlashVerdict, gov.FLASH_DENIED, 'default: denied (the feel layer blooms instead)');
  const t = gov.createFxGovernor(gov.GOVERNOR_PRESETS.trivia);
  assert.ok(gov.govFlash(t, 0, 0.6) <= 0.35);
  assert.ok(gov.govFlash(t, 10000, 0.5) > 0);
  assert.equal(gov.govFlash(t, 60000, 0.5), 0, 'Trivia: 2 full-frame flashes per match');
});

test('feel: a merged flash neither re-flashes nor blooms', () => {
  const src = fs.readFileSync(path.join(root, 'src/gamekit/feel.ts'), 'utf8');
  assert.match(src, /lastFlashVerdict === FLASH_MERGED/);
});

// ---------------------------------------------------------------------------
// Haptics: tail cuts, explicit fallbacks, signatures
// ---------------------------------------------------------------------------

test('haptic bus: Whack priority 1-2 cut the tail of a lower pattern; nothing else does', () => {
  const w = bus.createHapticBus('whack');
  assert.equal(bus.busShouldCancelTail(w, bus.WHACK_PRIO.goldenTell, bus.WHACK_PRIO.quick), true);
  assert.equal(bus.busShouldCancelTail(w, bus.WHACK_PRIO.goldenTell, bus.WHACK_PRIO.decoy), true);
  assert.equal(bus.busShouldCancelTail(w, bus.WHACK_PRIO.goldenTell, bus.WHACK_PRIO.good), false, 'priority 3+ never cuts');
  assert.equal(bus.busShouldCancelTail(w, bus.WHACK_PRIO.decoy, bus.WHACK_PRIO.quick), false, 'never cuts a higher one');
  assert.equal(bus.busShouldCancelTail(bus.createHapticBus('banana'), 1, 9), false, 'off for other games');
});

test('expo fallback: re-timed explicit lists at >= 110 ms (Whack v5), first-pulse-only Boss rule, merge for the rest', () => {
  for (const [name, steps] of Object.entries(pat.FALLBACK_STEPS)) {
    if (steps.length > 1) assert.ok(pat.minStepGapMs(steps) >= 110, `${name} spaced >= 110 ms`);
  }
  assert.deepEqual(plain(pat.hapticFallbackFor('whackCrit', pat.AHAP_LIBRARY.whackCrit)), [{ at: 0, p: 'rigid' }, { at: 110, p: 'rigid' }]);
  assert.deepEqual(plain(pat.hapticFallbackFor('bossKo', pat.AHAP_LIBRARY.bossKo)), [{ at: 0, p: 'success' }, { at: 450, p: 'heavy' }]);
  assert.equal(pat.hapticFallbackFor('bossPerfect', pat.AHAP_LIBRARY.bossPerfect).length, 1);
  assert.deepEqual(plain(pat.hapticFallbackFor('whackGood', pat.AHAP_LIBRARY.whackGood)), plain(pat.fallbackSteps(pat.AHAP_LIBRARY.whackGood)));
});

test('Trivia signature rule: correct = 3+ rising pulses, wrong = exactly 1 no stronger than hitSoft', () => {
  const c = grammar.hapticSignature(grammar.HAPTIC_PATTERNS.triviaCorrect);
  assert.ok(c.count >= 3 && c.rising, `correct ${c.pulses}`);
  const w = grammar.hapticSignature(grammar.HAPTIC_PATTERNS.triviaWrong);
  assert.equal(w.count, 1);
  assert.ok(w.maxStrength <= grammar.PRIMITIVE_PULSES.soft[0]);
  assert.notDeepEqual(plain(c.pulses), plain(w.pulses));
  const legacyWrong = grammar.hapticSignature([{ at: 0, p: 'light' }, { at: 80, p: 'light' }]);
  assert.equal(legacyWrong.count, 2, 'the old tapLight x2 wrong read like a correct: 2 pulses');
  assert.equal(grammar.onBeatWindow(30, 464), true);
  assert.equal(grammar.onBeatWindow(450, 464), true);
  assert.equal(grammar.onBeatWindow(200, 464), false, 'off-beat catches get nothing (Banana)');
});

function loadHaptics() {
  const fired = [];
  const H = {
    ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Soft: 'soft', Rigid: 'rigid' },
    NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
    impactAsync: (s) => fired.push([Date.now(), s]),
    selectionAsync: () => fired.push([Date.now(), 'selection']),
    notificationAsync: (s) => fired.push([Date.now(), s]),
  };
  const mod = loadTs('src/gamekit/Haptics.ts', { 'expo-haptics': H });
  return { mod, fired };
}

test('Haptics runtime: a QUICK hit cuts the purr tell still playing; the explicit fallback spacing is used', async () => {
  const { mod, fired } = loadHaptics();
  mod.configureHaptics('whack');
  const t0 = Date.now();
  // Wide spacing so a loaded test machine cannot reorder the timers.
  assert.ok(mod.playPattern('purrTell', { priority: 5, tell: true, fallback: [{ at: 0, p: 'soft' }, { at: 400, p: 'soft' }, { at: 800, p: 'soft' }] }));
  await sleep(150);
  assert.ok(mod.playPattern('whackQuick', { priority: 8 }));
  await sleep(900);
  const kinds = fired.map(([, k]) => k);
  assert.deepEqual(kinds, ['soft', 'rigid'], `purr tail cut by the QUICK: ${kinds}`);
  assert.equal(mod.hapticBusStats().tailCuts, 1);
  fired.length = 0;
  mod.configureHaptics('default');
  mod.playPattern('whackCrit', { priority: 4 });
  await sleep(160);
  assert.equal(fired.length, 2, 'crit double survives on expo (110 ms apart)');
  assert.ok(fired[1][0] - fired[0][0] >= 100);
  assert.ok(Date.now() - t0 > 0);
});

// ---------------------------------------------------------------------------
// Mesh sprites
// ---------------------------------------------------------------------------

test('mesh grid: vertices, texcoords and two triangles per cell', () => {
  const g = mesh.createMeshGrid(5, 6, 100, 120);
  assert.equal(g.base.length, 5 * 6 * 2);
  assert.equal(g.indices.length, 4 * 5 * 6);
  assert.deepEqual(plain(g.base.slice(-2)), [100, 120]);
  assert.ok(Math.max(...g.indices) === 29);
});

test('Sharky tail mesh: nothing moves ahead of the rear 40%, the tip swings at most the state amplitude', () => {
  const g = mesh.createMeshGrid(12, 4, 240, 100);
  const out = [];
  let tipMax = 0;
  for (let t = 0; t < 1000; t += 20) {
    mesh.meshReset(g, out);
    mesh.deformTailWave(g, out, t, { fromU: 0.6, axis: 'x', tailAtEnd: true, wavelengths: 0.8, ...mesh.SHARKY_TAIL.holding });
    for (let c = 0; c < 12; c++) {
      const u = c / 11;
      const dy = Math.abs(out[c * 2 + 1] - g.base[c * 2 + 1]);
      if (u <= 0.6) assert.equal(dy, 0, `column ${c} is ahead of the tail`);
      tipMax = Math.max(tipMax, dy);
    }
  }
  assert.ok(tipMax <= 14 + 1e-9 && tipMax > 10, `tip ${tipMax}`);
});

test('Whack head-row follow-through: hard caps (6% / 3 deg / 1%), feet planted, outline stretch under 10%', () => {
  const g = mesh.createMeshGrid(5, 6, 120, 120);
  const out = [];
  mesh.meshReset(g, out);
  mesh.deformRowFollow(g, out, { rows: 2, dx: 500, dy: 0, shearDeg: 40, breathe: 0.5 });
  assert.ok(mesh.meshMaxDisplacement(g, out) <= 0.06 * 120 + Math.tan((3 * Math.PI) / 180) * 48 + 0.01 * 170 + 1e-6);
  assert.ok(mesh.meshMaxStretch(g, out) < 0.1, `stretch ${mesh.meshMaxStretch(g, out)}`);
  const bottom = (5 * 5) * 2;
  for (let c = 0; c < 5; c++) assert.ok(Math.abs(out[bottom + c * 2 + 1] - 120) < 1e-9, 'the base row never lifts');
});

test('Boss spine chain: rest is the drawing, motion travels root to tip, the tip stays within 10 pt', () => {
  const g = mesh.createMeshGrid(12, 3, 220, 40);
  const ch = mesh.createSpineChain(6);
  const out = [];
  mesh.meshReset(g, out);
  mesh.deformSpine(g, out, ch);
  assert.ok(mesh.meshMaxDisplacement(g, out) < 1e-9, 'zero angles = the drawn frame');
  mesh.stepSpineChain(ch, 0.6, 16);
  assert.ok(Math.abs(ch.angle[0]) > Math.abs(ch.angle[5]), 'the root leads');
  for (let i = 0; i < 60; i++) mesh.stepSpineChain(ch, 0.6, 16);
  mesh.meshReset(g, out);
  mesh.deformSpine(g, out, ch);
  const tip = 11 * 2 + 12 * 2;
  assert.ok(Math.hypot(out[tip] - g.base[tip], out[tip + 1] - g.base[tip + 1]) <= 10 + 1e-6);
});

// ---------------------------------------------------------------------------
// Parallax, routes, beat layers
// ---------------------------------------------------------------------------

test('gyro parallax: 0.3 Hz low-pass, learns the resting hold, and eases home while walking', () => {
  const s = parallax.createParallax({ cutoffHz: 0.3, maxPx: 12, rangeRad: 0.35, restHz: 0.05 });
  parallax.stepParallax(s, 0.7, 0, 16, true);
  assert.equal(s.x, 0, 'a phone held at 40 degrees is the rest pose, not a tilt');
  for (let i = 0; i < 10; i++) parallax.stepParallax(s, 0.7, 0.35, 16, true);
  assert.ok(s.x < 0 && s.x > -4, `slow follow (${s.x})`);
  for (let i = 0; i < 80; i++) parallax.stepParallax(s, 0.7, 0.35, 16, true);
  assert.ok(s.x < -5, `a deliberate tilt moves the world (${s.x})`);
  const held = parallax.createParallax();
  parallax.stepParallax(held, 0.7, 0, 16, true);
  for (let i = 0; i < 1500; i++) parallax.stepParallax(held, 0.7, 0.35, 16, true);
  assert.ok(Math.abs(held.x) < 2, 'a tilt held for 24 s becomes the new resting hold');
  const before = s.x;
  for (let i = 0; i < 600; i++) parallax.stepParallax(s, 0.7, 0.35, 16, false);
  assert.ok(Math.abs(s.x) < Math.abs(before) * 0.1, 'walking: back to centre');
  assert.equal(parallax.parallaxOffset(s, 0, 'x'), 0, 'deck and wells locked at 0x');
});

test('audio routes: port mapping, pan only on private routes, Line Party speaker policy, Lead Speaker', () => {
  const cases = { AVAudioSessionPortBuiltInSpeaker: 'speaker', AVAudioSessionPortHeadphones: 'wired', AVAudioSessionPortBluetoothA2DP: 'bluetooth',
    AVAudioSessionPortBuiltInReceiver: 'receiver', AVAudioSessionPortAirPlay: 'airplay', AVAudioSessionPortCarAudio: 'car', '': 'unknown' };
  for (const [port, r] of Object.entries(cases)) assert.equal(route.classifyPort(port), r, port);
  assert.equal(route.routeFromOutputs([{ category: 'AVAudioSessionPortBuiltInSpeaker' }, { category: 'AVAudioSessionPortHeadphones' }]), 'wired');
  assert.equal(route.routePan('speaker', -0.6), 0);
  assert.equal(route.routePan('unknown', -0.6), 0);
  assert.equal(route.routePan('bluetooth', -0.6), -0.6);
  const p = (r, roomKind, isHost, musicSetting = true) => route.musicAllowed({ route: r, roomKind, isHost, musicSetting });
  assert.equal(p('wired', 'quick', false), true, 'headphones always get the bed');
  assert.equal(p('speaker', 'quick', true), false, 'quick rooms: no speaker music');
  assert.equal(p('speaker', 'crew', true), true);
  assert.equal(p('speaker', 'crew', false), false, 'only the host plays the crew bed');
  assert.equal(p('speaker', 'solo', false, false), false);
  assert.equal(route.raceAudioRole('speaker', 0, 0), 'lead');
  assert.equal(route.raceAudioRole('speaker', 2, 0), 'pocket');
  assert.equal(route.raceAudioRole('wired', 2, 0), 'private');
  assert.equal(route.calibrationRoute('receiver'), 'speaker');
});

test('beat layers: Whack kit escalates by level on the bed grid; swells land their peak on the 4-bar line', () => {
  const g = { bpm: 120, beatsPerBar: 4, offsetMs: 0 };
  const kit = layers.BEAT_LAYER_KITS.whack;
  assert.equal(layers.layerHitsBetween(g, kit, 0, -1, 2000).length, 0, 'level 0: the bed alone');
  const l1 = layers.layerHitsBetween(g, kit, 1, -1, 1999);
  assert.deepEqual(plain(l1.map((h) => h.atMs)), [0, 250, 500, 750, 1000, 1250, 1500, 1750], 'hat on 8ths');
  const l2 = layers.layerHitsBetween(g, kit, 2, -1, 1999).filter((h) => h.layer === 'clap');
  assert.deepEqual(plain(l2.map((h) => h.atMs)), [500, 1500], 'clap on 2 and 4');
  const l3 = layers.layerHitsBetween(g, kit, 3, -1, 1999).filter((h) => h.layer === 'shaker');
  assert.equal(l3.length, 16, 'shaker on 16ths');
  const fever = layers.layerHitsBetween(g, kit, 5, 0, 16100).filter((h) => h.layer === 'swell');
  assert.deepEqual(plain(fever.map((h) => h.atMs)), [8000 - 590, 16000 - 590], 'reversed whoosh starts early so its peak is the downbeat');
  assert.deepEqual(plain(layers.activeLayers(kit, 4)), ['hat', 'clap', 'shaker', 'rim']);
  const gh = layers.layerHitsBetween(g, layers.BEAT_LAYER_KITS.bananaGoldenHour, 1, -1, 1999).filter((h) => h.layer === 'glock');
  assert.deepEqual(plain(gh.map((h) => h.pitch)), [0, 4, 7, 12], 'G B D G arpeggio each bar');
  assert.deepEqual([1, 1.5, 2, 2.5, 3].map((m) => layers.whackLayerLevel(m, false)), [0, 1, 2, 3, 4]);
  assert.equal(layers.whackLayerLevel(1, true), 5);
  const u = layers.createUnwrap(8000);
  assert.deepEqual([7900, 50, 7990, 10].map((p) => layers.unwrapPosition(u, p)), [7900, 8050, 15990, 16010]);
});

test('BeatLayerPlayer: schedules 150 ms ahead on the bed position, never twice, and a combo break cancels queued hits', async () => {
  const plays = [];
  const stops = [];
  let pos = 0;
  const music = { currentBed: 'bed', playing: true, clock: () => ({ bpm: 120, beatsPerBar: 4, offsetMs: 0 }), positionMs: async () => pos };
  const GameAudio = { music, bed: () => ({ loopEndMs: 8000 }), play: (cue, o) => { plays.push([cue, o.delayMs]); return plays.length; }, stop: (id) => stops.push(id) };
  const mod = loadTs('src/gamekit/audio/BeatLayers.ts', { react: { useEffect() {}, useMemo: (f) => f(), useRef: (v) => ({ current: v }) }, './GameAudio': { GameAudio } });
  const p = new mod.BeatLayerPlayer(loadTs('src/gamekit/core/beatLayers.ts').BEAT_LAYER_KITS.whack, { aheadMs: 150 });
  p.setLevel(1);
  pos = 400; await p.tick();
  assert.deepEqual(plays.map(([c, d]) => [c, Math.round(d)]), [['ui.tap', 100]], 'the 8th at 500 ms, 100 ms ahead');
  pos = 425; await p.tick();
  assert.equal(plays.length, 1, 'the planned window is never scheduled twice');
  pos = 610; await p.tick();
  assert.deepEqual(plays.slice(1).map(([c, d]) => [c, Math.round(d)]), [['ui.tap', 140]]);
  p.setLevel(0);
  assert.equal(stops.length, 2, 'a combo break stops queued layer hits');
  pos = 800; await p.tick();
  assert.equal(plays.length, 2);
});

// ---------------------------------------------------------------------------
// GameAudio route-gated pan
// ---------------------------------------------------------------------------

test('GameAudio: pan plays only on a headphone route (Whack v5); the speaker is centred', async () => {
  const src = fs.readFileSync(path.join(root, 'src/gamekit/audio/chrisBank.ts'), 'utf8');
  const stubs = {};
  for (const m of src.matchAll(/require\('([^']+)'\)/g)) stubs[m[1]] = m[1];
  const plays = [];
  class Fake {
    constructor() { this.name = 'audio-api'; this.supportsPan = true; this.supportsFilter = true; this.latencyMs = 20; this.t = 1; this.keys = new Set(); }
    async init() {}
    async load(k) { this.keys.add(k); return true; }
    isLoaded(k) { return this.keys.has(k); }
    play(key, a) { plays.push(a.pan); return this.t++; }
    stop() {} stopAll() {} musicStart() {} musicGain() {} musicStop() {} async musicPosition() { return 0; } musicFilter() {} setMasterGain() {} async unloadAll() {}
  }
  stubs['./backends'] = { ExpoAvBackend: Fake, AudioApiBackend: Fake, HybridBackend: Fake, audioApiAvailable: () => false };
  const { GameAudio } = loadTs('src/gamekit/audio/GameAudio.ts', stubs, { setInterval, clearInterval });
  await GameAudio.init();
  await GameAudio.preload(['fx.hit', 'fx.whoosh', 'fx.nope']);
  GameAudio.play('fx.hit', { pan: -0.6 });
  GameAudio.setRoute('speaker');
  GameAudio.play('fx.whoosh', { pan: -0.6 });
  const seen = [];
  GameAudio.onRouteChange((r) => seen.push(r));
  GameAudio.setRoute('wired');
  GameAudio.play('fx.nope', { pan: -0.6 });
  assert.deepEqual(plays, [0, 0, -0.6]);
  assert.deepEqual(seen, ['wired']);
  for (const cue of ['fx.firework', 'fx.coinTick', 'fx.whooshRev']) assert.ok(GameAudio.hasCue(cue), `${cue} wired from Chris's material`);
});

// ---------------------------------------------------------------------------
// Unified shell props (upstreamed from the game branches)
// ---------------------------------------------------------------------------

function shell(extra = {}) {
  const calls = { start: 0, pause: [], resume: 0, results: [] };
  const view = runtime('src/gamekit/GameShellV2.tsx', {
    './theme': { GAME_COLORS: {}, COUNTDOWN: { stepMs: 600, goMs: 400 }, JUICE: {}, LINE_MOVING_TOAST: 'Moving' },
    './LinePlayMovementContext': { LinePlayMovementContext: { value: null } },
    './RideChallengeContext': { RideChallengeContext: { value: false } },
    './Haptics': { Haptic: new Proxy({}, { get: () => () => {} }) }, './SFX': { playSfx() {} },
    '../hooks/useReducedGameMotion': { default: () => false },
    '../ui/GameIcon': { default: 'GameIcon' },
    './results/ResultsCard': { ResultsCard: 'ResultsCard' },
    './core/session': session, './core/scoring': scoring,
    './session/snapshotStore': { saveSnapshot: async () => {}, clearSnapshot: async () => {} },
    './audio/GameAudio': { GameAudio: { music: { pause: async () => {}, resume: async () => {}, setTrimDb() {} } } },
  }, { visible: true, title: 'Parade Beat', score: 0, onStart() { calls.start++; }, onComplete() {}, onClose() {},
    onPause(r) { calls.pause.push(r); }, onResume() { calls.resume++; }, children: 'board', ...extra });
  return { view, calls };
}

test('shell: countdownStyle none starts at once (Parade Beat counts in itself); go is a single GO; introCountdown=false still works', () => {
  const none = shell({ countdownStyle: 'none' });
  assert.equal(none.calls.start, 1);
  none.view.unmount();
  const legacy = shell({ introCountdown: false });
  assert.equal(legacy.calls.start, 1);
  legacy.view.unmount();
  const go = shell({ countdownStyle: 'go' });
  assert.ok(go.view.find((n) => n.props?.children === 'GO!'), 'the first label is GO!');
  go.view.unmount();
});

test('shell: header score hide / replace, scrim none, hold-sheet extras, results note and extras, challenge label', () => {
  const { view } = shell({ hideHeaderScore: true, countdownScrim: 'none', pauseExtras: 'RELAXED PACE', resultExtras: 'ALBUM ROW', challengeLabel: 'Race a friend', onChallenge() {}, onRematch() {} });
  assert.equal(view.find((n) => n.type === 'ScoreDisplay'), undefined);
  const scrim = view.find((n) => n.type === 'Pressable');
  assert.equal(scrim.props.style[1].backgroundColor, 'transparent');
  scrim.props.onPress(); view.render();
  view.find((n) => n.type === 'TouchableOpacity' && n.props.accessibilityLabel === 'Pause').props.onPress(); view.render();
  assert.ok(view.find((n) => n === 'RELAXED PACE' || n.props?.children === 'RELAXED PACE' || (Array.isArray(n.props?.children) && n.props.children.includes('RELAXED PACE'))));
  view.find((n) => n.type === 'TouchableOpacity' && n.props.children?.props?.children === 'Resume').props.onPress();
  for (let i = 0; i < 6 && view.timers.size; i++) { const t = Array.from(view.timers.values()); view.timers.clear(); t.forEach((f) => f()); view.render(); }
  view.change({ result: { score: 900, stars: 2, note: 'Tip: tap on the beat' } });
  const card = view.find((n) => n.type === 'ResultsCard');
  assert.equal(card.props.note, 'Tip: tap on the beat');
  assert.ok(view.find((n) => n.type === 'Text' && n.props.children === 'Race a friend'));
  view.unmount();
  const custom = shell({ headerScore: 'RUN BAR' });
  assert.equal(custom.view.find((n) => n.type === 'ScoreDisplay'), undefined);
  custom.view.unmount();
});

test('shell: renderResults owns the results surface; clearing the result after a rematch runs a fresh count', () => {
  let args = null;
  const { view, calls } = shell({ renderResults: (a) => { args = a; return 'CUSTOM RESULTS'; }, onRematch() {} });
  view.find((n) => n.type === 'Pressable').props.onPress(); view.render();
  assert.equal(calls.start, 1);
  view.change({ result: { score: 700, stars: 1 } });
  assert.equal(view.find((n) => n.type === 'ResultsCard'), undefined, 'the default card is replaced');
  assert.equal(args.result.score, 700);
  assert.equal(args.won, true);
  assert.equal(typeof args.claim, 'function');
  assert.equal(typeof args.rematch, 'function');
  view.change({ result: null });
  assert.ok(view.find((n) => n.type === 'Pressable'), 'back to the start count');
  view.find((n) => n.type === 'Pressable').props.onPress(); view.render();
  assert.equal(calls.start, 2, 'play begins again');
  view.unmount();
});

// ---------------------------------------------------------------------------
// Upstreamed engine fixes
// ---------------------------------------------------------------------------

test('audio-api backend never schedules AudioParam automation (the 0.6 crash) and ramps by JS steps', async () => {
  const src = fs.readFileSync(path.join(root, 'src/gamekit/audio/backends.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(src, /cancelScheduledValues\(|setValueAtTime\(|RampToValueAtTime\(/);
  const mod = loadTs('src/gamekit/audio/backends.ts', { 'expo-av': { Audio: {} }, 'expo-asset': { Asset: {} } }, { setInterval, clearInterval });
  const param = { value: 1 };
  mod.rampParamValue(param, 0.2, 10);
  assert.equal(param.value, 0.2, 'short ramps set the value at once');
  mod.rampParamValue(param, 1, 400);
  await sleep(100);
  assert.ok(param.value > 0.2 && param.value < 1, `mid-ramp ${param.value}`);
  await sleep(450);
  assert.equal(param.value, 1);
  const lp = { value: 20000 };
  mod.rampParamValue(lp, 800, 60, true);
  mod.rampParamValue(lp, 20000, 10, true);
  await sleep(120);
  assert.equal(lp.value, 20000, 'a new ramp replaces the running one');
});

test('engine fixes from the game branches: kill() above claim(), stable bridge and clock handles, expo-av deck coalescing', () => {
  const p = fs.readFileSync(path.join(root, 'src/gamekit/core/particles.ts'), 'utf8');
  assert.ok(p.indexOf('function kill(') < p.indexOf('function claim('), 'Reanimated captures worklet helpers declared above');
  assert.match(fs.readFileSync(path.join(root, 'src/gamekit/fx/useEventBridge.ts'), 'utf8'), /useMemo\(\(\) => \(\{ ring, flush \}\)/);
  assert.match(fs.readFileSync(path.join(root, 'src/gamekit/useGameClock.ts'), 'utf8'), /frameRef\.current\.setActive/);
  const b = fs.readFileSync(path.join(root, 'src/gamekit/audio/backends.ts'), 'utf8');
  assert.match(b, /function pushDeckVolume/);
  assert.match(fs.readFileSync(path.join(root, 'src/gamekit/audio/GameAudio.ts'), 'utf8'), /keepPosition/);
});
