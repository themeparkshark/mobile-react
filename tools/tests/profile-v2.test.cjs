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
  'src/components/xpPotionModel.ts',
  'src/components/profile/useCardOnScreen.ts',
  'src/components/profile/stampDot.ts',
  'src/components/profile/ProfileEventChip.tsx',
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

test('the XP potion pauses off screen, in the background, when covered and under Reduce Motion', () => {
  const potion = read('src/components/XpPotion.tsx');
  assert.match(potion, /setActive\(!paused && reduced === false && appActive\.current\)/);
  assert.match(potion, /AppState\.addEventListener/);
  assert.match(potion, /useFrameCallback\([\s\S]*?, false\)/, 'the clock starts stopped');
  assert.equal((potion.match(/<Canvas/g) || []).length, 1, 'one canvas');
  assert.doesNotMatch(potion, /BlurMask/, 'glow is a gradient, no per-frame blur');
  assert.match(potion, /usePathValue/, 'paths are reused, not rebuilt');
  const profile = read('src/screens/ProfileScreen.tsx');
  assert.match(profile, /paused=\{!focused \|\| levelCard\.offscreen\}/);
  const player = read('src/screens/PlayerScreen.tsx');
  assert.match(player, /paused=\{!focused \|\| levelCard\.offscreen\}/);
});

test('level up earned elsewhere plays on return: mount at level 5 data, now level 6', () => {
  const { potionTransition } = loadTs('src/components/xpPotionModel.ts');
  const before = { level: 5, progress: 0.8 };
  const now = { level: 6, progress: 0.07 };
  assert.equal(potionTransition(before, now, null), 'wait', 'Reduce Motion unknown: decide nothing yet');
  assert.equal(potionTransition(before, now, false), 'levelUp', 'then the level up plays');
  assert.equal(potionTransition(before, now, true), 'levelUp', 'Reduce Motion still gets the level up (still vial, sound, haptic, ribbon)');
  assert.equal(potionTransition(null, now, false), 'pour');
  assert.equal(potionTransition({ level: 6, progress: 0.07 }, { level: 6, progress: 0.3 }, false), 'gain');
  assert.equal(potionTransition({ level: 6, progress: 0.3 }, { level: 6, progress: 0.3 }, false), 'settle');
  // A quick refetch inside the build-up keeps the celebration; the burst fires once.
  assert.equal(potionTransition({ level: 6, progress: 0.07 }, { level: 6, progress: 0.1 }, false, true), 'defer');
  assert.equal(potionTransition({ level: 6, progress: 0.07 }, { level: 7, progress: 0.1 }, false, true), 'defer');
  const potion = read('src/components/XpPotion.tsx');
  assert.match(potion, /if \(kind === 'wait'\) return undefined;\n\s+last\.current = next;/, 'waiting never records the new level');
  assert.match(potion, /timers\.current\.push\(setTimeout\(\(\) => cbs\.current\.onLevelUpBurst\?\.\(\), 520\)\)/, 'burst timer only unmount clears');
  assert.doesNotMatch(potion, /return \(\) => clearTimeout\(timer\)/);
  assert.match(potion, /if \(r < 3\) continue;/, 'no navy specks');
  assert.match(potion, /return FILL_BASE - f \* \(FILL_BASE - FILL_TOP\)/, 'liquid never drops below the label line');
  assert.match(potion, /if \(kind === 'levelUp'\) cbs\.current\.onLevelUpBurst\?\.\(\);/, 'Reduce Motion fires the burst callback');
  const card = read('src/components/Experience.tsx');
  assert.match(card, /Level up!/);
  assert.match(card, /useReduceMotionPreference\(\) === true/);
  assert.match(card, /ribbonShadow[\s\S]*ribbonLip[\s\S]*ribbonEdge[\s\S]*ribbonFill/, 'nested ribbon');
  assert.match(card, /HapticPatterns\.levelUp\(\)/);
});

test('the off-screen check uses the card box in content coordinates', () => {
  const { isOffscreen } = loadTs('src/components/profile/useCardOnScreen.ts', { react: { useCallback: (f) => f, useMemo: (f) => f(), useRef: (v) => ({ current: v }), useState: (v) => [v, () => undefined] } });
  const card = { top: 560, bottom: 680 };
  assert.equal(isOffscreen(card, { y: 0, height: 700 }), false, 'visible at rest');
  assert.equal(isOffscreen(card, { y: 425, height: 700 }), false, 'round 1 froze it here while visible');
  assert.equal(isOffscreen(card, { y: 690, height: 700 }), true, 'scrolled past');
  assert.equal(isOffscreen(card, { y: 0, height: 0 }), false, 'unknown viewport: keep running');
});

test('Stamp Book dot counts earned stamps with unclaimed rewards, or the server count', () => {
  const { stampClaimableCount } = loadTs('src/components/profile/stampDot.ts');
  const reward = { energy: 0, tickets: 0, xp: 50, coins: 0, title: null };
  const none = { energy: 0, tickets: 0, xp: 0, coins: 0, title: null };
  const resp = { stamps: { parks: [
    { is_earned: true, reward_claimed: false, rewards: reward },
    { is_earned: true, reward_claimed: true, rewards: reward },
    { is_earned: false, reward_claimed: false, rewards: reward },
    { is_earned: true, reward_claimed: false, rewards: none },
  ] }, summary: { total: 4, earned: 3 } };
  assert.equal(stampClaimableCount(resp), 1);
  assert.equal(stampClaimableCount({ ...resp, summary: { claimable: 3 } }), 3);
  assert.equal(stampClaimableCount(null), 0);
});

test('layout: shortcuts before the coin card, Secret Store locks for non-VIP, friends fit, Ride Tracker is a card', () => {
  const profile = read('src/screens/ProfileScreen.tsx');
  assert.ok(profile.indexOf('<ProfileShortcuts') < profile.indexOf('<FeaturedRideCoinCard'), 'shortcut row comes first');
  assert.match(profile, /locked: store\.is_secret_store && !player\?\.is_subscribed/);
  assert.doesNotMatch(profile, /FlashList/);
  assert.match(profile, /friends\.map\(\(friend\) =>/);
  assert.match(profile, /backgroundColor: '#c6e3f5',\n\s+borderRadius: 20,\n\s+paddingBottom: 5,/, 'Ride Tracker uses the nested lip');
  assert.match(profile, /5 \* 60_000/, 'Stamp Book dot fetch is throttled');
  assert.match(profile, /dot: stampsToClaim > 0/);
  assert.match(profile, /trophy=\{<ProfileEventChip \/>\}/);
});

test("another player's page: kind actions first, park history for friends only, numbers never disagree", () => {
  const player = read('src/screens/PlayerScreen.tsx');
  const order = ['compliment', 'gift', 'remove-friend'].map((k) => player.indexOf(`key: '${k}'`));
  assert.ok(order[0] < order[1] && order[1] < order[2], 'Compliment, Gift, then Unfriend');
  assert.match(player, /isFriend && parks\.length > 0/);
  assert.match(player, /loaded\.is_friend \? await getVisitedParks\(player\) : \[\]/);
  assert.match(player, /trophy=\{<ProfileEventChip playerId=\{currentPlayer\.id\} \/>\}/);
  const stats = read('src/components/Stats.tsx');
  assert.match(stats, /Math\.max\(Number\(player\.total_experience\) \|\| 0, Number\(player\.experience\) \|\| 0\)/);
});
