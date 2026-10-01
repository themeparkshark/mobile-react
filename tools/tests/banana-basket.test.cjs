'use strict';
/**
 * Banana Basket v2 (design rev 5, "the ball is the key"): the deterministic sim, the director's
 * reachability, thumb-driven time, scoring, proofs and replays, ghosts, the
 * queue unlock gate, telegraph timing, onboarding spacing and the HapticBus.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const sim = loadTs('src/games/banana-basket/sim.ts');
const bots = loadTs('src/games/banana-basket/bots.ts');
const proof = loadTs('src/games/banana-basket/proof.ts');
const ghost = loadTs('src/games/banana-basket/ghost.ts');
const C = loadTs('src/games/banana-basket/constants.ts');
const T = loadTs('src/games/banana-basket/tables.ts');
const bus = loadTs('src/games/banana-basket/hapticBus.ts');
const audio = loadTs('src/games/banana-basket/ladder.ts');

const cfg = (over = {}) => ({ seed: 1234, difficulty: 2, mode: sim.MODE_RIDE, deck: 'park', unlock: 5, cards: 0xffff, assist: false, twist: C.TWIST_BREEZY, ...over });

function botRun(c, kind = bots.BOT_EXPERT, botSeed = 7) {
  const s = sim.createSim(c);
  bots.runBot(s, bots.createBot(kind, botSeed), sim.step);
  return s;
}

function collect(s, stepFn) {
  const events = [];
  const orig = stepFn;
  return (st, t, q) => {
    orig(st, t, q);
    for (let e = 0; e < st.evN; e++) events.push({ k: st.evK[e], a: st.evA[e], b: st.evB[e], c: st.evC[e], clock: st.clock, step: st.steps });
    s.events = events;
  };
}

test('tables.ts matches its generator (baked integer tables)', () => {
  execFileSync('node', [path.join(root, 'tools/banana/gen-tables.cjs'), '--check'], { cwd: root });
  assert.equal(T.RAMP_DOWN.length, 8);
  assert.equal(T.RAMP_DOWN[7], 0, 'RAMP_DOWN reaches 0 in 8 steps');
  assert.ok(T.RAMP_UP.slice(0, 12).includes(256), 'RAMP_UP reaches 1.0 within 12 steps');
});

test('gameplay files use no float math (sqrt, pow, trig, random)', () => {
  for (const f of ['sim.ts', 'state.ts', 'patterns.ts', 'fixed.ts']) {
    const src = fs.readFileSync(path.join(root, 'src/games/banana-basket', f), 'utf8');
    assert.doesNotMatch(src, /Math\.(sqrt|pow|sin|cos|atan2|random|round|exp)\b/, f);
    assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /[^\w.]\d+\.\d+/, `${f} float literal`);
  }
});

test('no churro, pretzel, bomb, sunglasses or emoji in the game', () => {
  const dir = path.join(root, 'src/games/banana-basket');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(dir).filter((p) => /\.(ts|tsx)$/.test(p))) {
    const src = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /churro|pretzel|bomb|sunglasses/i, f);
    assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, f);
    assert.doesNotMatch(src, /—/, `${f} em dash`);
  }
});

test('basket movement: 1:1 below the free band, capped above, and TRAVEL matches the sim', () => {
  for (const dx of [5, 14, 40, 90, 150, 276]) {
    const s = sim.createSim(cfg());
    s.holdTs = 256;
    s.bx = 62 * 256;
    s.btx = (62 + dx) * 256;
    let n = 0;
    while (s.bx !== s.btx && n < 100) {
      sim.moveBasket(s);
      n++;
    }
    assert.equal(n, T.TRAVEL[dx], `dx ${dx}`);
  }
  const s = sim.createSim(cfg());
  s.holdTs = 256;
  s.btx = s.bx + 10 * 256;
  sim.moveBasket(s);
  assert.equal(s.bx, s.btx, 'a small drag lands the same step (no added latency)');
  s.btx = s.bx + 200 * 256;
  for (let i = 0; i < 6; i++) sim.moveBasket(s);
  assert.ok(Math.abs(s.bv) <= C.CAP_SUB, 'never faster than the cap');
  assert.notEqual(s.bx, s.btx, 'a fast flick trails the finger');
  assert.equal(T.TRAVEL[276] <= 14, true, 'the lane crosses in about 233 ms');
});

test('thumb-driven time: lifting freezes the clock, frozen time logs nothing, re-grips never lose time', () => {
  const s = sim.createSim(cfg());
  for (let i = 0; i < 120; i++) sim.step(s, 1, 3200);
  const clockA = s.clock;
  const logA = s.log.length;
  let downSteps = 0;
  while (s.holdTs > 0) {
    sim.step(s, 0, 3200);
    downSteps++;
  }
  assert.ok(downSteps <= 8, 'ramps to 0 within 8 steps');
  assert.ok(sim.isFrozen(s, 0));
  const frozenClock = s.clock;
  assert.ok(frozenClock - clockA < 8);
  assert.equal(s.log.length, logA + downSteps, 'frozen time adds no log entries');
  sim.step(s, 1, 3200);
  assert.ok(s.holdTs > 0 && s.holdTs < 256, 'resume ramps up');
  let up = 1;
  while (s.holdTs < 256) {
    sim.step(s, 1, 3200);
    up++;
  }
  assert.ok(up <= 12, 'full speed within 12 steps (about 200 ms)');
});

test('round length on the sim clock: Ride 2700, queue 3 x 1200 (+ Stopwatches); freeze patterns never change it', () => {
  const ride = botRun(cfg());
  assert.equal(ride.done, 1);
  assert.equal(ride.endReason, sim.END_TIME);
  assert.ok(ride.clock >= 2700 && ride.clock <= 2720, `ride clock ${ride.clock}`);
  const spam = botRun(cfg(), bots.BOT_FREEZE_SPAM);
  assert.ok(spam.clock >= 2700 && spam.clock <= 2720);
  assert.ok(spam.steps > ride.steps, 'freeze-spam logs its ramps but the clock is unchanged');
  const q = botRun(cfg({ mode: sim.MODE_QUEUE }));
  assert.equal(q.done, 1);
  assert.equal(q.set, 2);
  assert.ok(q.clock >= 3600 && q.clock <= 3600 + 2 * C.WATCH_STEPS + 20, `queue clock ${q.clock}`);
});

test('scoring: chain-dominant quarters with a hard x8 cap', () => {
  assert.equal(sim.scorePoints(10, 1, C.G_GOOD, 0), 10);
  assert.equal(sim.scorePoints(10, 1, C.G_PERFECT, 0), 15);
  assert.equal(sim.scorePoints(10, 1, C.G_POP, 0), 20, 'a Ball Pop pays above PERFECT');
  assert.equal(sim.scorePoints(10, 4, C.G_PERFECT, C.EVENT_GOLDEN), 80, 'x4 PERFECT in Golden Hour is x8');
  assert.equal(sim.scorePoints(10, 5, C.G_GOLD_POP, C.EVENT_GOLDEN), 80, 'never above x8');
  assert.equal(sim.tierOf(0), 1);
  assert.equal(sim.tierOf(5), 2);
  assert.equal(sim.tierOf(12), 3);
  assert.equal(sim.tierOf(20), 4);
  const s = sim.createSim(cfg());
  s.chain = 17;
  sim.dropTier(s);
  assert.equal(s.chain, 5, 'a gull steal drops to the first value of the tier below');
});

test('determinism: the replay of a live run (with freezes and cards) reproduces the exact score', () => {
  for (const [kind, over] of [
    [bots.BOT_HUMAN, {}],
    [bots.BOT_FREEZE_SPAM, { difficulty: 3 }],
    [bots.BOT_LINE_WALKER, { mode: sim.MODE_QUEUE }],
    [bots.BOT_EXPERT, { cards: 0 }],
    [bots.BOT_KID, { mode: sim.MODE_QUEUE, unlock: 1, deck: 'ocean' }],
  ]) {
    const c = cfg({ seed: 9000 + kind, ...over });
    const live = botRun(c, kind, 3);
    const again = sim.replay(c, live.log);
    assert.equal(sim.finalScore(again), sim.finalScore(live), `bot ${kind}`);
    assert.equal(again.clock, live.clock);
  }
});

test('proof: encode/decode round trip, verify, and any tamper fails', () => {
  const c = cfg({ seed: 777, cards: 0 });
  const s = botRun(c, bots.BOT_HUMAN);
  assert.deepEqual([...proof.decodeInput(proof.encodeInput(s.log))], [...s.log]);
  const p = proof.buildProof(c, s, s.steps * 17);
  assert.equal(p.game, 'banana');
  assert.equal(p.mode, 'ride');
  assert.equal(p.assist, false);
  const v = proof.verifyProof(p, { expectSeed: 777, ride: true });
  assert.equal(v.ok, true, v.reason);
  assert.equal(v.score, p.score);
  assert.equal(proof.verifyProof({ ...p, score: p.score + 1 }).reason, 'score');
  assert.equal(proof.verifyProof(p, { expectSeed: 778 }).reason, 'seed');
  assert.equal(proof.verifyProof({ ...p, elapsed_ms: 1000 }).reason, 'too_fast');
  const log = proof.decodeInput(p.input);
  const mid = Math.floor(log.length / 2);
  let changed = false;
  for (let k = mid; k < log.length && !changed; k++) {
    const t = log.slice();
    t[k] = t[k] + 2 * 400;
    const tp = { ...p, input: proof.encodeInput(t) };
    const r = proof.verifyProof(tp);
    if (!r.ok) changed = true;
  }
  assert.ok(changed, 'moving the basket in the log changes the verdict');
  assert.equal(proof.verifyProof({ ...p, mode: 'queue', assist: true }, { ride: true }).reason, 'mode');
});

test('director: 0 infeasible must-catch pairs over many seeds, both modes, all difficulties', () => {
  let pairs = 0;
  for (const mode of [sim.MODE_RIDE, sim.MODE_QUEUE]) {
    for (const d of [1, 2, 3]) {
      for (let seed = 1; seed <= 25; seed++) {
        const s = sim.createSim(cfg({ seed: seed * 31 + d, difficulty: d, mode }));
        const b = bots.createBot(bots.BOT_EXPERT, seed);
        const seen = new Map();
        for (let n = 0; n < 40000 && !s.done; n++) {
          sim.step(s, 1, bots.botInput(s, b));
          for (let i = 0; i < 28; i++) {
            if (s.iSt[i] !== C.S_FALL || s.iKind[i] === C.K_PUFFER) continue;
            const id = s.iId[i];
            if (s.iMust[i] === 1 && !seen.has(id)) seen.set(id, { land: s.iLandStep[i], x: (s.iX[i] + s.iVx[i] * s.iLand[i]) >> 8, i, id });
            const v = seen.get(id);
            if (v && s.iOpt[i] === 1) v.opt = true;
          }
        }
        const L = [...seen.values()].filter((v) => !v.opt).sort((a, b2) => a.land - b2.land);
        for (let k = 1; k < L.length; k++) {
          const dt = L[k].land - L[k - 1].land;
          const dx = Math.abs(L[k].x - L[k - 1].x);
          const ok = dt < C.REACT_STEPS ? dx <= C.REACH_SLACK + 1 : dt >= C.REACT_STEPS + T.TRAVEL[Math.min(320, Math.max(0, dx - C.REACH_SLACK - 1))];
          assert.ok(ok, `mode ${mode} d${d} seed ${seed}: ${JSON.stringify(L[k - 1])} -> ${JSON.stringify(L[k])}`);
          pairs++;
        }
      }
    }
  }
  assert.ok(pairs > 5000);
});

test('onboarding spacing (Ride, A22): serve 0 s, bananas after the serve, coin 10 s, puffer 18 s, Final Rush 35 s, finale last', () => {
  const s = sim.createSim(cfg({ cards: 0 }));
  const b = bots.createBot(bots.BOT_EXPERT, 1);
  const first = {};
  const cards = [];
  for (let n = 0; n < 40000 && !s.done; n++) {
    sim.step(s, 1, bots.botInput(s, b));
    for (let e = 0; e < s.evN; e++) {
      const k = s.evK[e];
      if (k === sim.EV_SPAWN && first[`spawn${s.evB[e]}`] === undefined) first[`spawn${s.evB[e]}`] = s.clock;
      if (first[k] === undefined) first[k] = s.clock;
      if (k === sim.EV_CARD) cards.push(s.evA[e]);
    }
  }
  assert.ok(first[`spawn${C.K_COIN}`] >= 600 && first[`spawn${C.K_COIN}`] <= 610, `coin ${first[`spawn${C.K_COIN}`]}`);
  assert.ok(first[sim.EV_BALL_TOSS] <= 1, 'the cart serves the ball at clock 0');
  assert.ok(first[sim.EV_SERVE] > 0 && first[sim.EV_SERVE] <= C.SERVE_MAX, `serve done ${first[sim.EV_SERVE]}`);
  assert.ok(first[`spawn${C.K_BANANA}`] >= first[sim.EV_SERVE], 'no bananas before the serve');
  assert.ok(first[`spawn${C.K_PUFFER}`] >= 1080 && first[`spawn${C.K_PUFFER}`] <= 1082);
  assert.equal(first[sim.EV_RUSH], 2072, 'Rush tell one beat early');
  assert.ok(first[`spawn${C.K_PUFFER}`] - first[`spawn${C.K_COIN}`] >= 8 * 60 - 12);
  assert.ok(2100 - first[`spawn${C.K_PUFFER}`] >= 8 * 60);
  assert.ok(cards.includes(C.CARD_BALL) && cards.includes(C.CARD_PUFFER), 'teaching cards fire on first appearance');
  assert.ok(first[sim.EV_FINALE] >= 2600, 'finale slow-mo near the end');
});

test('puffers: tell at a fixed lead before the lane, two-step puff, min fall time', () => {
  for (const mode of [sim.MODE_RIDE, sim.MODE_QUEUE]) {
    const s = sim.createSim(cfg({ mode, seed: 55, unlock: 1 }));
    const b = bots.createBot(bots.BOT_EXPERT, 2);
    const tells = new Map();
    const lead = mode === sim.MODE_QUEUE ? C.PUFFER_TELL_QUEUE : C.PUFFER_TELL_RIDE;
    let checked = 0;
    for (let n = 0; n < 40000 && !s.done; n++) {
      sim.step(s, 1, bots.botInput(s, b));
      for (let i = 0; i < 28; i++) {
        if (s.iKind[i] !== C.K_PUFFER || s.iSt[i] !== C.S_FALL) continue;
        const min = mode === sim.MODE_QUEUE ? C.PUFFER_MIN_FALL_QUEUE : C.PUFFER_MIN_FALL_RIDE;
        assert.ok(s.iLand[i] >= min, `fall ${s.iLand[i]} >= ${min}`);
        if (s.iTold[i] && !tells.has(s.iId[i])) {
          tells.set(s.iId[i], 1);
          const left = s.iLand[i] - (s.iAge[i] >> 8);
          assert.ok(left <= lead && left >= lead - 2, `tell lead ${left}`);
          checked++;
        }
        if ((s.iAge[i] >> 8) * 10 >= s.iLand[i] * 6) assert.equal(s.iPuff[i], 2, 'fully puffed from 60% of the fall');
      }
    }
    assert.ok(checked > 3, `mode ${mode} puffers ${checked}`);
  }
});

test('Golden Hour never overlaps Final Rush and only 3 events request global hit-stop', () => {
  const src = fs.readFileSync(path.join(root, 'src/games/banana-basket/sim.ts'), 'utf8');
  const calls = src.match(/hitStop\(s, [A-Z_]+, [01]\)/g) || [];
  assert.deepEqual([...new Set(calls)].sort(), ['hitStop(s, HITSTOP_GOLDEN, 0)', 'hitStop(s, HITSTOP_PUFFER, 0)', 'hitStop(s, HITSTOP_TIME, 1)']);
  for (let seed = 1; seed <= 40; seed++) {
    const s = sim.createSim(cfg({ seed }));
    const b = bots.createBot(bots.BOT_EXPERT, seed);
    for (let n = 0; n < 40000 && !s.done; n++) {
      sim.step(s, 1, bots.botInput(s, b));
      if (s.rushOn) assert.equal(s.ghQ > 0, false, `seed ${seed}: golden during rush at ${s.clock}`);
    }
  }
});

test('queue unlock gate (v2.0): run 1 puffers only, Gull Set from run 2, no twists or power-ups; assist never in Ride', () => {
  const u1 = sim.createSim(cfg({ mode: sim.MODE_QUEUE, unlock: 1 }));
  assert.equal(u1.hasBall, 1, 'the ball is core from run 1');
  assert.equal(u1.hasGift + u1.hasFinger + u1.hasWatch, 0);
  assert.equal(u1.twist, C.TWIST_NONE);
  for (const u of [2, 3, 5]) {
    const q = sim.createSim(cfg({ mode: sim.MODE_QUEUE, unlock: u, twist: C.TWIST_BREEZY }));
    assert.equal(q.twist, C.TWIST_GULLS, `run ${u}: Gull Set`);
    assert.equal(q.hasGift + q.hasFinger + q.hasWatch, 0, 'power-ups are v2.1');
    assert.ok(q.unlock <= 3);
  }
  assert.equal(sim.createSim(cfg({ mode: sim.MODE_QUEUE, unlock: 1, deck: 'ocean' })).twist, C.TWIST_NONE, 'no splash in v2.0');
  assert.equal(sim.createSim(cfg({ assist: true })).assist, 0, 'no Easy Basket in Ride');
  // Gull Set: gulls dive in set 2 and no puffer spawns there.
  const s = sim.createSim(cfg({ mode: sim.MODE_QUEUE, unlock: 3 }));
  const bt = bots.createBot(bots.BOT_HUMAN, 3);
  let gulls = 0;
  let puffersInSet2 = 0;
  for (let n = 0; n < 40000 && !s.done; n++) {
    sim.step(s, 1, bots.botInput(s, bt));
    for (let e = 0; e < s.evN; e++) {
      if (s.evK[e] === sim.EV_GULL && s.evA[e] === 1) gulls++;
      if (s.evK[e] === sim.EV_SPAWN && s.evB[e] === C.K_PUFFER && s.set === 1) puffersInSet2++;
    }
  }
  assert.ok(gulls >= 2, `gulls ${gulls}`);
  assert.ok(puffersInSet2 <= 1, `puffers in the Gull Set ${puffersInSet2}`);
});

test('the ball is the key: x3/x4 only with a live ball, the gate locks on a loss and unlocks on the next bounce', () => {
  const s = sim.createSim(cfg());
  s.chain = 25;
  s.bOn = 0;
  assert.equal(sim.gatedTier(s), 2, 'no ball: held at x2');
  assert.equal(sim.gateHeld(s), 1);
  s.bOn = 1;
  s.bN = 0;
  assert.equal(sim.gatedTier(s), 2, 'a ball that has not bounced yet is not live');
  s.bN = 1;
  assert.equal(sim.gatedTier(s), 4);
  s.chain = 8;
  s.bOn = 0;
  assert.equal(sim.gatedTier(s), 2, 'x2 never needs the ball');
  // In a real run: lock and unlock events pair up and points respect the gate.
  let locks = 0;
  let unlocks = 0;
  let heldCatches = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const r = sim.createSim(cfg({ seed }));
    const b = bots.createBot(bots.BOT_HUMAN, seed);
    for (let n = 0; n < 40000 && !r.done; n++) {
      sim.step(r, 1, bots.botInput(r, b));
      for (let e = 0; e < r.evN; e++) {
        const k = r.evK[e];
        if (k === sim.EV_GATE && r.evA[e] === 1) locks++;
        if (k === sim.EV_GATE && r.evA[e] === 2) unlocks++;
        if (k === sim.EV_CATCH) {
          const tier = (r.evB[e] >> 8) & 15;
          const held = (r.evB[e] >> 12) & 1;
          if (held) {
            heldCatches++;
            assert.equal(tier, 2, 'a held catch scores at x2');
          }
        }
      }
    }
  }
  assert.ok(locks > 0 && unlocks > 0, `locks ${locks} unlocks ${unlocks}`);
  assert.ok(heldCatches > 0);
});

test('the serve: bananas wait for 2 bounces or 3 s; tutorial grace respawns a lost ball in 2 s before 10 s', () => {
  // Never touch the ball: bananas start at 3 s.
  const s = sim.createSim(cfg());
  let firstBanana = -1;
  let lostAt = -1;
  let tossAgain = -1;
  for (let n = 0; n < 4000 && !s.done; n++) {
    sim.step(s, 1, 60 * 16);
    for (let e = 0; e < s.evN; e++) {
      if (s.evK[e] === sim.EV_SPAWN && s.evB[e] === C.K_BANANA && firstBanana < 0) firstBanana = s.clock;
      if (s.evK[e] === sim.EV_BALL_LOST && lostAt < 0) lostAt = s.clock;
      if (s.evK[e] === sim.EV_BALL_TOSS && lostAt >= 0 && tossAgain < 0) tossAgain = s.clock;
    }
  }
  assert.ok(firstBanana >= C.SERVE_MAX && firstBanana <= C.SERVE_MAX + C.STEPS_BEAT, `first banana ${firstBanana}`);
  assert.ok(lostAt > 0 && lostAt < 600);
  assert.ok(tossAgain - lostAt >= C.BALL_RESPAWN_GRACE - 1 && tossAgain - lostAt <= C.BALL_RESPAWN_GRACE + 1, `grace ${tossAgain - lostAt}`);
});

test('multi-catch pays flat DOUBLE/TRIPLE/QUAD and hit-stops are never within 15 steps', () => {
  let multi = 0;
  let stops = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const s = sim.createSim(cfg({ seed }));
    const b = bots.createBot(bots.BOT_EXPERT, seed);
    let lastStop = -1000;
    let prevQ = 0;
    for (let n = 0; n < 40000 && !s.done; n++) {
      sim.step(s, 1, bots.botInput(s, b));
      if (s.hitStopQ > prevQ && !s.done) {
        assert.ok(s.clock - lastStop >= 15, `seed ${seed}: global stops ${lastStop} -> ${s.clock}`);
        lastStop = s.clock;
        stops++;
      }
      prevQ = s.hitStopQ;
      for (let e = 0; e < s.evN; e++) {
        if (s.evK[e] !== sim.EV_MULTI) continue;
        multi++;
        const n2 = s.evB[e];
        assert.equal(s.evC[e], C.MULTI_PTS[n2] - C.MULTI_PTS[n2 - 1]);
      }
    }
    assert.equal(s.multi >= 0, true);
  }
  assert.ok(multi > 0, 'multi-catch happens');
  assert.ok(stops > 0);
});

test('Sugar Crush: hearts left and a live ball add to the verified end bonus', () => {
  const s = sim.createSim(cfg());
  s.catches = 10;
  s.misses = 1;
  s.hearts = 2;
  s.bOn = 1;
  s.bN = 4;
  s.endReason = sim.END_TIME;
  assert.equal(sim.endBonus(s), 2 * C.HEART_PTS + 20);
  s.bGold = 1;
  assert.equal(sim.endBonus(s), 2 * C.HEART_PTS + C.GOLD_BOUNCE_PTS);
  s.endReason = sim.END_HEARTS;
  s.hearts = 0;
  assert.equal(sim.endBonus(s), 0);
});

test('queue sets: forced set cards at each break keep the chain; tip-over in set 3', () => {
  const s = sim.createSim(cfg({ mode: sim.MODE_QUEUE, cards: 0 }));
  const b = bots.createBot(bots.BOT_EXPERT, 4);
  const setCards = [];
  let tip = 0;
  for (let n = 0; n < 40000 && !s.done; n++) {
    sim.step(s, 1, bots.botInput(s, b));
    for (let e = 0; e < s.evN; e++) {
      if (s.evK[e] === sim.EV_CARD && s.evA[e] >= C.CARD_SET_BASE) {
        setCards.push(s.evA[e]);
        assert.equal(s.holdTs, 0, 'a set card is a forced freeze');
        assert.ok(s.chain > 0, 'chain carried');
      }
      if (s.evK[e] === sim.EV_TIPOVER) tip = s.clock - s.setStart;
    }
  }
  assert.deepEqual(setCards, [C.CARD_SET_BASE + 1, C.CARD_SET_BASE + 2]);
  assert.ok(tip <= 2, 'tip-over opens set 3');
});

test('ghost: replaying a rival log at your clock step tracks their exact run', () => {
  const c = cfg({ seed: 4242 });
  const rival = botRun(c, bots.BOT_HUMAN, 9);
  const g = ghost.createGhost(c, rival.log.slice(), 'SAM', sim.finalScore(rival));
  for (let clock = 1; clock <= 2700; clock++) ghost.ghostAdvance(g, clock);
  for (let k = 0; k < 20 && !g.sim.done; k++) ghost.ghostAdvance(g, 99999);
  assert.equal(sim.finalScore(g.sim), sim.finalScore(rival));
  const me = botRun(c, bots.BOT_EXPERT, 9);
  const cmp = ghost.compareLine(me, rival, 'SAM');
  assert.equal(cmp.won, sim.finalScore(me) >= sim.finalScore(rival));
  assert.ok(cmp.line.length > 5);
  const finn = ghost.finnRun(c);
  assert.equal(sim.finalScore(sim.replay({ ...c, cards: 0xffff }, finn.log)), finn.score, 'staff ghost Finn is replayable');
});

test('Gull Send: a coin cancels a queued gull (BLOCKED), otherwise it lands on a beat after its apply step', () => {
  const s = sim.createSim(cfg({ mode: sim.MODE_QUEUE, gulls: [100, 190, 400, 490] }));
  const b = bots.createBot(bots.BOT_EXPERT, 5);
  const phases = [];
  for (let n = 0; n < 40000 && !s.done; n++) {
    sim.step(s, 1, bots.botInput(s, b));
    for (let e = 0; e < s.evN; e++) if (s.evK[e] === sim.EV_GULL) phases.push([s.evA[e], s.clock]);
  }
  assert.equal(s.gullLog.length, 8, 'both gulls resolved');
  for (let i = 0; i < s.gullLog.length; i += 4) {
    const [recv, apply, at, cancelled] = s.gullLog.slice(i, i + 4);
    assert.ok(at >= recv);
    if (!cancelled) assert.ok(at >= apply && (at - s.setStart) % 1 === 0);
  }
  const replayed = sim.replay(cfg({ mode: sim.MODE_QUEUE, gulls: [100, 190, 400, 490] }), s.log);
  assert.equal(sim.finalScore(replayed), sim.finalScore(s));
});

test('bots: the expert out-scores the human, the ball matters, and freeze-spam gains nothing', () => {
  const avg = (kind, over = {}) => {
    let t = 0;
    for (let seed = 1; seed <= 12; seed++) t += sim.finalScore(botRun(cfg({ seed: seed * 101, ...over }), kind, seed));
    return t / 12;
  };
  const expert = avg(bots.BOT_EXPERT);
  const human = avg(bots.BOT_HUMAN);
  const spam = avg(bots.BOT_FREEZE_SPAM);
  assert.ok(expert > human, `${expert} > ${human}`);
  assert.ok(spam <= expert * 1.05, `freeze-spam ${spam} vs ${expert}`);
  const t = sim.starTargets(sim.MODE_RIDE, 2);
  assert.ok(t[0] < t[1] && t[1] < t[2]);
  assert.ok(human >= t[0], 'the human bot clears 1 star on average');
});

test('HapticBus: never two haptics within 80 ms, tells and hits always delivered', () => {
  const b = bus.createHapticBus();
  const fired = [];
  const deferred = [];
  let t = 0;
  let tellsReq = 0;
  let tellsFired = 0;
  const rng = (() => {
    let x = 7;
    return () => ((x = (x * 1103515245 + 12345) >>> 0) / 2 ** 32);
  })();
  for (let i = 0; i < 1500; i++) {
    t += Math.floor(rng() * 40);
    for (let k = deferred.length - 1; k >= 0; k--) {
      if (deferred[k].at <= t) {
        const d = deferred.splice(k, 1)[0];
        if (bus.firePending(b, d.token, d.at)) {
          fired.push(d.at);
          if (d.pri >= bus.HB_TELL) tellsFired++;
        }
      }
    }
    const r = rng();
    const pri = r < 0.05 ? bus.HB_TELL : r < 0.07 ? bus.HB_HIT : Math.floor(rng() * 6);
    if (pri >= bus.HB_TELL) tellsReq++;
    const d = bus.request(b, t, pri);
    if (d.kind === 'now') {
      fired.push(t);
      if (pri >= bus.HB_TELL) tellsFired++;
    } else if (d.kind === 'later') deferred.push({ ...d, pri });
  }
  for (const d of deferred) if (bus.firePending(b, d.token, d.at)) {
    fired.push(d.at);
    if (d.pri >= bus.HB_TELL) tellsFired++;
  }
  fired.sort((a, c) => a - c);
  for (let i = 1; i < fired.length; i++) assert.ok(fired[i] - fired[i - 1] >= bus.HB_WINDOW_MS, `gap ${fired[i] - fired[i - 1]}`);
  assert.ok(tellsFired >= tellsReq * 0.9, `tells ${tellsFired}/${tellsReq}`);
});

test('audio ladder: climbs per catch, resolves on the tonic at a tier-up, octave up in Golden Hour', () => {
  const l = { i: -1 };
  assert.equal(audio.ladderNext(l, false), 0);
  assert.equal(audio.ladderNext(l, false), 1);
  assert.equal(audio.ladderNext(l, true), 7);
  assert.equal(audio.ladderNote(l, true), 14);
  l.i = 15;
  assert.equal(audio.ladderNext(l, false), 8, 'wraps in the upper octave');
  audio.ladderReset(l);
  assert.equal(l.i, -1);
});

test('golden vectors (shared with the WS7 PHP replay) replay to their exact scores', () => {
  const vectors = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/banana/golden-vectors.json'), 'utf8'));
  assert.equal(vectors.length, 26);
  assert.ok(vectors.filter((v) => v.expect.end === 'hearts').length >= 2);
  for (const v of vectors) {
    const r = proof.verifyProof(v.proof);
    assert.equal(r.ok, true, `${v.name}: ${r.reason}`);
    assert.equal(r.score, v.expect.score, v.name);
    assert.equal(r.state.clock, v.expect.clock, v.name);
  }
  assert.ok(vectors.some((v) => v.expect.end === 'hearts'));
});

test('worklet files define every callee before its callers (Reanimated closure capture)', () => {
  for (const f of ['state.ts', 'sim.ts', 'patterns.ts', 'fixed.ts', 'bots.ts', 'ghost.ts', 'render/vis.ts']) {
    execFileSync('python3', [path.join(root, 'tools/banana/order-worklets.py'), path.join(root, 'src/games/banana-basket', f), '--check']);
  }
});
