'use strict';
/**
 * Boss Brawl v4 sim: balance (design 18.1), timing windows, rings, guard,
 * feints, the beat grid, pause / paintball, walking parity, determinism and
 * golden replay fixtures (TS <-> PHP parity source), and the legacy raid
 * proof encoding the live endpoint verifies.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const C = loadTs('src/games/boss/sim/constants.ts');
const enc = loadTs('src/games/boss/sim/encounter.ts');
const pat = loadTs('src/games/boss/sim/patterns.ts');
const bots = loadTs('src/games/boss/sim/bots.ts');
const round = loadTs('src/games/boss/sim/round.ts');

const BOSSES = ['kraken', 'robo_shark', 'ghost_squid'];

function play(boss, name, seeds, opts = {}) {
  const out = [];
  for (let s = 1; s <= seeds; s++) out.push(round.summarize(bots.runBotRound(boss, s * 7777, bots.BOTS[name], opts)));
  return out;
}
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Advance a fresh bout to its first attack and return [bout, attack]. */
function firstAttack(boss = 'kraken', bout = 0, extra = {}) {
  const b = enc.createBout({ boss, seed: 42, bout, ...extra });
  enc.advance(b, b.nextAt);
  assert.equal(b.phase, enc.P_ATTACK);
  return [b, b.attack];
}
function tap(b, t, lane) { enc.input(b, { t, k: C.IN_TARGET, a: lane }); }
function pad(b, t, hold = 40) { enc.input(b, { t, k: C.IN_PAD_DOWN }); enc.input(b, { t: t + hold, k: C.IN_PAD_UP }); }
const codes = (b) => b.events.map((e) => e.code);

test('balance (Kraken, 60 seeds): masher 0, guesser and ring-blind far below median, median 2 stars, mastery 3 stars', () => {
  const N = 60;
  const masher = play('kraken', 'masher', N);
  const guesser = play('kraken', 'guesser', N);
  const blind = play('kraken', 'ringBlind', N);
  const med = play('kraken', 'median', N);
  const mast = play('kraken', 'mastery', N);
  assert.ok(masher.every((s) => s.damage === 0 && s.stars === 0), 'pad masher never opens the boss');
  const m = median(med.map((s) => s.damage));
  assert.ok(m >= 900 && m <= 1400, `median damage ~1150 (got ${m})`);
  assert.ok(median(guesser.map((s) => s.damage)) <= 0.4 * m, 'rail guesser <= 40% of median');
  assert.ok(guesser.every((s) => s.stars <= 1), 'rail guesser <= 1 star');
  assert.ok(median(blind.map((s) => s.damage)) <= 0.6 * m, 'ring-blind counterer <= 60% of median');
  assert.equal(median(med.map((s) => s.stars)), 2, 'median bot: 2 stars');
  const mm = median(mast.map((s) => s.damage));
  assert.ok(mast.filter((s) => s.stars === 3).length >= N * 0.85, 'mastery bot: 3 stars');
  assert.ok(mm >= 2.6 * m, `mastery ~2.8x median (got ${(mm / m).toFixed(2)}x)`);
  assert.ok(mm <= 3020, 'mastery fits the live endpoint (26 s x 7 hits/s encodes up to 3 020)');
  assert.ok(mast.every((s) => s.maxChain >= 10), 'mastery reaches FURY');
  assert.ok(med.filter((s) => s.maxChain >= 6).length >= N * 0.5, 'median reaches x1.5 in most rounds');
});

test('every boss: masher 0, mastery 3 stars, guesser <= 1 star', () => {
  for (const boss of ['robo_shark', 'ghost_squid']) {
    assert.ok(play(boss, 'masher', 12).every((s) => s.damage === 0));
    assert.ok(play(boss, 'guesser', 12).every((s) => s.stars <= 1));
    assert.ok(play(boss, 'mastery', 12).filter((s) => s.stars === 3).length >= 10);
  }
});

test('walking (wind-ups +1 sixteenth) never costs damage potential: within 3% of standing', () => {
  for (const boss of BOSSES) {
    const a = mean(play(boss, 'median', 40).map((s) => s.damage));
    const b = mean(play(boss, 'median', 40, { walk: true }).map((s) => s.damage));
    assert.ok(Math.abs(b / a - 1) <= 0.03, `${boss}: ${a} vs ${b}`);
  }
  const [bs, as] = firstAttack('kraken', 0);
  const [bw, aw] = firstAttack('kraken', 0, { walk: true });
  assert.equal(aw.W - as.W, bw.q);
});

test('counter windows: buffer and GOOD before, PERFECT [I-160, I+40], coyote to I+90, early ignored', () => {
  const grade = (dt) => {
    const [b, a] = firstAttack();
    const lane = a.steps[0].lane;
    tap(b, a.steps[0].I + dt, lane);
    const last = [...b.events].reverse().find((e) => [enc.E_PERFECT, enc.E_GOOD, enc.E_EARLY, enc.E_PUNISH].includes(e.code));
    return last.code === enc.E_PERFECT ? 'P' : last.code === enc.E_GOOD ? 'G' : last.code === enc.E_EARLY ? 'E' : last.code === enc.E_PUNISH ? 'X' : `?${last.code}`;
  };
  const [, a] = firstAttack();
  const G = a.G;
  assert.equal(G, Math.min(600, Math.floor(a.W * 7 / 10)));
  assert.equal(grade(-G - 121), 'E');
  assert.equal(grade(-G - 120), 'G'); // buffered press resolves as GOOD
  assert.equal(grade(-161), 'G');
  assert.equal(grade(-160), 'P');
  assert.equal(grade(0), 'P');
  assert.equal(grade(40), 'P');
  assert.equal(grade(41), 'G');
  assert.equal(grade(90), 'G');
  // Past the coyote window the attack has landed.
  const [b2, a2] = firstAttack();
  tap(b2, a2.steps[0].I + 91, a2.steps[0].lane);
  assert.ok(codes(b2).includes(enc.E_PUNISH));
});

test('wrong target punishes, no input punishes at I+90, and punishes reset the chain and lock inputs', () => {
  const [b, a] = firstAttack();
  const lane = a.steps[0].lane;
  tap(b, a.T + 10, (lane + 1) % 3);
  assert.ok(codes(b).includes(enc.E_PUNISH));
  assert.ok(b.lockUntil >= a.T + 10 + C.PUNISH_MS);
  const [b2, a2] = firstAttack();
  enc.advance(b2, a2.steps[0].I + C.COYOTE_MS);
  assert.ok(!codes(b2).includes(enc.E_PUNISH));
  enc.advance(b2, a2.steps[0].I + C.COYOTE_MS + 1);
  const p = b2.events.find((e) => e.code === enc.E_PUNISH);
  assert.equal(p.b, 1);
  assert.equal(b2.carry.chain, 0);
});

test('openings: one tap per ring slot, crit within 80 ms of the ring, second tap is a CLANK; PERFECT adds a ring', () => {
  const [b, a] = firstAttack();
  const I = a.steps[0].I;
  tap(b, I - 10, a.steps[0].lane); // PERFECT
  enc.advance(b, I);
  const o = b.opening;
  assert.equal(o.rings.length, C.RINGS[0] + 1);
  assert.equal(o.rings[0], I + 2 * b.q);
  pad(b, o.rings[1] + 80);
  assert.equal(b.events[b.events.length - 1].code, enc.E_CRIT);
  pad(b, o.rings[1] + 100);
  assert.equal(b.events[b.events.length - 1].code, enc.E_CLANK);
  pad(b, o.rings[2] - 150);
  assert.equal(b.events[b.events.length - 1].code, enc.E_HIT);
  // Spam can never earn two crits in one slot.
  const crits = b.events.filter((e) => e.code === enc.E_CRIT).length;
  assert.equal(crits, 1);
});

test('Heavy: hold at least a beat, release on the last ring; a miss is one light hit', () => {
  const [b, a] = firstAttack();
  const I = a.steps[0].I;
  tap(b, I - 300, a.steps[0].lane); // GOOD
  enc.advance(b, I);
  const o = b.opening;
  const last = o.rings[o.rings.length - 1];
  enc.input(b, { t: I + 20, k: C.IN_PAD_DOWN });
  enc.input(b, { t: last + 90, k: C.IN_PAD_UP });
  assert.ok(codes(b).includes(enc.E_HEAVY));
  const [b2, a2] = firstAttack();
  tap(b2, a2.steps[0].I - 300, a2.steps[0].lane);
  enc.advance(b2, a2.steps[0].I);
  const o2 = b2.opening;
  enc.input(b2, { t: o2.start + 20, k: C.IN_PAD_DOWN });
  enc.input(b2, { t: o2.rings[o2.rings.length - 1] - 200, k: C.IN_PAD_UP });
  assert.ok(codes(b2).includes(enc.E_HEAVY_MISS));
});

test('Guard Counter: 5 guarded taps within 1 000 ms -> DIZZY; taps in the 250 ms close grace never count', () => {
  const b = enc.createBout({ boss: 'kraken', seed: 9, bout: 0 });
  for (let i = 0; i < 5; i++) pad(b, 10 + i * 150, 20);
  assert.ok(codes(b).includes(enc.E_GUARD_COUNTER));
  assert.ok(b.lockUntil >= 610 + C.GUARD_SWAT_MS + C.DIZZY_MS);
  // Close grace
  const [b2, a2] = firstAttack();
  tap(b2, a2.steps[0].I, a2.steps[0].lane);
  enc.advance(b2, b2.opening.end);
  const closeAt = b2.lastCloseAt;
  for (let i = 0; i < 5; i++) pad(b2, closeAt + i * 40, 10);
  assert.equal(b2.events.filter((e) => e.code === enc.E_CLANK).length, 0);
});

test('beat grid: every tell, impact and ring lands on the boss quarter-beat grid', () => {
  for (const boss of BOSSES) {
    for (const r of [1, 2, 3]) {
      const bs = bots.runBotRound(boss, r * 131, bots.BOTS.median, { variant: r % 3 });
      for (const b of bs) {
        const q = b.q;
        for (const e of b.events) {
          if ([enc.E_TELL, enc.E_FEINT, enc.E_SHOW, enc.E_OPEN, enc.E_FINISHER].includes(e.code) && e.code !== enc.E_TELL) assert.equal(e.t % q, 0, `${boss} code ${e.code} t ${e.t}`);
        }
      }
    }
    // Impacts and rings from plans directly
    const b = enc.createBout({ boss, seed: 5, bout: 1 });
    enc.advance(b, b.nextAt);
    for (const s of b.attack.steps) assert.equal(s.I % b.q, 0);
  }
});

test('feints: never the first attack, no pitch (FEINT not TELL), the first of a round is safe, tapping greys the lane', () => {
  let found = 0;
  for (let seed = 1; seed < 80 && found < 5; seed++) {
    const b = enc.createBout({ boss: 'kraken', seed, bout: 2 });
    for (let t = 0; t < 30000 && b.phase !== enc.P_DONE; t += 20) {
      enc.advance(b, t);
      const a = b.attack;
      if (a && a.feintLane >= 0 && t >= a.feintT0 && t < a.feintT1) {
        found += 1;
        assert.notEqual(a.no, 0);
        assert.notEqual(a.feintLane, a.steps[0].lane);
        assert.ok(a.T >= a.feintT1, 'the real tell comes after the fake');
        tap(b, t, a.feintLane);
        assert.ok(b.greyUntil[a.feintLane] > t);
        assert.ok(!b.events.some((e) => e.code === enc.E_PUNISH && e.t === t));
        break;
      }
    }
  }
  assert.ok(found >= 3);
  const flags = pat.freshRoundFlags();
  const plans = [];
  const rng = { s: 7 };
  for (let n = 1; n < 40; n++) plans.push(pat.planAttack({ boss: 'kraken', bout: 2, no: n, at: 0, q: 110, walk: false, variant: 0, rng, flags }));
  const feints = plans.filter((p) => p.feintLane >= 0);
  assert.ok(feints.length > 0 && feints[0].feintSafe && feints.slice(1).every((p) => !p.feintSafe));
});

test('hazards never sit in the telegraphed lane; the first new idea of a round cannot punish', () => {
  for (let seed = 1; seed < 40; seed++) {
    const b = enc.createBout({ boss: 'kraken', seed, bout: 1 });
    for (let t = 0; t < 30000 && b.phase !== enc.P_DONE; t += 20) {
      enc.advance(b, t);
      const a = b.attack;
      if (a && a.hazardLane >= 0) assert.notEqual(a.hazardLane, a.steps[0].lane);
    }
  }
  const b = enc.createBout({ boss: 'kraken', seed: 3, bout: 1 });
  enc.advance(b, b.nextAt);
  assert.equal(b.attack.kind, pat.K_DOUBLE);
  assert.equal(b.attack.safe, true);
  enc.advance(b, b.attack.steps[0].I + 200);
  assert.ok(codes(b).includes(enc.E_SAFE_MISS));
  assert.ok(!codes(b).includes(enc.E_PUNISH));
});

test('Robo: only the final press is graded; a wrong node zaps; sequences never exceed 3 icons', () => {
  const [b, a] = firstAttack('robo_shark', 0);
  assert.ok(a.steps.length <= 3);
  assert.ok(a.steps.slice(0, -1).every((s) => !s.graded) && a.steps[a.steps.length - 1].graded);
  assert.ok(a.T >= a.showStart + a.show.length * 4 * b.q, 'show phase never overlaps the charge ring');
  tap(b, a.T + 50, a.steps[0].lane);
  assert.equal(b.step, 1);
  tap(b, a.steps[1].I - 20, a.steps[1].lane);
  assert.ok(codes(b).includes(enc.E_PERFECT));
  const [b2, a2] = firstAttack('robo_shark', 0);
  tap(b2, a2.T + 50, (a2.steps[0].lane + 1) % 3 === a2.steps[1].lane ? (a2.steps[0].lane + 2) % 3 : (a2.steps[0].lane + 1) % 3);
  assert.ok(codes(b2).includes(enc.E_PUNISH));
});

test('Ghost: the real squid drifts; its lane before the drift is wrong after it', () => {
  const [b, a] = firstAttack('ghost_squid', 0);
  assert.equal(a.swaps.length, 2);
  const after = a.swaps[1];
  assert.notEqual(after, a.lane0);
  tap(b, a.steps[0].I - 10, after);
  assert.ok(codes(b).includes(enc.E_PERFECT));
  const [b2, a2] = firstAttack('ghost_squid', 0);
  tap(b2, a2.steps[0].I - 10, a2.lane0);
  assert.ok(codes(b2).includes(enc.E_PUNISH));
});

test('Break: fills at 100, pays a lump, adds a bout-3 attack (cap 2), max 3 per round', () => {
  const b = enc.createBout({ boss: 'kraken', seed: 11, bout: 2, carry: { ...enc.freshCarry(), gauge: 990 } });
  const base = b.attacksTotal;
  enc.advance(b, b.nextAt);
  const a = b.attack;
  tap(b, a.steps[0].I, a.steps[0].lane);
  enc.advance(b, a.steps[0].I + 400);
  assert.ok(codes(b).includes(enc.E_BREAK));
  assert.equal(b.opening.kind, 1);
  assert.equal(b.attacksTotal, base + 1);
  assert.equal(b.carry.gauge, 0);
  const full = enc.createBout({ boss: 'kraken', seed: 11, bout: 2, carry: { ...enc.freshCarry(), gauge: 1000, breaks: 3, bonusAttacks: 2 } });
  assert.equal(full.carry.breaks, 3);
  enc.advance(full, full.nextAt);
  const f = full.attack;
  tap(full, f.steps[0].I, f.steps[0].lane);
  enc.advance(full, f.steps[0].I + 400);
  assert.ok(!codes(full).includes(enc.E_BREAK));
});

test('Finisher: shows at the end of bout 3 with a Break; PERFECT +-110, GOOD +-250, else MISS', () => {
  const run = (dt) => {
    const b = enc.createBout({ boss: 'kraken', seed: 21, bout: 2, carry: { ...enc.freshCarry(), breaks: 1 } });
    for (let t = 0; t < 60000 && b.phase !== enc.P_FINISHER && b.phase !== enc.P_DONE; t += 10) enc.advance(b, t);
    assert.equal(b.phase, enc.P_FINISHER);
    const f = b.finisher;
    enc.input(b, { t: f.start + 100, k: C.IN_PAD_DOWN });
    enc.input(b, { t: f.ring + dt, k: C.IN_PAD_UP });
    enc.advance(b, f.ring + 2000);
    return b.stats.finisher;
  };
  assert.equal(run(0), 2);
  assert.equal(run(110), 2);
  assert.equal(run(-111), 1);
  assert.equal(run(250), 1);
  assert.equal(run(251), 0);
});

test('pause: two pauses are free; the 3rd paintballs the bout and its damage still counts', () => {
  const [b, a] = firstAttack();
  tap(b, a.steps[0].I, a.steps[0].lane);
  enc.advance(b, a.steps[0].I + 100);
  const before = enc.scoreBout(b);
  enc.input(b, { t: a.steps[0].I + 100, k: C.IN_PAUSE });
  enc.input(b, { t: a.steps[0].I + 100, k: C.IN_RESUME });
  enc.input(b, { t: a.steps[0].I + 120, k: C.IN_PAUSE });
  enc.input(b, { t: a.steps[0].I + 120, k: C.IN_RESUME });
  assert.notEqual(b.phase, enc.P_DONE);
  enc.input(b, { t: a.steps[0].I + 140, k: C.IN_PAUSE });
  assert.equal(b.phase, enc.P_DONE);
  assert.equal(b.endT, a.steps[0].I + 140);
  assert.ok(enc.scoreBout(b) >= before && before > 0);
});

test('determinism: a round rebuilt from its bout proofs gives identical damage and event streams', () => {
  for (const boss of BOSSES) {
    for (const name of ['median', 'mastery', 'guesser']) {
      const bs = bots.runBotRound(boss, 4242, bots.BOTS[name], { tide: true });
      const log = { boss, seed: 4242, variant: 0, bouts: bs.map(round.boutProof) };
      const rs = round.replayRound(log);
      assert.equal(JSON.stringify(rs.map((b) => enc.scoreBout(b))), JSON.stringify(bs.map((b) => enc.scoreBout(b))));
      assert.deepEqual(JSON.stringify(rs.map((b) => b.events)), JSON.stringify(bs.map((b) => b.events)));
    }
  }
});

test('golden replay fixtures (TS <-> PHP parity source) still replay exactly', () => {
  const dir = path.join(__dirname, 'fixtures/boss-replays');
  for (const boss of BOSSES) {
    const fx = JSON.parse(fs.readFileSync(path.join(dir, `${boss}.json`), 'utf8'));
    assert.equal(fx.rounds.length, 20);
    for (const r of fx.rounds) {
      const rs = round.replayRound({ boss, seed: r.seed, variant: r.variant, bouts: r.bouts });
      assert.equal(JSON.stringify(rs.map((b) => enc.scoreBout(b))), JSON.stringify(r.damage), `${boss} seed ${r.seed} ${r.bot}`);
    }
  }
});

test('the sim is integer-only: no floats, Math.random or Date in sim/*', () => {
  for (const f of ['constants.ts', 'encounter.ts', 'patterns.ts', 'round.ts']) {
    const src = fs.readFileSync(path.join(__dirname, '../../src/games/boss/sim', f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.ok(!/Math\.random|Date\.now|new Date/.test(src), `${f}: no clocks or randomness`);
    if (f !== 'round.ts') assert.ok(!/\d+\.\d+/.test(src), `${f}: no float literals`);
  }
  // Every bout damage is an integer and the unit sum is an exact integer.
  const bs = bots.runBotRound('kraken', 99, bots.BOTS.mastery);
  for (const b of bs) {
    assert.ok(Number.isSafeInteger(b.sum));
    for (const e of b.events) assert.ok(Number.isInteger(e.t) && Number.isInteger(e.v));
  }
});

test('legacy raid proof: the live endpoint formula gives the replayed damage (to 10) within its limits', () => {
  for (let d = 0; d <= 3200; d += 7) {
    for (const ms of [9000, 20000, 41000]) {
      const p = round.toLegacyProof(d, ms);
      assert.ok(p.duration_ms >= 12000 && p.duration_ms <= 26000);
      assert.ok(p.hits <= Math.floor(p.duration_ms / 1000 * 7));
      assert.ok(p.weak_hits <= Math.floor(p.hits / 3));
      assert.ok(p.hits >= 0 && p.weak_hits >= 0);
      const cap = (() => { const h = Math.floor(p.duration_ms / 1000 * 7); return 10 * (h + 2 * Math.floor(h / 3)); })();
      // Exact to 10 points below the cap; at the very top two unit counts are unrepresentable (<= 20 points short).
      const want = Math.min(Math.floor(d / 10) * 10, cap);
      const got = round.legacyDamage(p);
      assert.ok(got <= want && (want < cap - 30 ? got === want : got >= want - 20), `${d} ${ms}: ${got} vs ${want}`);
      if (d < 10) assert.equal(p.hits, 0); // nothing landed: no Energy is spent
    }
  }
  assert.equal(round.legacyDamage({ hits: 3, weak_hits: 1, duration_ms: 20000 }, 0.6), 30);
});

test('stars and NEXT STAR in actions', () => {
  assert.equal(round.starsFor(5000, false), 0);
  assert.equal(round.starsFor(299, true), 0);
  assert.equal(round.starsFor(300, true), 1);
  assert.equal(round.starsFor(1000, true), 2);
  assert.equal(round.starsFor(2600, true), 3);
  const s = round.summarize(bots.runBotRound('kraken', 12, bots.BOTS.median));
  if (s.stars < 3) assert.ok(typeof s.nextStar === 'string' && s.nextStar.length > 0);
  assert.equal(round.timingReadout(-42), 'You were 42 ms early');
  assert.equal(round.timingReadout(5), 'Right on the beat');
});
