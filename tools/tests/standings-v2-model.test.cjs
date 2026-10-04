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
  assert.deepEqual(plain(board.lastWeek), { weekStart: '2026-09-21', rank: 7, score: 14, playersCount: 28, title: null, tickets: 0, held: false, seen: false });

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
  assert.equal(chasing.text, '2 more rides to pass gr8scott!');
  // v3 r2: a tie is the next step, never "X got there first".
  const tied = model.youLine(model.boardModel(dto({ chase: { id: 10, screen_name: 'zmaize', rank: 4, score: 8, to_pass: 1, tied: true } }), 'week', 5));
  assert.deepEqual(plain(tied), { state: 'tied', text: '1 more ride to pass zmaize!', sub: null });
  const away = model.youLine(model.boardModel(dto({ me: { rank: null, id: 5, score: 0 } }), 'week', 5), false);
  assert.equal(away.text, 'Next park day: win 1 ride!', 'at home: no dead-end GO RIDE');
  const leader = model.youLine(model.boardModel(dto({ me: { rank: 1, id: 5, score: 60 }, chase: null }), 'week', 5));
  assert.equal(leader.state, 'leader');
  for (const line of [join, coinJoin, chasing, tied, leader, away]) {
    assert.doesNotMatch(`${line.text} ${line.sub ?? ''}`, /[—–]|[\u{1F300}-\u{1FAFF}]/u, 'no em dashes or emoji');
    assert.ok(line.text.length <= 40, `short enough for a kid: ${line.text}`);
  }
});

test('list items: podium rows stay out, your neighbourhood and resting friends get their own fixed-height sections', () => {
  const week = model.boardModel(dto({ around_me: [{ rank: 61, id: 70, screen_name: 'a', score: 2 }] }), 'week', 5);
  const items = model.listItems(week);
  assert.deepEqual(plain(items.map(i => i.type === 'row' ? i.row.id : i.label)), [10, 5, 'Your spot', 70, '5 riders this week']);
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
    { headline: '14 rides!', line: 'Ride Champ! #1', reward: '+5 Tickets' });
  const low = model.lastWeekCopy({ rank: 20, score: 6, playersCount: 25, title: null, tickets: 0 });
  assert.deepEqual(plain(low), { headline: '6 rides!', line: 'You finished #20', reward: null }, 'leads with rides, no "of 25"');
  const unpaid = model.lastWeekCopy({ rank: 1, score: 9, playersCount: 3, title: null, tickets: 0 });
  assert.deepEqual(plain(unpaid), { headline: '9 rides!', line: 'Great riding!', reward: null });
  for (const copy of [low, unpaid, model.lastWeekCopy({ rank: 1, score: 14, playersCount: 28, title: 'Ride Champ', tickets: 5 })]) {
    assert.doesNotMatch(`${copy.headline} ${copy.line}`, /last week/i, 'the card header says LAST WEEK once; the lines never repeat it');
  }
  assert.doesNotMatch(`${unpaid.headline} ${unpaid.line}`, /won|Champ|#\d/, 'no winner words and no rank for an unpaid podium place');
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
  assert.match(board, /overrideItemLayout=/, 'v3: FlashList with exact fixed row sizes');
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

test('round 4: the review card is for benched kids only, with one number and a calm line', () => {
  const benched = model.boardModel(dto({ me: { rank: null, id: 5, score: 0 }, review: { checking: true, rides: 6, benched: true } }), 'week', 5);
  const line = model.youLine(benched);
  assert.deepEqual(plain(line), { state: 'review', text: 'Keep riding! Your rides are safe.', sub: 'The shark crew is double-checking a ride' });
  assert.equal(model.chaseChip(benched, line.state), null);
  const spoken = model.youLabel(benched, 0);
  assert.equal(spoken, 'Your 6 rides this week are safe. The shark crew is double-checking a ride. Keep riding!');
  assert.doesNotMatch(spoken, /\b0\b|new/, 'no "0" and no "new" for a benched kid');
  const notBenched = model.boardModel(dto({ review: { checking: true, rides: 6, benched: false } }), 'week', 5);
  assert.equal(model.youLine(notBenched).state, 'chasing', 'one flag keeps the normal card and chase');
  assert.match(model.youLabel(model.boardModel(dto(), 'week', 5), 4), /^You are number 5 with 8\. 2 more rides to pass gr8scott! Up 4 places\.$/);

  const join = model.boardModel(dto({ me: { rank: null, id: 5, score: 0 } }), 'week', 5);
  assert.equal(model.chaseChip(join, model.youLine(join).state), '+1');
  assert.deepEqual(plain(model.winNote({ counted: true, week_rides: 8, goals_reached: [{ goal: 8, xp: 25 }] })), { text: 'Weekly goal: 8 rides! +25 XP', big: true });
  assert.deepEqual(plain(model.winNote({ counted: true, week_rides: 5, goals_reached: [] })), { text: '5 rides this week!', big: false });
  assert.equal(model.winNote({ counted: false, week_rides: 4 }), null);
});

test('round 4: the goal note waits for the end of the coin reveal', () => {
  const cache = loadTs('src/screens/LeaderboardsScreen/standingsCache.ts');
  const shown = [];
  cache.parkWinNote({ text: 'Weekly goal: 8 rides! +25 XP', big: true }, note => shown.push(note.text));
  assert.equal(cache.takeWinNote().text, 'Weekly goal: 8 rides! +25 XP');
  assert.equal(cache.takeWinNote(), null, 'shown once');
  const modal = read('src/components/PostWinRewardsModal.tsx');
  assert.match(modal, /if \(!caught \|\| !visible\) return;\s+const note = takeWinNote\(\);/);
  assert.doesNotMatch(read('src/api/endpoints/me/task-attempts.ts'), /setTimeout\(\(\) => showToast/, 'no fixed timer');
});

test('round 3 wiring: the Monday card always releases the queued climb, the climb plays where you can see it', () => {
  const board = read('src/screens/LeaderboardsScreen/StandingsBoardV2.tsx');
  assert.equal((board.match(/onClose=\{closeResults\}/g) || []).length, 2, 'both results-card paths go through closeResults');
  assert.doesNotMatch(board, /onClose=\{\(\) => \{ setResults\(false\)/);
  assert.match(board, /const hideYou = !active \|\| \(!climbing && /);
  assert.doesNotMatch(board, /position: 'absolute', top: -46/, 'the ticker plays inside your card, never over a row');
  assert.match(board, /\{`Up \$\{climb\}!`\}/, '"Up N!" lives in the rank column');
  assert.match(board, /onClimbDone=\{\(\) => \{ setClimbing\(false\); setClimb\(0\); setPassed\(\[\]\); \}\}/, 'the climb resets, so a same-size climb plays again');
  assert.match(board, /\}, \[climbId\]\);/);
  assert.match(read('src/screens/LeaderboardsScreen/StandingsShark.tsx'), /fadeDuration=\{0\}/);
  assert.match(read('src/screens/LeaderboardsScreen/MiniPodium.tsx'), /barrel-flipped\.png/);
  assert.match(read('src/api/endpoints/me/task-attempts.ts'), /winNote\(/);
});

test('round 5: your row visibility from geometry, the goal note held while the win screen is open', () => {
  assert.equal(model.rowOnScreen(300, 64, 0, 600), true);
  assert.equal(model.rowOnScreen(560, 64, 0, 600), true, '40 of 64 pt showing is enough');
  assert.equal(model.rowOnScreen(580, 64, 0, 600), false);
  assert.equal(model.rowOnScreen(300, 64, 400, 600), false, 'scrolled past');
  assert.equal(model.rowOnScreen(300, 64, 0, 0), false, 'not laid out yet');

  const cache = loadTs('src/screens/LeaderboardsScreen/standingsCache.ts');
  cache.holdWinNotes(true);
  cache.parkWinNote({ text: 'Weekly goal: 3 rides! +10 XP', big: true }, () => assert.fail('the fallback must wait while the win screen is open'));
  cache.holdWinNotes(false);
  assert.equal(cache.takeWinNote().text, 'Weekly goal: 3 rides! +10 XP');

  const board = read('src/screens/LeaderboardsScreen/StandingsBoardV2.tsx');
  assert.match(board, /list\.current\?\.recordInteraction\(\);/, 'an activated board wakes its list');
  assert.match(board, /drawDistance=\{active \? ROW_HEIGHT \* 12 : ROW_HEIGHT \* 3\}/, 'v3: a hidden tab draws only near its viewport');
  const screen = read('src/screens/LeaderboardScreen.tsx');
  assert.match(screen, /translateX: -pillX\.value \* segment/, 'a navy label row is clipped to the pill and follows its edge');
  assert.match(screen, /overflow: 'hidden' \}, pill\]/);
  assert.match(board, /if \(becameActive\) setSnapId/, 'the You card snaps only on the hidden-to-active edge; refreshes spring');
  const stats = read('src/components/Stats.tsx');
  // RC: Stats is profile-v2's (hideBalances, visibleCount) plus standings' profile_limited rule.
  assert.match(stats, /hideBalances \|\| limited \? null : visibleCount\(player\.visited_parks_count\)/, 'a stranger profile hides Parks');
  assert.match(stats, /Number\.isFinite\(n\) \? n : null/, 'no number can crash toLocaleString (a hidden value drops its tile)');
  const modal = read('src/components/PostWinRewardsModal.tsx');
  assert.ok(modal.indexOf('{(noteSlot || goalNote) && (') > modal.indexOf('<View style={styles.footer}>'), 'the goal note sits in the footer flow');
  assert.match(modal, /setNoteSlot\(visible && hasWinNote\(\)\)/, 'its slot is reserved before it lands, so the list never shrinks');
  assert.match(read('src/components/OfflineBanner.tsx'), /ROUTE_EXTRA_TOP[^\n]*Leaderboard: 66/);
});

test('r6 follow-up: the tab pill is one inner tab wide, the goal note settles dimmed instead of leaving a gap', () => {
  assert.deepEqual(plain(model.tabPillGeometry(372, 3)), { inner: 360, segment: 120 });
  assert.deepEqual(plain(model.tabPillGeometry(372, 4)), { inner: 360, segment: 90 });
  assert.deepEqual(plain(model.tabPillGeometry(0, 3)), { inner: 0, segment: 0 });
  const screen = read('src/screens/LeaderboardScreen.tsx');
  assert.match(screen, /tabPillGeometry\(width, tabs\.length\)/);
  assert.match(screen, /width: segment,/, 'the pill fills exactly one tab');
  const modal = read('src/components/PostWinRewardsModal.tsx');
  assert.doesNotMatch(modal, /setTimeout\(\(\) => setGoalNote\(null\)/, 'the note never vanishes mid-screen');
  assert.match(modal, /withTiming\(GOAL_NOTE_SETTLED_OPACITY/);
  assert.match(modal, /accessibilityLiveRegion=\{noteSettled \? 'none' : 'polite'\}/, 'the settled copy is not announced twice');
});

test('r6 follow-up: a held podium week gets a "being checked" card, never a prize it might not get', () => {
  const held = model.lastWeekCopy({ rank: 1, score: 26, playersCount: 30, title: null, tickets: 0, held: true });
  assert.deepEqual(plain(held), { headline: '26 rides!', line: 'Top 3! The shark crew is checking your week.', reward: null });
  assert.doesNotMatch(held.line, /Ticket|#1|Champ/);
  const paidLater = model.lastWeekCopy({ rank: 1, score: 26, playersCount: 30, title: 'Ride Champ', tickets: 5, held: false });
  assert.deepEqual(plain(paidLater), { headline: '26 rides!', line: 'Ride Champ! #1', reward: '+5 Tickets' });
  const board = model.boardModel({ board: 'week', rows: [], last_week: { week_start: '2026-09-28', rank: 1, score: 26, players_count: 30, title: null, tickets: 0, held: true, seen: false } }, 'week', 5);
  assert.equal(board.lastWeek.held, true);
});
