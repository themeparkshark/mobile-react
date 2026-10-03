'use strict';
/**
 * Profile v2: one coin shop on the shortcut row, matching Alex badges, labels
 * that never wrap, the XP potion level card, solid VIP and Verified badges,
 * and a page that scrolls clear of the bottom bar.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { scanSource } = require('./helpers/ui-copy-rules.cjs');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const FILES = [
  'src/screens/ProfileScreen.tsx',
  'src/screens/PlayerScreen.tsx',
  'src/components/Experience.tsx',
  'src/components/XpPotion.tsx',
  'src/components/profile/ProfileShortcuts.tsx',
  'src/components/profile/StatusBadges.tsx',
  'src/components/profile/TitlePill.tsx',
  'src/components/profile/profileStores.ts',
  'src/constants/levelUnlocks.ts',
];

test('profile surfaces have no emoji, em dashes, glyph icons or third-party phrases', () => {
  const offenders = [];
  for (const file of FILES) {
    for (const hit of scanSource(read(file), file)) offenders.push(`${file}:${hit.line} ${hit.kind}`);
  }
  assert.deepEqual(offenders, []);
});

test('the shortcut row shows one coin shop: the legacy Store hides when the Shark Shop exists', () => {
  const { profileStores } = loadTs('src/components/profile/profileStores.ts');
  const store = { id: 1, name: 'Store', is_secret_store: false };
  const secret = { id: 5, name: 'Secret Store', is_secret_store: true };
  const shark = { id: 9, name: 'Shark Shop', is_secret_store: false };
  const extra = { id: 12, name: 'Holiday Store', is_secret_store: false };

  const all = profileStores([secret, store, shark, extra]);
  assert.equal(all.sharkShop.id, 9);
  assert.deepEqual(all.others.map((s) => s.id), [12, 5], 'free stores first, VIP last, no legacy Store');

  const old = profileStores([store, secret]);
  assert.equal(old.sharkShop, null);
  assert.deepEqual(old.others.map((s) => s.id), [1, 5], 'an old server without the Shark Shop keeps its Store');
});

test('the level card says what the next level opens only when that is true', () => {
  const { nextLevelCaption, EARN_XP_CAPTION } = loadTs('src/constants/levelUnlocks.ts');
  assert.equal(nextLevelCaption(5, true), 'Level 6 unlocks Shark Ride Bosses');
  assert.equal(nextLevelCaption(5, false), EARN_XP_CAPTION, 'Ride Bosses off: no promise');
  assert.equal(nextLevelCaption(8, true), EARN_XP_CAPTION, 'no gate at 9: how to earn instead');
});

test('Shark Shop and Stamp Book use the round Alex badges, Report is a quiet link, not a blank badge', () => {
  const profile = read('src/screens/ProfileScreen.tsx');
  assert.match(profile, /shortcut_shark_shop\.png/);
  assert.match(profile, /shortcut_stamp_book\.png/);
  assert.doesNotMatch(profile, /explore\/stampbook\.png|profile\/shark_shop\.png/);
  assert.match(profile, /RootNavigation\.navigate\('Inventory'\)/);
  for (const art of ['shortcut_shark_shop.png', 'shortcut_stamp_book.png']) {
    const file = path.join(root, 'assets/images/screens/profile', art);
    const png = fs.readFileSync(file);
    assert.equal(png.readUInt32BE(16), 363, `${art} is on the 363 x 386 store frame`);
    assert.equal(png.readUInt32BE(20), 386);
    assert.ok(png.length < 60_000, `${art} stays small for OTA`);
  }
  const player = read('src/screens/PlayerScreen.tsx');
  assert.doesNotMatch(player, /explore\/base\.png/);
  assert.match(player, /Report this player/);
});

test('shortcut labels never wrap and the row never hides a badge off screen', () => {
  const row = read('src/components/profile/ProfileShortcuts.tsx');
  assert.match(row, /numberOfLines=\{1\} adjustsFontSizeToFit/);
  assert.match(row, /MAX_COLUMNS = 4/);
  assert.match(row, /accessibilityRole="button"/);
});

test('the page scrolls clear of the bottom bar', () => {
  const profile = read('src/screens/ProfileScreen.tsx');
  const pad = Number(/paddingBottom: (\d+),\n\s+\}\}\n\s+>\n\s+<ImageBackground/.exec(profile)?.[1] ?? 0);
  assert.ok(pad >= 110, `bottom padding ${pad}`);
});

test('VIP and Verified are solid badges with a meaning line, never a fading pulse', () => {
  const badges = read('src/components/profile/StatusBadges.tsx');
  assert.doesNotMatch(badges, /Animated\.loop|opacity: glow/);
  assert.match(badges, /See your perks/);
  assert.match(badges, /Official shark/);
});

test('the XP potion pauses off screen, in the background and under Reduce Motion', () => {
  const potion = read('src/components/XpPotion.tsx');
  assert.match(potion, /setActive\(!paused && !reduced && appActive\.current\)/);
  assert.match(potion, /AppState\.addEventListener/);
  assert.match(potion, /useFrameCallback\([\s\S]*?, false\)/, 'the clock starts stopped');
  assert.equal((potion.match(/<Canvas/g) || []).length, 1, 'one canvas');
  const profile = read('src/screens/ProfileScreen.tsx');
  assert.match(profile, /paused=\{!focused \|\| potionOffscreen\}/);
});
