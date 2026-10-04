'use strict';
/**
 * Standings v3 (next-wave/standings-v3/DESIGN.md): one number per row, one
 * line on your pinned row, extras behind a tap, and an infinite list that
 * fetches the next page before the kid reaches the end without moving rows.
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

const row = (rank, id, score, extra = {}) => ({ rank, id, screen_name: `p${id}`, score, ...extra });
const ranked = (from, to, meId) => Array.from({ length: to - from + 1 }, (_, i) => {
  const rank = from + i;
  return row(rank, 1000 + rank, 500 - rank, rank === meId ? { is_me: true } : {});
});
const firstPage = (over = {}) => ({
  board: 'week', metric: 'ride_wins', park_id: null, available: null, players_count: 140,
  week: { starts_at: '2026-09-28T00:00:00-07:00', ends_at: '2026-10-05T00:00:00-07:00' },
  rows: ranked(1, 50), page_size: 50, next_offset: 50,
  around_me: ranked(117, 123).map(r => (r.rank === 120 ? { ...r, id: 5, is_me: true } : r)),
  me: row(120, 5, 380, { is_me: true }),
  chase: { id: 1119, screen_name: 'p1119', rank: 119, score: 381, to_pass: 2, tied: false },
  goals: [{ at: 3, xp: 10, reached: true }, { at: 8, xp: 25, reached: false }, { at: 15, xp: 50, reached: false }],
  ...over,
});

test('a first page knows where the next page starts; older servers mean no paging', () => {
  const m = model.boardModel(firstPage(), 'week', 5);
  assert.equal(m.nextOffset, 50);
  assert.equal(model.boardModel(firstPage({ next_offset: undefined }), 'week', 5).nextOffset, null, 'v2 servers send no next_offset');
  assert.equal(model.boardModel(firstPage({ next_offset: null }), 'week', 5).nextOffset, null);
  assert.equal(model.boardModel(firstPage({ next_offset: 'x' }), 'week', 5).nextOffset, null, 'junk never pages');
  assert.equal(model.onlyFirstPage(m), true);
  assert.equal(model.onlyFirstPage(model.mergePage(m, { rows: ranked(51, 100), next_offset: 100 }, 5)), false, 'page 2 on idle fetches once, not on every tab return');
});

test('grey rows hold the place where the next page lands, before the Your spot block', () => {
  const items = model.listItems(model.boardModel(firstPage(), 'week', 5));
  const types = items.map(i => i.type);
  assert.equal(types.filter(t => t === 'skeleton').length, model.SKELETON_ROWS);
  const firstSkeleton = model.firstSkeletonIndex(items);
  assert.equal(firstSkeleton, 47, '47 list rows under the podium, then the placeholders');
  assert.equal(types[firstSkeleton + model.SKELETON_ROWS], 'divider', 'Your spot comes after the placeholders');
  // Placeholders are row-sized, so filling them never moves anything below.
  const layouts = model.itemLayouts(items);
  assert.equal(layouts[firstSkeleton].length, model.ROW_HEIGHT);
  const none = model.listItems(model.boardModel(firstPage({ next_offset: null, around_me: [] }), 'week', 5));
  assert.equal(model.firstSkeletonIndex(none), -1, 'no placeholders when everyone is loaded');
});

test('prefetch fires about two screens before the grey rows, not at the end', () => {
  const items = model.listItems(model.boardModel(firstPage(), 'week', 5));
  const at = model.firstSkeletonIndex(items);
  assert.equal(model.shouldPrefetch(at - model.PREFETCH_ROWS - 1, items), false);
  assert.equal(model.shouldPrefetch(at - model.PREFETCH_ROWS, items), true);
  assert.ok(model.PREFETCH_ROWS * model.ROW_HEIGHT >= 1800, "at least two and a half phone screens of rows ahead");
  assert.equal(model.shouldPrefetch(999, model.listItems(model.boardModel(firstPage({ next_offset: null }), 'week', 5))), false);
});

test('a page merges in rank order, never shows anyone twice, and empties the Your spot block as it arrives', () => {
  const m = model.boardModel(firstPage(), 'week', 5);
  // The board moved between requests: page 2 overlaps row 50.
  const page = { board: 'week', offset: 50, page_size: 50, next_offset: 100, players_count: 141, rows: ranked(50, 99) };
  const merged = model.mergePage(m, page, 5);
  assert.equal(merged.rows.length, 99);
  assert.equal(new Set(merged.rows.map(r => r.id)).size, 99, 'no duplicates');
  assert.deepEqual(plain(merged.rows.slice(48, 51).map(r => r.rank)), [49, 50, 51]);
  assert.equal(merged.nextOffset, 100);
  assert.equal(merged.playersCount, 141);
  const page3 = { board: 'week', offset: 100, page_size: 50, next_offset: null, players_count: 141,
    rows: ranked(100, 140).map(r => (r.rank === 120 ? { ...r, id: 5, is_me: true } : r)) };
  const all = model.mergePage(merged, page3, 5);
  assert.equal(all.nextOffset, null);
  assert.equal(all.aroundMe.length, 0, 'every Your spot row is now in the list');
  const items = model.listItems(all);
  assert.equal(items.filter(i => i.type === 'divider').length, 0, 'no Your spot divider once the list reaches you');
  assert.equal(items.filter(i => i.type === 'row' && i.row.isMe).length, 1, 'your row shows once');
  const empty = model.mergePage(merged, { rows: [], next_offset: 150 }, 5);
  assert.equal(empty.nextOffset, null, 'an empty page ends the list');
});

test('a background refresh keeps the pages already scrolled (no jump back to 50 rows)', () => {
  const deep = model.mergePage(model.boardModel(firstPage(), 'week', 5), { rows: ranked(51, 100), next_offset: 100 }, 5);
  const fresh = model.boardModel(firstPage(), 'week', 5);
  const kept = model.mergeRefresh(fresh, deep);
  assert.equal(kept.rows.length, 100);
  assert.equal(kept.nextOffset, 100);
  assert.equal(model.mergeRefresh(fresh, null), fresh);
  const otherPark = model.boardModel(firstPage({ board: 'all_time', metric: 'ride_coins', park_id: 8 }), 'all_time', 5);
  assert.equal(model.mergeRefresh(fresh, otherPark), fresh, 'a different board never leaks rows');
});

test('the one next step: top 10 if 3 or fewer away, a weekly goal if 2 or fewer, else the jump past a whole tie block', () => {
  const base = { board: 'week', metric: 'ride_wins' };
  const chase = (over = {}) => ({ name: 'p1010', toPass: 1, tied: false, passes: 1, targetRank: 10, rank: 10, ...over });
  const at11 = { ...base, me: { rank: 11, score: 10 }, chase: chase(), rows: [{ rank: 10, score: 10 }] };
  assert.deepEqual(plain(model.nextStep(at11)), { kind: 'top10', plus: 1, target: 'TOP 10', text: '1 more ride to make the top 10!' });
  const leap = { ...base, me: { rank: 30, score: 5 }, chase: chase({ name: 'p1029', passes: 1, targetRank: 29 }), rows: [{ rank: 10, score: 7 }] };
  assert.equal(model.nextStep(leap).kind, 'jump', 'one ride passes someone; the top 10 is 3 away');
  const block = { ...base, me: { rank: 130, score: 21 }, chase: chase({ name: 'dinoking', tied: true, passes: 23, targetRank: 107 }), rows: [{ rank: 10, score: 37 }] };
  const tie = model.nextStep(block);
  assert.deepEqual(plain(tie), { kind: 'jump', plus: 1, target: '#107', text: '1 more ride jumps you past 23 players!' });
  assert.doesNotMatch(tie.text, /dinoking|got there first/, 'never names who beat you');
  const two = model.nextStep({ ...block, chase: chase({ toPass: 2, passes: 5, targetRank: 125 }) });
  assert.equal(two.text, '2 more rides jump you past 5 players!');
  const goal = model.nextStep({ ...block, me: { rank: 130, score: 7 }, chase: chase({ toPass: 3, passes: 40, targetRank: 90 }),
    goals: [{ at: 3, xp: 10, reached: true }, { at: 8, xp: 25, reached: false }, { at: 15, xp: 50, reached: false }] });
  assert.deepEqual(plain(goal), { kind: 'goal', plus: 1, target: '+25 XP', text: '1 more ride: weekly goal! +25 XP' });
  const leader = model.nextStep({ ...base, me: { rank: 1, score: 50 }, chase: null });
  assert.equal(leader.kind, 'leader');
  const home = model.nextStep({ ...base, me: { rank: null, score: 0 }, chase: null }, false);
  assert.deepEqual(plain(home), { kind: 'join', canRide: false, text: 'Next park day: win 1 ride!' });
  assert.equal(model.nextStep({ ...base, me: { rank: null, score: 0 }, chase: null }, true).canRide, true);
  const parsed = model.boardModel(firstPage({ chase: { id: 1119, screen_name: 'p1119', rank: 119, score: 381, to_pass: 1, tied: true, passes: 12, target_rank: 108 } }), 'week', 5);
  assert.deepEqual(plain([parsed.chase.passes, parsed.chase.targetRank]), [12, 108]);
  const old = model.boardModel(firstPage(), 'week', 5);
  assert.deepEqual(plain([old.chase.passes, old.chase.targetRank]), [1, 119], 'older servers: one player, their rank');
});

test('the tab it opens on: friends racing, else your week, else your collection', () => {
  const friends = (n) => ({ rows: [{ isMe: true, score: 0 }, ...Array.from({ length: n }, () => ({ isMe: false, score: 2 }))] });
  assert.equal(model.defaultStandingsTab({ me: { score: 0 } }, friends(2)), 'friends');
  assert.equal(model.defaultStandingsTab({ me: { score: 4 } }, friends(1)), 'week');
  assert.equal(model.defaultStandingsTab({ me: { score: 0 } }, friends(1)), 'all_time');
  assert.equal(model.defaultStandingsTab(null, friends(3)), null, 'unknown until both boards are in');
  const screen = read('src/screens/LeaderboardScreen.tsx');
  assert.match(screen, /const pick = tabParam \? null : defaultStandingsTab\(/, 'a deep link still wins');
  assert.match(screen, /if \(live && pick && !touched\.current\) setActiveTab/, 'never yanks a tab the kid chose');
});

test('the board: one pill, plain rows, a slim pinned row, no ribbon, goals behind a tap', () => {
  const board = read('src/screens/LeaderboardsScreen/StandingsBoardV2.tsx');
  assert.match(board, /<WeekPill /, 'one pill: Rides won and the clock');
  assert.doesNotMatch(board, /WeekDots|UnitChip|TopRibbon|GoalPips|chaseProgress|chaseChip/, 'no day dots, unit chip, ribbon, goal pips or chase bars');
  assert.doesNotMatch(board, /detail=\{/, 'rows carry no second line');
  assert.match(board, /function YouRow\(/);
  assert.match(board, /const YOU_CARD_HEIGHT = 72;/);
  assert.match(board, /goals=\{card\?\.isMe \? model\.goals : null\}/, 'your goals open from your own row');
  const card = read('src/screens/LeaderboardsScreen/SharkCard.tsx');
  assert.match(card, /row\.isMe && board !== 'all_time' && !!goals\?\.length && <WeekGoals/);
  assert.match(card, /RootNavigation|Modal/, 'still a modal card');
  assert.doesNotMatch(card, /avatar_url|park_id|current_park/, 'kid safety: the card adds no photo or place');
});

test('smooth: FlashList recycling, prefetch on view, skeleton rows, cached faces, perf probe off by default', () => {
  const board = read('src/screens/LeaderboardsScreen/StandingsBoardV2.tsx');
  assert.match(board, /createAnimatedComponent\(FlashList<ListItem>\)/);
  assert.match(board, /getItemType=\{typeOfItem\}/, 'rows, dividers and placeholders recycle separately');
  assert.match(board, /const typeOfItem = \(item: ListItem\) => item\.type;/, 'list props are module constants');
  assert.match(board, /estimatedItemSize=\{ROW_HEIGHT\}/);
  assert.match(board, /shouldPrefetch\(lastVisible\.current, itemsRef\.current, firstVisible\.current\)\) moreRef\.current\('scroll'\)/);
  assert.match(board, /onEndReached=/, 'a fling past the prefetch point still loads');
  assert.match(board, /InteractionManager\.runAfterInteractions\(\(\) => moreRef\.current\('idle'\)\)/, 'page 2 is fetched while the kid looks at the podium');
  assert.match(board, /\}, \[active, firstPageOnly\]\);/, 'also for a board served from the warm cache');
  assert.match(board, /item\.type === 'skeleton'\) return <SkeletonRow first=\{item\.key === 'skeleton-0'\} \/>/);
  assert.match(board, /accessibilityLabel=\{first \? 'Loading more players' : undefined\}/, 'VoiceOver hears the list is loading');
  assert.match(board, /item\.type === 'retry'\) return <RetryRow onPress=\{\(\) => moreRef\.current\('tap'\)\} \/>/, 'after 3 failures: tap to load more');
  assert.match(board, /retryAt\.current = Date\.now\(\) \+ Math\.min\(8000, 1000 \* 2 \*\* \(failures\.current - 1\)\);/, 'failed pages back off');
  const shark = read('src/screens/LeaderboardsScreen/StandingsShark.tsx');
  const store = read('src/screens/LeaderboardsScreen/standingsV2Store.ts');
  assert.match(shark, /key=\{`\$\{id\}:\$\{layerKeys\[index\]\}`\}/, 'r2: layer views keyed by player and art, never reused across players');
  assert.match(shark, /!usePhoto && layers\.length < 2 \? \(/, 'no skin decoded: the color shark, never a floating outfit');
  assert.match(shark, /useFaceLayers\(sources, faceBucket\(facePoints\(size\)\)\)/, 'layers drawn from bitmaps decoded at the drawn size');
  const layers = read('src/screens/LeaderboardsScreen/faceLayers.ts');
  assert.match(layers, /ExpoImage\.loadAsync\(\{ uri \}, \{ maxWidth: px \}\)/);
  assert.match(layers, /const MAX_BYTES = 24 \* 1024 \* 1024;/, 'a cache bounded in bytes');
  assert.match(layers, /const MAX_RUNNING = 4;/, 'at most 4 decodes at once');
  assert.match(store, /prefetchLayers\(faceLayerSources\(inv\), facePoints\(40\)\)/, 'the next page decodes its faces before its rows show');
  assert.match(store, /prefetchFaces\(incoming\.slice\(0, 20\)/, 'exactly the new rows, the first 20 (r2: an empty page decodes nothing)');
  assert.doesNotMatch(shark, /<Avatar /, 'rows skip the badge-heavy Avatar');
  assert.match(store, /export function loadMore\(/);
  assert.match(store, /pagesInFlight/, 'one page request per board at a time');
  assert.match(store, /mergeRefresh\(boardModel\(dto, board, meId\), boards\.get\(key\)\?\.model\)/);
  assert.match(store, /if \(owner !== meId\) return null;/, 'a page that lands after a sign-out is dropped');
  assert.match(store, /getStandingsPage\(board, board === 'all_time' \? parkId \?\? null : null, offset, from\.build\)/, 'later pages read the first page\'s build');
  const perf = read('src/screens/LeaderboardsScreen/standingsPerf.tsx');
  assert.match(perf, /process\.env\.EXPO_PUBLIC_STANDINGS_PERF === '1'/, 'bundle-time constant, off unless set');
  assert.match(board, /\{STANDINGS_PERF_ON && active && <StandingsPerfLog/);
  const api = read('src/api/endpoints/me/standings.ts');
  assert.match(api, /params: \{ board, offset,/);
});

test('a page never lands above what the kid is looking at', () => {
  const m = model.boardModel(firstPage(), 'week', 5);
  const items = model.listItems(m);
  const gap = model.firstSkeletonIndex(items);
  const me = items.findIndex(i => i.type === 'row' && i.row.isMe);
  assert.ok(me > gap, 'Your spot sits below the grey rows');
  assert.equal(model.safeToInsert(0, items), true, 'at the top: pages land below');
  assert.equal(model.safeToInsert(gap, items), true, 'grey rows on screen: they fill in place');
  assert.equal(model.safeToInsert(gap + model.SKELETON_ROWS, items), false, 'down in Your spot: the page waits');
  assert.equal(model.shouldPrefetch(me + 3, items, me - 2), false, 'no fetch from the Your spot block');
  assert.equal(model.shouldPrefetch(gap - 5, items, gap - 12), true);
  assert.equal(model.safeToInsert(999, model.listItems(model.boardModel(firstPage({ next_offset: null }), 'week', 5))), true);
  const board = read('src/screens/LeaderboardsScreen/StandingsBoardV2.tsx');
  assert.match(board, /if \(canInsert\(\)\) \{\s+apply\(next\);/);
  assert.match(board, /heldPage\.current = next;/);
  assert.match(board, /\/\/ A new board, park or refresh: a page held for the old one must never land on it\.\s+heldPage\.current = null;/, 'r2: a held page never lands on another board');
  const store = read('src/screens/LeaderboardsScreen/standingsV2Store.ts');
  assert.doesNotMatch(store.slice(store.indexOf('export function loadMore'), store.indexOf('export function commitBoard')), /boards\.set\(/, 'a page is cached only once the screen shows it');
  assert.match(board, /if \(heldPage\.current && canInsertRef\.current\(\)\)/, 'a held page lands when the kid scrolls back up');
  assert.match(board, /const onEndReached = useCallback\(\(\) => \{ if \(activeRef\.current && canInsert\(\)\) moreRef\.current\('end'\); \}/);
  assert.match(board, /Date\.now\(\) >= jumpingUntil\.current && safeToInsert\(/, 'nothing lands while show-my-row is animating');
  assert.match(board, /jumpingUntil\.current = Date\.now\(\) \+ 1200;\s+if \(myIndex >= 0\) list\.current\?\.scrollToIndex/);
  assert.doesNotMatch(board, /pendingAnchor|anchorShift/);
});

test('face bitmaps come in a few pixel sizes, never the 1353 px art', () => {
  const fl = loadTs('src/screens/LeaderboardsScreen/faceLayers.ts', {
    'expo-image': { Image: { loadAsync: async () => ({}) } },
    'react-native': { Image: { resolveAssetSource: () => ({ uri: 'file:///a.png' }) }, PixelRatio: { get: () => 3 } },
  });
  assert.equal(fl.faceBucket(48, 3), 192, 'a 40 pt row face');
  assert.equal(fl.faceBucket(52.8, 3), 192, 'your pinned row shares that decode');
  assert.equal(fl.faceBucket(86.4, 3), 288, 'podium');
  assert.equal(fl.faceBucket(144, 3), 480, 'the shark card');
  assert.equal(fl.faceBucket(1000, 3), 768, 'capped at the card portrait size');
});

test('r2 capture fixes: Up N is never clipped, the dock never overshoots', () => {
  const board = read('src/screens/LeaderboardsScreen/StandingsBoardV2.tsx');
  assert.match(board, /style=\{\{ position: 'absolute', top: -27, left: -18, width: 80, alignItems: 'center' \}\}/, 'the Up badge is wider than the rank column');
  assert.match(board, /translateY: Math\.max\(0, 1 - shown\.value\)/, 'the dock never rises above its rest spot');
});
