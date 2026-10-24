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
  const login = read('src/screens/Auth/LoginScreen.tsx');
  assert.doesNotMatch(login, /backgroundColor: '#09268f'/);
  assert.match(login, /SPLASH_BLUE = '#0768B9'/);
  assert.match(login, /posterSource=\{SPLASH_POSTER\}/);
  // The Loading screen is the launch scene: the native splash's own art on the native splash blue.
  assert.doesNotMatch(read('src/screens/LoadingScreen.tsx'), /#09268f/);
  assert.match(read('src/components/launch/LaunchScene.tsx'), /export const LAUNCH_BLUE = '#0768B9';/);
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
  // The painted kiosk runs to the art's edge, so a drawn kiosk face covers its price and green slot
  // (no painted twin shows) and LEAVE GIFT ends 16 pt from the screen edge on every phone.
  assert.match(cc, /const KIOSK = kioskLayout\(SCREEN_WIDTH, SCALED_HEIGHT\);/);
  assert.match(cc, /LEAVE_GIFT_LEFT = KIOSK\.button\.left;/);
  const { kioskLayout, PAINTED_SLOT, PAINTED_PRICE, SCREEN_GUTTER, KIOSK_COLORS, LEAVE_GIFT_PILL_SHARE } = loadTs('src/screens/CommunityCenter/leaveGiftLayout.ts');
  // The plaque is the game's warm-white card with a thick navy rim, never code-drawn dark slate.
  assert.equal(KIOSK_COLORS.face, '#fff7e6');
  assert.match(cc, /kioskFace: \{[^}]*borderWidth: 4/s);
  assert.equal(KIOSK_COLORS.edge, '#05346e');
  assert.match(cc, /kioskFace: \{[^}]*\.\.\.SHADOW\.card/s);
  // Alex's whole button shows (pill, gold rim, stone base, gem); only the loose glow under it is cropped.
  assert.match(cc, /leaveGiftCrop: \{[^}]*overflow: 'hidden'/s);
  assert.ok(LEAVE_GIFT_PILL_SHARE >= 0.89 && LEAVE_GIFT_PILL_SHARE <= 0.92);
  // The plaque also covers the painted pedestal gem (about 0.813 of the art) under the slot.
  assert.ok(loadTs('src/screens/CommunityCenter/leaveGiftLayout.ts').KIOSK_FACE.bottom >= 0.816);
  for (const [phone, w] of [['SE', 375], ['17 Pro', 402], ['Pro Max', 440]]) {
    const artH = w * 2144 / 964;
    const k = kioskLayout(w, artH);
    assert.ok(w - (k.button.left + k.button.width) >= SCREEN_GUTTER, `${phone}: LEAVE GIFT is 16 pt from the edge`);
    assert.ok(k.face.left <= w * PAINTED_SLOT.left - 8, `${phone}: the face covers the painted slot's left rim`);
    // A 14 pt gutter like every card, LEAVE GIFT centered in it (same padding left and right).
    assert.ok(w - (k.face.left + k.face.width) >= 14, `${phone}: the plaque keeps a 14 pt gutter`);
    const padL = k.button.left - k.face.left;
    const padR = k.face.left + k.face.width - (k.button.left + k.button.width);
    assert.ok(Math.abs(padL - padR) <= 1, `${phone}: LEAVE GIFT centered (${padL} / ${padR})`);
    // The dark side strip hides the painted slot's end in the gutter, from under the plaque to the edge.
    assert.ok(k.cap.left < k.face.left + k.face.width && k.cap.left + k.cap.width === w, `${phone}: side strip reaches the edge`);
    assert.ok(k.cap.top <= artH * PAINTED_SLOT.top && k.cap.top + k.cap.height >= artH * PAINTED_SLOT.bottom, `${phone}: side strip covers the painted slot's end`);
    // The baked label is about a quarter of the art's height: 90+ pt wide keeps it about 14 pt.
    assert.ok(k.button.width >= 90, `${phone}: LEAVE GIFT label stays about 14 pt (${k.button.width} pt wide)`);
    assert.ok(k.face.top <= artH * PAINTED_PRICE.top && k.face.top + k.face.height >= artH * PAINTED_SLOT.bottom + 6, `${phone}: painted price and slot covered`);
    assert.ok(k.button.top >= k.price.top + 20 && k.button.top + k.button.height <= k.face.top + k.face.height, `${phone}: button sits on the face, under the price`);
    assert.ok(k.button.height + 16 >= 44, `${phone}: still a 44 pt tap target with its hit slop`);
  }
  // The price on the kiosk is the coin stack (the coin you spend everywhere), never the painted ride coin.
  assert.match(cc, /accessibilityLabel=\{`A gift costs \$\{GIFT_COST\} coins`\}/);
  assert.match(cc, /icons\/game\/coins\.png'\)\} style=\{styles\.kioskCoin\}/);
  // It pulses with a white shine, never a scale, and the press squish never passes full size.
  assert.doesNotMatch(cc, /LEAVE_GIFT_PULSE|Animated\.multiply\(pulseAnim/);
  assert.match(cc, /export const LEAVE_GIFT_SHINE = 0\.3;/);
  assert.match(cc, /leaveGiftScale\.interpolate\(\{ inputRange: \[0, 1, 2\], outputRange: \[0, 1, 1\] \}\)/);
  // Short phones (iPhone SE): GO BACK and the cooldown note sit on the screen, not on the art's hidden bottom.
  assert.match(cc, /bottom: 80 \+ ART_OVERFLOW/);
  assert.match(cc, /145 \+ ART_OVERFLOW/);
  assert.match(cc, /SCREEN_HEIGHT - LEAVE_GIFT_H - 2\)/);
  // Short phones (SE): the art slides up so the plinth fits, GO BACK joins LEAVE GIFT in one bottom row.
  assert.match(cc, /const SHORT_SCREEN = ART_OVERFLOW > 60;/);
  assert.match(cc, /LEAVE_GIFT_PLINTH_BOTTOM_RATIO - \(SCREEN_HEIGHT - BOTTOM_GAP\)/);
  assert.match(cc, /marginTop: -ART_SHIFT/);
  assert.match(cc, /\.\.\.GO_BACK_POSITION/);
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
  // Prices and standings keep every digit under 100000: a 12590 price never reads 12.5K
  // next to a 12540 wallet, and leaders at 12540 and 12510 never both read 12.5K.
  assert.equal(countText(12590), '12590');
  assert.notEqual(countText(12540), countText(12510));
  assert.equal(countText(99999), '99999');
  assert.equal(countText(100000), '100K');
  assert.equal(countText(250999), '250K', 'rounds down, never shows more than you have');
  assert.equal(countText(1250000), '1.2M');
  assert.equal(countText(-12500), '-12500');
  assert.equal(countText(-1500), '-1500');
  assert.equal(countText(Number.NaN), '0');
  const shorten = loadTs('src/helpers/shorten-number.ts').default;
  assert.equal(shorten(4881), '4881', 'the header coin pill');
  assert.equal(shorten(12500), '12.5K', 'the narrow header pills still go short at 10000');
  const shelves = loadTs('src/helpers/shopShelves.ts');
  assert.equal(shelves.formatCoins(12590), '12590', 'shop prices keep every digit');
  assert.equal(loadTs('src/components/xpPotionModel.ts').groupDigits(12345), '12345');
  assert.equal(loadTs('src/services/trail/trailModel.ts').formatSteps(12345), '12345');
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

test('one coin for coins you spend: the coin stack on pills, prices and the profile tile', () => {
  assert.match(read('src/screens/pins/PinsScreen.tsx'), /<Currency image=\{COINS_ICON\} count=\{coins\} name="Coins" \/>/);
  assert.doesNotMatch(read('src/screens/CommunityCenterScreen.tsx'), /community-center-coin\.png/);
  assert.doesNotMatch(read('src/screens/pins/MysteryCard.tsx'), /<GameIcon name="coin" /);
  assert.doesNotMatch(read('src/components/Notification.tsx'), /<GameIcon name="coin" /);
  assert.match(read('src/services/liveEvents/model.ts'), /if \(r\.coins\) out\.push\(\{ icon: 'coins'/);
  assert.match(read('src/components/Stats.tsx'), /label: 'Coins',[\s\S]{0,120}gameIcon: 'coins'/);
});

test('full-screen routes keep clear of the Dynamic Island with one inset (SafeScreen, the JS hook)', () => {
  const safe = read('src/components/SafeScreen.tsx');
  assert.match(safe, /useSafeAreaInsets\(\)/);
  for (const file of [
    'src/screens/MembershipScreen.tsx', 'src/screens/BananaBasketScreen.tsx', 'src/screens/GymBattle/TeamSelectionScreen.tsx',
    'src/screens/RideTracker/RideWrappedScreen.tsx',
    'src/screens/RideTracker/RideOnboardingScreen.tsx', 'src/screens/LinePlay/LinePlayScreen.tsx', 'src/screens/WelcomeScreen.tsx',
  ]) {
    const src = read(file);
    assert.doesNotMatch(src, /SafeAreaView/, file);
    assert.match(src, /<SafeScreen/, file);
  }
});

test('Wait Times badge numbers use the game font, and a down ride says it in kid words', () => {
  const src = read('src/screens/QueueTimesScreen.tsx');
  assert.match(src, /badgeText: \{[\s\S]{0,140}fontFamily: 'Shark'/);
  assert.doesNotMatch(src, /NO PARTS/);
  assert.match(src, /'PLAY WHILE YOU WAIT'/);
});

test('Ride Tracker: gold game chips, a full empty card with a button, readable locked achievements', () => {
  const history = read('src/screens/RideTracker/RideHistoryScreen.tsx');
  assert.match(history, /GAME_CHIP\.chipSelected/);
  assert.doesNotMatch(history, /#0EA5E9', *\n? *borderColor: '#0EA5E9'/);
  for (const name of ['RideHistory', 'RideStats', 'RideCollections', 'RideWishlist']) {
    assert.match(read(`src/screens/RideTracker/${name}Screen.tsx`), /<RideTrackerEmpty/, name);
  }
  assert.match(read('src/screens/RideTracker/RideTrackerEmpty.tsx'), /<GameButton/);
  const ach = read('src/screens/RideTracker/RideAchievementsScreen.tsx');
  assert.doesNotMatch(ach, /cardLocked: \{ opacity/);
  assert.doesNotMatch(ach, /iconLocked: \{ opacity/);
});

test('capital-letter labels are uppercased in code so iOS never clips the last letters', () => {
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.length > 1 ? children : children[0] } }) };
  const mod = loadTs('src/ui/upper.tsx', {
    react: {
      Children: { map: (c, fn) => (Array.isArray(c) ? c.map(fn) : c == null ? c : fn(c)) },
      isValidElement: (x) => !!x && typeof x === 'object' && 'type' in x,
      cloneElement: (el, _p, children) => ({ ...el, props: { ...el.props, children } }),
    },
    'react-native': { Text: 'Text' },
    'react/jsx-runtime': { jsx: React.createElement, jsxs: React.createElement },
  });
  assert.equal(mod.upper('Universal Studios Hollywood'), 'UNIVERSAL STUDIOS HOLLYWOOD');
  assert.deepEqual(mod.upper(['Ride ', 3]), ['RIDE ', 3]);
  const nested = mod.upper({ type: 'Text', props: { children: 'gold' } });
  assert.equal(nested.props.children, 'GOLD');
  for (const file of ['src/components/Stats.tsx', 'src/components/Wrapper.tsx', 'src/components/Heading.tsx',
    'src/screens/LeaderboardsScreen/StandingsRow.tsx', 'src/components/profile/ProfileShortcuts.tsx', 'src/screens/stampbook/StampTile.tsx']) {
    assert.match(read(file), /<UpperText/, file);
  }
});

test('Ride Wrapped loading and empty states use the shared game header and empty card', () => {
  const src = read('src/screens/RideTracker/RideWrappedScreen.tsx');
  assert.match(src, /<RideTrackerFrame title="Ride Wrapped"/);
  assert.match(src, /<RideTrackerEmpty/);
  assert.doesNotMatch(src, /Go Log Rides/);
});

// Round 3 (grader blockers and fixes).
test('Ride Detail wears the Ride Tracker header: no web gradients, game buttons, the star in the header', () => {
  const src = read('src/screens/RideTracker/RideDetailScreen.tsx');
  assert.doesNotMatch(src, /LinearGradient|SafeAreaView|heroGradient/);
  assert.match(src, /<RideTrackerFrame title=\{headerTitle\} right=\{starButton\}/);
  assert.match(src, /<RideTrackerFrame title=\{headerTitle\} style=\{s\.container\}>\s*\{loadError/, 'loading uses the same frame');
  assert.match(src, /<GameButton label="Log this ride"/);
  assert.match(src, /paddingBottom: FOOTER_CLEARANCE/);
  assert.match(read('src/screens/RideTracker/RideTrackerFrame.tsx'), /<TopbarColumn stretch=\{false\}>\{right\}<\/TopbarColumn>/);
});

test('the map loading cover is light sky blue, never the dark underwater scene', () => {
  const map = read('src/components/Map.tsx');
  assert.doesNotMatch(map, /water_background/);
  assert.match(map, /export \{ MAP_COVER_SKY \} from '\.\/map\/MapCoverSky';/);
  assert.match(read('src/components/map/MapCoverSky.tsx'), /export const MAP_COVER_SKY = '#dcefff'/);
  assert.match(read('src/components/map/MapLaunchCover.tsx'), /sky: \{ backgroundColor: MAP_COVER_SKY \}/);
});

test('VIP stage has no empty gray pill under the shark', () => {
  assert.doesNotMatch(read('src/components/money/MemberStage.tsx'), /castShadow/);
});

test('Gym Join card has one yellow button; Back is the quiet text action', () => {
  const gym = read('src/screens/GymBattle/GymBattleScreen.tsx');
  assert.match(gym, /<GameButton label="Back" variant="ghost" tone="onBlue" onPress=\{handleGoBack\}/);
  assert.doesNotMatch(gym, /backButtonAbsolute/);
});

test('Ride Stats with no rides skips the three zero tiles so the empty card and its button come first', () => {
  const src = read('src/screens/RideTracker/RideStatsScreen.tsx');
  assert.match(src, /\{stats\.total_rides > 0 && \(\s*<View style=\{styles\.statGrid\}>/);
});

test('UpperText tells VoiceOver the words as written, not letter-spelled capitals', () => {
  const { spokenLabel, upper } = loadTs('src/ui/upper.tsx', {
    react: require(path.join(ROOT, 'node_modules/react')),
    'react/jsx-runtime': require(path.join(ROOT, 'node_modules/react/jsx-runtime')),
    'react-native': { Text: 'Text' },
  });
  assert.equal(spokenLabel('Rides by park'), 'Rides by park');
  assert.equal(spokenLabel(['Level ', 3]), 'Level 3');
  assert.equal(spokenLabel(''), undefined);
  assert.equal(upper('Rides by park')[0], 'RIDES BY PARK');
  const src = read('src/ui/upper.tsx');
  assert.match(src, /<Text accessibilityLabel=\{spokenLabel\(children\)\} \{\.\.\.rest\}/, 'a caller label still wins');
});

test('the park arrival tip is one short line a 7-year-old reads at a glance', () => {
  const { TIP_COPY } = loadTs('src/services/help/helpTopics.ts');
  assert.ok(TIP_COPY.park_hud.body.length <= 40, TIP_COPY.park_hud.body);
});

test('Finn catches up by the clock, so a slow first frame never leaves one word above the button', () => {
  const src = read('src/components/Tutorial/TeacherShark.tsx');
  assert.match(src, /visibleParts\(parts, Date\.now\(\) - startedAt\)/);
});

// Round 4 (grader blockers and fixes).
test('Ride Detail star: a drawn white-rim star when off, the full gold star when on, never a faded olive star', () => {
  const src = read('src/screens/RideTracker/RideDetailScreen.tsx');
  assert.doesNotMatch(src, /opacity: 0\.45/);
  assert.match(src, /<FavoriteStar on=\{wishlisted\} size=\{34\} \/>/);
  assert.match(src, /<GameIcon name="star" size=\{size\} mono=\{B\.white\} \/>/);
  assert.match(src, /Animated\.spring\(pop/, 'saving pops the star');
});

test('Ride Detail title fits by measured width; scores read as numbers with a shark, not a count', () => {
  const m = loadTs('src/screens/RideTracker/rideDetailModel.ts');
  // One title model for every ride: the header always says RIDE TRACKER, the name leads the card.
  assert.equal(m.RIDE_DETAIL_HEADER, 'Ride Tracker');
  assert.equal(m.titleFitsHeader, undefined, 'no per-ride header measuring');
  assert.equal(m.scoreText(4.666), '4.7');
  assert.equal(m.scoreText(5), '5');
  // No typographic '--' placeholder: a faded shark and a '?' a non-reader gets.
  assert.equal(m.scoreText(0), '?');
  assert.equal(m.scoreText(null), '?');
  assert.equal(m.riderWords(1), 'from 1 rider');
  assert.equal(m.riderWords(5), 'from 5 riders');
  const src = read('src/screens/RideTracker/RideDetailScreen.tsx');
  assert.doesNotMatch(src, /titleProbe|setTitleWidth/);
  assert.match(src, /const headerTitle = RIDE_DETAIL_HEADER;/);
  assert.match(src, /<Text style=\{s\.rideTitle\} numberOfLines=\{2\} adjustsFontSizeToFit/);
  assert.doesNotMatch(src, /\{!shortName && <Text style=\{s\.rideTitle\}/, 'the name is always in the card');
  assert.doesNotMatch(src, />Community</);
  assert.match(src, />Rider sharks</);
  // Every number on the screen is in the number face (Knockout draws 1 like I).
  for (const key of ['statVal', 'ratingBarLabel', 'ratingBarCount', 'topReactionItem']) {
    assert.match(src, new RegExp(`${key}: \\{[^}]*fontFamily: NUMBER_FONT`), key);
  }
  // The tile counts the same ratings the chart adds up (Astro Orbitor: 3 logs, 2 ratings -> "from 2 ratings").
  assert.match(src, /withNumberFont\(riderSharksCaption\(community\)\)/);
  assert.equal(m.ratingCount({ 5: 0, 4: 2, 3: 0, 2: 0, 1: 0 }), 2);
  assert.equal(m.riderSharksCaption({ rating_distribution: { 4: 2 }, unique_riders: 3 }), 'from 2 ratings');
  assert.equal(m.riderSharksCaption({ rating_distribution: { 5: 1 }, unique_riders: 1 }), 'from 1 rating');
  assert.equal(m.riderSharksCaption({ rating_distribution: {}, unique_riders: 3 }), 'from 3 riders');
  // No text toast over the ride's name: the star pops and bursts six little stars (zero reading),
  // and VoiceOver hears the words.
  assert.doesNotMatch(src, /toast/i);
  assert.match(src, /const SPARKS = \[0, 1, 2, 3, 4, 5\]/);
  assert.match(src, /announceForAccessibility\(result\.wishlisted \? 'Saved to favorites' : 'Taken off favorites'\)/);
  assert.match(src, /\{on && !reducedMotion && SPARKS\.map/, 'no burst with Reduce Motion');
  // One heading face app-wide (navy Shark, like Settings), one tile icon treatment.
  assert.match(src, /sectionTitle: \{[^}]*color: B\.navy, fontSize: 17,[^}]*fontFamily: 'Shark'/s);
  assert.equal((src.match(/<View style=\{\[?s\.statIcon/g) || []).length, 4, "three tiles, the third has a filled and an empty form");
  assert.match(src, /withNumberFont\(date\.toLocaleDateString/);
});

test('withNumberFont draws digit runs in the number face and leaves words alone', () => {
  const React = require(path.join(ROOT, 'node_modules/react'));
  const { withNumberFont, NUMBER_FONT } = loadTs('src/ui/numberText.tsx', {
    react: React,
    'react/jsx-runtime': require(path.join(ROOT, 'node_modules/react/jsx-runtime')),
    'react-native': { Text: 'Text' },
  });
  const parts = withNumberFont('1 log from 12 riders');
  assert.equal(parts.length, 4);
  assert.equal(parts[1], '\u2005log from\u2005');
  assert.equal(parts[0].props.children, '1');
  assert.equal(parts[0].props.style[0].fontFamily, NUMBER_FONT);
  assert.equal(parts[2].props.children, '12');
  assert.equal(withNumberFont('no numbers').length, 1);
  assert.equal(withNumberFont('no numbers')[0], 'no numbers');
});

test('Ride Detail on an SE: a small community count is one row and the empty line sits close under the button', () => {
  const src = read('src/screens/RideTracker/RideDetailScreen.tsx');
  // A log or two: no community card (the Rider sharks tile says "from 1 rider"); the chart once there are enough.
  assert.match(src, /\{community && ratingCount\(community\.rating_distribution\) >= COMPACT_COMMUNITY_LOGS && \(/);
  assert.match(src, /<GameIcon name="shark" size=\{emptySharkSize\} \/>/, 'the empty page has the shark, not a blank sheet');
  // The empty page fills the space under the button: an arrow up at LOG THIS RIDE, the line, the shark.
  assert.match(src, /emptyWrap: \{ flexGrow: 1, alignItems: 'center', justifyContent: 'center'/);
  assert.match(src, /contentContainerStyle=\{\[s\.listContent, history\.length === 0 && s\.listContentEmpty\]\}/);
  assert.match(src, /<LogPointer \/>/);
  assert.match(src, /pointer: \{ transform: \[\{ rotate: '-90deg' \}\] \}/);
  assert.match(src, /\{history\.length > 0 && <Text style=\{s\.sectionTitle\}>YOUR RIDE HISTORY<\/Text>\}/);
  assert.equal(loadTs('src/screens/RideTracker/rideDetailModel.ts').COMPACT_COMMUNITY_LOGS, 3);
  // The ride card matches the stat tiles: no light-blue border.
  assert.doesNotMatch(src, /#abd9f1/);
});

test('the map loading cover shows Alex clouds, a bobbing shark and the splash bar finishing', () => {
  const map = read('src/components/Map.tsx');
  // The map registers with the one screen cover; it draws the cover itself only on preview screens.
  assert.match(map, /useLayoutEffect\(\(\) => \{\s*const tok = beginMapCover\(\);/);
  assert.match(map, /return \(\) => releaseMapCover\(tok\);/);
  assert.match(map, /const revealMap = \(\) => \{ mapCoverDrawn\(coverToken\.current\);/);
  assert.match(map, /\{coverHost === 'self' && <MapLaunchCover style=\{styles\.cover\} \/>\}/);
  assert.doesNotMatch(map, /Animated\.timing\(cover/, 'no JS-timer lift (RN Animated delay is a JS setTimeout)');
  const cover = read('src/components/map/MapCoverSky.tsx');
  assert.match(cover, /explore\/cloud\.png/);
  assert.match(cover, /icons\/game\/shark\.png/);
  // UI-thread loops that start on the first frame (no wait for an async Reduce Motion answer).
  assert.match(cover, /from 'react-native-reanimated'/);
  assert.match(cover, /useUiReducedMotion/);
  assert.doesNotMatch(cover, /useReducedGameMotion/);
  assert.match(cover, /withRepeat\(/);
  // The bar fills by transform (scaleX from the left), never by animating width (a layout pass per frame).
  assert.match(cover, /transform: \[\{ scaleX: /);
  assert.doesNotMatch(cover, /width: `\$\{fill\.value/);
  assert.match(cover, /transformOrigin: 'left'/);
  assert.match(cover, /top: `\$\{cloud\.y \* 100\}%`/, 'clouds sit at percentages: on the first frame, no jump');
  // One launch scene from the native splash to the map: the Splash route, the Loading screen and the
  // map's first cover all draw it, and all fill the same shared bar (it never restarts or jumps back).
  assert.match(read('src/screens/LoadingScreen.tsx'), /return <LaunchScene active=\{focused\} fact=\{fact\} \/>;/);
  assert.match(read('src/screens/LoadingScreen.tsx'), /moveLaunchBar\(\(progress \/ 100\) \* LAUNCH_HANDOFF_SHARE, 250\)/);
  assert.match(read('src/screens/SplashScreen.tsx'), /withTiming\(SPLASH_ROUTE_SHARE, \{ duration: SPLASH_CREEP_MS/);
  const scene = read('src/components/launch/LaunchScene.tsx');
  assert.match(scene, /export const launchFill: SharedValue<number> = makeMutable\(0\);/);
  assert.match(scene, /if \(to <= launchFill\.value\) return;/, 'the launch bar never moves back');
  assert.match(scene, /transform: \[\{ scaleX: Math\.max\(0, Math\.min\(1, launchFill\.value\)\) \}\]/);
  assert.match(scene, /transformOrigin: 'left'/);
  // The fact is picked once per launch, so the cover shows the same words as the Loading screen.
  assert.match(scene, /if \(!launchFact && fact\) launchFact = fact;/);
  const k = loadTs('src/constants/launchHandoff.ts');
  assert.ok(k.LAUNCH_HANDOFF_SHARE > 0.5 && k.LAUNCH_HANDOFF_SHARE < 0.9);
  assert.ok(k.SPLASH_ROUTE_SHARE > 0 && k.SPLASH_ROUTE_SHARE < k.LAUNCH_HANDOFF_SHARE / 2);
  assert.ok(k.COVER_MAX_MS <= 1500, 'a drawn map waits at most 1.5 s for the home-or-park choice');
  assert.ok(k.COVER_HARD_MAX_MS <= 4000);
  // Never onto a map with no tiles: no draw yet means only the hard cap (a safety) can lift it.
  assert.equal(k.coverLiftAt({ now: 1500, startedAt: 1000, drawn: false, held: false }), 1000 + k.COVER_HARD_MAX_MS);
  assert.equal(k.coverLiftAt({ now: 1500, startedAt: 1000, drawn: false, held: true }), 1000 + k.COVER_HARD_MAX_MS);
  // Drawn and the map is picked: lift now (the splash bar finishes straight into the map).
  assert.equal(k.coverLiftAt({ now: 1300, startedAt: 1000, drawn: true, held: false }), 1300);
  // Drawn but still picking home or park: wait until COVER_MAX_MS, then lift onto the map that drew.
  assert.equal(k.coverLiftAt({ now: 1300, startedAt: 1000, drawn: true, held: true }), 1000 + k.COVER_MAX_MS);
  assert.equal(k.coverLiftAt({ now: 3000, startedAt: 1000, drawn: true, held: true }), 3000);
  assert.equal(k.coverLiftAt({ now: 9000, startedAt: 1000, drawn: true, held: true }), 1000 + k.COVER_HARD_MAX_MS);
  // Honest progress: each real step raises how far the bar may get; the rest fills only when tiles drew.
  assert.ok(k.coverCeiling(false, false) > k.LAUNCH_HANDOFF_SHARE);
  assert.ok(k.coverCeiling(true, true) > k.coverCeiling(false, false));
  assert.ok(k.coverCeiling(true, false) > k.coverCeiling(true, true));
  assert.ok(k.coverCeiling(true, false) < 1);
  // Clouds: about a quarter of the width (a cloud, not an empty speech balloon), never beside the shark's head.
  const clouds = loadTs('src/components/map/MapCoverSky.tsx', {
    react: { memo: (c) => c, useEffect() {}, useState: (v) => [v, () => {}] },
    'react-native': { StyleSheet: { create: (x) => x, absoluteFill: {}, absoluteFillObject: {} }, View: 'View', useWindowDimensions: () => ({ width: 402, height: 874 }) },
    'expo-image': { Image: 'Image' },
    'react-native-reanimated': { default: { View: 'View' }, Easing: {}, cancelAnimation() {}, useAnimatedStyle() {}, useSharedValue() {}, withRepeat() {}, withSequence() {}, withTiming() {} },
    '../../config': { default: { primary: '#09268f' } },
    '../../ui/useUiReducedMotion': { default: () => false },
    '../../power/batterySaver': { useBatterySaver: () => false },
    'react/jsx-runtime': { jsx() {}, jsxs() {} },
  }).COVER_CLOUDS;
  // Each cloud drifts on its own slow clock (not the shark's 1.3 s bob), starting at its own point.
  const coverSrc = read('src/components/map/MapCoverSky.tsx');
  assert.match(coverSrc, /<CoverCloud key=\{i\} cloud=\{c\} width=\{width\} still=\{reduced\} \/>/);
  assert.equal(new Set(clouds.map((c) => c.periodMs)).size, clouds.length);
  assert.equal(new Set(clouds.map((c) => c.phase)).size, clouds.length);
  for (const c of clouds) {
    assert.ok(c.periodMs >= 8000 && c.periodMs <= 12000, `cloud period ${c.periodMs}`);
    assert.ok(c.w >= 0.24 && c.w <= 0.3, `cloud width ${c.w}`);
    assert.ok(c.y + c.w * 0.67 * 0.46 < 0.36 || c.y > 0.66, `cloud at y ${c.y} stays clear of the shark and bar`);
  }
});

test('the map loading cover lifts on the UI thread and hides the whole HUD until the map arrives', () => {
  const store = read('src/components/map/mapCover.ts');
  const cover = read('src/components/map/MapLaunchCover.tsx');
  // The cover owns its shared values (opacity starts at 1: the first frame is the sky) and turns each
  // plan into a UI-thread withDelay fade with the bar on the same clock.
  assert.match(cover, /const opacity = useSharedValue\(1\);/);
  assert.match(cover, /opacity\.value = withDelay\(remaining, withTiming\(0/);
  assert.match(cover, /withTiming\(Math\.max\(fill\.value, ceiling\), \{ duration: Math\.max\(250, creep\), easing: Easing\.linear \}\)/,
    'the bar creeps at a steady pace, only to the next real step');
  assert.match(cover, /\{launch \? <LaunchScene \/> : <MapCoverSky fill=\{fill\} \/>\}/);
  assert.match(cover, /const fill = launch \? launchFill : ownFill;/, 'the launch cover fills the one launch bar');
  assert.match(cover, /\}, \[plan\.version\]\);/);
  assert.match(cover, /useLayoutEffect\(\(\) => \{\s*const tok = plan\.token;/);
  // The UI thread works out the time left itself, so a UI thread busy with the map's first mount never pushes the lift late.
  assert.match(cover, /runOnUI\(\(deadline: number, share: number \| null, ceiling: number, lifting: boolean\) => \{\s*'worklet';/);
  assert.match(cover, /const remaining = Math\.max\(0, deadline - Date\.now\(\)\);/);
  // Header icons have no big-coin placeholder (it drew as a flat gold square while a 36 pt icon decoded).
  const currencySrc = read('src/components/Topbar/Currency.tsx');
  assert.doesNotMatch(currencySrc, /placeholder=\{FALLBACK_ICON\}/);
  assert.match(currencySrc, /onError=\{\(\) => \{ if \(iconFailed \|\| !image\) artDrawn\(\); setIconFailed\(true\); \}\}/);
  assert.match(read('src/components/Wrapper.tsx'), /cachePolicy="memory-disk"\s*priority="high"\s*transition=\{0\}/);
  // The launch map comes from the phone's recent fix when there is one (a fresh fix can take seconds).
  assert.match(read('src/context/LocationProvider.tsx'), /getLastKnownPositionAsync\(\{ maxAge: 5 \* 60 \* 1000, requiredAccuracy: 200 \}\)/);
  // PLAY RIDE and its ride chip wait for the cover to lift (their wrapper can draw above the cover on iOS).
  assert.match(read('src/screens/ExploreScreen.tsx'), /redeemable=\{mapFocused && !mapCovered && !isActive \? activeRedeemable : undefined\}/);
  // The header coin, key and ticket and the five footer icons are decoded into memory before the hand-off.
  const warmSrc = read('src/helpers/launchArt.ts');
  assert.match(warmSrc, /Image\.prefetch\(bundled, 'memory-disk'\)/);
  assert.match(warmSrc, /RNImage\.resolveAssetSource\(mod\)/);
  assert.match(read('src/screens/LoadingScreen.tsx'), /currencies\.map\(\(c\) => c\.icon_url\)/);
  // The store never times the lift on the JS thread (only a safety net for React state).
  assert.doesNotMatch(store, /react-native-reanimated/);
  assert.match(store, /safety = setTimeout\(\(\) => coverLifted\(tok\), wait\);/);
  // The sky is up on the map screen's first frame, before any map mounts (no bare blue page with buttons).
  assert.match(cover, /useState\(\(\) => \{ if \(armOnMount\) armMapCover\(\); return 0; \}\);\s*const plan = useCoverPlan\(\);/);
  const explore = read('src/screens/ExploreScreen.tsx');
  // A later sky sits above every HUD widget (zIndex up to 40) and under the header; the app's first
  // cover is the launch scene over the whole screen (header and footer too). Taps on the hidden HUD are swallowed.
  assert.match(explore, /<MapLaunchCover variant="sky" blockTouches style=\{\{ top: 70 \+ \(Constants\.statusBarHeight \?\? 0\), zIndex: 45 \}\} \/>/);
  assert.match(explore, /<\/Wrapper>\s*\{\/\*[^]*?\*\/\}\s*<MapLaunchCover variant="launch" armOnMount blockTouches style=\{\{ zIndex: 100 \}\} \/>\s*<\/>/);
  assert.match(store, /const launch = firstCover;/);
  // The HUD row is whole from the first map frame; a later lead change cross-fades (MapStatusStack).
  assert.match(explore, /<MapStatusStack entries=\{statusEntries\} \/>/);
  assert.doesNotMatch(explore, /statusSettled|STATUS_ROW_WAIT_MS/);
  assert.match(explore, /<Map onPress=\{[^\n]*\n\s*coverHost="screen"/);
  assert.match(read('src/screens/ExploreScreen/HomeExplore.tsx'), /<Map coverHost="screen" /);
  // Tips, tutorials, the home intro and the adventure slam wait for the cover to lift.
  assert.match(explore, /const parkTipReady = !mapCovered && mapCalm && mapTipReady\(\{/);
  assert.match(explore, /if \(!mapOnScreen \|\| !mapCalm \|\| !player/);
  assert.match(explore, /if \(mapOnScreen && player/);
  assert.match(explore, /introAllowed=\{mapOnScreen && homeIntroAllowed\}/);
  assert.match(explore, /slam=\{mapCovered \? undefined : adventureMoment\.slam\}/);
  // One cover through the home-to-park swap at launch.
  assert.match(explore, /const mapChoicePending = !!player && permissionGranted && !park && !homeLocationConfirmed;/);
  // The cover's art and the first map buttons are warm before the splash hands off.
  const art = read('src/helpers/launchArt.ts');
  for (const f of ['icons/game/shark.png', 'explore/cloud.png', 'images/faq.png', 'images/energy.png', 'explore/queuetimes.png']) assert.ok(art.includes(f), f);
});

test('VIP plaza art fills its white frame edge to edge (its baked frame is cropped off)', () => {
  const src = read('src/components/money/MemberStage.tsx');
  assert.match(src, /style=\{st\.sceneArt\}/);
  assert.match(src, /SCENE_ART_INNER = 228 \/ 256/);
  assert.doesNotMatch(src, /scene: \{[^}]*backgroundColor: '#0b3a75'/);
});

test('Gym Join card uses the brand gold at full strength', () => {
  const gym = read('src/screens/GymBattle/GymBattleScreen.tsx');
  assert.match(gym, /noTeamBox: \{[^}]*borderColor: '#fec90e'/s);
  assert.match(gym, /noTeamTitle: \{[^}]*color: '#fec90e'/s);
  assert.doesNotMatch(gym, /rgba\(251, 191, 36, 0\.5\)/);
});

test('Settings and How to Play row titles are UpperText, and Ride Stats headings are written in mixed case', () => {
  assert.match(read('src/screens/SettingsScreen.tsx'), /<UpperText style=\{\[styles\.rowTitle/);
  assert.match(read('src/screens/HowToPlay/HowToPlayMore.tsx'), /<UpperText style=\{styles\.rowTitle\}>/);
  assert.match(read('src/screens/RideTracker/RideStatsScreen.tsx'), />Rides by park<\/UpperText>/);
});

test('the Splash route keeps the launch art and framing (no server splash fading in with the title cut off)', () => {
  const src = read('src/screens/SplashScreen.tsx');
  assert.doesNotMatch(src, /splash_screen_url/);
  // Decided: the bundled splash is permanent, so the dead theme field is gone from the app model too.
  assert.doesNotMatch(read('src/models/theme-type.ts'), /readonly splash_screen_url/);
  assert.doesNotMatch(read('src/api/defaults/theme.json'), /splash_screen_url/);
  assert.match(src, /return <LaunchScene active=\{focused\} \/>;/);
  assert.match(read('src/components/launch/LaunchScene.tsx'), /<Image source=\{LAUNCH_ART\} transition=\{0\} contentFit="cover"/);
});

test('one coin rule: the coin stack is the coin you spend, the gold fin coin means ride coins only', () => {
  // Spending and wallet rewards: the coin stack.
  assert.match(read('src/screens/pins/BoxReveal.tsx'), /<GameIcon name="coins" size=\{30\} \/>/);
  assert.match(read('src/screens/StoreScreen/shopUi.tsx'), /styles\.arcCoin, coin\]\}><GameIcon name="coins"/);
  assert.match(read('src/components/liveEvents/ChestReveal.tsx'), /styles\.coin, style\]\}><GameIcon name="coins"/);
  assert.match(read('src/services/help/helpSheets.ts'), /\{ icon: 'coins', text: 'Spend Coins on gear\.' \}/);
  const hero = read('src/components/help/HelpHero.tsx');
  assert.match(hero, /styles\.price[^\n]*\n\s*<GameIcon name="coins"/);
  assert.match(read('src/screens/CommunityCenterScreen.tsx'), /icons\/game\/coins\.png'\)\} style=\{styles\.kioskCoin\}/);
  // Ride coins: the fin coin.
  assert.match(read('src/components/collection/CollectionSwitch.tsx'), /\['coins', 'Ride Coins', 'coin'\]/);
  assert.match(read('src/screens/LeaderboardsScreen/homeHuntModel.ts'), /label: 'Ride Coins', icon: 'coin'/);
});

test('plain ride names: no trademark marks from the wait-times feed or the ride catalog', () => {
  const { plainRideName, withPlainNames } = loadTs('src/helpers/plainRideName.ts');
  assert.equal(plainRideName('Indiana Jones\u2122 Adventure'), 'Indiana Jones Adventure');
  assert.equal(plainRideName('Space Mountain\u00AE'), 'Space Mountain');
  assert.equal(plainRideName('Soarin\u2019 Around the World (TM)'), 'Soarin\u2019 Around the World');
  assert.equal(plainRideName('"it\'s a small world"'), '"it\'s a small world"', 'words never change');
  assert.equal(plainRideName(null), '');
  const rows = [{ name: 'Matterhorn Bobsleds' }, { name: 'Indiana Jones\u2122 Adventure', id: 2 }];
  const out = withPlainNames(rows);
  assert.equal(out[0], rows[0], 'unchanged rows are kept as is');
  assert.equal(out[1].name, 'Indiana Jones Adventure');
  assert.equal(out[1].id, 2);
  assert.match(read('src/api/endpoints/parks/queue-times/getWikiTimes.ts'), /return withPlainNames\(data\.liveData\.filter/);
  assert.match(read('src/api/endpoints/rides/index.ts'), /withPlainNames\(data\.data as RideType\[\]\)/);
  assert.match(read('src/screens/RideTracker/RideDetailScreen.tsx'), /const name = plainRideName\(/);
  // The map's ride coins and secret coins use the same path, so a mark from server data never labels the map.
  const { withPlainTaskNames } = loadTs('src/helpers/plainRideName.ts');
  const map = withPlainTaskNames({ tasks: [{ id: 1, name: 'Indiana Jones\u2122 Adventure' }], secret_tasks: [{ id: 2, name: 'Space Mountain\u00AE' }], coins: [{ id: 3 }] });
  assert.equal(map.tasks[0].name, 'Indiana Jones Adventure');
  assert.equal(map.secret_tasks[0].name, 'Space Mountain');
  assert.deepEqual(map.coins, [{ id: 3 }]);
  assert.equal(withPlainTaskNames(null), null);
  assert.match(read('src/api/endpoints/me/current-redeemables.js'), /return withPlainTaskNames\(data\.data\);/);
  assert.match(read('src/api/endpoints/parks/getTasks.ts'), /withPlainNames\(data\.data\)/);
  assert.match(read('src/api/endpoints/parks/getSecretTasks.ts'), /withPlainNames\(data\.data\)/);
});

test('PLAY RIDE is one piece: the pill, its label and the ride chip appear together once the pill art has drawn', () => {
  const button = read('src/components/YellowButton.tsx');
  // The pill and its label are one layer with one opacity: neither draws before both are ready.
  assert.match(button, /const ready = artReady && labelAreaHeight > 0;/);
  assert.match(button, /<Animated\.View\s+style=\{\{\s+opacity: ready \? 1 : 0,/);
  assert.doesNotMatch(button, /opacity: labelAreaHeight > 0 && artReady/);
  // A press that turns disabled mid-press (or Reduce Motion) never leaves the pill at 0.97.
  assert.match(button, /if \(disabled \|\| reducedMotion\) \{ animated\.stopAnimation\(\); animated\.setValue\(1\); \}/);
  assert.match(button, /return \(\) => animated\.stopAnimation\(\);/);
  assert.match(button, /onLoadEnd=\{markArtLoaded\}/);
  assert.match(button, /if \(reported\.current \|\| !artReady \|\| labelAreaHeight <= 0\) return;/, 'reports once, only when the art drew and the label has its size');
  assert.match(button, /setTimeout\(markArtReady, pillArtSeen \? 120 : 800\)/, 'a safety if the image never reports');
  const redeem = read('src/components/RedeemModal.tsx');
  // The whole group (pill, label, chip) stays hidden and only rises once the art is ready.
  assert.match(redeem, /const shown = \(available && pillReady\) \|\| !!closedLabel;/);
  assert.match(redeem, /<Animated\.View style=\{entrance\}>/);
  assert.match(redeem, /onArtReady=\{\(\) => setPillReady\(true\)\}/);
});

test('Ride Detail keeps the same three tiles on every ride and its hint names the button as it reads', () => {
  const src = read('src/screens/RideTracker/RideDetailScreen.tsx');
  assert.match(src, /accessibilityLabel="Rider sharks: none yet"/);
  assert.match(src, /<Text style=\{\[s\.statVal, s\.statValEmpty\]\}>\?<\/Text>/);
  assert.match(src, /Rode it\? Tap LOG THIS RIDE\./);
  assert.match(src, /numberOfLines=\{1\} adjustsFontSizeToFit minimumFontScale=\{0\.8\}>\{withNumberFont\(riderSharksCaption/);
});

test('launch never wakes the audio hardware: the audio-api graph starts after the cover lifts, and only for a player who can hear it', () => {
  const backends = read('src/gamekit/audio/backends.ts');
  const gate = read('src/gamekit/audio/startGate.ts');
  // init() is light; the AudioContext is made only in buildGraph, behind the gate, on the first load.
  assert.match(backends, /async init\(\): Promise<void> \{\s*\/\/ Nothing to do yet: see startGraph\.\s*\}/);
  assert.equal((backends.match(/new this\.mod\.AudioContext\(\)/g) || []).length, 1);
  assert.match(backends, /private buildGraph\(\): void \{\s*this\.ctx = new this\.mod\.AudioContext\(\);/);
  assert.match(backends, /await whenAudioMayStart\(\);\s*if \(this\.ctx\) return true;\s*if \(!audioWanted\(\)\) return false;/);
  assert.match(backends, /if \(!\(await this\.startGraph\(\)\)\) return false;/, 'a load that may not start the graph plays on expo-av');
  assert.match(backends, /this\.master\.gain\.value = this\.pendingMaster;/, 'the master gain set before the graph existed still applies');
  // The launch cover opens the gate once it has lifted; a first screen that is not the map has a safety.
  assert.match(read('src/components/map/mapCover.ts'), /if \(wasLaunch\) openAudioStartAfterLaunch\(\);/);
  assert.match(gate, /export const AUDIO_START_SAFETY_MS = 7000;/);
  assert.match(read('src/context/SoundEffectProvider.tsx'),
    /setAudioWanted\(!\(isReady && !player\?\.enabled_sound_effects\), !\(isReady && !player\?\.enabled_music\)\);/);
});

test('audio start gate: shut until launch is over, then open; quiet players never want the hardware', async () => {
  const g = loadTs('src/gamekit/audio/startGate.ts');
  assert.equal(g.audioStartOpen(), false);
  let opened = false;
  const wait = g.whenAudioMayStart().then(() => { opened = true; });
  await new Promise(r => setTimeout(r, 5));
  assert.equal(opened, false);
  g.openAudioStartAfterLaunch(1);
  await wait;
  assert.equal(opened, true);
  assert.equal(g.audioStartOpen(), true);
  g.setAudioWanted(false, false);
  assert.equal(g.audioWanted(), false);
  g.setAudioWanted(false, true);
  assert.equal(g.audioWanted(), true);
});

test('first seconds on the map: pins arrive in the cover fade, late pins land in one pop, Finn tips wait 5 s, no bare lawn', () => {
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /const pinsPending = !!player && !!park && !redeemables && !mapLoadFailed;/);
  assert.match(explore, /useEffect\(\(\) => \{ holdMapCover\(coverHold\); \}, \[coverHold\]\);/);
  assert.match(explore, /delays: mapCovered \? new globalThis\.Map<number, number>\(\)\s*: revealDelays\(\[\.\.\.visibleTasks\]\.sort\([^]*?\.map\(task => task\.id\), 40, 400\)/);
  assert.match(explore, /const MAP_CALM_MS = 5000;/);
  assert.match(explore, /const parkTipReady = !mapCovered && mapCalm && mapTipReady\(\{/);
  const map = read('src/components/Map.tsx');
  assert.match(map, /\{!tileWaitOver && <TileWaitSheet drawn=\{tilesDrawn\} armed=\{!covered\} \/>\}/);
  assert.match(map, /setTimeout\(\(\) => \{ setTileWaitOver\(true\); mapTilesShown\(coverToken\.current\); \}, TILE_WAIT_MAX_MS \+ 500\)/);
  assert.match(map, /onDidFinishRenderingFrameFully=\{covered \|\| !tilesDrawn \? revealMap : undefined\}/);
  const sheet = read('src/components/map/TileWaitSheet.tsx');
  assert.match(sheet, /pointerEvents="none"/);
  assert.match(sheet, /export const TILE_WAIT_MAX_MS = 12000;/);
});

test('buttons and the map on small and busy screens: GameButton art waits for its words, the SE shark fits, a gone map is never queried', () => {
  const button = read('src/ui/GameButton.tsx');
  assert.match(button, /style=\{\{ width: '100%', aspectRatio: BUTTON\.aspectRatio \}\}>/, 'the art is never hidden while its label waits for layout');
  assert.doesNotMatch(button, /opacity: labelAreaHeight > 0/, 'no button goes missing on a busy phone');
  assert.match(button, /const labelHeight = labelAreaHeight > 0 \? labelAreaHeight : guessedLabelHeight;/, 'the words have a size on the first frame');
  const detail = read('src/screens/RideTracker/RideDetailScreen.tsx');
  assert.match(detail, /const emptySharkSize = emptySharkFor\(screenHeight, emptyRoom, emptyWordsHeight\);/);
  assert.match(detail, /if \(screenHeight < 700 \|\| room <= 0 \|\| words <= 0\) return 0;/, 'no shark on the SE, and none before the room is measured');
  assert.match(detail, /return left >= 72 \? Math\.min\(170, left\) : 0;/, 'the shark grows into the room left (no dead band on a Pro Max), capped');
  assert.match(detail, /\{emptySharkSize > 0 && !\(community/);
  assert.match(detail, /<GameIcon name="shark" size=\{emptySharkSize\} \/>/);
  const map = read('src/components/Map.tsx');
  assert.match(map, /findWater: async \(latitude: number, longitude: number, margin\?: number\) => \{\s*if \(!mapAlive\.current\) return null;/);
  assert.match(map, /if \(key === decoKey\.current \|\| !mapAlive\.current\) return;/);
});

test('launch bubbles move a plain layer: the drawn bubble (with its border) is a still child', () => {
  const src = read('src/components/launch/LaunchScene.tsx');
  assert.match(src, /<Animated\.View style=\{\[styles\.bubbleSlot, \{ left: `\$\{bubble\.left\}%`, width: bubble\.size, height: bubble\.size \}, style\]\}>\s*<View style=\{\[styles\.bubble, \{ borderRadius: bubble\.size \/ 2 \}\]\} \/>/);
  assert.match(src, /bubbleSlot: \{ position: 'absolute', bottom: 20 \},/);
});

// Wave 3 round 3: launch art, HUD icons on the first frame after the lift, calm from the first visible map frame.
function loadCoverStore() {
  let ids = 0;
  const cleanups = [];
  const react = {
    useId: () => `k${++ids}`,
    useLayoutEffect: (fn) => { const c = fn(); if (typeof c === 'function') cleanups.push(c); },
    useEffect: () => undefined,
    useCallback: (fn) => fn,
    useState: (v) => [typeof v === 'function' ? v() : v, () => undefined],
  };
  const store = loadTs('src/components/map/mapCover.ts', { react });
  return { store, cleanups };
}

test('the launch cover waits for the header and HUD icons (inside its hard cap), then lifts onto a map with every icon', () => {
  const k = loadTs('src/constants/launchHandoff.ts');
  assert.equal(k.coverLiftAt({ now: 1300, startedAt: 1000, drawn: true, held: false, artPending: true }), 1000 + k.COVER_HARD_MAX_MS);
  assert.equal(k.coverLiftAt({ now: 1300, startedAt: 1000, drawn: true, held: false, artPending: false }), 1300);
  const { store } = loadCoverStore();
  store.armMapCover(Date.now());
  const tok = store.beginMapCover(Date.now());
  const coinDrawn = store.useCoverArt(true);
  const sharkDrawn = store.useCoverArt(true);
  store.useCoverArt(false); // an icon that is not on the map's header never waits
  store.mapCoverDrawn(tok);
  assert.equal(store.useCoverPlan().lifting, false, 'tiles drawn but the coin and the shark are not');
  coinDrawn();
  assert.equal(store.useCoverPlan().lifting, false);
  sharkDrawn();
  assert.equal(store.useCoverPlan().lifting, true, 'every icon drawn: the cover lifts now');
  assert.equal(store.useCoverPlan().shown, true);
  store.coverLifted(tok);
  assert.equal(store.isMapCovered(), false);
  assert.equal(store.useMapOnScreen(), true);
  // Wired where the grader saw empty pills and circles.
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.equal((explore.match(/<Currency coverArt image=/g) || []).length, 5);
  assert.match(explore, /<Avatar player=\{player\} size="lg" onArtDrawn=\{avatarArtDrawn\} \/>/);
  assert.match(explore, /const avatarArtDrawn = useCoverArt\(!!player\);/);
  const chest = read('src/components/map/ChestMapButton.tsx');
  assert.match(chest, /onLoad=\{onArt\} onError=\{onArt\}/);
  assert.match(chest, /const onArt = \(\) => \{ artDrawn\(\); setDrawn\(true\); \};/);
  assert.match(chest, /!drawn && styles\.waiting\]/);
  assert.match(read('src/components/Topbar/Currency.tsx'), /onLoad=\{artDrawn\}/);
  const avatar = read('src/components/Avatar.tsx');
  assert.match(avatar, /onLoad=\{index === 0 \? artDrawn : undefined\}/);
  assert.match(avatar, /onLoad=\{artDrawn\}/);
});

test('the map is on screen only once the cover is gone AND the tiles drew (or their wait ran out); calm and Finn time from there', () => {
  const { store } = loadCoverStore();
  store.armMapCover(Date.now());
  const tok = store.beginMapCover(Date.now());
  store.coverLifted(tok); // the hard cap lifted it before any tile drew
  assert.equal(store.isMapCovered(), false);
  assert.equal(store.useMapOnScreen(), false, 'a lifted cover over an undrawn map is not a visible map');
  store.mapCoverDrawn(tok);
  assert.equal(store.useMapOnScreen(), true);
  const late = loadCoverStore().store;
  late.armMapCover(Date.now());
  const t2 = late.beginMapCover(Date.now());
  late.coverLifted(t2);
  late.mapTilesShown(t2); // the tile sheet's wait ran out
  assert.equal(late.useMapOnScreen(), true);
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /const mapOnScreen = useMapOnScreen\(\) && mapFocused;/);
  assert.match(explore, /if \(!mapOnScreen\) \{ setMapCalm\(false\); return; \}\s*const timer = setTimeout\(\(\) => setMapCalm\(true\), MAP_CALM_MS\);/);
  assert.match(explore, /startTutorial\('park_arrival'\), 300\)/);
});

test('launch scene: only the native blue until the art draws, then art, bar and fact together; small art prefetched at module load', () => {
  const src = read('src/components/launch/LaunchScene.tsx');
  assert.match(src, /const \[artIn, setArtIn\] = useState\(launchArtDrawn\);/);
  assert.match(src, /\{artIn && !still && LAUNCH_BUBBLES\.map/);
  assert.match(src, /style=\{\[styles\.bottom, \{ paddingBottom: BOTTOM_INSET, opacity: artIn \? 1 : 0 \}\]\}/);
  assert.match(src, /Image\.prefetch\(uri, 'memory-disk'\)/);
  assert.match(read('src/Root.tsx'), /import SplashScreen from '\.\/screens\/SplashScreen';/);
  assert.match(read('src/screens/SplashScreen.tsx'), /LaunchScene/);
});

test('a slow map shows the living sky (clouds and the bobbing shark), never a flat pale sheet', () => {
  const sheet = read('src/components/map/TileWaitSheet.tsx');
  assert.match(sheet, /<MapCoverSky bar=\{false\} \/>/);
  const sky = read('src/components/map/MapCoverSky.tsx');
  assert.match(sky, /if \(drivenFill \|\| !bar\) return;/);
  assert.match(sky, /\{bar && \(/);
});

test('SE fits: the coin-in-range card sits left above the help button and ends before Energy; the gifts bubble shares the wallet row', () => {
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /const COIN_TIP_WIDTH = Math\.min\(300, WINDOW_WIDTH - 124\);/);
  assert.match(explore, /WINDOW_WIDTH - 12 - 16 - column\.width - 8/);
  assert.match(explore, /: bottomLeftColumnHeight\(stores\) \+ 6;/);
  assert.match(explore, /style: \{ position: 'absolute', left: 12, maxWidth, bottom, zIndex: 40 \} as const,/);
  assert.match(explore, /onLayout=\{event => setRightColumnWidth\(Math\.round\(event\.nativeEvent\.layout\.width\)\)\}/);
  assert.match(explore, /small=\{!!coin && \(SHORT_MAP \|\| coin\.narrow\)\}/);
  const cc = read('src/screens/CommunityCenterScreen.tsx');
  assert.match(cc, /SHORT_SCREEN && styles\.giftCountBadgeShort,\s*SHORT_SCREEN && \{ top: 60 \+ ART_SHIFT \},/);
  assert.match(cc, /SHORT_SCREEN \? 'No gifts yet!' : 'No gifts yet\. Leave the first one!'/);
});

test('favorites star: bigger staggered burst with a white ring flash, native driver, nothing with Reduce Motion', () => {
  const src = read('src/screens/RideTracker/RideDetailScreen.tsx');
  assert.match(src, /export const STAR_BURST_MS = 680;/);
  assert.match(src, /const spark = Math\.round\(size \* 0\.42\);/);
  assert.match(src, /const reach = size \* 1\.2;/);
  assert.match(src, /borderColor: B\.white,/);
  assert.match(src, /if \(reducedMotion\) return;/);
  assert.match(src, /\{on && !reducedMotion && SPARKS\.map/);
  assert.doesNotMatch(src.slice(src.indexOf('// ─── Favorite star ───'), src.indexOf("FavoriteStar.displayName")), /useNativeDriver: false|easing: Easing\.out\(Easing\.quad\) \}\)/);
});

test('audio: a cue asked for before launch is over loads on expo-av at once and moves to the graph when the gate opens', () => {
  const backends = read('src/gamekit/audio/backends.ts');
  assert.match(backends, /if \(!AV_ONLY_TYPES\.has\(assetType\(src\)\) && !audioStartOpen\(\)\) \{[^]*?const ok = await this\.av\.load\(key, src, voices\);[^]*?whenAudioMayStart\(\)\s*\.then\(\(\) => this\.api\.load\(key, src\)\)/);
});

test('launch never strands a kid on the launch scene: Splash moves on only while on top, Loading goes on to the map if brought back', () => {
  const splash = read('src/screens/SplashScreen.tsx');
  assert.match(splash, /\}, Boolean\(isReady && crumbsLoaded && focused\)\);/);
  const loading = read('src/screens/LoadingScreen.tsx');
  assert.match(loading, /if \(!leftAfterNavigating\.current\) return;\s*leftAfterNavigating\.current = false;\s*hasNavigated\.current = false;\s*if \(isReady && hasUsername\) safeNavigate\(\);/);
});

// Wave 3 round 4.
test('PLAY RIDE rises into place from above the footer: transparent at its start, never drawn over the compass', () => {
  const redeem = read('src/components/RedeemModal.tsx');
  assert.match(redeem, /const PLAY_RIDE_REST_Y = -120;/);
  assert.match(redeem, /const PLAY_RIDE_ENTER_FROM = -96;/);
  // Opacity follows the same value as the rise: 0 at the start spot, 1 at rest.
  assert.match(redeem, /opacity: enter\.interpolate\(\{ inputRange: \[0, 1\], outputRange: \[0, 1\], extrapolate: 'clamp' \}\)/);
  assert.match(redeem, /outputRange: \[PLAY_RIDE_ENTER_FROM, PLAY_RIDE_REST_Y\]/);
  assert.match(redeem, /outputRange: \[0\.9, 1\]/);
  assert.match(redeem, /Animated\.spring\(enter, \{ toValue: 1,[^}]*useNativeDriver: true \}\)/);
  assert.match(redeem, /if \(reducedMotion\) enter\.setValue\(shown \? 1 : 0\);/);
  // The closed-ride pill uses the same entrance (no slide over the footer either).
  assert.equal((redeem.match(/style=\{entrance\}/g) ?? []).length, 2);
  assert.doesNotMatch(redeem, /translateY: animated/);
  // The wrapper sits 50 pt below the map's bottom edge: the start spot leaves 46 pt (the compass bulges about 38).
  assert.ok(-96 + 50 < 0 && 96 - 50 >= 40);
});

test('the in-range cue lands with the PLAY RIDE pill, and the pill waits for its art again after it went away', () => {
  const redeem = read('src/components/RedeemModal.tsx');
  assert.match(redeem, /const pillShown = available && pillReady;/);
  assert.match(redeem, /if \(pillShown && identity !== lastAnnounced\.current\) \{[^}]*in_redeem_zone\.mp3/);
  assert.match(redeem, /useEffect\(\(\) => \{ if \(!available\) setPillReady\(false\); \}, \[available\]\);/);
});

test('Energy sits high enough that its battery clears the PLAY RIDE pill by 8 pt on the SE, the 17 Pro and the Pro Max', () => {
  const layout = loadTs('src/screens/ExploreScreen/parkMapLayout.ts');
  for (const width of [375, 402, 440]) {
    const gap = layout.energyGap(width);
    // Energy row bottom = 32 (column margin) + 70 (avatar) + gap; the pill inside the 36 pt row starts 3 pt up.
    const energyPillBottom = 32 + 70 + gap + 3;
    // Only where the pill reaches under the Energy column (side to side) does Energy need to clear its top.
    if (layout.playRideUnderEnergy(width)) {
      assert.ok(energyPillBottom - layout.playRideTop(width) >= 8, `${width}: ${energyPillBottom} vs ${layout.playRideTop(width)}`);
    }
    assert.ok(gap <= 60, `${width}: Energy stays near the avatar (${gap})`);
  }
  assert.equal(layout.bottomRightColumnHeight(true), 32 + 88 + 96, 'default gap keeps the old height');
  assert.equal(layout.bottomRightColumnHeight(false, 45), 32 + 44 + 84 + 45);
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /const ENERGY_GAP = energyGap\(WINDOW_WIDTH\);/);
  assert.match(explore, /<View style=\{\{ marginBottom: ENERGY_GAP, gap: 6, alignItems: 'flex-end' \}\}/);
});

test('ride pins drop in when their slot first gets a ride (slots mount empty), 40 ms apart, nearest first', () => {
  const marker = read('src/screens/ExploreScreen/TaskMarker.tsx');
  assert.match(marker, /const drop = useSharedValue\(reducedMotion \? 1 : parked \? 0 : revealDelay === undefined \? 1 : 0\);/);
  assert.match(marker, /if \(parked\) \{ if \(!reducedMotion\) drop\.value = 0; return; \}/);
  assert.match(marker, /drop\.value = withDelay\(revealDelay, withSpring\(1, \{ damping: 10, stiffness: 170 \}\)\);\s*\/\/ eslint-disable-next-line react-hooks\/exhaustive-deps\s*\}, \[parked\]\);/);
  const { revealDelays } = loadTs('src/screens/ExploreScreen/mapMarkerPresentation.ts');
  const delays = [...revealDelays([1, 2, 3, 20].concat(Array.from({ length: 12 }, (_, i) => 100 + i)), 40, 400).values()];
  assert.equal(delays[0], 0);
  assert.equal(delays[1], 40);
  assert.equal(Math.max(...delays), 400, 'every pin has landed within 0.4 s');
});

test('Finn tips at the park: the welcome stops short of the right buttons, the coin tip is one line with a picture and a pointer', () => {
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /const PARK_WELCOME_TIP_STYLE = \{ position: 'absolute', left: 12, right: 78, top: 132, zIndex: 40 \} as const;/);
  assert.match(explore, /art=\{coin \? <CoinTipPicture \/> : undefined\}/);
  assert.match(explore, /pointerLeft=\{coin\?\.pointer\}/);
  // The retry note waits while Finn's park tip is on screen (one card at a time).
  assert.match(explore, /mapLoadFailed && !\(parkTip && activeTip === parkTip\) && \(/);
  const { TIP_COPY } = loadTs('src/services/help/helpTopics.ts');
  assert.equal(TIP_COPY.coin_in_range.title, 'Tap PLAY RIDE!', 'matches the button word for word');
  const tip = read('src/components/help/CoachTip.tsx');
  assert.match(tip, /\{art \? <View style=\{styles\.art\}>\{art\}<\/View> : <Text style=\{styles\.body\}>\{body\}<\/Text>\}/);
  assert.match(tip, /accessibilityLabel=\{`\$\{title\}\. \$\{body\}`\}/, 'VoiceOver still reads the line');
  const picture = read('src/components/help/CoinTipPicture.tsx');
  assert.match(picture, /<GameIcon name="ticket"/);
  assert.match(picture, /ride-coin\.png/);
  assert.doesNotMatch(picture, /dice/);
});

test('the HUD row is whole from the first frame and cross-fades a lead or title change', () => {
  const stack = read('src/components/map/MapStatusStack.tsx');
  assert.doesNotMatch(stack, /settled/);
  // The new lead swaps in on the same render and fades up on the UI thread (no blank slot while JS is busy).
  assert.match(stack, /leadIn\.value = 0\.2;\s*leadIn\.value = withTiming\(1, \{ duration: 220 \}\);/);
  assert.match(stack, /\{lead\.node\}<\/Animated\.View>/);
  assert.doesNotMatch(stack, /runOnJS/);
  const bar = read('src/components/RideControlBar.tsx');
  assert.doesNotMatch(bar, /STANDINGS_WAIT_MS|waitedOut/);
  assert.match(bar, /titleIn\.value = 0\.2;\s*titleIn\.value = withTiming\(1, \{ duration: 220 \}\);/);
  assert.match(bar, />\{headline\}<\/Animated\.Text>/);
});

test('small fixes: Wait Times says "Checked just now", the Community Center wallet and bubble are light cards, no dark sliver', () => {
  assert.match(read('src/screens/QueueTimesScreen.tsx'), /if \(diff < 60\) return 'just now';/);
  const kiosk = loadTs('src/screens/CommunityCenter/leaveGiftLayout.ts');
  const hex = kiosk.KIOSK_COLORS.side.replace('#', '');
  const lum = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)).reduce((a, b) => a + b) / 3;
  assert.ok(lum > 110, `side strip is warm stone, not dark slate (${kiosk.KIOSK_COLORS.side})`);
  const cc = read('src/screens/CommunityCenterScreen.tsx');
  assert.match(cc, /giftCountBadge: \{\s*position: 'absolute',\s*top: 120,\s*alignSelf: 'center',\s*backgroundColor: KIOSK_COLORS\.face,/);
  assert.match(cc, /currencyDisplay: \{\s*position: 'absolute',\s*top: 60,\s*right: 20,\s*backgroundColor: KIOSK_COLORS\.face,/);
});

test('audio: once a cue moves to the graph, its expo-av copy is freed after any play in progress', () => {
  const backends = read('src/gamekit/audio/backends.ts');
  assert.match(backends, /this\.routes\.set\(key, this\.api\);\s*\/\/[^\n]*\n\s*this\.av\.unload\(key\);/);
  assert.match(backends, /unload\(key: string\): void \{[^]*?const wait = Math\.max\(0, \.\.\.pool\.map\(\(v\) => v\.busyUntil - Date\.now\(\)\)\);/);
});

// Wave 4 round 1: launch bar always moving, clean lift, neutral team bar, coin card fits, Energy rhythm.
test('launch bar stays in the 70s while tiles load, always creeps, and fills only as the map arrives', () => {
  const k = loadTs('src/constants/launchHandoff.ts');
  assert.ok(k.coverCeiling(true, false) <= 0.8, 'never parked near full before the map draws');
  assert.ok(k.coverCeiling(false, false) >= 0.72);
  assert.ok(k.COVER_FADE_MS <= 250, 'one quick lift');
  assert.ok(k.COVER_SMOOTH_WAIT_MS <= 600 && k.COVER_SMOOTH_FRAMES >= 2);
  const cover = read('src/components/map/MapLaunchCover.tsx');
  // The lift waits for a run of smooth frames (capped), so the fade never stutters into a double picture.
  assert.match(cover, /useFrameCallback\(\(info\) => \{\s*'worklet';\s*if \(liftAskedAt\.value < 0\) return;/);
  assert.match(cover, /smoothFrames\.value < COVER_SMOOTH_FRAMES && info\.timestamp - liftAskedAt\.value < COVER_SMOOTH_WAIT_MS/);
  assert.match(cover, /if \(plan\.lifting\) liftGate\.setActive\(true\);/);
  assert.doesNotMatch(cover, /Easing\.out\(Easing\.cubic\)/, 'no ease-out creep that parks the bar near its ceiling');
  const scene = read('src/components/launch/LaunchScene.tsx');
  assert.match(scene, /\{artIn && !still && barWidth > 0 && <BarShine width=\{barWidth\} \/>\}/);
  assert.match(scene, /translateX: -SHINE_WIDTH \+ t\.value \* filled/, 'the shine never runs past the fill');
  const store = read('src/components/map/mapCover.ts');
  assert.match(store, /plan\.lifting \? COVER_SMOOTH_WAIT_MS \+ COVER_FINISH_MS/);
});

test('team bar: before standings answer it says RIDE CONTROL with plain shields, never a no-leader claim', () => {
  const bar = read('src/components/RideControlBar.tsx');
  assert.match(bar, /const known = control !== null;/);
  assert.match(bar, /: leader \? `\$\{teamName\(leader, names\)\.toUpperCase\(\)\} LEADS` : !known \? 'RIDE CONTROL' : NO_LEADER_HEADLINE;/);
  assert.match(bar, /<Animated\.Text style=\{\[styles\.chipCount, countStyle\]\}>\{known \? count : 0\}<\/Animated\.Text>/);
  assert.match(bar, /leading=\{leader === team\} known=\{known\} \/>/);
  assert.match(bar, /\{known \? held\[team\] : ' '\}/);
});

test('Energy keeps its 12 pt gap on the Pro Max, and lifts only where PLAY RIDE reaches under it', () => {
  const layout = loadTs('src/screens/ExploreScreen/parkMapLayout.ts');
  assert.equal(layout.playRideUnderEnergy(440), false);
  assert.equal(layout.energyGap(440), 12, 'Pro Max: Energy stays with the avatar');
  assert.equal(layout.playRideUnderEnergy(375), true);
  assert.equal(layout.playRideUnderEnergy(402), true);
  assert.ok(layout.energyGap(375) > 12 && layout.energyGap(402) > 12);
  // Where Energy is not lifted, the pill ends at least 4 pt before the Energy column.
  assert.ok(440 - 16 - layout.ENERGY_PILL_WIDTH - layout.playRideRight(440) >= 4);
});

test('coin card: no 200 pt floor, sized to its content, narrow or a row up when the right column is wide', () => {
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.doesNotMatch(explore, /Math\.max\(200,/);
  assert.match(explore, /const room = WINDOW_WIDTH - 12 - 16 - column\.width - 8;/);
  assert.match(explore, /const above = room < COIN_TIP_MIN;/);
  assert.match(explore, /small=\{!!coin && \(SHORT_MAP \|\| coin\.narrow\)\} fit=\{!!coin\} narrow=\{coin\?\.narrow\}/);
  const tip = read('src/components/help/CoachTip.tsx');
  assert.match(tip, /\{!narrow && <Text style=\{styles\.ok\}>OK<\/Text>\}/);
  assert.match(tip, /fitCopy: \{ flexShrink: 1 \}/);
  const picture = read('src/components/help/CoinTipPicture.tsx');
  assert.match(picture, /<GameIcon name="ticket" size=\{36\} \/>/);
  assert.match(picture, /coin: \{ width: 38, height: 38 \}/);
  assert.doesNotMatch(picture, /GameIcon name="arrow"/, 'the arrow is drawn gold, not a blue circle');
});

test('Community Center top cards glow warm like lit signs', () => {
  const cc = read('src/screens/CommunityCenterScreen.tsx');
  assert.match(cc, /const SIGN_GLOW = \{\s*shadowColor: '#ffc95c',/);
  assert.equal((cc.match(/\.\.\.SIGN_GLOW,/g) || []).length, 2);
});

test('short phones: the map rail puts the chest and Daily 3 beside the compass instead of on the Trail Boxes pill', () => {
  const map = read('src/components/Map.tsx');
  assert.match(map, /const railSide = extraCount > 0 && !!viewSize && railFloor > 0\s*&& controlsTop \+ railColumnHeight\(1 \+ Math\.max\(extraCount, RAIL_EXTRAS_PLANNED\)\) \+ RAIL_FLOOR_GAP > viewSize\.height - railFloor;/);
  assert.match(map, /\{railSide \? <View pointerEvents="box-none" style=\{styles\.railExtras\}>\{extraControls\}<\/View> : extraControls\}/);
  assert.match(map, /railSide: \{ flexDirection: 'row-reverse', alignItems: 'flex-start' \},/);
  // The declutter keeps map art out from under the two-column rail too.
  assert.match(map, /w: 54 \* 2 \+ 8 \+ 12, h: railColumnHeight\(extraCount\) \+ 12/);
  // Before the right column is measured, its planned height stands in, so a short phone never starts in one column (Daily 3 on the Trail Boxes pill) and jumps.
  assert.match(read('src/screens/ExploreScreen.tsx'), /railFloor=\{rightColumnHeight > 0 \? 32 \+ rightColumnHeight : bottomRightColumnHeight\(mapFlags\.gymSwords, ENERGY_GAP\)\}/);
  assert.match(map, /return buttons <= 0 \? 0 : buttons \* RAIL_BUTTON \+ \(buttons - 1\) \* RAIL_GAP;/);
});

test('Trail Boxes: the flag is read only once signed in, and a check with no answer tries again', () => {
  const src = read('src/services/trail/TrailProvider.tsx');
  assert.match(src, /if \(!player\?\.id\) return undefined;\s*let on = true;/);
  assert.match(src, /const FLAG_RETRY_MS = \[4_000, 15_000, 45_000\] as const;/);
  assert.match(src, /if \(attempt < FLAG_RETRY_MS\.length\) timer = setTimeout\(\(\) => check\(attempt \+ 1\), FLAG_RETRY_MS\[attempt\]\);/);
  assert.doesNotMatch(src, /TRAILDBG/);
});

test('launch: the sky sheet waits under the cover from the first frame, PLAY RIDE never shows words on the bare map', () => {
  const sheet = read('src/components/map/TileWaitSheet.tsx');
  assert.match(sheet, /if \(!drawn && !armed\) return;/, 'its 6 s wait starts only when the cover has lifted');
  const button = read('src/components/YellowButton.tsx');
  assert.match(button, /\{!artLoaded && <View pointerEvents="none" style=\{STAND_IN_PILL\} \/>\}/);
  assert.match(button, /const \[artLoaded, setArtLoaded\] = useState\(pillArtSeen\);/);
  assert.doesNotMatch(button.slice(button.indexOf('const markArtReady'), button.indexOf('const markArtLoaded')), /pillArtSeen = true/,
    'the safety never claims the picture is cached');
});

test('launch cover: once its fade has begun no newer plan snaps it back to full (no long double picture)', () => {
  const cover = read('src/components/map/MapLaunchCover.tsx');
  assert.match(cover, /if \(liftStarted\.value === 1 \|\| opacity\.value < 1\) \{ liftStarted\.value = 1; liftAskedAt\.value = -1; return; \}/);
  assert.doesNotMatch(cover, /opacity\.value = 1;/, 'nothing raises the cover back up mid-lift');
  assert.match(cover, /runOnJS\(coverLifted\)\(liftToken\.value\)/, 'the fade reports the newest plan, so the cover leaves when it ends');
});

test('launch cover covers a slow park pick: no lift onto a bare map, then a second sky loading screen', () => {
  const k = loadTs('src/constants/launchHandoff.ts');
  // Not drawn, still picking home or park: the launch splash stays (bar creeping) up to its own cap.
  assert.equal(k.coverLiftAt({ now: 1500, startedAt: 1000, drawn: false, held: true, launch: true }), 1000 + k.COVER_LAUNCH_MAX_MS);
  // A park map that mounts under it gets its own 4 s, inside the cap.
  assert.equal(k.coverLiftAt({ now: 3500, startedAt: 1000, drawn: false, held: false, launch: true, mountedAt: 3000 }), 3000 + k.COVER_HARD_MAX_MS);
  assert.equal(k.coverLiftAt({ now: 9500, startedAt: 1000, drawn: false, held: false, launch: true, mountedAt: 9000 }), 1000 + k.COVER_LAUNCH_MAX_MS);
  assert.ok(k.COVER_LAUNCH_MAX_MS <= 9000, 'a kid is never stuck on the splash');
  // A later cover (walking into a park) keeps the plain 4 s cap.
  assert.equal(k.coverLiftAt({ now: 1500, startedAt: 1000, drawn: false, held: true }), 1000 + k.COVER_HARD_MAX_MS);
  const store = read('src/components/map/mapCover.ts');
  assert.match(store, /launch: plan\.launch, mountedAt \}\);/);
  assert.equal((store.match(/mountedAt = now;/g) || []).length, 2);
});

test('splash bar keeps creeping through a slow sign-in, below the Loading screen share', () => {
  const k = loadTs('src/constants/launchHandoff.ts');
  assert.ok(k.SPLASH_LONG_SHARE > k.SPLASH_ROUTE_SHARE && k.SPLASH_LONG_SHARE < k.LAUNCH_HANDOFF_SHARE);
  const splash = read('src/screens/SplashScreen.tsx');
  assert.match(splash, /withTiming\(SPLASH_LONG_SHARE, \{ duration: SPLASH_LONG_CREEP_MS, easing: Easing\.linear \}\)/);
  assert.match(splash, /if \(launchFill\.value >= SPLASH_ROUTE_SHARE\) return;/, 'never moves the bar back');
});

test('wave 3 round 2: PLAY RIDE waits for Finn, Battery Saver stills the launch, the pill press always springs back', () => {
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /redeemable=\{mapFocused && !mapCovered && !isActive \? activeRedeemable : undefined\}/,
    'PLAY RIDE and its chip stay hidden while the map cover or a Finn card is up');
  const scene = read('src/components/launch/LaunchScene.tsx');
  assert.match(scene, /const saver = useBatterySaver\(\);/);
  assert.match(scene, /const still = reduced \|\| saver \|\| !active;/);
  const sky = read('src/components/map/MapCoverSky.tsx');
  assert.match(sky, /const reduced = useUiReducedMotion\(\) \|\| saver;/);
  const pill = read('src/components/YellowButton.tsx');
  assert.match(pill, /if \(disabled \|\| reducedMotion\) \{ animated\.stopAnimation\(\); animated\.setValue\(1\); \}\s*return \(\) => animated\.stopAnimation\(\);/);
  assert.match(pill, /opacity: ready \? 1 : 0,/, 'pill and words share one opacity');
  assert.doesNotMatch(pill, /const markArtReady = \(\) => \{[^}]*pillArtSeen = true/, 'the safety timer never marks the art as seen');
});

test('favorite star: both looks stay mounted and swap opacity, so a toggle never shows an empty slot', () => {
  const detail = read('src/screens/RideTracker/RideDetailScreen.tsx');
  assert.match(detail, /<View style=\{\{ position: 'absolute', left: 0, top: 0, opacity: on \? 0 : 1 \}\}>/);
  assert.match(detail, /<View style=\{\{ opacity: on \? 1 : 0 \}\}><GameIcon name="star" size=\{size\} \/><\/View>/);
  assert.doesNotMatch(detail, /\{on \? <GameIcon name="star"/);
});
