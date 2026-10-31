'use strict';
/**
 * The unlock ladder (core loop blueprint 4.4): one feature at a time.
 * Pure rules (eligible, nextToOpen with the pacing rule, the veteran,
 * reveal_all and reinstall rules, one NEW per app open) and the per-player
 * store behind recordProgress and useRung (src/services/reveal/revealLadder.ts).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const L = loadTs('src/services/reveal/ladderRules.ts');

const HOUR = 3600000;
const T0 = Date.parse('2026-11-07T17:00:00Z');
const ALL_FLAGS = { daily_three: true, level_chests: true, shark_pass: true, trail_boxes: true, pin_of_the_day: true, live_events: true };
const P = (extra = {}) => ({ ...L.EMPTY_PROGRESS, ...extra });
const ctx = (extra = {}) => ({ atPark: false, now: T0, appOpenId: 'a', appOpenAt: T0, firstCoinTodayAt: null, ...extra });

test('eligibility: each rung keys to what the player did, and to its switch', () => {
  const e = (rung, p, flags = ALL_FLAGS) => L.eligible(rung, P(p), flags);
  assert.equal(e('team', {}), false);
  assert.equal(e('team', { coinsWon: 1 }), true);
  assert.equal(e('team', { hasTeam: true }), true);
  assert.equal(e('lineplay', {}), false);
  assert.equal(e('lineplay', { linesPlayed: 1 }), true);
  assert.equal(e('lineplay', { inLineNow: true }), true, '90 s nearly still in a queue is the place trigger');
  assert.equal(e('coin_levels', { coinsWon: 2 }), false, 'every win pays a Part, so a win alone is not enough');
  assert.equal(e('coin_levels', { coinsWon: 3 }), true);
  assert.equal(e('coin_levels', { levelUpReady: true }), true);
  assert.equal(e('coin_levels', { linePartsOnOwned: 1 }), true);
  assert.equal(e('daily', { homeDays: 2 }), false);
  assert.equal(e('daily', { homeDays: 3 }), true);
  assert.equal(e('daily', { parkDaysDone: 1 }), true);
  assert.equal(e('daily', { parkDaysDone: 1 }, { level_chests: true }), true, 'either rung 4 switch is enough');
  assert.equal(e('daily', { parkDaysDone: 1 }, {}), false, 'a missing switch is off');
  assert.equal(e('shark_pass', { coinsWon: 3 }), true);
  assert.equal(e('shark_pass', { coinsWon: 3 }, { shark_pass: false }), false);
  assert.equal(e('trail', { trailBoxes: 0 }), false);
  assert.equal(e('trail', { trailBoxes: 1 }), true);
  assert.equal(e('trail', { trailBoxes: 1 }, {}), false);
  assert.equal(e('keys', { keysHeld: 1 }), true);
  assert.equal(e('keys', {}), false);
  assert.equal(e('pins', {}), true, 'Pin of the Day on: the door shows');
  assert.equal(e('pins', {}, {}), false);
  assert.equal(e('pins', { ownsPin: true }, {}), true, 'pins you own never disappear');
  assert.equal(e('events', {}), true);
  assert.equal(e('events', { eventScheduled: false }), false);
  assert.equal(e('events', {}, {}), false);
  assert.equal(e('trail', { revealAll: true }), true, 'reveal_all skips the trigger');
  assert.equal(e('trail', { revealAll: true }, {}), false, 'but never a switched-off feature');
});

test('pacing at home: one rung per app open, in ladder order', () => {
  const p = P({ coinsWon: 3, parkDaysDone: 1, trailBoxes: 1 });
  assert.equal(L.nextToOpen({}, p, ALL_FLAGS, ctx()), 'team');
  const opened = { team: T0 + 1 };
  assert.equal(L.nextToOpen(opened, p, ALL_FLAGS, ctx({ now: T0 + 2 })), null, 'already one this open');
  assert.equal(L.nextToOpen(opened, p, ALL_FLAGS, ctx({ now: T0 + HOUR, appOpenAt: T0 + HOUR, appOpenId: 'b' })), 'coin_levels',
    'lineplay is not eligible, so it does not block the next rung');
  // Quietly opened rungs (0) never use up the open's turn.
  assert.equal(L.nextToOpen({ team: 0 }, p, ALL_FLAGS, ctx()), 'coin_levels');
});

test('pacing at a park: nothing before the first coin, then at most one per hour; team and LinePlay are the place itself', () => {
  const park = extra => ctx({ atPark: true, ...extra });
  const levels = P({ coinsWon: 1, linesPlayed: 1, levelUpReady: true });
  assert.equal(L.nextToOpen({}, levels, ALL_FLAGS, park()), 'team', 'team opens with the first coin');
  assert.equal(L.nextToOpen({ team: T0 }, levels, ALL_FLAGS, park()), 'lineplay', 'LinePlay in a real line, at once');
  const both = { team: T0, lineplay: T0 + 1000 };
  assert.equal(L.nextToOpen(both, levels, ALL_FLAGS, park({ firstCoinTodayAt: null })), null, 'no first coin today: no paced rung');
  assert.equal(L.nextToOpen(both, levels, ALL_FLAGS, park({ firstCoinTodayAt: T0, now: T0 + HOUR - 1 })), null, 'within the hour');
  assert.equal(L.nextToOpen(both, levels, ALL_FLAGS, park({ firstCoinTodayAt: T0, now: T0 + HOUR })), 'coin_levels', 'an hour after the first coin');
  const more = P({ coinsWon: 3, linesPlayed: 1, levelUpReady: true, homeDays: 3, trailBoxes: 1 });
  const three = { ...both, coin_levels: T0 + HOUR };
  assert.equal(L.nextToOpen(three, more, ALL_FLAGS, park({ firstCoinTodayAt: T0, now: T0 + HOUR + 59 * 60000 })), null, 'one per hour');
  assert.equal(L.nextToOpen(three, more, ALL_FLAGS, park({ firstCoinTodayAt: T0, now: T0 + 2 * HOUR })), 'daily');
  // Team and LinePlay openings never count against the hour.
  assert.equal(L.nextToOpen({ team: T0 + HOUR - 5 }, P({ coinsWon: 1, levelUpReady: true }), ALL_FLAGS,
    park({ firstCoinTodayAt: T0, now: T0 + HOUR })), 'coin_levels');
});

test('a scripted first park day opens at most team, LinePlay and coin levels', () => {
  // A fresh install at the gate: 6 coins over 5 hours, two lines, one key, Pin of the Day on, every switch on.
  const opened = {};
  const timeline = [];
  let p = P({ homeDays: 1 });
  let firstCoin = null;
  const step = (minutes, change) => {
    const now = T0 + minutes * 60000;
    p = P({ ...p, ...change });
    if (change.coinsWon === 1) firstCoin = now;
    for (;;) {
      const rung = L.nextToOpen(opened, p, ALL_FLAGS, ctx({ atPark: true, now, appOpenId: 'gate', appOpenAt: T0, firstCoinTodayAt: firstCoin }));
      if (!rung) break;
      opened[rung] = now;
      timeline.push(rung);
    }
  };
  step(0, { parkDaysStarted: 1 });
  step(3, { coinsWon: 1 });
  step(25, { inLineNow: true });
  step(50, { inLineNow: false, linesPlayed: 1, linePartsOnOwned: 0 });
  step(70, { coinsWon: 2, keysHeld: 1 });
  step(130, { coinsWon: 3, level: 2 });
  step(200, { coinsWon: 4, linePartsOnOwned: 1 });
  step(260, { coinsWon: 6 });
  step(300, {});
  assert.deepEqual(timeline, ['team', 'lineplay', 'coin_levels'], `opened: ${timeline.join(', ')}`);
  assert.ok(opened.coin_levels - firstCoin >= HOUR, 'coin levels an hour after the first coin');
  assert.equal(opened.lineplay, T0 + 25 * 60000, 'LinePlay the moment the player stands in a real line');
  // Next home open: Daily 3; the open after that: Shark Pass.
  const done = P({ ...p, parkDaysDone: 1 });
  const home1 = T0 + 10 * HOUR;
  assert.equal(L.nextToOpen(opened, done, ALL_FLAGS, ctx({ now: home1, appOpenAt: home1, appOpenId: 'h1' })), 'daily');
  opened.daily = home1;
  assert.equal(L.nextToOpen(opened, done, ALL_FLAGS, ctx({ now: home1 + 1, appOpenAt: home1, appOpenId: 'h1' })), null);
  const home2 = home1 + 20 * HOUR;
  assert.equal(L.nextToOpen(opened, done, ALL_FLAGS, ctx({ now: home2, appOpenAt: home2, appOpenId: 'h2' })), 'shark_pass');
});

test('Shark Pass needs Daily 3 opened on an earlier app open; events need Daily 3 open', () => {
  const p = P({ coinsWon: 3, team: true, parkDaysDone: 1 });
  const base = { team: 0, coin_levels: 0 };
  assert.equal(L.nextToOpen(base, p, { shark_pass: true, live_events: true }, ctx()), null, 'no rung 4 switch: no pass, no events');
  assert.equal(L.nextToOpen({ ...base, daily: T0 - 5 }, p, ALL_FLAGS, ctx({ appOpenAt: T0 - 10 })), null, 'daily opened in this open');
  assert.equal(L.nextToOpen({ ...base, daily: T0 - 5 }, p, ALL_FLAGS, ctx({ appOpenAt: T0 })), 'shark_pass');
  const pass = { ...base, daily: T0 - 5, shark_pass: T0 - 2 * HOUR };
  assert.equal(L.nextToOpen(pass, p, ALL_FLAGS, ctx({ appOpenAt: T0 })), 'events', 'events once rung 4 is open (the Pins NEW waits for level 3)');
  assert.equal(L.nextToOpen({ ...base, shark_pass: T0 - HOUR }, p, ALL_FLAGS, ctx()), 'daily', 'events never open before Daily 3');
});

test('Keys and Pins show while held, need no turn; the level 3 Pins NEW takes one', () => {
  const p = P({ keysHeld: 2 });
  assert.equal(L.rungVisible('keys', {}, p, ALL_FLAGS), true);
  assert.equal(L.rungVisible('keys', {}, P(), ALL_FLAGS), false);
  assert.equal(L.rungVisible('pins', {}, P(), ALL_FLAGS), true, 'Pin of the Day on');
  assert.equal(L.rungVisible('pins', {}, P(), {}), false);
  assert.equal(L.rungVisible('pins', {}, P({ ownsPin: true }), {}), true);
  assert.equal(L.nextToOpen({}, p, ALL_FLAGS, ctx()), null, 'holding a key is not a turn');
  assert.equal(L.nextToOpen({}, P({ level: 3 }), ALL_FLAGS, ctx()), 'pins');
  assert.equal(L.nextToOpen({ pins: T0 }, P({ level: 3, coinsWon: 1 }), ALL_FLAGS, ctx({ now: T0 + 1 })), null, 'it was this open\'s one NEW');
  assert.equal(L.rungVisible('daily', {}, P({ parkDaysDone: 1 }), ALL_FLAGS), false, 'waiting its turn: fully hidden');
  assert.equal(L.rungVisible('daily', { daily: T0 }, P(), ALL_FLAGS), true);
  assert.equal(L.rungVisible('daily', { daily: T0 }, P(), {}), false, 'a switch turned off hides it again');
});

test('veterans: 5 or more coins when this build first sees them opens every rung, with no NEW tags', () => {
  const vet = L.initialOpened(P({ coinsWon: 5 }), ALL_FLAGS);
  assert.equal(vet.veteran, true);
  assert.deepEqual(Object.keys(plain(vet.opened)).sort(), [...L.RUNG_ORDER].sort());
  assert.ok(Object.values(vet.opened).every(at => at === 0));
  assert.equal(L.pickNewTag(vet.opened, {}, null, 'a'), null);
  assert.equal(L.nextToOpen(vet.opened, P({ coinsWon: 5 }), ALL_FLAGS, ctx()), null);
  assert.equal(L.initialOpened(P({ coinsWon: 4 }), ALL_FLAGS).veteran, false);
});

test('reveal_all: every switched-on rung shows at once, nothing paces, no NEW', () => {
  const p = P({ revealAll: true });
  for (const rung of L.RUNG_ORDER) assert.equal(L.rungVisible(rung, {}, p, ALL_FLAGS), true, rung);
  assert.equal(L.rungVisible('trail', {}, p, { trail_boxes: false, pin_of_the_day: true }), false);
  assert.equal(L.nextToOpen({}, p, ALL_FLAGS, ctx()), null);
});

test('reinstall or new phone: rungs whose server-backed triggers are met open at once, quietly', () => {
  const back = L.initialOpened(P({ coinsWon: 3, trailBoxes: 2, keysHeld: 1, level: 4 }), ALL_FLAGS);
  assert.equal(back.veteran, false);
  assert.deepEqual(Object.keys(plain(back.opened)).sort(), ['coin_levels', 'keys', 'pins', 'team', 'trail']);
  assert.ok(Object.values(back.opened).every(at => at === 0), 'no NEW for things they already had');
  assert.equal(L.initialOpened(P({ trailBoxes: 2 }), {}).opened.trail, undefined, 'a switched-off rung stays shut');
  assert.deepEqual(plain(L.initialOpened(P(), ALL_FLAGS).opened), {}, 'a brand-new player climbs from the bottom');
  assert.equal(L.initialOpened(P({ hasTeam: true }), ALL_FLAGS).opened.team, 0);
});

test('one NEW tag per app open, earliest first; quiet rungs and Keys never wear one', () => {
  const opened = { team: 0, lineplay: T0, coin_levels: T0 + 10, keys: T0 - 1 };
  assert.equal(L.pickNewTag(opened, {}, null, 'a'), 'lineplay');
  assert.equal(L.pickNewTag(opened, { lineplay: true }, { rung: 'lineplay', appOpenId: 'a' }, 'a'), null, 'seen: no second NEW this open');
  assert.equal(L.pickNewTag(opened, { lineplay: true }, { rung: 'lineplay', appOpenId: 'a' }, 'b'), 'coin_levels', 'the next open');
  assert.equal(L.pickNewTag(opened, {}, { rung: 'coin_levels', appOpenId: 'a' }, 'a'), 'coin_levels', 'stable within the open');
  assert.equal(L.pickNewTag({ team: 0 }, {}, null, 'a'), null);
  assert.equal(L.localDay(Date.UTC(2026, 10, 7, 12)).length, 10);
});

// ---------------------------------------------------------------------------
// The store: recordProgress per player id, feedLadder, useRung's reads.

function store() {
  const disk = new Map();
  let player = '41';
  let clock = T0;
  let appState;
  const R = loadTs('src/services/reveal/revealLadder.ts', {
    react: { useCallback: fn => fn, useSyncExternalStore: (_s, get) => get() },
    'react-native': { AppState: { addEventListener: (_n, fn) => { appState = fn; return { remove() { appState = undefined; } }; } } },
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async key => (disk.has(key) ? disk.get(key) : null),
      setItem: async (key, value) => { disk.set(key, value); },
    } },
    '../../gamekit/core/playerStorage': { gameSavesPlayer: () => player },
  });
  R.__ladderTest.reset(() => clock);
  return {
    R, disk,
    setPlayer(id) { player = id; },
    tick(ms) { clock += ms; },
    get now() { return clock; },
    appState: state => appState?.(state),
    ready: () => R.__ladderTest.whenReady().then(() => new Promise(resolve => setImmediate(resolve))),
  };
}

test('store: nothing shows until the saved record and the first server feed arrive', async () => {
  const s = store();
  assert.deepEqual(plain(s.R.rungState('team')), { open: false, isNew: false });
  s.R.feedLadder({ flags: ALL_FLAGS, atPark: false });
  await s.ready();
  assert.equal(s.R.rungState('team').open, false, 'no server progress yet');
  s.R.feedLadder({ progress: { coinsWon: 0 } });
  assert.equal(s.R.rungState('pins').open, true, 'Pin of the Day door');
  assert.equal(s.R.rungState('team').open, false);
});

test('store: a first coin at the park opens team with its NEW; the next rung waits an hour', async () => {
  const s = store();
  s.R.feedLadder({ flags: ALL_FLAGS, atPark: true, progress: { coinsWon: 0 } });
  await s.ready();
  s.R.feedLadder({ progress: { coinsWon: 0 } });
  s.tick(60000);
  s.R.feedLadder({ progress: { coinsWon: 1 } });
  assert.deepEqual(plain(s.R.rungState('team')), { open: true, isNew: true });
  s.R.markRungSeen('team');
  assert.deepEqual(plain(s.R.rungState('team')), { open: true, isNew: false });
  s.tick(60000);
  s.R.feedLadder({ progress: { coinsWon: 3 } });
  assert.equal(s.R.rungState('coin_levels').open, false, 'within the hour of the first coin');
  s.tick(HOUR);
  s.R.feedLadder({});
  assert.equal(s.R.rungState('coin_levels').open, true);
  assert.equal(s.R.rungState('coin_levels').isNew, false, 'team already wore this open\'s NEW');
  s.tick(11 * 60000);
  s.appState('background');
  s.tick(11 * 60000);
  s.appState('active');
  assert.equal(s.R.rungState('coin_levels').isNew, true, 'it wears NEW on the next app open');
  const saved = JSON.parse(s.disk.get('tps.reveal.v1@p41'));
  assert.ok(saved.opened.team > 0 && saved.opened.coin_levels > saved.opened.team);
});

test('store: recordProgress keeps counters per player id, day events count once a day', async () => {
  const s = store();
  s.R.feedLadder({ flags: ALL_FLAGS, atPark: false, progress: { coinsWon: 0 } });
  await s.ready();
  s.R.recordProgress('home_day');
  s.R.recordProgress('home_day');
  s.R.recordProgress('line_played', { taskId: 3, parkId: 8 });
  let rec = s.R.__ladderTest.record();
  assert.equal(rec.counters.homeDays, 1, 'once per local day');
  assert.equal(rec.counters.linesPlayed, 1);
  assert.equal(s.R.rungState('lineplay').open, true, 'a home open with a first LinePlay opens rung 2');
  s.tick(24 * HOUR);
  s.R.recordProgress('home_day');
  rec = s.R.__ladderTest.record();
  assert.equal(rec.counters.homeDays, 2);
  // Another player on the same phone starts on their own record.
  s.setPlayer('77');
  s.R.feedLadder({ progress: { coinsWon: 0 } });
  await s.ready();
  assert.equal(s.R.__ladderTest.record().counters.homeDays, 0);
  assert.equal(s.R.rungState('lineplay').open, false);
  s.R.recordProgress('park_day_started', { parkId: 8 });
  assert.equal(s.R.__ladderTest.record().counters.parkDaysStarted, 1);
  assert.ok(s.disk.has('tps.reveal.v1@p41') && s.disk.has('tps.reveal.v1@p77'));
  assert.equal(JSON.parse(s.disk.get('tps.reveal.v1@p41')).counters.homeDays, 2);
  // Back to the first player: their record loads from disk.
  s.setPlayer('41');
  s.R.feedLadder({ progress: { coinsWon: 0 } });
  await s.ready();
  assert.equal(s.R.__ladderTest.record().counters.homeDays, 2);
  assert.equal(s.R.rungState('lineplay').open, true);
});

test('store: a veteran on first sight sees every switched-on rung, with no NEW', async () => {
  const s = store();
  s.R.feedLadder({ flags: ALL_FLAGS, atPark: true, progress: { coinsWon: 12, keysHeld: 0 } });
  await s.ready();
  s.R.feedLadder({});
  for (const rung of L.RUNG_ORDER.filter(r => r !== 'keys')) assert.deepEqual(plain(s.R.rungState(rung)), { open: true, isNew: false }, rung);
  assert.equal(s.R.rungState('keys').open, false, 'keys show only while held');
});

test('store: signed out, nothing opens and nothing is saved', () => {
  const s = store();
  s.setPlayer(null);
  s.R.feedLadder({ flags: ALL_FLAGS, progress: { coinsWon: 9 } });
  s.R.recordProgress('home_day');
  assert.equal(s.R.rungState('team').open, false);
  assert.equal(s.disk.size, 0);
});
