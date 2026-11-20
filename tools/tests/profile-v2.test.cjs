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
  'src/components/XpBar.tsx',
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
  // Step 2a: LookScreen owns the number (today's 120 with the look off); the page's content takes it.
  const pad = Number(/<LookScreen footer legacyPad=\{\{ top: -?\d+, bottom: (\d+) \}\}/.exec(profile)?.[1] ?? 0);
  assert.ok(pad >= 110, `bottom padding ${pad}`);
  assert.match(profile, /paddingBottom: pad\.bottom,\n\s+\}\}\n\s+>\n\s+<ImageBackground/);
});

test('VIP and Verified are solid badges with a meaning line, never a fading pulse', () => {
  const badges = read('src/components/profile/StatusBadges.tsx');
  assert.doesNotMatch(badges, /Animated\.loop|opacity: glow/);
  assert.match(badges, /See your VIP bonuses/);
  assert.match(badges, /Official shark/);
});

test('the XP bar pauses off screen, in the background, when covered and under Reduce Motion', () => {
  const potion = read('src/components/XpBar.tsx');
  assert.match(potion, /setActive\(!asleep\.current && !paused && !saver && reduced === false && appActive\.current && width > 0\)/);
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
  const potion = read('src/components/XpBar.tsx');
  assert.match(potion, /useEffect\(\(\) => \(\) => \{\n\s+driver\.dispose\(\);[\s\S]*?\}, \[driver\]\)/, 'timers clear only on unmount');
  assert.match(potion, /const base = Math\.min\(0\.5, \(innerH \* 0\.9\) \/ innerW\)/, 'a living blob of liquid stays at the start of a fresh level');
  const card = read('src/components/Experience.tsx');
  assert.match(potion, /'LEVEL UP!'/);
  assert.match(card, /useReduceMotionPreference\(\) === true/);
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
  assert.match(profile, /readStampDotCache\(playerId\)/, 'Stamp Book dot fetch is cached per player');
  assert.match(profile, /dot: stampsToClaim > 0/);
  assert.match(profile, /trophy=\{<><ProfileEventChip \/>/);
});

test("another player's page: kind actions first, park history for friends only, numbers never disagree", () => {
  const player = read('src/screens/PlayerScreen.tsx');
  const order = ['compliment', 'gift', 'remove-friend'].map((k) => player.indexOf(`key: '${k}'`));
  assert.ok(order[0] < order[1] && order[1] < order[2], 'Compliment, Gift, then Unfriend');
  assert.match(player, /isFriend && parks\.length > 0/);
  assert.match(player, /loaded\.is_friend \? await getVisitedParks\(player\) : \[\]/);
  assert.match(player, /trophy=\{<><ProfileEventChip playerId=\{currentPlayer\.id\} \/>/);
  const stats = read('src/components/Stats.tsx');
  // Fix w3 T121: XP lives in the level bar, so the tiles never repeat it (and never disagree with it).
  assert.doesNotMatch(stats, /label: 'Total XP'/);
});

function fakeClock() {
  let now = 0;
  let queue = [];
  return {
    setTimer: (fn, ms) => { const h = { at: now + ms, fn }; queue.push(h); return h; },
    clearTimer: (h) => { queue = queue.filter((x) => x !== h); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        queue.sort((a, b) => a.at - b.at);
        const next = queue[0];
        if (!next || next.at > end) break;
        queue.shift();
        now = next.at;
        next.fn();
      }
      now = end;
    },
  };
}

function runDriver(initial) {
  const { createPotionDriver } = loadTs('src/components/xpPotionModel.ts');
  const clock = fakeClock();
  const log = [];
  const driver = createPotionDriver(initial, {
    setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    play: (kind, next) => log.push(`play:${kind}:${next.level}`),
    burst: () => log.push('burst'),
    refill: (latest) => log.push(`refill:${latest.level}:${latest.progress}`),
  });
  return { driver, clock, log };
}

test('driver: a refetch 300 ms into a level up keeps it, the burst fires once, the refill uses the latest value', () => {
  const { driver, clock, log } = runDriver({ level: 5, progress: 0.85 });
  assert.equal(driver.update({ level: 6, progress: 0.07 }, false), 'levelUp');
  clock.advance(300);
  assert.equal(driver.update({ level: 6, progress: 0.1 }, false), 'defer');
  clock.advance(3000);
  assert.deepEqual(log, ['play:levelUp:6', 'burst', 'refill:6:0.1']);
});

test('driver: a second level up inside the celebration is queued and gets its own burst', () => {
  const { driver, clock, log } = runDriver({ level: 5, progress: 0.85 });
  driver.update({ level: 6, progress: 0.9 }, false);
  clock.advance(300);
  assert.equal(driver.update({ level: 7, progress: 0.05 }, false), 'defer');
  clock.advance(5000);
  assert.deepEqual(log, ['play:levelUp:6', 'burst', 'play:levelUp:7', 'burst', 'refill:7:0.05']);
});

test('driver: unknown Reduce Motion waits, Reduce Motion bursts at once, dispose cancels pending timers', () => {
  const a = runDriver({ level: 5, progress: 0.8 });
  assert.equal(a.driver.update({ level: 6, progress: 0.1 }, null), 'wait');
  assert.equal(a.driver.update({ level: 6, progress: 0.1 }, true), 'levelUp');
  assert.deepEqual(a.log, ['play:levelUp:6', 'burst']);
  const b = runDriver({ level: 5, progress: 0.8 });
  b.driver.update({ level: 6, progress: 0.1 }, false);
  b.driver.dispose();
  b.clock.advance(5000);
  assert.deepEqual(b.log, ['play:levelUp:6']);
});

test('Stamp Book dot cache is per player and cleared on logout', () => {
  const m = loadTs('src/components/profile/stampDot.ts');
  m.writeStampDotCache(11, 3, 1000);
  assert.equal(m.readStampDotCache(11, 2000), 3);
  assert.equal(m.readStampDotCache(12, 2000), null, 'another kid on the same device sees no dot');
  assert.equal(m.readStampDotCache(11, 1000 + 5 * 60_000), null, 'expires after 5 minutes');
  m.clearStampDotCache();
  assert.equal(m.readStampDotCache(11, 2000), null);
  assert.match(read('src/screens/ProfileScreen.tsx'), /if \(!player\) \{\n\s+clearStampDotCache\(\);/, 'cleared when the player signs out');
});

// Kid-safety hotfix: /players/{id} sends keys, coins and experience as null to non-friends.
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
const stranger = {
  id: 42, screen_name: 'P42', keys: null, coins: null, experience: null, total_experience: 3040,
  park_coins_count: 4, visited_parks_count: 2, completed_tasks_count: 7, experience_level: { level: 6, experience: 9400 },
};
function texts(node, out = []) {
  if (node == null || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
  if (Array.isArray(node)) { node.forEach((c) => texts(c, out)); return out; }
  texts(node.props?.children, out);
  return out;
}
const statsImports = {
  './ProfileStatIcon': { default: 'ProfileStatIcon' },
  '../context/SoundEffectProvider': { SoundEffectContext: { value: { playSound: () => {} } } },
  '../hooks/useReducedGameMotion': { default: () => false },
  '../config': { default: { primary: '#09268f' } },
  '../helpers/countText': loadTs('src/helpers/countText.ts'),
};

test("a stranger's stats render without null balances: Keys and Shark Coins tiles hide, no tile gets null", () => {
  const collect = (tree) => { const out = []; (function walk(n) { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n.type === 'function') out.push(n.props); walk(n.props?.children); })(tree); return out; };
  // Fix w3 T121/T133: three tiles that pull (Shelf Coins, Ride Wins, Parks). A coin count the screen
  // could not load drops its tile: it never borrows park_coins_count (4 here: parks with a shelf).
  const app = runtime('src/components/Stats.tsx', statsImports, { player: stranger });
  const tiles = collect(app.tree);
  assert.deepEqual(tiles.map((t) => t.label), ['Ride Wins', 'Parks']);
  assert.ok(tiles.every((t) => typeof t.value === 'number'), 'every tile gets a number');
  const rn = { ...app.native, Animated: { ...app.native.Animated, multiply: (a) => a } };
  for (const t of tiles) {
    const tile = runtime('src/components/Stats.tsx', { ...statsImports, 'react-native': rn }, t,
      { setInterval: () => 0, clearInterval: () => {} }, { exportName: 'AnimatedStat' });
    assert.match(tile.find((n) => n.type === 'Pressable').props.accessibilityLabel, new RegExp(`^${t.label}: `));
  }
  const zeroed = runtime('src/components/Stats.tsx', statsImports, { player: { ...stranger, keys: 0, coins: 0 }, hideBalances: true, rideCoins: 9 });
  assert.deepEqual(collect(zeroed.tree).map((t) => t.label), ['Shelf Coins', 'Ride Wins'], 'no balances or park count for strangers');
  assert.match(read('src/screens/PlayerScreen.tsx'), /<Stats player=\{currentPlayer\} hideBalances=\{!isFriend\} rideCoins=\{rideCoinTotal\(parks\)\} parks=\{visitedParkCount\(parks\)\} \/>/);
  // The signed-in player: the shelf sum (14), wins and parks; no Keys tile while they hold none.
  const own = collect(runtime('src/components/Stats.tsx', statsImports, { player: { ...stranger, keys: 0, coins: 1840, experience: 2405 }, rideCoins: 14, parks: 1 }).tree);
  assert.deepEqual(own.map((t) => [t.label, t.value]), [['Shelf Coins', 14], ['Ride Wins', 7], ['Parks', 1]]);
  // A held key shows its tile first.
  const keyed = collect(runtime('src/components/Stats.tsx', statsImports, { player: { ...stranger, keys: 2 }, rideCoins: 14, parks: 1 }).tree);
  assert.deepEqual(keyed.map((t) => t.label), ['Keys', 'Shelf Coins', 'Ride Wins', 'Parks']);
});

test('fix w3 T121/T129: Profile is calm: three tiles, every park started with its coins, the lanyard behind the Pins door', () => {
  const profile = read('src/screens/ProfileScreen.tsx');
  const statsAt = profile.indexOf('<Stats player={player}');
  const parksAt = profile.indexOf("labels.your_parks || 'Your parks'");
  const friendsAt = profile.indexOf("labels.your_friends || 'Your friends'");
  assert.ok(statsAt > 0 && statsAt < parksAt && parksAt < friendsAt, 'Your parks (the all-parks completion view) sits right under the tiles');
  const visited = read('src/components/VisitedParks.tsx');
  assert.match(visited, /`\$\{park\.ride_coins_collected \?\? 0\} of \$\{park\.ride_coins_available\} \$\{park\.ride_coins_available === 1 \? 'coin' : 'coins'\}`/);
  assert.match(read('src/screens/pins/ProfileLanyardCard.tsx'), /if \(!data \|\| data\.lanyard\.length === 0\) return null;/);
});

test("a stranger's level card shows the level only, never 0 / N XP", () => {
  const imports = {
    '../constants/levelUnlocks': loadTs('src/constants/levelUnlocks.ts'),
    '../context/SoundEffectProvider': { SoundEffectContext: { value: { playSound: () => {} } } },
    '../helpers/hapticPatterns': { default: { levelUp: () => {} } },
    '../hooks/useCrumbs': { default: () => ({ labels: {} }) },
    '../hooks/useReducedGameMotion': { useReduceMotionPreference: () => false },
    '../services/progression/progressionFlags': { useProgressionFlags: () => ({ rideBoss: false }) },
    './XpBar': { default: 'XpBar', XP_BAR_HEIGHT: 26 },
    '../ui': { GameIcon: 'GameIcon' },
    'sprintf-js': { vsprintf: (f, a) => f.replace('%s', a[0]) },
  };
  const card = runtime('src/components/Experience.tsx', imports, { player: stranger, own: false });
  const words = texts(card.tree).join(' ');
  assert.match(words, /Level 6/);
  assert.doesNotMatch(words, /XP|to Level/);
  assert.equal(card.find((n) => n.props?.accessibilityRole === 'summary').props.accessibilityLabel, 'Level 6.');
});

