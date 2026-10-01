'use strict';
/**
 * Steal Duel (design v8 4.6): 4000ms turn ring with auto-flip, forced-new-card,
 * no slip verdicts, the streak multiplier, STEAL (+50 and the rival's streak),
 * Sudden Death on a tie, replay, and the house shark only seeing public reveals.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const D = loadTs('src/games/memory/modes/stealDuel.ts');
const PAIRED = (n) => Array.from({ length: n }, (_, i) => Math.floor(i / 2));
const kinds = (ev) => ev.map((e) => e.k);

test('turns: a match goes again on a fresh ring, a miss holds 1500ms then passes', () => {
  const s = D.createStealDuel(PAIRED(16), 1, 0, 0);
  D.sdFlip(s, 0, 0, 500);
  let ev = D.sdFlip(s, 0, 1, 900);
  assert.ok(kinds(ev).includes('match'));
  assert.equal(s.current, 0);
  assert.equal(s.deadline, 900 + D.TURN_RING_MS);
  D.sdFlip(s, 0, 2, 1200);
  ev = D.sdFlip(s, 0, 4, 1400);
  assert.ok(kinds(ev).includes('miss'));
  assert.equal(D.sdTick(s, 2899).length, 0, 'held for everyone to see');
  ev = D.sdTick(s, 2900);
  assert.deepEqual(plain(kinds(ev)), ['hide', 'pass']);
  assert.equal(s.current, 1);
  assert.equal(D.sdFlip(s, 0, 6, 3000).length, 0, 'off-turn flips are ignored');
});

test('ring: when 4000ms (+500 grace) run out, the server flips the remaining card(s) among unseen ones', () => {
  const s = D.createStealDuel(PAIRED(16), 7, 0, 0);
  const ev = D.sdTick(s, D.TURN_RING_MS + D.RING_GRACE_MS);
  const flips = ev.filter((e) => e.k === 'flip');
  assert.equal(flips.length, 2);
  assert.ok(flips.every((f) => f.auto));
  assert.equal(s.players[0].autoFlips, 2);
  const t = D.createStealDuel(PAIRED(16), 7, 0, 0);
  D.sdFlip(t, 0, 3, 1000);
  assert.equal(D.sdTick(t, D.TURN_RING_MS + D.RING_GRACE_MS - 1).length, 0, 'the ring runs from the turn start, not per flip');
  const ev2 = D.sdTick(t, D.TURN_RING_MS + D.RING_GRACE_MS);
  assert.equal(ev2.filter((e) => e.k === 'flip' && e.auto).length, 1, 'only the missing second card is auto-flipped');
});

test('ring: a stalled second flip is auto-flipped too (no stalling, ever)', () => {
  const s = D.createStealDuel(PAIRED(16), 9, 0, 0);
  D.sdFlip(s, 0, 0, 100);
  const ev = D.sdTick(s, 4500);
  const flips = ev.filter((e) => e.k === 'flip');
  assert.equal(flips.length, 1);
  assert.equal(flips[0].auto, true);
  assert.ok(ev.some((e) => e.k === 'match' || e.k === 'miss'));
});

test('forced-new-card: a table-known first card allows only its known partner or an unseen card', () => {
  const s = D.createStealDuel(PAIRED(16), 1, 0, 0);
  D.sdFlip(s, 0, 0, 100); D.sdFlip(s, 0, 2, 200); D.sdTick(s, 1800); // P0 miss: 0, 2 seen
  D.sdFlip(s, 1, 4, 1900); D.sdFlip(s, 1, 6, 2000); D.sdTick(s, 3600); // P1 miss: 4, 6 seen
  D.sdFlip(s, 0, 2, 3700); // known card (face 1), partner 3 unseen
  const blocked = D.sdFlip(s, 0, 4, 3800);
  assert.deepEqual(plain(kinds(blocked)), ['blocked'], 'another known card is refused');
  assert.ok(D.sdFlip(s, 0, 8, 3900).some((e) => e.k === 'miss'), 'an unseen card is fine');
});

test('no slip verdicts: a miss on a known card is just a miss, and the streak only resets on a matchless turn', () => {
  const s = D.createStealDuel(PAIRED(16), 1, 0, 0);
  D.sdFlip(s, 0, 0, 100); D.sdFlip(s, 0, 1, 200); // match: streak 1
  D.sdFlip(s, 0, 2, 300); D.sdFlip(s, 0, 4, 400); // miss in the same turn: streak holds
  assert.equal(s.players[0].streak, 1);
  D.sdTick(s, 2000);
  assert.equal(s.players[0].streak, 1, 'the turn had a match');
  D.sdFlip(s, 1, 6, 2100); D.sdFlip(s, 1, 8, 2200); D.sdTick(s, 3800);
  D.sdFlip(s, 0, 10, 3900); const ev = D.sdFlip(s, 0, 12, 4000); D.sdTick(s, 5600);
  assert.ok(ev.every((e) => e.k !== 'slip'));
  assert.equal(s.players[0].streak, 0, 'a turn with no match resets it');
});

test('streak multiplier: 100 at streak 1, 150 at 2, 200 at 3+', () => {
  assert.deepEqual([1, 2, 3, 5].map((k) => D.pairValue(k, false)), [100, 150, 200, 200]);
  assert.equal(D.pairValue(2, true), 200);
  const s = D.createStealDuel(PAIRED(16), 1, 0, 0);
  let t = 0;
  const turn = (who, a, b) => { D.sdTick(s, (t += 100)); D.sdFlip(s, who, a, (t += 100)); return D.sdFlip(s, who, b, (t += 100)); };
  turn(0, 0, 1); // streak 1, 100
  turn(0, 2, 4); D.sdTick(s, (t += 2000)); // miss, pass
  turn(1, 6, 8); D.sdTick(s, (t += 2000)); // P1 miss
  const m = turn(0, 10, 11).find((e) => e.k === 'match'); // streak 2
  assert.equal(m.value, 150);
});

test('STEAL: matching a pair your rival revealed pays +50 and takes their streak', () => {
  const s = D.createStealDuel(PAIRED(16), 1, 0, 0);
  let t = 0;
  // P0 builds a streak of 1, then misses revealing 2 and 4.
  D.sdFlip(s, 0, 0, (t += 100)); D.sdFlip(s, 0, 1, (t += 100));
  D.sdFlip(s, 0, 2, (t += 100)); D.sdFlip(s, 0, 4, (t += 100)); D.sdTick(s, (t += 1600));
  assert.equal(s.players[0].streak, 1);
  // P1 flips 3 (new) then 2, which P0 revealed: a steal.
  D.sdFlip(s, 1, 3, (t += 100));
  const m = D.sdFlip(s, 1, 2, (t += 100)).find((e) => e.k === 'match');
  assert.equal(m.steal, true);
  assert.equal(m.took, 1);
  assert.equal(s.players[1].streak, 2, 'mine (1) + theirs (1)');
  assert.equal(s.players[0].streak, 0);
  assert.equal(m.value, 150 + D.STEAL_BONUS);
  assert.equal(s.players[1].steals, 1);
});

test('end: most points wins; an exact tie goes to Sudden Death where the next match wins', () => {
  const s = D.createStealDuel(PAIRED(4), 3, 0, 0);
  let t = 0;
  D.sdFlip(s, 0, 0, (t += 100)); D.sdFlip(s, 0, 2, (t += 100)); D.sdTick(s, (t += 1600)); // P0 miss
  D.sdFlip(s, 1, 0, (t += 100)); D.sdFlip(s, 1, 1, (t += 100)); // P1 match 0 (P0 revealed 0): steal 150
  D.sdFlip(s, 1, 3, (t += 100)); const end = D.sdFlip(s, 1, 2, (t += 100)); // steal again
  const over = end.find((e) => e.k === 'over');
  assert.equal(over.winner, 1);
  const tie = D.createStealDuel([0, 1, 0, 1], 5, 0, 0);
  t = 0;
  D.sdFlip(tie, 0, 0, (t += 100)); D.sdFlip(tie, 0, 2, (t += 100)); // P0 match 100
  D.sdFlip(tie, 0, 1, (t += 100)); D.sdFlip(tie, 0, 3, (t += 100)); // streak still 1 this turn: 100 -> 200 total
  assert.equal(tie.phase, 3);
  const evenS = D.createStealDuel([0, 1, 1, 0], 5, 0, 0);
  t = 0;
  D.sdFlip(evenS, 0, 0, (t += 100)); D.sdFlip(evenS, 0, 3, (t += 100)); // P0 100
  D.sdFlip(evenS, 0, 1, (t += 100)); D.sdFlip(evenS, 0, 2, (t += 100)); // P0 another 100
  assert.equal(evenS.winner, 0);
  // Build a true tie by hand: equal points at the end.
  const sd = D.createStealDuel([0, 0, 1, 1], 9, 0, 0);
  t = 0;
  D.sdFlip(sd, 0, 0, (t += 100)); D.sdFlip(sd, 0, 2, (t += 100)); D.sdTick(sd, (t += 1600)); // P0 miss: 0,2 seen
  D.sdFlip(sd, 1, 1, (t += 100)); D.sdFlip(sd, 1, 3, (t += 100)); D.sdTick(sd, (t += 1600)); // P1 miss
  D.sdFlip(sd, 0, 0, (t += 100)); const tm = D.sdFlip(sd, 0, 1, (t += 100)); // P0: 0+1, 1 revealed by P1: steal 150
  assert.ok(tm.some((e) => e.k === 'match'));
  D.sdFlip(sd, 0, 2, (t += 100)); const last = D.sdFlip(sd, 0, 3, (t += 100));
  assert.ok(last.some((e) => e.k === 'over'));
});

test('Sudden Death: a tie deals 4 cards from the deck and the next match ends it', () => {
  const s = D.createStealDuel([0, 1, 0, 1], 11, 0, 0);
  s.players[1].points = 200; // pretend P1 already has 200
  let t = 0;
  D.sdFlip(s, 0, 0, (t += 100)); D.sdFlip(s, 0, 2, (t += 100)); // 100
  const ev = [...D.sdFlip(s, 0, 1, (t += 100)), ...D.sdFlip(s, 0, 3, (t += 100))]; // 200 -> tie
  const sd = ev.find((e) => e.k === 'suddenDeath');
  assert.ok(sd, 'tie triggers Sudden Death');
  assert.equal(s.n, 4);
  assert.ok(s.faces.every((f) => f === 0 || f === 1), 'faces come from the deck in play');
  assert.equal(s.current, 1);
  // P1 matches first: wins.
  const a = s.faces.indexOf(s.faces[0]);
  const b = s.faces.lastIndexOf(s.faces[0]);
  D.sdFlip(s, 1, a, (t += 100));
  const end = D.sdFlip(s, 1, b, (t += 100)).find((e) => e.k === 'over');
  assert.equal(end.winner, 1);
});

test('replay: the flip log (with auto-flips) replays to the same duel', () => {
  const faces = [3, 1, 4, 1, 5, 9, 2, 6, 3, 4, 5, 9, 2, 6, 7, 7];
  const s = D.createStealDuel(faces, 42, 1, 0);
  let t = 0;
  let r = 1;
  const rng = () => { r = (r * 1103515245 + 12345) >>> 0; return r / 4294967296; };
  for (let g = 0; g < 300 && s.phase !== 3; g++) {
    t += 400 + Math.floor(rng() * 1500);
    if (s.phase === 2) { D.sdDismiss(s, s.current, t); continue; }
    if (rng() < 0.08) { t += 4600; D.sdTick(s, t); continue; } // a stall: the ring auto-flips
    D.sdFlip(s, s.current, D.sdBotPick(s, 0.7, rng), t);
  }
  assert.equal(s.phase, 3);
  const re = D.sdReplay(faces, 42, 1, plain(s.log));
  assert.deepEqual(plain(re.players), plain(s.players));
  assert.equal(re.winner, s.winner);
});

test('the house shark plays only from public reveals and respects the forced rule', () => {
  const s = D.createStealDuel(PAIRED(16), 1, 1, 0);
  let r = 3;
  const rng = () => { r = (r * 1103515245 + 12345) >>> 0; return r / 4294967296; };
  const first = D.sdBotPick(s, 1, rng);
  assert.ok(first >= 0 && first < 16);
  D.sdFlip(s, 1, 0, 100); D.sdFlip(s, 1, 2, 200); D.sdTick(s, 1800);
  D.sdFlip(s, 0, 1, 1900); D.sdFlip(s, 0, 4, 2000); D.sdTick(s, 3600); // P0 revealed 1 (partner of 0)
  // House shark knows 0 and 1 are a pair (public): with recall 1 it cashes them.
  const a = D.sdBotPick(s, 1, rng);
  D.sdFlip(s, 1, a, 3700);
  const b = D.sdBotPick(s, 1, rng);
  const ev = D.sdFlip(s, 1, b, 3800);
  assert.ok(ev.some((e) => e.k === 'match' && e.steal), 'it steals the pair the human revealed');
});
