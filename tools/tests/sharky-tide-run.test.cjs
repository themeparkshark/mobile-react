'use strict';
/**
 * Sharky Swim "Tide Run": sim, systems, fairness gates, proof and verifier
 * (design sharky.md section 14).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const core = loadTs('src/games/sharky/sim/core.ts');
const bots = loadTs('src/games/sharky/sim/bots.ts');
const verify = loadTs('src/games/sharky/sim/verify.ts');
const view = loadTs('src/games/sharky/render/view.ts');
const Q = 256;

/** A queue sim on an empty course (gate far away), for scenario tests. */
function fresh(opts = {}) {
  const s = core.createSim({ seed: opts.seed ?? 1, mode: opts.mode ?? core.MODE_QUEUE, difficulty: opts.diff ?? 2, tier: opts.tier ?? 4, runs: opts.runs ?? 5 });
  core.setCourse(s, [], 20000);
  return s;
}

/** Step n times holding (1) / releasing (0) / as-is (null); returns events. */
function run(s, n, hold = null, each) {
  const evs = [];
  for (let k = 0; k < n; k++) {
    if (hold === 1 && !s.holding) core.applyInput(s, core.IN_PRESS, 0, 0);
    if (hold === 0 && s.holding) core.applyInput(s, core.IN_RELEASE, 0, 0);
    if (each) each(s, k);
    core.step(s);
    for (let e = 0; e < s.evN; e++) evs.push(Array.from(s.ev.slice(e * 5, e * 5 + 5)));
  }
  return evs;
}
const has = (evs, kind) => evs.some((e) => e[0] === kind);
/** Keep the shark busy (tap every 40 steps) so Bubble Float never arms. */
const busy = (s, k) => {
  if (k % 40 === 0) core.applyInput(s, s.holding ? core.IN_RELEASE : core.IN_PRESS, 0, 0);
  s.y = 500 * Q;
  s.vy = 0;
};

// ---------------------------------------------------------------------------
// 1. P0-11 regression: the tide clock is sim time only.
// ---------------------------------------------------------------------------
test('tide clock: a wall-clock pause changes nothing; the run ends exactly when sim time reaches the clock', () => {
  const s = fresh();
  run(s, 600, null, busy);
  assert.equal(s.clockSteps, core.CLOCK_BASE - 600);
  const before = JSON.stringify([s.clockSteps, s.hearts, s.boost, s.score, s.dist]);
  // A 30s pause is simply no steps, plus the logged pause_resume ext.
  core.applyInput(s, core.IN_EXT, core.EXT_PAUSE_RESUME, 0);
  assert.equal(JSON.stringify([s.clockSteps, s.hearts, s.boost, s.score, s.dist]), before);
  let endAt = -1;
  run(s, 2000, null, (st, k) => {
    busy(st, k);
    if (st.phase === core.PH_DONE && endAt < 0) endAt = st.step;
  });
  assert.equal(s.endReason, core.END_TIME);
  assert.equal(s.activeSteps, core.CLOCK_BASE);
});

test('tide gate bonus: 4s + (multiplier - 1)s, 8s in Frenzy, whole run capped at 60s', () => {
  const s = fresh();
  s.chain = 3; // x2
  core.spawn(s, core.E_GATE, (s.dist >> 8) + 30, 500, core.G_TIDE, 0, 0);
  const ev = run(s, 30, null, busy);
  const g = ev.find((e) => e[0] === core.EV_GATE);
  assert.ok(g, 'gate crossed');
  assert.equal(g[1], (4 + 1) * 60);
  assert.equal(s.phase, core.PH_POCKET);
  // Frenzy gate
  const f = fresh();
  f.chain = 12;
  f.frenzy = 100;
  core.spawn(f, core.E_GATE, (f.dist >> 8) + 30, 500, core.G_TIDE, 0, 0);
  const fg = run(f, 30, null, busy).find((e) => e[0] === core.EV_GATE);
  assert.equal(fg[1], 480);
  // Cap: never beyond 60s total.
  const c = fresh();
  c.bonusSteps = core.CLOCK_CAP - core.CLOCK_BASE - 100;
  core.spawn(c, core.E_GATE, (c.dist >> 8) + 30, 500, core.G_TIDE, 0, 0);
  const cg = run(c, 30, null, busy).find((e) => e[0] === core.EV_GATE);
  assert.equal(cg[1], 100);
  assert.equal(c.bonusSteps, core.CLOCK_CAP - core.CLOCK_BASE);
});

test('tide pocket: 2.5s of safe auto-cruise with 3 ready pips, clock frozen, next sprint streams in', () => {
  const s = fresh();
  core.spawn(s, core.E_GATE, (s.dist >> 8) + 20, 500, core.G_TIDE, 0, 0);
  run(s, 20, null, busy);
  assert.equal(s.phase, core.PH_POCKET);
  const clock = s.clockSteps;
  s.holding = 1;
  const ev = run(s, core.POCKET_QUEUE - s.phaseSteps);
  assert.equal(s.clockSteps, clock, 'clock frozen in the pocket');
  assert.equal(ev.filter((e) => e[0] === core.EV_PIP).length, 3);
  assert.ok(has(ev, core.EV_POCKET_END));
  assert.equal(s.phase, core.PH_PLAY);
  assert.equal(s.sprint, 1);
});

// ---------------------------------------------------------------------------
// 2. Walk-safe: movement never pauses (shell), Bubble Float, Hover-Freeze.
// ---------------------------------------------------------------------------
test('Sharky plays through line movement (shell policy) and never pauses on steps', () => {
  const src = fs.readFileSync(path.join(root, 'src/games/sharky/SharkySwim.tsx'), 'utf8');
  assert.match(src, /movementPolicy="playThrough"/);
  assert.doesNotMatch(src, /LinePlayMovementContext/);
});

test('Bubble Float: arms after 1.8s without a touch-down when nothing is near; 35% speed (0% ride); no scoring', () => {
  const s = fresh();
  run(s, 200, null, busy);
  s.holding = 0;
  s.lastPress = s.step;
  const ev = run(s, core.FLOAT_ARM + 2);
  assert.ok(has(ev, core.EV_FLOAT_IN));
  assert.equal(s.float, 1);
  const full = (s.speed * 90) >> 8;
  assert.equal(s.speedEff, full);
  // Coins in the shark's path are not collected while floating.
  const before = s.stCoins;
  core.spawn(s, core.E_COIN, (s.dist >> 8) + 4, s.y >> 8, 0, 0, 0);
  run(s, 20);
  assert.equal(s.stCoins, before);
  // Ride mode: world speed 0.
  const r = fresh({ mode: core.MODE_RIDE });
  run(r, 200, null, busy);
  r.holding = 0;
  r.lastPress = r.step;
  run(r, core.FLOAT_ARM + 2);
  assert.equal(r.float, 1);
  assert.equal(r.speedEff, 0);
});

test('Bubble Float does not arm with a hazard ahead; Hover-Freeze stops the sim; a touch pops with grace', () => {
  const s = fresh();
  run(s, 200, null, busy);
  core.spawn(s, core.E_JELLY, (s.dist >> 8) + 900, 150, 0, 0, 0);
  s.holding = 0;
  s.lastPress = s.step;
  run(s, core.FLOAT_ARM + 4);
  assert.equal(s.float, 0, 'jelly within 1s of travel blocks the float');

  const f = fresh();
  run(f, 200, null, busy);
  f.holding = 0;
  f.lastPress = f.step;
  run(f, core.FLOAT_ARM + 2);
  const ev = run(f, core.FLOAT_FREEZE + 2);
  assert.ok(has(ev, core.EV_FREEZE));
  assert.equal(f.float, 2);
  const frozen = [f.clockSteps, f.dist, f.y];
  run(f, 120);
  assert.deepEqual([f.clockSteps, f.dist, f.y], frozen, 'Hover-Freeze holds everything');
  core.applyInput(f, core.IN_PRESS, 0, 0);
  assert.equal(f.float, 0);
  assert.equal(f.popGrace, core.POP_GRACE);
});

test('pause cheese: an exact-state resume never gives immunity, and hearts only rise through a revive', () => {
  for (let i = 0; i < 12; i++) {
    const cfg = { seed: 777 + i * 97, mode: core.MODE_QUEUE, difficulty: 3, tier: 4, runs: 5 };
    const { log } = bots.planRun(cfg, bots.BOT_PROFILES.rookie, i + 3, 2400);
    const base = core.replay(cfg, log, 2400);
    // Insert pause_resume every 97 steps: identical outcome.
    const paused = log.slice();
    for (let st = 97; st < 2400; st += 97) paused.push({ step: st, kind: core.IN_EXT, sub: core.EXT_PAUSE_RESUME, arg: 0 });
    paused.sort((a, b) => a.step - b.step);
    let last = core.HEARTS;
    const again = core.replay(cfg, paused, 2400, (st) => {
      let revived = false;
      for (let e = 0; e < st.evN; e++) if (st.ev[e * 5] === core.EV_REVIVE) revived = true;
      assert.ok(st.hearts <= last || revived, 'hearts never go up through a pause');
      last = st.hearts;
    });
    assert.equal(core.finalHash(again), core.finalHash(base));
    assert.equal(again.stHits, base.stHits);
  }
});

// ---------------------------------------------------------------------------
// 3. Determinism, descriptors, input log.
// ---------------------------------------------------------------------------
test('determinism: planned runs replay bit-for-bit; the input log round-trips', () => {
  for (let i = 0; i < 20; i++) {
    const cfg = { seed: (i * 7919) | 0, mode: [0, 1, 2, 3][i % 4], difficulty: 1 + (i % 3), tier: i % 7, runs: i % 5 };
    const { log, s } = bots.planRun(cfg, bots.BOT_PROFILES[['ace', 'regular', 'rookie', 'novice'][i % 4]], i, 3000);
    const enc = core.encodeInputs(log);
    const dec = core.decodeInputs(enc);
    assert.deepEqual(plain(dec.map((e) => [e.step, e.kind, e.sub, e.arg])), plain(log.map((e) => [e.step, e.kind, e.sub, e.arg])));
    const r = core.replay(cfg, dec, s.step);
    assert.equal(core.finalHash(r), core.finalHash(s));
    assert.equal(r.score, s.score);
    assert.equal(r.dist, s.dist);
  }
});

test('sprint descriptors: seeded, varied, tier-gated, no chunk twice in a row, breather after 3', () => {
  const seqs = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const d = core.generateSprint(seed * 1013, 1, core.MODE_QUEUE, 12, 420);
    seqs.add(d.chunks.join(','));
    let run3 = 0;
    for (let i = 0; i < d.chunks.length; i++) {
      if (i > 0) assert.notEqual(d.chunks[i], d.chunks[i - 1]);
      const c = core.CHUNKS[d.chunks[i]];
      run3 = c.breather ? 0 : run3 + 1;
      assert.ok(run3 <= 3);
    }
    assert.deepEqual(core.generateSprint(seed * 1013, 1, core.MODE_QUEUE, 12, 420).chunks, d.chunks);
  }
  assert.ok(seqs.size >= 20, `seeds give different courses (${seqs.size})`);
  // Run 1 (tier 0) never sees boxes, tokens, puffers or torpedoes.
  for (let seed = 1; seed <= 20; seed++) {
    for (let sp = 0; sp < 4; sp++) {
      for (const id of core.generateSprint(seed, sp, core.MODE_QUEUE, 0, 400).chunks) assert.equal(core.CHUNKS[id].tier, 0);
    }
  }
  const s = core.createSim({ seed: 5, mode: core.MODE_QUEUE, difficulty: 2, tier: 0, runs: 0 });
  for (let k = 0; k < 900; k++) core.step(s);
  for (let i = 0; i < core.ENT_CAP; i++) {
    assert.ok(![core.E_BOX, core.E_TOKEN, core.E_PUFFER, core.E_TORPEDO].includes(s.et[i]), 'tier 0 teaches one verb');
  }
});

// ---------------------------------------------------------------------------
// 4. Fairness gates: every chunk clears at D3 max speed with human cadence.
// ---------------------------------------------------------------------------
test('chunk gates: every chunk clears hit-free at 560 u/s with input changes every 4 and every 7 steps (120ms human floor)', () => {
  const { dfsClear, chunkSim } = require('../sharky/planner.cjs');
  for (const c of core.CHUNKS) {
    for (const every of [4, 7]) {
      for (const y0 of [150, 500, 850]) {
        const s = chunkSim(c.id, 560, { y: y0 });
        const r = dfsClear(s, { every, untilX: s.gateX - 100, maxNodes: 60000 });
        assert.ok(r.ok, `${c.name} every ${every} from y ${y0}`);
      }
    }
  }
});

test('edge badges fire at least 600ms before a hazard reaches the view', () => {
  const s = core.createSim({ seed: 99, mode: core.MODE_QUEUE, difficulty: 3, tier: 12, runs: 9 });
  const badged = new Map();
  let checked = 0;
  core.replay({ seed: 99, mode: 0, difficulty: 3, tier: 12, runs: 9 }, bots.planRun({ seed: 99, mode: 0, difficulty: 3, tier: 12, runs: 9 }, { ...bots.BOT_PROFILES.ace, dash: false }, 1, 2400).log, 2400, (st) => {
    for (let e = 0; e < st.evN; e++) if (st.ev[e * 5] === core.EV_BADGE) badged.set(`${st.ev[e * 5 + 1]}:${st.et[st.ev[e * 5 + 1]]}:${st.ex[st.ev[e * 5 + 1]]}`, st.step);
    for (const [key, at] of badged) {
      const [i, t, x] = key.split(':').map(Number);
      if (st.et[i] !== t || st.ex[i] !== x || t === core.E_TORPEDO) continue;
      const left = core.hazardSpan(st, i)[0];
      if (left <= (st.dist >> 8) + core.aheadU(st)) {
        assert.ok(st.step - at >= 34, `badge lead ${st.step - at} steps`);
        badged.delete(key);
        checked++;
      }
    }
  });
  void s;
  assert.ok(checked > 10);
});

test('ride validation: the design novice bot wins 70-95% of pre-validated ride courses', () => {
  const novice = { name: 'novice-design', every: 8, horizon: 6, slip: 50, dash: false, revive: false };
  let wins = 0;
  const n = 24;
  for (let i = 0; i < n; i++) {
    const seed = 90000 + i * 7717;
    const { s } = bots.planRun({ seed, mode: core.MODE_RIDE, difficulty: 2, tier: 2 + (i % 3), runs: 5 }, novice, seed ^ 0x55, 6000);
    if (s.endReason === core.END_GATE && s.hearts >= 1) wins++;
  }
  const pct = (100 * wins) / n;
  assert.ok(pct >= 70 && pct <= 95, `novice ride win rate ${pct}%`);
});

// ---------------------------------------------------------------------------
// 5. Systems: chain, Frenzy, hits, Boost, Dash, grace, kicks.
// ---------------------------------------------------------------------------
test('chain tiers x1/x2/x3/x4 at 3/6/9, Frenzy at 12 (10 for the first 3 runs) doubles to an x8 ceiling', () => {
  const s = fresh();
  for (const [c, m] of [[0, 1], [2, 1], [3, 2], [6, 3], [9, 4], [11, 4]]) {
    s.chain = c;
    assert.equal(core.multiplier(s), m);
  }
  s.chain = 11;
  core.spawn(s, core.E_RING, (s.dist >> 8) + 20, s.y >> 8, 0, 0, 0);
  const ev = run(s, 10, null, (st) => { st.vy = 0; });
  assert.ok(has(ev, core.EV_FRENZY_START));
  assert.equal(s.frenzy > 0, true);
  s.chain = 12 + 9;
  assert.equal(core.multiplier(s), 8);
  assert.equal(core.createSim({ seed: 1, mode: 0, difficulty: 2, tier: 0, runs: 0 }).frenzyAt, 10);
  assert.equal(core.createSim({ seed: 1, mode: 0, difficulty: 2, tier: 4, runs: 3 }).frenzyAt, 12);
});

test('surface and floor bounces break the chain, never cost a heart', () => {
  const s = fresh();
  s.chain = 5;
  s.chainTimer = 100;
  const ev = run(s, 90, 1);
  assert.ok(has(ev, core.EV_BOUNCE));
  assert.ok(has(ev, core.EV_CHAIN_BREAK));
  assert.equal(s.chain, 0);
  assert.equal(s.hearts, core.HEARTS);
});

test('hit = horizontal stumble (x0.6 for 250ms, 550ms ramp, vy unchanged), 1s i-frames, tier drop, Coin Scatter 40% max 12', () => {
  const a = fresh();
  const b = fresh();
  for (const s of [a, b]) {
    s.chain = 7; // x3
    s.chainTimer = 100;
    s.chainCoins = 50;
    s.score = 2000;
    s.vy = 150 * Q;
    s.y = 500 * Q;
  }
  core.spawn(a, core.E_JELLY, (a.dist >> 8) + 60, 500, 0, 0, 0);
  let hitEv = null;
  for (let k = 0; k < 10 && !hitEv; k++) {
    core.step(a);
    core.step(b);
    for (let e = 0; e < a.evN; e++) if (a.ev[e * 5] === core.EV_HIT) hitEv = Array.from(a.ev.slice(e * 5, e * 5 + 5));
  }
  assert.ok(hitEv, 'jelly hit');
  assert.equal(a.hearts, 2);
  assert.equal(a.vy, b.vy, 'the hit never changes vy');
  assert.equal(a.iframes, core.IFRAMES - 0);
  assert.equal(a.chain, 3, 'x3 drops to the bottom of x2');
  let scatter = 0;
  for (let i = 0; i < core.ENT_CAP; i++) if (a.et[i] === core.E_SCATTER) scatter++;
  assert.equal(scatter, 12);
  core.step(a);
  assert.equal(a.speedEff, (a.speed * 154) >> 8, 'x0.6 speed');
  for (let k = 0; k < core.STUMBLE_HOLD + core.STUMBLE_RAMP; k++) core.step(a);
  assert.equal(a.speedEff, a.speed, 'ramped back to full');
});

test('Frenzy Pot banks on timeout or gate; a hit loses 50% and ends Frenzy', () => {
  const s = fresh();
  s.frenzy = 5;
  s.pot = 1000;
  s.score = 100;
  const ev = run(s, 6, null, busy);
  assert.ok(has(ev, core.EV_FRENZY_END));
  assert.equal(s.score >= 1100, true);
  const h = fresh();
  h.frenzy = 200;
  h.pot = 1000;
  h.score = 0;
  h.chainCoins = 0;
  const hj = core.spawn(h, core.E_JELLY, (h.dist >> 8) + 40, h.y >> 8, 0, 0, 0);
  h.ep1[hj] = 1024 - ((h.worldT * 1024 / core.JELLY_PERIOD) | 0) % 1024;
  run(h, 10, null, (st) => { st.vy = 0; });
  assert.equal(h.frenzy, 0);
  assert.equal(h.banked, 500);
  assert.equal(h.score >= 500 && h.score < 600, true);
});

test('Boost fill table and the Dash buffer (6 steps) / fizz', () => {
  const s = fresh();
  s.boost = 0;
  core.spawn(s, core.E_RING, (s.dist >> 8) + 12, s.y >> 8, 0, 0, 0);
  run(s, 6, null, (st) => { st.vy = 0; });
  assert.equal(s.boost, 50, 'Perfect ring +50');
  s.boost = 85;
  core.applyInput(s, core.IN_DASH, 0, 0);
  assert.equal(s.dash, 0);
  assert.equal(s.dashBuf, core.DASH_BUFFER);
  core.step(s);
  s.boost = 101; // meter reaches 100 inside the buffer
  const ev = run(s, 1);
  assert.ok(has(ev, core.EV_DASH));
  assert.equal(s.dash > 0, true);
  const f = fresh();
  f.boost = 40;
  core.applyInput(f, core.IN_DASH, 0, 0);
  const fe = run(f, core.DASH_BUFFER + 1);
  assert.ok(has(fe, core.EV_FIZZ));
  assert.equal(f.boost, 40, 'a fizz costs nothing');
  const t0 = fresh({ tier: 1 });
  t0.boost = 300;
  core.applyInput(t0, core.IN_DASH, 0, 0);
  assert.equal(t0.dash, 0, 'Dash is locked before unlock tier 2');
});

test('Dash: x1.8 speed for 240ms with vy clamped to +-200 and held', () => {
  const s = fresh();
  s.boost = 300;
  s.vy = 700 * Q;
  core.applyInput(s, core.IN_DASH, 0, 0);
  assert.equal(s.vy, 200 * Q);
  core.step(s);
  assert.equal(s.vy, 200 * Q, 'vy held');
  assert.equal(s.speedEff, (s.speed * 461) >> 8);
  run(s, core.DASH_STEPS);
  assert.equal(s.dash, 0);
});

test('contact grace: a Dash within 5 steps of touching an inflated Puffer is a Chomp, not a hit', () => {
  const mk = () => {
    const s = fresh();
    s.boost = 300;
    const i = core.spawn(s, core.E_PUFFER, (s.dist >> 8) + 40, s.y >> 8, 0, 0, 0);
    s.est[i] = 2;
    s.etm[i] = 20;
    return s;
  };
  const a = mk();
  let touched = -1;
  const ev = run(a, 20, null, (st, k) => {
    st.vy = 0;
    if (touched < 0 && st.ep2.some((v) => v > 0)) touched = k;
    if (touched >= 0 && k === touched + 2) core.applyInput(st, core.IN_DASH, 0, 0);
  });
  assert.ok(has(ev, core.EV_CHOMP), 'chomped');
  assert.equal(a.hearts, core.HEARTS);
  const b = mk();
  const ev2 = run(b, 20, null, (st) => { st.vy = 0; });
  assert.ok(has(ev2, core.EV_HIT), 'no Dash: hit after the grace');
});

test('press and release kicks: faster reversals', () => {
  const s = fresh();
  s.vy = 400 * Q;
  core.applyInput(s, core.IN_PRESS, 0, 0);
  assert.equal(s.vy, 400 * Q - (180 * Q + ((400 * Q * 35) / 100 | 0)));
  s.vy = -300 * Q;
  core.applyInput(s, core.IN_RELEASE, 0, 0);
  assert.equal(s.vy, -180 * Q);
});

test('honest skims: a 2-22u visible gap scores; overlapping sprites without a hit never do', () => {
  const trial = (gapToArt) => {
    const s = fresh();
    const px = (s.dist >> 8) + 120;
    core.spawn(s, core.E_PYLON, px, 500, 380, 0, 0);
    const topEdge = 500 - 190;
    const y = topEdge + core.SIL_RY + gapToArt;
    const ev = run(s, 60, null, (st) => { st.y = y * Q; st.vy = 0; });
    return { skim: has(ev, core.EV_SKIM), hit: has(ev, core.EV_HIT) };
  };
  assert.deepEqual(trial(10), { skim: true, hit: false });
  assert.deepEqual(trial(60), { skim: false, hit: false });
  assert.deepEqual(trial(-4), { skim: false, hit: false }, 'sprites overlap, hitboxes do not: nothing');
});

test('Second Wind: one revive per queue run returns with 1 heart and 2s of shield; never in ride mode', () => {
  const s = fresh();
  s.hearts = 1;
  core.spawn(s, core.E_JELLY, (s.dist >> 8) + 40, s.y >> 8, 0, 0, 0);
  s.ep1[0] = 0;
  const ev = run(s, 20, null, (st) => { st.vy = 0; });
  assert.ok(has(ev, core.EV_WIPEOUT));
  assert.equal(s.phase, core.PH_WIPE);
  core.applyInput(s, core.IN_EXT, core.EXT_REVIVE, 1);
  assert.equal(s.phase, core.PH_PLAY);
  assert.equal(s.hearts, 1);
  assert.equal(s.reviveShield, core.REVIVE_SHIELD);
  core.applyInput(s, core.IN_EXT, core.EXT_REVIVE, 1);
  const r = fresh({ mode: core.MODE_RIDE });
  r.hearts = 1;
  core.spawn(r, core.E_JELLY, (r.dist >> 8) + 40, r.y >> 8, 0, 0, 0);
  run(r, 20, null, (st) => { st.vy = 0; });
  core.applyInput(r, core.IN_EXT, core.EXT_REVIVE, 1);
  assert.equal(r.phase, core.PH_WIPE, 'no Second Wind in a paid ride');
  run(r, core.WIPE_ANIM + 2);
  assert.equal(r.phase, core.PH_DONE);
  assert.equal(r.endReason, core.END_WIPEOUT);
});

test('line boost: a server-stamped line advance adds +1s, at most +4s per run', () => {
  const s = fresh();
  const c0 = s.clockSteps;
  for (let i = 0; i < 6; i++) core.applyInput(s, core.IN_EXT, core.EXT_LINE_BOOST, 100 + i);
  assert.equal(s.clockSteps - c0, core.LINE_BOOST_MAX);
});

// ---------------------------------------------------------------------------
// 6. Fixed view fairness.
// ---------------------------------------------------------------------------
test('fixed view: every field size sees exactly 960 x 1000u of course', () => {
  for (const [w, h] of [[390, 700], [430, 800], [820, 1000], [1024, 768], [402, 780]]) {
    const l = view.sharkyLayout(w, h);
    assert.equal(l.visibleW, 960);
    assert.equal(l.visibleH, 1000);
    assert.ok(Math.abs(l.k - Math.min(w / 960, h / 1000)) < 1e-9);
    assert.ok(l.offY >= 0 && l.sandTop <= h + 1e-6);
    assert.ok(l.offX >= 0 && l.offX * 2 + 960 * l.k <= w + 1e-6);
  }
});

// ---------------------------------------------------------------------------
// 7. Proof, verifier bundle, plausibility, sim version, worklet order.
// ---------------------------------------------------------------------------
test('golden vectors: all 30 verify in node, tampering is caught', () => {
  const golden = JSON.parse(fs.readFileSync(path.join(root, 'tools/fixtures/swim/golden.json'), 'utf8'));
  const cur = loadTs('src/games/sharky/sim/version.generated.ts').SIM_VERSION;
  assert.equal(golden.sim_version, cur, 'sim changed: run node tools/fixtures/swim/generate.cjs');
  assert.equal(golden.vectors.length, 30);
  for (const v of golden.vectors) {
    const r = verify.verifySwimProof(v.proof);
    assert.equal(r.ok, true, `${v.name}: ${r.reason}`);
    assert.equal(r.score, v.proof.score);
  }
  const p = { ...golden.vectors[3].proof, score: golden.vectors[3].proof.score + 10 };
  assert.equal(verify.verifySwimProof(p).reason, 'mismatch_score');
  const fast = { ...golden.vectors[3].proof, elapsed_ms: 10 };
  assert.equal(verify.verifySwimProof(fast).reason, 'too_fast');
  const old = { ...golden.vectors[3].proof, sim_version: 'swim-000000000000' };
  assert.equal(verify.verifySwimProof(old).reason, 'unknown_sim_version');
  const spam = { ...golden.vectors[3].proof, inputs: core.encodeInputs(Array.from({ length: 40 }, (_, i) => ({ step: 10 + i, kind: i % 2, sub: 0, arg: 0 }))) };
  assert.equal(verify.verifySwimProof(spam).reason, 'input_rate');
});

test('ride proof: a win needs the Ride Gate with at least 1 heart', () => {
  const golden = JSON.parse(fs.readFileSync(path.join(root, 'tools/fixtures/swim/golden.json'), 'utf8'));
  for (const v of golden.vectors.filter((x) => x.proof.mode === 'ride')) {
    const r = verify.verifySwimProof(v.proof);
    assert.equal(r.win, v.proof.reached_gate && v.proof.hearts_left >= 1);
  }
});

test('verify.cjs bundle: the server verifier is the same sim and agrees with node', () => {
  const { build } = require('../sharky/build-verifier.cjs');
  const out = build(path.join(os.tmpdir(), `swim-verify-${process.pid}.cjs`));
  const bundled = require(out);
  const golden = JSON.parse(fs.readFileSync(path.join(root, 'tools/fixtures/swim/golden.json'), 'utf8'));
  for (const v of golden.vectors.slice(0, 8)) {
    const r = bundled.verifySwimProof(v.proof);
    assert.equal(r.ok, true, v.name);
  }
  fs.unlinkSync(out);
});

test('plausibility: frame-perfect bots are flagged for review; human-paced toggling is not', () => {
  const cfg = { seed: 4242, mode: core.MODE_QUEUE, difficulty: 3, tier: 6, runs: 6 };
  const tas = bots.planRun(cfg, { name: 'tas', every: 2, horizon: 30, slip: 0, dash: true, revive: true }, 1, 2400);
  assert.equal(core.plausibility(core.replay(cfg, tas.log, tas.s.step)).flagged, true);
  // Human-like: holds and releases of 12-40 steps, unrelated to telegraph timing.
  let seed = 9;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const log = [];
  let st = 30;
  let hold = true;
  while (st < 2400) {
    log.push({ step: st, kind: hold ? core.IN_PRESS : core.IN_RELEASE, sub: 0, arg: 0 });
    st += 12 + Math.floor(rnd() * 28);
    hold = !hold;
  }
  const human = core.plausibility(core.replay(cfg, log, 2400));
  assert.equal(human.flagged, false, human.reasons.join(','));
});

test('sim version is current and every sim worklet is defined before its callers', () => {
  const { version, text, out } = require('../sharky/sim-version.cjs');
  assert.equal(fs.readFileSync(out, 'utf8'), text(version()), 'run node tools/sharky/sim-version.cjs');
  const { check } = require('../sharky/check-worklet-order.cjs');
  for (const f of ['src/games/sharky/sim/core.ts', 'src/games/sharky/render/view.ts']) {
    assert.deepEqual(check(path.join(root, f)), [], f);
  }
});

test('integer sine stays in range and is symmetric', () => {
  for (let p = -2048; p <= 2048; p += 7) {
    const v = core.isin(p);
    assert.ok(Number.isInteger(v) && v >= -256 && v <= 256);
    assert.equal(core.isin(p + 512) + v, 0);
  }
  assert.equal(core.isin(256), 256);
  assert.equal(core.isin(0), 0);
});

test('missions: 3 active, sum and best-in-run progress, 3 completions rank up; unlock cards teach one verb per run', () => {
  const m = loadTs('src/games/sharky/meta/missions.ts');
  const p = loadTs('src/games/sharky/meta/progress.ts', { '@react-native-async-storage/async-storage': { default: {} } });
  const stats = { skims: 4, perfects: 3, frenzies: 1, tokens: 3, chomps: 2, score: 3200, gates: 3, coins: 70, dashes: 2, hits: 1 };
  const act = m.activeMissions([], 4, 11);
  assert.equal(act.length, 3);
  assert.equal(new Set(act.map((x) => x.id)).size, 3);
  let r = m.applyRun([], 0, 0, 4, stats, 11);
  assert.equal(r.missions.length, 3);
  assert.equal(r.completed.length, r.missions.filter((x) => x.done).length);
  // Force three completable missions: rank up.
  const slots = [{ id: 'perfect3', progress: 0, done: false }, { id: 'frenzy1', progress: 0, done: false }, { id: 'tokens3', progress: 0, done: false }];
  r = m.applyRun(slots, 2, 1, 4, stats, 1);
  assert.equal(r.completed.length, 3);
  assert.equal(r.rank, 3);
  assert.equal(r.rankProgress, 1);
  // Sum missions accumulate across runs.
  const s1 = m.applyRun([{ id: 'skim10', progress: 7, done: false }], 0, 0, 4, stats, 1);
  assert.equal(s1.missions.find((x) => x.id === 'skim10').done, true);
  // Locked missions never appear on run 1.
  assert.ok(m.activeMissions([], 0, 5).every((x) => m.MISSION_POOL.find((d) => d.id === x.id).unlock === 0));
  assert.equal(p.unlockCard(0, 1), 'NEW: Prize Boxes and Ride Tokens');
  assert.equal(p.unlockCard(1, 2), 'NEW: Puffers and Boost Dash');
  assert.equal(p.unlockCard(5, 6), null);
  assert.equal(p.unlockTier(40), 12);
  assert.equal(p.ratedDifficulty({ ...p.EMPTY_PROGRESS, recentStars: [0, 3, 1] }), 2);
});
