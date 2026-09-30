'use strict';
/**
 * Boss Brawl Strike Team + ghost races: Lure rotation, Team Surge, Sync
 * Strike, Ally Opening delivery / settlement matching, duel tug-of-war, the
 * house-crew fill and ghost timelines.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');

const team = loadTs('src/games/boss/multiplayer/strikeTeam.ts');
const crew = loadTs('src/games/boss/multiplayer/crew.ts');
const enc = loadTs('src/games/boss/sim/encounter.ts');
const C = loadTs('src/games/boss/sim/constants.ts');
const bots = loadTs('src/games/boss/sim/bots.ts');
const round = loadTs('src/games/boss/sim/round.ts');

test('Lure rotates by seeded join order among players in a bout; solo players are Strikers', () => {
  const mates = [{ id: 'a', order: 2 }, { id: 'b', order: 1 }, { id: 'c', order: 3 }];
  assert.equal(team.lureFor(7, 0, [mates[0]]), null);
  const lures = [0, 1, 2].map((n) => team.lureFor(7, n, mates));
  lures.forEach((l) => assert.ok(['a', 'b', 'c'].includes(l)));
  assert.equal(team.lureFor(7, 1, mates), team.lureFor(7, 1, [...mates].reverse()), 'order-independent input');
});

test('Team Surge: 6 PERFECT pips inside 20 s fill it; old pips expire', () => {
  const m = team.createSurge();
  for (let i = 0; i < 5; i++) assert.equal(team.surgePip(m, i * 1000), false);
  assert.equal(team.surgePip(m, 5000), true);
  assert.equal(team.surgeLevel(m, 5000), 0);
  const m2 = team.createSurge();
  for (let i = 0; i < 5; i++) team.surgePip(m2, i * 1000);
  assert.equal(team.surgePip(m2, 25000), false, 'the first pips expired');
});

test('Sync Strike: overlapping Break windows or starts within 3 s, each with a crit', () => {
  const s = team.syncStrikes([
    { player: 'a', start: 1000, end: 4000, crits: 2 },
    { player: 'b', start: 3500, end: 6000, crits: 1 },
    { player: 'c', start: 20000, end: 23000, crits: 3 },
    { player: 'd', start: 3900, end: 6900, crits: 0 },
  ]);
  assert.deepEqual([...s].sort(), ['a', 'b']);
  assert.equal(team.syncStrikes([{ player: 'a', start: 0, end: 100, crits: 1 }, { player: 'b', start: 2900, end: 3000, crits: 1 }]).size, 2);
  assert.equal(team.syncStrikes([{ player: 'a', start: 0, end: 100, crits: 1 }, { player: 'b', start: 3200, end: 3300, crits: 1 }]).size, 0);
});

test('Ally Openings: max one pending per receiver; server credits only when matched to the Lure PERFECT', () => {
  const pending = new Map();
  assert.equal(team.deliverAlly(pending, 'x', 10), true);
  assert.equal(team.deliverAlly(pending, 'x', 20), false);
  assert.equal(team.allyOpeningMatches([10000], 15000), true);
  assert.equal(team.allyOpeningMatches([10000], 23900), true);
  assert.equal(team.allyOpeningMatches([10000], 24100), false);
  assert.equal(team.allyOpeningMatches([], 15000), false);
});

test('sim: an Ally Opening only exists in team play, arrives at the next recover and pays x1.25', () => {
  const run = (teamOn) => {
    const b = enc.createBout({ boss: 'kraken', seed: 77, bout: 0, team: teamOn });
    enc.advance(b, b.nextAt);
    const a = b.attack;
    enc.input(b, { t: a.T + 10, k: C.IN_ALLY });
    enc.input(b, { t: a.steps[0].I, k: C.IN_TARGET, a: a.steps[0].lane });
    enc.advance(b, b.opening.end + 1);
    enc.advance(b, b.nextAt);
    return b;
  };
  const solo = run(false);
  const duo = run(true);
  assert.ok(!solo.events.some((e) => e.code === enc.E_ALLY_ARRIVE));
  assert.ok(duo.events.some((e) => e.code === enc.E_ALLY_ARRIVE));
  assert.equal(duo.opening.kind, 2);
  assert.equal(duo.opening.mult, C.MULT.ally);
  const r = duo.opening.rings[0];
  enc.input(duo, { t: r, k: C.IN_PAD_DOWN });
  const crit = duo.events[duo.events.length - 1];
  assert.equal(crit.code, enc.E_CRIT);
  assert.equal(crit.v, C.PTS.crit * 100 * 125);
});

test('duel tug-of-war and lead changes', () => {
  assert.equal(team.tugPosition(0, 0), 0);
  assert.ok(team.tugPosition(900, 300) > 0);
  assert.ok(team.tugPosition(300, 900) < 0);
  assert.equal(team.leadChanged(100, 50, 100, 150), true);
  assert.equal(team.leadChanged(100, 50, 200, 150), false);
});

test('house crew: deterministic per team seed, joined apart, emits lunges, PERFECTs, Break windows and bout starts', () => {
  const a = new crew.HouseCrew('kraken', 1234, 2);
  const b = new crew.HouseCrew('kraken', 1234, 2);
  const ea = a.drain(10 * 60 * 1000);
  const eb = b.drain(10 * 60 * 1000);
  assert.equal(JSON.stringify(ea), JSON.stringify(eb));
  const kinds = new Set(ea.map((e) => e.kind));
  for (const k of [crew.CREW_LUNGE, crew.CREW_PERFECT, crew.CREW_BOUT]) assert.ok(kinds.has(k));
  const starts = ea.filter((e) => e.kind === crew.CREW_BOUT && e.a === 0).map((e) => e.at);
  assert.equal(starts.length, 2);
  assert.notEqual(starts[0], starts[1]);
  assert.equal(a.roster().length, 3);
  // Events drain in wall order and never twice.
  assert.equal(a.drain(10 * 60 * 1000).length, 0);
});

test('ghost race: timeline replays a stored round exactly; running delta by bout and time', () => {
  const bs = bots.runBotRound('kraken', 555, bots.BOTS.median);
  const log = { boss: 'kraken', seed: 555, variant: 0, bouts: bs.map(round.boutProof) };
  const g = crew.ghostTimeline(log, 'Maya');
  const totals = bs.map((b) => enc.scoreBout(b));
  assert.equal(JSON.stringify(g.bouts.map((x) => x.total)), JSON.stringify(totals));
  assert.equal(crew.ghostAt(g, 0, 0), 0);
  assert.equal(crew.ghostAt(g, 1, 0), totals[0]);
  assert.equal(crew.ghostAt(g, 2, 1e9), totals[0] + totals[1] + totals[2]);
  const mid = crew.ghostAt(g, 1, 6000);
  assert.ok(mid >= totals[0] && mid <= totals[0] + totals[1]);
});
