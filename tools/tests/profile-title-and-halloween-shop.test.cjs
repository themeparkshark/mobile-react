'use strict';
/**
 * Two clarity fixes:
 *  1. Your profile title explains itself: tap it for what it means and how
 *     you earned it, then change it or take it off (saved on the server).
 *  2. The Halloween Shop is event-only: never in a shop list, opened from its
 *     stall on the Fin-ister event map; away from the event it says "Only at
 *     Fin-ister Nights" with no buy button (the server refuses anyway).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { scanSource } = require('./helpers/ui-copy-rules.cjs');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

test('new surfaces have no emoji, em dashes, glyph icons or third-party phrases', () => {
  const offenders = [];
  for (const file of ['src/components/profile/TitleSheet.tsx', 'src/components/profile/titleModel.ts', 'src/components/profile/TitlePill.tsx',
    'src/components/fright/halloweenShop.ts', 'src/components/map/fright/HalloweenStall.tsx', 'src/components/StoreCountdown.tsx',
    'src/components/profile/TitleUndoBar.tsx']) {
    for (const hit of scanSource(read(file), file)) offenders.push(`${file}:${hit.line} ${hit.kind}`);
  }
  assert.deepEqual(offenders, []);
});

test('a title says how you earned it in kid-simple words', () => {
  const m = loadTs('src/components/profile/titleModel.ts');
  const sets = [
    { slug: 'churro_collection', name: 'Churro Collection', total_items: 24, rewards_claimed: false,
      starter_milestone: { target: 8, rewards_claimed: true, rewards: { title: 'Churro Collection Scout' } },
      completion_rewards: { title: 'Churro Connoisseur' } },
    { slug: 'night_lights', name: 'Night Lights', total_items: 16, rewards_claimed: true,
      starter_milestone: { target: 8, rewards_claimed: false, rewards: { title: 'Night Lights Scout' } },
      completion_rewards: { title: 'Night Light Legend' } },
  ];
  const stamps = { stamps: { rides: [{ id: 4, name: 'Coaster Champ', goal: 'Ride 10 coasters.' }] },
    unlocked_titles: [{ stamp_id: 4, title: 'Coaster Champ' }, { stamp_id: 9, title: 'Churro Collection Scout' }] };
  const earned = plain(m.earnedTitles(sets, stamps));
  assert.deepEqual(earned.map((e) => e.title), ['Churro Collection Scout', 'Night Light Legend', 'Coaster Champ'], 'claimed only, no duplicates');
  assert.equal(earned[0].meaning, '8 churros found');
  assert.deepEqual(earned[0].equip, { kind: 'set', slug: 'churro_collection', tier: 'starter' });
  assert.equal(earned[1].meaning, 'All 16 finds found');
  assert.equal(earned[2].meaning, 'Ride 10 coasters!'); // one line, the how-to (the stamp art sits above it)
  assert.deepEqual(earned[2].equip, { kind: 'stamp', stampId: 4 });
  // The worn title explains itself even before the lists load.
  assert.equal(m.describeTitle('Churro Collection Scout', []), 'You found your first churros in your Churro Collection book.');
  assert.equal(m.describeTitle('Churro Finder', []), 'You found your first churros in your Churro book.', 'the new server name');
  assert.equal(m.findEarned('Coaster Champ', earned).key, 'stamp:4');
  assert.equal(m.findEarned('Nope', earned), null);
  assert.equal(m.describeTitle('Churro Collection Scout', earned), '8 churros found');
  assert.equal(m.bookNoun('Pretzel Collection'), 'pretzels');
  assert.equal(m.titleBadgeSlug('Churro Finder'), 'churro_collection', 'the profile pill finds the book art from the name alone');
  assert.equal(m.titleBadgeSlug('Night Lights Finder'), 'night_lights');
  assert.equal(m.titleBadgeSlug('Coaster Champ'), null);
  assert.equal(m.titleBadgeSlug('Night Owl'), null, 'a title that only starts like a book never borrows its art');
  assert.equal(m.titleBadgeSlug('Churro Connoisseur'), null, 'only "<Book> Finder" names its book');
  assert.equal(m.bookNoun('Camera Crew'), 'finds');
});

test('the title sheet: tap your own pill, change or remove through the server, never on other players', () => {
  const pill = read('src/components/profile/TitlePill.tsx');
  assert.match(pill, /onPress\?: \(\) => void/);
  const profile = read('src/screens/ProfileScreen.tsx');
  assert.match(profile, /<TitlePill title=\{player\.title\}\s+team=\{<TeamChip [\s\S]*?\/>\}\s+trophy=\{<><ProfileEventChip \/>[^}]*\{ownStreak && <StreakFlame [^>]*\/>\}<\/>\} onPress=\{\(\) => setTitleSheet\(true\)\}/);
  assert.match(profile, /<TitleSheet visible=\{titleSheet\}/);
  assert.ok(profile.indexOf('const [titleSheet, setTitleSheet]') < profile.indexOf('if (!player) {'), 'the sheet state is a hook before the guest return');
  const other = read('src/screens/PlayerScreen.tsx');
  assert.doesNotMatch(other, /TitleSheet|<TitlePill[^>]*onPress/, 'another player\'s title is read-only');
  const sheet = read('src/components/profile/TitleSheet.tsx');
  assert.match(sheet, /equipStampTitle\(null\)/, 'Remove clears any title (stamp_id null clears users.equipped_title)');
  assert.match(sheet, /equipSetTitle\(entry\.equip\.slug, true, entry\.equip\.tier\)/);
  assert.match(sheet, /await onChanged\(\);/, 'the pill follows the server after a change');
  assert.match(sheet, /label="Change title"/);
  // Oct 8 (Dustin: "no way to remove the title"): Remove title is a visible button beside More titles, not a hidden link.
  assert.match(sheet, /accessibilityLabel="Remove title"/, 'Remove title is a real, visible button');
  assert.match(sheet, /RootNavigation\.navigate\('StampBook', \{ titles: true \}\)/, 'More titles opens the Stamp Book Titles list');
  assert.doesNotMatch(sheet, /label="Remove title"/);
  assert.match(sheet, /onRemoved\?\.\(previous\)/, 'the profile gets the removed title for Undo');
  assert.match(sheet, /haptic\('success'\)/);
  assert.match(sheet, /setBadge\(\{ slug, badgeUrl: entry\?\.iconUrl \?\? null \}\)/, 'book titles show the book art');
  assert.match(profile, /<TitleUndoBar previous=\{undoTitle\}/);
  assert.match(profile, /art=\{<TitleArt entry=\{null\} title=\{player\.title\} size=\{28\} \/>\}/, 'the pill shows the book art, not the crown');
  assert.match(sheet, /disabled=\{!!busy \|\| earned === null\}/, 'Remove waits for the lists so Undo always knows the title');
  assert.match(sheet, /if \(!previous && !confirming\) \{ setConfirming\(true\); return; \}/, 'a title Undo cannot restore asks first');
  assert.match(sheet, /label="Keep it"/);
  assert.doesNotMatch(sheet, /confirmGame/, 'no second Modal over the sheet (iOS will not present it)');
  const undo = read('src/components/profile/TitleUndoBar.tsx');
  assert.match(undo, /if \(!previous \|\| busy\) return;\s*const timer = setTimeout\(onDone, UNDO_MS\)/, 'the timer never fires while an undo is in flight');
  assert.match(undo, /UNDO_MS = 10_000/);
  assert.match(undo, /<GameIcon name="retry"/, 'UNDO has an icon');
  assert.match(undo, /Animated\.timing\(left, \{ toValue: 0, duration: UNDO_MS/, 'the time left drains');
  assert.match(undo, /if \(mounted\.current\) setFailed\(true\)/);
  assert.match(profile, /await equipEarned\(previous\); await refreshPlayer\(\);/);
});

test('the Halloween Shop never shows in the profile shop row, under its old or new name', () => {
  const { profileStores } = loadTs('src/components/profile/profileStores.ts');
  const shark = { id: 9, name: 'Shark Shop', is_secret_store: false };
  const old = { id: 19, name: 'The Sunken Sideshow', is_secret_store: false };
  const keyed = { id: 20, name: 'Anything', slug: 'fright-shelf', is_secret_store: false };
  const holiday = { id: 12, name: 'Holiday Store', is_secret_store: false };
  assert.deepEqual(plain(profileStores([shark, old, keyed, holiday]).others.map((s) => s.id)), [12]);
});

test('stall copy: countdown when open, the away line and no buy for everyone else', () => {
  const m = loadTs('src/components/fright/halloweenShop.ts');
  const now = Date.parse('2026-10-04T12:00:00-07:00');
  assert.equal(m.endsInLabel('2026-11-02T23:59:59-08:00', now), 'Ends in 29 days');
  assert.equal(m.endsInLabel('2026-10-04T17:00:00-07:00', now), 'Ends in 5 hours');
  assert.equal(m.endsInLabel('2026-10-04T12:20:00-07:00', now), 'Ends in 20 min');
  assert.equal(m.endsInLabel('2026-10-01T00:00:00-07:00', now), 'Closed');
  const night = { opens_at: '2026-10-04T18:30:00-04:00', early_opens_at: null, closes_at: '2026-10-05T02:00:00-04:00' };
  assert.equal(m.stallLine({ open: true }, night, now), 'Open till 2 AM');
  assert.equal(m.stallLine({ open: false, reason: 'not_event_hours' }, night, Date.parse('2026-10-04T15:00:00-04:00')), 'Opens at 6:30 PM');
  assert.equal(m.stallLine({ open: false, reason: 'not_event_hours' }, night, Date.parse('2026-10-05T02:30:00-04:00')), 'Closed for tonight');
  assert.equal(m.stallLine({ open: false, reason: 'not_at_event' }, night, now), 'Only at Fin-ister Nights');
  assert.equal(m.stallLine({ open: false, reason: 'off_season' }, null, now), 'Closed for the season');
  assert.equal(m.awayMessage('not_event_hours', night, Date.parse('2026-10-04T15:00:00-04:00')),
    'The Halloween Shop opens at 6:30 PM, when Fin-ister Nights starts. It stays open till 2 AM.');
  assert.equal(m.awayMessage('not_at_event', night, now), 'Come to Fin-ister Nights at the park to shop. Tonight it\'s open 6:30 PM to 2 AM.');
  assert.equal(m.awayHeadline('not_event_hours', night, Date.parse('2026-10-04T15:00:00-04:00')), 'Opens tonight');
  assert.equal(m.awayHeadline('not_event_hours', night, Date.parse('2026-10-05T02:30:00-04:00')), 'Closed for tonight');
  assert.equal(m.awayHeadline('not_at_event', night, now), 'Event only');
  assert.equal(m.awayHeadline('not_event_hours', null, now), 'Event only', 'no window: nothing to promise');
  for (const h of ['Opens tonight', 'Closed for tonight', 'Event only', 'Closed for the season']) assert.ok(h.length <= 22, h);
  assert.equal(m.stallAction({ open: true, store_id: 19 }), 'open');
  assert.equal(m.stallAction({ open: false, store_id: 19 }), 'away');
  assert.equal(m.stallAction(null), 'none');
  assert.equal(m.AWAY_LINE, 'Only at Fin-ister Nights');
  assert.ok(m.isEventShop({ name: 'Halloween Shop' }));
  assert.ok(!m.isEventShop({ name: 'Halloween Shop', slug: 'shark-shop' }), 'a store with another key is not the shelf');
});

test('the stall is ONE always-mounted Marker with stable key and fixed box (MapLibre rule)', () => {
  const src = read('src/components/map/fright/FrightMapSources.tsx');
  const body = src.slice(src.indexOf('export const FrightMapSources'), src.indexOf('export const FrightNightTint'));
  assert.equal((body.match(/<Marker key="fs"/g) || []).length, 1);
  const stall = body.slice(body.indexOf('<Marker key="fs"'), body.indexOf('</Marker>', body.indexOf('<Marker key="fs"')));
  assert.match(stall, /coordinate=\{pin\(stall \?\? stable\.all\[0\] \?\? PARKED\)\}/, 'parks when there is no shop, never unmounts');
  assert.match(stall, /touchEnabled=\{stallOn && !!input\.onShopPress\}/);
  assert.match(stall, /<ShowWhen box=\{STALL_BOX\} on=\{stallOn\}>/);
  assert.doesNotMatch(body, /\{stall && <Marker|stall \? <Marker/, 'never a conditional Marker');
  const sprite = read('src/components/map/fright/HalloweenStall.tsx');
  assert.match(sprite, /width: STALL_BOX\.w, height: STALL_BOX\.h/);
  assert.doesNotMatch(sprite, /react-native-skia|react-native-svg/);
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /onShopPress: openHalloweenShop/);
  assert.match(explore, /stallAction\(stall\) === 'open'\) \{\s*queueHaptic\('tapLight'\);\s*playSfx\('ui\.tap', 0\.6\);\s*RootNavigation\.navigate\('Store', \{ store: stall\.store_id \}\)/);
  assert.match(explore, /const now = frightServerNow\(\);/, 'the away dialog reads the server clock, like the chip');
  assert.match(explore, /awayHeadline\(stall\.reason, frightNightWindow, now\)/);
  assert.match(explore, /awayMessage\(stall\.reason, frightNightWindow, now\)/, 'the teaser quotes tonight\'s real hours');
  assert.match(sprite, /require\('\.\/art\/halloween-booth-closed\.webp'\)/, 'away is the solid booth without its glow');
  assert.doesNotMatch(sprite, /shadowRadius/, 'the glow is baked into the art: no live shadow on a map marker');
  assert.match(sprite, /require\('\.\/art\/halloween-booth\.webp'\)/, 'the Halloween booth art, not the day shop');
});

test('the shop screen and checkout say "Only at Fin-ister Nights" when the server refuses', () => {
  const screen = read('src/screens/StoreScreen.tsx');
  assert.match(screen, /refused\?\.status === 403 && refused\.data\?\.only_at_event/);
  assert.match(screen, /<SharkLoader tone="onBlue" state="empty" title=\{AWAY_LINE\}/);
  assert.match(screen, /header: 'SHOP CLOSES IN'/);
  const purchase = read('src/hooks/usePurchaseItem.tsx');
  assert.match(purchase, /if \(data\?\.only_at_event\) \{\s*setModal\(\{ type: 'away', item \}\);/);
});
