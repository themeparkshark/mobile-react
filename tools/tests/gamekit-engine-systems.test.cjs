'use strict';
/**
 * Studio engine systems: audio mix rules, the GameAudio engine (with a fake
 * backend), haptic grammar, the interruption/session model (QUEUE REALITY),
 * the feel grammar, and the studio audio sync tool.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const mix = loadTs('src/gamekit/core/audioMix.ts');
const grammar = loadTs('src/gamekit/core/hapticGrammar.ts');
const session = loadTs('src/gamekit/core/session.ts');

test('audio mix: cooldown merges, per-cue caps steal the oldest, the global cap respects priority', () => {
  const v = (id, cue, priority, startedAt) => ({ id, cue, priority, startedAt, endsAt: 0 });
  const req = (over) => ({ cue: 'bonk', priority: 1, now: 1000, maxVoicesForCue: 2, cooldownMs: 30, lastPlayedAt: -1e9, ...over });
  assert.deepEqual(plain(mix.allocateVoice([], req({ lastPlayedAt: 990 }), 12)), { action: 'drop', why: 'cooldown' });
  assert.deepEqual(plain(mix.allocateVoice([v(1, 'bonk', 1, 10), v(2, 'bonk', 1, 5)], req(), 12)), { action: 'steal', victimId: 2 });
  const full = [v(1, 'tell', 0, 3), v(2, 'coin', 2, 1), v(3, 'tell', 0, 1)];
  assert.deepEqual(plain(mix.allocateVoice(full, req({ cue: 'hit', priority: 2 }), 3)), { action: 'steal', victimId: 3 }, 'impacts steal the oldest tell');
  assert.deepEqual(plain(mix.allocateVoice([v(1, 'a', 3, 1), v(2, 'b', 3, 2)], req({ cue: 'c', priority: 1 }), 2)), { action: 'drop', why: 'busy' });
  const ended = [{ id: 1, cue: 'bonk', priority: 1, startedAt: 0, endsAt: 500 }, { id: 2, cue: 'bonk', priority: 1, startedAt: 0, endsAt: 600 }];
  assert.equal(mix.allocateVoice(ended, req(), 12).action, 'play', 'finished voices free their slot');
});

test('audio mix: ducking envelope, beat grid, equal-power crossfade, pitch maths', () => {
  const depth = mix.dbToGain(-6);
  assert.equal(mix.duckGainAt(-1, 6, 60, 300, 300), 1);
  assert.ok(Math.abs(mix.duckGainAt(100, 6, 60, 300, 300) - depth) < 1e-9);
  assert.equal(mix.duckGainAt(1000, 6, 60, 300, 300), 1);
  const clock = { bpm: 120, beatsPerBar: 4, offsetMs: 0 };
  assert.equal(mix.nextGridMs(clock, 100), 500);
  assert.equal(mix.nextBarMs(clock, 100), 2000);
  assert.equal(mix.nextBarMs(clock, 1990, 40), 4000, 'too close to the bar line: take the next one');
  const [o, i] = mix.equalPower(0.5);
  assert.ok(Math.abs(o * o + i * i - 1) < 1e-9);
  assert.ok(Math.abs(mix.semitonesToRate(12) - 2) < 1e-9);
  assert.equal(mix.loopPosition(-100, 1000), 900);
});

function loadAudioEngine(dev = false) {
  const src = fs.readFileSync(path.join(root, 'src/gamekit/audio/chrisBank.ts'), 'utf8');
  const stubs = {};
  for (const m of src.matchAll(/require\('([^']+)'\)/g)) stubs[m[1]] = m[1];
  const calls = { loads: [], plays: [], stops: [], music: [] };
  class FakeBackend {
    constructor() { this.name = 'expo-av'; this.supportsPan = false; this.supportsFilter = false; this.latencyMs = 80; this.token = 1; this.keys = new Set(); }
    async init() {}
    async load(key) { calls.loads.push(key); this.keys.add(key); return true; }
    isLoaded(key) { return this.keys.has(key); }
    play(key, args) { calls.plays.push({ key, ...args }); return this.token++; }
    stop(t) { calls.stops.push(t); }
    stopAll() {}
    musicStart(deck, key, args) { calls.music.push(['start', deck, key, args.gain]); }
    musicGain(deck, gain) { calls.music.push(['gain', deck, Math.round(gain * 1000) / 1000]); }
    musicStop(deck) { calls.music.push(['stop', deck]); }
    async musicPosition() { return 0; }
    musicFilter() {}
    setMasterGain() {}
    async unloadAll() {}
  }
  stubs['./backends'] = { ExpoAvBackend: FakeBackend, AudioApiBackend: FakeBackend, HybridBackend: FakeBackend, audioApiAvailable: () => false };
  const mod = loadTs('src/gamekit/audio/GameAudio.ts', stubs, { __DEV__: dev, setInterval, clearInterval });
  return { GameAudio: mod.GameAudio, calls };
}

test('GameAudio: Chris cues, cooldown merges, polyphony stealing, ladders, variants and mute', async () => {
  const { GameAudio, calls } = loadAudioEngine();
  await GameAudio.init();
  GameAudio.registerCues({
    bonk: { src: 1, ladder: [2, 3, 4], maxVoices: 2, cooldownMs: 20 },
    pop: { src: 5, variants: [6, 7] },
  });
  await GameAudio.preload(['bonk', 'pop', 'fx.coin']);
  assert.ok(GameAudio.play('fx.coin') > 0, "Chris's coin is wired");
  assert.equal(calls.plays.at(-1).durationMs, 700, 'coin.mp3 trimmed to its first 700ms');
  const realNow = Date.now;
  let now = 10000;
  Date.now = () => now;
  try {
    assert.ok(GameAudio.play('bonk') > 0);
    now += 5;
    assert.equal(GameAudio.play('bonk'), 0, 'a repeat inside the cooldown merges');
    now += 30; GameAudio.play('bonk');
    now += 30; GameAudio.play('bonk');
    assert.equal(calls.stops.length, 1, 'the third overlapping bonk steals the oldest voice');
    now += 30;
    GameAudio.playLadder('bonk', 9);
    assert.equal(calls.plays.at(-1).key, 'bonk#l2', 'ladder clamps to its top step');
    const picks = [];
    for (let i = 0; i < 12; i++) { now += 100; GameAudio.play('pop'); picks.push(calls.plays.at(-1).key); }
    for (let i = 1; i < picks.length; i++) assert.notEqual(picks[i], picks[i - 1], 'variants never repeat back to back');
    GameAudio.setSfxEnabled(false);
    now += 100;
    assert.equal(GameAudio.play('pop'), 0);
    assert.equal(GameAudio.play('nope-not-a-cue'), 0);
  } finally {
    Date.now = realNow;
  }
});

test('GameAudio: unapproved studio cues fall back to Chris in release, play as-is in dev', async () => {
  for (const dev of [false, true]) {
    const { GameAudio, calls } = loadAudioEngine(dev);
    await GameAudio.init();
    GameAudio.registerCues({ wh_bonk: { src: 9, approved: false, fallback: 'fx.hit' } });
    await GameAudio.preload(['wh_bonk', 'fx.hit']);
    GameAudio.play('wh_bonk');
    assert.equal(calls.plays.at(-1).key, dev ? 'wh_bonk#0' : 'fx.hit#0');
  }
});

test('GameAudio: music beds crossfade, duck under stingers and never stop for a line-moving trim', async () => {
  const { GameAudio, calls } = loadAudioEngine();
  await GameAudio.init();
  const bridge = { suspended: 0, restored: 0 };
  GameAudio.music.setAppMusicBridge({ suspend: () => bridge.suspended++, restore: () => bridge.restored++ });
  await GameAudio.music.play('chris.track1', 0);
  await GameAudio.music.play('chris.track2', 300);
  assert.deepEqual(calls.music.filter((m) => m[0] === 'start').map((m) => [m[1], m[2]]), [['A', 'bed:chris.track1'], ['B', 'bed:chris.track2']]);
  assert.equal(bridge.suspended, 1, 'the app rotation hands off once');
  GameAudio.music.setTrimDb(-3);
  assert.ok(!calls.music.some((m) => m[0] === 'stop' && m[1] === 'B'), 'a trim never stops the bed');
  GameAudio.music.stop(0);
  assert.equal(bridge.restored, 1);
});

test('haptic grammar: one per gap, stronger or telegraph wins, P0 always fires, rivals never buzz', () => {
  const s = grammar.createHapticScheduler(60);
  assert.equal(grammar.admitHaptic(s, 0, 3, grammar.HP.own), true);
  assert.equal(grammar.admitHaptic(s, 20, 2, grammar.HP.own), false, 'weaker inside the gap is dropped');
  assert.equal(grammar.admitHaptic(s, 30, 5, grammar.HP.own), true, 'stronger wins the collision');
  assert.equal(grammar.admitHaptic(s, 40, 1, grammar.HP.telegraph), true, 'tells outrank reactions');
  assert.equal(grammar.admitHaptic(s, 45, 1, grammar.HP.critical), true, 'P0 always fires');
  assert.equal(grammar.admitHaptic(s, 500, 6, grammar.HP.rival), false);
  const valid = new Set(Object.keys(grammar.PRIMITIVE_STRENGTH));
  for (const [name, steps] of Object.entries(grammar.HAPTIC_PATTERNS)) {
    assert.ok(steps.length > 0 && steps.every((st) => valid.has(st.p) && st.at >= 0), name);
  }
  assert.equal(grammar.HAPTIC_PATTERNS.lane3.length, 3, 'lane signatures are countable by feel');
});

test('QUEUE REALITY session model: movement never pauses; snapshots are keyed and expire', () => {
  assert.equal(session.movementPauses('playThrough'), false);
  assert.equal(session.movementPauses('pause'), false, 'even the legacy pause policy plays through');
  const snap = session.makeSnapshot('whack', 'whack:ride:1', 'background', 1000, { score: 5, simMs: 900, steps: 54, state: { a: 1 } });
  assert.equal(session.snapshotUsable(snap, 'whack:ride:1', 2000), true);
  assert.equal(session.snapshotUsable(snap, 'whack:ride:2', 2000), false, 'never restore another run');
  assert.equal(session.snapshotUsable(snap, 'whack:ride:1', 1000 + session.SNAPSHOT_TTL_MS + 1), false);
  assert.equal(session.snapshotUsable(JSON.parse(JSON.stringify(snap)), 'whack:ride:1', 2000), true, 'survives storage');
});

test('QUEUE REALITY resume gate: hold, quick 3-2-1 (about 1.1s), interruptions mid-count, wrap-up is final', () => {
  const g = session.createResumeGate(300, 200);
  assert.equal(session.holdGate(g, 'background', 0), true);
  assert.equal(session.holdGate(g, 'manual', 10), false, 'already held');
  session.beginResume(g, 5000);
  const labels = [];
  let last = '';
  let resumedAt = -1;
  for (let t = 5000; t <= 6300; t += 50) {
    const tk = session.tickGate(g, t, last);
    if (tk.beat) labels.push(tk.label);
    if (tk.label) last = tk.label;
    if (tk.resumed) { resumedAt = t; break; }
  }
  assert.deepEqual(labels, ['3', '2', '1', 'GO']);
  assert.equal(resumedAt, 6100, 'three 300ms beats plus a 200ms GO');
  assert.equal(g.phase, 'live');
  assert.equal(g.heldTotalMs, 6100);
  session.holdGate(g, 'manual', 7000);
  session.beginResume(g, 7100);
  session.holdGate(g, 'background', 7200);
  assert.equal(g.phase, 'held', 'pocketing during the count re-holds');
  assert.equal(session.wrapGate(g, 'boarding', 8000), true);
  assert.equal(session.holdGate(g, 'manual', 8100), false);
  assert.equal(session.wrapGate(g, 'left-queue', 8200), false);
  assert.equal(session.WRAP_UP_COPY.boarding.title, "YOUR RIDE'S UP!");
});

test('QUEUE REALITY heads-up: shows when the line advances a lot, never nags', () => {
  const h = session.createHeadsUp({ metres: 8, events: 4, windowMs: 20000, cooldownMs: 45000, showMs: 2600 });
  assert.equal(session.reportAdvance(h, 0, 2), false, 'a normal shuffle is silent');
  assert.equal(session.reportAdvance(h, 1000, 2), false);
  assert.equal(session.reportAdvance(h, 2000, 5), true, 'a big advance shows the heads-up');
  assert.equal(session.headsUpVisible(h, 3000), true);
  assert.equal(session.headsUpVisible(h, 5000), false);
  for (let t = 3000; t < 40000; t += 1000) assert.equal(session.reportAdvance(h, t, 5), false, 'cooldown: no nagging');
  assert.equal(session.reportAdvance(h, 48000, 9), true);
  const slow = session.createHeadsUp();
  assert.equal(session.reportAdvance(slow, 0, 1), false);
  assert.equal(session.reportAdvance(slow, 30000, 1), false, 'advances outside the window do not add up');
});

test('feel grammar: one call fires sound, haptic, time, camera and FX; rivals and calm mode are respected', () => {
  const log = [];
  const feelMod = loadTs('src/gamekit/feel.ts', {
    react: { useCallback: (fn) => fn, useRef: (v) => ({ current: v }) },
    './audio/GameAudio': { GameAudio: {
      play: (n, o) => log.push(['play', n, Math.round(o.pan * 100) / 100]),
      playLadder: (n, s) => log.push(['ladder', n, s]),
      duck: (db) => log.push(['duck', db]) } },
    './Haptics': { playHaptic: (p, o) => log.push(['haptic', p, o.priority]), HP: { own: 2, telegraph: 3 } },
  });
  const deps = {
    width: 300,
    fx: { current: {
      burst: (e, x, y, p) => log.push(['burst', e, p.tx ?? null]), ring: () => log.push(['ring']), flash: () => log.push(['flash']),
      bloom: () => log.push(['bloom']), vignette: () => log.push(['vignette']), flyUp: (t) => log.push(['flyUp', t]) } },
    camera: { shake: (t) => log.push(['shake', t]), punch: (a) => log.push(['punch', a]), kick: (x, y) => log.push(['kick', Math.round(x), Math.round(y)]) },
    clock: { hitStop: (ms, o) => log.push(['hitStop', ms, !!o.holdSim]), localStop: (s, ms) => log.push(['local', s, ms]), slowMo: (s) => log.push(['slowMo', s]) },
  };
  const def = { sfx: 'bonk', spatial: true, haptic: 'quickHit', localStop: 65, hitStop: 110, hitStopSim: true, shake: 0.25, kick: 3,
    burst: [{ emitter: 'coins', magnet: true }], ring: {}, flyUp: { size: 'lg' } };
  feelMod.fireFeel(def, { x: 0, y: 10, slot: 4, text: 'QUICK +150', dx: 0, dy: -1, magnetTo: { x: 280, y: 5 } }, deps);
  assert.deepEqual(log.slice(0, 2), [['play', 'bonk', -0.6], ['haptic', 'quickHit', 2]], 'sound and haptic first, panned by x');
  assert.ok(log.some((e) => e[0] === 'hitStop' && e[1] === 110 && e[2] === true));
  assert.ok(log.some((e) => e[0] === 'local' && e[1] === 4));
  assert.ok(log.some((e) => e[0] === 'kick' && e[2] === -3));
  assert.ok(log.some((e) => e[0] === 'burst' && e[1] === 'coins' && e[2] === 280), 'coins magnetize to the HUD');
  assert.ok(log.some((e) => e[0] === 'flyUp' && e[1] === 'QUICK +150'));
  log.length = 0;
  feelMod.fireFeel({ sfx: 'bonk', ladder: true, haptic: 'goodHit', shake: 0.3 }, { step: 5, rival: true }, { ...deps, calm: true });
  assert.deepEqual(log, [['ladder', 'bonk', 5]], 'rival-caused: no haptic; calm (walking/reduced motion): no camera');
});

test('studio audio sync: infers ladders and lanes, converts one-shots to WAV, splits approved from dev', { skip: spawnSync('ffmpeg', ['-version']).status !== 0 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-audio-'));
  const src = path.join(tmp, 'audio');
  const out = path.join(tmp, 'out');
  const tone = (file, channels = 1) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=0.2',
      '-ac', String(channels), '-c:a', 'aac', file]);
  };
  tone(path.join(src, 'whack/wh_bonk.m4a'));
  for (const n of ['00', '01', '02']) tone(path.join(src, `whack/wh_bonk_${n}.m4a`));
  tone(path.join(src, 'whack/music/mus_whack_main.m4a'), 2);
  tone(path.join(src, 'whack/music/sting_whack_win.m4a'), 2);
  for (const note of ['G5', 'C5', 'E5']) for (const pan of ['R', 'L']) tone(path.join(src, `boss/lanes/tell_kraken_${note}_${pan}.m4a`), 2);
  tone(path.join(src, 'shared/sh_impact.m4a'));
  fs.writeFileSync(path.join(src, 'APPROVED.json'), JSON.stringify({ approved: ['sh_impact'] }));
  execFileSync('node', [path.join(root, 'tools/audio/sync-studio-audio.mjs'), '--src', src, '--out', out]);
  const shipped = fs.readFileSync(path.join(out, 'studio.generated.ts'), 'utf8');
  const dev = fs.readFileSync(path.join(out, 'studio.dev.generated.ts'), 'utf8');
  assert.match(shipped, /'sh_impact': \{ src: require\('\.\/shared\/sh_impact\.wav'\).*approved: true/);
  assert.doesNotMatch(shipped, /wh_bonk/, 'unapproved cues never ship');
  assert.match(dev, /'wh_bonk': \{ src: require\('\.\/whack\/wh_bonk\.wav'\), ladder: \[require\('\.\/whack\/wh_bonk_00\.wav'\), require\('\.\/whack\/wh_bonk_01\.wav'\), require\('\.\/whack\/wh_bonk_02\.wav'\)\]/);
  assert.match(dev, /'mus_whack_main': \{ src: require\('\.\/whack\/music\/mus_whack_main\.m4a'\)/, 'loops become beds and stay compressed');
  assert.match(dev, /'sting_whack_win': \{ src: require\('\.\/whack\/music\/sting_whack_win\.m4a'\).*bus: 'stinger'/);
  const lanes = /'tell_kraken_lanes': \{ ladder: \[([^\]]+)\]/.exec(dev)[1];
  assert.deepEqual(lanes.match(/tell_kraken_[A-G]\d_[LR]/g), ['tell_kraken_C5_L', 'tell_kraken_C5_R', 'tell_kraken_E5_L', 'tell_kraken_E5_R', 'tell_kraken_G5_L', 'tell_kraken_G5_R']);
  const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,channels', '-of', 'csv=p=0', path.join(out, 'boss/lanes/tell_kraken_C5_L.wav')]).toString().trim();
  assert.equal(probe, 'pcm_s16le,2', 'panned lane files stay stereo WAV');
  fs.rmSync(tmp, { recursive: true, force: true });
});
