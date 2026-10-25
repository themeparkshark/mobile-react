// wow-sound (Oct 24 2026): the moment map, the studio switch and playMoment.
// Shipping this changes nothing until Dustin's yes: with the switch off every
// moment plays its Chris fallback, legacy call sites keep their own sound, and
// nothing studio-only is required in a release bundle.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
/** chrisBank.ts with every audio require stubbed to a number (Metro asset ids). */
function loadChris() {
  const stubs = {};
  let n = 1;
  for (const m of read('src/gamekit/audio/chrisBank.ts').matchAll(/require\('([^']+)'\)/g)) stubs[m[1]] = n++;
  return loadTs('src/gamekit/audio/chrisBank.ts', stubs);
}
const chrisBank = loadChris();
const { buildMoments } = require('../audio/dump-moments.cjs');

const map = loadTs('src/gamekit/audio/momentMap.ts');
const grammar = loadTs('src/gamekit/core/hapticGrammar.ts');
const pattern = loadTs('src/gamekit/core/hapticPattern.ts');
const built = buildMoments();
const NAMES = Object.keys(map.MOMENTS);

// The director spec's moments, one per group the other wow lanes build.
const REQUIRED = [
  'catch.tap', 'catch.wobble', 'catch.burst', 'catch.count', 'catch.repeat', 'catch.firstOfDay',
  'coin.appear', 'coin.goldenAppear', 'coin.inRange', 'pin.warmer',
  'game.countTick', 'game.countLast', 'game.go', 'game.hit', 'game.crit', 'game.comboTier', 'game.nearMiss', 'game.miss',
  'game.feverStart', 'game.feverEnd', 'game.lastSeconds', 'game.win', 'game.newRecord', 'game.finish',
  'reward.reveal', 'reward.stamp', 'reward.levelUp', 'reward.setComplete', 'reward.goldenBox', 'reward.chaserPin',
  'loop.flameGrow', 'loop.flameMilestone', 'loop.freeze', 'loop.daily3Check', 'loop.daily3Done',
  'chest.rattle', 'chest.open', 'ui.press', 'ui.tab', 'ui.toast', 'ui.sheetOpen', 'ui.sheetClose', 'ui.counterTick',
  'park.arrival', 'park.shelfLand',
];
/** Moments that deliberately leave the hand alone (ambient, calm timer, sheets, rolling numbers). */
const SILENT_HAND = new Set(['coin.appear', 'game.lastSeconds', 'ui.sheetOpen', 'ui.sheetClose', 'ui.counterTick', 'catch.fly', 'catch.hot']);

const exists = (rel) => !!rel && fs.existsSync(path.join(root, rel)) && fs.statSync(path.join(root, rel)).size > 1024;

test('every moment the director spec names is mapped, in one of 13 groups', () => {
  for (const name of REQUIRED) assert.ok(map.MOMENTS[name], `missing moment ${name}`);
  const groups = new Set(NAMES.map((n) => map.MOMENTS[n].group));
  assert.equal(groups.size, 13);
});

test('primary, variant, fallback, layers and round-robin all resolve to real files on disk', () => {
  for (const [name, m] of Object.entries(built.moments)) {
    const r = m.resolved;
    for (const slot of ['primary', 'variant']) {
      assert.ok(!r[slot].missing, `${name} ${slot} ${r[slot].ref} is not a known cue`);
      assert.ok(exists(r[slot].file), `${name} ${slot} file ${r[slot].file} is on disk`);
    }
    assert.ok(!r.fallback.missing && exists(r.fallback.file), `${name} fallback ${m.fallback} is a Chris cue with a file`);
    for (const l of [...r.layers, ...r.rr]) assert.ok(!l.missing && exists(l.file), `${name} layer/rr ${l.ref}`);
    assert.notEqual(m.primary, m.variant, `${name}: the variant is a real alternative`);
    if (m.ladder) assert.ok(r.primary.rungs >= m.ladder, `${name}: ladder has ${m.ladder} rungs`);
  }
});

test('the coin ladder is the 13-step ladder and counts climb it', () => {
  assert.equal(map.COIN_LADDER_STEPS, 13);
  assert.equal(built.moments['catch.count'].resolved.primary.rungs, 13);
  assert.equal(built.moments['ui.counterTick'].resolved.primary.rungs, 13);
});

test('mix fields on every entry: class, trim never boosts, voice cap <= 3, ducks on stings', () => {
  for (const name of NAMES) {
    const m = map.MOMENTS[name];
    assert.ok(['ui', 'fx', 'sting'].includes(m.mix), name);
    assert.ok(m.gainDb <= 0 && m.gainDb >= -12, `${name} trim ${m.gainDb}`);
    assert.ok(m.variantGainDb === undefined || m.variantGainDb <= 0, name);
    assert.ok(typeof m.measuredLufs === 'number' && m.measuredLufs < -10 && m.measuredLufs > -30, name);
    // The trim lands the primary on its class target or under it (no boost on expo-av).
    assert.ok(m.measuredLufs + m.gainDb <= map.CLASS_LUFS[m.mix] + 0.15, `${name} sits at or under its class`);
    assert.ok(m.maxVoices >= 1 && m.maxVoices <= map.MAX_MOMENT_VOICES, name);
    if (m.mix === 'sting') assert.equal(m.duck, map.DUCK_STING, `${name}: stings duck the music`);
    if (m.duck) {
      assert.equal(m.duck.db, 6);
      assert.equal(m.duck.attackMs, 60);
      assert.equal(m.duck.releaseMs, 400);
    }
    assert.ok(m.why && !/—/.test(m.why) && m.why.split(/[.!?](\s|$)/).filter((s) => s && s.trim()).length === 1, `${name}: one plain sentence, no em dash`);
    assert.ok(m.today, `${name} records what plays today`);
  }
  assert.deepEqual({ ...map.CLASS_LUFS }, { ui: -20, fx: -18, sting: -16 });
});

test('every moment pairs a haptic (or is a documented silent hand) on the same frame', () => {
  for (const name of NAMES) {
    const m = map.MOMENTS[name];
    assert.ok('haptic' in m, name);
    if (m.haptic === null) assert.ok(SILENT_HAND.has(name), `${name} has no haptic but is not a silent-hand moment`);
    else assert.ok(grammar.HAPTIC_PATTERNS[m.haptic], `${name} haptic ${m.haptic} is a grammar pattern`);
    assert.ok(Math.abs(m.hapticOffsetMs) <= map.HAPTIC_SYNC_MAX_MS, `${name} offset under 10 ms`);
    if (m.ahap) assert.ok(pattern.AHAP_LIBRARY[m.ahap], `${name} ahap ${m.ahap}`);
  }
  // Kid misses are soft: never error, warning or punish.
  for (const name of ['game.miss', 'game.nearMiss', 'game.finish']) {
    const steps = grammar.HAPTIC_PATTERNS[map.MOMENTS[name].haptic];
    assert.ok(steps.every((s) => !['error', 'warning'].includes(s.p)), `${name} never punishes`);
  }
  // Walking in a line drops one rung.
  assert.equal(map.momentHaptic('catch.burst', { walking: true }), 'tierUp');
  assert.equal(map.momentHaptic('catch.burst'), 'golden');
});

test('the six moment Core Haptics patterns exist with expo-haptics fallbacks spaced for real pulses', () => {
  for (const name of ['momentCatchGather', 'momentCatch', 'momentComboTier', 'momentFeverStart', 'momentStreakIgnite', 'momentChestOpen', 'momentParkArrival']) {
    assert.ok(pattern.AHAP_LIBRARY[name], name);
    const steps = pattern.hapticFallbackFor(name, pattern.AHAP_LIBRARY[name]);
    assert.ok(steps.length >= 2, `${name} fallback is shaped, not one thump`);
    assert.ok(pattern.minStepGapMs(steps) >= 110, `${name} fallback pulses are >= 110 ms apart`);
    const file = path.join(root, 'assets/haptics', `${name}.ahap`);
    assert.equal(fs.readFileSync(file, 'utf8'), JSON.stringify(pattern.toAhap(pattern.AHAP_LIBRARY[name], name), null, 2) + '\n', `${name}.ahap is current`);
  }
});

test('ladder and round-robin math', () => {
  const count = map.MOMENTS['catch.count'];
  assert.equal(map.ladderStep(count, undefined, undefined, 1000), 3, 'starts at its first rung');
  assert.equal(map.ladderStep(count, undefined, { at: 1000, step: 3 }, 1100), 4, 'climbs inside the chain window');
  assert.equal(map.ladderStep(count, undefined, { at: 1000, step: 12 }, 1100), 12, 'tops out');
  assert.equal(map.ladderStep(count, undefined, { at: 1000, step: 7 }, 1000 + map.LADDER_CHAIN_MS + 1), 3, 'a pause restarts');
  assert.equal(map.ladderStep(count, 99, undefined, 0), 12, 'explicit steps clamp');
  const seq = [];
  let last;
  for (let i = 0; i < 6; i++) { last = map.nextRoundRobin(5, last); seq.push(last); }
  assert.deepEqual(seq, [0, 1, 2, 3, 4, 0]);
});

test('beds named for each game exist in the studio library', () => {
  const text = read('src/assets/games/audio/studio.dev.generated.ts') + read('src/assets/games/audio/studio.generated.ts');
  const beds = new Set([...text.split('export const STUDIO_BEDS')[1].matchAll(/^ {4}'([\w-]+)':/gm)].map((x) => x[1]));
  for (const [game, layers] of Object.entries(map.BED_LAYERS)) {
    for (const bed of Object.values(layers)) assert.ok(beds.has(bed), `${game}: ${bed}`);
  }
  assert.equal(map.MUSIC_RULES.layerCrossfadeMs, 200);
  assert.equal(map.MUSIC_RULES.walkingTrimDb, -3);
});

// ----------------------------------------------------------------- runtime

function harness({ dev = false, sfx = true, muted = false, approved = false, native = false } = {}) {
  const calls = [];
  const cues = new Map();
  const GameAudio = {
    isSfxEnabled: () => sfx,
    play: (name, opts) => { calls.push({ fn: 'play', name, opts }); return 7; },
    playLadder: (name, step, opts) => { calls.push({ fn: 'ladder', name, step, opts }); return 8; },
    registerCues: (defs) => Object.entries(defs).forEach(([k, v]) => cues.set(k, v)),
    cue: (k) => cues.get(k),
    preload: async () => undefined,
  };
  const studioDefs = (game, id) => ({ src: 1000 + id.length, approved, durationMs: 300, ...(id === 'coin_tick' ? { ladder: Array.from({ length: 13 }, (_, i) => 2000 + i) } : {}) });
  const haptics = [];
  const env = { EXPO_PUBLIC_STUDIO_MUTE: muted ? '1' : undefined };
  const sw = loadTs('src/gamekit/audio/studioSwitch.ts', {}, { __DEV__: dev, process: { env } });
  const mm = loadTs('src/gamekit/audio/momentMap.ts');
  const pm = loadTs('src/gamekit/audio/playMoment.ts', {
    './GameAudio': { GameAudio },
    './chrisBank': chrisBank,
    './studioLibrary': { studioCueDef: studioDefs },
    './studioSwitch': sw,
    './momentMap': mm,
    '../Haptics': {
      HAPTIC_PATTERNS: grammar.HAPTIC_PATTERNS,
      playHaptic: (p) => haptics.push({ via: 'bus', p }),
      queueHaptic: (i) => haptics.push({ via: 'gate', i }),
      playPattern: (p) => haptics.push({ via: 'ahap', p }),
      hasNativeHaptics: () => native,
      setHapticTraceListener: () => undefined,
    },
    '../../power/batterySaver': { isBatterySaverOn: () => false },
  }, { __DEV__: dev, process: { env } });
  return { calls, cues, haptics, sw, mm, pm };
}

test('the switch is on after Dustin\'s yes and still needs every other key', () => {
  const src = read('src/gamekit/audio/studioSwitch.ts');
  assert.match(src, /export const STUDIO_SOUND_DEFAULT = true;/);
  const h = harness();
  assert.equal(h.sw.isStudioSoundOn(), false, 'off until the server flag answers');
  h.sw.setStudioSoundOverride(true);
  assert.equal(h.sw.isStudioSoundOn(), false, 'the dev override is ignored in release builds');
  const d = harness({ dev: true });
  d.sw.setStudioSoundOverride(true);
  assert.equal(d.sw.isStudioSoundOn(), true, 'dev builds can audition');
  const muted = harness({ dev: true, muted: true });
  muted.sw.setStudioSoundOverride(true);
  assert.equal(muted.sw.isStudioSoundOn(), false, 'EXPO_PUBLIC_STUDIO_MUTE=1 keeps lane simulators off');
});

test('the server flag turns studio sound on and can pause it', async () => {
  const on = harness();
  let asked = 0;
  assert.equal(await on.sw.loadStudioSoundFlag(async () => { asked++; return { flags: { studio_sound: true } }; }), true);
  assert.equal(asked, 1);
  assert.equal(on.sw.isStudioSoundOn(), true, 'default on plus a true server flag');
  const paused = harness();
  assert.equal(await paused.sw.loadStudioSoundFlag(async () => ({ flags: { studio_sound: false } })), false);
  assert.equal(paused.sw.isStudioSoundOn(), false, 'a false server flag pauses the rollout without a release');
  const offline = harness();
  assert.equal(await offline.sw.loadStudioSoundFlag(async () => { throw new Error('offline'); }), false);
  assert.equal(offline.sw.isStudioSoundOn(), false, 'no answer reads as off');
  const muted = harness({ muted: true });
  await muted.sw.loadStudioSoundFlag(async () => ({ flags: { studio_sound: true } }));
  assert.equal(muted.sw.isStudioSoundOn(), false, 'muted lane simulators stay off even with the flag on');
});

test('switch off: playMoment plays exactly the Chris fallback for every moment; studioMoment plays nothing', () => {
  const h = harness();
  for (const name of NAMES) {
    h.calls.length = 0;
    h.pm.playMoment(name);
    assert.equal(h.calls.length, 1, name);
    assert.equal(h.calls[0].fn, 'play', name);
    assert.equal(h.calls[0].name, map.MOMENTS[name].fallback, `${name} -> ${map.MOMENTS[name].fallback}`);
    h.calls.length = 0;
    assert.equal(h.pm.studioMoment(name), false, `${name}: legacy code keeps its own sound`);
    assert.equal(h.calls.length, 0, `${name}: studioMoment is silent while off`);
  }
  assert.equal(h.cues.size, 0, 'no studio cue is even registered while off');
});

test('switch on (dev audition): each moment plays its studio primary under its own key, with layers, ladder and round-robin', () => {
  const h = harness({ dev: true });
  h.sw.setStudioSoundOverride(true);
  for (const name of NAMES) {
    h.calls.length = 0;
    assert.equal(h.pm.studioMoment(name), true, name);
    const first = h.calls[0];
    assert.equal(first.name, `moment:${name}:primary`, name);
    const def = h.cues.get(first.name);
    assert.ok(def && def.src !== undefined, `${name} registered with a file`);
    assert.equal(def.fallback, map.MOMENTS[name].fallback);
    assert.ok(def.maxVoices <= 3);
    assert.equal(h.calls.length, 1 + (map.MOMENTS[name].layers?.length ?? 0), `${name} plays its layers`);
    if (map.MOMENTS[name].ladder) assert.equal(first.fn, 'ladder', name);
  }
  h.calls.length = 0;
  h.pm.resetMomentsForTests();
  h.pm.playMoment('game.hit'); h.pm.playMoment('game.hit'); h.pm.playMoment('game.hit');
  assert.deepEqual(h.calls.map((c) => c.opts.variant), [0, 1, 2], 'hits rotate round-robin');
  h.calls.length = 0;
  h.pm.resetMomentsForTests();
  h.pm.playMoment('catch.count'); h.pm.playMoment('catch.count'); h.pm.playMoment('catch.count');
  assert.deepEqual(h.calls.map((c) => c.step), [3, 4, 5], 'coins climb the ladder');
});

test('switch on in a release build with an unapproved cue: still Chris (studioMoment false)', () => {
  const h = harness({ dev: false });
  // Force key 1 + 2 the way a future OTA would, but the cue is not approved.
  h.sw.setStudioSoundOverride(true);
  assert.equal(h.pm.studioMoment('catch.burst'), false);
});

test('Sound Effects off plays nothing on either path; the haptic still follows its own setting', () => {
  for (const dev of [false, true]) {
    const h = harness({ dev, sfx: false });
    if (dev) h.sw.setStudioSoundOverride(true);
    for (const name of NAMES) {
      assert.equal(h.pm.playMoment(name), 0, name);
      assert.equal(h.pm.studioMoment(name), false, name);
    }
    assert.equal(h.calls.length, 0);
  }
  const h = harness({ sfx: false });
  h.pm.playMoment('catch.burst', { haptic: true });
  assert.ok(h.haptics.length >= 1, 'haptics are not tied to sound');
});

test('outside games the paired haptic goes through the one shared gate; inside games through the bus', () => {
  const h = harness();
  h.pm.playMoment('ui.press', { haptic: true });
  assert.deepEqual(h.haptics, [{ via: 'gate', i: 'tapLight' }]);
  h.haptics.length = 0;
  h.pm.playMoment('game.crit', { haptic: true, context: 'game' });
  assert.deepEqual(h.haptics, [{ via: 'bus', p: 'crit' }]);
});

test('legacy playSfx names: switch off plays the same Chris cue as before', async () => {
  const played = [];
  const sfx = loadTs('src/gamekit/SFX.ts', {
    './audio/GameAudio': { GameAudio: { isSfxEnabled: () => true, backend: {}, play: (c) => { played.push(c); return 1; }, cue: () => undefined } },
    './audio/chrisBank': { LEGACY_SFX_TO_CUE: chrisBank.LEGACY_SFX_TO_CUE },
    './audio/momentMap': map,
    './audio/playMoment': { studioMoment: () => false },
  });
  const chris = chrisBank.LEGACY_SFX_TO_CUE;
  for (const name of Object.keys(map.LEGACY_SFX_TO_MOMENT)) {
    played.length = 0;
    await sfx.SFX.play(name);
    assert.deepEqual(played, [chris[name]], name);
  }
});

test('wired call sites keep their legacy sound behind studioMoment', () => {
  const sites = [
    ['src/context/CurrencyFlyProvider.tsx', /const studio = studioMoment\('catch\.count'\);\n\s+if \(!soundPlayed\) \{\n\s+soundPlayed = true;\n\s+if \(!studio\) playCoinSound\(\);/],
    ['src/components/RedeemModal.tsx', /if \(!studioMoment\('coin\.inRange'\)\) void playSound\(require\('\.\.\/\.\.\/assets\/sounds\/in_redeem_zone\.mp3'\)\)/],
    ['src/components/map/alive/CoinCollectFlight.tsx', /if \(!studioMoment\('park\.shelfLand'[^)]*\)\) void playSound\(LAND_SOUND, \{ volume: 0\.55, rate: 1\.15 \}\)/],
    ['src/components/RideTracker/RideLogSuccess.tsx', /if \(!studioMoment\('reward\.rideLogged'[^)]*\)\) playSound\(require\('\.\.\/\.\.\/\.\.\/assets\/sounds\/success\.mp3'\), \{ volume: 0\.65 \}\)/],
    ['src/screens/LinePlay/components/ActivitySlot.tsx', /studioMoment\('game\.correct'\)/],
    ['src/screens/ExploreScreen/ridePhoto/catchAudio.ts', /if \(moment && studioMoment\(moment, \{ volume: opts\.volume \}\)\) return;\n\s+GameAudio\.play\(cue, \{ volume: opts\.volume, pitch: opts\.pitch \}\);/],
    ['src/gamekit/SFX.ts', /const studio = !!moment && studioMoment\(moment, \{ volume: volumeScale \}\);\n\s+const id = studio \? 1 : GameAudio\.play\(cue, \{ volume: volumeScale \}\);/],
    // Wave 5 round 2: Daily 3 and the chest play through loopSound (climbing notes, the flame by streak day, the chest's
    // shaped buzz); off, today's success buzz and sound.
    // wow-loops integration (w5r3 preview): the rebuilt map button plays the check when it lands.
    ['src/components/retention/Daily3MapButton.tsx', /if \(playDaily3\(p\.done, p\.day, \{ syncMs: left, chordAfterMs: CHECK\.fullRing \}\)\) return;\n\s+later\(\(\) => \{ queueHaptic\('hitMedium'\); playSfx\(LOOP_CUES\.checkLand\.fallback, 0\.9\); \}, left\);/],
    ['src/components/DailyGiftModal.tsx', /if \(playChestOpen\(\)\) return;\n\s+void Haptics\.notificationAsync\(Haptics\.NotificationFeedbackType\.Success\)\.catch\(\(\) => undefined\);\n\s+playSfx\('win'\); playSfx\('coin', 0\.9\);/],
    ['src/components/retention/useRetention.tsx', /haptic\('success'\); if \(!studioMoment\('loop\.freeze'\)\) playSfx\('fx\.purchase'\);/],
  ];
  for (const [file, re] of sites) assert.match(read(file), re, file);
});

test('studio candidates stay out of release bundles; sound follows the silent switch on both backends', () => {
  const lib = read('src/gamekit/audio/studioLibrary.ts');
  assert.match(lib, /if \(typeof __DEV__ !== 'undefined' && __DEV__\) \{[\s\S]*?require\('\.\.\/\.\.\/assets\/games\/audio\/studio\.dev\.generated'\)/);
  for (const f of ['src/gamekit/audio/momentMap.ts', 'src/gamekit/audio/playMoment.ts', 'src/gamekit/audio/studioSwitch.ts']) {
    assert.doesNotMatch(read(f), /studio\.dev\.generated/, `${f} never imports the dev table`);
    assert.doesNotMatch(read(f), /—/, `${f}: no em dashes`);
  }
  const backends = read('src/gamekit/audio/backends.ts');
  assert.match(backends, /playsInSilentModeIOS: false/);
  assert.match(backends, /iosCategory: 'ambient'/);
});

test('success.mp3 is a real, clean sound', () => {
  const buf = fs.readFileSync(path.join(root, 'assets/sounds/success.mp3'));
  assert.ok(buf.length > 4000);
  assert.ok(buf.subarray(0, 3).toString('latin1') === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0));
});

test('the studio converter limits AAC overshoot instead of clipping it', () => {
  const src = read('tools/audio/sync-studio-audio.mjs');
  assert.match(src, /alimiter=limit=0\.84:attack=1:release=20:level=false:latency=true/);
  assert.match(src, /'-af', ONE_SHOT_LIMITER/);
});

test('music follows the moment: duck envelope and bar-line layer timing', () => {
  const mix = loadTs('src/gamekit/core/audioMix.ts');
  const d = map.MUSIC_RULES.duck;
  const db = (g) => 20 * Math.log10(g);
  assert.ok(Math.abs(db(mix.duckGainAt(d.attackMs, d.db, d.attackMs, d.holdMs, d.releaseMs)) + 6) < 0.01, '-6 dB at the end of the 60 ms attack');
  assert.ok(Math.abs(db(mix.duckGainAt(d.attackMs + d.holdMs, d.db, d.attackMs, d.holdMs, d.releaseMs)) + 6) < 0.01, 'held for 400 ms');
  assert.equal(mix.duckGainAt(d.attackMs + d.holdMs + d.releaseMs, d.db, d.attackMs, d.holdMs, d.releaseMs), 1, 'back to full over 400 ms');
  // MusicDirector.switchTo('bar', fade): the crossfade is centred on the next bar line (>= 40 ms lead).
  const text = read('src/assets/games/audio/studio.dev.generated.ts');
  for (const [game, layers] of Object.entries(map.BED_LAYERS)) {
    const m = new RegExp(`'${layers.base}': \\{[^}]*bpm: ([\\d.]+), beatsPerBar: (\\d+), offsetMs: (\\d+)`).exec(text);
    if (!m) continue; // beds without a measured grid switch on the beat map instead
    const clock = { bpm: +m[1], beatsPerBar: +m[2], offsetMs: +m[3] };
    const bar = mix.barMs(clock);
    for (const pos of [0, 333, bar - 30, bar * 3.5]) {
      const target = mix.nextBarMs(clock, pos, 40);
      const start = target - map.MUSIC_RULES.layerCrossfadeMs / 2;
      assert.ok(target - pos >= 40, `${game}: lead`);
      assert.ok(Math.abs(((target - clock.offsetMs) / bar) - Math.round((target - clock.offsetMs) / bar)) < 1e-6, `${game}: lands on a bar line`);
      assert.ok(start < target && start + map.MUSIC_RULES.layerCrossfadeMs > target, `${game}: the 200 ms crossfade straddles the bar`);
    }
  }
  const gameAudio = read('src/gamekit/audio/GameAudio.ts');
  assert.match(gameAudio, /const wait = Math\.max\(0, target - pos - fadeMs \/ 2\);/, 'switchTo centres the fade on the grid point');
});
