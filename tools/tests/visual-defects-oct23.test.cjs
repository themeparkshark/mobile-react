'use strict';
// Visual defects lane (Oct 23 audit): the visible mess a kid sees first.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const ROOT = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('profile ride coins come from the same park rows the profile lists', () => {
  const { rideCoinTotal } = loadTs('src/components/profile/profileCounts.ts');
  assert.equal(rideCoinTotal([{ ride_coins_collected: 9 }, { ride_coins_collected: 13 }, { ride_coins_collected: 50 }]), 72);
  assert.equal(rideCoinTotal([]), null, 'no parks keeps the old count');
  assert.equal(rideCoinTotal([{ ride_coins_collected: null }]), null);
  assert.equal(rideCoinTotal([{ ride_coins_collected: 2.7 }, { ride_coins_collected: -4 }]), 2);
  assert.match(read('src/screens/ProfileScreen.tsx'), /<Stats player=\{player\} rideCoins=\{rideCoinTotal\(parks\)\}/);
});

test('the Parks tile counts the same rows as Your Parks, on Profile and on a friend', () => {
  const { visitedParkCount } = loadTs('src/components/profile/profileCounts.ts');
  const rows = [{ id: 8 }, { id: 7 }, { id: 13 }, { id: 1 }];
  assert.equal(visitedParkCount(rows), rows.length);
  assert.equal(visitedParkCount([]), null, 'not loaded yet keeps the player count');
  assert.match(read('src/screens/ProfileScreen.tsx'), /<Stats player=\{player\} rideCoins=\{rideCoinTotal\(parks\)\} parks=\{visitedParkCount\(parks\)\} \/>/);
  assert.match(read('src/screens/PlayerScreen.tsx'), /parks=\{visitedParkCount\(parks\)\}/);
  assert.match(read('src/components/Stats.tsx'), /parks \?\? visibleCount\(player\.visited_parks_count\)/);
});

test('the lanyard count says how many pins are hanging, and an empty strap says what to do', () => {
  const { lanyardCountLabel, lanyardEmptyHint } = loadTs('src/components/profile/profileCounts.ts');
  assert.equal(lanyardCountLabel(0, 27), '0 of 27 pins on');
  assert.equal(lanyardCountLabel(6, 27), '6 of 27 pins on');
  assert.equal(lanyardCountLabel(1, 1), '1 pin');
  assert.equal(lanyardCountLabel(0, 0), 'No pins yet');
  assert.equal(lanyardEmptyHint(3), 'Tap + to hang a pin');
  assert.equal(lanyardEmptyHint(0), 'Win pins from boxes and park sets');
});

test('the night map stays TPS blue: never violet, never a heavy gray wash', () => {
  const sky = loadTs('src/components/map/alive/skyLight.ts');
  for (const e of [-5, -8, -11, -30]) {
    const l = sky.lightForElevation(e);
    const hex = l.tint.color.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    assert.ok(b > g && g > r, `blue leads green leads red at ${e} (${l.tint.color})`);
    assert.ok(l.tint.opacity <= sky.NIGHT_TINT_OPACITY + 1e-9, `tint stays light at ${e}`);
  }
  assert.ok(sky.NIGHT_TINT_OPACITY < sky.MAX_TINT_OPACITY);
  assert.doesNotMatch(read('src/components/map/alive/MapSkyOverlay.tsx'), /rgba\(8,20,58/, 'no near-black navy vignette');
});

test('the team bar never claims every ride is open', () => {
  const bar = read('src/components/RideControlBar.tsx');
  assert.doesNotMatch(bar, /EVERY RIDE IS OPEN/);
  assert.match(bar, /NO_LEADER_HEADLINE = 'NO TEAM HAS A RIDE YET'/);
});

test('Wait Times draws its icons: no wrench emoji, no play glyph the font cannot draw', () => {
  const src = read('src/screens/QueueTimesScreen.tsx');
  assert.doesNotMatch(src, /\\u\{1F527\}|\u{1F527}/u);
  assert.doesNotMatch(src, /▶/);
  assert.match(src, /icon: 'wrench'/);
  assert.match(src, /<GameIcon name="play"/);
});

test('one footer clearance keeps the MAP compass off the last row of every list', () => {
  const wrapper = read('src/components/Wrapper.tsx');
  assert.match(wrapper, /export const FOOTER_CLEARANCE = BOTTOM_BAR_OVERHANG \+ 36;/);
  for (const file of [
    'src/screens/SettingsScreen.tsx', 'src/screens/InventoryScreen.tsx', 'src/screens/QueueTimesScreen.tsx',
    'src/screens/RideTracker/RideLogScreen.tsx', 'src/screens/RideTracker/RideTrackerScreen.tsx',
    'src/screens/RideTracker/RideHistoryScreen.tsx', 'src/screens/RideTracker/RideStatsScreen.tsx',
  ]) assert.match(read(file), /FOOTER_CLEARANCE/, file);
});

test('Ride Tracker pages wear the shared game header, not web gradients', () => {
  for (const name of ['RideHistory', 'RideStats', 'RideAchievements', 'RideCollections', 'RideWishlist']) {
    const src = read(`src/screens/RideTracker/${name}Screen.tsx`);
    assert.match(src, /<RideTrackerFrame title=/, name);
    assert.doesNotMatch(src, /colors=\{\['#38BDF8', '#0EA5E9', '#09268f'\]\}/, name);
  }
});

test('park names are uppercased in code so iOS never clips them', () => {
  const src = read('src/components/VisitedParks.tsx');
  assert.doesNotMatch(src, /textTransform: 'uppercase'/);
  assert.match(src, /String\(park\.name \?\? ''\)\.toUpperCase\(\)/);
});

test('launch screens sit on the splash blue with the video poster: no dark navy flash', () => {
  for (const file of ['src/screens/Auth/LoginScreen.tsx', 'src/screens/LoadingScreen.tsx']) {
    const src = read(file);
    assert.doesNotMatch(src, /backgroundColor: '#09268f'/, file);
    assert.match(src, /SPLASH_BLUE = '#0768B9'/, file);
    assert.match(src, /posterSource=\{SPLASH_POSTER\}/, file);
  }
  assert.ok(fs.existsSync(path.join(ROOT, 'assets/images/screens/login/splash-loop-poster.jpg')));
});

test('Shark Pass pads its title below the Dynamic Island with the JS inset', () => {
  const src = read('src/screens/SharkPassScreen.tsx');
  assert.match(src, /paddingTop: insets\.top/);
  assert.doesNotMatch(src, /<SafeAreaView/);
});

test('Gym Join card sits above the pillars and the Leave Gift button stays on screen', () => {
  const gym = read('src/screens/GymBattle/GymBattleScreen.tsx');
  assert.match(gym, /noTeamOverlay: \{[^}]*zIndex: 10/s);
  const cc = read('src/screens/CommunityCenterScreen.tsx');
  // The button fills the green slot painted in the background (0.70 to 0.99 of the width).
  assert.match(cc, /LEAVE_GIFT_W = Math\.round\(SCREEN_WIDTH \* 0\.31\)/);
  assert.match(cc, /LEAVE_GIFT_LEFT = Math\.round\(SCREEN_WIDTH \* 0\.678\)/);
  assert.match(cc, /LEAVE_GIFT_PULSE = 1\.05/);
  // Scale grows from the center: the right edge at the top of the pulse.
  assert.ok(0.678 + 0.31 + 0.31 * 0.05 / 2 < 1, 'even mid-pulse the button stays on screen');
  // Short phones (iPhone SE): GO BACK and the cooldown note sit on the screen, not on the art's hidden bottom.
  assert.match(cc, /bottom: 80 \+ ART_OVERFLOW/);
  assert.match(cc, /bottom: 145 \+ ART_OVERFLOW/);
  assert.match(cc, /SCREEN_HEIGHT - LEAVE_GIFT_H - 2\)/);
});

test('Stamp Book bookmark band is solid so the title never ghosts through', () => {
  const src = read('src/screens/StampBookScreen.tsx');
  assert.match(src, /tabsWrap: \{[^}]*backgroundColor: '#04488c'/);
});

test('counts never use a comma: the display font draws it like a period ("4,881" read as "4.881")', () => {
  const countText = loadTs('src/helpers/countText.ts').default;
  assert.equal(countText(4881), '4881');
  assert.equal(countText(350), '350');
  assert.equal(countText(9999), '9999');
  assert.equal(countText(10000), '10K');
  assert.equal(countText(12500), '12.5K');
  assert.equal(countText(12599), '12.5K', 'rounds down, never shows more than you have');
  assert.equal(countText(250000), '250K');
  assert.equal(countText(1250000), '1.2M');
  assert.equal(countText(-12500), '-12.5K');
  assert.equal(countText(-1500), '-1500');
  assert.equal(countText(Number.NaN), '0');
  const shorten = loadTs('src/helpers/shorten-number.ts').default;
  assert.equal(shorten(4881), '4881', 'the header coin pill');
  assert.equal(shorten(12500), '12.5K');
});

test('no player-visible text glyphs the game fonts cannot draw on the touched screens', () => {
  for (const file of [
    'src/components/StandingsPicker.tsx', 'src/components/map/fright/FrightSprites.tsx',
    'src/screens/ExploreScreen/PrepItem.tsx', 'src/screens/ExploreScreen/ridePhoto/CatchReveal.tsx',
    'src/screens/ExploreScreen/ridePhoto/RidePhotoCatch.tsx', 'src/screens/pinTrading/TradeSheet.tsx',
    'src/components/CelebrationEffects.tsx', 'src/screens/QueueTimesScreen.tsx',
  ]) assert.doesNotMatch(read(file), /[▼▶◀✓✕♛◆⭐→]|\\u2192/u, file);
});

test('no drawn number uses toLocaleString (commas look like periods in the Shark font)', () => {
  // Allowed: VoiceOver text, dates, decimals, and the one outgoing share message.
  const allowed = /accessibilityLabel|accessibilityValue|new Date|Date\(|month:|weekday:|day:|Fraction|I scored |Level \$\{level\}/;
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) { walk(rel); continue; }
      if (!/\.(ts|tsx)$/.test(e.name) || /\.test\./.test(e.name) || rel === 'src/helpers/countText.ts') continue;
      read(rel).split('\n').forEach((line, i) => {
        if (line.includes('toLocaleString') && !allowed.test(line)) offenders.push(`${rel}:${i + 1}`);
      });
    }
  };
  walk('src');
  assert.deepEqual(offenders, [], 'use countText for drawn counts');
});
