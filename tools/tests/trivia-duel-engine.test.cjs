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

test('read-lock clamps per mode family', () => {
  assert.equal(sc.readLockMs(10, 'ride'), 900);
  assert.equal(sc.readLockMs(200, 'ride'), 2400);
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

test('buzz: correct 150 + speed, wrong -75 (0 with Shield), steal 100 + steal speed', () => {
  assert.equal(sc.buzzPoints(true, 500, 780, 1, false), 250);
  assert.equal(sc.buzzPoints(true, 500, 780, 5, false), Math.round(250 * 1.75), 'buzz max 437');
  assert.equal(sc.buzzPoints(false, 500, 780, 1, false), -75);
  assert.equal(sc.buzzPoints(false, 500, 780, 1, true), 0);
  assert.equal(sc.stealPoints(true, 200), 200);
  assert.equal(sc.stealPoints(true, 3000), 100);
  assert.equal(sc.stealPoints(false, 200), 0);
  assert.deepEqual(plain(sc.buzzOrder(1000, 1020, 0.2)), { first: 'a', photoFinish: true });
  assert.deepEqual(plain(sc.buzzOrder(1000, 1020, 0.7)), { first: 'b', photoFinish: true });
  assert.deepEqual(plain(sc.buzzOrder(1100, 1000, 0.2)), { first: 'b', photoFinish: false });
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

test('wager stakes: percents, fixed stakes under 200, floor at 0', () => {
  assert.deepEqual(plain(sc.wagerStakes(800)), [0, 200, 400, 800]);
  assert.deepEqual(plain(sc.wagerStakes(150)), [0, 50, 100, 200]);
  assert.equal(sc.applyFinal(800, true, 250, 400), 1450);
  assert.equal(sc.applyFinal(800, false, 0, 400), 400);
  assert.equal(sc.applyFinal(150, false, 0, 200), 0, 'score floor 0');
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

test('streak: ignite at 3 grants a Shield, Shield absorbs one miss, Freeze at 2', () => {
  const s = sc.createStreak();
  assert.equal(sc.applyStreak(s, true).freezeGranted, false);
  assert.equal(sc.applyStreak(s, true).freezeGranted, true);
  const ig = sc.applyStreak(s, true);
  assert.equal(ig.ignited, true);
  assert.equal(ig.shieldGranted, true);
  const absorbed = sc.applyStreak(s, false);
  assert.equal(absorbed.shieldUsed, true);
  assert.equal(absorbed.streak, 3);
  const broke = sc.applyStreak(s, false);
  assert.equal(broke.broke, true);
  assert.equal(broke.streak, 0);
  assert.equal(s.best, 3);
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

test('Fin AI is seeded: same seed and round give the same answer', () => {
  const q = { correctIndex: 1, choiceCount: 4, windowMs: 12000, graceMs: 600, stats: fin.priorStats('medium') };
  assert.deepEqual(plain(fin.finAnswer(77, 2, 'captain', q)), plain(fin.finAnswer(77, 2, 'captain', q)));
  const a = fin.finAnswer(77, 2, 'captain', q);
  assert.ok(a.lockMs >= 800 && a.lockMs <= 11400);
  assert.ok(a.buzzMs <= a.lockMs);
});

test('Fin wager policy: lead 200+ = 25%, close = 50%, trailing = ALL IN (Captain has no noise)', () => {
  assert.equal(fin.finWagerIndex(5, 'captain', 900, 600), 1);
  assert.equal(fin.finWagerIndex(5, 'captain', 700, 600), 2);
  assert.equal(fin.finWagerIndex(5, 'captain', 300, 600), 3);
  for (let s = 0; s < 50; s++) {
    const i = fin.finWagerIndex(s, 'deckhand', 700, 600);
    assert.ok(i >= 1 && i <= 3);
  }
});

test('Fin rank ladder: promote after N wins, demote after 3 straight losses', () => {
  const st = fin.createRankState('deckhand');
  fin.applyMatchToRank(st, true);
  assert.equal(fin.applyMatchToRank(st, true).promoted, true);
  assert.equal(st.rank, 'firstmate');
  fin.applyMatchToRank(st, false); fin.applyMatchToRank(st, false);
  assert.equal(fin.applyMatchToRank(st, false).demoted, true);
  assert.equal(st.rank, 'deckhand');
  for (const k of Object.keys(fin.BARKS)) for (const b of fin.BARKS[k]) assert.ok(b.length <= 32, b);
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
  const years = new Map(OPENING_FACTS.map((f) => [f.name, f.year]));
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
      if (q.format === 'truetale') assert.ok(q.prompt.length <= 60, q.prompt);
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

test('resolveRound: buzz wrong -75 hands the steal; steal scores 100 + speed', () => {
  const t = match.createTally();
  t.me.score = 300;
  const r = quickRound('buzz');
  const res = match.resolveRound('queue', r, { choice: 1, lockMs: 900, buzzMs: 900 }, { choice: 2, lockMs: -1, buzzMs: 2000, stealChoice: 2, stealMs: 200 }, t);
  assert.equal(res.buzz.first, 'me');
  assert.equal(res.buzz.steal, true);
  assert.equal(res.me.points, -75);
  assert.equal(res.opp.points, 200);
  assert.equal(t.me.score, 225);
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
  const rebuilt = match.planFromIds('queue', back.seed, back.qids, POOL);
  assert.deepEqual(plain(rebuilt.rounds.map((r) => r.question)), plain(plan.rounds.map((r) => r.question)));
  const regraded = match.gradeRun(rebuilt, back.rows);
  assert.equal(regraded.me.score, t.me.score);
  assert.equal(match.decodeGhost('nope'), null);
});

test('Fin input for a buzz steal never picks the crumbled tile', () => {
  const plan = match.planMatch('queue', 7, POOL, { rank: 'deckhand' });
  const bi = plan.rounds.findIndex((r) => r.spec.type === 'buzz');
  for (let s = 0; s < 100; s++) {
    const p = { ...plan, seed: s };
    const wrong = (p.rounds[bi].question.correctIndex + 1) % 4;
    const { input } = match.finInput(p, p.rounds[bi], match.createTally(), wrong);
    assert.notEqual(input.stealChoice, wrong);
    assert.ok(input.stealMs > 0 && input.stealMs < 3500);
  }
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
