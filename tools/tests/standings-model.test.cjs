'use strict';
/**
 * Standings (WS8, P0-9): every load ends in ready, empty or error (never an
 * endless spinner), 1-2 players still get a podium, the Rides tab opens on the
 * nearest park and shows a real date, and the XP board shows the number it is
 * ranked by.
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

test('the XP board shows the number it is ranked by, never a VIP-free number the server did not rank by', () => {
  // The server sends its ranking column as total_experience (base XP once ECONOMY_VIP_NEUTRAL_STANDINGS is on).
  assert.equal(model.experienceScore({ total_experience: 900, base_total_experience: 600 }), 900);
  assert.equal(model.experienceScore({ total_experience: null }), 0);
  assert.equal(model.VIP_NEUTRAL_STANDINGS_DEFAULT, undefined, 'no client switch that could disagree with the server order');
  const board = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/screens/LeaderboardsScreen/Experience.tsx'), 'utf8');
  assert.doesNotMatch(board, /base_total_experience|VIP_NEUTRAL/);
  // Shown in rank order: a list in server order stays in non-increasing score order.
  const list = [{ total_experience: 700 }, { total_experience: 700 }, { total_experience: 600 }];
  const shown = list.map(p => model.experienceScore(p));
  assert.deepEqual(shown, [...shown].sort((a, b) => b - a));
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

test('the XP board says plainly when VIP bonus XP counts in the ranking', () => {
  assert.equal(model.xpIncludesVipBonus(undefined), true, 'a server that sends nothing ranks by total XP (VIP bonus in)');
  assert.equal(model.xpIncludesVipBonus({ current_page: 1 }), true);
  assert.equal(model.xpIncludesVipBonus({ xp_includes_vip_bonus: false }), false);
  assert.equal(model.xpIncludesVipBonus({ xp_includes_vip_bonus: true }), true);
  const vip = [{ is_subscribed: false }, { is_subscribed: true }];
  assert.equal(model.xpVipNote(vip, true), model.XP_VIP_NOTE);
  assert.equal(model.xpVipNote([{ is_subscribed: false }, { flex: { vip: true } }], true), model.XP_VIP_NOTE);
  assert.equal(model.xpVipNote([{ is_subscribed: false }], true), null, 'no VIP on the board, no line');
  assert.equal(model.xpVipNote(vip, false), null, 'a board ranked without the bonus needs no line');
  assert.ok(model.XP_VIP_NOTE.split(' ').length <= 9, 'one short kid line');
  assert.doesNotMatch(model.XP_VIP_NOTE, /\u2014|bet|odds|hurry|now!/i);
  const board = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/screens/LeaderboardsScreen/Experience.tsx'), 'utf8');
  assert.match(board, /cache\.vipBonus = xpIncludesVipBonus\(meta\);/);
  assert.match(board, /const vipNote = cache\.vipNote \?\? xpVipNote\(players, cache\.vipBonus\);/);
  // A VIP player first seen on a later page still turns the line on: it is worked out from every loaded page.
  assert.match(board, /cache\.players = \[\.\.\.cache\.players, \.\.\.\(next \?\? \[\]\)\.filter\(p => !seen\.has\(p\.id\)\)\];\n\s*cache\.vipNote = xpVipNote\(cache\.players, cache\.vipBonus\);/);
  assert.match(board, /const \{ players: next, meta \} = await allWithMeta\(cache\.page \+ 1\);\n\s*cache\.vipBonus = xpIncludesVipBonus\(meta\);/);
  assert.equal(model.xpVipNote([{ is_subscribed: false }, { is_subscribed: false }, { is_subscribed: true }], true), model.XP_VIP_NOTE, 'page 1 plus page 2');
});

test('the XP VIP line sits on a soft navy pill, readable over the podium light rays', () => {
  const board = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/screens/LeaderboardsScreen/Experience.tsx'), 'utf8');
  require('node:assert/strict').match(board, /backgroundColor: 'rgba\(7, 61, 119, 0\.72\)'/);
});
