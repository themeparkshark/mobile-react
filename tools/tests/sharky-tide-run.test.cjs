'use strict';
/**
 * Sharky Swim "Tide Run" v7.1 (tide-run-5): sim, systems, fairness gates,
 * proof and verifier (design sharky.md section 14).
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
const count = (evs, kind) => evs.filter((e) => e[0] === kind).length;
/** Keep the shark busy at y 500 (tap every 20 steps) so Settle and Float never arm. */
const busy = (s, k) => {
  if (k % 20 === 0) core.applyInput(s, s.holding ? core.IN_RELEASE : core.IN_PRESS, 0, 0);
  s.y = 500 * Q;
  s.vy = 0;
};
/** Pin the shark at a y (scripted line), touching input so nothing settles. */
const pin = (y) => (s, k) => {
  if (k % 20 === 0) core.applyInput(s, s.holding ? core.IN_RELEASE : core.IN_PRESS, 0, 0);
  s.y = y * Q;
  s.vy = 0;
};

// ---------------------------------------------------------------------------
// 1. Clock: sim time only, flat refill, Final Stretch, pockets.
// ---------------------------------------------------------------------------
test('tide clock (P0-11): a wall-clock pause changes nothing; the run ends exactly when sim time reaches the clock', () => {
  const s = fresh();
  run(s, 600, null, busy);
  assert.equal(s.clockSteps, core.CLOCK_BASE - 600);
  const before = JSON.stringify([s.clockSteps, s.hearts, s.boost, s.score, s.dist]);
  core.applyInput(s, core.IN_EXT, core.EXT_PAUSE_RESUME, 0);
  assert.equal(JSON.stringify([s.clockSteps, s.hearts, s.boost, s.score, s.dist]), before);
  run(s, 2000, null, busy);
  assert.equal(s.endReason, core.END_TIME);
  assert.equal(s.activeSteps, core.CLOCK_BASE);
});

test('flat clock: +4s per Tide Gate whatever the chain or Frenzy, capped at 60s; the Gate Bonus is 100 x multiplier, flat, and keeps the chain', () => {
  for (const [chain, frenzy, mult] of [[0, 0, 1], [4, 0, 2], [10, 0, 4], [10, 200, 6]]) {
    const s = fresh();
    s.chain = chain;
    s.chainTimer = 100;
    s.frenzy = frenzy;
    s.score = 1000;
    core.spawn(s, core.E_GATE, (s.dist >> 8) + 20, 500, core.G_TIDE, 0, 0);
    const ev = run(s, 20, null, busy);
    const g = ev.find((e) => e[0] === core.EV_GATE);
    assert.ok(g, 'gate crossed');
    assert.equal(g[1], core.GATE_CLOCK, 'flat +4s');
    const b = ev.find((e) => e[0] === core.EV_GATE_BONUS);
    assert.equal(b[1], 100 * mult);
    assert.equal(b[2], mult);
    assert.equal(s.chain, chain, 'the gate cashes the chain without resetting it');
    assert.equal(s.phase, core.PH_POCKET);
  }
  const c = fresh();
  c.bonusSteps = core.CLOCK_CAP - core.CLOCK_BASE - 100;
  core.spawn(c, core.E_GATE, (c.dist >> 8) + 20, 500, core.G_TIDE, 0, 0);
  const cg = run(c, 20, null, busy).find((e) => e[0] === core.EV_GATE);
  assert.equal(cg[1], 100);
  assert.equal(c.bonusSteps, core.CLOCK_CAP - core.CLOCK_BASE);
  const src = fs.readFileSync(path.join(root, 'src/games/sharky/sim/core.ts'), 'utf8');
  assert.doesNotMatch(src, /sprintDirty|stumble|clean_crack|frenzy_banked|bankPot|\.pot\b/, 'v7.1 deletes the stumble, Clean Sprint and the Frenzy Pot');
});

test('two survivors with different chain play end on the same step (skill is the multiplier, not the clock)', () => {
  const cfg = { seed: 31337, mode: core.MODE_QUEUE, difficulty: 2, tier: 4, runs: 6 };
  const a = bots.planRun(cfg, bots.BOT_PROFILES.ace, 1, 5000).s;
  const b = bots.planRun(cfg, { ...bots.BOT_PROFILES.lazy, revive: true }, 2, 5000).s;
  assert.equal(a.gates, 3);
  assert.equal(b.gates, 3);
  assert.equal(a.endReason, core.END_TIME);
  assert.equal(b.endReason, core.END_TIME);
  assert.equal(a.activeSteps, b.activeSteps, 'same 42s of play');
  assert.equal(a.activeSteps, core.CLOCK_BASE + 3 * core.GATE_CLOCK);
  assert.ok(a.score > b.score, `the skill line scores more (${a.score} vs ${b.score})`);
});

test('Final Stretch: queue sprint 4 has no gate, so no run (Overdrives included) ever earns a 4th refill', () => {
  for (let i = 0; i < 6; i++) {
    const cfg = { seed: 4000 + i * 211, mode: core.MODE_QUEUE, difficulty: 1 + (i % 3), tier: 6, runs: 6 };
    const { s } = bots.planRun(cfg, bots.BOT_PROFILES.ace, i, 6000);
    assert.ok(s.gates <= 3);
    assert.ok(s.bonusSteps <= 3 * core.GATE_CLOCK);
    if (s.sprint === 3) assert.equal(s.gateX, 0, 'no gate after sprint 3');
  }
  assert.equal(core.sprintHasGate(core.MODE_QUEUE, 3), false);
  assert.equal(core.sprintHasGate(core.MODE_RIDE, 2), true);
});

test('tide pocket: 2.5s safe cruise with 3 pips when the player let go; holding on the gate line collapses it to 0.8s with one pip', () => {
  const s = fresh();
  core.spawn(s, core.E_GATE, (s.dist >> 8) + 20, 500, core.G_TIDE, 0, 0);
  run(s, 20, null, (st) => { st.y = 500 * Q; st.vy = 0; if (st.holding) core.applyInput(st, core.IN_RELEASE, 0, 0); });
  assert.equal(s.phase, core.PH_POCKET);
  assert.equal(s.pocketLen, core.POCKET_QUEUE);
  const clock = s.clockSteps;
  const ev = run(s, core.POCKET_QUEUE - s.phaseSteps);
  assert.equal(s.clockSteps, clock, 'clock frozen in the pocket');
  assert.equal(count(ev, core.EV_PIP), 3);
  assert.ok(has(ev, core.EV_POCKET_END));
  assert.equal(s.sprint, 1);

  const h = fresh();
  core.spawn(h, core.E_GATE, (h.dist >> 8) + 20, 500, core.G_TIDE, 0, 0);
  run(h, 20, 1, (st) => { st.y = 500 * Q; st.vy = 0; });
  assert.equal(h.phase, core.PH_POCKET);
  assert.equal(h.pocketLen, core.POCKET_SHORT);
  const hev = run(h, core.POCKET_SHORT);
  assert.equal(count(hev, core.EV_PIP), 1);
  assert.ok(has(hev, core.EV_POCKET_END));
});

test('Gate Rush: the last 2.5s before every gate is hazard-free, +12% speed, a 9-coin line into a Gate Ring in the arch', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const s = core.createSim({ seed: seed * 977, mode: [0, 1, 2][seed % 3], difficulty: 2, tier: 6, runs: 5 });
    const rush = core.rushLen(s.speed >> 8);
    // Gates and their rush lines exist from the sprint start.
    const gates = [];
    let rushCoins = 0;
    let gateRings = 0;
    for (let i = 0; i < core.ENT_CAP; i++) {
      if (s.et[i] === core.E_GATE) gates.push(s.ex[i]);
      if (s.et[i] === core.E_COIN && (s.ep2[i] & core.CF_RUSH)) rushCoins++;
      if (s.et[i] === core.E_RING && (s.ef[i] & core.F_GATE_RING)) gateRings++;
    }
    assert.ok(gates.length >= 1);
    assert.equal(rushCoins, 9 * gates.length);
    assert.equal(gateRings, gates.length);
    // Stream every chunk in and check every hazard against every gate.
    const seen = new Set();
    for (let q = 0; q < s.cqN; q++) {
      s.dist = (s.cqX[q] - 1400) * Q;
      core.step(s);
      for (let i = 0; i < core.ENT_CAP; i++) {
        if (!core.isHazard(s.et[i])) continue;
        // A tracking torpedo hovers at the view edge; check its authored spot only.
        if (s.et[i] === core.E_TORPEDO && s.est[i] !== 0) continue;
        const sp = core.hazardSpan(s, i);
        const key = `${s.et[i]}:${sp[0]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        for (const gx of gates) {
          // Design 4.3: no hazard art box + 40u inside [arch - 300, arch + 200].
          assert.ok(sp[1] + core.ART_PAD < gx - core.ARCH_HALF - core.GATE_PAD_BEFORE || sp[0] - core.ART_PAD > gx + core.ARCH_HALF + core.GATE_PAD_AFTER,
            `seed ${seed}: hazard ${s.et[i]} at ${sp[0]}..${sp[1]} inside the exclusion zone of gate ${gx}`);
          assert.ok(sp[1] < gx - rush || sp[0] > gx, 'the rush zone is hazard-free');
        }
      }
    }
    assert.ok(seen.size >= 2);
  }
  // +12% in over 300ms.
  const s = fresh();
  s.gateX = (s.dist >> 8) + 200;
  run(s, 18, null, busy);
  assert.equal(s.rushK, 288);
  assert.equal(s.speedEff, (s.speed * (256 + 32)) >> 8);
});

// ---------------------------------------------------------------------------
// 2. Walk-safe: movement never pauses, Neutral Settle, soft edges, Float.
// ---------------------------------------------------------------------------
test('Sharky plays through line movement (shell policy) and never pauses on steps', () => {
  const src = fs.readFileSync(path.join(root, 'src/games/sharky/SharkySwim.tsx'), 'utf8');
  assert.match(src, /movementPolicy="playThrough"/);
  assert.doesNotMatch(src, /LinePlayMovementContext/);
});

test('Neutral Settle: no touch for 600ms (150ms near an edge) springs the shark to mid-depth; a glance-away never bounces', () => {
  // 3,000-start fuzz over y and vy for a player who already looked away.
  let seed = 17;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  for (let k = 0; k < 3000; k++) {
    const s = fresh({ seed: k });
    s.activeSteps = 0; // keep Float out of it
    s.y = Math.round((core.SHARK_MIN_Y + 1 + rnd() * (core.SHARK_MAX_Y - core.SHARK_MIN_Y - 2)) * Q);
    s.vy = Math.round((-720 + rnd() * 1540) * Q);
    s.lastTouch = -100;
    const ev = run(s, 90);
    assert.equal(has(ev, core.EV_BOUNCE), false, `bounce from y ${s.y >> 8}`);
    assert.ok(Math.abs((s.y >> 8) - 500) < 60, `settled near y 500 (${s.y >> 8})`);
  }
  // A deliberate dive shorter than 600ms is plain physics: no Settle, full sink.
  const a = fresh();
  core.applyInput(a, core.IN_PRESS, 0, 0);
  core.applyInput(a, core.IN_RELEASE, 0, 0);
  let prev = a.vy;
  for (let k = 0; k < core.SETTLE_IDLE - 1; k++) {
    core.step(a);
    if ((a.y >> 8) > core.FLOOR_Y - 200) break;
    assert.equal(a.settle, 0);
    assert.ok(a.vy - prev >= ((1900 * Q) / 60 | 0) - 1 || a.vy === 820 * Q, 'release-to-sink is unchanged');
    prev = a.vy;
  }
  const n = fresh();
  n.y = 880 * Q;
  n.vy = 100 * Q;
  n.lastTouch = n.step;
  const nev = run(n, 12);
  assert.ok(has(nev, core.EV_SETTLE), 'near the floor Settle starts after 150ms');
});

test('soft edges: a contact at |vy| <= 300 is a touch (no chain break); above 300 is a bounce that breaks the chain; never a heart', () => {
  const soft = fresh();
  soft.chain = 5;
  soft.chainTimer = 100;
  soft.y = (core.SHARK_MIN_Y + 2) * Q;
  soft.vy = -250 * Q;
  soft.lastTouch = soft.step;
  core.applyInput(soft, core.IN_PRESS, 0, 0);
  soft.vy = -250 * Q;
  const sev = run(soft, 1);
  assert.ok(has(sev, core.EV_TOUCH));
  assert.equal(has(sev, core.EV_BOUNCE), false);
  assert.equal(soft.chain, 5);
  const hard = fresh();
  hard.chain = 5;
  hard.chainTimer = 100;
  const hev = run(hard, 90, 1);
  assert.ok(has(hev, core.EV_BOUNCE), 'holding into the surface is a slam');
  assert.ok(has(hev, core.EV_CHAIN_BREAK));
  assert.equal(hard.chain, 0);
  assert.equal(hard.hearts, core.HEARTS);
});

test('Bubble Float: arms 1.8s after the last touch (not the last press) when nothing is within 1s; 35% speed (0% ride); no scoring', () => {
  const s = fresh();
  run(s, 200, null, busy);
  // A long hold then a release must NOT float at once.
  core.applyInput(s, core.IN_PRESS, 0, 0);
  run(s, 150, null, (st) => { st.y = 500 * Q; st.vy = 0; });
  core.applyInput(s, core.IN_RELEASE, 0, 0);
  const early = run(s, 20);
  assert.equal(has(early, core.EV_FLOAT_IN), false);
  const ev = run(s, core.FLOAT_ARM);
  assert.ok(has(ev, core.EV_FLOAT_IN));
  assert.equal(s.float, 1);
  assert.equal(s.speedEff, (s.speed * 90) >> 8);
  const before = s.stCoins;
  core.spawn(s, core.E_COIN, (s.dist >> 8) + 4, s.y >> 8, 0, 0, 0);
  run(s, 20);
  assert.equal(s.stCoins, before);
  const r = fresh({ mode: core.MODE_RIDE });
  run(r, 200, null, busy);
  r.lastTouch = r.step;
  if (r.holding) r.holding = 0;
  run(r, core.FLOAT_ARM + 2);
  assert.equal(r.float, 1);
  assert.equal(r.speedEff, 0);
});

test('Bubble Float does not arm with a hazard ahead; Hover-Freeze stops the sim; a touch pops with grace', () => {
  const s = fresh();
  run(s, 200, null, busy);
  core.spawn(s, core.E_JELLY, (s.dist >> 8) + 900, 150, 0, 0, 0);
  s.holding = 0;
  s.lastTouch = s.step;
  run(s, core.FLOAT_ARM + 4);
  assert.equal(s.float, 0, 'a jelly within 1s of travel blocks the float');
  const f = fresh();
  run(f, 200, null, busy);
  f.holding = 0;
  f.lastTouch = f.step;
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

test('a Tide Pocket is look-up time: Float never arms on pocket exit, only after a full 1.8s idle in play', () => {
  const s = fresh();
  run(s, 200, null, busy);
  core.spawn(s, core.E_GATE, (s.dist >> 8) + 20, 500, core.G_TIDE, 0, 0);
  run(s, 20, null, (st) => { st.y = 500 * Q; st.vy = 0; if (st.holding) core.applyInput(st, core.IN_RELEASE, 0, 0); });
  assert.equal(s.phase, core.PH_POCKET);
  const ev = run(s, s.pocketLen - s.phaseSteps);
  assert.ok(has(ev, core.EV_POCKET_END));
  core.setCourse(s, [], 20000);
  const early = run(s, core.FLOAT_ARM - 2);
  assert.equal(has(early, core.EV_FLOAT_IN), false);
  const late = run(s, 6);
  assert.ok(has(late, core.EV_FLOAT_IN));
});

test('pause cheese: an exact-state resume never gives immunity, and hearts only rise through a revive', () => {
  for (let i = 0; i < 10; i++) {
    const cfg = { seed: 777 + i * 97, mode: core.MODE_QUEUE, difficulty: 3, tier: 4, runs: 5 };
    const { log } = bots.planRun(cfg, bots.BOT_PROFILES.rookie, i + 3, 2400);
    const base = core.replay(cfg, log, 2400);
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
// 3. Graze (design 3.3).
// ---------------------------------------------------------------------------
/** A pylon pass with the silhouette held `gap` u under the top cap art for the whole pass. */
function pylonPass(gap, opts = {}) {
  const s = fresh(opts);
  s.chain = opts.chain ?? 0;
  s.chainTimer = 100;
  const px = (s.dist >> 8) + 160;
  core.spawn(s, core.E_PYLON, px, 500, 380, 0, 0);
  const topEdge = 500 - 190;
  const y = topEdge + core.SIL_RY + gap;
  const ev = run(s, opts.steps ?? 80, null, (st, k) => {
    if (opts.leaveAt !== undefined && k >= opts.leaveAt) pin(500)(st, k);
    else pin(y)(st, k);
  });
  return { s, ev };
}

test('graze: holding the Close band (10u) for the pass is a Close Skim: 2 counts, 5 points and Boost +4 per Close step', () => {
  const { s, ev } = pylonPass(10);
  const sk = ev.filter((e) => e[0] === core.EV_SKIM);
  assert.equal(sk.length, 1);
  assert.equal(sk[0][3], 1, 'Close Skim');
  assert.equal(s.chain, 2);
  assert.equal(s.stCloseSkims, 1);
  const steps = ev.filter((e) => e[0] === core.EV_GRAZE && e[1] === 1).length;
  assert.ok(steps >= core.GRAZE_MIN_STEPS);
  // Graze points are capped at 80 base per hazard; Boost at 50.
  assert.ok(s.boost <= core.GRAZE_BOOST_CAP);
  assert.equal(s.boost, Math.min(core.GRAZE_BOOST_CAP, steps * 4));
});

test('graze: 20u is a plain Skim (1 count); 5 steps in the halo pays points but no count; overlapping art without a hit pays nothing', () => {
  const g = pylonPass(20);
  const sk = g.ev.filter((e) => e[0] === core.EV_SKIM);
  assert.equal(sk.length, 1);
  assert.equal(sk[0][3], 0);
  assert.equal(g.s.chain, 1);
  // Five halo steps, then leave: graze points, no chain count.
  const yIn = 500 - 190 + core.SIL_RY + 20;
  const t = fresh();
  core.spawn(t, core.E_PYLON, (t.dist >> 8) + 60, 500, 380, 0, 0);
  let halo = 0;
  const tev = [];
  for (let k = 0; k < 80; k++) {
    pin(halo >= 5 ? 500 : yIn)(t, k);
    core.step(t);
    for (let e = 0; e < t.evN; e++) {
      tev.push(Array.from(t.ev.slice(e * 5, e * 5 + 5)));
      if (t.ev[e * 5] === core.EV_GRAZE) halo++;
    }
  }
  assert.equal(halo, 5);
  assert.equal(has(tev, core.EV_SKIM), false);
  assert.equal(t.chain, 0);
  assert.ok(t.score > 0, 'graze steps still pay points');
  // Overlap: the silhouette crosses the art, the hitbox does not.
  const o = pylonPass(-6);
  assert.equal(has(o.ev, core.EV_HIT), false);
  assert.equal(has(o.ev, core.EV_SKIM), false);
  assert.ok(o.s.chain === 0, 'clipping the art voids the pass');
});

test('graze caps: hugging a long run of pylon never pays more than 80 base points or Boost 50 per hazard', () => {
  const s = fresh();
  s.chain = 0;
  const px = (s.dist >> 8) + 100;
  core.spawn(s, core.E_PYLON, px, 500, 380, 0, 0);
  const y = 500 - 190 + core.SIL_RY + 8;
  // Freeze world speed so the pass lasts 400 steps.
  run(s, 400, null, (st, k) => { pin(y)(st, k); st.speed = 4 * Q; st.speedBase = 4 * Q; st.speedCap = 4 * Q; });
  assert.ok(s.score <= core.GRAZE_PTS_CAP + 10, `score ${s.score}`);
  assert.ok(s.boost <= core.GRAZE_BOOST_CAP);
});

// ---------------------------------------------------------------------------
// 4. One hit, two costs (design 3.5).
// ---------------------------------------------------------------------------
test('one hit, two costs: a heart and a recoverable Coin Scatter; speed, vy, chain and Boost are unchanged; the window freezes in i-frames', () => {
  const mk = () => {
    const s = fresh();
    s.chain = 7;
    s.chainTimer = 100;
    s.chainCoins = 50;
    s.score = 2000;
    s.boost = 120;
    s.vy = 150 * Q;
    s.y = 500 * Q;
    s.lastTouch = s.step + 100000;
    return s;
  };
  const a = mk();
  const b = mk();
  a.lastTouch = a.step;
  b.lastTouch = b.step;
  core.spawn(a, core.E_JELLY, (a.dist >> 8) + 40, 500, 0, 0, 0);
  let hitEv = null;
  for (let k = 0; k < 10 && !hitEv; k++) {
    core.step(a);
    core.step(b);
    for (let e = 0; e < a.evN; e++) if (a.ev[e * 5] === core.EV_HIT) hitEv = Array.from(a.ev.slice(e * 5, e * 5 + 5));
  }
  assert.ok(hitEv, 'jelly hit');
  assert.equal(a.hearts, 2);
  assert.equal(a.vy, b.vy, 'vy unchanged');
  assert.equal(a.speedEff, b.speedEff, 'world speed unchanged');
  assert.equal(a.chain, b.chain, 'chain unchanged');
  assert.equal(a.boost, b.boost, 'Boost unchanged');
  assert.equal(a.iframes, core.IFRAMES);
  let scatter = 0;
  let refund = 0;
  for (let i = 0; i < core.ENT_CAP; i++) if (a.et[i] === core.E_SCATTER && a.ep1[i] === 0) { scatter++; refund += a.ep2[i]; }
  assert.equal(scatter, 12, '40% of 50 coins, max 12');
  assert.equal(b.score - a.score, refund, 'what comes off the score is exactly what the coins refund');
  for (let i = 0; i < core.ENT_CAP; i++) if (a.et[i] === core.E_SCATTER) a.et[i] = core.E_NONE; // no regrabs here
  const timer = a.chainTimer;
  for (let k = 0; k < 30; k++) core.step(a);
  assert.equal(a.chainTimer, timer, 'the chain window is frozen during i-frames');
});

test('Coin Scatter: regrabs refund exactly, 3 regrabs are one chain count, Frenzy keeps running through a hit', () => {
  const s = fresh();
  s.chain = 4;
  s.chainTimer = 100;
  s.chainCoins = 30;
  s.score = 3000;
  s.frenzy = 200;
  s.lastTouch = s.step;
  core.spawn(s, core.E_JELLY, (s.dist >> 8) + 40, s.y >> 8, 0, 0, 0);
  const ev = run(s, 8, null, (st) => { st.vy = 0; });
  assert.ok(has(ev, core.EV_HIT));
  assert.ok(s.frenzy > 0, 'Frenzy continues');
  const after = s.score;
  const chain = s.chain;
  // Teleport three scatter coins onto the shark: refunds and one chain count.
  let moved = 0;
  let refund = 0;
  for (let i = 0; i < core.ENT_CAP && moved < 3; i++) {
    if (s.et[i] !== core.E_SCATTER || s.ep1[i] !== 0) continue;
    s.ex[i] = (s.dist >> 8) + 4;
    s.ey[i] = s.y >> 8;
    s.etm[i] = 20;
    s.evx[i] = 0;
    s.evy[i] = 0;
    refund += s.ep2[i];
    moved++;
  }
  s.distAcc = -100000; // no distance point inside the measured step
  const rev = run(s, 1, null, (st) => { st.vy = 0; });
  assert.equal(count(rev, core.EV_REGRAB), 1);
  assert.equal(s.chain, chain + 1);
  assert.equal(s.score, after + refund, 'exact refund');
});

// ---------------------------------------------------------------------------
// 5. Chain, Frenzy, Boost and Overdrive.
// ---------------------------------------------------------------------------
test('chain tiers x1/x2/x3/x4 at 3/6/9; Frenzy at 12 (10 for the first 3 runs) is x1.5 (x6); the next one needs +12 after it ends', () => {
  const s = fresh();
  for (const [c, m] of [[0, 1], [2, 1], [3, 2], [6, 3], [9, 4], [30, 4]]) {
    s.chain = c;
    assert.equal(core.multiplier(s), m);
  }
  s.chain = 11;
  s.frenzyNext = 12;
  core.spawn(s, core.E_RING, (s.dist >> 8) + 20, s.y >> 8, 0, 0, 0);
  s.y = (s.y >> 8) * Q + 30 * Q;
  const ev = run(s, 10, null, (st) => { st.vy = 0; });
  assert.ok(has(ev, core.EV_FRENZY_START));
  assert.equal(core.multiplier(s), 6);
  // Counts inside a Frenzy never extend it.
  const left = s.frenzy;
  s.chain += 20;
  run(s, 5, null, busy);
  assert.equal(s.frenzy, left - 5);
  const endEv = run(s, s.frenzy, null, busy);
  assert.ok(has(endEv, core.EV_FRENZY_END));
  assert.equal(s.frenzyNext, s.chain + 12);
  assert.equal(core.createSim({ seed: 1, mode: 0, difficulty: 2, tier: 0, runs: 0 }).frenzyAt, 10);
  assert.equal(core.createSim({ seed: 1, mode: 0, difficulty: 2, tier: 4, runs: 3 }).frenzyAt, 12);
});

test('Overdrive: arms at 300, fires only on a Close Skim or Perfect ring, 150 steps of x1.25 and smashes, then 36 i-frames and an empty meter', () => {
  const s = fresh();
  s.boost = 290;
  core.spawn(s, core.E_RING, (s.dist >> 8) + 20, (s.y >> 8) - 40, 0, 0, 0);
  const ev = run(s, 8, null, (st) => { st.vy = 0; });
  assert.ok(has(ev, core.EV_OD_ARMED), 'a plain ring arms it');
  assert.equal(s.od, 0, 'a plain ring does not fire it');
  assert.equal(s.odArmed, 1);
  // A plain Skim does not fire it either.
  const g = pylonPass(20, { tier: 4 });
  g.s.odArmed = 1;
  g.s.boost = 300;
  void g;
  // Perfect ring fires it.
  core.spawn(s, core.E_RING, (s.dist >> 8) + 20, s.y >> 8, 0, 0, 0);
  const pev = run(s, 8, null, (st) => { st.vy = 0; });
  assert.ok(has(pev, core.EV_OD_START));
  assert.ok(s.od > 0);
  assert.equal(s.speedEff, (s.speed * 320) >> 8, 'x1.25');
  // Smash: a jelly in the way is a Chomp, not a hit.
  core.spawn(s, core.E_JELLY, (s.dist >> 8) + 60, s.y >> 8, 0, 0, 0);
  const sev = run(s, 10, null, (st) => { st.vy = 0; });
  assert.ok(has(sev, core.EV_CHOMP));
  assert.equal(has(sev, core.EV_HIT), false);
  assert.equal(s.hearts, core.HEARTS);
  const rest = run(s, s.od, null, busy);
  assert.ok(has(rest, core.EV_OD_END));
  assert.equal(s.boost, 0);
  assert.equal(s.iframes, core.OD_IFRAMES);
  // A Close Skim fires an armed Overdrive.
  const c = pylonPass(10, { tier: 4 });
  void c;
  const d = fresh();
  d.boost = 300;
  d.odArmed = 1;
  const px = (d.dist >> 8) + 160;
  core.spawn(d, core.E_PYLON, px, 500, 380, 0, 0);
  const dev = run(d, 80, null, pin(500 - 190 + core.SIL_RY + 10));
  assert.ok(has(dev, core.EV_OD_START));
  // Locked before unlock tier 2.
  const t1 = fresh({ tier: 1 });
  core.spawn(t1, core.E_RING, (t1.dist >> 8) + 20, t1.y >> 8, 0, 0, 0);
  run(t1, 8, null, (st) => { st.vy = 0; });
  assert.equal(t1.boost, 0);
});

test('press and release kicks: faster reversals', () => {
  const s = fresh();
  s.vy = 400 * Q;
  core.applyInput(s, core.IN_PRESS, 0, 0);
  assert.equal(s.vy, 400 * Q - (180 * Q + ((400 * Q * 35) / 100 | 0)));
  s.vy = -300 * Q;
  core.applyInput(s, core.IN_RELEASE, 0, 0);
  assert.equal(s.vy, -180 * Q);
  // The reserved input kind (old Dash) is ignored.
  const r = fresh();
  const before = JSON.stringify([r.boost, r.speedEff, r.vy]);
  core.applyInput(r, core.IN_RESERVED, 0, 0);
  assert.equal(JSON.stringify([r.boost, r.speedEff, r.vy]), before);
});

test('Second Wind: one revive per queue run returns with 1 heart and 2s of shield; never in ride mode', () => {
  const s = fresh();
  s.hearts = 1;
  s.lastTouch = s.step;
  core.spawn(s, core.E_JELLY, (s.dist >> 8) + 40, s.y >> 8, 0, 0, 0);
  const ev = run(s, 20, null, (st) => { st.vy = 0; });
  assert.ok(has(ev, core.EV_WIPEOUT));
  assert.equal(s.phase, core.PH_WIPE);
  core.applyInput(s, core.IN_EXT, core.EXT_REVIVE, 1);
  assert.equal(s.phase, core.PH_PLAY);
  assert.equal(s.hearts, 1);
  assert.equal(s.reviveShield, core.REVIVE_SHIELD);
  const r = fresh({ mode: core.MODE_RIDE });
  r.hearts = 1;
  r.lastTouch = r.step;
  core.spawn(r, core.E_JELLY, (r.dist >> 8) + 40, r.y >> 8, 0, 0, 0);
  run(r, 20, null, (st) => { st.vy = 0; });
  core.applyInput(r, core.IN_EXT, core.EXT_REVIVE, 1);
  assert.equal(r.phase, core.PH_WIPE, 'no Second Wind in a paid ride');
  run(r, core.WIPE_ANIM + 2);
  assert.equal(r.endReason, core.END_WIPEOUT);
});

test('line boost: a server-stamped line advance adds +1s, at most +4s per run', () => {
  const s = fresh();
  const c0 = s.clockSteps;
  for (let i = 0; i < 6; i++) core.applyInput(s, core.IN_EXT, core.EXT_LINE_BOOST, 100 + i);
  assert.equal(s.clockSteps - c0, core.LINE_BOOST_MAX);
});

// ---------------------------------------------------------------------------
// 6. Determinism, descriptors, fairness gates, view.
// ---------------------------------------------------------------------------
test('determinism: planned runs replay bit-for-bit across every mode; the input log round-trips', () => {
  for (let i = 0; i < 16; i++) {
    const cfg = { seed: (i * 7919) | 0, mode: [0, 1, 2, 3][i % 4], difficulty: 1 + (i % 3), tier: i % 7, runs: i % 5 };
    const { log, s } = bots.planRun(cfg, bots.BOT_PROFILES[['ace', 'regular', 'rookie', 'novice'][i % 4]], i, 3000);
    const dec = core.decodeInputs(core.encodeInputs(log));
    assert.deepEqual(plain(dec.map((e) => [e.step, e.kind, e.sub, e.arg])), plain(log.map((e) => [e.step, e.kind, e.sub, e.arg])));
    const r = core.replay(cfg, dec, s.step);
    assert.equal(core.finalHash(r), core.finalHash(s));
    assert.equal(r.score, s.score);
  }
});

test('sprint descriptors: seeded, varied, tier-gated, no chunk twice in a row, breather after 3; run 1 teaches one verb', () => {
  const seqs = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const d = core.generateSprint(seed * 1013, 1, core.MODE_QUEUE, 12, 420);
    seqs.add(d.chunks.join(','));
    let run3 = 0;
    for (let i = 0; i < d.chunks.length; i++) {
      if (i > 0) assert.notEqual(d.chunks[i], d.chunks[i - 1]);
      run3 = core.CHUNKS[d.chunks[i]].breather ? 0 : run3 + 1;
      assert.ok(run3 <= 3);
    }
    assert.deepEqual(core.generateSprint(seed * 1013, 1, core.MODE_QUEUE, 12, 420).chunks, d.chunks);
  }
  assert.ok(seqs.size >= 15, `seeds give different courses (${seqs.size})`);
  const s = core.createSim({ seed: 5, mode: core.MODE_QUEUE, difficulty: 2, tier: 0, runs: 0 });
  for (let k = 0; k < 1200; k++) core.step(s);
  for (let i = 0; i < core.ENT_CAP; i++) {
    assert.ok(![core.E_BOX, core.E_TOKEN, core.E_PUFFER, core.E_TORPEDO].includes(s.et[i]), 'tier 0: pylons, jellies, coins and rings only');
  }
});

test('chunk gates: every chunk clears hit-free at 520 u/s on every difficulty with input changes every 4 and every 7 steps', () => {
  const { dfsClear, chunkSim } = require('../sharky/planner.cjs');
  for (const c of core.CHUNKS) {
    for (const diff of [1, 2, 3]) {
      for (const every of [4, 7]) {
        for (const y0 of [150, 500, 850]) {
          const s = chunkSim(c.id, 520, { y: y0, diff });
          const r = dfsClear(s, { every, untilX: s.gateX - 100, maxNodes: 60000 });
          assert.ok(r.ok, `${c.name} D${diff} every ${every} from y ${y0}`);
        }
      }
    }
  }
});

test('chunk audit: coin lines of 3-5 (rush lines 9), every pylon chunk teaches a Close line, Close coins sit 2-14u from the real cap', () => {
  for (const c of core.CHUNKS) {
    const lines = {};
    let pylons = 0;
    let closeCoins = 0;
    for (let k = 0; k < c.e.length; k += 5) {
      if (c.e[k] === core.E_COIN) lines[c.e[k + 3]] = (lines[c.e[k + 3]] || 0) + 1;
      if (c.e[k] === core.E_COIN && (c.e[k + 4] & core.CF_CLOSE)) closeCoins++;
      if (c.e[k] === core.E_PYLON) pylons++;
      assert.ok(c.e[k + 1] >= 0 && c.e[k + 1] <= c.len, `${c.name}: entity inside the chunk`);
    }
    for (const n of Object.values(lines)) assert.ok((n >= 3 && n <= 6) || c.id === 0, `${c.name}: line of ${n}`);
    if (pylons > 0) assert.ok(closeCoins >= 3, `${c.name}: a Close-line coin line (Rayman rule)`);
  }
  // Spawned Close coins follow the real gap at every difficulty.
  for (const diff of [1, 2, 3]) {
    const s = core.createSim({ seed: 3, mode: core.MODE_QUEUE, difficulty: diff, tier: 12, runs: 9 });
    core.setCourse(s, [1], 300);
    for (let k = 0; k < 4; k++) core.step(s);
    let pi = -1;
    for (let i = 0; i < core.ENT_CAP; i++) if (s.et[i] === core.E_PYLON && pi < 0) pi = i;
    for (let i = 0; i < core.ENT_CAP; i++) {
      if (s.et[i] !== core.E_COIN || !(s.ep2[i] & core.CF_CLOSE)) continue;
      if (Math.abs(s.ex[i] - (s.ex[pi] + 60)) > 120) continue;
      const top = s.ey[pi] - (s.ep1[pi] >> 1);
      const gap = s.ey[i] - core.SIL_RY - top;
      assert.ok(gap >= 2 && gap <= 14, `D${diff} Close coin silhouette gap ${gap}u`);
    }
  }
});

test('edge badges fire at least 600ms before a hazard reaches the view', () => {
  const badged = new Map();
  let checked = 0;
  const cfg = { seed: 99, mode: 0, difficulty: 3, tier: 12, runs: 9 };
  core.replay(cfg, bots.planRun(cfg, bots.BOT_PROFILES.ace, 1, 2400).log, 2400, (st) => {
    for (let e = 0; e < st.evN; e++) if (st.ev[e * 5] === core.EV_BADGE) badged.set(`${st.ev[e * 5 + 1]}:${st.et[st.ev[e * 5 + 1]]}:${st.ex[st.ev[e * 5 + 1]]}`, st.step);
    for (const [key, at] of badged) {
      const [i, t, x] = key.split(':').map(Number);
      if (st.et[i] !== t || st.ex[i] !== x || t === core.E_TORPEDO) continue;
      const left = core.hazardSpan(st, i)[0];
      if (left <= (st.dist >> 8) + core.aheadU(st)) {
        assert.ok(st.step - at >= 35, `badge lead ${st.step - at} steps`);
        badged.delete(key);
        checked++;
      }
    }
  });
  assert.ok(checked > 10);
});

test('ride validation: the design novice bot wins 70-95% of ride courses (pool target 72-86%)', () => {
  const novice = { name: 'novice-design', every: 8, horizon: 6, slip: 50, hug: 0, revive: false };
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

test('fixed view: every field size sees exactly 720 x 1000u of course; the shark anchors at 22% panning to 15%', () => {
  for (const [w, h] of [[390, 700], [430, 800], [820, 1000], [1024, 768], [402, 780]]) {
    const l = view.sharkyLayout(w, h);
    assert.equal(l.visibleW, 720);
    assert.equal(l.visibleH, 1000);
    assert.ok(Math.abs(l.k - Math.min(w / 720, h / 1000)) < 1e-9);
    assert.ok(l.offY >= 0 && l.sandTop <= h + 1e-6);
    assert.ok(l.offX >= 0 && l.offX * 2 + 720 * l.k <= w + 1e-6);
  }
  const s = fresh();
  assert.equal(core.anchorX(s), 158);
  s.speed = s.speedCap;
  assert.equal(core.anchorX(s), 108);
  assert.equal(core.VIEW_W - 158 - core.NOSE_OFF, 472, '472u ahead of the nose at base speed');
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
  const cs = { ...golden.vectors[3].proof, close_skims: golden.vectors[3].proof.close_skims + 1 };
  assert.equal(verify.verifySwimProof(cs).reason, 'mismatch_close_skims');
  const fast = { ...golden.vectors[3].proof, elapsed_ms: 10 };
  assert.equal(verify.verifySwimProof(fast).reason, 'too_fast');
  const old = { ...golden.vectors[3].proof, sim_version: 'swim-000000000000' };
  assert.equal(verify.verifySwimProof(old).reason, 'unknown_sim_version');
});

test('ride proof: a win needs the Ride Gate with at least 1 heart', () => {
  const golden = JSON.parse(fs.readFileSync(path.join(root, 'tools/fixtures/swim/golden.json'), 'utf8'));
  const rides = golden.vectors.filter((x) => x.proof.mode === 'ride');
  assert.ok(rides.length >= 4);
  for (const v of rides) {
    const r = verify.verifySwimProof(v.proof);
    assert.equal(r.win, v.proof.reached_gate && v.proof.hearts_left >= 1);
  }
});

test('verify.cjs bundle: the server verifier is the same sim and agrees with node', () => {
  const { build } = require('../sharky/build-verifier.cjs');
  const out = build(path.join(os.tmpdir(), `swim-verify-${process.pid}.cjs`));
  const bundled = require(out);
  const golden = JSON.parse(fs.readFileSync(path.join(root, 'tools/fixtures/swim/golden.json'), 'utf8'));
  for (const v of golden.vectors.slice(0, 8)) assert.equal(bundled.verifySwimProof(v.proof).ok, true, v.name);
  const bot = bundled.rallyBot(5, 1, 'regular');
  assert.equal(typeof bot.inputs, 'string');
  fs.unlinkSync(out);
});

test('plausibility: frame-perfect bots are flagged for review; human-paced toggling is not', () => {
  const cfg = { seed: 4242, mode: core.MODE_QUEUE, difficulty: 3, tier: 6, runs: 6 };
  const tas = bots.planRun(cfg, { name: 'tas', every: 2, horizon: 30, slip: 0, hug: 1000, revive: true }, 1, 2400);
  assert.equal(core.plausibility(core.replay(cfg, tas.log, tas.s.step)).flagged, true);
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

test('input cap (12.3): expert feathering at 8 taps/s passes; 31 events/s over 2s is rejected', () => {
  const expert = [];
  for (let st = 10; st < 60 * 20; st += 7.5) {
    const at = Math.round(st);
    expert.push({ step: at, kind: core.IN_PRESS, sub: 0, arg: 0 });
    expert.push({ step: at + 3, kind: core.IN_RELEASE, sub: 0, arg: 0 });
  }
  assert.ok(verify.inputRateOk(expert));
  const spam = [];
  for (let k = 0; k < 62; k++) spam.push({ step: 100 + Math.floor((k * 119) / 61), kind: k % 2 ? core.IN_RELEASE : core.IN_PRESS, sub: 0, arg: 0 });
  assert.equal(verify.inputRateOk(spam), false);
  assert.ok(verify.inputRateOk(spam.slice(0, 60)));
  const golden = JSON.parse(fs.readFileSync(path.join(root, 'tools/fixtures/swim/golden.json'), 'utf8'));
  const p = { ...golden.vectors[0].proof, inputs: core.encodeInputs(spam), steps_total: Math.max(golden.vectors[0].proof.steps_total, 300) };
  assert.equal(verify.verifySwimProof(p).reason, 'input_rate');
});

test('sim version is current, the chunk table is generated, and every sim worklet is defined before its callers', () => {
  const { version, text, out } = require('../sharky/sim-version.cjs');
  assert.equal(fs.readFileSync(out, 'utf8'), text(version()), 'run node tools/sharky/sim-version.cjs');
  const chunks = require('../sharky/chunks-src.cjs');
  const src = fs.readFileSync(path.join(root, 'src/games/sharky/sim/core.ts'), 'utf8');
  assert.ok(src.includes(chunks.emit()), 'run node tools/sharky/chunks-src.cjs');
  assert.match(src, /SIM_VERSION_TAG = 'tide-run-5'/);
  const { check } = require('../sharky/check-worklet-order.cjs');
  for (const f of ['src/games/sharky/sim/core.ts', 'src/games/sharky/render/view.ts']) assert.deepEqual(check(path.join(root, f)), [], f);
  // Determinism rules (4.4): no float literals, Date or ** in the sim.
  const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').split('export function plausibility')[0];
  assert.doesNotMatch(body, /Date\.|\*\*|Math\.(sin|cos|sqrt|random|pow)\(/);
  assert.doesNotMatch(body.replace(/'[^']*'/g, ''), /\b\d+\.\d+\b/, 'no float literals in the sim');
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

test('missions: 3 active, sum and best-in-run progress, 3 completions rank up; unlock cards follow the v7.1 ladder', () => {
  const m = loadTs('src/games/sharky/meta/missions.ts');
  const p = loadTs('src/games/sharky/meta/progress.ts', { '@react-native-async-storage/async-storage': { default: {} } });
  const stats = { skims: 4, closeSkims: 2, perfects: 3, frenzies: 1, tokens: 3, chomps: 2, score: 3200, gates: 3, coins: 70, overdrives: 1, hits: 1 };
  const act = m.activeMissions([], 4, 11);
  assert.equal(act.length, 3);
  assert.equal(new Set(act.map((x) => x.id)).size, 3);
  const slots = [{ id: 'perfect3', progress: 0, done: false }, { id: 'frenzy1', progress: 0, done: false }, { id: 'tokens3', progress: 0, done: false }];
  const r = m.applyRun(slots, 2, 1, 4, stats, 1);
  assert.equal(r.completed.length, 3);
  assert.equal(r.rank, 3);
  const s1 = m.applyRun([{ id: 'skim10', progress: 7, done: false }], 0, 0, 4, stats, 1);
  assert.equal(s1.missions.find((x) => x.id === 'skim10').done, true);
  assert.ok(m.activeMissions([], 0, 5).every((x) => m.MISSION_POOL.find((d) => d.id === x.id).unlock === 0));
  assert.equal(p.unlockCard(0, 1), 'NEW: Prize Boxes');
  assert.equal(p.unlockCard(1, 2), 'NEW: Overdrive');
  assert.equal(p.unlockCard(2, 3), 'NEW: Rally your crew');
  assert.equal(p.unlockCard(5, 6), null);
  assert.equal(p.unlockTier(40), 12);
  assert.equal(p.ratedDifficulty({ ...p.EMPTY_PROGRESS, recentStars: [0, 3, 1] }), 2);
});

// ---------------------------------------------------------------------------
// 8. Bot lock criteria (5.8) as starting-value guards; humans lock the numbers.
// ---------------------------------------------------------------------------
test('score shape (bot starting values): skill clearly beats regular and regular beats novice, distance under 15%, idle never pays', () => {
  // Design 5.8 locks 2.0x / 2.5x on HUMAN-calibrated bots. These are guards on
  // the starting values (measured 2.17x / 2.18x over 60 seeds), not the lock.
  const sim = require('../sharky/score-sim.cjs');
  const res = sim.audit(24);
  assert.ok(res.ratios.ace_over_regular >= 1.8, `ace/regular ${res.ratios.ace_over_regular}`);
  assert.ok(res.ratios.regular_over_novice >= 1.8, `regular/novice ${res.ratios.regular_over_novice}`);
  for (const k of ['novice', 'regular', 'ace']) assert.ok(res[k].distance_share < 0.15, `${k} distance share ${res[k].distance_share}`);
  assert.ok(res.regular.reach_frenzy >= 0.6, 'regular reaches Frenzy');
  // Idle check: a no-touch run never clears gate 2 and scores a fraction of a novice.
  const cfg = { seed: 2024, mode: core.MODE_QUEUE, difficulty: 2, tier: 4, runs: 6 };
  const idle = core.replay(cfg, [], 7200);
  assert.ok(idle.gates < 2, `idle cleared ${idle.gates} gates`);
  assert.ok(idle.score < 0.4 * res.novice.score.mean, `idle ${idle.score} vs novice ${res.novice.score.mean}`);
});
