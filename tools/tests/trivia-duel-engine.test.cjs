'use strict';
/**
 * Trivia Duel engine: scoring (5.x), Fin AI (7.2), deck building (9),
 * match resolution (buzz, steal, wager), ghosts (10.5), near-miss (11.9).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const sc = loadTs('src/games/trivia-duel/engine/scoring.ts');
const fin = loadTs('src/games/trivia-duel/engine/finAI.ts');
const content = loadTs('src/games/trivia-duel/engine/content.ts');
const match = loadTs('src/games/trivia-duel/engine/match.ts');
const nm = loadTs('src/games/trivia-duel/engine/nearMiss.ts');
const cfg = loadTs('src/games/trivia-duel/engine/config.ts');

const POOL = [];
for (let i = 0; i < 30; i++) {
  const d = ['easy', 'medium', 'hard'][i % 3];
  POOL.push({ id: `q${i}`, question: `Question number ${i}?`, choices: [`right ${i}`, 'wrong a', 'wrong b', 'wrong c'], correctIndex: 0, difficulty: d, fact: `Fact ${i}`, source: 'Test' });
}
POOL.push({ id: 'gen-20', question: 'One chest holds 3 coins...', choices: ['Six', 'Five', 'Nine', 'Three'], correctIndex: 0, difficulty: 'easy' });

test('grace scales with answer text and clamps at 400 / 1100; slider is fixed', () => {
  assert.equal(sc.graceMs(['aaaaaaaaaa', 'bbbbbbbbbb', 'cccccccccc', 'dddddddddd']), 780);
  assert.equal(sc.graceMs(['a', 'b']), 400);
  assert.equal(sc.graceMs(['x'.repeat(80), 'y'.repeat(80)]), 1100);
  assert.equal(sc.graceMs('slider'), 800);
});

test('read-lock clamps per mode family (rev 7: the ride uses the queue clamp, 600-1500)', () => {
  assert.equal(sc.readLockMs(10, 'ride'), 600);
  assert.equal(sc.readLockMs(200, 'ride'), 1500);
  assert.equal(sc.readLockMs(50, 'queue'), 900);
  assert.equal(sc.readLockMs(0, 'queue'), 600);
});

test('speed drains from grace to horizon in steps of 5, then base only', () => {
  assert.equal(sc.speedPoints(300, 780, 6000), 100);
  assert.equal(sc.speedPoints(780, 780, 6000), 100);
  assert.equal(sc.speedPoints(6000, 780, 6000), 0);
  assert.equal(sc.speedPoints(9000, 780, 6000), 0);
  for (let t = 0; t < 7000; t += 37) assert.equal(sc.speedPoints(t, 780, 6000) % 5, 0);
  assert.equal(sc.speedPoints(3390, 780, 6000), 50);
});

test('streak multipliers 1.0 / 1.2 / 1.5 / 1.75 and flame tiers', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(sc.streakMult), [1, 1, 1.2, 1.5, 1.5, 1.75, 1.75]);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(sc.flameTier), [0, 1, 2, 3, 3, 5]);
  assert.equal(sc.quickPoints(true, 0, 780, 6000, 5), 350, 'per-question max 350');
  assert.equal(sc.quickPoints(false, 0, 780, 6000, 5), 0);
});

test('Chomp caps speed at 50; HOLD after unlock forfeits speed', () => {
  assert.equal(sc.creditedSpeed(100, 780, 6000, { chomp: true }), 50);
  assert.equal(sc.creditedSpeed(5000, 780, 6000, { chomp: true }), sc.speedPoints(5000, 780, 6000));
  assert.equal(sc.creditedSpeed(100, 780, 6000, { holdForfeit: true }), 0);
  assert.equal(sc.quickPoints(true, 100, 780, 6000, 1, { holdForfeit: true }), 100);
});

test('the ticker value on a frame equals the points for locking on that frame', () => {
  for (let t = 0; t <= 8000; t += 16.7) {
    const shown = sc.tickerValue(t, 640, 6000);
    assert.equal(sc.quickPoints(true, t, 640, 6000, 1), shown);
  }
});

test('speed tiers', () => {
  assert.deepEqual([100, 95, 94, 70, 69, 35, 34, 0].map(sc.speedTier), ['lightning', 'lightning', 'great', 'great', 'nice', 'nice', 'none', 'none']);
});

test('bell (rev 7): correct (150 + speed) x m on the bell clock (g 400, H 5000), wrong a flat -100 (0 with Shield), steal 125 + speed from the flip (max 225)', () => {
  assert.equal(sc.buzzPoints(true, 500, 1, false), 250);
  assert.equal(sc.buzzPoints(true, 500, 5, false), Math.round(250 * 1.75), 'bell max 437');
  assert.equal(sc.buzzPoints(true, 2700, 1, false), 150 + sc.speedPoints(2700, 400, 5000));
  assert.equal(sc.buzzPoints(true, 6000, 1, false), 150);
  assert.equal(sc.buzzPoints(false, 500, 1, false), -100);
  assert.equal(sc.buzzPoints(false, 500, 5, false), -100, 'flat: no streak-scaled penalty');
  assert.equal(sc.buzzPoints(false, 500, 1, true), 0);
  assert.equal(sc.bellValue(500), 250);
  assert.equal(sc.stealPoints(true, 200), 225);
  assert.equal(sc.stealPoints(true, 3000), 125);
  assert.equal(sc.stealPoints(false, 200), 0);
  assert.equal(sc.buzzFirst(1000, 1020), 'a');
  assert.equal(sc.buzzFirst(1199, 1000), 'b');
  assert.equal(sc.buzzFirst(1000, 1000), 'a', 'equal times go to side a');
});
test('bell EV (5.4): break-even confidence 0.51 / 0.47 / 0.41 / 0.38 by multiplier', () => {
  // G = (150 + ~60) x m; W = 100 + opponent steal EV (0.7 x 175 = 122) = 222; c = W / (W + G).
  const W = -sc.buzzPoints(false, 0, 1, false) + 0.7 * 175;
  const c = (m) => W / (W + 210 * m);
  assert.ok(Math.abs(c(1) - 0.51) < 0.01, `x1.0 ${c(1)}`);
  assert.ok(Math.abs(c(1.2) - 0.47) < 0.01, `x1.2 ${c(1.2)}`);
  assert.ok(Math.abs(c(1.5) - 0.41) < 0.01, `x1.5 ${c(1.5)}`);
  assert.ok(Math.abs(c(1.75) - 0.38) < 0.01, `x1.75 ${c(1.75)}`);
});
test('DEAD HEAT lives only in live rooms (party/deadHeat.ts): correct beats wrong, faster blind pick wins, slower correct takes 75, wrong costs 50', () => {
  const dh = loadTs('src/games/trivia-duel/party/deadHeat.ts');
  const side = (correct, answerMs, buzzMs = 1000, shield = false) => ({ correct, answerMs, buzzMs, streakAfter: 1, shield });
  let r = dh.deadHeatPoints(side(true, 900), side(true, 1400));
  assert.equal(r.winner, 'a');
  assert.equal(r.a, sc.buzzPoints(true, 1000, 1, false));
  assert.equal(r.b, 75);
  r = dh.deadHeatPoints(side(false, 300), side(true, 2500));
  assert.equal(r.winner, 'b');
  assert.equal(r.a, -50);
  r = dh.deadHeatPoints(side(false, 300), side(false, 2500, 1000, true));
  assert.deepEqual([r.a, r.b], [-50, 0], 'a Shield absorbs the blind miss');
  assert.equal(dh.isDeadHeat(1000, 1200), true);
  assert.equal(dh.isDeadHeat(1000, 1201), false);
});
test('Closest Number: accuracy, 0.8 counts as correct, 0.97 is a bullseye', () => {
  const exact = sc.closestPoints(1969, 1969, 8, 0, 7000, 1);
  assert.equal(exact.bullseye, true);
  assert.equal(exact.points, 200);
  const near = sc.closestPoints(1970, 1969, 8, 0, 7000, 1);
  assert.equal(near.correct, true);
  assert.equal(near.bullseye, false);
  const off = sc.closestPoints(1977, 1969, 8, 0, 7000, 1);
  assert.equal(off.points, 0);
  assert.equal(off.correct, false);
  const partial = sc.closestPoints(1973, 1969, 8, 7000, 7000, 1);
  assert.equal(partial.correct, false);
  assert.equal(partial.points, 50);
});

test('wager (rev 7, S0-3): SAFE / HALF / ALL IN, always a share of what you hold, no fixed stakes, never above the score', () => {
  assert.deepEqual(plain(sc.wagerStakes(800)), [0, 400, 800]);
  assert.deepEqual(plain(sc.wagerStakes(150)), [0, 75, 150], 'no fixed stakes under 200');
  assert.deepEqual(plain(sc.wagerStakes(0)), [0, 0, 0], 'ALL IN at 0 is worth nothing');
  for (let s = 0; s <= 3000; s += 7) {
    const st = sc.wagerStakes(s);
    assert.equal(st.length, 3);
    for (const x of st) { assert.ok(x <= s, `stake ${x} above score ${s}`); assert.ok(x >= 0); }
    assert.equal(st[2], s);
  }
  assert.equal(cfg.WAGER.fixed, undefined);
  assert.equal(cfg.WAGER.fixedBelow, undefined);
  assert.equal(sc.applyFinal(800, true, 250, 400), 1450);
  assert.equal(sc.applyFinal(800, false, 0, 400), 400);
  assert.equal(sc.applyFinal(150, false, 0, 150), 0, 'score floor 0');
});

test('suggestWager: every branch of 5.5', () => {
  // 1) A chip that makes you unbeatable when right: the smallest one.
  let s = sc.suggestWager(1000, 300, 1);
  assert.equal(s.index, 0);
  assert.equal(s.reason, "Wins it if you're right.");
  s = sc.suggestWager(700, 400, 1); // 700+100+0 = 800 < 1150; +350 = 1150 no; +700 = 1500 > 1150
  assert.equal(s.index, 2);
  assert.equal(s.reason, "Wins it if you're right.");
  // 2) Trailing with no locking chip: ALL IN.
  s = sc.suggestWager(300, 600, 1);
  assert.equal(s.index, 2);
  assert.equal(s.reason, 'You need it all.');
  // 3) Leading or tied: smallest chip covering their best bet, else SAFE.
  s = sc.suggestWager(600, 400, 1); // lock: 2*400+350=1150; 700/1000/1300 -> ALL IN locks
  assert.equal(s.index, 2);
  s = sc.suggestWager(500, 500, 1); // lock 1350: 600/850/1100 no; cover 1100: 1100 > 1100 no -> SAFE
  assert.equal(s.index, 0);
  assert.equal(s.reason, 'Keeps the lead if they miss.');
  s = sc.suggestWager(520, 500, 1); // cover 1100: 620 / 880 / 1140 -> ALL IN covers
  assert.equal(s.index, 2);
  assert.equal(s.reason, 'Covers their best bet.');
  s = sc.suggestWager(900, 700, 1.5); // lock 1750: 1050/1500/1950 -> ALL IN locks
  assert.equal(s.index, 2);
  s = sc.suggestWager(800, 600, 1); // lock 1550: 900/1300/1700 -> ALL IN; check cover not reached first
  assert.equal(s.reason, "Wins it if you're right.");
});
test('ride points and stars', () => {
  assert.equal(sc.ridePoints(true, 0, 640), 250);
  assert.equal(sc.ridePoints(true, 8000, 640), 100);
  assert.equal(sc.ridePoints(true, 0, 640, { holdForfeit: true }), 100);
  assert.equal(sc.rideStars(1, 3, 250), 0);
  assert.equal(sc.rideStars(2, 3, 300), 1);
  assert.equal(sc.rideStars(2, 3, 430), 2);
  assert.equal(sc.rideStars(3, 3, 600), 3);
  assert.equal(sc.rideStars(3, 3, 590), 2);
});

test('duel stars', () => {
  assert.equal(sc.duelStars(500, 600, 3, 5), 0);
  assert.equal(sc.duelStars(600, 600, 3, 5), 0);
  assert.equal(sc.duelStars(610, 600, 3, 5), 1);
  assert.equal(sc.duelStars(800, 600, 3, 5), 2);
  assert.equal(sc.duelStars(610, 600, 4, 5), 2);
  assert.equal(sc.duelStars(610, 600, 5, 5), 3);
});

test('streak: ignite at 3 grants a Shield (from match 2), Shield absorbs one miss, a wrong buzz holds the streak', () => {
  const s = sc.createStreak();
  sc.applyStreak(s, true);
  sc.applyStreak(s, true);
  const ig = sc.applyStreak(s, true);
  assert.equal(ig.ignited, true);
  assert.equal(ig.shieldGranted, true);
  assert.equal(ig.freezeGranted, undefined, 'Freeze is cut');
  const absorbed = sc.applyStreak(s, false);
  assert.equal(absorbed.shieldUsed, true);
  assert.equal(absorbed.streak, 3);
  const held = sc.applyStreak(s, false, true);
  assert.equal(held.streak, 3, 'a wrong buzz holds the streak');
  assert.equal(held.broke, false);
  const broke = sc.applyStreak(s, false);
  assert.equal(broke.broke, true);
  assert.equal(broke.streak, 0);
  assert.equal(s.best, 3);
  // Match 1: no Shield.
  const m1 = sc.createStreak(0, true, false);
  assert.equal(m1.shield, false);
  sc.applyStreak(m1, true); sc.applyStreak(m1, true);
  assert.equal(sc.applyStreak(m1, true).shieldGranted, false);
  // A wrong buzz with a Shield: the -100 is zeroed and the Shield pops.
  const sh = sc.createStreak(4, true);
  const ev = sc.applyStreak(sh, false, true);
  assert.equal(ev.shieldUsed, true);
  assert.equal(sh.streak, 4);
});
function finStats(rank, difficulty, n = 10000) {
  const stats = fin.priorStats(difficulty);
  let correct = 0;
  const times = [];
  for (let i = 0; i < n; i++) {
    const a = fin.finAnswer(1234 + i, i % 5, rank, { correctIndex: 2, choiceCount: 4, windowMs: 16000, graceMs: 700, stats });
    if (a.correct) { correct++; times.push(a.lockMs); }
  }
  times.sort((a, b) => a - b);
  return { acc: correct / n, median: times[Math.floor(times.length / 2)], target: fin.finAccuracy(rank, stats.p), q: fin.finQuantileMs(rank, stats) };
}

test('Fin AI: accuracy within 2 points and median lock within 5% of the rank quantile', () => {
  for (const rank of ['deckhand', 'firstmate', 'captain', 'admiral']) {
    for (const d of ['easy', 'medium', 'hard']) {
      const s = finStats(rank, d);
      assert.ok(Math.abs(s.acc - s.target) <= 0.02, `${rank}/${d} acc ${s.acc} vs ${s.target}`);
      assert.ok(Math.abs(s.median - s.q) / s.q <= 0.05, `${rank}/${d} median ${s.median} vs ${s.q}`);
    }
  }
  const adm = finStats('admiral', 'easy');
  assert.ok(adm.median >= 1200 && adm.median <= 1600, `admiral easy median ${adm.median}`);
});

test('Fin AI is seeded: same seed and round give the same answer; he buzzes on a rank share of bell rounds at 0.9 x his lock time', () => {
  const q = { correctIndex: 1, choiceCount: 4, windowMs: 12000, graceMs: 600, stats: fin.priorStats('medium') };
  assert.deepEqual(plain(fin.finAnswer(77, 2, 'captain', q)), plain(fin.finAnswer(77, 2, 'captain', q)));
  const a = fin.finAnswer(77, 2, 'captain', q);
  assert.ok(a.lockMs >= 800 && a.lockMs <= 11400);
  for (const [rank, share] of [['deckhand', 0.5], ['firstmate', 0.6], ['captain', 0.7], ['admiral', 0.8]]) {
    let buzzes = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const b = fin.finAnswer(9000 + i, 2, rank, { ...q, windowMs: 6000 });
      if (b.buzzMs >= 0) {
        buzzes++;
        assert.ok(b.buzzMs >= 600 && b.buzzMs <= 5700, `${b.buzzMs}`);
      }
      assert.ok(b.answerMs >= 450 && b.answerMs <= 3100);
    }
    assert.ok(Math.abs(buzzes / N - share) < 0.03, `${rank} buzz share ${buzzes / N}`);
  }
});
test('Fin wager policy: suggestWager for his own state; Deckhand and First Mate go one chip off 25% of the time', () => {
  for (let s = 0; s < 50; s++) {
    assert.equal(fin.finWagerIndex(s, 'captain', 900, 600), sc.suggestWager(900, 600, 1).index);
    assert.equal(fin.finWagerIndex(s, 'admiral', 300, 600), 2);
  }
  let off = 0;
  const N = 2000;
  for (let s = 0; s < N; s++) {
    const i = fin.finWagerIndex(s, 'deckhand', 520, 500);
    assert.ok(i >= 0 && i <= 2);
    if (i !== sc.suggestWager(520, 500, 1).index) off++;
  }
  assert.ok(Math.abs(off / N - 0.25) < 0.04, `deckhand off-chip rate ${off / N}`);
  for (let s = 0; s < 200; s++) assert.ok(fin.finStake(s, 'deckhand', 330, 600) <= 330, 'never a stake above his score');
});
test('Fin rank ladder: promote after N wins, demote after 3 straight losses', () => {
  const st = fin.createRankState('deckhand');
  fin.applyMatchToRank(st, true);
  assert.equal(fin.applyMatchToRank(st, true).promoted, true);
  assert.equal(st.rank, 'firstmate');
  fin.applyMatchToRank(st, false); fin.applyMatchToRank(st, false);
  assert.equal(fin.applyMatchToRank(st, false).demoted, true);
  assert.equal(st.rank, 'deckhand');
  let n = 0;
  let named = 0;
  for (const k of Object.keys(fin.BARKS)) for (const b of fin.BARKS[k]) {
    n++;
    if (b.includes('{name}')) named++;
    assert.ok(b.replace('{name}', 'Sharkbait12').length <= 32 || fin.pickBark(k, fin.BARKS[k].indexOf(b), 'Sharkbait12').length <= 32, b);
    assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(b), `emoji in ${b}`);
  }
  assert.equal(n, 60, '60 barks');
  assert.equal(named, 20, '20 with a {name} token');
  for (let i = 0; i < 20; i++) assert.ok(fin.pickBark('intro', i, 'AVeryLongShark').length <= 32);
});

test('deck: filler dropped, deterministic per seed, formats honour the round table, no repeats', () => {
  const plan1 = match.planMatch('queue', 42, POOL, { parkId: 8 });
  const plan2 = match.planMatch('queue', 42, POOL, { parkId: 8 });
  assert.deepEqual(plain(plan1.rounds.map((r) => r.question)), plain(plan2.rounds.map((r) => r.question)));
  assert.equal(plan1.rounds.length, 5);
  assert.equal(plan1.rounds[4].spec.type, 'final');
  assert.notEqual(plan1.rounds[0].spec.type, 'buzz');
  const ids = plan1.rounds.map((r) => r.question.id);
  assert.equal(new Set(ids).size, ids.length);
  for (let seed = 0; seed < 200; seed++) {
    const p = match.planMatch('queue', seed, POOL, { parkId: 8 });
    for (const r of p.rounds) {
      assert.ok(!/^gen-20$/.test(r.question.id));
      assert.ok(r.spec.formats.includes(r.question.format) || r.question.format === 'choice4' || r.question.format === 'truetale', r.question.format);
      if (r.question.format !== 'closest') assert.ok(r.question.correctIndex >= 0 && r.question.correctIndex < r.question.choices.length);
      assert.ok(r.jitterMs >= 0 && r.jitterMs <= 250);
      assert.ok(r.horizonMs <= r.windowMs);
    }
    assert.ok(p.rounds[4].question.format === 'choice4' || p.rounds[4].question.format === 'truetale');
  }
});

test('deck: generated formats are built only from the verified fact table', () => {
  const { OPENING_FACTS } = loadTs('src/games/trivia-duel/engine/facts.ts');
  const { genericize } = loadTs('src/games/trivia-duel/engine/labels.ts');
  const cap = (x) => x[0].toUpperCase() + x.slice(1);
  const years = new Map(OPENING_FACTS.map((f) => [cap(genericize(f.name)), f.year]));
  for (let seed = 0; seed < 200; seed++) {
    const p = match.planMatch('queue', seed, POOL, {});
    for (const r of p.rounds) {
      const q = r.question;
      if (q.format === 'closest') {
        assert.ok(q.slider.truth >= q.slider.min && q.slider.truth <= q.slider.max);
        assert.ok([...years.values()].includes(q.slider.truth));
      }
      if (q.format === 'pair' || q.format === 'opened') {
        const ys = q.choices.map((c) => years.get(c));
        assert.ok(ys.every((y) => y != null));
        assert.equal(Math.min(...ys), ys[q.correctIndex]);
      }
      if (q.format === 'truetale') assert.ok(q.prompt.length <= 90, q.prompt);
    }
  }
});

test('every planned question rebuilds from its id alone', () => {
  for (let seed = 0; seed < 300; seed++) {
    const plan = match.planMatch(seed % 7 === 0 ? 'ride' : 'queue', seed, POOL, { parkId: seed % 2 ? 8 : undefined });
    const again = match.planFromIds(plan.mode, plan.seed, plan.rounds.map((r) => r.question.id), POOL);
    assert.deepEqual(plain(again.rounds.map((r) => r.question)), plain(plan.rounds.map((r) => r.question)));
  }
});

test('no two questions in a match share a verified fact (no giveaways), rested facts rotate', () => {
  const pool = POOL.concat([
    { id: 'a1', question: 'Which Disneyland mountain ride opened in 1959?', choices: ['Matterhorn Bobsleds', 'Space Mountain', 'Splash', 'Big'], correctIndex: 0, difficulty: 'medium', source: 'x' },
    { id: 'a2', question: 'What year did Disneyland\u2019s Haunted Mansion open?', choices: ['1969', '1955', '1977', '1989'], correctIndex: 0, difficulty: 'medium', source: 'x' },
  ]);
  for (let seed = 0; seed < 300; seed++) {
    const plan = match.planMatch('queue', seed, pool, { parkId: 8 });
    const keys = plan.rounds.flatMap((r) => content.factKeysOf(r.question));
    assert.equal(new Set(keys).size, keys.length, `seed ${seed}: ${keys}`);
  }
  const seen = ['fact:dl-park', 'fact:dl-matterhorn', 'fact:dl-space', 'fact:mk-space'];
  let rested = 0;
  for (let seed = 0; seed < 100; seed++) {
    const plan = match.planMatch('queue', seed, POOL, { seen });
    rested += plan.rounds.flatMap((r) => content.factKeysOf(r.question)).filter((k) => seen.includes(`fact:${k}`)).length;
  }
  assert.ok(rested <= 25, `rested facts reused ${rested} times in 500 rounds`);
});

test('unlock jitter is close to uniform over 0-250ms', () => {
  const buckets = [0, 0, 0, 0, 0];
  for (let i = 0; i < 5000; i++) buckets[Math.min(4, Math.floor(match.unlockJitter(i * 7 + 3, i % 5) / 50.2))]++;
  for (const b of buckets) assert.ok(b > 800 && b < 1200, `bucket ${b}`);
});

function quickRound(type = 'quick') {
  const spec = { ...cfg.QUEUE_ROUNDS.q1, type };
  const q = { id: 'x', format: 'choice4', prompt: 'Q?', choices: ['a', 'b', 'c', 'd'], correctIndex: 2, difficulty: 'easy', category: 'X', stats: fin.priorStats('easy') };
  return match.planRound(spec, q, 0, 1, 'queue');
}

test('resolveRound: quick draw applies streak multiplier to both sides', () => {
  const t = match.createTally(2, false);
  const r = quickRound();
  const res = match.resolveRound('queue', r, { choice: 2, lockMs: 0 }, { choice: 1, lockMs: 3000 }, t);
  assert.equal(res.me.points, Math.round(200 * 1.5));
  assert.equal(res.me.streak.ignited, true);
  assert.equal(res.opp.points, 0);
  assert.equal(t.me.score, 300);
  assert.equal(t.me.streak.shield, true);
});

test('resolveRound: a wrong buzz costs 100, holds the streak and hands the steal; steal scores 125 + speed and counts for the stealer', () => {
  const t = match.createTally(2, false);
  t.me.score = 300;
  const r = quickRound('buzz');
  const res = match.resolveRound('queue', r, { choice: 1, lockMs: 900, buzzMs: 900 }, { choice: 2, lockMs: -1, buzzMs: 2000, stealChoice: 2, stealMs: 200 }, t);
  assert.equal(res.buzz.first, 'me');
  assert.equal(res.buzz.steal, true);
  assert.equal(res.me.points, -100);
  assert.equal(res.me.buzzMiss, true);
  assert.equal(res.opp.points, 225);
  assert.equal(t.me.score, 200);
  assert.equal(t.me.streak.streak, 2, 'a wrong buzz holds the streak');
  assert.equal(t.opp.streak.streak, 1, 'a landed steal counts for the streak');
  // A right buzz: the other side's steal pick does nothing and never touches its streak.
  const t2 = match.createTally(0, false);
  t2.opp.streak.streak = 3;
  const res2 = match.resolveRound('queue', r, { choice: 2, lockMs: 900, buzzMs: 900 }, { choice: 1, lockMs: -1, buzzMs: -1, stealChoice: 1, stealMs: 300 }, t2);
  assert.equal(res2.buzz.steal, false);
  assert.equal(res2.me.points, sc.buzzPoints(true, 900, 1, false));
  assert.equal(res2.opp.points, 0);
  assert.equal(t2.opp.streak.streak, 3);
  // A failed steal never touches the stealer's streak.
  const t3 = match.createTally();
  t3.opp.streak.streak = 2;
  match.resolveRound('queue', r, { choice: 1, lockMs: 900, buzzMs: 900 }, { choice: 0, lockMs: -1, buzzMs: -1, stealChoice: 0, stealMs: 300 }, t3);
  assert.equal(t3.opp.streak.streak, 2);
});

test('resolveRound: simultaneous buzzes (vs Fin or a ghost) go to the lower scored time, never a DEAD HEAT', () => {
  const r = quickRound('buzz');
  const t = match.createTally();
  const res = match.resolveRound('queue', r, { choice: 2, lockMs: 1150, buzzMs: 1150 }, { choice: 0, lockMs: 1000, buzzMs: 1000, stealChoice: 0, stealMs: 400 }, t);
  assert.equal(res.buzz.first, 'opp');
  assert.equal(res.buzz.deadHeat, undefined);
  assert.equal(res.opp.points, -100);
  const t2 = match.createTally();
  const res2 = match.resolveRound('queue', r, { choice: 2, lockMs: 1150, buzzMs: 1150 }, { choice: 0, lockMs: 1000, buzzMs: 1000, stealChoice: 0, stealMs: 400 }, t2);
  assert.deepEqual(plain(res2), plain(res), 'replays and the server agree');
});
test('resolveRound: nobody buzzes -> open phase flat 50', () => {
  const t = match.createTally();
  const res = match.resolveRound('queue', quickRound('buzz'), { choice: 2, lockMs: 9000 }, { choice: 0, lockMs: 9500 }, t);
  assert.equal(res.buzz.open, true);
  assert.equal(res.me.points, 50);
  assert.equal(res.opp.points, 0);
});

test('resolveRound: final wager adds or removes the stake, floor 0', () => {
  const t = match.createTally();
  t.me.score = 400; t.opp.score = 500;
  const r = quickRound('final');
  const res = match.resolveRound('queue', r, { choice: 2, lockMs: 0, stake: 400 }, { choice: 0, lockMs: 3000, stake: 500 }, t);
  assert.equal(t.me.score, 400 + 200 + 400);
  assert.equal(t.opp.score, 0);
  assert.equal(res.decisive, true);
});

test('ghost: encode/decode round-trips under 1KB and regrades identically', () => {
  const plan = match.planMatch('queue', 99, POOL, { parkId: 8 });
  const t = match.createTally();
  plan.rounds.forEach((r, i) => {
    const input = r.question.format === 'closest'
      ? { choice: -1, lockMs: 1500, guess: r.question.slider.truth }
      : { choice: r.question.correctIndex, lockMs: 1200 + i * 100, buzzMs: r.spec.type === 'buzz' ? 1200 : undefined, stake: r.spec.type === 'final' ? 100 : undefined };
    match.resolveRound('queue', r, input, null, t);
  });
  const g = match.makeGhost(plan, t, 'Shark', 'blue', 1);
  const wire = match.encodeGhost(g);
  assert.ok(wire.length < 1024, `ghost ${wire.length} bytes`);
  const back = match.decodeGhost(wire);
  assert.deepEqual(plain(back), plain(g));
  const rebuilt = match.planFromIds('queue', back.seed, back.qids, POOL, 'deckhand', false, back.keys);
  assert.deepEqual(plain(rebuilt.rounds.map((r) => r.question)), plain(plan.rounds.map((r) => r.question)));
  const regraded = match.gradeRun(rebuilt, back.rows);
  assert.equal(regraded.me.score, t.me.score);
  assert.equal(match.decodeGhost('nope'), null);
});

test('Fin bell input: a replayable buzz (or none), his steal pick from his own flip, an open-phase pick when he holds back', () => {
  const plan = match.planMatch('queue', 7, POOL, { rank: 'deckhand' });
  const bi = plan.rounds.findIndex((r) => r.spec.type === 'buzz');
  assert.ok(bi > 0, 'the bell is never first');
  let none = 0;
  for (let s = 0; s < 200; s++) {
    const p = { ...plan, seed: s };
    const { input } = match.finInput(p, p.rounds[bi], match.createTally());
    assert.ok(input.stealMs > 0 && input.stealMs < 3500);
    assert.equal(input.stealChoice, input.choice, 'he never sees your pick: the steal pick is his own answer');
    if (input.buzzMs < 0) { none++; assert.ok(input.lockMs >= 0 && input.lockMs < 4000); }
    else assert.equal(input.lockMs, input.buzzMs);
  }
  assert.ok(none > 60 && none < 140, `deckhand holds back on about half: ${none}/200`);
});
test('near-miss finds the smallest single change', () => {
  const plan = match.planMatch('queue', 3, POOL, {});
  const t = match.createTally();
  t.me.score = 500; t.opp.score = 535;
  const results = plan.rounds.map(() => ({ me: { correct: true, speed: 20, stake: 0, points: 120, streak: { streak: 1 } }, opp: {} }));
  const out = nm.nearMiss(plan, t, results);
  assert.equal(out.kind, 'speed');
  assert.match(out.line, /^Lost by 35\. A GREAT lock on Q1 wins it\.$/);
  t.opp.score = 499;
  assert.equal(nm.nearMiss(plan, t, results).kind, 'none');
});

test('balance sim: a typical player beats Deckhand far more often than Admiral', () => {
  // Player model: accuracy and lock times from the tier priors (median human).
  const rate = (rank) => {
    let wins = 0;
    const N = 400;
    for (let m = 0; m < N; m++) {
      const plan = match.planMatch('queue', 1000 + m, POOL, { rank });
      const t = match.createTally();
      plan.rounds.forEach((r) => {
        const human = fin.finAnswer(50000 + m * 13, r.index, 'firstmate', {
          correctIndex: Math.max(0, r.question.correctIndex), choiceCount: Math.max(1, r.question.choices.length),
          windowMs: r.windowMs, graceMs: r.graceMs, stats: r.question.stats,
        });
        const me = r.question.format === 'closest'
          ? { choice: -1, lockMs: human.lockMs, guess: r.question.slider.truth + (human.correct ? 1 : 6) }
          : { choice: human.choice, lockMs: human.lockMs, buzzMs: r.spec.type === 'buzz' ? human.buzzMs : undefined, stake: r.spec.type === 'final' ? sc.wagerStakes(t.me.score)[1] : undefined };
        const { input } = match.finInput(plan, r, t);
        match.resolveRound('queue', r, me, input, t, 0.5);
      });
      if (t.me.score > t.opp.score) wins++;
    }
    return wins / N;
  };
  const deck = rate('deckhand');
  const adm = rate('admiral');
  assert.ok(deck > 0.55, `vs deckhand ${deck}`);
  assert.ok(adm < 0.45, `vs admiral ${adm}`);
  assert.ok(deck - adm > 0.2);
});

// -- Revision 4 (C6, C8, C9, C11) ---------------------------------------------------

test('rev 7 windows: R1 10s, bell 6s to buzz + 3.5s, R4 12s, Final 10s with H 7s; horizons shorter than windows', () => {
  assert.equal(cfg.QUEUE_ROUNDS.q1.windowMs, 10000);
  assert.equal(cfg.QUEUE_ROUNDS.buzz.windowMs, 6000);
  assert.equal(cfg.BUZZ.answerMs, 3500);
  assert.equal(cfg.BUZZ.stealFlipMs, 1000);
  assert.equal(cfg.QUEUE_ROUNDS.q4.windowMs, 12000);
  assert.equal(cfg.QUEUE_ROUNDS.final.windowMs, 10000);
  assert.equal(cfg.QUEUE_ROUNDS.final.horizonMs, 7000);
  assert.equal(cfg.CATEGORY_PICK.pickMs, 2500);
  assert.equal(cfg.WAGER.pickMs, 4000);
  assert.equal(cfg.FINAL_HOLD_MS, 300);
  for (const k of Object.keys(cfg.QUEUE_ROUNDS)) assert.ok(cfg.QUEUE_ROUNDS[k].horizonMs < cfg.QUEUE_ROUNDS[k].windowMs, k);
});

test('2.3 unlocks: match 1 QQQQ with no lifelines, match 2 QQBQ with Chomp/bell/Shield, match 3+ rotates QQBQF / QBQQF', () => {
  const m1 = match.planMatch('queue', 11, POOL, { matchNo: 1 });
  assert.deepEqual(plain(m1.rounds.map((r) => r.spec.type)), ['quick', 'quick', 'quick', 'quick']);
  assert.deepEqual(plain(m1.features), { chomp: false, bell: false, shield: false, final: false });
  const m2 = match.planMatch('queue', 11, POOL, { matchNo: 2 });
  assert.deepEqual(plain(m2.rounds.map((r) => r.spec.type)), ['quick', 'quick', 'buzz', 'quick']);
  assert.deepEqual(plain(m2.features), { chomp: true, bell: true, shield: true, final: false });
  const templates = new Set();
  for (let seed = 0; seed < 40; seed++) {
    const p = match.planMatch('queue', seed, POOL, { matchNo: 3 + (seed % 5) });
    const types = p.rounds.map((r) => r.spec.type).join('');
    templates.add(types);
    assert.equal(p.rounds[0].spec.type, 'quick', 'B never first');
    assert.equal(p.rounds[p.rounds.length - 1].spec.type, 'final', 'F always last');
    assert.equal(p.features.final, true);
  }
  assert.equal(templates.size, 2);
  assert.equal(match.planMatch('ride', 3, POOL).features.chomp, true, 'the ride has Chomp from the first attempt');
  assert.equal(match.planMatch('queue', 3, POOL, { matchNo: 5, async: true }).finalAlt, undefined, 'async modes never get a category pick');
});

test('rule sweep: Peek, Freeze, DEAD HEAT outside live rooms, shadow pick, Survey Says and SPEED ROUND are gone from the duel', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '../../src/games/trivia-duel');
  const files = [];
  const walk = (d) => fs.readdirSync(d).forEach((f) => { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (f !== 'party') walk(p); } else if (/\.tsx?$/.test(f)) files.push(p); });
  walk(root);
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const banned of [/peekMode|peekSample|usePeek/, /useFreeze|freezeGranted|FREEZE_AT/, /deadHeatPoints|startDeadHeat|DEAD HEAT!/, /SPEED ROUND|surveySays|shadowPick|calledIt/, /Haptic\.warning\(/]) {
      assert.ok(!banned.test(src), `${path.basename(f)} still has ${banned}`);
    }
    // No em dashes in UI strings, no emoji.
    assert.ok(!/\u2014/.test(src), `em dash in ${path.basename(f)}`);
  }
  assert.equal(sc.peekMode, undefined);
  assert.equal(sc.deadHeatPoints, undefined);
});
test('Relaxed mode: read-lock x1.5, window +4s, grace and horizon x1.5, same points reachable', () => {
  const spec = cfg.QUEUE_ROUNDS.q1;
  const q = { id: 'x', format: 'choice4', prompt: 'Which ride opened first at the park?', choices: ['aaaa', 'bbbb', 'cccc', 'dddd'], correctIndex: 0, difficulty: 'easy', category: 'X', stats: fin.priorStats('easy') };
  const std = match.planRound(spec, q, 0, 9, 'queue');
  const rel = match.planRound(spec, q, 0, 9, 'queue', true);
  assert.equal(rel.readLockMs, Math.round(std.readLockMs * 1.5));
  assert.equal(rel.windowMs, std.windowMs + 4000);
  assert.equal(rel.graceMs, Math.round(std.graceMs * 1.5));
  assert.equal(rel.horizonMs, Math.round(std.horizonMs * 1.5));
  assert.equal(rel.jitterMs, std.jitterMs, 'jitter is seeded, not scaled');
  // A relaxed player at 1.5x the time scores what a standard player scores.
  const t = 2400;
  assert.equal(sc.tickerValue(t * 1.5, rel.graceMs, rel.horizonMs), sc.tickerValue(t, std.graceMs, std.horizonMs));
  const plan = match.planMatch('queue', 77, POOL, { relaxed: true });
  assert.equal(plan.relaxed, true);
  assert.ok(plan.rounds.every((r) => r.windowMs >= 10000));
});

test('Final category pick: the trailing player picks; ties go to the slower locker', () => {
  const t = match.createTally();
  t.me.score = 300; t.opp.score = 500;
  assert.equal(match.finalPicker(t), 'me');
  t.me.score = 600;
  assert.equal(match.finalPicker(t), 'opp');
  t.opp.score = 600;
  t.me.log = [{ choice: 0, lockMs: 1000 }, { choice: 0, lockMs: 2000 }];
  t.opp.log = [{ choice: 0, lockMs: 3000 }, { choice: 0, lockMs: 4000 }];
  assert.equal(match.finalPicker(t), 'opp', 'Fin was slower on average, so he picks');
  assert.equal(match.finCategoryPick(['Park History', 'Ride History'], { 'Park History': [10, 9], 'Ride History': [10, 4] }), 1);
  assert.equal(match.finCategoryPick(['Park History', 'Ride History'], { 'Park History': [10, 3] }), 0, 'unknown counts as 50%');
  assert.equal(match.finCategoryPick(['A', 'B'], {}), 0, 'ties go to the left card');
});

test('Final alternative is a different category and shares no fact with the match', () => {
  let found = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const plan = match.planMatch('queue', seed, POOL, { parkId: 8 });
    const fi = plan.rounds.length - 1;
    if (!plan.finalAlt) continue;
    found++;
    assert.notEqual(plan.finalAlt.question.category, plan.rounds[fi].question.category);
    assert.equal(plan.finalAlt.index, fi);
    assert.equal(plan.finalAlt.spec.type, 'final');
    const ids = plan.rounds.map((r) => r.question.id);
    assert.ok(!ids.includes(plan.finalAlt.question.id));
    const facts = new Set(plan.rounds.flatMap((r) => content.factKeysOf(r.question)));
    assert.ok(content.factKeysOf(plan.finalAlt.question).every((f) => !facts.has(f)), `seed ${seed}`);
  }
  assert.ok(found >= 10, `alternates found for ${found} of 40 seeds`);
  assert.equal(match.planMatch('ride', 3, POOL).finalAlt, undefined, 'ride challenge has no Final');
});

test('seen list: when every item is seen, the least recently played comes back first', () => {
  const pool = [0, 1, 2, 3, 4, 5].map((i) => ({ id: `s${i}`, question: `Seen question ${i}?`, choices: ['a', 'b', 'c', 'd'], correctIndex: 0, difficulty: 'easy' }));
  const spec = [{ ...cfg.QUEUE_ROUNDS.q1, formats: ['choice4'] }];
  const seen = ['s3', 's4', 's5', 's0', 's1', 's2'];
  // Generated formats need facts; with a park that has none the authored LRU decides.
  for (let seed = 1; seed < 20; seed++) {
    const [q] = content.buildDeck(pool, spec, { seed, seen, parkId: 999999 });
    if (q.id.startsWith('s')) assert.ok(['s3', 's4', 's5'].includes(q.id), `seed ${seed} picked ${q.id}`);
  }
});

test('ghost v2 carries its template keys (matches 1-2 replay their short templates); g1 records still decode', () => {
  const plan = match.planMatch('queue', 5, POOL, { matchNo: 2 });
  const t = match.createTally();
  plan.rounds.forEach((r) => match.resolveRound('queue', r, { choice: r.question.correctIndex, lockMs: 1200, buzzMs: r.spec.type === 'buzz' ? 900 : undefined }, null, t));
  const g = match.makeGhost(plan, t, 'Crew', 'blue', 1);
  const wire = match.encodeGhost(g);
  assert.ok(wire.startsWith('g2.'));
  assert.ok(wire.length < 1024);
  const back = match.decodeGhost(wire);
  assert.deepEqual(plain(back.keys), ['q1', 'q2', 'buzz', 'q4']);
  const rebuilt = match.planFromIds('queue', back.seed, back.qids, POOL, 'deckhand', false, back.keys);
  assert.equal(rebuilt.rounds.length, 4);
  assert.equal(match.gradeRun(rebuilt, back.rows).me.score, t.me.score);
  const g1 = match.decodeGhost(`g1.${JSON.stringify([1, 'queue', 'Old', 'blue', 0, 0, 1, ['a'], [[0, 1000, null, null, null, null, null, 0, 0, 640]]])}`);
  assert.equal(g1.v, 1);
  assert.equal(g1.rows[0].lockMs, 1000);
  // A ghost's recorded stake never exceeds what it holds in the replay.
  assert.equal(match.ghostInput({ ...g, rows: [{ choice: 0, lockMs: 1, stake: 900 }] }, 0, 300).stake, 300);
});
test('decisive marks a lead flip or a Final tie-break, never the first points of a match', () => {
  let t = match.createTally();
  let res = match.resolveRound('queue', quickRound(), { choice: 2, lockMs: 500 }, { choice: 0, lockMs: 900 }, t);
  assert.equal(res.decisive, false, 'round 1 from 0-0 is not decisive');
  t = match.createTally();
  t.me.score = 100; t.opp.score = 250;
  res = match.resolveRound('queue', quickRound(), { choice: 2, lockMs: 500 }, { choice: 0, lockMs: 900 }, t);
  assert.equal(res.decisive, true, 'a flip from behind is decisive');
  t = match.createTally();
  t.me.score = 300; t.opp.score = 300;
  res = match.resolveRound('queue', quickRound('final'), { choice: 2, lockMs: 500, stake: 0 }, { choice: 0, lockMs: 900, stake: 0 }, t);
  assert.equal(res.decisive, true, 'breaking a tie in the Final is decisive');
});
