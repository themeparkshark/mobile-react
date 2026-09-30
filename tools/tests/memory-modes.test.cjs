'use strict';
/**
 * Memory Match v1c/v3 modes: Daily Deck rules (day key, deck of the day,
 * streak and freeze across days, turn ghosts, share grid), the album (foil
 * after 5 recalls, stamps, deck completion) and Pass & Play (turns, go again,
 * forced-new-card rule, ranking).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');
const eq = (a, b, m) => assert.deepEqual(plain(a), plain(b), m);

const D = loadTs('src/games/memory/modes/daily.ts');
const A = loadTs('src/games/memory/modes/album.ts');
const P = loadTs('src/games/memory/modes/passPlay.ts');
const L = loadTs('src/games/memory/logic.ts');
const E = loadTs('src/games/memory/engine.ts');

// ----------------------------------------------------------------- Daily ---

test('day key is the local calendar date and day numbers are calendar arithmetic', () => {
  assert.equal(D.dayKey(new Date(2026, 8, 30, 23, 59)), '2026-09-30');
  assert.equal(D.dayKey(new Date(2026, 9, 1, 0, 1)), '2026-10-01');
  assert.equal(D.dayNumber('2026-10-01') - D.dayNumber('2026-09-30'), 1);
  assert.equal(D.dayNumber('2027-03-01') - D.dayNumber('2027-02-28'), 1);
});

test('deck of the day rotates, and a ride deck always wins in its queue', () => {
  const seen = new Set();
  for (let i = 0; i < 8; i++) seen.add(D.dailyDeckId(`2026-10-${String(i + 1).padStart(2, '0')}`));
  assert.equal(seen.size, 8, 'eight days, eight decks');
  assert.equal(D.dailyDeckId('2026-10-01'), D.dailyDeckId('2026-10-01'));
  assert.equal(D.dailyDeckId('2026-10-01', 'space'), 'space');
});

test('everyone gets the same faces today, shuffled differently per player', () => {
  const day = '2026-09-30';
  const faceSeed = D.dailyFaceSeed(day, 'park');
  const a = L.buildLayout({ pairs: 8, deckSize: 10, seed: D.dailyLayoutSeed(day, 'maya'), golden: true, faceSeed });
  const b = L.buildLayout({ pairs: 8, deckSize: 10, seed: D.dailyLayoutSeed(day, 'jake'), golden: true, faceSeed });
  eq([...a.deckFaces].sort(), [...b.deckFaces].sort());
  assert.notDeepEqual(plain(a.faces), plain(b.faces));
  const tomorrow = L.buildLayout({ pairs: 8, deckSize: 10, seed: D.dailyLayoutSeed(day, 'maya'), golden: true, faceSeed: D.dailyFaceSeed('2026-10-01', 'park') });
  assert.ok(tomorrow.faces.length === 16);
  // Without faceSeed the old behaviour is untouched (golden vectors depend on it).
  const old = L.buildLayout({ pairs: 8, deckSize: 10, seed: 42, golden: true });
  const same = L.buildLayout({ pairs: 8, deckSize: 10, seed: 42, golden: true });
  eq((old), plain(same));
});

test('streak: consecutive days grow, a gap resets, a freeze covers one missed day', () => {
  let st = D.EMPTY_STREAK;
  const days = [];
  for (let i = 1; i <= 7; i++) days.push(`2026-10-${String(i).padStart(2, '0')}`);
  let earned = false;
  for (const d of days) { const r = D.applyRankedDay(st, d); st = r.state; earned = earned || r.earnedFreeze; }
  assert.equal(st.streak, 7);
  assert.ok(earned, 'a freeze is earned at 7');
  assert.equal(st.freezes, 1);
  // Same day twice never double counts.
  assert.equal(D.applyRankedDay(st, '2026-10-07').state.streak, 7);
  // Skip the 8th: the freeze covers it.
  assert.equal(D.liveStreak(st, '2026-10-09'), 7);
  const r = D.applyRankedDay(st, '2026-10-09');
  assert.ok(r.usedFreeze);
  assert.equal(r.state.streak, 8);
  assert.equal(r.state.freezes, 0);
  // A two day gap with no freeze resets.
  assert.equal(D.liveStreak(r.state, '2026-10-12'), 0);
  const reset = D.applyRankedDay(r.state, '2026-10-12');
  assert.equal(reset.state.streak, 1);
  assert.equal(reset.state.best, 8);
  // Freezes never stack past 1.
  let s2 = { last: null, streak: 0, best: 0, freezes: 1 };
  for (let i = 1; i <= 14; i++) s2 = D.applyRankedDay(s2, `2026-11-${String(i).padStart(2, '0')}`).state;
  assert.equal(s2.freezes, 1);
});

test('turn ghosts: pairs after k turns and a signed delta chip', () => {
  const g = D.parGhost(8);
  assert.equal(g.verdicts.length, E.parFor(8));
  assert.equal(D.pairsAfter(g.verdicts, g.verdicts.length), 8);
  assert.equal(D.turnsToPairs(g.verdicts, 8), E.parFor(8));
  // I hold 3 pairs after 4 turns: the par shark needed more, so I lead.
  const lead = D.ghostDelta(g.verdicts, 4, 3);
  assert.ok(lead > 0);
  assert.match(D.ghostDeltaLabel(lead, 'PAR'), /^\+\d+ turns? vs PAR$/);
  const behind = D.ghostDelta([1, 1, 1, 1], 6, 3);
  assert.equal(behind, -3);
  assert.equal(D.ghostDeltaLabel(-1, 'Jake'), '-1 turn vs Jake');
  assert.equal(D.ghostDeltaLabel(0, 'Jake'), 'Even with Jake');
  assert.equal(D.ghostDelta(g.verdicts, 1, 0), null);
});

test('share grid: one cell per turn, coloured and shaped by verdict', () => {
  const rows = D.shareRows([0, 1, 2, 3, 4, 0, 0, 0, 1], 8);
  assert.equal(rows.length, 2);
  eq(rows[0].slice(0, 5), ['recall', 'lucky', 'scout', 'slip', 'gull']);
  eq(rows[1], ['lucky']);
});

test('ride stamps land only on at-or-under-par clears of a ride deck', () => {
  assert.equal(D.earnsStamp(true, 13, 8, 'coaster'), true);
  assert.equal(D.earnsStamp(true, 14, 8, 'coaster'), false);
  assert.equal(D.earnsStamp(false, 10, 8, 'coaster'), false);
  assert.equal(D.earnsStamp(true, 10, 8, null), false);
});

// ----------------------------------------------------------------- Album ---

test('album: new cards, foil after 5 recalls (lucky matches never foil), deck completion', () => {
  let al = A.emptyAlbum();
  let d = A.recordRun(al, 'park', 3, [{ face: 0, recall: false }, { face: 1, recall: true }, { face: 900, recall: true }], false);
  eq(d.newCards, [0, 1]);
  assert.equal(A.collected(d.album.decks.park, 3), 2);
  al = d.album;
  for (let i = 0; i < 10; i++) al = A.recordRun(al, 'park', 3, [{ face: 0, recall: false }], false).album;
  assert.equal(A.foils(al.decks.park, 3), 0, 'lucky matches never foil');
  for (let i = 0; i < 3; i++) al = A.recordRun(al, 'park', 3, [{ face: 1, recall: true }], false).album;
  d = A.recordRun(al, 'park', 3, [{ face: 1, recall: true }], false);
  eq(d.newFoils, [1], 'the 5th recall gilds the face');
  assert.equal(A.recordRun(d.album, 'park', 3, [{ face: 1, recall: true }], false).newFoils.length, 0, 'only once');
  al = d.album;
  for (let i = 0; i < 4; i++) al = A.recordRun(al, 'park', 3, [{ face: 0, recall: true }, { face: 2, recall: true }], false).album;
  d = A.recordRun(al, 'park', 3, [{ face: 0, recall: true }, { face: 2, recall: true }], true);
  assert.equal(d.foilDeckDone, true);
  assert.equal(d.newPerfect, true);
  assert.equal(A.foilDeckComplete(d.album.decks.park, 3), true);
  // The input album is never mutated.
  assert.equal(A.collected(A.emptyAlbum().decks.park, 3), 0);
});

test('album: near-foil tick, stamps once per ride, safe parse', () => {
  let al = A.emptyAlbum();
  for (let i = 0; i < 4; i++) al = A.recordRun(al, 'ocean', 10, [{ face: 3, recall: true }], false).album;
  eq(A.recordRun(al, 'ocean', 10, [], false).nearFoil, [3]);
  const s1 = A.stampRide(al, 'coaster', { day: '2026-09-30', deck: 'park', label: 'Theme Park' });
  assert.ok(s1.isNew);
  const s2 = A.stampRide(s1.album, 'coaster', { day: '2026-10-01', deck: 'park', label: 'Theme Park' });
  assert.equal(s2.isNew, false);
  assert.equal(s2.album.stamps.coaster.day, '2026-09-30');
  eq((A.parseAlbum('not json')), plain(A.emptyAlbum()));
  eq((A.parseAlbum(JSON.stringify(s2.album))), plain(s2.album));
  assert.equal(A.rideKeyFor('Space Mountain!'), 'space-mountain');
});

// ------------------------------------------------------------- Pass&Play ---

// Layout: faces by slot. Pairs: 0@(0,1) 1@(2,3) 2@(4,5) 3@(6,7)
const FACES = [0, 0, 1, 1, 2, 2, 3, 3];

test('pass and play: a match goes again, a miss holds then passes the phone', () => {
  const s = P.createPassPlay(FACES, 2);
  let r = P.ppFlip(s, 0);
  r = P.ppFlip(s, 1);
  assert.ok(r.events.some((e) => e.k === 'match' && e.player === 0));
  assert.equal(s.current, 0, 'match = go again');
  P.ppFlip(s, 2);
  r = P.ppFlip(s, 4);
  assert.ok(r.events.some((e) => e.k === 'miss'));
  assert.equal(s.phase, 2);
  const ev = P.ppDismiss(s);
  eq(ev.map((e) => e.k), ['hide', 'pass']);
  assert.equal(s.current, 1);
  // Tapping during a hold resolves it and spends the tap.
  P.ppFlip(s, 3);
  P.ppFlip(s, 6);
  assert.equal(s.phase, 2);
  const t = P.ppFlip(s, 7);
  assert.ok(t.events.some((e) => e.k === 'pass'));
  assert.equal(s.phase, 0);
  assert.equal(s.current, 0);
});

test('pass and play: forced-new-card rule blocks other known cards, allows partner or unseen', () => {
  const s = P.createPassPlay(FACES, 2);
  // P1 flips 0 and 2 (miss): both now table-known.
  P.ppFlip(s, 0); P.ppFlip(s, 2); P.ppDismiss(s);
  // P2 opens with known card 2 (partner 3 unseen). Unseen cards remain.
  const r = P.ppFlip(s, 2);
  assert.ok(r.allowed.length > 0);
  assert.ok(r.events.some((e) => e.k === 'rule'), 'shown the first time');
  assert.ok(r.allowed.indexOf(0) < 0, 'other known card is locked');
  assert.ok(r.allowed.indexOf(3) >= 0 && r.allowed.indexOf(7) >= 0);
  const blocked = P.ppFlip(s, 0);
  assert.equal(blocked.events[0].k, 'blocked');
  assert.equal(s.phase, 1, 'blocked tap spends nothing');
  const ok = P.ppFlip(s, 3);
  assert.ok(ok.events.some((e) => e.k === 'match'));
  // Opening with an unseen card never triggers the rule.
  const s2 = P.createPassPlay(FACES, 3);
  eq(P.ppFlip(s2, 5).allowed, []);
});

test('pass and play: the rule lets you take a known partner, and ends with a shared-tie ranking', () => {
  const s = P.createPassPlay(FACES, 2);
  P.ppFlip(s, 0); P.ppFlip(s, 2); P.ppDismiss(s); // P1 sees 0 and 2
  P.ppFlip(s, 1); P.ppFlip(s, 3); P.ppDismiss(s); // P2 sees 1 and 3
  // P1 opens known 0; its partner 1 is table-known: allowed.
  const r = P.ppFlip(s, 0);
  assert.ok(r.allowed.indexOf(1) >= 0);
  const m = P.ppFlip(s, 1);
  const me = m.events.find((e) => e.k === 'match');
  assert.equal(me.recall, false, 'P1 never flipped slot 1 itself');
  P.ppFlip(s, 2); P.ppFlip(s, 3); // P1 knows 2, 3 is table-known: match, recall false (P2 flipped it)
  P.ppFlip(s, 4); P.ppFlip(s, 6); P.ppDismiss(s);
  P.ppFlip(s, 5); const end1 = P.ppFlip(s, 4);
  assert.ok(end1.events.some((e) => e.k === 'match' && e.player === 1 && e.recall === false));
  P.ppFlip(s, 6); const end = P.ppFlip(s, 7);
  const over = end.events.find((e) => e.k === 'over');
  assert.ok(over);
  assert.equal(s.phase, 3);
  eq((over.ranking), [[0, 1]], "a tie shares first place");
  assert.equal(s.players[0].pairs + s.players[1].pairs, 4);
});
