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
  assert.equal(plain(dex.nextStep(set)).id, 'starter');
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
  assert.equal(plain(dex.nextStep(set)).id, 'explorer', 'a claimable step wins over a locked one');
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
  assert.deepEqual(book.sets.map(set => set.slug), ['ready', 'live', 'soon', 'kept']);
  assert.equal(book.sets[1].color, '#123456');
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
  assert.equal(dex.tileCaption(items[0]), 'x3');
  assert.equal(items[1].found, false);
  assert.equal(dex.tileCaption(items[1]), 'Legendary');
  assert.equal(items[1].exchangeCost, 12);
  assert.equal(items[1].canExchange, false);
  assert.equal(dex.exchangeLine(items[1], 5), '7 more spares to swap for it');
  assert.equal(items[2].spawnHint, 'Rainy days only.', 'an item gate wins');
  assert.equal(items[1].spawnHint, 'After sunset', 'then the set gate');
  assert.equal(items[2].canExchange, true);
  assert.equal(dex.exchangeLine(items[2], 5), 'Swap 4 spares for it');
  assert.equal(dex.caughtLine(items[3]), 'Swapped in. Catch one on the map too!');
  assert.equal(dex.caughtLine(items[1]), 'Not caught yet');
  assert.equal(dex.caughtLine(items[0]), 'Caught 3 times');
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
  assert.match(frames, /good: \{ outer: \['#ffffff', '#ffffff'\][^}]*mat: null, stars: false, plaque: false/);
  assert.match(frames, /great: \{[^}]*stars: true, plaque: false/);
  assert.match(frames, /frame_it: \{ outer: \['#ffe9a3', '#d99a00'\][^}]*plaque: true/);
  // The share card uses the park-day share style: off-screen, captured at 1080x1920, through the share sheet.
  const parts = read('src/screens/SetCollection/DexParts.tsx');
  assert.match(parts, /captureRef\(shareRef, \{ format: 'jpg', quality: 0\.92, \.\.\.parkDayCaptureSize/);
  assert.match(parts, /Sharing\.shareAsync\(uri/);
  assert.match(parts, /Share my Ride Photo/);
  assert.match(src, /ShareCardArtwork/);
});

test('the book screen: picker with rings, reward banner, grid, item card, sounds and haptics; old clutter gone', () => {
  const screen = read('src/screens/SetCollectionScreen.tsx');
  const parts = read('src/screens/SetCollection/DexParts.tsx');
  for (const piece of ['<SetTab', '<RewardBanner', '<ItemTile', '<ItemCard', '<StepRow', '<SetChips', 'MilestonePickSheet', 'ClaimResultCard', 'GiftPrepVariantPanel', 'HomeHuntInfoSheet']) {
    assert.ok(screen.includes(piece), piece);
  }
  assert.match(parts, /<ProgressRing/);
  assert.match(parts, /tintColor=\{item\.found \? undefined : SILHOUETTE\}/, 'missing items are silhouettes');
  assert.match(parts, /withSpring\(scaleTo/, 'springy tile press');
  for (const cue of ["'fx.reward'", "'fx.whoosh'", "'ui.tap'", "'fx.reveal'"]) assert.ok(screen.includes(cue), cue);
  assert.match(screen, /Haptics\.notificationAsync/);
  // The wall of text is gone: no Trip Prep paragraph, no hero row, no missing-variant list, no 40-image churro map.
  for (const old of [/tripPrepExplanation/, /SetHeroRow/, /THE NEXT COLLECTOR CHASE/, /CHURRO_IMAGES/, /HUNT FROM/]) assert.doesNotMatch(screen, old);
  // Claims keep every existing route.
  for (const call of ['claimSetRewards(set.slug)', 'claimStarterRewards(set.slug, itemId)', 'claimSetMilestone(set.slug, reward.claim.key, itemId)',
    'exchangeSetDuplicates(set.slug, target)', 'focusPrepItemSet(set.slug)', 'equipSetTitle(set.slug']) assert.ok(screen.includes(call), call);
  // The v3 endpoints are optional and stop after a 404.
  const api = read('src/api/endpoints/me/homeHuntDex.ts');
  assert.match(api, /'\/me\/home-hunt\/dex'/);
  assert.match(api, /status === 404/);
  // Polling only while focused.
  assert.match(screen, /if \(!isFocused \|\| preview\) return;/);
});

test('collection book files: no em dashes, no emoji, no purple', () => {
  const EMOJI = /[\p{Extended_Pictographic}]/u;
  for (const file of ['src/screens/SetCollectionScreen.tsx', 'src/screens/SetCollection/DexParts.tsx', 'src/screens/SetCollection/dexModel.ts',
    'src/screens/SetCollection/RidePhoto.tsx', 'src/api/endpoints/me/homeHuntDex.ts']) {
    const src = read(file);
    assert.doesNotMatch(src, EM_DASH, file);
    assert.doesNotMatch(src, EMOJI, file);
  }
  assert.ok(!fs.existsSync(path.join(root, 'src/data/mockChurroSet.ts')));
});

test('each set card says when it spawns and marks the focused set (moved from the home map card)', () => {
  const base = dex.fromLegacySet(legacySet());
  const now = new Date('2026-10-02T12:00:00Z');
  assert.deepEqual(plain(dex.tabStatus({ ...base, spawningNow: true }, now)), { text: 'On now', live: true });
  assert.deepEqual(plain(dex.tabStatus({ ...base, spawningNow: false, spawnHint: 'After sunset' }, now)), { text: 'After sunset', live: false });
  assert.deepEqual(plain(dex.tabStatus({ ...base, status: 'resting', spawnHint: 'Weekends' }, now)), { text: 'Weekends', live: false });
  assert.equal(dex.tabStatus({ ...base, status: 'upcoming', startsAt: '2026-10-15T07:00:00Z' }, now).text, 'Opens Oct 15');
  assert.equal(dex.tabStatus({ ...base, status: 'retired' }, now).text, 'Saved');
  const parts = read('src/screens/SetCollection/DexParts.tsx');
  assert.match(parts, /set\.focused && \(/);
  assert.match(parts, /My hunt/);
  assert.match(parts, /tabStatus\(set\)/);
});
