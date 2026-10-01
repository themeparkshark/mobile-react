'use strict';
/**
 * Standings (WS8, P0-9): every load ends in ready, empty or error (never an
 * endless spinner), 1-2 players still get a podium, the Rides tab opens on the
 * nearest park and shows a real date, and VIP-neutral XP stays behind a flag
 * that defaults to today's behaviour.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const dayjs = require(path.join(root, 'node_modules/dayjs'));
const model = loadTs('src/screens/LeaderboardsScreen/standingsModel.ts', { dayjs });

test('a finished load is ready, empty or error; nothing stays loading', () => {
  assert.equal(model.standingsStatus({ players: [{ id: 1 }] }), 'ready');
  assert.equal(model.standingsStatus({ players: [] }), 'empty');
  assert.equal(model.standingsStatus({ players: null }), 'empty');
  assert.equal(model.standingsStatus({}), 'empty');
  assert.equal(model.standingsStatus({ players: [{ id: 1 }], failed: true }), 'error');
});

test('podium slots: 0, 1, 2 and 5 players all render a three-place podium', () => {
  const players = n => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
  const ids = slots => plain({ podium: slots.podium.map(p => p && p.id), rest: slots.rest.map(p => p.id), count: slots.count });
  assert.deepEqual(ids(model.podiumSlots(players(0))), { podium: [null, null, null], rest: [], count: 0 });
  assert.deepEqual(ids(model.podiumSlots(players(1))), { podium: [1, null, null], rest: [], count: 1 });
  assert.deepEqual(ids(model.podiumSlots(players(2))), { podium: [1, 2, null], rest: [], count: 2 });
  assert.deepEqual(ids(model.podiumSlots(players(5))), { podium: [1, 2, 3], rest: [4, 5], count: 5 });
  assert.deepEqual(ids(model.podiumSlots(undefined)), { podium: [null, null, null], rest: [], count: 0 });
});

test('the Standings open on the park you are in, then your last park, then the first park', () => {
  const parkIds = [3, 7, 9];
  assert.equal(model.defaultStandingsPark({ parkIds, locationParkId: 7, playerParkId: 9 }), 7);
  assert.equal(model.defaultStandingsPark({ parkIds, playerParkId: 9 }), 9);
  assert.equal(model.defaultStandingsPark({ parkIds }), 3);
  assert.equal(model.defaultStandingsPark({ parkIds, chosenParkId: 9, locationParkId: 7 }), 9, 'a choice on screen wins');
  assert.equal(model.defaultStandingsPark({ parkIds, locationParkId: 42 }), 3, 'unknown parks are ignored');
  assert.equal(model.defaultStandingsPark({ parkIds: [] }), undefined);
});

test('the all-time board is the default period, else the longest one', () => {
  assert.equal(model.pickDefaultLeaderboard([{ id: 1, duration_text: 'Daily' }, { id: 2, duration_text: 'All Time' }]), 2);
  assert.equal(model.pickDefaultLeaderboard([{ id: 1, duration: 7 }, { id: 2, duration: 30 }, { id: 3, duration: 1 }]), 2);
  assert.equal(model.pickDefaultLeaderboard([]), undefined);
  assert.equal(model.pickDefaultLeaderboard(null), undefined);
});

test('park days read as a real date, never a raw ISO string', () => {
  assert.equal(model.formatParkDay('2026-09-29'), 'Tuesday, September 29');
  assert.equal(model.formatParkDay('2026-09-29T07:00:00Z'), 'Tuesday, September 29');
  assert.equal(model.formatParkDay(''), 'today');
  assert.equal(model.formatParkDay('soon'), 'today');
  assert.match(model.rideMetricCopy('today', '2026-09-29', 0).caption, /Tuesday, September 29/);
});

test('VIP-neutral XP is off by default and only switches on with the flag and a base value', () => {
  assert.equal(model.VIP_NEUTRAL_STANDINGS_DEFAULT, false);
  assert.equal(model.vipNeutralStandingsEnabled({}), false);
  assert.equal(model.vipNeutralStandingsEnabled({ EXPO_PUBLIC_VIP_NEUTRAL_STANDINGS: '1' }), true);
  assert.equal(model.vipNeutralStandingsEnabled({ EXPO_PUBLIC_VIP_NEUTRAL_STANDINGS: 'false' }), false);
  const player = { total_experience: 900, base_total_experience: 600 };
  assert.equal(model.experienceScore(player, false), 900);
  assert.equal(model.experienceScore(player, true), 600);
  assert.equal(model.experienceScore({ total_experience: 900 }, true), 900, 'no base value keeps the total');
});

test('empty boards invite the player onto the podium in plain copy', () => {
  const copies = [model.STANDINGS_EMPTY_COPY.coins, model.STANDINGS_EMPTY_COPY.xp,
    ...['today', 'collection', 'mastery'].map(m => {
      const c = model.rideMetricCopy(m, '2026-09-29', 4); return { title: c.emptyTitle, message: c.emptyMessage };
    })];
  for (const copy of copies) {
    assert.match(copy.title, /first on the podium/i);
    assert.doesNotMatch(`${copy.title} ${copy.message}`, /[—\u{1F300}-\u{1FAFF}]/u);
  }
});

test('Standings screens never wait on a bare spinner and use the brand icons', () => {
  for (const file of ['ParkCoins.tsx', 'Experience.tsx', 'RideStandings.tsx']) {
    const source = fs.readFileSync(path.join(root, 'src/screens/LeaderboardsScreen', file), 'utf8');
    assert.doesNotMatch(source, /ActivityIndicator|components\/Loading/, `${file} uses SharkLoader`);
    assert.match(source, /SharkLoader/, `${file} has a loading and error state`);
    assert.match(source, /state="error"/, `${file} has a retry path`);
  }
  // The tab list moved into standingsTabs() so the Home Hunt flag can add a fourth tab.
  const tabs = fs.readFileSync(path.join(root, 'src/screens/LeaderboardsScreen/homeHuntModel.ts'), 'utf8');
  assert.match(tabs, /icon: 'ride'/, 'Rides tab has its icon');
});
