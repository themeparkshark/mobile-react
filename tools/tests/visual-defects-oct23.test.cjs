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
  // The painted kiosk runs to the art's edge, so a drawn kiosk face covers its price and green slot
  // (no painted twin shows) and LEAVE GIFT ends 16 pt from the screen edge on every phone.
  assert.match(cc, /const KIOSK = kioskLayout\(SCREEN_WIDTH, SCALED_HEIGHT\);/);
  assert.match(cc, /LEAVE_GIFT_LEFT = KIOSK\.button\.left;/);
  const { kioskLayout, PAINTED_SLOT, PAINTED_PRICE, SCREEN_GUTTER, KIOSK_COLORS, LEAVE_GIFT_PILL_SHARE } = loadTs('src/screens/CommunityCenter/leaveGiftLayout.ts');
  // The plaque is the game's white card with a navy rim, never code-drawn dark slate.
  assert.equal(KIOSK_COLORS.face, '#ffffff');
  assert.equal(KIOSK_COLORS.edge, '#05346e');
  assert.match(cc, /kioskFace: \{[^}]*\.\.\.SHADOW\.card/s);
  // Only the green pill shows: the art's stone foot and gem are cropped off.
  assert.match(cc, /leaveGiftCrop: \{[^}]*overflow: 'hidden'/s);
  assert.ok(LEAVE_GIFT_PILL_SHARE < 0.7);
  // The plaque also covers the painted pedestal gem (about 0.813 of the art) under the slot.
  assert.ok(loadTs('src/screens/CommunityCenter/leaveGiftLayout.ts').KIOSK_FACE.bottom >= 0.816);
  for (const [phone, w] of [['SE', 375], ['17 Pro', 402], ['Pro Max', 440]]) {
    const artH = w * 2144 / 964;
    const k = kioskLayout(w, artH);
    assert.ok(w - (k.button.left + k.button.width) >= SCREEN_GUTTER, `${phone}: LEAVE GIFT is 16 pt from the edge`);
    assert.ok(k.face.left <= w * PAINTED_SLOT.left - 8, `${phone}: the face covers the painted slot's left rim`);
    assert.ok(k.face.left + k.face.width >= Math.floor(w * PAINTED_SLOT.right), `${phone}: the plaque covers the painted slot to its right end`);
    assert.ok(k.face.left + k.face.width <= w, `${phone}: the plaque ends on screen`);
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
  assert.match(src, /withNumberFont\(riderWords\(community\.unique_riders\)\)/);
  // One heading face app-wide (navy Shark, like Settings), one tile icon treatment, the game's own toast.
  assert.match(src, /sectionTitle: \{[^}]*color: B\.navy, fontSize: 17,[^}]*fontFamily: 'Shark'/s);
  assert.equal((src.match(/<View style=\{\[?s\.statIcon/g) || []).length, 3);
  assert.match(src, /toast: \{[^}]*backgroundColor: B\.white,[^}]*borderColor: B\.navy/s);
  assert.match(src, /'SAVED TO FAVORITES' : 'TAKEN OFF FAVORITES'/);
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
  assert.match(src, /\{community && community\.total_logs >= COMPACT_COMMUNITY_LOGS && \(/);
  assert.match(src, /<GameIcon name="shark" size=\{130\} \/>/, 'the empty page has the shark, not a blank sheet');
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
  assert.match(map, /const tok = beginMapCover\(\);/);
  assert.match(map, /return \(\) => releaseMapCover\(tok\);/);
  assert.match(map, /const revealMap = \(\) => mapCoverDrawn\(coverToken\.current\);/);
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
  // One bar from launch to map: the splash fills LAUNCH_HANDOFF_SHARE, the cover fills the rest.
  assert.match(read('src/screens/LoadingScreen.tsx'), /<Progress progress=\{progress \* LAUNCH_HANDOFF_SHARE\} \/>/);
  const k = loadTs('src/constants/launchHandoff.ts');
  assert.ok(k.LAUNCH_HANDOFF_SHARE > 0.5 && k.LAUNCH_HANDOFF_SHARE < 0.9);
  assert.ok(k.COVER_MAX_MS <= 3200, 'the cover never holds longer than about 3 s');
  assert.equal(k.coverStartShare(true, false, 0), k.LAUNCH_HANDOFF_SHARE, 'launch picks up the splash bar');
  assert.equal(k.coverStartShare(false, true, 0.83), 0.83, 'a map swapped in under the cover never restarts the bar');
  assert.equal(k.coverStartShare(false, false, 0.5), k.LATER_COVER_SHARE);
  // A home map swapped for the park map keeps the first deadline: the cover never outlives its cap.
  assert.equal(k.coverDeadline(1000, null), 1000 + k.COVER_MAX_MS);
  assert.equal(k.coverDeadline(2500, { up: true, deadline: 4200 }), 4200);
  assert.equal(k.coverDeadline(5000, { up: true, deadline: 4200 }), 5000 + k.COVER_MAX_MS, 'a later cover is a new cover');
  assert.equal(k.coverDeadline(2500, { up: false, deadline: 4200 }), 2500 + k.COVER_MAX_MS);
  assert.equal(k.coverCanLift(true, false), true);
  assert.equal(k.coverCanLift(true, true), false, 'held while the screen picks home or park');
  assert.equal(k.coverCanLift(false, false), false);
  // Clouds: about a quarter of the width (a cloud, not an empty speech balloon), never beside the shark's head.
  const clouds = loadTs('src/components/map/MapCoverSky.tsx', {
    react: { memo: (c) => c, useEffect() {}, useState: (v) => [v, () => {}] },
    'react-native': { StyleSheet: { create: (x) => x, absoluteFill: {}, absoluteFillObject: {} }, View: 'View', useWindowDimensions: () => ({ width: 402, height: 874 }) },
    'expo-image': { Image: 'Image' },
    'react-native-reanimated': { default: { View: 'View' }, Easing: {}, cancelAnimation() {}, useAnimatedStyle() {}, useSharedValue() {}, withRepeat() {}, withTiming() {} },
    '../../config': { default: { primary: '#09268f' } },
    '../../ui/useUiReducedMotion': { default: () => false },
    'react/jsx-runtime': { jsx() {}, jsxs() {} },
  }).COVER_CLOUDS;
  for (const c of clouds) {
    assert.ok(c.w >= 0.24 && c.w <= 0.3, `cloud width ${c.w}`);
    assert.ok(c.y + c.w * 0.67 * 0.46 < 0.36 || c.y > 0.66, `cloud at y ${c.y} stays clear of the shark and bar`);
  }
});

test('the map loading cover lifts on the UI thread and hides the whole HUD until the map arrives', () => {
  const store = read('src/components/map/mapCover.ts');
  // The lift is a Reanimated withDelay scheduled at mount (UI thread), the bar on the same clock.
  assert.match(store, /coverOpacity\.value = withDelay\(remaining, withTiming\(0/);
  assert.match(store, /coverFill\.value = withTiming\(1, \{ duration: remaining/);
  assert.doesNotMatch(store, /setTimeout\([^)]*lift[^)]*COVER/);
  const cover = read('src/components/map/MapLaunchCover.tsx');
  assert.match(cover, /opacity: coverOpacity\.value/);
  assert.match(cover, /<MapCoverSky fill=\{coverFill\} \/>/);
  const explore = read('src/screens/ExploreScreen.tsx');
  // Above every HUD widget (zIndex up to 40) and under the header; taps on the hidden HUD are swallowed.
  assert.match(explore, /<MapLaunchCover blockTouches style=\{\{ top: 70 \+ \(Constants\.statusBarHeight \?\? 0\), zIndex: 45 \}\} \/>/);
  assert.match(explore, /<Map onPress=\{[^\n]*\n\s*coverHost="screen"/);
  assert.match(read('src/screens/ExploreScreen/HomeExplore.tsx'), /<Map coverHost="screen" /);
  // Tips, tutorials, the home intro and the adventure slam wait for the cover to lift.
  assert.match(explore, /const parkTipReady = !mapCovered && mapTipReady\(\{/);
  assert.match(explore, /if \(!mapFocused \|\| mapCovered \|\| !player/);
  assert.match(explore, /if \(mapFocused && !mapCovered && player/);
  assert.match(explore, /introAllowed=\{mapFocused && !mapCovered && homeIntroAllowed\}/);
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
  assert.match(src, /source=\{SPLASH_ART\}/);
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
});
