'use strict';
/**
 * Studio engine core (src/gamekit/core): pure, worklet-safe modules.
 * RNG + variety, easing/springs/recipes, the two-clock hit-stop model,
 * camera trauma, particles, combo/fever, scoring, replay, perf stats.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const rng = loadTs('src/gamekit/core/rng.ts');
const ease = loadTs('src/gamekit/core/ease.ts');
const clock = loadTs('src/gamekit/core/clock.ts');
const cam = loadTs('src/gamekit/core/camera.ts');
const px = loadTs('src/gamekit/core/particles.ts');
const combo = loadTs('src/gamekit/core/comboFever.ts');
const score = loadTs('src/gamekit/core/scoring.ts');
const replay = loadTs('src/gamekit/core/replay.ts');
const perf = loadTs('src/gamekit/core/perfStats.ts');

test('rng: seeded runs are exact, runs differ, helpers stay in range', () => {
  const a = rng.createRng(42), b = rng.createRng(42), c = rng.createRng(43);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 50; i++) { sa.push(rng.rngU32(a)); sb.push(rng.rngU32(b)); sc.push(rng.rngU32(c)); }
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  const r = rng.createRng(7);
  for (let i = 0; i < 2000; i++) {
    const f = rng.rngFloat(r); assert.ok(f >= 0 && f < 1);
    const n = rng.rngInt(r, 2, 5); assert.ok(n >= 2 && n <= 5 && Number.isInteger(n));
  }
  assert.notEqual(rng.deriveRunSeed(99, 0), rng.deriveRunSeed(99, 1));
  assert.equal(rng.deriveRunSeed(99, 3), rng.deriveRunSeed(99, 3));
  assert.equal(rng.hashString('whack'), rng.hashString('whack'));
  assert.equal(rng.rngWeighted(r, [0, 0]), -1);
  const counts = [0, 0, 0];
  for (let i = 0; i < 6000; i++) counts[rng.rngWeighted(r, [1, 0, 3])]++;
  assert.equal(counts[1], 0);
  assert.ok(counts[2] > counts[0] * 2);
});

test('variety: a shuffle bag covers everything per cycle and never repeats across the seam', () => {
  const bag = rng.createShuffleBag(5, 11);
  let prev = -1;
  for (let cycle = 0; cycle < 40; cycle++) {
    const seen = new Set();
    for (let i = 0; i < 5; i++) {
      const v = rng.bagNext(bag);
      assert.notEqual(v, prev, 'no back-to-back repeat');
      prev = v; seen.add(v);
    }
    assert.equal(seen.size, 5);
  }
  const r = rng.createRng(3);
  for (let i = 0; i < 200; i++) assert.notEqual(rng.pickFresh(r, [1, 1, 1], [0, 2]), 0);
  assert.equal(rng.pickFresh(r, [1, 0], [0]), 0, 'falls back when every option is recent');
});

test('easing and recipes: endpoints, overshoot, volume-preserving squash, springs settle', () => {
  for (const name of ['linear', 'outQuad', 'inOutCubic', 'outBack', 'outElastic', 'outBounce', 'inOutSine']) {
    assert.ok(Math.abs(ease.ease(name, 0)) < 1e-9, name);
    assert.ok(Math.abs(ease.ease(name, 1) - 1) < 1e-9, name);
  }
  assert.ok(Math.max(...Array.from({ length: 50 }, (_, i) => ease.ease('outBack', i / 49))) > 1.05);
  assert.ok(ease.anticipate(60) < 0, 'wind-up dips first');
  assert.ok(Math.max(...Array.from({ length: 60 }, (_, i) => ease.anticipate(90 + i * 3))) > 1, 'then overshoots');
  assert.equal(ease.anticipate(2000), 1);
  const s = ease.squashStretch(-0.2);
  assert.ok(Math.abs(s.sx * s.sx * s.sy - 1) < 1e-9, 'area preserved');
  assert.equal(ease.popScale(5000), 1);
  assert.ok(ease.slamScale(0) > 2);
  assert.equal(ease.slamScale(1000), 1);
  const spring = { x: 0, v: 0 };
  for (let i = 0; i < 120; i++) ease.springStep(spring, 1, ease.SPRINGS.settle, 1 / 60);
  assert.ok(Math.abs(spring.x - 1) < 0.01);
  const track = { t: [0, 100, 200], v: [0, 10, 0], e: ['outQuad', 'inQuad'] };
  assert.equal(ease.evalTrack(track, 100), 10);
  assert.equal(ease.evalTrack(track, 999), 0);
  assert.ok(ease.beatBop(0, 120) > ease.beatBop(250, 120));
});

test('clock: fx hit-stop never changes gameplay time (40 stops vs none give identical sim)', () => {
  const run = (stops) => {
    const c = clock.createClock({ freezeBudget: 1 });
    for (let f = 0; f < 600; f++) {
      if (stops && f % 15 === 0 && f / 15 < 40) clock.hitStop(c, 70);
      clock.advanceClock(c, 1000 / 60);
      clock.drainSteps(c, 1000 / 60);
    }
    return c;
  };
  const a = run(false), b = run(true);
  assert.equal(b.steps, a.steps);
  assert.ok(Math.abs(b.simMs - a.simMs) < 1e-6);
  assert.ok(b.fxMs < a.fxMs - 1000, 'presentation really froze');
});

test('clock: sim hit-stop holds gameplay, slow-mo eases back, budget and stacking cap freezes', () => {
  const c = clock.createClock();
  clock.hitStop(c, 110, { holdSim: true, force: true });
  clock.advanceClock(c, 50);
  assert.equal(c.simMs, 0, 'taps during a sim freeze are stamped at the frozen time');
  clock.advanceClock(c, 100);
  assert.ok(c.simMs > 0 && c.simMs < 100);
  const s = clock.createClock();
  clock.slowMo(s, 0.35, 280, 120);
  clock.advanceClock(s, 100);
  assert.ok(Math.abs(s.lastFxDt - 35) < 1e-6);
  assert.ok(Math.abs(s.lastSimDt - 100) < 1e-6, 'fx slow-mo leaves sim wall-locked');
  for (let i = 0; i < 30; i++) clock.advanceClock(s, 16);
  assert.equal(s.slowScale, 1);
  const st = clock.createClock();
  const g1 = clock.hitStop(st, 100);
  clock.advanceClock(st, 16);
  const g2 = clock.hitStop(st, 100);
  clock.advanceClock(st, 16);
  const g3 = clock.hitStop(st, 100);
  assert.deepEqual([g1, g2, g3].map(Math.round), [100, 60, 35]);
  const b = clock.createClock({ freezeBudget: 0.02, budgetWindowMs: 5000 });
  let granted = 0;
  for (let f = 0; f < 60 * 10; f++) {
    if (f % 20 === 0) granted += clock.hitStop(b, 90, { });
    clock.advanceClock(b, 1000 / 60);
  }
  assert.ok(b.frozenTotalMs / b.wallMs <= 0.035, `freeze share ${(b.frozenTotalMs / b.wallMs).toFixed(3)}`);
});

test('clock: local hit-stop holds only its slot; pause freezes everything; snapshots restore', () => {
  const c = clock.createClock({ slots: 9 });
  clock.advanceClock(c, 16);
  clock.localStop(c, 4, 65);
  clock.advanceClock(c, 16);
  assert.equal(clock.slotDt(c, 4), 0);
  assert.ok(clock.slotDt(c, 3) > 0);
  for (let i = 0; i < 6; i++) clock.advanceClock(c, 16);
  assert.ok(clock.slotDt(c, 4) > 0);
  clock.pauseClock(c);
  const before = c.simMs;
  clock.advanceClock(c, 500);
  assert.equal(c.simMs, before);
  clock.resumeClock(c);
  const snap = clock.clockSnapshot(c);
  const d = clock.createClock();
  clock.restoreClock(d, snap);
  assert.equal(d.simMs, c.simMs);
});

test('camera: trauma is squared, capped short, and zero in reduced motion', () => {
  const c = cam.createCamera({}, 3);
  cam.addTrauma(c, 0.3);
  let small = 0;
  for (let i = 0; i < 6; i++) { cam.stepCamera(c, 16); small = Math.max(small, Math.abs(c.x)); }
  const d = cam.createCamera({}, 3);
  cam.addTrauma(d, 1);
  let big = 0;
  for (let i = 0; i < 6; i++) { cam.stepCamera(d, 16); big = Math.max(big, Math.abs(d.x)); }
  assert.ok(big > small * 3, 'big moments land, small hits barely move');
  for (let i = 0; i < 30; i++) cam.stepCamera(d, 16);
  assert.ok(d.trauma === 0, 'the cap ends the shake quickly');
  const r = cam.createCamera({ intensity: 0 });
  cam.addTrauma(r, 1); cam.punchZoom(r, 0.1); cam.kick(r, 5, 5);
  cam.stepCamera(r, 16);
  assert.equal(r.x, 0); assert.equal(r.zoom, 1);
  const p = cam.createCamera();
  cam.punchZoom(p, 0.06, 90);
  cam.stepCamera(p, 90);
  assert.ok(Math.abs(p.zoom - 1.06) < 0.002);
  for (let i = 0; i < 120; i++) cam.stepCamera(p, 16);
  assert.ok(Math.abs(p.zoom - 1) < 0.002);
});

test('particles: emit, integrate, magnet arrivals, priority culling and layer budgets', () => {
  const pool = px.createParticlePool(40, 1);
  const n = px.emit(pool, px.EMITTERS.stars, 100, 100);
  assert.equal(n, 6);
  assert.equal(pool.live, 6);
  px.stepParticles(pool, 0.1);
  const i = pool.alive.indexOf(1);
  assert.ok(px.particleAlpha(pool, i) > 0 && px.particleSize(pool, i) > 0);
  for (let k = 0; k < 60; k++) px.stepParticles(pool, 1 / 60);
  assert.equal(pool.live, 0, 'stars die by their life');
  px.emit(pool, px.EMITTERS.coins, 50, 300, { count: 10, tx: 20, ty: 20, magnetDelay: 0.3, magnetDur: 0.45 });
  for (let k = 0; k < 120; k++) px.stepParticles(pool, 1 / 60);
  assert.equal(px.takeArrivals(pool), 10, 'every magnetized coin arrives');
  px.clearParticles(pool);
  px.emit(pool, px.EMITTERS.bubbles, 0, 0, { count: 40 });
  assert.equal(pool.live, 40);
  const got = px.emit(pool, px.EMITTERS.confetti, 0, 0, { count: 10 });
  assert.equal(got, 10, 'major FX evict ambient bubbles');
  assert.equal(pool.live, 40);
  px.emit(pool, px.EMITTERS.bubbles, 0, 0, { count: 60 });
  assert.equal(pool.prio.filter((p, k) => pool.alive[k] === 1 && p === px.PRIO.major).length, 10, 'ambient never evicts major FX');
  const layered = px.createParticlePool(30, 2, [20, 5, 5]);
  px.emit(layered, px.EMITTERS.glints, 0, 0, { count: 10, layer: px.LAYER.party });
  assert.equal(layered.layerLive[1], 5, 'party layer respects its budget');
  const conf = px.createParticlePool(4, 3);
  px.emit(conf, px.EMITTERS.confetti, 0, 0, { count: 1 });
  const seen = new Set();
  for (let k = 0; k < 60; k++) { px.stepParticles(conf, 1 / 60); const j = conf.alive.indexOf(1); if (j >= 0) seen.add(px.particleSprite(conf, j)); }
  assert.ok(seen.size >= 3, 'confetti flutters through foreshortened frames');
  assert.equal(px.packHex('#ffcf3b'), 0xffffcf3b);
});

test('combo/fever: tiers, streak fever, meter fever, grace misses, Infinity window', () => {
  const s = combo.createComboFever();
  let tierUps = 0, fever = 0;
  for (let i = 0; i < 10; i++) {
    const ev = combo.comboFeverHit(s, i * 100);
    if (combo.hasEv(ev, combo.EV_TIER_UP)) tierUps++;
    if (combo.hasEv(ev, combo.EV_FEVER_START)) fever++;
  }
  assert.equal(tierUps, 3);
  assert.equal(fever, 1);
  assert.equal(combo.comboMultiplier(s), 5);
  assert.ok(combo.hasEv(combo.comboFeverTick(s, 3000), combo.EV_TIMEOUT), 'the window lapses');
  assert.equal(s.fever, true, 'a lapsed streak keeps the fever it earned');
  assert.ok(combo.hasEv(combo.comboFeverTick(s, 900 + 6000), combo.EV_FEVER_END));
  const inf = combo.createComboFever({ ...combo.DEFAULT_COMBO_FEVER, windowMs: Infinity });
  combo.comboFeverHit(inf, 0); combo.comboFeverHit(inf, 1e7);
  assert.equal(inf.streak, 2, 'Whack: only misses break');
  const grace = combo.createComboFever({ ...combo.DEFAULT_COMBO_FEVER, graceMisses: 1 });
  for (let i = 0; i < 5; i++) combo.comboFeverHit(grace, i);
  assert.ok(combo.hasEv(combo.comboFeverMiss(grace, 6), combo.EV_GRACE));
  assert.equal(grace.streak, 5, 'one walking bump is forgiven');
  assert.ok(combo.hasEv(combo.comboFeverMiss(grace, 7), combo.EV_BREAK));
  assert.equal(grace.lastBreak, 5);
  const meter = combo.createComboFever({ ...combo.DEFAULT_COMBO_FEVER, fever: { ...combo.DEFAULT_COMBO_FEVER.fever, mode: 'meter', chargePerHit: 0.25 } });
  let started = false;
  for (let i = 0; i < 4; i++) started = started || combo.hasEv(combo.comboFeverHit(meter, i * 10), combo.EV_FEVER_START);
  assert.ok(started);
  assert.ok(!Object.values(combo.TIER_COLORS).some(c => /7c4dff|purple/i.test(c)), 'no purple tier');
});

test('scoring: stars, next-star goal with near-miss, best, count-up, flurry tally', () => {
  const t = { one: 500, two: 1200, three: 2000 };
  assert.equal(score.starsFor(499, t), 0);
  assert.equal(score.starsFor(2000, t), 3);
  const g = plain(score.nextStarGoal(1100, t));
  assert.equal(g.nextStar, 2); assert.equal(g.remaining, 100); assert.equal(g.near, true);
  assert.equal(score.nextStarGoal(500 - 1, t).target, 500, 'a 0-star run still gets a target');
  assert.equal(score.nextStarGoal(3000, t).nextStar, 0);
  assert.equal(score.compareBest(900, 800).isNewBest, true);
  assert.equal(score.compareBest(0, undefined).isNewBest, false);
  assert.equal(score.formatScore(1234567), '1,234,567');
  assert.equal(score.countUpValue(0, 1000, 0, 500), 0);
  assert.equal(score.countUpValue(0, 1000, 500, 500), 1000);
  assert.ok(score.countUpMs(0, 10) < score.countUpMs(0, 100000));
  const f = score.createFlurry(900, 3);
  assert.deepEqual([score.flurryHit(f, 0, 100), score.flurryHit(f, 200, 100), score.flurryHit(f, 400, 150), score.flurryHit(f, 500, 100)],
    [score.FLURRY_SINGLE, score.FLURRY_SINGLE, score.FLURRY_START, score.FLURRY_GROW]);
  assert.equal(f.points, 450);
  assert.equal(score.flurryResolve(f, 700), false);
  assert.equal(score.flurryResolve(f, 900), true);
});

test('replay: logs encode compactly, decode exactly, and replay deterministically', () => {
  const log = replay.createInputLog(16);
  replay.logInput(log, 12, 1, 4, -3);
  replay.logInput(log, 12, 2, 0, 0);
  replay.logInput(log, 400, 1, 8, 250);
  const text = replay.encodeInputLog(log);
  assert.ok(text.startsWith('v1:'));
  assert.deepEqual(plain(replay.decodeInputLog(text)), plain(replay.logEntries(log)));
  for (let i = 0; i < 20; i++) replay.logInput(log, 500 + i, 1);
  assert.equal(log.overflow, true);
  const entries = replay.decodeInputLog(text);
  const sim = () => replay.replayRun({ score: 0 }, entries, 600, (st, i, due) => { for (const e of due) st.score += e.a * 10 + i; });
  assert.deepEqual(plain(sim()), plain(sim()));
  const ghost = replay.createGhost(entries);
  assert.equal(replay.ghostDue(ghost, 11), 0);
  assert.equal(replay.ghostDue(ghost, 12), 2);
  assert.equal(replay.ghostDue(ghost, 10000), 1);
  assert.ok(replay.ghostDone(ghost));
  assert.equal(replay.trackValueAt({ t: [0, 1000], v: [0, 500] }, 500), 250);
});

test('perf stats: fps p5 reflects the bad frames, not the average', () => {
  const s = perf.createFrameStats(200);
  for (let i = 0; i < 185; i++) perf.recordFrame(s, 16.6);
  for (let i = 0; i < 15; i++) perf.recordFrame(s, 40);
  const sum = plain(perf.summarize(s));
  assert.ok(sum.fpsAvg > 50);
  assert.ok(sum.fpsP5 < 30, `p5 ${sum.fpsP5}`);
  assert.equal(sum.worstMs, 40);
  assert.deepEqual(perf.recentFrames(s, 3, []), [40, 40, 40]);
});
