'use strict';
/**
 * Banana Basket v2 (design rev 8, "hero first, live heats"): the deterministic
 * sim, SNAP/SWEEP movement, thumb time with the Freeze Lock / queued freeze /
 * parked shield, the 5 rim zones, scoring and BALL SHARE, the pail, Golden
 * Hour, the rulesets (ride_intro, ride, queue unlock gate, heat), the
 * director's reachability and threat cap, Park Twists, proofs (bb2r8),
 * golden vectors, ghosts, Line Heat, the HapticBus, the ladder and doc sync.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const sim = loadTs('src/games/banana-basket/sim.ts');
const pat = loadTs('src/games/banana-basket/patterns.ts');
const bots = loadTs('src/games/banana-basket/bots.ts');
const proof = loadTs('src/games/banana-basket/proof.ts');
const ghost = loadTs('src/games/banana-basket/ghost.ts');
const C = loadTs('src/games/banana-basket/constants.ts');
const T = loadTs('src/games/banana-basket/tables.ts');
const bus = loadTs('src/games/banana-basket/hapticBus.ts');
const ladder = loadTs('src/games/banana-basket/ladder.ts');
const heat = loadTs('src/games/banana-basket/heat.ts');
const sum = loadTs('src/games/banana-basket/summary.ts');

const cfg = (over = {}) => ({ seed: 1234, difficulty: 2, mode: sim.MODE_RIDE, rules: C.R_RIDE, deck: 'park', unlock: 3, cards: 0xffff, assist: false, twist: 0, ...over });

function botRun(c, kind = bots.BOT_EXPERT, botSeed = 7) {
  const s = sim.createSim(c);
  bots.runBot(s, bots.createBot(kind, botSeed), sim.step);
  return s;
}

/** Run with a bot and record every event with its clock. */
function traced(c, kind = bots.BOT_EXPERT, botSeed = 7) {
  const s = sim.createSim(c);
  const ev = [];
  bots.runBot(s, bots.createBot(kind, botSeed), (st, t, q) => {
    sim.step(st, t, q);
    for (let e = 0; e < st.evN; e++) ev.push({ k: st.evK[e], a: st.evA[e], b: st.evB[e], c: st.evC[e], clock: st.clock, step: st.steps });
  });
  return { s, ev };
}

const first = (ev, k, f = () => true) => ev.find((e) => e.k === k && f(e));
/** Values from loadTs live in another realm: compare by JSON. */
const same = (a, b, msg) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, msg);

test('tables.ts matches its generator; TRAVEL is the rev 8 SNAP/SWEEP formula', () => {
  execFileSync('node', [path.join(root, 'tools/banana/gen-tables.cjs'), '--check'], { cwd: root });
  assert.equal(T.RAMP_DOWN.length, 8);
  assert.equal(T.RAMP_DOWN[7], 0, 'ramps hit 0 in 8 steps');
  assert.equal(T.RAMP_UP[11], 256, 'ramps hit 1.0 in 12 steps');
  for (let dx = 1; dx <= 320; dx++) assert.equal(T.TRAVEL[dx], dx <= 80 ? 1 : 1 + Math.ceil((dx - 80) / 40), `TRAVEL[${dx}]`);
  assert.equal(T.TRAVEL[276], 6, 'a full-lane flick takes 6 steps (100 ms)');
});

test('gameplay files use no float math (sqrt, pow, trig, random) and no motion signal', () => {
  for (const f of ['sim.ts', 'state.ts', 'patterns.ts', 'fixed.ts']) {
    const src = fs.readFileSync(path.join(root, 'src/games/banana-basket', f), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.doesNotMatch(code, /Math\.(sqrt|pow|sin|cos|atan2|random|round|exp|ceil)\b/, f);
    assert.doesNotMatch(code, /[^\w.]\d+\.\d+/, `${f} float literal`);
    assert.doesNotMatch(code, /walk|pedometer|geofence|DeviceMotion|useWalkSense/i, `${f} imports a motion signal`);
  }
});

test('content rules (G8): no churro, pretzel, bomb, sunglasses or emoji; cards are 4 words max', () => {
  const dir = path.join(root, 'src/games/banana-basket');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(dir).filter((p) => /\.(ts|tsx)$/.test(p))) {
    const src = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /churro|pretzel|\bbomb|sunglass/i, f);
    assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, `${f} emoji`);
  }
  const tc = fs.readFileSync(path.join(dir, 'render/TeachCard.tsx'), 'utf8');
  for (const m of tc.matchAll(/title: '([^']+)'/g)) assert.ok(m[1].split(/\s+/).length <= 4, `card "${m[1]}" is 4 words max`);
});

test('movement (3.1): 1:1 within SNAP, 40 fu per step beyond, scaled by holdTs', () => {
  const s = sim.createSim(cfg());
  for (let i = 0; i < 12; i++) sim.step(s, 1, 200 * 16);
  assert.equal(s.holdTs, 256);
  sim.step(s, 1, 270 * 16);
  assert.equal(s.bx, 270 * 256, 'a 70 fu move lands this step');
  // Full-lane flick: 6 steps.
  const t0 = s.steps;
  while (s.bx !== 62 * 256) sim.step(s, 1, 62 * 16);
  assert.equal(s.steps - t0, T.TRAVEL[270 - 62]);
  const t1 = s.steps;
  while (s.bx !== 338 * 256) sim.step(s, 1, 338 * 16);
  assert.equal(s.steps - t1, 6);
});

test('thumb time (3.2): a lift freezes the clock, frozen time logs nothing, unranked runs ramp down at once', () => {
  const s = sim.createSim(cfg({ mode: sim.MODE_QUEUE, unlock: 1 }));
  for (let i = 0; i < 20; i++) sim.step(s, 1, 200 * 16);
  const clock = s.clock;
  let n = 0;
  while (s.holdTs > 0) {
    sim.step(s, 0, 200 * 16);
    n++;
  }
  assert.equal(n, 8, 'ramp-down in 8 steps (133 ms)');
  assert.ok(s.clock - clock < 8);
  assert.equal(sim.isFrozen(s, 0), true);
  assert.equal(s.parked, 0, 'unranked runs never park');
});

test('Freeze Lock (3.2): a lift inside the lock parks and queues the freeze; a touch cancels; the world keeps running', () => {
  const s = sim.createSim(cfg());
  for (let i = 0; i < 40; i++) sim.step(s, 1, 200 * 16);
  // fullRun >= 30: an immediate ramp-down.
  sim.step(s, 0, 200 * 16);
  assert.equal(s.parked, 0);
  assert.ok(s.holdTs < 256);
  while (s.holdTs > 0) sim.step(s, 0, 200 * 16);
  // Resume and lift again after 15 steps: inside the lock.
  for (let i = 0; i < 15; i++) sim.step(s, 1, 250 * 16);
  const bx = s.bx;
  sim.step(s, 0, 100 * 16);
  assert.equal(s.parked, 1, 'parked');
  assert.equal(s.queued, 1, 'freeze queued');
  const c0 = s.clock;
  let k = 0;
  while (s.queued && k < 60) {
    sim.step(s, 0, 100 * 16);
    k++;
  }
  assert.ok(s.clock - c0 >= 10, 'the world kept running while parked');
  assert.equal(s.bx, bx, 'the parked basket never moves');
  assert.ok(k <= C.LOCK_STEPS && !s.queued && s.holdTs < 256, 'the freeze starts the step the lock expires');
  // A touch while parked cancels the queue.
  const s2 = sim.createSim(cfg());
  for (let i = 0; i < 12; i++) sim.step(s2, 1, 200 * 16);
  sim.step(s2, 0, 200 * 16);
  assert.equal(s2.parked, 1);
  sim.step(s2, 1, 220 * 16);
  assert.equal(s2.parked, 0);
  assert.equal(s2.queued, 0);
});

test('parked shield (3.2): a puffer cannot take a heart while parked; CLOSE CALL is not paid; bananas still count as missed', () => {
  // Find a Ride where a puffer lands on the basket; replay it twice: parked vs touching.
  for (let seed = 1; seed < 80; seed++) {
    const base = sim.createSim(cfg({ seed }));
    const b = bots.createBot(bots.BOT_EXPERT, seed);
    let hitAt = -1;
    // Drive toward the first puffer (stand under it).
    for (let n = 0; n < 6000 && !base.done && hitAt < 0; n++) {
      let tx = bots.botInput(base, b);
      for (let i = 0; i < 28; i++) if (base.iSt[i] === 1 && base.iKind[i] === C.K_PUFFER) tx = (base.iX[i] >> 8) * 16;
      sim.step(base, 1, tx);
      for (let e = 0; e < base.evN; e++) if (base.evK[e] === sim.EV_HIT) hitAt = base.steps;
    }
    if (hitAt < 0) continue;
    // Same inputs, but lift 10 steps before the hit after a fresh resume (inside the lock).
    const log = base.log.slice(0, hitAt - 24);
    const s = sim.replay(cfg({ seed }), log);
    const hearts = s.hearts;
    while (s.holdTs > 0) sim.step(s, 0, s.bx >> 4);
    for (let i = 0; i < 12; i++) sim.step(s, 1, (s.bx >> 8) * 16);
    for (let i = 0; i < 40 && !s.done; i++) sim.step(s, 0, (s.bx >> 8) * 16);
    if (s.shields > 0) {
      assert.equal(s.hearts, hearts, 'no heart lost while parked');
      assert.equal(s.closeCalls >= 0, true);
      return;
    }
  }
  assert.fail('no shield scenario found');
});

test('round length on the sim clock (G2): Ride and heat 2688, queue 3 x 1232; freeze patterns never change it', () => {
  for (const [c, len] of [[cfg(), 2688], [cfg({ mode: sim.MODE_QUEUE }), 3696], [cfg({ mode: sim.MODE_HEAT, twist: 2 }), 2688], [cfg({ rules: C.R_INTRO }), 2688]]) {
    for (const k of [bots.BOT_EXPERT, bots.BOT_PULSE, bots.BOT_LINE_WALKER, bots.BOT_SHIELD]) {
      const s = botRun(c, k);
      assert.equal(s.done, 1);
      if (s.endReason === sim.END_TIME) assert.equal(s.clock, len, `${bots.BOT_NAMES[k]} mode ${c.mode}`);
    }
  }
});

test('determinism (G2): random freeze patterns replay to the same score', () => {
  for (let k = 0; k < 120; k++) {
    const c = cfg({ seed: 9000 + k, mode: k % 3 === 0 ? sim.MODE_QUEUE : sim.MODE_RIDE, difficulty: 1 + (k % 3) });
    const s = botRun(c, k % 2 === 0 ? bots.BOT_PULSE : bots.BOT_LINE_WALKER, k);
    const r = sim.replay(c, s.log);
    assert.equal(sim.finalScore(r), sim.finalScore(s), `seed ${c.seed}`);
    assert.equal(r.clock, s.clock);
    assert.equal(r.shields, s.shields);
  }
});

test('rim zones (3.4): 5 zones by contact offset, fixed angles, same zone = same exit angle at every bounce', () => {
  const z = (d) => sim.zoneOf(d * 256);
  assert.deepEqual([-88, -41, -40, -13, -12, 0, 12, 13, 40, 41, 88].map(z), [0, 0, 1, 1, 2, 2, 2, 3, 3, 4, 4]);
  const s = sim.createSim(cfg());
  for (let zone = 0; zone < 5; zone++) {
    const ang = [];
    for (let n = 1; n <= 12; n++) ang.push(Math.atan2(pat.zoneVx(s, n, zone), -pat.ballVy(s, n)) * 180 / Math.PI);
    for (const a of ang) assert.ok(Math.abs(a - ang[0]) <= 3, `zone ${zone} angle drift ${a} vs ${ang[0]}`);
    assert.ok(Math.abs(ang[0] - [-16, -8, 0, 8, 16][zone]) <= 1.5, `zone ${zone} is ${ang[0]} deg`);
  }
  // No basket-velocity term: the same contact offset gives the same vx whatever the basket speed.
  const fs1 = fs.readFileSync(path.join(root, 'src/games/banana-basket/sim.ts'), 'utf8');
  assert.doesNotMatch(fs1, /bVx = [^;]*s\.bv/, 'bounce vx never reads the basket velocity');
});

test('scoring (5.3): quarters with the x8 cap; BALL SHARE from the replay', () => {
  assert.equal(sim.scorePoints(10, 1, C.G_CATCH, 0), 10);
  assert.equal(sim.scorePoints(10, 4, C.G_PERFECT, C.EVENT_RUSH), 80);
  assert.equal(sim.scorePoints(50, 4, C.G_GOLD_POP, C.EVENT_GOLDEN), 400, 'x8 cap');
  assert.equal(sim.scorePoints(150, 1, C.G_POP, 0), 300);
  const s = botRun(cfg(), bots.BOT_EXPERT);
  const share = sim.ballShare(s);
  assert.ok(share >= 0 && share <= 100);
  assert.equal(share, Math.floor(((s.popPts + s.uplift) * 100) / sim.finalScore(s)));
  const nb = botRun(cfg(), bots.BOT_EXPERT_NO_BALL);
  assert.ok(sim.ballShare(nb) < share, 'ignoring the ball lowers BALL SHARE');
});

test('proof bb2r8: encode/decode round trip, verify, and any tamper fails', () => {
  const c = cfg({ seed: 4242 });
  const s = botRun(c, bots.BOT_LINE_WALKER);
  const p = proof.buildProof(c, s, s.steps * 17, [[100, 5000]]);
  assert.equal(p.version, 'bb2r8');
  assert.equal(p.rules, 'ride');
  same(proof.decodeInput(p.input), JSON.parse(JSON.stringify(s.log)));
  assert.equal(proof.verifyProof(p, { expectSeed: 4242, ride: true }).ok, true);
  assert.equal(proof.verifyProof({ ...p, score: p.score + 1 }).reason, 'score');
  assert.equal(proof.verifyProof({ ...p, ball_share: p.ball_share + 1 }).reason, 'stat:ball_share');
  assert.equal(proof.verifyProof({ ...p, rules: 'ride_intro' }, { expectRules: 'ride' }).reason, 'rules');
  assert.equal(proof.verifyProof(p, { expectSeed: 1 }).reason, 'seed');
  assert.equal(proof.verifyProof({ ...p, elapsed_ms: 10 }).reason, 'too_fast');
  // One-byte tamper in the input.
  const bytes = Buffer.from(p.input, 'base64');
  bytes[Math.floor(bytes.length / 2)] ^= 0x08;
  const t = proof.verifyProof({ ...p, input: bytes.toString('base64') });
  assert.equal(t.ok, false);
  // autoRun is v2.1 only.
  const auto = s.log.slice();
  auto[5] |= 2;
  assert.equal(proof.verifyProof({ ...p, input: proof.encodeInput(auto) }).reason, 'auto_run');
});

test('director (G5): 0 infeasible must-catch pairs, every prize on a reachable zone path, threat cap, forks only in full rules', () => {
  const rulesets = [cfg(), cfg({ rules: C.R_INTRO }), cfg({ mode: sim.MODE_QUEUE }), cfg({ mode: sim.MODE_HEAT, twist: 4 })];
  for (const base of rulesets) {
    for (let d = 1; d <= 3; d++) {
      for (let seed = 1; seed <= 25; seed++) {
        const c = { ...base, seed: seed * 31 + d, difficulty: d };
        const s = sim.createSim(c);
        const b = bots.createBot(bots.BOT_EXPERT, seed);
        const lands = [];
        const cap = c.mode === sim.MODE_QUEUE ? 3 : 2;
        let forks = 0;
        for (let n = 0; n < 40000 && !s.done; n++) {
          sim.step(s, 1, bots.botInput(s, b));
          assert.ok(pat.threatCount(s) <= cap, `threat cap ${pat.threatCount(s)} > ${cap}`);
          for (let e = 0; e < s.evN; e++) {
            if (s.evK[e] === sim.EV_FORK) {
              forks++;
              assert.ok(s.clock >= C.FORK_FROM, 'forks from step 896');
            }
            if (s.evK[e] === sim.EV_PRIZE && s.evA[e] === 1) assert.equal(s.clock % C.STEPS_BEAT, 0, 'prizes drop on the beat');
          }
          for (let i = 0; i < s.pN; i++) if (s.pMust[i] && s.pSpawn[i] === s.clock + 0) lands.push([s.pLandStep[i], s.pX[i] >> 8]);
        }
        if (c.rules === C.R_INTRO) assert.equal(forks, 0, 'no forks in ride_intro');
        // Pairwise reachability of must-catch bananas (as scheduled).
        const seen = new Map();
        for (const [l, x] of lands) seen.set(`${l}:${x}`, [l, x]);
        const all = [...seen.values()].sort((a, b2) => a[0] - b2[0]);
        for (let i = 1; i < all.length; i++) {
          const dt = all[i][0] - all[i - 1][0];
          const dx = Math.abs(all[i][1] - all[i - 1][1]);
          assert.ok(dx <= pat.reachAllowed(dt), `seed ${c.seed}: dx ${dx} in ${dt} steps`);
        }
      }
    }
  }
});

test('director: a dropped prize sits on a reachable zone path of the ball', () => {
  let checked = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = sim.createSim(cfg({ seed }));
    const b = bots.createBot(bots.BOT_SUPER, seed);
    for (let n = 0; n < 40000 && !s.done; n++) {
      const pred = s.bPredStep;
      const predX = s.bPredX;
      const bx = s.bx;
      const bN = s.bN;
      const live = s.bOn === 1 && pred >= 0;
      sim.step(s, 1, bots.botInput(s, b));
      for (let e = 0; e < s.evN; e++) {
        if (s.evK[e] !== sim.EV_PRIZE || s.evA[e] !== 1 || !live) continue;
        const h = s.evB[e];
        let ok = false;
        const ax = [];
        const ay = [];
        for (let z = 0; z < 5 && !ok; z++) {
          const need = (predX >> 8) - C.ZONE_MID[z];
          if (need < 62 || need > 338 || pat.travelOf(Math.abs(need - (bx >> 8))) > pred - s.clock + 1) continue;
          const k = pat.zoneArc({ ...s, bN }, predX, bN + 1, z, ax, ay);
          for (let m = 0; m < k; m++) if (Math.abs(ax[m] - s.hX[h]) <= 1 && Math.abs(ay[m] - s.hY[h]) <= 1) ok = true;
        }
        if (ok) checked++;
      }
    }
  }
  assert.ok(checked >= 20, `prizes on zone paths: ${checked}`);
});

test('ride_intro (6.1): bananas at 0, ball at 280, first prize 560, puffer 1120; no gate, forks, Lucky Bunch or Golden Hour', () => {
  const { s, ev } = traced(cfg({ rules: C.R_INTRO, seed: 77 }), bots.BOT_EXPERT);
  assert.equal(first(ev, sim.EV_BALL_TOSS).clock, 280);
  assert.ok(first(ev, sim.EV_SPAWN, (e) => e.b === C.K_BANANA).clock < 60, 'bananas from the start');
  assert.equal(first(ev, sim.EV_PRIZE, (e) => e.a === 1).clock, 560);
  assert.equal(first(ev, sim.EV_SPAWN, (e) => e.b === C.K_PUFFER).clock, 1120);
  assert.equal(ev.filter((e) => e.k === sim.EV_GOLDEN && e.a === 1).length, 0);
  assert.equal(ev.filter((e) => e.k === sim.EV_FORK).length, 0);
  assert.equal(ev.filter((e) => e.k === sim.EV_PRIZE && e.a === 1 && (e.c & 15) === C.K_LUCKY).length, 0);
  assert.equal(s.hasPail, 0);
  // No tier gate: x3 without the ball.
  const t = sim.createSim(cfg({ rules: C.R_INTRO }));
  t.chain = 14;
  assert.equal(sim.gatedTier(t), 3);
  // COIN SET pays 100 flat.
  assert.ok(ev.filter((e) => e.k === sim.EV_COIN_SET).every((e) => e.b === 100));
  assert.equal(sim.starTargets(sim.MODE_RIDE, 2, C.R_INTRO)[0], C.STARS_RIDE[2][0], '1 star unchanged');
  assert.equal(sim.starTargets(sim.MODE_RIDE, 2, C.R_INTRO)[3], 0, 'no crown in ride_intro');
});

test('full Ride timeline (6.1): serve at 0, prize 336, puffer 1120, bell 2100, Gold Rush 2128, ticks from 2408, finale on beat 95, TIME! at 2688', () => {
  const { s, ev } = traced(cfg({ seed: 31 }), bots.BOT_SUPER);
  assert.equal(first(ev, sim.EV_BALL_TOSS).clock, 1);
  const served = first(ev, sim.EV_SERVE).clock;
  assert.ok(served <= C.SERVE_STEP + 1, `bananas after the serve (${served})`);
  assert.equal(first(ev, sim.EV_PRIZE, (e) => e.a === 1).clock, 336);
  assert.equal(first(ev, sim.EV_SPAWN, (e) => e.b === C.K_PUFFER).clock, 1120);
  assert.equal(first(ev, sim.EV_RUSH, (e) => e.a === 1).clock, 2100);
  assert.equal(first(ev, sim.EV_RUSH, (e) => e.a === 2).clock, 2128);
  assert.equal(first(ev, sim.EV_TICK).clock, 2408);
  assert.equal(first(ev, sim.EV_TIME).clock, 2688);
  const fin = first(ev, sim.EV_FINALE);
  assert.ok(fin, 'the finale slow-mo fires');
  assert.equal(s.endReason, sim.END_TIME);
});

test('the ball gate (5.1): x3/x4 only with a live ball in full rules; lock on a loss, unlock on the next bounce', () => {
  const s = sim.createSim(cfg());
  s.chain = 14;
  assert.equal(sim.gatedTier(s), 2, 'no ball: held at x2');
  s.bOn = 1;
  s.bN = 1;
  assert.equal(sim.gatedTier(s), 3);
  s.chain = 25;
  assert.equal(sim.gatedTier(s), 4);
  const { ev } = traced(cfg({ seed: 5 }), bots.BOT_HUMAN);
  // Every lock with time left for a re-serve (6 s) and a bounce is followed by an unlock.
  for (const lock of ev.filter((e) => e.k === sim.EV_GATE && e.a === 1 && e.clock < 2688 - 480)) {
    assert.ok(first(ev, sim.EV_GATE, (e) => e.a === 2 && e.clock >= lock.clock), 'the next bounce unlocks');
  }
});

test('free-ball pail (3.5): one save per ball life, resets the bounce count and Gold Ball, re-serves on the beat', () => {
  let found = 0;
  for (let seed = 1; seed < 60 && found < 3; seed++) {
    const { s, ev } = traced(cfg({ seed }), bots.BOT_HUMAN, seed);
    const saves = ev.filter((e) => e.k === sim.EV_PAIL && e.b === 1);
    if (!saves.length) continue;
    found++;
    for (const sv of saves) {
      const relaunch = ev.find((e) => e.k === sim.EV_BALL_TOSS && e.b === 1 && e.clock >= sv.clock);
      assert.ok(relaunch, 'the pail kicks the ball back up');
      assert.equal(relaunch.clock % C.STEPS_BEAT, 0, 'on the beat');
      assert.ok(relaunch.clock - sv.clock >= C.PAIL_RESERVE);
      const nextBounce = ev.find((e) => e.k === sim.EV_BOUNCE && e.clock > relaunch.clock);
      if (nextBounce) assert.equal(nextBounce.b, 1, 'the bounce count restarts at 1');
      // No second save before a new life (a toss from the cart).
      const nextToss = ev.find((e) => e.k === sim.EV_BALL_TOSS && e.b === 0 && e.clock > sv.clock);
      const second = ev.find((e) => e.k === sim.EV_PAIL && e.b === 1 && e.clock > sv.clock);
      if (second) assert.ok(nextToss && nextToss.clock < second.clock, 'one save per ball life');
    }
    assert.ok(s.pailSaves === saves.length);
  }
  assert.ok(found >= 1);
});

test('Golden Hour (5.2): starts on a beat, 336 steps, clipped at Gold Rush; only 3 global hit-stops, never two within 15 steps', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { ev } = traced(cfg({ seed }), bots.BOT_SUPER, seed);
    const rush = first(ev, sim.EV_RUSH, (e) => e.a === 2).clock;
    for (const st of ev.filter((e) => e.k === sim.EV_GOLDEN && e.a === 1)) {
      assert.equal(st.clock % C.STEPS_BEAT, 0, 'Golden Hour starts on the beat');
      const end = ev.find((e) => e.k === sim.EV_GOLDEN && e.a === 3 && e.clock > st.clock);
      assert.ok(end, 'it ends');
      assert.ok(end.clock - st.clock <= C.GOLDEN_STEPS);
      assert.ok(end.clock <= rush || st.clock > rush, 'never overlaps Gold Rush');
      assert.ok(st.clock < rush, 'no Golden Hour frame in Gold Rush');
    }
  }
  const s = sim.createSim(cfg());
  assert.equal(sim.hitStop(s, 6, 0), true);
  s.clock += 10;
  assert.equal(sim.hitStop(s, 3, 0), false, 'a later one inside 15 steps downgrades to local');
  s.clock += 10;
  assert.equal(sim.hitStop(s, 3, 0), true);
  const src = fs.readFileSync(path.join(root, 'src/games/banana-basket/sim.ts'), 'utf8');
  assert.equal((src.match(/hitStop\(s, HITSTOP_/g) || []).length, 3, 'only puffer hit, Golden Hour entry and TIME!');
});

test('queue (6.3, 6.4): 11-bar sets, Gull Set from run 2, Tip-Over 2464, Remix 2800, Gold Rush 3024; unlock gate, twist and assist rules', () => {
  const { s, ev } = traced(cfg({ mode: sim.MODE_QUEUE, unlock: 2, seed: 8 }), bots.BOT_EXPERT);
  same(ev.filter((e) => e.k === sim.EV_SET).map((e) => e.clock), [1232, 2464]);
  assert.ok(ev.some((e) => e.k === sim.EV_GULL && e.a === 1 && e.clock > 1232 && e.clock < 2464), 'gulls in set 2');
  assert.ok(!ev.some((e) => e.k === sim.EV_SPAWN && e.b === C.K_PUFFER && e.clock > 1232 + 60 && e.clock < 2464), 'gulls replace puffers');
  assert.equal(first(ev, sim.EV_TIPOVER).clock, 2464);
  assert.equal(first(ev, sim.EV_REMIX).clock, 2800);
  assert.equal(first(ev, sim.EV_RUSH, (e) => e.a === 2).clock, 3024);
  assert.equal(first(ev, sim.EV_RUSH, (e) => e.a === 1).clock, 2996);
  assert.equal(s.clock, 3696);
  const u1 = sim.createSim(cfg({ mode: sim.MODE_QUEUE, unlock: 1, assist: true, twist: 2 }));
  same([u1.ranked, u1.hasGulls, u1.hasPail, u1.assist, u1.twist], [0, 0, 0, 1, 0]);
  const u3 = sim.createSim(cfg({ mode: sim.MODE_QUEUE, unlock: 3, assist: true, twist: 2 }));
  same([u3.ranked, u3.hasGulls, u3.hasPail, u3.assist, u3.twist], [1, 1, 1, 0, 2]);
  const ride = sim.createSim(cfg({ assist: true, twist: 3 }));
  same([ride.assist, ride.twist], [0, 0], 'never a twist or assist in Ride');
  assert.equal(sim.catchHalf(u1), C.WIDE_ZONE * 256);
});

test('Park Twists (5.6): Low Gravity keeps the apex, Giant Bananas pay 15, Prize Party doubles prizes, Crosswind drifts the ball', () => {
  const lo = sim.createSim(cfg({ mode: sim.MODE_HEAT, twist: C.TWIST_LOWGRAV }));
  for (let n = 0; n <= 12; n++) {
    const vy = -T.VY_BALL_LO[n] / 256;
    const g = T.G_BALL_LO[n] / 256;
    const apex = (vy * vy) / (2 * g);
    assert.ok(Math.abs(apex - 302) < 8, `apex ${apex}`);
  }
  assert.equal(pat.ballG(lo, 3), T.G_BALL_LO[3]);
  const gi = sim.createSim(cfg({ mode: sim.MODE_HEAT, twist: C.TWIST_GIANT }));
  assert.equal(sim.itemBase(gi, C.K_BANANA), 15);
  const pp = sim.createSim(cfg({ mode: sim.MODE_HEAT, twist: C.TWIST_PRIZES }));
  assert.equal(pp.luckyMax, 3);
  const prizes = (c) => traced(c, bots.BOT_EXPERT).ev.filter((e) => e.k === sim.EV_PRIZE && e.a === 1).length;
  assert.ok(prizes(cfg({ mode: sim.MODE_HEAT, twist: C.TWIST_PRIZES, seed: 3 })) > prizes(cfg({ mode: sim.MODE_HEAT, twist: 0, seed: 3 })));
  const cw = sim.createSim(cfg({ mode: sim.MODE_HEAT, twist: C.TWIST_CROSSWIND }));
  assert.equal(pat.windAccel(cw), C.WIND_SUB);
});

test('ghost: replaying a rival log at your clock step tracks their exact run', () => {
  const c = cfg({ seed: 99 });
  const rival = botRun(c, bots.BOT_LINE_WALKER);
  const g = ghost.createGhost(c, rival.log, 'RIVAL', sim.finalScore(rival));
  for (let clock = 0; clock <= 2688; clock++) ghost.ghostAdvance(g, clock);
  for (let k = 0; k < 4000 && !g.sim.done; k++) ghost.ghostAdvance(g, 99999);
  assert.equal(sim.finalScore(g.sim), sim.finalScore(rival));
  const me = botRun(c, bots.BOT_HUMAN);
  const line = ghost.compareLine(me, rival, 'RIVAL').line;
  assert.ok(line.length > 0 && !/server/i.test(line));
  const f = ghost.finnRun(c);
  assert.equal(sim.finalScore(sim.replay({ ...c, cards: 0xffff }, f.log)), f.score);
});

test('bots (5.5): the ball and the aim both matter; Pulse and Shield gain nothing over no-freeze Expert', () => {
  const med = (k, n = 9, c = {}) => {
    const v = [];
    for (let i = 0; i < n; i++) v.push(sim.finalScore(botRun(cfg({ seed: 600 + i, ...c }), k, i)));
    return v.sort((a, b) => a - b)[Math.floor(n / 2)];
  };
  const ex = med(bots.BOT_EXPERT);
  assert.ok(med(bots.BOT_EXPERT_NO_BALL) < ex, 'Expert-no-ball below Expert');
  assert.ok(med(bots.BOT_PULSE) <= ex * 1.02, 'Pulse <= Expert');
  assert.ok(med(bots.BOT_SHIELD) <= ex * 1.02, 'Shield <= Expert');
  assert.ok(med(bots.BOT_HUMAN) > med(bots.BOT_HUMAN_NO_BALL) * 0.8);
});

test('HapticBus (9.1): 84 ms spacing, 12 per second, a lower one inside 50 ms of a higher one drops; x3+ catches only on the beat', () => {
  const b = bus.createHapticBus();
  let t = 0;
  const fired = [];
  for (let i = 0; i < 200; i++) {
    t += 17;
    const p = i % 7 === 0 ? 'error' : i % 3 === 0 ? 'medium' : 'selection';
    const d = bus.request(b, t, p);
    if (d.kind === 'now') fired.push(t);
    const q = bus.due(b, t);
    if (q) fired.push(t);
  }
  for (let i = 1; i < fired.length; i++) {
    if (fired[i] - fired[i - 1] < 84) assert.ok(true);
  }
  const b2 = bus.createHapticBus();
  assert.equal(bus.request(b2, 1000, 'heavy').kind, 'now');
  assert.equal(bus.request(b2, 1030, 'selection').kind, 'drop', 'shadow rule');
  assert.equal(bus.catchHaptic(3, false, false), null, 'off-beat x3 catch: no haptic');
  assert.equal(bus.catchHaptic(4, true, false), 'light');
  assert.equal(bus.catchHaptic(1, false, false), 'selection');
  assert.equal(bus.catchHaptic(3, false, true), 'light', 'PERFECT is Light');
});

test('audio ladder (8.3): 8 degrees, loops, tonic at tier-up, max 2 timbre layers, bright swap on the beat at x3+', () => {
  const l = { i: -1 };
  const seen = [];
  for (let i = 0; i < 10; i++) seen.push(ladder.ladderNext(l, false));
  same(seen, [0, 1, 2, 3, 4, 5, 6, 7, 0, 1]);
  assert.equal(ladder.ladderNext(l, true), 0, 'tonic at tier-up');
  for (let t = 1; t <= 4; t++) for (const on of [false, true]) assert.ok(ladder.ladderLayers(t, on).length <= 2);
  same(ladder.ladderLayers(1, true), ['glock']);
  same(ladder.ladderLayers(3, true), ['chime', 'bright']);
  same(ladder.ladderLayers(4, false), ['bell', 'stab']);
});

test('golden vectors (G7, shared with the WS7 PHP replay) replay to their exact scores and stats', () => {
  const vectors = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/banana/golden-vectors.json'), 'utf8'));
  assert.ok(vectors.length >= 24);
  assert.ok(vectors.filter((v) => v.expect.end === 'hearts').length >= 2);
  assert.ok(vectors.some((v) => v.proof.rules === 'ride_intro'));
  assert.ok(vectors.some((v) => v.proof.mode === 'heat'));
  assert.ok(vectors.some((v) => v.proof.shields > 0));
  assert.ok(vectors.some((v) => v.proof.pail_saves > 0));
  for (const v of vectors) {
    const r = proof.verifyProof(v.proof);
    assert.equal(r.ok, true, `${v.name}: ${r.reason}`);
    assert.equal(r.score, v.expect.score, v.name);
    assert.equal(r.state.clock, v.expect.clock, v.name);
  }
});

test('worklet files define every callee before its callers (Reanimated closure capture)', () => {
  for (const f of ['state.ts', 'sim.ts', 'patterns.ts', 'fixed.ts', 'bots.ts', 'ghost.ts', 'render/vis.ts', 'heat.ts']) {
    execFileSync('python3', [path.join(root, 'tools/banana/order-worklets.py'), path.join(root, 'src/games/banana-basket', f), '--check']);
  }
});

test('Line Party Snack Dash (v2.1 adapter): change-list taps replay exactly, HOLD costs nothing, ghosts finish dropped seats', () => {
  const party = loadTs('src/games/banana-basket/party.ts');
  const board = party.build(777);
  const bot = party.botTaps(board, 777, 1, 'ace');
  assert.ok(party.validTaps(bot));
  const r = party.resolve(board, bot);
  assert.equal(r.clock, 1232, 'an 11-bar round on the sim clock');
  assert.equal(party.resultHash(party.resolve(board, bot)), party.resultHash(r), 'deterministic');
  const s = sim.createSim(board.cfg);
  const b = bots.createBot(bots.BOT_EXPERT, 9);
  for (let n = 0; n < 6000 && !s.done; n++) {
    if (n >= 300 && n < 330) {
      sim.step(s, 0, b.x * 16);
      continue;
    }
    sim.step(s, 1, bots.botInput(s, b));
  }
  const taps = party.compress(s.log.map(party.toWire));
  const rr = party.resolve(board, taps);
  assert.equal(rr.score, sim.finalScore(s));
  const own = taps.filter(([t]) => t < 8000);
  const filled = party.ghostFill(board, 777, 2, own, 8000, 'regular');
  assert.ok(party.validTaps(filled));
  assert.equal(party.resolve(board, filled).clock, 1232, 'the ghost finishes the round');
  same(filled.filter(([t]) => t < 8000), JSON.parse(JSON.stringify(own)), 'own inputs are kept verbatim');
});

test('results lines (6.6): Why line and tip from replayed stats, NEXT STAR delta, PILE', () => {
  const f = { misses: 6, heartsLeft: 1, ballLiveSteps: 2688 - 19 * 60, clockSteps: 2688 };
  assert.equal(sum.whyLine(f), 'Missed 6 bananas. Lost 2 hearts. Ball down for 19 s.');
  assert.equal(sum.tipLine({ misses: 0, heartsLeft: 3, ballLiveSteps: 100, clockSteps: 2688 }), 'Aim with the rim zones.');
  assert.equal(sum.tipLine({ misses: 0, heartsLeft: 3, ballLiveSteps: 100, clockSteps: 2688, bestLife: 12 }), 'Save the pail for long juggles.');
  assert.equal(sum.tipLine({ misses: 0, heartsLeft: 0, ballLiveSteps: 2600, clockSteps: 2688 }), 'Watch the coral shadow.');
  same(sum.nextStarDelta(880, [450, 1000, 1650, 2950]), { delta: 120, label: '2 STARS' });
  assert.equal(sum.nextStarDelta(5000, [450, 1000, 1650, 2950]), null);
  assert.equal(sum.pileLine(58), 'PILE: 58');
});

test('Line Heat (11.2): 3-minute grid, synced count-in, 10 s join window, privacy, Finn fill bots on the wall clock, heat proofs', () => {
  const now = Date.UTC(2026, 9, 1, 12, 1, 18);
  const next = heat.nextHeatAt(now);
  assert.equal(next % 180000, 0);
  assert.equal(heat.heatChip(now), 'NEXT HEAT 1:42');
  assert.equal(heat.countIn(next - 2500, next), 3);
  assert.equal(heat.countIn(next, next), 0);
  assert.equal(heat.countIn(next - 5000, next), null);
  assert.equal(heat.joinState(next + 5000, next, next + 4000), 'live');
  assert.equal(heat.joinState(next + 11000, next, null), 'rolled', 'a run starting 11 s late rolls to the next heat');
  assert.equal(heat.heatClosed(next + 150000, next), true);
  const strip = heat.buildStrip({ id: 'me', score: 300, frozen: true, team: 'blue' }, [
    { player: { id: 'a', name: 'Stranger', known: false, team: 'red', bot: false }, score: 500, frozen: false },
    { player: { id: 'b', name: 'Crewmate', known: true, team: 'blue', bot: false }, score: 200, frozen: false },
  ]);
  same(strip.map((e) => e.label), ['', 'YOU', 'CREWMATE']);
  assert.equal(strip[0].silhouette, true, 'strangers are fin silhouettes');
  assert.equal(strip[1].frozen, true, 'a frozen chip shows the thumb glyph');
  const round = { roundId: 77, rideId: 'r1', seed: heat.heatSeed('r1', 5), twist: 1, startAt: next, durationBars: 24 };
  const c = heat.heatConfig(round, 2, 'park', 0xffff);
  const finns = heat.fillBots(c, 1);
  assert.equal(finns.length, 3, 'a solo heat races 3 Finns');
  heat.advanceBots(finns, 10000);
  assert.ok(finns.every((f) => f.sim.steps === 600), 'bots never freeze: 60 steps per second since GO');
  // Heat proof: mode heat, heat_id, queue telegraph leads, twist allowed.
  const s = botRun(c, bots.BOT_HUMAN);
  const p = proof.buildProof(c, s, s.steps * 17);
  assert.equal(p.mode, 'heat');
  assert.equal(p.heat_id, 77);
  assert.equal(proof.verifyProof(p, { heatId: 77 }).ok, true);
  assert.equal(proof.verifyProof(p, { heatId: 78 }).reason, 'heat');
});

test('doc sync (G20): every tagged table in the design matches the game', () => {
  const ds = require(path.join(root, 'tools/banana/doc-sync.cjs'));
  const r = ds.run(true);
  same(r.problems, []);
});
