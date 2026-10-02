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
  enc.input(duo, { t: r, k: C.IN_TARGET, a: duo.opening.lanes[0] });
  const pop = duo.events[duo.events.length - 1];
  assert.equal(pop.code, enc.E_POP_PERFECT);
  assert.equal(pop.v, C.PTS.popPerfect * 100 * 125);
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
  const log = { boss: 'kraken', seed: 555, variant: 1, bouts: bs.map(round.boutProof) };
  const g = crew.ghostTimeline(log, 'Maya');
  const totals = bs.map((b) => enc.scoreBout(b));
  assert.equal(JSON.stringify(g.bouts.map((x) => x.total)), JSON.stringify(totals));
  assert.equal(crew.ghostAt(g, 0, 0), 0);
  assert.equal(crew.ghostAt(g, 1, 0), totals[0]);
  assert.equal(crew.ghostAt(g, 2, 1e9), totals[0] + totals[1] + totals[2]);
  const mid = crew.ghostAt(g, 1, 6000);
  assert.ok(mid >= totals[0] && mid <= totals[0] + totals[1]);
});

const ts = loadTs('src/games/boss/multiplayer/teamStrike.ts');

test('TEAM STRIKE: ally PERFECTs on attack #2 within 400 ms merge into one hit; later ones echo; other bouts and grades ignored', () => {
  const w = [
    { who: 'a', bout: 1, attack: 1, grade: 2, at: 10120 },
    { who: 'b', bout: 1, attack: 1, grade: 2, at: 10650 },
    { who: 'c', bout: 1, attack: 1, grade: 1, at: 10010 },
    { who: 'd', bout: 0, attack: 1, grade: 2, at: 10000 },
    { who: 'a', bout: 1, attack: 1, grade: 2, at: 10130 },
  ];
  const m = ts.mergeTeamStrike(10000, 1, w);
  assert.equal(JSON.stringify(m.merged), '["a"]');
  assert.equal(JSON.stringify(m.echoes), '["b"]');
  assert.equal(m.multiplier, 2);
});

test('TEAM STRIKE settlement: +25% of attack #2 points only when two or more teammates PERFECT it', () => {
  const seed = 2024;
  const mk = (name) => bots.runBotBout({ boss: 'kraken', seed, bout: 0, variant: 1 }, bots.BOTS[name], seed + name.length);
  const a = mk('mastery');
  const b = bots.runBotBout({ boss: 'kraken', seed, bout: 0, variant: 1 }, bots.BOTS.mastery, 999);
  const pa = ts.attackUnits(a, 1);
  const pb = ts.attackUnits(b, 1);
  const s = ts.settleTeamStrike({ a, b });
  if (pa.perfect && pb.perfect) {
    assert.equal(s.a, Math.floor((pa.units * 25) / (100 * enc.UNIT_POINTS)));
    assert.ok(s.a > 0);
  }
  const solo = ts.settleTeamStrike({ a });
  assert.equal(solo.a, 0);
});

test('crew ticker and raid log: positive lines, names for self and friends, park aliases for strangers', () => {
  const day = 1000;
  const bouts = [
    { playerId: 1, name: 'Dustin', alias: 'Coral Fin 4', self: true, friend: false, crewmate: true, damage: 1200, breaks: [], skillStar: false, gotUp: false, at: 2000 },
    { playerId: 2, name: 'Maya', alias: 'Reef Ray 9', self: false, friend: true, crewmate: true, damage: 2100, breaks: [1], skillStar: true, gotUp: false, at: 3000 },
    { playerId: 3, name: 'Secret', alias: 'Tide Pup 2', self: false, friend: false, crewmate: true, damage: 910, breaks: [], skillStar: false, gotUp: true, at: 4000 },
    { playerId: 2, name: 'Maya', alias: 'Reef Ray 9', self: false, friend: true, crewmate: true, damage: 300, breaks: [], skillStar: false, gotUp: false, at: 500 },
  ];
  assert.equal(ts.crewTickerLine('the Kraken', bouts, day), 'Your crew hit the Kraken for 4,210 today. Maya broke the hat.');
  assert.equal(ts.crewTickerLine('the Kraken', [], day), null);
  const log = ts.raidLog(bouts);
  assert.equal(JSON.stringify(log.map((r) => r.who)), JSON.stringify(['Maya', 'You', 'Tide Pup 2']));
  assert.equal(log[0].damage, 2400);
  assert.equal(log[2].gotUp, 1);
  assert.ok(!JSON.stringify(log).includes('Secret'));
});

test('TOGETHER crew: deterministic per team seed; whispers its attack #2 PERFECTs on the bout it starts with you', () => {
  const a = new crew.TogetherCrew('kraken', 777, 1, 2);
  const b = new crew.TogetherCrew('kraken', 777, 1, 2);
  a.startBout(0, 5000);
  b.startBout(0, 5000);
  const ea = a.drain(1e9);
  assert.equal(JSON.stringify(ea), JSON.stringify(b.drain(1e9)));
  assert.equal(a.roster().length, 3);
  assert.ok(ea.every((e) => e.at >= 5000));
  const strikes = ea.filter((e) => e.kind === crew.CREW_STRIKE);
  for (const s of strikes) assert.equal(s.a, 0);
  // Same seed, same counter on attack 1: the crew's Team Strike lands within the merge window of a mastery player's.
  const me = bots.runBotBout({ boss: 'kraken', seed: 777, bout: 0, variant: 1 }, bots.BOTS.mastery, 1);
  let idx = -1;
  let mine = -1;
  for (const e of me.events) {
    if (e.code === enc.E_TELL && e.b === 0) idx += 1;
    if (idx === 1 && e.code === enc.E_PERFECT) mine = e.t;
  }
  if (mine >= 0 && strikes.length) {
    const m = ts.mergeTeamStrike(5000 + mine, 0, strikes.map((s) => ({ who: s.who, bout: s.a, attack: 1, grade: 2, at: s.at })));
    assert.ok(m.merged.length + m.echoes.length === strikes.length);
  }
});
