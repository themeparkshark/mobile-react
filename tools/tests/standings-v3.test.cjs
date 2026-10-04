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

test('the one line: the top 10 when it is 3 rides or fewer away, else pass the next player', () => {
  const base = { board: 'week', metric: 'ride_wins' };
  const at11 = { ...base, me: { rank: 11, score: 10 }, chase: { name: 'p1010', toPass: 1, tied: false }, rows: [{ rank: 10, score: 10 }] };
  assert.equal(model.topTenGap(at11), 1, 'ties go to whoever got there first, so one more');
  assert.equal(model.youLine(at11).text, '1 more ride to make the top 10');
  const leap = { ...base, me: { rank: 30, score: 5 }, chase: { name: 'p1029', toPass: 1, tied: false }, rows: [{ rank: 10, score: 7 }] };
  assert.equal(model.youLine(leap).text, '3 more rides to make the top 10', 'a short hop over many players reads as the top 10');
  const far = { ...base, me: { rank: 14, score: 16 }, chase: { name: 'p1013', toPass: 2, tied: false }, rows: [{ rank: 10, score: 20 }] };
  assert.equal(model.youLine(far).text, '2 more rides to pass p1013', '5 rides from the top 10: pass the next player instead');
  const notLoaded = { ...base, me: { rank: 140, score: 2 }, chase: { name: 'p1139', toPass: 1, tied: false }, rows: [] };
  assert.equal(model.youLine(notLoaded).text, '1 more ride to pass p1139');
  assert.equal(model.topTenGap({ me: { rank: 4, score: 30 }, rows: [{ rank: 10, score: 3 }] }), null, 'already in the top 10');
  const tied = { ...base, me: { rank: 11, score: 10 }, chase: { name: 'p1010', toPass: 1, tied: true }, rows: [{ rank: 10, score: 10 }] };
  assert.equal(model.youLine(tied).state, 'tied', 'a tie keeps its own line');
  const board = model.boardModel(firstPage(), 'week', 5);
  assert.match(model.youLine(board).text, /^2 more rides to pass p1119$/, 'the screen passes rows, so the line sees #10');
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
  assert.match(board, /getItemType=\{\(item: ListItem\) => item\.type\}/, 'rows, dividers and placeholders recycle separately');
  assert.match(board, /estimatedItemSize=\{ROW_HEIGHT\}/);
  assert.match(board, /shouldPrefetch\(lastVisible\.current, itemsRef\.current\)\) moreRef\.current\('scroll'\)/);
  assert.match(board, /onEndReached=/, 'a fling past the prefetch point still loads');
  assert.match(board, /InteractionManager\.runAfterInteractions\(\(\) => moreRef\.current\('idle'\)\)/, 'page 2 is fetched while the kid looks at the podium');
  assert.match(board, /\}, \[active, firstPageOnly\]\);/, 'also for a board served from the warm cache');
  assert.match(board, /item\.type === 'skeleton'\) return <SkeletonRow \/>/);
  const shark = read('src/screens/LeaderboardsScreen/StandingsShark.tsx');
  assert.match(shark, /recyclingKey=/, 'a recycled row never flashes the last face');
  assert.match(shark, /cachePolicy="memory-disk"/);
  assert.doesNotMatch(shark, /<Avatar /, 'rows skip the badge-heavy Avatar');
  const store = read('src/screens/LeaderboardsScreen/standingsV2Store.ts');
  assert.match(store, /export function loadMore\(/);
  assert.match(store, /pagesInFlight/, 'one page request per board at a time');
  assert.match(store, /mergeRefresh\(boardModel\(dto, board, meId\), boards\.get\(key\)\?\.model\)/);
  assert.match(store, /latest\.model\.nextOffset !== offset\) return/, 'a page that lands after a refresh or sign-out is dropped');
  const perf = read('src/screens/LeaderboardsScreen/standingsPerf.tsx');
  assert.match(perf, /process\.env\.EXPO_PUBLIC_STANDINGS_PERF === '1'/, 'bundle-time constant, off unless set');
  assert.match(board, /\{STANDINGS_PERF_ON && active && <StandingsPerfLog/);
  const api = read('src/api/endpoints/me/standings.ts');
  assert.match(api, /params: \{ board, offset,/);
});
