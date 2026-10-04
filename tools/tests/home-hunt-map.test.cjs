'use strict';
/**
 * Home map: the Hunt Points chip and the neutral zero line, the one rank line,
 * "Report this spot", the once-per-session safety line, and the team race bar
 * staying hidden when the server does not send the flag.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs, read } = require('./helpers/load-ts.cjs');
const { plain } = require('./helpers/plain.cjs');

const map = loadTs('src/screens/ExploreScreen/homeHuntMap.ts');
const rank = loadTs('src/screens/ExploreScreen/homeHuntRankStore.ts');
const bar = loadTs('src/components/home/homeLiveBar.ts');
const copy = loadTs('src/constants/homeHuntCopy.ts');

test('the chip reads +14 HUNT POINTS, and zero shows the server line verbatim', () => {
  assert.deepEqual(plain(map.huntPointsChip({ points: 14, line: '+14 HUNT POINTS' })), { kind: 'points', text: '+14 HUNT POINTS' });
  assert.deepEqual(plain(map.huntPointsChip({ points: 0, line: 'Daily Standings max reached. Finds still pay rewards.' })),
    { kind: 'line', text: 'Daily Standings max reached. Finds still pay rewards.' });
  assert.equal(map.huntPointsChip(null), null);
  assert.equal(map.huntPointsChip(undefined), null);
});

test('the neutral zero line is exact', () => {
  assert.equal(map.NEUTRAL_ZERO_LINE, "This find didn't count toward Standings this week.");
  assert.equal(copy.HOME_HUNT_COPY.neutralZeroLine, map.NEUTRAL_ZERO_LINE);
  assert.equal(map.huntPointsChip({ points: 0 }).text, "This find didn't count toward Standings this week.");
  assert.equal(copy.HOME_HUNT_COPY.unranked, 'Not ranked this week.');
  assert.equal(copy.HOME_HUNT_COPY.dailyCapLine, 'Daily Standings max reached. Finds still pay rewards.');
});

test('the rank line shows only when the server sends it', () => {
  assert.equal(map.huntRankLine({ rank_line: '#12 Orlando Area · 340 pts' }), '#12 Orlando Area · 340 pts');
  assert.equal(map.huntRankLine({ rank_line: null }), null);
  assert.equal(map.huntRankLine({}), null);
  assert.equal(map.huntRankLine(null), null);
  const seen = [];
  const off = rank.subscribeHomeHuntRankLine(line => seen.push(line));
  assert.equal(rank.getHomeHuntRankLine(), null);
  rank.setHomeHuntRankLine('#3 Orlando Area');
  rank.setHomeHuntRankLine('#3 Orlando Area');
  rank.setHomeHuntRankLine('');
  off();
  assert.deepEqual(plain(seen), ['#3 Orlando Area', null]);
  const card = read('src/screens/ExploreScreen/HomeMapStatusCard.tsx');
  assert.match(card, /if \(!line\) return null/);
  assert.match(read('src/screens/ExploreScreen/HomeExplore.tsx'), /navigate\('Leaderboard', \{ tab: 'home_hunt' \}\)/);
});

test('the team race bar stays hidden when the server does not send the field', () => {
  assert.equal(bar.homeLiveBar({}, false), null);
  assert.equal(bar.homeLiveBar({ home_hunt_board_enabled: false }, false), null);
  assert.equal(bar.homeLiveBar({ home_hunt_board_enabled: undefined }, false), null);
  assert.equal(bar.homeLiveBar({ home_hunt_board_enabled: true }, false), 'teams');
  assert.equal(bar.homeLiveBar({}, true), 'raid');
  assert.equal(bar.homeLiveBar(null, false), null);
});

test('Report this spot offers Unsafe, Private property and Other, sent as unsafe, private, other', () => {
  assert.deepEqual(plain(map.REPORT_REASONS), [
    { reason: 'unsafe', label: 'Unsafe' }, { reason: 'private', label: 'Private property' }, { reason: 'other', label: 'Other' },
  ]);
  assert.equal(copy.HOME_HUNT_COPY.reportTitle, 'Report this spot');
  assert.match(read('src/components/map/Marker.tsx'), /onLongPress=\{onLongPress\}/);
  // Home Hunt v3 (kids UX, Oct 2): a long-press on a find is a tap. The report opens from the tapped find's peek
  // ("Report" link), never from a press on the map itself.
  const explore = read('src/screens/ExploreScreen/HomeExplore.tsx');
  assert.match(read('src/screens/ExploreScreen/HomeFindMarker.tsx'), /onPress=\{press\} onLongPress=\{press\}/);
  assert.match(explore, /onPress: \(\) => reportSpot\(pivot\)/);
  assert.doesNotMatch(explore, /onLongPress=\{[^}]*reportSpot/);
  const api = read('src/api/endpoints/me/homeHunt.ts');
  assert.match(api, /\/me\/prep-items\/\$\{pivotId\}\/report/);
});

test('the safety line shows once per session, on the first rare or better find', () => {
  assert.equal(map.SAFETY_LINE, 'Stay on sidewalks and paths. Never go onto private property.');
  assert.equal(copy.HOME_HUNT_COPY.safetyLine, map.SAFETY_LINE);
  assert.equal(map.shouldShowSafetyLine(2, false), false);
  assert.equal(map.shouldShowSafetyLine(3, false), true);
  assert.equal(map.shouldShowSafetyLine(5, false), true);
  assert.equal(map.shouldShowSafetyLine(5, true), false);
  assert.equal(map.shouldShowSafetyLine(undefined, false), false);
});
