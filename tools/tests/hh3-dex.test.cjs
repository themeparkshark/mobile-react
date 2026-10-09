'use strict';
/**
 * Home Hunt v3 collection book ("dex"): works against today's production
 * payloads, adopts the optional v3 dex fields, and shows one clear
 * "Finish the set: get X" reward with its claim state. Ride Photos show the
 * best grade with a frame per grade.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs, read, root } = require('./helpers/load-ts.cjs');
const { plain } = require('./helpers/plain.cjs');

const dex = loadTs('src/screens/SetCollection/dexModel.ts');
const EM_DASH = new RegExp(String.fromCharCode(0x2014));

const legacySet = (extra = {}) => ({
  id: 1, slug: 'night_lights', name: 'Night Lights', description: 'After sunset.', icon_url: null, theme: 'night',
  theme_config: { label: 'Night', color: '#3F51B5' }, rarity: 'rare', is_focused: false, time_gate: null, weather_gate: null,
  total_items: 40, collected_count: 12, progress_percentage: 30, is_complete: false, spare_count: 3, exchange_cost: 4,
  rewards_claimed: false, starter_milestone: null,
  completion_rewards: { energy: 200, tickets: 3, experience: 1000, title: 'Night Navigator', badge_url: null },
  ...extra,
});

const legacyItem = (id, rarity, extra = {}) => ({
  id, name: `Item ${id}`, variant_slug: `flashlight_${id}`, description: `Flavor ${id}`, icon_url: null, rarity,
  rarity_name: 'x', rarity_label: 'x', rarity_color: '#000', rewards: {}, is_collected: false, quantity_collected: 0,
  first_collected_at: null, last_collected_at: null, ...extra,
});

test('a legacy set (production today) becomes a book page with a clear finish-the-set reward', () => {
  const set = plain(dex.fromLegacySet(legacySet()));
  assert.equal(set.color, '#3F51B5');
  assert.equal(set.found, 12);
  assert.equal(set.total, 40);
  assert.equal(set.status, 'active');
  assert.equal(set.reward.status, 'locked');
  assert.equal(set.reward.label, 'Finish the set: get 200 Energy, 3 Tickets, 1000 XP and the Night Navigator title');
  assert.deepEqual(set.reward.claim, { kind: 'complete' });
  assert.deepEqual(set.steps, []);
  assert.equal(plain(dex.fromLegacySet(legacySet({ is_complete: true, collected_count: 40 }))).reward.status, 'claimable');
  assert.equal(plain(dex.fromLegacySet(legacySet({ is_complete: true, rewards_claimed: true }))).reward.status, 'claimed');
});

test('legacy Trip Prep becomes one step with its wearable pick', () => {
  const starter = { target: 8, collected: 8, is_unlocked: true, rewards_claimed: false, rewards: { energy: 15, tickets: 2, experience: 30 },
    wearable_choices: [{ id: 5, name: 'Cap', item_type_id: 1, icon_url: null, paper_url: null, owned: false }] };
  const set = plain(dex.fromLegacySet(legacySet({ starter_milestone: starter })));
  assert.equal(set.steps.length, 1);
  const [step] = set.steps;
  assert.equal(step.status, 'claimable');
  assert.deepEqual(step.claim, { kind: 'starter' });
  assert.equal(step.needsPick, true);
  assert.match(step.label, /^Find 8: get 15 Energy, 2 Tickets, 30 XP and a shark item you pick$/);
  assert.equal(plain(dex.rewardTrack(set))[0].reward.id, 'starter');
  assert.ok(dex.hasClaimable(set));
});

test('authored milestones: the all-items milestone is the finish reward, the others are steps in order', () => {
  const m = (key, target, status = 'locked', rewards = { energy: 10 }) => ({ key, label: '', target, collected: 0, is_unlocked: false, status, rewards });
  const set = plain(dex.fromLegacySet(legacySet({
    total_items: 30,
    milestones: [m('master', 30, 'locked', { energy: 50, title: 'Pro' }), m('starter', 8, 'claimed'), m('encore', 40), m('explorer', 20, 'claimable')],
  })));
  assert.equal(set.reward.id, 'master');
  assert.deepEqual(set.reward.claim, { kind: 'milestone', key: 'master' });
  assert.equal(set.reward.label, 'Finish the set: get 50 Energy and the Pro title');
  assert.deepEqual(set.steps.map(step => step.id), ['starter', 'explorer', 'encore']);
  const track = plain(dex.rewardTrack(set));
  assert.deepEqual(track.map(node => node.reward.id), ['starter', 'explorer', 'master'], 'steps beyond the set size never show on the track');
  assert.equal(track[2].at, 1);
  assert.equal(track[2].final, true);
});

test('v3 dex fields overlay the legacy set and are all optional', () => {
  const base = dex.fromLegacySet(legacySet({ starter_milestone: { target: 5, collected: 2, is_unlocked: false, rewards_claimed: false, rewards: { energy: 15 } } }));
  const over = plain(dex.overlayDexSet(base, {
    slug: 'night_lights', color: '#5B4CFF', accent_color: '#e0dcff', badge_url: 'https://x/badge.png', status: 'resting',
    spawning_now: false, spawn_hint: 'After sunset', sort_order: 6,
    progress: { found: 13, total: 40, caught: 31, spares: 5, is_complete: false },
    reward: { status: 'locked', label: 'Finish the set: get 60 Energy' },
    starter: { status: 'claimable', label: 'Find 5: get 15 Energy' },
  }));
  assert.equal(over.color, '#5B4CFF');
  assert.equal(over.badgeUrl, 'https://x/badge.png');
  assert.equal(over.status, 'resting');
  assert.equal(over.spawningNow, false);
  assert.equal(over.caught, 31);
  assert.equal(over.spares, 5);
  assert.equal(over.reward.label, 'Finish the set: get 60 Energy');
  // Without a server label, v3 numbers (coins included) rebuild it.
  const coins = plain(dex.overlayDexSet(base, { reward: { coins: 500, energy: 10, tickets: 2, experience: 60, title: 'Snack Boss' } }));
  assert.equal(coins.reward.label, 'Finish the set: get 10 Energy, 2 Tickets, 60 XP, 500 coins and the Snack Boss title');
  assert.equal(coins.reward.coins, 500);
  assert.deepEqual(over.reward.claim, { kind: 'complete' }, 'claims keep the legacy route');
  const routed = plain(dex.overlayDexSet(base, { starter: { status: 'claimable', claim_path: '/me/prep-item-sets/x/milestones/starter/claim' },
    reward: { claim_path: '/me/prep-item-sets/x/claim' } }));
  assert.deepEqual(routed.steps[0].claim, { kind: 'milestone', key: 'starter' }, 'a v3 starter claims through the milestone route');
  assert.deepEqual(routed.reward.claim, { kind: 'complete' });
  assert.equal(dex.claimFromPath('/me/prep-item-sets/x/claim-starter').kind, 'starter');
  assert.equal(dex.claimFromPath('/evil/milestones/hack/claim'), null);
  assert.equal(over.steps[0].status, 'claimable');
  // Junk or missing payloads never throw and keep the legacy values.
  for (const junk of [undefined, null, 'x', 42, { color: 'red', status: 'nope', progress: 'x', reward: [] }]) {
    const kept = plain(dex.overlayDexSet(base, junk));
    assert.equal(kept.color, '#3F51B5');
    assert.equal(kept.status, 'active');
    assert.equal(kept.found, 12);
  }
  // A server label with an em dash is cleaned.
  const dashed = plain(dex.overlayDexSet(base, { reward: { label: `Finish the set${String.fromCharCode(0x2014)}get 5 XP` } }));
  assert.doesNotMatch(dashed.reward.label, EM_DASH);
});

test('the book merges by slug, puts live sets first, and hides retired sets with no finds', () => {
  const book = plain(dex.buildBook([
    legacySet({ slug: 'old', availability: 'archived', collected_count: 0 }),
    legacySet({ slug: 'kept', availability: 'archived', collected_count: 3 }),
    legacySet({ slug: 'soon', availability: 'upcoming', collected_count: 0 }),
    legacySet({ slug: 'live' }),
    legacySet({ slug: 'ready', is_complete: true, collected_count: 40 }),
  ], { sets: [{ slug: 'live', color: '#123456' }, { nope: true }] }));
  assert.deepEqual(book.sets.map(set => set.slug), ['live', 'ready', 'soon', 'kept'], 'stable order: a claim never makes cards jump');
  assert.equal(book.sets[0].color, '#123456');
  assert.equal(book.found, 52, 'book count covers live sets only');
  assert.equal(book.total, 120);
  assert.equal(dex.initialSlug(book.sets, 'kept'), 'kept', 'a link from the map opens that set');
  assert.equal(dex.initialSlug(book.sets, 'missing'), 'ready', 'otherwise a set with a reward to claim');
  assert.equal(dex.initialSlug([], null), null);
  assert.deepEqual(plain(dex.buildBook(null).sets), []);
});

test('items: found in color with a caught count, missing as silhouettes with a rarity and a spawn hint', () => {
  const now = Date.parse('2026-10-02T12:00:00Z');
  const detail = {
    set: { time_gate: { description: 'After sunset' } },
    progress: { spare_count: 5, exchange_cost: 4, exchange_costs: { 5: 12 } },
    items: [
      legacyItem(1, 1, { is_collected: true, quantity_collected: 3, first_collected_at: '2026-10-02T08:00:00Z' }),
      legacyItem(2, 5),
      legacyItem(3, 2, { gate: { type: 'weather', explainer: 'Rainy days only.' } }),
      legacyItem(4, 3, { is_collected: true, quantity_collected: 1, first_collected_at: '2026-09-01T08:00:00Z', found_in_world: false }),
    ],
  };
  const items = plain(dex.buildItems(detail, undefined, now));
  assert.equal(items[0].caught, 3);
  assert.equal(items[0].spares, 2);
  assert.equal(items[0].isNew, true);
  assert.equal(items[1].found, false);
  assert.equal(items[1].exchangeCost, 12);
  assert.equal(items[1].canExchange, false);
  assert.equal(items[2].spawnHint, 'Rainy days only.', 'an item gate wins');
  assert.equal(items[1].spawnHint, 'After sunset', 'then the set gate');
  assert.equal(dex.caughtLine(items[3]), 'Swapped in. Find one on the map too!');
  assert.equal(dex.caughtLine(items[1]), 'Not found yet');
  assert.equal(dex.caughtLine(items[0]), 'Found 3 times');
  assert.equal(items[3].isNew, false);
  // v3 item fields overlay by id.
  const v3 = plain(dex.buildItems(detail, [{ id: 2, is_found: true, caught_count: 4, copies: 2, spares: 1, flavor: 'Shiny!',
    icon_url: 'https://x/a.png', spawn_hint: 'Daily rare', rarity_key: 'legendary', can_exchange: false }], now));
  assert.equal(v3[1].found, true);
  assert.equal(v3[1].caught, 4);
  assert.equal(v3[1].flavor, 'Shiny!');
  assert.equal(v3[1].iconUrl, 'https://x/a.png');
  assert.equal(v3[1].spawnHint, 'Daily rare');
});

test('Ride Photo: best grade in any optional shape, only on found items', () => {
  assert.equal(dex.photoGradeOf('Frame It!'), 'frame_it');
  assert.equal(dex.photoGradeOf('frame-it'), 'frame_it');
  assert.equal(dex.photoGradeOf('GREAT'), 'great');
  assert.equal(dex.photoGradeOf(1), 'good');
  assert.equal(dex.photoGradeOf(3), 'frame_it');
  assert.equal(dex.photoGradeOf('meh'), null);
  assert.deepEqual(plain(dex.ridePhotoOf({ ride_photo: { grade: 'great', url: 'https://x/p.jpg' } })), { grade: 'great', url: 'https://x/p.jpg', goldenHour: false });
  assert.deepEqual(plain(dex.ridePhotoOf({ best_photo_grade: 'good' })), { grade: 'good', url: null, goldenHour: false });
  assert.deepEqual(plain(dex.ridePhotoOf({ photo_url: 'https://x/p.jpg' })), { grade: null, url: null, goldenHour: false }, 'no grade, no photo');
  assert.deepEqual(plain(dex.ridePhotoOf({ best_photo: null })), { grade: null, url: null, goldenHour: false });
  // CONTRACT 3.2: best_photo { quality, golden_hour, frame }.
  assert.deepEqual(plain(dex.ridePhotoOf({ best_photo: { quality: 'frame_it', golden_hour: true, frame: 'gold' } })),
    { grade: 'frame_it', url: null, goldenHour: true });
  const detail = { progress: { spare_count: 0, exchange_cost: 4 }, items: [legacyItem(1, 4, { is_collected: true, quantity_collected: 1 }), legacyItem(2, 4)] };
  const items = plain(dex.buildItems(detail, [{ id: 1, best_photo_grade: 'frame_it' }, { id: 2, best_photo_grade: 'great' }]));
  assert.equal(items[0].photoGrade, 'frame_it');
  assert.equal(items[1].photoGrade, null, 'a missing item never shows a photo');
  assert.equal(dex.PHOTO_GRADE_LABEL.frame_it, 'Frame It!');
});

test('Ride Photo frames: plain for Good, nicer for Great, gold with a plaque for Frame It!', () => {
  const src = read('src/screens/SetCollection/RidePhoto.tsx');
  const frames = src.slice(src.indexOf('export const PHOTO_FRAMES'), src.indexOf('};', src.indexOf('export const PHOTO_FRAMES')));
  assert.match(frames, /good: \{ outer: '#ffffff'[^}]*mat: null, stars: false, plaque: false/);
  assert.match(frames, /great: \{ outer: '#9fb8d4'[^}]*mat: null, stars: false, plaque: false/, 'Great is one silver-blue frame: no stars, no mat');
  assert.match(frames, /frame_it: \{[^}]*stars: true/, 'only Frame It! has stars');
  assert.match(frames, /frame_it: \{ outer: '#f5b400'[^}]*mat: null[^}]*plaque: true/);
  // The find sits up front, left of the lap bar (never skewered by it), bigger than before.
  assert.match(src, /left: carW \* 0\.29, bottom: carH \* 0\.34, width: carW \* 0\.36/);
  assert.match(src, /<Text style=\{styles\.shareKicker\}>My Ride Photo<\/Text>/, 'never the child\'s username on a public card');
  assert.doesNotMatch(src, /sharkName/);
  // The photo is the map catch's Alex-style ride layers with the real shark in the car, never placeholder vector art.
  for (const layer of ['scene-far.webp', 'scene-near.webp', 'car-back.webp', 'car-front.webp', 'howto/shark.webp']) assert.ok(src.includes(layer), layer);
  assert.doesNotMatch(src, /RIDE PHOTO<|speed:|sun:/);
  // The share card mounts only on tap, then captures at 1080x1920 through the share sheet; no in-app signage background.
  const card = read('src/screens/SetCollection/DexItemCard.tsx');
  assert.match(card, /photo && shareMount &&/);
  assert.match(card, /captureRef\(shareRef, \{ format: 'jpg', quality: 0\.92, \.\.\.parkDayCaptureSize/);
  assert.match(card, /shareFileExternal\(uri/, 'the share sheet goes through the grown-up gate');
  assert.match(src, /ShareCardArtwork/);
  assert.doesNotMatch(src, /water_background/, 'the TASKS-sign background is gone');
});

test('the book screen: one hierarchy (shelf, set, prizes, finds by rarity), FlashList rows, stable tiles, quiet refresh, all claim routes', () => {
  const screen = read('src/screens/SetCollectionScreen.tsx');
  const parts = read('src/screens/SetCollection/BookParts.tsx');
  for (const piece of ['<ShelfCard', '<BookHeader', '<PrizeRows', '<FindsHeader', '<RarityHeading', '<ItemTile', '<ItemCard', '<RewardReveal',
    'MilestonePickSheet', 'ClaimResultCard', 'GiftPrepVariantPanel', 'FlashList', 'findRows(items, COLUMNS)']) assert.ok(screen.includes(piece), piece);
  // Order on the page: shelf, then the set header, prizes, finds header (each fact once).
  const order = ['<ShelfCard', '<BookHeader', '<PrizeRows', '<FindsHeader'].map(piece => screen.indexOf(piece));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  // Gone: the whole-book strip, the duplicate ribbon header and ring, the mystery icon buttons, the empty odds sheet.
  assert.doesNotMatch(screen, /BookStrip|SetHeader|RewardTrack|SparesMeter|HomeHuntInfoSheet|oddsOpen/);
  assert.match(screen, /const COLUMNS = 4;/);
  assert.match(screen, /source=\{BOOK_BG\}/, 'the Standings underwater art');
  assert.match(parts, /standings-bg\.png/);
  assert.match(parts, /export function PrizeChips[\s\S]*prizeChips\(reward\)/, 'prizes are icons plus words');
  assert.match(parts, />Title: \{title\}<\/Text>/, 'the title is shown up front, as a ribbon');
  assert.match(parts, /prizeMarks\(set\)/, 'a notch on the bar for every prize');
  assert.match(parts, /const goal = goalLine\(set\);/);
  assert.match(parts, /Find all \$\{set\.total\}/);
  assert.match(parts, /scaleX: Math\.max\(0\.001, fill\.value\)/, 'the count bar animates a transform, not width');
  // Shelf keeps the chosen set on screen.
  assert.match(screen, /pickerRef\.current\?\.scrollTo/);
  // Stable tiles and a quiet refresh.
  assert.match(screen, /mergeStable\(/);
  assert.match(screen, /refreshEveryMs\(set\)/);
  assert.match(screen, /key !== bookKey\.current/);
  for (const cue of ["'fx.reward'", "'ui.select'", "'ui.tap'", "'fx.reveal'"]) assert.ok(screen.includes(cue), cue);
  assert.match(screen, /Haptics\.notificationAsync/);
  for (const call of ['claimSetRewards(set.slug)', 'claimStarterRewards(set.slug, itemId)', 'claimSetMilestone(set.slug, reward.claim.key, itemId)',
    'focusPrepItemSet(set.slug)', 'equipSetTitle(set.slug']) assert.ok(screen.includes(call), call);
  const api = read('src/api/endpoints/me/homeHuntDex.ts');
  assert.match(api, /'\/me\/home-hunt\/dex'/);
  assert.match(api, /status === 404/);
  assert.match(screen, /if \(!isFocused \|\| preview\) return;/);
});

test('page model: finds grouped by rarity in rows, when-line, open-now, prize states, next goal', () => {
  const item = (id, rarity, found) => ({ id, rarity, found });
  const items = [item(1, 1, true), item(2, 3, false), item(3, 1, false), item(4, 1, true), item(5, 1, false), item(6, 1, false), item(7, 5, false)];
  const rows = plain(dex.findRows(items, 4));
  assert.deepEqual(rows.map(row => row.kind), ['heading', 'tiles', 'tiles', 'heading', 'tiles', 'heading', 'tiles']);
  assert.deepEqual(rows[0], { kind: 'heading', key: 'h1', rarity: 1, label: 'Common', found: 2, total: 5 });
  assert.deepEqual(rows[1].items.map(entry => entry.id), [1, 3, 4, 5], 'set order inside a group');
  assert.deepEqual(rows[2].items.map(entry => entry.id), [6]);
  assert.equal(rows[5].label, 'Legendary', 'Legendary last: the big goal at the bottom');
  assert.equal(dex.findRows([], 4).length, 0);
  const now = new Date('2026-10-02T12:00:00Z');
  assert.equal(dex.whenLine({ spawnHint: 'Anytime, anywhere', status: 'active' }, now), 'On the map anytime');
  assert.equal(dex.whenLine({ spawnHint: null, status: 'active' }, now), 'On the map anytime');
  assert.equal(dex.whenLine({ spawnHint: 'After sunset', status: 'active' }, now), 'On the map after sunset');
  assert.equal(dex.whenLine({ spawnHint: 'On rainy days', status: 'resting' }, now), 'On the map on rainy days');
  assert.equal(dex.whenLine({ spawnHint: null, status: 'upcoming', startsAt: '2026-10-15T07:00:00Z' }, now), 'On the map from Oct 15');
  assert.equal(dex.whenLine({ spawnHint: null, status: 'retired' }, now), 'No longer on the map. Yours to keep!');
  assert.equal(dex.openNow({ spawnHint: 'Anytime, anywhere', spawningNow: true, status: 'active' }), null, 'always open: nothing to say');
  assert.equal(dex.openNow({ spawnHint: 'After sunset', spawningNow: true, status: 'active' }), true);
  assert.equal(dex.openNow({ spawnHint: 'After sunset', spawningNow: false, status: 'active' }), false);
  assert.equal(dex.openNow({ spawnHint: 'Weekends', spawningNow: null, status: 'resting' }), false);
  assert.deepEqual(plain(dex.prizeState({ status: 'locked', target: 8 }, 3)), { kind: 'locked', toGo: 5 });
  assert.deepEqual(plain(dex.prizeState({ status: 'claimable', target: 8 }, 9)), { kind: 'claim', toGo: 0 });
  assert.equal(dex.prizeState({ status: 'claimed', target: 8 }, 9).kind, 'done');
  assert.equal(dex.prizeState({ status: 'pending', target: 40 }, 40).kind, 'pending');
  const base = dex.fromLegacySet(legacySet());
  const list = plain(dex.prizeList(base));
  assert.equal(list[list.length - 1].final, true, 'the finish prize is last');
  assert.ok(list.slice(0, -1).every(entry => !entry.final && entry.reward.target < base.total));
});

test('stable items, refresh pacing, swap progress, color separation, prize icons', () => {
  const a = { id: 1, name: 'A', found: true };
  const b = { id: 2, name: 'B', found: false };
  const merged = dex.mergeStable([a, b], [{ id: 1, name: 'A', found: true }, { id: 2, name: 'B', found: true }]);
  assert.equal(merged[0], a, 'unchanged item keeps its object');
  assert.notEqual(merged[1], b, 'a changed item is new');
  assert.equal(dex.refreshEveryMs({ spawnHint: 'After sunset', spawningNow: false, status: 'active' }), 60000);
  assert.equal(dex.refreshEveryMs({ spawnHint: null, spawningNow: true, status: 'active' }), 300000);
  assert.equal(dex.refreshEveryMs(null), 300000);
  assert.ok(dex.similarColor('#FFB020', '#D9853B'), 'mustard and cinnamon are one family');
  assert.ok(!dex.similarColor('#FF5FA2', '#3D8BFF'));
  const base = dex.fromLegacySet(legacySet());
  const sets = ['#FFB020', '#D9853B', '#FF5FA2'].map((color, i) => ({ ...base, slug: `s${i}`, color }));
  assert.deepEqual(dex.separateColors(sets).map(set => set.slug), ['s0', 's2', 's1']);
  const chips = plain(dex.prizeChips({ energy: 10, tickets: 1, experience: 0, coins: 500, wearableName: null, title: 'Snack Boss' }));
  assert.deepEqual(chips.map(chip => chip.icon), ['energy', 'ticket', 'coins', 'crown']);
  assert.equal(chips[1].label, '1 Ticket');
  assert.equal(dex.spawnIcon('After sunset'), 'star');
  assert.equal(dex.spawnIcon('More often on hot days'), 'sparkle');
  assert.equal(dex.spawnIcon('5 PM to 9 PM'), 'timer');
  assert.equal(dex.spawnIcon('Anytime, anywhere'), 'map');
});

test('rarity: the app-wide design-system palette, navy ink on light chips, named on every group heading', () => {
  const design = loadTs('src/design-system.ts');
  const look = loadTs('src/screens/SetCollection/dexLook.tsx', { 'expo-linear-gradient': {}, react: {}, 'react-native': { StyleSheet: { create: x => x } },
    '../../ui': { BRAND: { navy: '#05346e', white: '#fff' } }, '../../design-system': design });
  const ramp = plain(look.RARITY_LOOK);
  assert.deepEqual(Object.values(ramp).map(entry => entry.key), ['common', 'uncommon', 'rare', 'epic', 'legendary']);
  // One palette app-wide: the book's frames are exactly design-system colors.rarity (fails on any drift).
  for (const entry of Object.values(ramp)) assert.equal(entry.frame, design.colors.rarity[entry.key].main, entry.key);
  assert.equal(ramp[3].frame, '#9C27B0');
  assert.match(read('src/screens/SetCollection/dexLook.tsx'), /const R = colors\.rarity;/);
  const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  for (const entry of Object.values(ramp)) {
    const ratio = (lum(entry.chip) + 0.05) / (lum('#05346e') + 0.05);
    assert.ok(ratio >= 4.5, `${entry.key} chip contrast ${ratio.toFixed(2)}`);
  }
  // Rarity is named once per group (gems plus the word), never a lone gem on a tile that reads as a check mark.
  const parts = read('src/screens/SetCollection/BookParts.tsx');
  assert.match(parts, /<RarityGems rarity=\{rarity\}/);
  assert.match(parts, /\{label\}<\/Text>/);
  const tile = read('src/screens/SetCollection/DexTile.tsx');
  assert.doesNotMatch(tile, /<RarityGems/);
  assert.match(tile, /const sheen = item\.found && item\.rarity >= 3 && active && !reduced;/, 'Rare and up shine, paused when covered');
  assert.match(tile, /\{item\.spares > 0 && \(/, 'the extras badge only when there are extras (inside the found sticker)');
  assert.match(tile, /\+\{item\.spares\}/, 'one notation for extras: +N');
  assert.match(tile, /borderStyle: 'dashed'/, 'a missing find is an empty album slot');
  assert.doesNotMatch(tile, /swapReady|name="swap"/, 'no swap badge: swaps are retired');
});

test('VoiceOver and Reduce Motion: modals expose every control, reveal guards early taps', () => {
  const card = read('src/screens/SetCollection/DexItemCard.tsx');
  const reveal = read('src/screens/SetCollection/DexReveal.tsx');
  for (const src of [card, reveal]) {
    assert.match(src, /accessibilityLabel="Close" onPress=\{[^}]+\} style=\{StyleSheet\.absoluteFill\} \/>/, 'backdrop is a sibling, not a wrapper');
    assert.match(src, /accessibilityViewIsModal/);
    assert.match(src, /useUiReducedMotion/);
  }
  assert.doesNotMatch(card, /onPress=\{\(\) => undefined\}/);
  assert.match(reveal, /REVEAL_TAP_GUARD_MS = 1200/);
  assert.match(reveal, /Date\.now\(\) - openedAt\.current < REVEAL_TAP_GUARD_MS/);
  for (const file of ['src/screens/SetCollection/DexParts.tsx', 'src/screens/SetCollection/DexTile.tsx', 'src/components/QuickAccessMenu.tsx',
    'src/screens/HowToPlayScreen.tsx', 'src/screens/HowToPlay/HowToDemos.tsx']) assert.match(read(file), /useUiReducedMotion|reduced/, file);
});

test('the set-complete reveal: beats in order with the button last, sprite rays, gold medal, sockets, fade back', () => {
  const reveal = read('src/screens/SetCollection/DexReveal.tsx');
  const beat = reveal.match(/const BEAT = \{ ([^}]+) \}/)[1];
  const at = Object.fromEntries(beat.split(',').map(part => part.trim().split(': ')).map(([k, v]) => [k, Number(v)]));
  assert.ok(at.slam < at.ribbon && at.ribbon < at.prizes, 'medal, ribbon, prizes');
  assert.match(reveal, /plaqueAt \+ \(hasPlaque \? 200 : 0\) \+ BEAT\.cta/, 'button rises last');
  // A wearable with no title still stamps its plaque in (it was invisible in round 3).
  assert.match(reveal, /const hasPlaque = !!reward\.title \|\| !!reward\.wearableName;/);
  assert.match(reveal, /if \(hasPlaque\) \{\s*plaque\.value = withDelay\(plaqueAt/);
  assert.match(reveal, /barStyle="light-content"/, 'light status bar through the reveal');
  assert.match(reveal, /minimumFontScale=\{0\.8\}/, 'long titles stay at 14 pt or more');
  assert.match(reveal, /solid \/>/, 'opaque gold slam sparkles');
  assert.doesNotMatch(reveal, /react-native-svg/, 'no full-screen SVG layers (tens of MB of bitmap)');
  assert.match(reveal, /reveal\/rays\.webp/);
  assert.match(reveal, /alex-ui\/medal-gold\.webp/, 'Alex gold medal');
  const medal = path.join(root, 'assets/images/alex-ui/medal-gold.webp');
  assert.ok(fs.existsSync(medal));
  assert.match(reveal, /styles\.glint/);
  assert.match(reveal, /styles\.socket/, 'sockets stay after the fly-to');
  assert.match(reveal, /label="Collect!"/);
  assert.doesNotMatch(reveal, /Adding\.\.\.|Claiming\.\.\./);
  assert.match(reveal, /closeWithFade/);
  assert.match(reveal, /<HudCounter/);
  assert.match(reveal, /prize\.icon !== 'shark'/, 'a wearable gets its own wide plaque');
  for (const sprite of ['rays', 'scrim', 'glow']) {
    const size = fs.statSync(path.join(root, `assets/images/reveal/${sprite}.webp`)).size;
    assert.ok(size < 40 * 1024, `${sprite} sprite is small`);
  }
  const parts = read('src/screens/SetCollection/DexParts.tsx');
  assert.doesNotMatch(parts, /'Claiming\.\.\.'/);
});

test('round 3: swap story, recycled tiles, focus refresh, light ticks, small phones', () => {
  const screen = read('src/screens/SetCollectionScreen.tsx');
  const tile = read('src/screens/SetCollection/DexTile.tsx');
  const card = read('src/screens/SetCollection/DexItemCard.tsx');
  const parts = read('src/screens/SetCollection/BookParts.tsx');
  const look = read('src/screens/SetCollection/dexLook.tsx');
  assert.equal(dex.swapGoal, undefined);
  for (const src of [tile, card, parts]) assert.doesNotMatch(src, /name="retry"/, 'never a refresh icon');
  // Recycled FlashList cells drop per-item state.
  assert.match(tile, /setArtFailed\(false\);\s*setFlipping\(false\);/);
  assert.match(tile, /if \(timer\) clearTimeout\(timer\)/);
  // Focus refresh reads live refs; no lint escape hatches.
  assert.match(screen, /slugRef\.current/);
  assert.doesNotMatch(screen, /eslint-disable/);
  // A tick re-reads only the v3 dex when it is live.
  assert.match(screen, /void loadSets\(true\);/);
  assert.match(screen, /const reuse = dex != null;/);
  // Full reads run the dex and legacy calls together.
  assert.match(screen, /\[dex, legacy\] = await Promise\.all\(/);
  assert.match(screen, /\[dex, raw\] = await Promise\.all\(/);
  // The item card scrolls and scales on small phones.
  assert.match(card, /<ScrollView style=\{\{ maxHeight: height \* 0\.78 \}\}/);
  assert.doesNotMatch(card, /Swapped!/);
  assert.match(card, /'Swapped in'/);
  assert.match(look, /const box = Math\.ceil\(\(gem \+ 4\) \* 1\.45\)/);
  // The last row clears the compass.
  assert.match(screen, /CTA_CLEARANCE = BOTTOM_BAR_OVERHANG \+ 84/);
  assert.match(screen, /ListFooterComponent=\{<View style=\{\{ height: CTA_CLEARANCE/);
  // Rare-or-better never says "Anytime, anywhere".
  assert.equal(dex.rarityHint('Anytime, anywhere', 4), 'Very hard to find. Keep looking!');
  assert.equal(dex.rarityHint('Anytime, anywhere', 1), 'Anytime, anywhere');
  assert.equal(dex.rarityHint('After sunset', 5), 'After sunset');
  // Reduce Motion: header and shelf cards fade only.
  assert.match(parts, /reduced \? \{ opacity: 0\.8 \+ 0\.2 \* lift\.value \}/);
  assert.match(parts, /enter\.value = reduced \? 1 :/);
  assert.doesNotMatch(read('src/screens/SetCollection/SetHuntSections.tsx'), /fontSize: 1[0-4]\b/);
});

test('collection book files: no em dashes, no emoji, no purple', () => {
  const EMOJI = /[\p{Extended_Pictographic}]/u;
  for (const file of ['src/screens/SetCollectionScreen.tsx', 'src/screens/SetCollection/DexParts.tsx', 'src/screens/SetCollection/dexModel.ts',
    'src/screens/SetCollection/RidePhoto.tsx', 'src/api/endpoints/me/homeHuntDex.ts', 'src/screens/SetCollection/DexTile.tsx',
    'src/screens/SetCollection/DexItemCard.tsx', 'src/screens/SetCollection/DexReveal.tsx', 'src/screens/SetCollection/dexLook.tsx',
    'src/screens/SetCollection/BookParts.tsx']) {
    const src = read(file);
    assert.doesNotMatch(src, EM_DASH, file);
    assert.doesNotMatch(src, EMOJI, file);
  }
  assert.ok(!fs.existsSync(path.join(root, 'src/data/mockChurroSet.ts')));
});

test('the set says when its finds are on the map, once, and marks the hunted set with a labeled switch', () => {
  const base = dex.fromLegacySet(legacySet());
  const now = new Date('2026-10-02T12:00:00Z');
  // tabStatus stays for other readers (home map card).
  assert.equal(dex.tabStatus({ ...base, spawningNow: true, spawnHint: null }, now), null);
  assert.equal(dex.tabStatus({ ...base, status: 'upcoming', startsAt: '2026-10-15T07:00:00Z' }, now).text, 'Opens Oct 15');
  const parts = read('src/screens/SetCollection/BookParts.tsx');
  assert.match(parts, /const when = whenLine\(set\);/);
  assert.match(parts, /open \? 'On now' : 'Not right now'/);
  assert.match(parts, /accessibilityRole="switch"/, 'a real switch');
  assert.match(parts, />More on your map<\/Text>/, 'the hunt switch says what it does');
  assert.match(parts, /set\.focused && \(\s*<View style=\{styles\.cardHunt\}>/);
  assert.match(parts, />Hunting<\/Text>/, 'the shelf tag is a word');
  assert.match(parts, /you are hunting this set/);
  assert.match(read('src/screens/SetCollectionScreen.tsx'), /finds will show up more on your map/, 'turning it on says what it does');
  // The shelf card carries its own count and prize marker.
  assert.match(parts, /\{set\.found\}\/\{set\.total\}<\/Text>/);
  assert.match(parts, /styles\.cardPrize, styles\.cardPrizeInner, bobStyle/);
});

test('round 4: instant book, menu above the map, grades, shimmer, title stamp', () => {
  const screen = read('src/screens/SetCollectionScreen.tsx');
  const menu = read('src/components/QuickAccessMenu.tsx');
  const card = read('src/screens/SetCollection/DexItemCard.tsx');
  const parts = read('src/screens/SetCollection/BookParts.tsx');
  const tile = read('src/screens/SetCollection/DexTile.tsx');
  const cache = read('src/screens/SetCollection/dexCache.ts');
  // The book opens from the menu-prefetched copy, or a skeleton in the real layout. Never a spinner.
  assert.match(screen, /const seed = previewSets \? null : cachedBook\(player\?\.id\);/);
  assert.match(screen, /<BookSkeleton/);
  assert.doesNotMatch(screen, /SharkLoader/);
  assert.match(menu, /void prefetchBook\(player\?\.id, location\);/);
  assert.match(cache, /has_claimable/);
  assert.match(menu, /<Modal visible=\{mounted\}/);
  assert.match(menu, /rgba\(5,52,110,0\.86\)/);
  assert.match(menu, /intensity: 32 \* scrim\.value/);
  assert.doesNotMatch(menu, /isRight|row-reverse/, 'the unused right-side layout is gone');
  assert.doesNotMatch(card, /swappedSlot/);
  assert.ok(card.indexOf('<StarBurst') < card.indexOf('{photo ? ('), 'burst behind the art');
  // Done: a gold shelf card and the wear-title button in the finish prize row.
  assert.match(parts, /styles\.wear/);
  assert.match(parts, /cardFaceGold/);
  assert.match(parts, /const t = useSharedValue\(reduced \? 1 : 1\.6\)/, 'the title stamp slams from 1.6');
  assert.match(tile, /styles\.rim/);
  assert.match(tile, /<View key=\{item\.id\} style=\{\[styles\.slot/);
  assert.match(read('src/screens/SetCollection/RidePhoto.tsx'), /great: \{ outer: '#9fb8d4'/);
  assert.match(card, /position: 'absolute', top: 10, left: 10/, 'Golden Hour tag in the photo corner, away from the grade');
});

test('round 5: header stamp has no slab, cache is per player, Common gem', () => {
  const parts = read('src/screens/SetCollection/BookParts.tsx');
  const wrap = parts.match(/titleStampWrap: \{([^}]*)\}/)[1];
  assert.doesNotMatch(wrap, /background|border|shadow/i);
  assert.match(parts, /<Animated\.View style=\{\[styles\.titleStampWrap, style\]\}/);
  assert.match(parts, /<View style=\{styles\.titleStamp\}>/);
  const cache = read('src/screens/SetCollection/dexCache.ts');
  assert.match(cache, /if \(cache && cache\.playerId !== playerId\) cache = null;/);
  assert.match(cache, /getPrepItemSets\(location \?\? undefined\), getHomeHuntDex\(location\)/, 'same location params as the screen');
  assert.match(read('src/components/QuickAccessMenu.tsx'), /clearBook\(\);/);
  const screen = read('src/screens/SetCollectionScreen.tsx');
  assert.match(screen, /cachedBook\(player\?\.id\)/);
  assert.match(screen, /backgroundColor: '#5cc3f2'/, 'the page color matches the art while it decodes');
  assert.match(read('src/components/QuickAccessMenu.tsx'), /export function useQuickMenuOpen/);
  assert.match(read('src/screens/SetCollection/DexItemCard.tsx'), /item\.goldenHour && !photo && styles\.heroGolden/);
  assert.match(read('src/screens/SetCollection/dexLook.tsx'), /const gem = count === 1 \? Math\.round\(size \* 1\.35\) : size;/);
});

test('round 6: plurals, collect hold, claim answers at once, player-tied prefetch', () => {
  const parts = read('src/screens/SetCollection/BookParts.tsx');
  assert.match(parts, /extras === 1 \? 'extra' : 'extras'/);
  const reveal = read('src/screens/SetCollection/DexReveal.tsx');
  assert.match(reveal, /function onCountsDone/);
  assert.match(reveal, /later\(closeWithFade, 470\)/, 'pop plus a 350 ms hold after the totals land');
  const screen = read('src/screens/SetCollectionScreen.tsx');
  assert.match(screen, /claimDim\.value = reduced \? 0\.6 : withTiming\(0\.6/);
  const menu = read('src/components/QuickAccessMenu.tsx');
  assert.match(menu, /RootNavigation\.navigate\(item\.screen, item\.params\);\s*closeMenu\(\);/);
  assert.match(menu, /rowsFadeStyle/);
  const cache = read('src/screens/SetCollection/dexCache.ts');
  assert.match(cache, /inflight && inflight\.playerId === playerId/);
  assert.match(cache, /if \(inflight\?\.ticket !== ticket\) return null;/);
  assert.match(read('src/context/AuthProvider.tsx'), /clearBook\(\);/);
});

test('no book file hard-codes a rarity color: only dexLook, which reads design-system', () => {
  const files = ['src/screens/SetCollection/SetHuntSections.tsx', 'src/screens/SetCollection/DexParts.tsx', 'src/screens/SetCollection/DexTile.tsx',
    'src/screens/SetCollection/DexItemCard.tsx', 'src/screens/SetCollection/DexReveal.tsx', 'src/screens/SetCollectionScreen.tsx',
    'src/screens/SetCollection/BookParts.tsx'];
  // RidePhoto.tsx is left out on purpose: its gold frame and blue share background are photo-grade art, not rarity.
  // Old per-file rarity ramps (round 1 and earlier) and any copy of the design-system values outside dexLook.
  const banned = /#(0879ca|ff9800|9c27b0|4caf50|00a5f5|ff6b00|ffd700|8fa9c2|1d9bf0|0a5fb0|e0a100|ff8a00|2fb35d|9b4dff|ff5a2b|f5b400|6f849c)\b/i;
  for (const file of files) assert.doesNotMatch(read(file), banned, `${file} hard-codes a rarity color`);
  assert.doesNotMatch(read('src/screens/SetCollection/SetHuntSections.tsx'), /RARITY_COLOR/);
});

test('round 7: reveal clears the dim and busy state at once, refreshes in background', () => {
  const screen = read('src/screens/SetCollectionScreen.tsx');
  const celebrate = screen.slice(screen.indexOf('const celebrate = useCallback'), screen.indexOf('const claim = useCallback'));
  assert.match(celebrate, /claimDim\.value = withTiming\(0/);
  assert.match(celebrate, /setBusy\(null\)/);
  assert.match(screen, /void refreshPlayer\(\)\.catch\(\(\) => undefined\)\.then\(\(\) => reloadAll\(\)\)/);
  assert.doesNotMatch(screen, /await refreshPlayer\(\)\.catch\(\(\) => undefined\);\s*await reloadAll\(\);/);
  assert.match(screen, /<Modal visible=\{claimWaiting && !picking\}/, 'the whole window dims during the wait');
  assert.match(screen, /function ClaimBuildUp/);
  // The page is laid out so the prize rows sit in the first screen: no jump-scroll that hides the shelf.
  assert.doesNotMatch(screen, /firstLand|seededOffset/);
  // Idle loops share one page clock and stop under any sheet, card or reveal.
  assert.match(screen, /const active = isFocused && !selectedItem && !reveal && !sparesOpen && !giftItem && !claimWaiting && !picking;/);
  assert.match(read('src/screens/SetCollection/bookClock.ts'), /export const SHEEN = makeMutable\(0\);/);
  assert.doesNotMatch(read('src/screens/SetCollection/DexTile.tsx'), /withRepeat/, 'no per-tile endless loop');
  assert.doesNotMatch(read('src/screens/SetCollection/BookParts.tsx'), /withRepeat/, 'no per-card endless loop');
  assert.match(read('src/screens/SetCollection/DexReveal.tsx'), /if \(countTargets === 0\) later\(onCountsDone/);
  assert.match(read('src/screens/SetCollection/dexLook.tsx'), /gemOutline/);
});

test('ship gate: Ride Photo stays off unless the server sends player_stats.ride_photo_enabled', () => {
  const ride = loadTs('src/screens/ExploreScreen/ridePhoto.ts', {}, {});
  assert.equal(ride.catchStyleFor(3), 'chomp', 'off by default (production sends no flag)');
  ride.setRidePhotoServerEnabled('true');
  assert.equal(ride.catchStyleFor(3), 'chomp', 'only a real true turns it on');
  ride.setRidePhotoServerEnabled(true);
  assert.equal(ride.catchStyleFor(3), 'ride_photo');
  assert.equal(ride.catchStyleFor(1), 'chomp');
  ride.setRidePhotoServerEnabled(undefined);
  assert.equal(ride.catchStyleFor(5), 'chomp');
  assert.match(read('src/api/endpoints/me/prep-items/index.ts'), /setRidePhotoServerEnabled\(/);
  for (const file of ['src/screens/ExploreScreen/PrepItem.tsx', 'src/screens/ExploreScreen/HomeExplore.tsx',
    'src/screens/ExploreScreen/HomeCatchMoment.tsx', 'src/screens/ExploreScreen/HomeFindMarker.tsx']) {
    assert.doesNotMatch(read(file), /rideSpec\([^)]*\)\.style/, `${file} must use the gated catchStyleFor`);
  }
});

test('round 7b: a wearable pick claim shows the build-up inside the sheet (one iOS modal at a time)', () => {
  const screen = read('src/screens/SetCollectionScreen.tsx');
  assert.match(screen, /overlay=\{claimWaiting \? buildUp : null\}/);
  const sheet = read('src/screens/SetCollection/SetHuntSections.tsx');
  assert.match(sheet, /\{overlay\}\s*<\/Modal>/);
});

test('round 7b: a finished set the live list sends without rewards_claimed reads its claim state from the detail', async () => {
  const calls = [];
  const client = { get: async (url) => {
    calls.push(url);
    if (url === '/me/prep-item-sets') return { data: { data: [
      { slug: 'churro_collection', is_complete: true },
      { slug: 'open_set', is_complete: false },
      { slug: 'new_server', is_complete: true, rewards_claimed: false },
    ] } };
    if (url === '/me/prep-item-sets/churro_collection') return { data: { data: { progress: { rewards_claimed: true } } } };
    throw new Error(`unexpected ${url}`);
  } };
  const api = loadTs('src/api/endpoints/me/prep-item-sets/index.ts', {
    '../../../client': { default: client, __esModule: true },
    '../../../../helpers/deviceTimeZone': { default: () => 'America/Los_Angeles', __esModule: true },
    '../../../../models/prep-item-set-type': {}, '../../../../models/location-type': {},
  });
  const sets = await api.default();
  assert.equal(sets.find(s => s.slug === 'churro_collection').rewards_claimed, true, 'claimed, not claimable forever');
  assert.equal(sets.find(s => s.slug === 'new_server').rewards_claimed, false, 'a sent field is trusted');
  assert.deepEqual(calls, ['/me/prep-item-sets', '/me/prep-item-sets/churro_collection'], 'one detail call, only where needed');
  const dexModel = loadTs('src/screens/SetCollection/dexModel.ts');
  assert.ok(dexModel);
  const screen = read('src/screens/SetCollectionScreen.tsx');
  const success = screen.slice(screen.indexOf('const claim = useCallback'), screen.indexOf('celebrate(reward);'));
  assert.match(success, /setBook\(current => \(\{ \.\.\.current, sets: current\.sets\.map/, 'the claimed reward is marked locally before the reveal');
});

test('ship: "Report this spot" is reachable from a tapped find\'s peek, and the park goal help names the real entry', () => {
  const explore = read('src/screens/ExploreScreen/HomeExplore.tsx');
  assert.match(explore, /action: pivot != null \? \{ label: 'Report', hint: HOME_HUNT_COPY\.reportTitle, onPress: \(\) => reportSpot\(pivot\) \}/);
  assert.match(explore, /reportHomeSpot\(pivotId, reason\)/);
  assert.match(explore, /showToast\(HOME_HUNT_COPY\.reportThanks/);
  const chip = read('src/screens/ExploreScreen/HomeHuntChip.tsx');
  assert.match(chip, /message\.action && \(/);
  assert.match(chip, /accessibilityLabel=\{message\.action\.hint \?\? message\.action\.label\}/);
  const glossary = read('src/services/help/glossary.ts');
  assert.doesNotMatch(glossary, /Next Park Trip/);
  assert.match(glossary, /coin shelf and tap Set Goal/);
});

test('round 7b: a full-set claim on an authored set shows WEAR IT for its wearable (the server pays it as Master)', () => {
  const screen = read('src/screens/SetCollectionScreen.tsx');
  assert.match(screen, /reward\.claim\.kind === 'complete'\) \{[\s\S]{0,400}const outcome = claimOutcome\(await claimSetRewards\(set\.slug\)\);\s*setClaimResult\(outcome\);/);
  const model = loadTs('src/screens/SetCollection/setHuntModel.ts');
  const legacy = model.claimOutcome({ rewards_granted: { energy: 10, tickets: 2, experience: 50, title: 'Churro Champ', badge_url: null } });
  assert.equal(legacy.wear, null, 'a legacy claim grants no item: no card');
  const authored = model.claimOutcome({ rewards_granted: { item: { id: 49, name: 'Churro Blue T-Shirt', item_type_id: 4 } } });
  assert.deepEqual(plain(authored.wear), { itemId: 49, itemTypeId: 4, name: 'Churro Blue T-Shirt' });
});

test('swaps are retired: rare finds are earned on the map, spares stay a count, swapped-in items stay owned', () => {
  const screen = read('src/screens/SetCollectionScreen.tsx');
  const card = read('src/screens/SetCollection/DexItemCard.tsx');
  const tile = read('src/screens/SetCollection/DexTile.tsx');
  const parts = read('src/screens/SetCollection/DexParts.tsx');
  const modal = read('src/components/PrepItemRedeemModal.tsx');
  const api = read('src/api/endpoints/me/prep-item-sets/index.ts');
  // No client path to the retired endpoint, and no swap button, plate, meter or badge.
  assert.doesNotMatch(api, /\/exchange`/);
  assert.doesNotMatch(screen, /exchangeSetDuplicates|onExchange|swapGoal|swapProgress/);
  assert.equal(dex.swapProgress, undefined);
  for (const src of [card, tile, parts]) {
    assert.doesNotMatch(src, /Swap!|Swap ready|spares to swap|swapReady|SwapReady|name="swap"/);
  }
  // The pickup card never sends a kid toward a spare exchange.
  assert.doesNotMatch(modal, /EXCHANGE|spares toward|exchange_cost/);
  // Extras: a share button only when there are any and sharing is on; the sheet lists every extra and explains sharing.
  const parts2 = read('src/screens/SetCollection/BookParts.tsx');
  assert.match(parts2, /extras > 0 && onExtras \?/);
  assert.match(screen, /Tap one to give it to a friend!/);
  assert.match(screen, /const list = \[\.\.\.items\]\.filter\(item => item\.found && item\.spares > 0\)/, 'every extra, not just one');
  assert.doesNotMatch(screen, /swap for new finds/i);
  // Items swapped in while swaps were live keep the label.
  assert.equal(dex.caughtLine({ found: true, foundInWorld: false, caught: 1 }), 'Swapped in. Find one on the map too!');
  assert.match(card, /item\.foundInWorld === false \? 'Swapped in'/);
  // A missing find gets one big way to the map in the slot the Swap button used.
  assert.match(card, /\(!item\.found \|\| item\.foundInWorld === false\) && \([\s\S]{0,120}'Catch one on the map' : 'Find it on the map'\} icon="map" onPress=\{onFind\}/);
});

test('R4: the ready prize claims from the set header (always on the first screen); rare find is a shelf card; worn finish folds', () => {
  const parts = read('src/screens/SetCollection/BookParts.tsx');
  const screen = read('src/screens/SetCollectionScreen.tsx');
  assert.match(parts, /const readyEntry = prizeList\(set\)\.find\(entry => entry\.reward\.status === 'claimable'\)/);
  assert.match(parts, /label=\{readyEntry\.reward\.needsPick \? 'Pick and claim' : 'Claim prize!'\}/);
  assert.match(screen, /<BookHeader set=\{set\} busyId=\{busy\} onClaim=\{reward => void claim\(reward\)\}/);
  assert.doesNotMatch(screen, /RareBanner/);
  assert.match(screen, /\{daily && <RareShelfCard onPress=\{goToMap\} \/>\}/);
  assert.match(parts, /state\.kind === 'done' && \(!final \|\| !reward\.title \|\| titleWorn\)/);
});

test('R5: solid slot ink, numbered slot plates, compact locked finish row, Wearing pill, gold bar at 40/40, one-hunt toast', () => {
  const parts = read('src/screens/SetCollection/BookParts.tsx');
  const tile = read('src/screens/SetCollection/DexTile.tsx');
  const screen = read('src/screens/SetCollectionScreen.tsx');
  assert.match(parts, /ink: '#bfb08a', inkOpacity: 1/);
  assert.match(tile, />#\{slot\}<\/Text>/);
  assert.match(screen, /slot=\{slotOf\.get\(item\.id\) \?\? 0\}/);
  assert.match(parts, /state\.kind === 'locked' && hero \? \(/);
  assert.match(parts, />Wearing<\/Text>/);
  assert.match(parts, /finished \|\| set\.isComplete \? BRAND\.gold : set\.color/);
  assert.match(screen, /Now hunting \$\{set\.name\} instead of \$\{before\.name\}\./);
  assert.doesNotMatch(parts + screen, /name="heart"/);
});
