'use strict';
/**
 * Home Hunt Standings tab: three tabs when the server flag is off, four when
 * it is on; the flag comes from one cached GET /me/home-hunt/week; Near Me
 * rows show the server's `name` (the approved username) and rank only and never
 * open a profile; there is no age question and no Hunter Name; this wave never
 * asks for notification permission.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs, read } = require('./helpers/load-ts.cjs');
const { plain } = require('./helpers/plain.cjs');

const model = loadTs('src/screens/LeaderboardsScreen/homeHuntModel.ts');

test('tab count is 3 when the flag is off and 4 when it is on', () => {
  assert.equal(model.standingsTabs(false).length, 3);
  assert.equal(model.standingsTabs(true).length, 4);
  assert.deepEqual(plain(model.standingsTabs(false).map(tab => tab.key)), ['coins', 'rides', 'xp']);
  assert.deepEqual(plain(model.standingsTabs(true).map(tab => tab.key)), ['coins', 'rides', 'xp', 'hunt']);
  assert.equal(model.standingsTabs(true)[3].label, 'Home Hunt');
});

test('a deep link opens the Home Hunt tab only when it exists', () => {
  assert.equal(model.initialStandingsTab('home_hunt', model.standingsTabs(true)), 3);
  assert.equal(model.initialStandingsTab('home_hunt', model.standingsTabs(false)), 0);
  assert.equal(model.initialStandingsTab(undefined, model.standingsTabs(true)), 0);
});

test('LeaderboardScreen builds its tabs from the flag and mounts Home Hunt', () => {
  const source = read('src/screens/LeaderboardScreen.tsx');
  assert.match(source, /standingsTabs\(huntOn\)/);
  assert.match(source, /loadHomeHuntWeek\(/);
  assert.match(source, /<HomeHunt \/>/);
  assert.doesNotMatch(source, /const TABS/);
});

test('near me rows show the board name and rank only and never open a profile', () => {
  const row = {
    rank: 4, name: 'coaster_fan', points: 340, finds: 12, is_me: false,
    // A misbehaving server must still not leak an id or another name into a Near Me row.
    username: 'realperson', screen_name: 'RealPerson', user_id: 991, avatar_url: 'https://x/a.png', inventory: null,
    latitude: 28.5, longitude: -81.3,
  };
  const view = plain(model.huntRowModel(row, 'zone'));
  assert.equal(view.name, 'coaster_fan');
  assert.equal(view.rank, 4);
  assert.equal(view.playerId, null);
  assert.equal(view.avatar.screen_name, 'coaster_fan');
  assert.ok(view.avatar.id < 0, 'near me avatars use a negative placeholder id');
  const text = JSON.stringify(view);
  assert.ok(!text.includes('realperson') && !text.includes('RealPerson') && !text.includes('991'));
  assert.ok(!text.includes('28.5') && !text.includes('-81.3'), 'no coordinates');
});

test('friends rows may open the friend profile', () => {
  const view = plain(model.huntRowModel({ rank: 2, name: 'Pat', points: 10, finds: 1, user_id: 77 }, 'friends'));
  assert.equal(view.playerId, 77);
  assert.equal(view.avatar.id, 77);
});

test('the sticky You row and podium split come from the board', () => {
  const board = { kind: 'zone', rows: [1, 2, 3, 4, 5].map(rank => ({ rank, name: `H${rank}`, points: 100 - rank, finds: rank })),
    me: { rank: 9, name: 'shark_me', points: 40, finds: 3 } };
  const me = model.huntMeRow(board, 'zone');
  assert.equal(me.name, 'shark_me');
  assert.equal(me.isMe, true);
  const slots = model.huntPodium(model.huntRows(board, 'zone'));
  assert.deepEqual(plain(slots.podium.map(p => p && p.rank)), [1, 2, 3]);
  assert.deepEqual(plain(slots.rest.map(p => p.rank)), [4, 5]);
  assert.equal(model.huntMeRow({ me: null }, 'zone'), null);
  assert.equal(model.huntRows(undefined, 'zone').length, 0);
});

test('tier progress, countdown and rank movement', () => {
  assert.equal(model.tierProgressLine({ next_tier: { label: 'Top 25%', points_needed: 18 } }), '18 points to Top 25%');
  assert.equal(model.tierProgressLine({ next_tier: { label: 'Top 25%', points_needed: 1 } }), '1 point to Top 25%');
  assert.equal(model.tierProgressLine({ unranked: true }), 'Not ranked this week.');
  assert.equal(model.tierProgressLine({ tier: { key: 'hunter', label: 'Hunter' }, next_tier: null }), 'Hunter tier');
  const now = Date.parse('2026-11-02T00:00:00Z');
  assert.equal(model.countdownText('2026-11-05T04:30:00Z', now), '3d 4h');
  assert.equal(model.countdownText('2026-11-02T05:12:00Z', now), '5h 12m');
  assert.equal(model.countdownText('2026-11-02T00:09:00Z', now), '9m');
  assert.equal(model.countdownText('2026-11-01T00:00:00Z', now), 'Ended');
  assert.equal(model.countdownText(null, now), '');
  assert.equal(model.rankMovement(12, 9), 'up');
  assert.equal(model.rankMovement(9, 12), 'down');
  assert.equal(model.rankMovement(null, 9), 'same');
});

test('there is no age question and no Hunter Name anywhere in the app', () => {
  assert.equal(model.shouldAskAge, undefined);
  assert.equal(model.birthYearOptions, undefined);
  const fs = require('node:fs');
  const path = require('node:path');
  assert.equal(fs.existsSync(path.join(__dirname, '../../src/screens/LeaderboardsScreen/HomeHuntAgeSheet.tsx')), false);
  for (const file of ['src/screens/LeaderboardsScreen/HomeHunt.tsx', 'src/screens/LeaderboardsScreen/homeHuntModel.ts',
    'src/api/endpoints/me/homeHunt.ts', 'src/constants/homeHuntCopy.ts']) {
    assert.doesNotMatch(read(file), /birth_?year|needs_age|age_skipped|AgeSheet|ageQuestion|hunter_name|Hunter Name|reroll/i, file);
  }
});

test('everyone can turn Near Me off, it defaults on, and the nudge defaults off', () => {
  const fresh = model.huntSettingsState({ board_name: 'shark_me' });
  assert.equal(fresh.visibilityValue, true);
  assert.equal(fresh.nudgeValue, false);
  assert.equal(fresh.boardName, 'shark_me');
  assert.equal(fresh.namePending, false);
  const off = model.huntSettingsState({ board_name: 'Player', near_me_visible: false, friend_nudge_enabled: true });
  assert.equal(off.visibilityValue, false);
  assert.equal(off.nudgeValue, true);
  assert.equal(off.namePending, true);
  assert.equal(model.huntSettingsState(null).boardName, '--');
  assert.match(read('src/screens/LeaderboardsScreen/HomeHunt.tsx'), /value=\{settings\.visibilityValue\} disabled=\{savingSettings\}/,
    'the Near Me toggle is never locked');
  assert.equal(model.settingsErrorMessage({ response: { data: { message: 'Could not save' } } }, 'x'), 'Could not save');
  assert.equal(model.settingsErrorMessage(new Error('boom'), 'fallback'), 'fallback');
});

test('this wave saves the friend nudge preference and never asks for notification permission', () => {
  for (const file of ['src/screens/LeaderboardsScreen/HomeHunt.tsx',
    'src/screens/LeaderboardsScreen/homeHuntModel.ts', 'src/api/endpoints/me/homeHunt.ts']) {
    assert.doesNotMatch(read(file), /requestPermissions|expo-notifications|requestPermissionsAsync/, file);
  }
  assert.match(read('src/screens/LeaderboardsScreen/HomeHunt.tsx'), /friend_nudge_enabled: value/);
});

test('near me rows are not interactive and the screen never reads a username', () => {
  const source = read('src/screens/LeaderboardsScreen/HomeHunt.tsx');
  assert.match(source, /const interactive = view === 'friends'/);
  assert.doesNotMatch(source, /username|\.screen_name|user_id/);
});

test('the week answer is cached once, errors are not cached, and another player starts clean', async () => {
  let calls = 0;
  let fail = false;
  const api = { getHomeHuntWeek: async () => { calls += 1; if (fail) throw new Error('offline'); return { enabled: true, week_key: '2026-W45' }; } };
  const cache = loadTs('src/screens/LeaderboardsScreen/homeHuntWeekCache.ts', { '../../api/endpoints/me/homeHunt': api });
  assert.equal(cache.homeHuntEnabled(cache.cachedHomeHuntWeek()), false);
  const first = await cache.loadHomeHuntWeek(1);
  const second = await cache.loadHomeHuntWeek(1);
  assert.equal(calls, 1);
  assert.equal(cache.homeHuntEnabled(first), true);
  assert.equal(second.week_key, '2026-W45');
  await cache.loadHomeHuntWeek(1, true);
  assert.equal(calls, 2);
  await cache.loadHomeHuntWeek(2);
  assert.equal(calls, 3, 'a different player does not reuse the cache');
  cache.resetHomeHuntWeekCache();
  fail = true;
  assert.equal(await cache.loadHomeHuntWeek(3), null);
  fail = false;
  await cache.loadHomeHuntWeek(3);
  assert.equal(calls, 5, 'a failed read is retried');
  assert.equal(cache.homeHuntEnabled({ enabled: false }), false);
  assert.equal(cache.homeHuntEnabled(null), false);
});

test('info sheet shows the server lines verbatim and omits empty sections', () => {
  const info = loadTs('src/components/home/homeHuntInfoModel.ts');
  const sections = plain(info.standingsInfoSections({
    odds_lines: ['Each item that appears: Common 55%.'], point_lines: ['Any home find: 5 points.'], tiebreak_lines: [],
    tier_lines: ['Hunter: 60+ points.'], fairness_line: 'Free and VIP rank the same.',
  }));
  assert.deepEqual(sections.map(section => section.key), ['points', 'tiers', 'fairness', 'odds']);
  assert.deepEqual(sections.find(section => section.key === 'odds').lines, ['Each item that appears: Common 55%.']);
  assert.equal(info.standingsInfoSections(null).length, 0);
  assert.equal(info.oddsInfoSections({ odds_lines: ['a'] }).length, 1);
});
