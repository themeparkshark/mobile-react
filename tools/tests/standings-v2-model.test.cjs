'use strict';
/**
 * Standings v2 (next-wave/standings-v2/PROPOSAL.md): three boards with one
 * number each, a You card with one target line, defensive parsing of the
 * server answer, and a legacy fallback when the endpoint is missing.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const model = loadTs('src/screens/LeaderboardsScreen/standingsV2Model.ts');

const dto = (over = {}) => ({
  board: 'week', metric: 'ride_wins', park_id: null, available: null, players_count: 3,
  week: { starts_at: '2026-09-28T00:00:00-07:00', ends_at: '2026-10-05T00:00:00-07:00' },
  rows: [
    { rank: 1, id: 7, screen_name: 'captaindax', score: 53, is_me: false, avatar_url: null, inventory: null },
    { rank: 2, id: 8, screen_name: 'offtrack', score: 37 },
    { rank: 3, id: 9, screen_name: 'gr8scott', score: 9 },
    { rank: 4, id: 5, screen_name: 'localqa', score: 8, is_me: true },
  ],
  me: { rank: 4, id: 5, screen_name: 'localqa', score: 8, is_me: true },
  chase: { id: 9, screen_name: 'gr8scott', rank: 3, score: 9, to_pass: 2 },
  ...over,
});

test('three boards, Home Hunt only behind its flag, old deep links land on the right board', () => {
  assert.deepEqual(plain(model.standingsV2Tabs(false).map(t => t.key)), ['week', 'friends', 'all_time']);
  assert.deepEqual(plain(model.standingsV2Tabs(true).map(t => t.key)), ['week', 'friends', 'all_time', 'hunt']);
  const tabs = model.standingsV2Tabs(true);
  assert.equal(model.initialStandingsV2Tab('home_hunt', tabs), 3);
  assert.equal(model.initialStandingsV2Tab('friends', tabs), 1);
  assert.equal(model.initialStandingsV2Tab('xp', tabs), 2, 'the retired XP board opens All-Time');
  assert.equal(model.initialStandingsV2Tab('rides', tabs), 0);
  assert.equal(model.initialStandingsV2Tab(undefined, tabs), 0);
  assert.equal(model.initialStandingsV2Tab('home_hunt', model.standingsV2Tabs(false)), 0, 'no hunt tab: first board');
});

test('the server answer is read defensively and marks your row', () => {
  const board = model.boardModel(dto(), 'week', 5);
  assert.equal(board.rows.length, 4);
  assert.equal(board.rows[3].isMe, true);
  assert.equal(board.me.rank, 4);
  assert.deepEqual(plain(board.chase), { name: 'gr8scott', rank: 3, score: 9, toPass: 2 });
  assert.equal(board.endsAt, '2026-10-05T00:00:00-07:00');

  const empty = model.boardModel(null, 'all_time', 5);
  assert.equal(empty.board, 'all_time');
  assert.equal(empty.metric, 'ride_coins');
  assert.deepEqual(plain(empty.rows), []);
  assert.equal(empty.me, null);
  assert.equal(empty.chase, null);

  const messy = model.boardModel({ rows: [{ id: 'x' }, { id: 3, score: -4 }, null], chase: { screen_name: 'a', to_pass: 0 } }, 'week', null);
  assert.equal(messy.rows.length, 1, 'rows without an id are dropped');
  assert.equal(messy.rows[0].name, 'P3', 'a missing name falls back to the safe P-number');
  assert.equal(messy.rows[0].score, 0);
  assert.equal(messy.chase, null, 'a chase with nothing to pass is ignored');
});

test('the You card says one thing: chase, lead, or how to join', () => {
  const chasing = model.youLine(model.boardModel(dto(), 'week', 5));
  assert.deepEqual(plain(chasing), { state: 'chasing', text: '2 more rides to pass gr8scott' });
  const one = model.youLine(model.boardModel(dto({ chase: { screen_name: 'zed', to_pass: 1, rank: 1, score: 3 } }), 'week', 5));
  assert.equal(one.text, '1 more ride to pass zed');
  const coins = model.youLine(model.boardModel(dto({ board: 'all_time', metric: 'ride_coins' }), 'all_time', 5));
  assert.equal(coins.text, '2 more ride coins to pass gr8scott');
  const leader = model.youLine(model.boardModel(dto({ me: { rank: 1, id: 5, score: 60 }, chase: null }), 'week', 5));
  assert.equal(leader.state, 'leader');
  const join = model.youLine(model.boardModel(dto({ me: { rank: null, id: 5, score: 0 }, chase: null }), 'week', 5));
  assert.deepEqual(plain(join), { state: 'join', text: 'Win a ride to join this week' });
  const friends = model.youLine(model.boardModel(dto({ board: 'friends', me: { rank: 3, id: 5, score: 0 }, chase: null }), 'friends', 5));
  assert.equal(friends.text, 'Win a ride to race your friends');
  for (const line of [chasing, one, coins, leader, join, friends]) {
    assert.doesNotMatch(line.text, /[—–]|[\u{1F300}-\u{1FAFF}]/u, 'no em dashes or emoji');
    assert.ok(line.text.length <= 40, `short enough for a kid: ${line.text}`);
  }
});

test('the chase bar fills as you close in; leaders are full, newcomers empty', () => {
  const board = model.boardModel(dto(), 'week', 5);
  assert.equal(model.chaseProgress(board), 0.8);
  assert.equal(model.chaseProgress({ me: { score: 9 }, chase: null }), 1);
  assert.equal(model.chaseProgress({ me: { score: 0 }, chase: null }), 0);
});

test('counts, countdowns, climbs and keys', () => {
  assert.equal(model.unitWord('ride_wins', 1), 'ride');
  assert.equal(model.unitWord('ride_coins', 2), 'ride coins');
  assert.equal(model.scoreSummary({ metric: 'ride_coins', me: { score: 4 }, available: 211 }), '4 of 211');
  assert.equal(model.scoreSummary({ metric: 'ride_wins', me: { score: 1 }, available: null }), '1 ride');
  const end = '2026-10-05T07:00:00Z';
  assert.equal(model.resetCountdown(end, Date.parse('2026-10-02T23:00:00Z')), '2d 8h');
  assert.equal(model.resetCountdown(end, Date.parse('2026-10-05T05:30:00Z')), '1h 30m');
  assert.equal(model.resetCountdown(end, Date.parse('2026-10-05T06:51:00Z')), '9m');
  assert.equal(model.resetCountdown(end, Date.parse('2026-10-06T00:00:00Z')), 'now');
  assert.equal(model.resetCountdown(null, 0), '');
  assert.equal(model.rankClimb(20, 17), 3);
  assert.equal(model.rankClimb(null, 4), 0, 'a first look celebrates nothing');
  assert.equal(model.rankClimb(4, 6), -2);
  assert.equal(model.seenRankKey('week', null, '2026-10-05T00:00:00-07:00'), 'standings-v2:week:all:2026-10-05');
  assert.equal(model.seenRankKey('all_time', 8, '2026-10-05'), 'standings-v2:all_time:8:ever');
});

test('podium split, accessibility labels, empty copy and the legacy fallback trigger', () => {
  const split = model.splitPodium([1, 2]);
  assert.deepEqual(plain(split), { podium: [1, 2, null], rest: [] });
  assert.deepEqual(plain(model.splitPodium([1, 2, 3, 4, 5]).rest), [4, 5]);
  assert.equal(model.rowLabel({ rank: 4, name: 'localqa', score: 8, isMe: true }, 'ride_wins'), 'Rank 4, You, localqa, 8 rides');
  assert.equal(model.emptyCopy('friends', 0).target, 'Friends');
  assert.equal(model.emptyCopy('week', null).target, 'Explore');
  assert.equal(model.isMissingEndpoint({ response: { status: 404 } }), true);
  assert.equal(model.isMissingEndpoint({ response: { status: 500 } }), false);
  assert.equal(model.isMissingEndpoint(new Error('offline')), false);
});

test('the screen keeps the legacy boards for older servers and guests, and the board is virtualized', () => {
  const screen = fs.readFileSync(path.join(root, 'src/screens/LeaderboardScreen.tsx'), 'utf8');
  assert.match(screen, /if \(!player \|\| v2Missing\) return <LegacyStandings \/>/);
  const board = fs.readFileSync(path.join(root, 'src/screens/LeaderboardsScreen/StandingsBoardV2.tsx'), 'utf8');
  assert.match(board, /<FlatList/);
  assert.match(board, /useUiReducedMotion/);
  assert.match(board, /SharkLoader state="error"/);
  assert.doesNotMatch(board, /setInterval\([^)]*30000/, 'no 30 second polling');
  const demo = fs.readFileSync(path.join(root, 'src/screens/LeaderboardsScreen/standingsDemo.ts'), 'utf8');
  assert.match(demo, /__DEV__ &&/, 'the capture tour never runs in a release build');
});
