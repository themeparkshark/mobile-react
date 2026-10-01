'use strict';
/**
 * Boss Brawl v7 sim (design studio/design/boss.md v7): balance targets (9.1,
 * 20.1), counter windows and the reflex grace, Grit / Knockdown / TKO, Pin and
 * Pop slots, Easy Slam, Guard gating, fakes, the bubble, Break, the Final Pop
 * with Anchor Stars, Captain's Call, boons, the step grid, pause / paintball,
 * walking parity, determinism, golden replay fixtures, and the legacy raid proof.
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
const N = 200;

const cache = new Map();
function play(boss, name, seeds, opts = {}) {
  const key = `${boss}:${name}:${seeds}:${JSON.stringify(opts)}`;
  if (cache.has(key)) return cache.get(key);
  const out = [];
  const bot = typeof name === 'string' ? bots.BOTS[name] : name;
  for (let s = 1; s <= seeds; s++) out.push(round.summarize(bots.runBotRound(boss, s * 7777, bot, { variant: 1, ...opts })));
  cache.set(key, out);
  return out;
}
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const rate = (xs, f) => xs.filter(f).length / xs.length;
const dmg = (rs) => median(rs.map((s) => s.damage));

/** Advance a fresh bout to its first attack and return [bout, attack]. */
function firstAttack(boss = 'kraken', bout = 0, extra = {}) {
  const b = enc.createBout({ boss, seed: 42, bout, variant: 1, ...extra });
  enc.advance(b, b.nextAt);
  assert.equal(b.phase, enc.P_ATTACK);
  return [b, b.attack];
}
/** Counter the first attack PERFECT and return [bout, opening]. */
function firstOpening(boss = 'kraken', bout = 0, extra = {}) {
  const [b, a] = firstAttack(boss, bout, extra);
  for (const s of a.steps) tap(b, s.I, s.lane);
  assert.equal(b.phase, enc.P_OPEN);
  return [b, b.opening];
}
function tap(b, t, lane) { enc.input(b, { t, k: C.IN_TARGET, a: lane }); }
const codes = (b) => b.events.map((e) => e.code);
const has = (b, code) => b.events.some((e) => e.code === code);

// ---- balance (design 9.1, 20.1) -----------------------------------------------

test('balance (Kraken, 200 seeds): every 9.1 bot target', () => {
  const m = dmg(play('kraken', 'median', N));
  const med = play('kraken', 'median', N);
  assert.ok(m >= 1000 && m <= 1150, `median 1 000-1 150 (got ${m})`);
  assert.equal(median(med.map((s) => s.stars)), 2, 'median: 2 stars');
  const kd = rate(med, (s) => s.knockdowns > 0);
  assert.ok(kd >= 0.05 && kd <= 0.15, `median Knockdown 5-15% (got ${kd})`);
  assert.ok(rate(med, (s) => s.tko) <= 0.05, 'median TKO <= 5%');

  const pad = play('kraken', 'padMasher', N);
  assert.ok(pad.every((s) => s.damage === 0 && s.stars === 0), 'pad masher: 0');
  const lane = play('kraken', 'laneMasher', N);
  assert.ok(dmg(lane) <= 0.15 * m, `lane masher <= 15% (got ${dmg(lane)})`);
  assert.ok(rate(lane, (s) => s.knockdowns > 0) >= 0.75, 'lane masher knocked down in most rounds');
  const guess = play('kraken', 'guesser', N);
  assert.ok(dmg(guess) <= 0.35 * m, 'guesser <= 35%');
  assert.ok(guess.every((s) => s.stars <= 1), 'guesser <= 1 star');
  assert.ok(rate(guess, (s) => s.knockdowns > 0) >= 0.6, 'guesser knocked down >= 60%');
  const kid = play('kraken', 'kid', N);
  assert.ok(dmg(kid) >= 0.5 * m, `kid >= 50% (got ${dmg(kid)})`);
  assert.ok(rate(kid, (s) => s.dizzy > 0) <= 0.34, 'kid DIZZY in <= 1 of 3 rounds');
  assert.ok(dmg(play('kraken', 'ringBlind', N)) <= 0.55 * m, 'ring-blind <= 55%');
  const slam = dmg(play('kraken', 'easySlam', N));
  assert.ok(slam >= 0.76 * m && slam <= 0.86 * m, `Easy-Slam-only near 80-85% of median (got ${(slam / m).toFixed(2)})`);
  const mast = play('kraken', 'mastery', N);
  assert.ok(dmg(mast) >= 2.7 * m, `mastery >= 2.7x median (got ${(dmg(mast) / m).toFixed(2)})`);
  assert.ok(rate(mast, (s) => s.stars === 3) >= 0.9, 'mastery 3 stars');
  assert.ok(rate(mast, (s) => s.knockdowns > 0) < 0.01, 'mastery Knockdown < 1%');
  assert.ok(mast.every((s) => s.maxChain >= 10), 'mastery reaches FURY');
});

test('ring chain at 90% ring accuracy beats Easy Slam by >= 40%', () => {
  const chain = { ...bots.BOTS.median, name: 'chain90', ringAcc: 0.9 };
  const a = dmg(play('kraken', chain, 120));
  const b = dmg(play('kraken', 'easySlam', 120));
  assert.ok(a >= 1.4 * b, `${a} vs ${b}`);
});

test('every boss: pad masher 0, mastery 3 stars, guesser <= 1 star, medians within 10% of the Kraken', () => {
  const k = dmg(play('kraken', 'median', 80));
  for (const boss of ['robo_shark', 'ghost_squid']) {
    assert.ok(play(boss, 'padMasher', 20).every((s) => s.damage === 0));
    assert.ok(play(boss, 'guesser', 30).every((s) => s.stars <= 1));
    assert.ok(rate(play(boss, 'mastery', 30), (s) => s.stars === 3) >= 0.7);
    const m = dmg(play(boss, 'median', 80));
    assert.ok(Math.abs(m / k - 1) <= 0.1, `${boss} median ${m} vs Kraken ${k}`);
  }
});

test('walking (wind-ups +1 step, 2-beat look-ahead) changes each bot by <= 3%', () => {
  for (const boss of BOSSES) {
    for (const name of ['median', 'easySlam', 'mastery']) {
      const a = mean(play(boss, name, 60).map((s) => s.damage));
      const w = mean(play(boss, name, 60, { walk: true }).map((s) => s.damage));
      assert.ok(Math.abs(w / a - 1) <= 0.03, `${boss} ${name}: ${a} vs ${w}`);
    }
  }
  const [bs, as] = firstAttack('kraken', 0);
  const [bw, aw] = firstAttack('kraken', 0, { walk: true });
  assert.equal(aw.W - as.W, bw.q);
  assert.equal(enc.lookAheadMs(bs), 4 * bs.q);
  assert.equal(enc.lookAheadMs(bw), 8 * bw.q);
});

// ---- counter ----------------------------------------------------------------

test('counter windows: buffer and GOOD before, PERFECT [I-160, I+40], coyote to I+90', () => {
  const [b0, a] = firstAttack();
  const s = a.steps[0];
  tap(b0, s.I - 160, s.lane);
  assert.ok(has(b0, enc.E_PERFECT));
  const [b1] = firstAttack();
  tap(b1, s.I + 41, s.lane);
  assert.ok(has(b1, enc.E_GOOD) && !has(b1, enc.E_PERFECT));
  const [b2] = firstAttack();
  tap(b2, s.I + 90, s.lane);
  assert.ok(has(b2, enc.E_GOOD));
  const [b3] = firstAttack();
  tap(b3, s.I - a.G - 20, s.lane); // inside the 120 ms buffer (and past the reflex grace): GOOD
  assert.ok(has(b3, enc.E_GOOD));
  const [b4] = firstAttack();
  enc.advance(b4, s.I + 91);
  assert.ok(has(b4, enc.E_PUNISH), 'no input by I + 90 lands the tell');
});

test('reflex grace: taps in the first 250 ms of a tell never land it and never count as a counter', () => {
  const [b, a] = firstAttack('kraken', 2); // Fury: the buffer opens right after the tell starts
  const s = a.steps[0];
  const wrong = (s.lane + 1) % 3;
  tap(b, a.T + 60, wrong);
  tap(b, a.T + 200, s.lane);
  assert.ok(!has(b, enc.E_PUNISH) && !has(b, enc.E_GOOD) && !has(b, enc.E_PERFECT));
  assert.equal(b.grit, C.GRIT);
  tap(b, s.I, s.lane);
  assert.ok(has(b, enc.E_PERFECT));
});

test('a wrong lane before the counter window is a soft tick; inside it the tell lands and costs a fin', () => {
  const [b, a] = firstAttack();
  const s = a.steps[0];
  const wrong = (s.lane + 1) % 3;
  tap(b, s.I - a.G - C.BUFFER_MS - 40, wrong);
  assert.equal(b.events.at(-1).code, enc.E_EARLY);
  assert.equal(b.grit, 3);
  tap(b, s.I - 100, wrong);
  assert.ok(has(b, enc.E_PUNISH));
  const g = b.events.find((e) => e.code === enc.E_GRIT);
  assert.equal(g.a, 2);
  assert.equal(b.carry.chain, 0);
});

// ---- Grit, Knockdown, TKO ----------------------------------------------------------

function punishAll(b, until) {
  for (let i = 0; i < 20 && b.phase !== enc.P_DOWN && b.phase !== enc.P_DONE; i++) {
    enc.advance(b, until);
    if (b.phase === enc.P_LEAD) enc.advance(b, b.nextAt);
    if (b.phase === enc.P_ATTACK) enc.advance(b, b.attack.steps[b.step].I + C.COYOTE_MS + 1);
  }
}

test('Grit: three landed tells = Knockdown; 8 taps in 1.5 s gets up and ends the bout; slower is a TKO', () => {
  const b = enc.createBout({ boss: 'kraken', seed: 5, bout: 0, variant: 1 });
  // Bout 1 has three attacks and no safe instance: let every one land.
  punishAll(b, 0);
  assert.equal(b.phase, enc.P_DOWN, codes(b).join(','));
  assert.equal(b.grit, 0);
  assert.ok(has(b, enc.E_KNOCKDOWN));
  const d = b.down;
  for (let k = 0; k < 7; k++) enc.input(b, { t: d.open + 10 + k * 100, k: C.IN_GETUP });
  assert.equal(b.phase, enc.P_DOWN);
  enc.input(b, { t: d.open + 10 + 7 * 100, k: C.IN_GETUP });
  assert.equal(b.phase, enc.P_DONE);
  assert.equal(b.endReason, enc.END_GOT_UP);
  assert.equal(b.carry.knockdowns, 1);

  const c = enc.createBout({ boss: 'kraken', seed: 5, bout: 0, variant: 1 });
  punishAll(c, 0);
  const d2 = c.down;
  for (let k = 0; k < 5; k++) enc.input(c, { t: d2.open + k * 100, k: C.IN_GETUP });
  enc.advance(c, d2.end + 1);
  assert.equal(c.endReason, enc.END_TKO);
  assert.ok(c.carry.tko);
});

test('Grit: taps faster than 14/s are bounces; the 2nd Knockdown in a round is a TKO; damage dealt counts', () => {
  const b = enc.createBout({ boss: 'kraken', seed: 5, bout: 0, variant: 1 });
  punishAll(b, 0);
  const d = b.down;
  for (let k = 0; k < 8; k++) enc.input(b, { t: d.open + k * 30, k: C.IN_GETUP });
  assert.equal(b.phase, enc.P_DOWN, '30 ms apart is a bounce');
  const carry = { ...enc.freshCarry(), knockdowns: 1 };
  const c = enc.createBout({ boss: 'kraken', seed: 6, bout: 2, carry, variant: pat.VARIANT_A0 });
  punishAll(c, 0);
  assert.equal(c.phase, enc.P_DONE);
  assert.equal(c.endReason, enc.END_TKO);
  assert.ok(has(c, enc.E_TKO));
});

test('Grit: novice rounds cannot drop below 1 fin in bout 1; Extra Fin starts at 4', () => {
  const b = enc.createBout({ boss: 'kraken', seed: 9, bout: 0, variant: 1, novice: true });
  for (let t = 0; t < 30000 && b.phase !== enc.P_DONE; t += 50) enc.advance(b, t);
  assert.ok(b.grit >= 1);
  assert.ok(!has(b, enc.E_KNOCKDOWN));
  const offer = pat.boonOffer(77, 1);
  const seed = offer.includes(C.BOON_FIN) ? 77 : [...Array(50).keys()].find((s) => pat.boonOffer(s, 1).includes(C.BOON_FIN));
  const f = enc.createBout({ boss: 'kraken', seed, bout: 1, variant: 1 });
  enc.input(f, { t: 0, k: C.IN_BOON, a: C.BOON_FIN });
  assert.equal(f.grit, 4);
  assert.equal(f.gritMax, 4);
});

// ---- Pin and Pop ----------------------------------------------------------------

test('Pin and Pop: one tap per slot; lit lane POP +-110 / PERFECT POP +-50 / HIT; unlit and second taps CLANK', () => {
  const [b, o] = firstOpening();
  assert.equal(o.rings.length, 4, 'PERFECT counter adds a half-beat slot');
  const lit = o.lanes;
  for (let j = 1; j < lit.length; j++) assert.notEqual(lit[j], lit[j - 1], 'pop lanes never repeat back to back');
  tap(b, o.rings[0] + 30, lit[0]);
  assert.equal(b.events.at(-1).code, enc.E_POP_PERFECT);
  tap(b, o.rings[0] + 80, lit[0]);
  assert.equal(b.events.at(-1).code, enc.E_CLANK);
  tap(b, o.rings[1] - 100, (lit[1] + 1) % 3);
  assert.equal(b.events.at(-1).code, enc.E_CLANK, 'unlit lane');
  tap(b, o.rings[1] - 100, lit[1]);
  assert.equal(b.events.at(-1).code, enc.E_POP);
  tap(b, o.rings[2] - 200, lit[2]);
  assert.equal(b.events.at(-1).code, enc.E_HIT);
  assert.equal(o.used.filter((u) => u > 0).length, 3);
});

test('Long Look boon widens POP to +-130 and the look-ahead to 2 beats', () => {
  const seed = [...Array(80).keys()].find((s) => pat.boonOffer(s, 1).includes(C.BOON_LOOK));
  const b = enc.createBout({ boss: 'kraken', seed, bout: 1, variant: 1 });
  enc.input(b, { t: 0, k: C.IN_BOON, a: C.BOON_LOOK });
  assert.equal(b.popMs, 130);
  assert.equal(enc.lookAheadMs(b), 8 * b.q);
  const bad = enc.createBout({ boss: 'kraken', seed, bout: 1, variant: 1 });
  const notOffered = [1, 2, 3, 4].find((id) => !pat.boonOffer(seed, 1).includes(id));
  enc.input(bad, { t: 0, k: C.IN_BOON, a: notOffered });
  assert.equal(bad.boon, C.BOON_NONE, 'a boon not in the seeded offer is ignored');
});

test('Easy Slam: float down before the first ring and held fires on the last slot; early release cancels; lane taps ignored while held', () => {
  const [b, o] = firstOpening();
  enc.input(b, { t: o.start + 20, k: C.IN_PAD_DOWN });
  tap(b, o.rings[0], o.lanes[0]);
  assert.ok(!has(b, enc.E_POP_PERFECT), 'lane taps ignored while holding');
  const last = o.rings[o.rings.length - 1];
  enc.advance(b, last);
  assert.ok(has(b, enc.E_SLAM));
  assert.equal(b.events.find((e) => e.code === enc.E_SLAM).t, last);
  enc.input(b, { t: last + 50, k: C.IN_PAD_UP });

  const [c, p] = firstOpening();
  enc.input(c, { t: p.start + 20, k: C.IN_PAD_DOWN });
  enc.input(c, { t: p.rings[1], k: C.IN_PAD_UP });
  assert.ok(has(c, enc.E_SLAM_CANCEL));
  tap(c, p.rings[2], p.lanes[2]);
  assert.ok(has(c, enc.E_POP_PERFECT), 'remaining slots still poppable');
  enc.advance(c, p.end);
  assert.ok(!has(c, enc.E_SLAM));

  const [d, q] = firstOpening();
  enc.input(d, { t: q.rings[0] + 30, k: C.IN_PAD_DOWN });
  enc.advance(d, q.end);
  assert.ok(!has(d, enc.E_SLAM), 'down after the first ring closed: no slam');
});

// ---- guard, fakes, bubble ------------------------------------------------------------

test('Guard Counter: never in bout 1 or on A0; warning at the 3rd stray, DIZZY at the 5th within 1 s (bouts 2-3)', () => {
  const spam = (b, o) => {
    const lane = o.lanes[0] !== o.lanes[1] ? 3 - o.lanes[0] - o.lanes[1] : (o.lanes[0] + 1) % 3;
    for (let i = 0; i < 6; i++) tap(b, o.start + 60 + i * 60, lane);
  };
  const [b1, o1] = firstOpening('kraken', 0);
  spam(b1, o1);
  assert.ok(!has(b1, enc.E_GUARD_WARN) && !has(b1, enc.E_GUARD_COUNTER));
  const [a0, oa] = firstOpening('kraken', 2, { variant: pat.VARIANT_A0 });
  spam(a0, oa);
  assert.ok(!has(a0, enc.E_GUARD_COUNTER));
  const [b2, o2] = firstOpening('kraken', 1);
  spam(b2, o2);
  const iw = b2.events.findIndex((e) => e.code === enc.E_GUARD_WARN);
  const id = b2.events.findIndex((e) => e.code === enc.E_GUARD_COUNTER);
  assert.ok(iw >= 0 && id > iw, 'warning always precedes DIZZY');
  assert.equal(b2.stats.guard, 1);
});

test('taps in the 250 ms close grace never count', () => {
  const [b, o] = firstOpening('kraken', 1);
  enc.advance(b, o.end);
  const n = b.events.length;
  tap(b, o.end + 100, 0);
  tap(b, o.end + 200, 1);
  assert.equal(b.events.length, n);
});

test('fakes: never on A0 or the first attack or Captain\'s Call; the first is safe (greys, no lockout); later bites lock and reset the combo, never cost Grit', () => {
  let seenSafe = false;
  let seenBite = false;
  for (let seed = 1; seed < 80; seed++) {
    for (const variant of [pat.VARIANT_A0, pat.VARIANT_A, pat.VARIANT_B]) {
      let carry = enc.freshCarry();
      const b = enc.createBout({ boss: 'kraken', seed, bout: 2, variant, carry });
      for (let t = 0; t < 60000 && b.phase !== enc.P_DONE; t += 10) {
        enc.advance(b, t);
        const a = b.attack;
        if (a && a.feintLane >= 0 && t === a.feintT0 + 100 - ((a.feintT0 + 100) % 10)) {
          assert.notEqual(variant, pat.VARIANT_A0);
          assert.ok(a.no > 0 && !a.call);
          const before = b.grit;
          tap(b, t, a.feintLane);
          if (a.feintSafe) {
            assert.equal(b.events.at(-1).code, enc.E_GREY);
            assert.equal(b.lockUntil, 0);
            seenSafe = true;
          } else {
            assert.equal(b.events.at(-1).code, enc.E_FAKE_TAP);
            assert.equal(b.lockUntil, t + C.PUNISH_MS);
            seenBite = true;
          }
          assert.equal(b.grit, before);
        }
        if (a && b.phase === enc.P_ATTACK) {
          const s = a.steps[b.step];
          if (t >= s.I - 20 && t < s.I - 10) tap(b, t, pat.laneAt(a, b.step, t));
        }
      }
    }
  }
  assert.ok(seenSafe && seenBite);
});

test('foam bubble: exactly one in Kraken bout 2, never in a telegraphed lane; first one safe; it blocks its buoy until tapped', () => {
  for (let seed = 1; seed < 40; seed++) {
    const b = enc.createBout({ boss: 'kraken', seed, bout: 1, variant: 1 });
    let bubbles = 0;
    for (let t = 0; t < 40000 && b.phase !== enc.P_DONE; t += 10) {
      enc.advance(b, t);
      const a = b.attack;
      if (a && b.phase === enc.P_ATTACK) {
        const s = a.steps[b.step];
        if (t >= s.I - 20 && t < s.I - 10) tap(b, t, s.lane);
      }
    }
    for (const e of b.events) if (e.code === enc.E_BUBBLE) bubbles += 1;
    assert.equal(bubbles, 1);
    const be = b.events.find((e) => e.code === enc.E_BUBBLE);
    const tell = b.events.find((e) => e.code === enc.E_TELL && e.t === be.t);
    assert.ok(tell && tell.a !== be.a);
  }
  for (const bout of [0, 2]) {
    const b = enc.createBout({ boss: 'kraken', seed: 3, bout, variant: 1 });
    enc.advance(b, 60000);
    assert.ok(!has(b, enc.E_BUBBLE), `no bubble in bout ${bout + 1}`);
  }
});

// ---- Break, Final Pop, Captain's Call ---------------------------------------------------

test('Break: fills at 100, pays a lump, all suckers lit with a rotating ring lane, +1 bout-3 attack (cap 2), max 3', () => {
  const carry = { ...enc.freshCarry(), gauge: 990 };
  const [b, a] = firstAttack('kraken', 1, { carry });
  tap(b, a.steps[0].I, a.steps[0].lane);
  if (a.steps.length > 1) tap(b, a.steps[1].I, a.steps[1].lane);
  assert.ok(has(b, enc.E_BREAK));
  const o = b.opening;
  assert.equal(o.kind, enc.O_BREAK);
  assert.equal(o.rings.length, 6);
  for (let j = 1; j < 6; j++) assert.equal(o.lanes[j], (o.lanes[j - 1] + 1) % 3);
  assert.equal(b.carry.bonusAttacks, 1);
  // Break opening starts on the step grid after the beat-absorbed freeze.
  assert.equal(o.start % b.q, 0);
  assert.ok(o.start >= b.events.find((e) => e.code === enc.E_BREAK).t + C.BREAK_FREEZE[0]);
});

test('Final Pop: every bout 3 that is not knocked down ends on exactly one Final Pop; Anchor Stars scale it', () => {
  for (let seed = 1; seed <= 30; seed++) {
    for (const name of ['median', 'guesser', 'mastery', 'easySlam']) {
      const bs = bots.runBotRound('kraken', seed * 31, bots.BOTS[name]);
      const b3 = bs[2];
      if (!b3 || b3.endReason === enc.END_GOT_UP || b3.endReason === enc.END_TKO) continue;
      assert.equal(b3.events.filter((e) => e.code === enc.E_FINAL).length, 1, `${name} ${seed}`);
      assert.equal(b3.endReason, enc.END_FINAL);
    }
  }
  // Stars: PERFECT counters in bout 3 light them (cap 3); a punish puts one out.
  const [b, a] = firstAttack('kraken', 2);
  tap(b, a.steps[0].I, a.steps[0].lane);
  assert.equal(b.carry.stars, 1);
  const s = round.summarize(bots.runBotRound('kraken', 5, bots.BOTS.mastery));
  assert.ok(s.anchorStars >= 1 && s.anchorStars <= 3);
  assert.equal(s.final, 3);
});

test("Captain's Call: bout 3 attack #3 lands 2 steps off the beat; PERFECT earns the Skill Star", () => {
  const b = enc.createBout({ boss: 'kraken', seed: 11, bout: 2, variant: 1 });
  let call = null;
  for (let t = 0; t < 60000 && b.phase !== enc.P_DONE; t += 5) {
    enc.advance(b, t);
    const a = b.attack;
    if (a && b.phase === enc.P_ATTACK) {
      if (a.call) call = a;
      const s = a.steps[b.step];
      if (t >= s.I - 5 && t < s.I) tap(b, s.I - 5, pat.laneAt(a, b.step, s.I));
    }
  }
  assert.ok(call && call.no === pat.CALL_NO);
  assert.equal(call.steps[0].I % (4 * b.q), 2 * b.q, 'impact on the "and" of the beat');
  assert.ok(call.W >= C.WINDUP_Q[2] * b.q);
  assert.ok(has(b, enc.E_SKILL_STAR));
  assert.ok(b.carry.skillStar);
});

// ---- grid, boons, pause --------------------------------------------------------------

test('step grid: every tell, impact, ring and slot is on the boss step grid (freezes included)', () => {
  for (const boss of BOSSES) {
    for (let seed = 1; seed <= 6; seed++) {
      const bs = bots.runBotRound(boss, seed * 101, bots.BOTS.mastery);
      bs.forEach((b) => {
        for (const e of b.events) {
          if (e.code === enc.E_TELL || e.code === enc.E_OPEN) assert.equal(e.t % b.q, 0, `${boss} code ${e.code} at ${e.t}`);
          if (e.code === enc.E_FINAL_READY) assert.equal(e.b % b.q, 0);
        }
      });
    }
  }
});

test('boons: two distinct seeded cards; Anchor Polish only before bout 3', () => {
  for (let s = 0; s < 200; s++) {
    const o1 = pat.boonOffer(s, 1);
    const o2 = pat.boonOffer(s, 2);
    assert.notEqual(o1[0], o1[1]);
    assert.notEqual(o2[0], o2[1]);
    assert.ok(!o1.includes(C.BOON_POLISH));
    assert.deepEqual(pat.boonOffer(s, 1), o1);
  }
  const seed = [...Array(80).keys()].find((s) => pat.boonOffer(s, 1).includes(C.BOON_TIDE));
  const b = enc.createBout({ boss: 'kraken', seed, bout: 1, variant: 1 });
  enc.input(b, { t: 0, k: C.IN_BOON, a: C.BOON_TIDE });
  assert.equal(b.carry.gauge, 300);
  enc.input(b, { t: 0, k: C.IN_BOON, a: C.BOON_TIDE });
  assert.equal(b.carry.gauge, 300, 'one boon per bout');
});

test('pause: two pauses are free; the 3rd paintballs the bout and its damage still counts', () => {
  const [b, a] = firstAttack();
  tap(b, a.steps[0].I, a.steps[0].lane);
  const t0 = a.steps[0].I + 100;
  tap(b, b.opening.rings[0], b.opening.lanes[0]);
  const before = enc.scoreBout(b);
  for (let i = 0; i < 2; i++) {
    enc.input(b, { t: b.opening.rings[0] + 10 + i, k: C.IN_PAUSE });
    enc.input(b, { t: b.opening.rings[0] + 10 + i, k: C.IN_RESUME });
  }
  assert.notEqual(b.phase, enc.P_DONE);
  enc.input(b, { t: b.opening.rings[0] + 20, k: C.IN_PAUSE });
  assert.equal(b.phase, enc.P_DONE);
  assert.equal(b.endReason, enc.END_PAINTBALL);
  assert.ok(enc.scoreBout(b) >= before && before > 0 && t0 > 0);
});

// ---- determinism, fixtures, integers, legacy proof, stars ------------------------------------

test('determinism: a round rebuilt from its bout proofs gives identical damage and event streams', () => {
  for (const boss of BOSSES) {
    for (const name of ['median', 'mastery', 'guesser', 'kid', 'easySlam']) {
      const bs = bots.runBotRound(boss, 4242, bots.BOTS[name], { novice: name === 'kid' });
      const log = { boss, seed: 4242, variant: 1, bouts: bs.map(round.boutProof) };
      const rs = round.replayRound(log);
      assert.equal(JSON.stringify(rs.map((b) => enc.scoreBout(b))), JSON.stringify(bs.map((b) => enc.scoreBout(b))));
      assert.deepEqual(JSON.stringify(rs.map((b) => b.events)), JSON.stringify(bs.map((b) => b.events)));
      for (const p of log.bouts) assert.equal(p.sim_version, C.SIM_VERSION);
    }
  }
});

test('golden replay fixtures (sidecar parity source) still replay exactly', () => {
  const dir = path.join(__dirname, 'fixtures/boss-replays');
  for (const boss of BOSSES) {
    const fx = JSON.parse(fs.readFileSync(path.join(dir, `${boss}.json`), 'utf8'));
    assert.equal(fx.version, C.SIM_VERSION);
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
      const cap = (() => { const h = Math.floor(p.duration_ms / 1000 * 7); return 10 * (h + 2 * Math.floor(h / 3)); })();
      const want = Math.min(Math.floor(d / 10) * 10, cap);
      const got = round.legacyDamage(p);
      assert.ok(got <= want && (want < cap - 30 ? got === want : got >= want - 20), `${d} ${ms}: ${got} vs ${want}`);
      if (d < 10) assert.equal(p.hits, 0);
    }
  }
  assert.equal(round.legacyDamage({ hits: 3, weak_hits: 1, duration_ms: 20000 }, 0.6), 30);
});

test('stars, NEXT STAR in actions, and the Ride Challenge rule', () => {
  assert.equal(round.starsFor(5000, false), 0);
  assert.equal(round.starsFor(300, true), 1);
  assert.equal(round.starsFor(1000, true), 2);
  assert.equal(round.starsFor(2600, true), 3);
  const s = round.summarize(bots.runBotRound('kraken', 12, bots.BOTS.median));
  if (s.stars < 3) assert.ok(typeof s.nextStar === 'string' && s.nextStar.length > 0);
  const slam = round.summarize(bots.runBotRound('kraken', 12, bots.BOTS.easySlam));
  if (slam.stars < 3) assert.equal(slam.nextStar, 'Pop instead of slam: about +20%');
  assert.equal(round.rideChallengeWin({ ...s, stars: 2, tkoEarly: false }), true);
  assert.equal(round.rideChallengeWin({ ...s, stars: 3, tkoEarly: true }), false);
  assert.equal(round.timingReadout(-42), 'You were 42 ms early');
});
