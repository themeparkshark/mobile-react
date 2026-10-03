'use strict';
/**
 * Standings v2 (next-wave/standings-v2/PROPOSAL.md, round 2): three boards with
 * one number each, a You card with one target line, zero-reading states,
 * defensive parsing, the right legacy fallback, per-player caching, and kid
 * safety (public rows never open a profile).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const model = loadTs('src/screens/LeaderboardsScreen/standingsV2Model.ts');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const dto = (over = {}) => ({
  board: 'week', metric: 'ride_wins', park_id: null, available: null, players_count: 5, tiebreak: 'first_to_reach',
  week: { starts_at: '2026-09-28T00:00:00-07:00', ends_at: '2026-10-05T00:00:00-07:00' },
  rows: [
    { rank: 1, id: 7, screen_name: 'captaindax', score: 53 },
    { rank: 2, id: 8, screen_name: 'offtrack', score: 37 },
    { rank: 3, id: 9, screen_name: 'toons', score: 36 },
    { rank: 4, id: 10, screen_name: 'gr8scott', score: 9 },
    { rank: 5, id: 5, screen_name: 'localqa', score: 8, is_me: true },
  ],
  me: { rank: 5, id: 5, screen_name: 'localqa', score: 8, is_me: true },
  chase: { id: 10, screen_name: 'gr8scott', rank: 4, score: 9, to_pass: 2, tied: false, inventory: null },
  goals: [{ at: 3, xp: 10, reached: true }, { at: 8, xp: 25, reached: true }, { at: 15, xp: 50, reached: false }],
  ...over,
});

test('three boards, Home Hunt only behind its flag, old deep links land on the right board', () => {
  assert.deepEqual(plain(model.standingsV2Tabs(false).map(t => t.key)), ['week', 'friends', 'all_time']);
  const tabs = model.standingsV2Tabs(true);
  assert.equal(model.initialStandingsV2Tab('home_hunt', tabs), 3);
  assert.equal(model.initialStandingsV2Tab('xp', tabs), 2, 'the retired XP board opens All-Time');
  assert.equal(model.initialStandingsV2Tab(undefined, tabs), 0);
});

test('the server answer is read defensively: rows, rows around you, chase, goals, last week', () => {
  const board = model.boardModel(dto({
    around_me: [{ rank: 61, id: 70, screen_name: 'a', score: 2 }, { rank: 5, id: 5, screen_name: 'localqa', score: 8 }],
    last_week: { week_start: '2026-09-21', rank: 7, score: 14, players_count: 28, title: null, tickets: 0, seen: false },
  }), 'week', 5);
  assert.equal(board.rows[4].isMe, true);
  assert.deepEqual(plain(board.aroundMe.map(r => r.id)), [70], 'rows already on the board are not repeated');
  assert.equal(board.chase.tied, false);
  assert.equal(board.goals.length, 3);
  assert.deepEqual(plain(board.lastWeek), { weekStart: '2026-09-21', rank: 7, score: 14, playersCount: 28, title: null, tickets: 0, seen: false });

  const empty = model.boardModel(null, 'all_time', 5);
  assert.equal(empty.metric, 'ride_coins');
  assert.deepEqual(plain([empty.rows, empty.goals, empty.lastWeek, empty.chase]), [[], [], null, null]);
  const messy = model.boardModel({ rows: [{ id: 'x' }, { id: 3, score: -4 }, null], goals: [{ at: 'x' }], last_week: { rank: 0 } }, 'week', null);
  assert.equal(messy.rows.length, 1);
  assert.equal(messy.rows[0].name, 'P3', 'a missing name falls back to the safe P-number');
  assert.equal(messy.goals.length, 0);
  assert.equal(messy.lastWeek, null);
});

test('the You card: NEW players are invited, ties are explained, chasers get one target, leaders hold', () => {
  const join = model.youLine(model.boardModel(dto({ me: { rank: null, id: 5, score: 0 } }), 'week', 5));
  assert.deepEqual(plain(join), { state: 'join', text: 'Win 1 ride to join!', sub: null });
  const coinJoin = model.youLine(model.boardModel(dto({ board: 'all_time', metric: 'ride_coins', me: { rank: null, id: 5, score: 0 } }), 'all_time', 5));
  assert.equal(coinJoin.text, 'Win 1 ride coin to join!');
  const chasing = model.youLine(model.boardModel(dto(), 'week', 5));
  assert.equal(chasing.text, '2 more rides to pass gr8scott');
  const tied = model.youLine(model.boardModel(dto({ chase: { id: 10, screen_name: 'zmaize', rank: 4, score: 8, to_pass: 1, tied: true } }), 'week', 5));
  assert.deepEqual(plain(tied), { state: 'tied', text: 'Tied! zmaize got there first.', sub: '1 more ride passes them' });
  const leader = model.youLine(model.boardModel(dto({ me: { rank: 1, id: 5, score: 60 }, chase: null }), 'week', 5));
  assert.equal(leader.state, 'leader');
  for (const line of [join, coinJoin, chasing, tied, leader]) {
    assert.doesNotMatch(`${line.text} ${line.sub ?? ''}`, /[—–]|[\u{1F300}-\u{1FAFF}]/u, 'no em dashes or emoji');
    assert.ok(line.text.length <= 40, `short enough for a kid: ${line.text}`);
  }
});

test('list items: podium rows stay out, your neighbourhood and resting friends get their own fixed-height sections', () => {
  const week = model.boardModel(dto({ around_me: [{ rank: 61, id: 70, screen_name: 'a', score: 2 }] }), 'week', 5);
  const items = model.listItems(week);
  assert.deepEqual(plain(items.map(i => i.type === 'row' ? i.row.id : i.label)), [10, 5, 'Your spot', 70]);
  const friends = model.boardModel(dto({ board: 'friends', rows: [
    { rank: 1, id: 7, screen_name: 'a', score: 3 }, { rank: null, id: 5, screen_name: 'me', score: 0 }, { rank: null, id: 8, screen_name: 'b', score: 0 },
  ] }), 'friends', 5);
  const fItems = model.listItems(friends);
  assert.deepEqual(plain(fItems.map(i => i.type === 'row' ? [i.row.id, i.muted] : i.label)), ['Not riding yet', [5, true], [8, true]]);
  assert.deepEqual(plain(model.podiumRows(friends).map(r => r && r.id)), [7, null, null], 'a 0-ride friend never stands on the podium');
  assert.deepEqual(plain(model.itemLayouts(fItems)), [{ length: 40, offset: 0 }, { length: 64, offset: 40 }, { length: 64, offset: 104 }]);
});

test('day dots replace "2d 6h": today glows, the last day turns gold, the last hours turn red', () => {
  const end = '2026-10-05T07:00:00Z';
  const thursday = model.weekDots(end, Date.parse('2026-10-01T19:00:00Z'));
  assert.deepEqual(plain(thursday.dots.map(d => d.state)), ['past', 'past', 'past', 'today', 'future', 'future', 'future']);
  assert.equal(thursday.urgency, 'calm');
  assert.equal(thursday.label, '4 days left');
  assert.equal(thursday.spoken, 'New week in 4 days');
  const sunday = model.weekDots(end, Date.parse('2026-10-04T19:00:00Z'));
  assert.equal(sunday.dots[6].state, 'today');
  assert.deepEqual(plain([sunday.urgency, sunday.label]), ['last_day', 'Last day!']);
  const late = model.weekDots(end, Date.parse('2026-10-05T04:20:00Z'));
  assert.deepEqual(plain([late.urgency, late.label]), ['last_hours', 'Last chance! 2h 40m']);
  assert.equal(model.weekDots(null, 0).label, '');
});

test('climbs, the players you passed, podium identity, and per-player keys', () => {
  const board = model.boardModel(dto({ rows: [
    { rank: 1, id: 7, screen_name: 'a', score: 9 }, { rank: 2, id: 5, screen_name: 'me', score: 8, is_me: true },
    { rank: 3, id: 8, screen_name: 'b', score: 7 }, { rank: 4, id: 9, screen_name: 'c', score: 6 }, { rank: 5, id: 10, screen_name: 'd', score: 5 },
  ] }), 'week', 5);
  assert.equal(model.rankClimb(5, 2), 3);
  assert.equal(model.rankClimb(null, 2), 0, 'a first look celebrates nothing');
  assert.deepEqual(plain(model.passedPlayers(board.rows, 5, 2).map(r => r.name)), ['d', 'c', 'b'], 'passed in the order you overtook them');
  assert.deepEqual(plain(model.passedPlayers(board.rows, 2, 2)), []);
  assert.equal(model.podiumSignature(model.podiumRows(board)), '7:9|5:8|8:7');
  assert.equal(model.seenRankKey(5, 'week', null, '2026-10-05T00:00:00-07:00'), 'standings-v2:5:week:all:2026-10-05');
  assert.notEqual(model.seenRankKey(5, 'week', null, 'x'), model.seenRankKey(6, 'week', null, 'x'), 'one child never inherits another child\'s seen ranks');
  assert.equal(model.sharkVariant(13), 5);
  assert.equal(model.sharkVariant(-3), 3);
});

test('only a server without v2 falls back; an expired session or a gone park never does', () => {
  assert.equal(model.isMissingEndpoint({ response: { status: 404, headers: {} } }), true);
  assert.equal(model.isMissingEndpoint({ response: { status: 404, headers: { 'x-standings': '2' } } }), false);
  assert.equal(model.isMissingEndpoint({ response: { status: 401, headers: {} } }), false);
  assert.equal(model.isMissingEndpoint(new Error('offline')), false);
  assert.equal(model.isUnknownPark({ response: { status: 404, data: { code: 'STANDINGS_PARK_NOT_FOUND' } } }), true);
  assert.equal(model.isUnknownPark({ response: { status: 404, data: {} } }), false);
});

test('copy: the Monday card, empty boards and spoken rows', () => {
  assert.deepEqual(plain(model.lastWeekCopy({ rank: 1, score: 14, playersCount: 28, title: 'Ride Champ', tickets: 5 })),
    { headline: 'You won last week!', line: '14 rides out of 28 players', reward: 'Ride Champ + 5 Tickets' });
  assert.equal(model.lastWeekCopy({ rank: 7, score: 1, playersCount: 1, title: null, tickets: 0 }).line, '1 ride out of 1 player');
  assert.equal(model.emptyCopy('week', null).title, 'The crown is up for grabs!');
  assert.equal(model.emptyCopy('friends', 0).target, 'Friends');
  assert.equal(model.rowLabel({ rank: null, name: 'mike', score: 0, isMe: false }, 'ride_wins'), 'Not ranked yet, mike, 0 rides');
  assert.equal(model.scoreText({ metric: 'ride_coins', available: 211 }, 4), '4 of 211');
});

test('wiring: kid-safe taps, per-player cache reset on sign-out, win marks standings stale, virtualized fixed rows', () => {
  const board = read('src/screens/LeaderboardsScreen/StandingsBoardV2.tsx');
  assert.match(board, /board === 'friends' && !row\.isMe\) RootNavigation\.navigate\('Player'/, 'only friends open a profile');
  assert.match(board, /setCard\(row\)/, 'public rows open the safe shark card');
  assert.doesNotMatch(read('src/screens/LeaderboardsScreen/MiniPodium.tsx'), /navigate\('Player'/);
  assert.match(board, /getItemLayout/);
  assert.match(board, /onViewableItemsChanged/);
  assert.match(board, /announceForAccessibility/);
  assert.doesNotMatch(board, /You \$\{scoreSummary/, 'no "You X of Y" pill');
  const auth = read('src/context/AuthProvider.tsx');
  assert.equal((auth.match(/endStandingsSession\(\)/g) || []).length, 2, 'sign-out and account switch both clear the boards');
  assert.match(read('src/screens/LeaderboardsScreen/standingsV2Store.ts'), /const keyOf = \(meId/);
  assert.match(read('src/api/endpoints/me/task-attempts.ts'), /status === 'won'\) \{\s+markStandingsStale\(\)/);
  assert.match(read('src/screens/LeaderboardScreen.tsx'), /if \(!player \|\| v2Missing\) return <LegacyStandings \/>/);
  assert.match(read('src/screens/LeaderboardsScreen/standingsDemo.ts'), /__DEV__ &&/);
  assert.match(read('src/Root.tsx'), /__DEV__ && process\.env\.EXPO_PUBLIC_STANDINGS_PREVIEW/);
});

test('round 3: rides under review, one number to join, and the weekly goal moment after a win', () => {
  const review = model.boardModel(dto({ review: { checking: true, rides: 6, flagged: 1, benched: true } }), 'week', 5);
  assert.deepEqual(plain(review.review), { rides: 6, benched: true });
  const line = model.youLine(review);
  assert.deepEqual(plain(line), { state: 'review', text: 'Your rides are being checked', sub: '6 rides this week' });
  assert.equal(model.chaseChip(review, line.state), null, 'no target while rides are checked');
  assert.equal(model.boardModel(dto({ review: null }), 'week', 5).review, null);

  const join = model.boardModel(dto({ me: { rank: null, id: 5, score: 0 } }), 'week', 5);
  assert.equal(model.chaseChip(join, model.youLine(join).state), '+1', 'a new player sees one number: +1');
  const chasing = model.boardModel(dto(), 'week', 5);
  assert.equal(model.chaseChip(chasing, model.youLine(chasing).state), '+2');

  assert.deepEqual(plain(model.winNote({ counted: true, week_rides: 8, goals_reached: [{ goal: 8, xp: 25 }] })), { text: 'Weekly goal: 8 rides! +25 XP', big: true });
  assert.deepEqual(plain(model.winNote({ counted: true, week_rides: 4, goals_reached: [] })), { text: '+1 ride this week (4)', big: false });
  assert.equal(model.winNote({ counted: false, week_rides: 4 }), null, 'a replay today or a checked win says nothing');
  assert.equal(model.winNote(null), null);
});

test('round 3 wiring: the Monday card always releases the queued climb, the climb plays where you can see it', () => {
  const board = read('src/screens/LeaderboardsScreen/StandingsBoardV2.tsx');
  assert.equal((board.match(/onClose=\{closeResults\}/g) || []).length, 2, 'both results-card paths go through closeResults');
  assert.doesNotMatch(board, /onClose=\{\(\) => \{ setResults\(false\)/);
  assert.match(board, /const hideYou = !climbing && /);
  assert.match(board, /onClimbDone=\{\(\) => setClimbing\(false\)\}/);
  assert.match(board, /top: -26, left: 4/, '"Up N!" sits over the rank, clear of the goal pips');
  assert.match(read('src/screens/LeaderboardsScreen/StandingsShark.tsx'), /fadeDuration=\{0\}/);
  assert.match(read('src/screens/LeaderboardsScreen/MiniPodium.tsx'), /scaleX: -1/);
  assert.match(read('src/api/endpoints/me/task-attempts.ts'), /winNote\(/);
});
