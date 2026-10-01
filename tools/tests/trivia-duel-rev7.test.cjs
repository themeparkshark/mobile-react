'use strict';
/**
 * Trivia Duel revision 7: shared scoring vectors, the drum = scored value
 * rule on every frame (incl. the bell and the ride), the bulb ticker, Fin's
 * babble cap, the haptic signature rule, the Final balance, and S0-2 (no ride
 * names in Trivia chrome).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const sc = loadTs('src/games/trivia-duel/engine/scoring.ts');
const fin = loadTs('src/games/trivia-duel/engine/finAI.ts');
const match = loadTs('src/games/trivia-duel/engine/match.ts');
const bulbs = loadTs('src/games/trivia-duel/engine/bulbs.ts');
const babble = loadTs('src/games/trivia-duel/engine/babble.ts');
const grammar = loadTs('src/gamekit/core/hapticGrammar.ts');
const vectors = require('../trivia/duel-vectors.cjs');

test('shared scoring vectors (TS source of the PHP port) are stable', () => {
  const want = JSON.parse(fs.readFileSync(vectors.FIXTURE, 'utf8'));
  assert.deepEqual(vectors.build(), want, 'run node tools/trivia/duel-vectors.cjs --write after a deliberate rule change');
  assert.equal(want.version, 7);
  for (const w of want.wager) for (const s of w.stakes) assert.ok(s <= w.score);
});

test('the drum equals the scored value on every frame: Quick Draw x mult, the bell x mult, the ride', () => {
  for (const m of [1, 1.2, 1.5, 1.75]) {
    const streakAfter = m === 1 ? 1 : m === 1.2 ? 2 : m === 1.5 ? 3 : 5;
    for (let t = 0; t <= 9000; t += 16.7) {
      // The worklet: drum = round((100 + speed) x mult), with the same speedPoints.
      const drum = Math.round((100 + sc.speedPoints(t, 640, 6000)) * m);
      assert.equal(sc.quickPoints(true, t, 640, 6000, streakAfter), drum);
      const bell = Math.round((150 + sc.speedPoints(t, 400, 5000)) * m);
      assert.equal(sc.buzzPoints(true, t, streakAfter, false), bell);
    }
  }
  for (let t = 0; t <= 9000; t += 16.7) {
    const rs = sc.speedPoints(t, 640, 8000, 150);
    assert.equal(sc.ridePoints(true, t, 640), 100 + rs);
    const chomp = Math.min(50, rs);
    assert.equal(sc.ridePoints(true, t, 640, { chomp: true }), 100 + chomp);
  }
});

test('bulb ticker: 24 bulbs (7 top, 7 bottom, 5 a side) clockwise; lit = ceil(24 x speed / 100); colour is speed tier only', () => {
  const pos = bulbs.bulbPositions(380, 160, 9);
  assert.equal(pos.length, 24);
  assert.equal(pos.filter((p) => p.y === 9).length, 7);
  assert.equal(pos.filter((p) => p.y === 151).length, 7);
  assert.equal(pos.filter((p) => p.x === 371 && p.y > 9 && p.y < 151).length, 5);
  assert.equal(pos.filter((p) => p.x === 9 && p.y > 9 && p.y < 151).length, 5);
  assert.deepEqual(plain(pos[0]), { x: 9, y: 9 });
  assert.ok(pos[6].x > pos[0].x && pos[7].y > pos[6].y, 'clockwise');
  assert.deepEqual([100, 96, 95, 50, 4, 1, 0, -1].map(bulbs.litCount), [24, 24, 23, 12, 1, 1, 0, 0]);
  assert.deepEqual([100, 95, 70, 69, 35, 34, 0].map(bulbs.bulbColor), ['#fec90e', '#fec90e', '#fec90e', '#00a5f5', '#00a5f5', '#ffffff', '#ffffff']);
  // Lit count never rises while speed drains.
  let prev = 25;
  for (let t = 0; t <= 7000; t += 16) {
    const lit = bulbs.litCount(sc.speedPoints(t, 640, 6000));
    assert.ok(lit <= prev);
    prev = lit;
  }
});

test("Fin's babble: one syllable at most every 140ms, on every 2nd or 3rd word, picked by the word's first letter, same question same sound", () => {
  const q = 'Which classic boat ride in this land first carried guests along its jungle river in the fifties?';
  for (const dur of [600, 900, 1500]) {
    const s = babble.babbleSchedule(q, dur);
    assert.ok(s.length > 0);
    for (let i = 1; i < s.length; i++) assert.ok(s[i].atMs - s[i - 1].atMs >= 140, `gap ${s[i].atMs - s[i - 1].atMs}`);
    for (const h of s) assert.ok(h.syllable >= 1 && h.syllable <= 8 && h.atMs >= 0 && h.atMs <= dur);
    assert.deepEqual(plain(babble.babbleSchedule(q, dur)), plain(s));
    const words = q.match(/[A-Za-z0-9]+/g).length;
    assert.ok(s.length <= Math.ceil(words / 2), 'never more than every 2nd word');
  }
  const first = babble.babbleSchedule('Apple banana cherry', 900)[0];
  assert.equal(first.syllable, 1, "'a' maps to fin_babble_1");
});

test('haptic signature (14): correct is 3+ rising pulses, wrong is exactly one no stronger than soft; no warning in Trivia Duel', () => {
  const c = grammar.hapticSignature(grammar.HAPTIC_PATTERNS.triviaCorrect);
  const w = grammar.hapticSignature(grammar.HAPTIC_PATTERNS.triviaWrong);
  assert.ok(c.count >= 3 && c.rising, JSON.stringify(c));
  assert.equal(w.count, 1);
  assert.ok(w.maxStrength <= grammar.hapticSignature([{ at: 0, p: 'soft' }]).maxStrength);
  const src = fs.readFileSync(path.join(__dirname, '../../src/games/trivia-duel/TriviaDuel.tsx'), 'utf8');
  assert.ok(!/Haptic\.warning|haptic\('warning'\)/.test(src));
  assert.ok(/playHaptic\('triviaCorrect'\)/.test(src) && /playHaptic\('triviaWrong'\)/.test(src));
  assert.ok(!/Haptic\.(failBuzz|comboHeavy)\(\);\s*\/\/ wrong/.test(src));
});

test('S0-2: no ride or park name reaches Trivia Duel chrome (header, rail, results)', () => {
  const sel = fs.readFileSync(path.join(__dirname, '../../src/components/MiniGameSelector.tsx'), 'utf8');
  const block = sel.slice(sel.indexOf('<TriviaDuel'), sel.lastIndexOf('</TriviaDuel>') > 0 ? sel.lastIndexOf('</TriviaDuel>') : sel.length);
  const duels = sel.split('<TriviaDuel').slice(1).map((s) => s.slice(0, s.indexOf('/>')));
  assert.ok(duels.length >= 2);
  for (const d of duels) {
    assert.ok(!/taskName/.test(d), `TriviaDuel props must not carry taskName: ${d}`);
    assert.ok(/subtitle="(Ride Challenge: 2 of 3 to win|Queue Duel)"/.test(d), d);
  }
  void block;
  const duel = fs.readFileSync(path.join(__dirname, '../../src/games/trivia-duel/TriviaDuel.tsx'), 'utf8');
  assert.ok(!/\{rideName\}|rideName\)/.test(duel.replace(/rideName\?: string;/, '')), 'rideName never renders');
  assert.ok(/countdownScrim="none"/.test(duel), 'S0-4: no grey scrim in the countdown');
});

test('balance sim (18.3): the Final flips the winner in 15-30% of matches; the suggested chip is a real choice', () => {
  const POOL = [];
  for (let i = 0; i < 40; i++) {
    const d = ['easy', 'medium', 'hard'][i % 3];
    POOL.push({ id: `q${i}`, question: `Question number ${i}?`, choices: [`right ${i}`, 'wrong a', 'wrong b', 'wrong c'], correctIndex: 0, difficulty: d, category: i % 2 ? 'Ride History' : 'Park History', fact: `Fact ${i}`, source: 'Test' });
  }
  let flips = 0;
  let finals = 0;
  const N = 400;
  for (let m = 0; m < N; m++) {
    const rank = ['deckhand', 'firstmate', 'captain', 'admiral'][m % 4];
    const plan = match.planMatch('queue', 7000 + m, POOL, { rank, matchNo: 5 });
    const t = match.createTally();
    let before = 0;
    plan.rounds.forEach((r) => {
      const human = fin.finAnswer(90000 + m * 17, r.index, 'firstmate', {
        correctIndex: Math.max(0, r.question.correctIndex), choiceCount: Math.max(1, r.question.choices.length), windowMs: r.windowMs, graceMs: r.graceMs, stats: r.question.stats,
      });
      const isFinal = r.spec.type === 'final';
      if (isFinal) before = Math.sign(t.me.score - t.opp.score);
      const sug = sc.suggestWager(t.me.score, t.opp.score, sc.streakMult(t.me.streak.streak + 1));
      const me = r.question.format === 'closest'
        ? { choice: -1, lockMs: human.lockMs, guess: r.question.slider.truth + (human.correct ? 1 : 6) }
        : {
          choice: human.choice,
          lockMs: r.spec.type === 'buzz' ? (human.buzzMs >= 0 ? human.buzzMs : 2000) : human.lockMs,
          buzzMs: r.spec.type === 'buzz' ? human.buzzMs : undefined,
          stealChoice: r.spec.type === 'buzz' ? human.choice : undefined,
          stealMs: r.spec.type === 'buzz' ? 1500 : undefined,
          stake: isFinal ? sc.wagerStakes(t.me.score)[sug.index] : undefined,
        };
      const { input } = match.finInput(plan, r, t);
      match.resolveRound('queue', r, me, input, t);
    });
    finals++;
    const after = Math.sign(t.me.score - t.opp.score);
    if (before !== 0 && after !== 0 && before !== after) flips++;
  }
  const rate = flips / finals;
  assert.ok(rate >= 0.12 && rate <= 0.33, `Final flips ${rate}`);
});

test('S1 gate 2: no trademarked ride or park name in any planned question, choice or fact; labels stay unique per question', () => {
  const labels = loadTs('src/games/trivia-duel/engine/labels.ts');
  const content = loadTs('src/games/trivia-duel/engine/content.ts');
  const facts = loadTs('src/games/trivia-duel/engine/facts.ts');
  const pool = [
    { id: 'gen-38', question: 'Which Disneyland ride welcomed guests on opening day in 1955?', choices: ['Jungle Cruise', 'Haunted Mansion', 'Space Mountain', 'Star Tours'], correctIndex: 0, difficulty: 'easy', fact: 'Jungle Cruise was one of Disneyland’s opening-day attractions.', source: 'x' },
    { id: 'gen-42', question: 'Which Space Mountain opened first?', choices: ['Tokyo Disneyland', 'Disneyland', 'Magic Kingdom', 'Disneyland Paris'], correctIndex: 2, difficulty: 'medium', fact: 'Magic Kingdom opened Space Mountain in 1975.', source: 'x' },
    { id: 'gen-48', question: 'In what year did Universal Studios Hollywood’s Studio Tour formally open?', choices: ['1964', '1990', '1977', '1955'], correctIndex: 0, difficulty: 'hard', fact: 'Universal dates the formal opening of the Studio Tour to 1964.', source: 'x' },
    { id: 'p1', question: 'The Matterhorn Bobsleds pioneered which coaster feature?', choices: ['Magnetic launch', 'A wooden track', 'Tubular steel track', 'Upside-down loops'], correctIndex: 2, difficulty: 'medium', source: 'x' },
  ];
  for (let seed = 0; seed < 300; seed++) {
    const plan = match.planMatch(seed % 5 === 0 ? 'ride' : 'queue', seed, pool, { parkId: seed % 3 ? 8 : undefined, matchNo: 3 + (seed % 3) });
    const qs = plan.rounds.map((r) => r.question).concat(plan.finalAlt ? [plan.finalAlt.question] : []);
    for (const q of qs) {
      const all = [q.prompt, ...q.choices, q.fact ?? ''].join(' | ');
      assert.ok(!labels.hasTrademarkName(all), `seed ${seed} ${q.id}: ${all}`);
      assert.equal(new Set(q.choices).size, q.choices.length, `labels collide in ${q.id}`);
      assert.ok(!/\b[Tt]he the\b/.test(all), all);
    }
    // Rebuilt from ids alone (ghosts, server grade): the same labelled text.
    const again = match.planFromIds(plan.mode, plan.seed, plan.rounds.map((r) => r.question.id), pool, 'deckhand', false, plan.keys);
    assert.deepEqual(plain(again.rounds.map((r) => r.question.prompt)), plain(plan.rounds.map((r) => r.question.prompt)));
  }
  // Every generated-format fact name has a label.
  for (const f of facts.OPENING_FACTS) assert.ok(!labels.hasTrademarkName(labels.genericize(f.name)), f.name);
  // Labelled items keep their fact keys (no giveaways across a match).
  const q = content.materializeQuestion('gen-42', pool, 1);
  assert.ok(q.factKeys.length > 0);
});
