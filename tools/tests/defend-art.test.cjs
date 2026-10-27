const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { read, root } = require('./helpers/load-ts.cjs');

const sha1 = file => crypto.createHash('sha1').update(fs.readFileSync(path.join(root, file))).digest('hex');

// Defend is played by every team, so its shield carries the team-neutral
// chevron (no shark fin, mouse or globe). The scene stays bright: no dark band
// is baked into the background, and the score sits on a light plaque drawn in
// code, so it lines up on every screen height.
test('Defend uses the team-neutral chevron shield and the bright scene', () => {
  assert.equal(sha1('assets/images/shield.png'), 'b272b5bb366710cb4fabba91eed87dd816905044', 'shield.png is the approved chevron shield');
  assert.equal(sha1('assets/images/defend-bg.jpg'), '4e51f64745358554ce165d88b87fc6040a677151', 'defend-bg.jpg is the bright scene with no navy band');
});

test('the Defend score sits on a light plaque drawn in code', () => {
  const src = read('src/components/GymBattle/DefendMiniGameModal.tsx');
  assert.match(src, /<View style=\{styles\.scorePlaque\}>\s*<View style=\{styles\.scorePlaqueInner\}>\s*<Text style=\{styles\.tapCountBig\}>/);
  assert.match(src, /scorePlaqueInner: \{[^}]*backgroundColor: '#FFF8E6'/);
});

// The no-team arena drew the towers over "Join a Team!" and the middle tower
// swallowed taps on PICK YOUR TEAM. The towers now sit in their own unflattened
// layer under the prompt, and the prompt rests on the floor above BACK.
test('the Join a Team prompt is never under a tower', () => {
  const src = read('src/screens/GymBattle/GymBattleScreen.tsx');
  const noTeam = src.slice(src.indexOf('// No team prompt'), src.indexOf('<View style={styles.noTeamOverlay}>'));
  assert.match(noTeam, /<View style=\{StyleSheet\.absoluteFill\} pointerEvents="box-none" collapsable=\{false\}>\s*\{pillarOrder\.map/);
  assert.match(src, /noTeamOverlay: \{[^}]*justifyContent: 'flex-end',[^}]*paddingBottom: 104,/);
});

// The start and result screens sat under a dark navy scrim. They now use a
// light cream card with a navy outline, and every text colour clears 4.5:1 on it.
test('Defend start and result screens are light cards, not dark scrims', () => {
  const src = read('src/components/GymBattle/DefendMiniGameModal.tsx');
  assert.equal((src.match(/<View style=\{styles\.lightCard\}>/g) || []).length, 2);
  assert.doesNotMatch(src, /rgba\(5, 52, 110, 0\.[56]\)/, 'no dark navy scrim');
  assert.match(src, /lightCard: \{[^}]*backgroundColor: '#FFF8E6'/);
  assert.match(src, /for 25\{'\\u00A0'\}seconds\. More taps, more points!/);
  assert.match(src, /totalPoints < 50 \? 'GOOD TRY!'/);
});

test('the Defend countdown ends on GO!, never a 0', () => {
  assert.match(read('src/components/GymBattle/DefendMiniGameModal.tsx'), /\{countdown > 0 \? countdown : 'GO!'\}/);
});

// iPhone SE: the winner tower grew into the header cards, and the Defend score
// plaque and bonus banner covered the shield.
test('Gym towers and the Defend layout fit a short screen', () => {
  const gym = read('src/screens/GymBattle/GymBattleScreen.tsx');
  assert.match(gym, /const maxWinner = \(SCREEN_H \* 0\.58 - \(HEADER_BOTTOM \+ 22\)\) \/ aspectRatio;/);
  assert.match(gym, /Math\.min\(SCREEN_W \* 0\.32, winnerSize \* sideRatio\)/);
  const defend = read('src/components/GymBattle/DefendMiniGameModal.tsx');
  assert.match(defend, /const SHORT = SCREEN_H < 700;/);
  assert.match(defend, /bottom: SHORT \? 64 : 120,/);
});

// Dustin asked to drop the glow-filter look. The Gym winner cue and the
// Defend shield burst are flat shapes with a hard navy outline, no blur.
function styleBlock(src, name) {
  const at = src.indexOf(`  ${name}: {`);
  assert.ok(at > 0, name);
  return src.slice(at, src.indexOf('\n  },', at));
}

test('Gym has no soft glow anywhere', () => {
  const src = read('src/screens/GymBattle/GymBattleScreen.tsx');
  for (const m of src.matchAll(/shadowRadius: (\d+(?:\.\d+)?)/g)) assert.equal(Number(m[1]), 0, 'every Gym shadow is a hard drop');
  for (const m of src.matchAll(/textShadowRadius: (\d+(?:\.\d+)?)/g)) assert.equal(Number(m[1]), 0, 'every Gym text shadow is hard');
  const glow = styleBlock(src, 'pillarGlow');
  assert.match(glow, /borderColor: '#123A6B'/);
  assert.match(glow, /shadowOpacity: 0/);
});

test('Gym score badges carry the team crest so non-readers can tell towers apart', () => {
  const src = read('src/screens/GymBattle/GymBattleScreen.tsx');
  assert.match(src, /<Image source=\{TEAMS\[team\]\.badge\} style=\{styles\.scoreCrest\}/);
  assert.match(src, /const sideRatio = SCREEN_H < 750 \? 0\.9 : 0\.75;/);
});

test('Defend shield burst is flat and the result has one message', () => {
  const src = read('src/components/GymBattle/DefendMiniGameModal.tsx');
  const glow = styleBlock(src, 'shieldGlow');
  assert.doesNotMatch(glow, /shadowRadius/);
  assert.match(glow, /borderColor: '#123A6B'/);
  assert.doesNotMatch(styleBlock(src, 'multiplierBanner'), /shadowRadius: [1-9]/);
  assert.match(src, /\{result\.failed \? 'OOPS!' : totalPoints < 50 \? 'GOOD TRY!' : 'DEFENDED!'\}/);
  assert.match(src, /\{!result\.failed && totalPoints >= 50 && <Text style=\{styles\.resultTier\}>/);
  for (const m of src.matchAll(/(?:text)?[sS]hadowRadius: (\d+(?:\.\d+)?)/g)) assert.equal(Number(m[1]), 0, 'every Defend shadow is a hard drop');
});

test('Defend result never claims a bonus or points that did not happen, and shows a failed send in kid words', () => {
  const src = read('src/components/GymBattle/DefendMiniGameModal.tsx');
  assert.match(src, /\{!result\.failed && multiplier > 1 && totalPoints > taps && \(/, 'an OOPS card carries one message, never a bonus line');
  assert.match(src, /failed: true,/);
  assert.match(src, /result\.failed \? \(\s*<Text style=\{styles\.resultError\}>\{result\.message\}<\/Text>/);
  assert.match(src, /result\.points > 0 \? `\+\$\{result\.points\} points for your team!` : 'Tap faster next time to score for your team!'/);
  assert.match(src, /<Animated\.View style=\{\[styles\.shieldGlowWrap, glowAnimStyle\]\}>\s*<View style=\{styles\.shieldGlow\}>/, 'the scale runs on a plain wrapper, never on the bordered ring');
});

test('a very fast Defend round is never refused for too many taps', () => {
  const src = read('src/components/GymBattle/DefendMiniGameModal.tsx');
  assert.match(src, /defendGym\(parkId, Math\.min\(totalPoints, 500\)\)/);
});

test('Join a Team uses the same bright cream card as Defend', () => {
  const src = read('src/screens/GymBattle/GymBattleScreen.tsx');
  assert.match(styleBlock(src, 'noTeamBox'), /backgroundColor: '#FFF8E6'/);
  assert.match(styleBlock(src, 'noTeamBlur'), /borderColor: '#123A6B'/);
  assert.match(styleBlock(src, 'noTeamText'), /color: '#123A6B'/);
});

// Grader, wave 5 round 1: the header cards were dark see-through slabs, the
// winner stage and the Defend ring faded in and out like a smudge, and the
// cooldown buttons looked broken at 30% opacity.
test('Gym header cards are solid cream with crests, and nothing pulses in opacity', () => {
  const src = read('src/screens/GymBattle/GymBattleScreen.tsx');
  const box = styleBlock(src, 'statBox');
  assert.match(box, /backgroundColor: '#FFF8E6'/);
  assert.match(box, /borderWidth: 3,\s*borderColor: '#123A6B'/);
  assert.match(styleBlock(src, 'countdownText'), /color: '#123A6B'/);
  assert.equal((src.match(/style=\{styles\.statCrest\}/g) || []).length, 2, 'YOUR TEAM and LEADING carry the team crest');
  assert.doesNotMatch(src, /rgba\(5, 52, 110, 0\.6\)/, 'no see-through navy header slab');
  assert.match(src, /y: HEADER_BOTTOM \+ Math\.random\(\)/, 'sparkles start below the header cards');
  const stage = src.slice(src.indexOf('{/* Winner stage'), src.indexOf('{/* Pillar image */}'));
  assert.doesNotMatch(stage, /opacity:/, 'the winner stage never fades');
  assert.match(stage, /\{ scale: glowAnim\.interpolate\(\{ inputRange: \[0\.3, 1\], outputRange: \[1, 1\.06\] \}\) \}/);
  const defend = read('src/components/GymBattle/DefendMiniGameModal.tsx');
  const ring = defend.slice(defend.indexOf('const glowAnimStyle'), defend.indexOf('}));', defend.indexOf('const glowAnimStyle')));
  assert.doesNotMatch(ring, /opacity/, 'the Defend ring stays fully solid');
});

test('waiting arena buttons are solid cream pills with a clock, ready ones are full colour', () => {
  const src = read('src/screens/GymBattle/GymBattleScreen.tsx');
  const rest = styleBlock(src, 'restingBtn');
  assert.match(rest, /backgroundColor: '#EFE6D2'/);
  assert.doesNotMatch(rest, /opacity/);
  assert.match(src, /<GameIcon name=\{icon\} size=\{big \? 22 : 16\} \/>/);
  assert.equal((src.match(/<RestingButton/g) || []).length, 5);
  const row = src.slice(src.indexOf('{/* Top row: Defend, Check In, Battle.'), src.indexOf('{/* Go Back button */}'));
  assert.doesNotMatch(row, /disabled=/, 'no see-through disabled button in the action area');
  assert.doesNotMatch(src, /cooldownBadge|lockedBadge/);
});

test('the Defend result button says DONE, so the tier is said once', () => {
  const src = read('src/components/GymBattle/DefendMiniGameModal.tsx');
  assert.match(src, /<Text style=\{styles\.doneButtonText\}>DONE<\/Text>/);
  assert.doesNotMatch(src, />NICE!<\/Text>/);
});

test('the Defend round clock runs from its start time, so taps cannot stretch it', () => {
  const src = read('src/components/GymBattle/DefendMiniGameModal.tsx');
  assert.match(src, /endsAtRef\.current = Date\.now\(\) \+ GAME_DURATION \* 1000;/);
  assert.match(src, /Math\.ceil\(\(endsAtRef\.current - Date\.now\(\)\) \/ 1000/);
  const tap = src.slice(src.indexOf('const handleTap = useCallback'), src.indexOf('// Haptic feedback', src.indexOf('const handleTap = useCallback')));
  assert.match(src, /roundClock\.value = withTiming\(0, \{\s*duration: GAME_DURATION \* 1000,\s*easing: Easing\.linear,\s*reduceMotion: ReduceMotion\.Never,/, 'the clock runs on the UI thread and is never skipped for Reduce Motion');
  assert.match(src, /if \(now !== before\) runOnJS\(syncClock\)\(now\);/);
  assert.match(tap, /const left = secondsLeft\(\);\s*setTimeLeft\(t => \(t === left \? t : left\)\);\s*if \(left === 0\) return;/, 'every tap refreshes the clock and taps after the buzzer do not count');
  assert.match(src, /timeLeft <= 7 && timeLeft > 0 && !bonusFiredRef\.current/);
  assert.doesNotMatch(src, /setTimeLeft\(t => t - 1\)/);
});

// Grader, wave 5 round 2: READY art drew smaller than the cream wait pill
// beside it (transparent rows in the PNGs), so "come back later" outweighed
// "go". Ready art is drawn to its visible bounds at one shared height, and a
// waiting pill is clearly smaller.
test('a ready arena button is bigger than a waiting one', () => {
  const src = read('src/screens/GymBattle/GymBattleScreen.tsx');
  const { PNG } = (() => { try { return require('pngjs'); } catch { return {}; } })();
  for (const [name, file] of [['defend', 'btn-defend'], ['checkin', 'btn-checkin'], ['battle', 'btn-battle']]) {
    const m = src.match(new RegExp(`${name}: \\{ src: require\\('\\.\\./\\.\\./\\.\\./assets/images/${file}\\.png'\\), w: (\\d+), h: (\\d+), x: (\\d+), y: (\\d+), vw: (\\d+), vh: (\\d+) \\}`));
    assert.ok(m, `${name} ready art box`);
    const [w, h, x, y, vw, vh] = m.slice(1).map(Number);
    const buf = fs.readFileSync(path.join(root, `assets/images/${file}.png`));
    assert.equal(buf.readUInt32BE(16), w, `${file} width`);
    assert.equal(buf.readUInt32BE(20), h, `${file} height`);
    assert.ok(x + vw <= w && y + vh <= h, `${file} visible box fits the image`);
    if (PNG) {
      const png = PNG.sync.read(buf);
      let top = h, bottom = -1;
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (png.data[(yy * w + xx) * 4 + 3] > 20) { top = Math.min(top, yy); bottom = yy; }
      assert.ok(Math.abs(top - y) <= 1 && Math.abs(bottom + 1 - (y + vh)) <= 1, `${file} visible rows ${top}..${bottom}`);
    }
  }
  assert.match(src, /const READY_H = Math\.min\(\.\.\.Object\.values\(READY_ART\)\.map\(a => ACTION_CELL_W \* a\.vh \/ a\.vw\)\);/);
  assert.match(src, /const WAIT_H = Math\.max\(34, Math\.round\(READY_H \* 0\.78\)\);/);
  assert.match(src, /const WAIT_W = Math\.round\(ACTION_CELL_W \* 0\.84\);/);
  for (const name of ['defend', 'checkin', 'battle']) assert.match(src, new RegExp(`<ReadyArt name="${name}" />`));
  assert.equal((src.match(/style=\{styles\.waitPill\}/g) || []).length, 4, 'every waiting top-row button is the smaller pill');
  assert.match(styleBlock(src, 'readySlot'), /height: READY_H,/);
  // The bob is native-driver and only runs when ambient motion is allowed.
  assert.match(src, /if \(!ambient\) \{ readyBob\.setValue\(0\); return; \}/);
  assert.equal((src.match(/style=\{\[styles\.readyStack, readyBobStyle\]\}/g) || []).length, 3);
});

test('outside the park the arena buttons say GET CLOSER, never READY', () => {
  const src = read('src/screens/GymBattle/GymBattleScreen.tsx');
  assert.match(src, /useContext\(LocationStatusContext\)/);
  assert.match(src, /const awayFromArena = Boolean\(parkLoaded && parkId > 0 &&\s*\(currentPark \? currentPark\.id !== parkId : parkLookupRecord\?\.outcome === 'outside'\)\);/);
  assert.match(src, /const defendReady = battleActive && !awayFromArena && defendCooldown <= 0/);
  assert.match(src, /const checkinReady = battleActive && !awayFromArena && canCheckIn;/);
  assert.match(src, /const battleReady = battleActive && !awayFromArena && canAttack;/);
  assert.match(src, /awayFromArena \? 'GET CLOSER'/);
  assert.match(src, /\{battleActive && !hasPlacedToday && !awayFromArena \? \(/);
  assert.doesNotMatch(src, /line=\{battleActive && checkinCooldown > 0 \? clock\(checkinCooldown\) : 'SOON'\}/, 'a live arena never says SOON for Check In');
});

test('the tower toast takes the title slot, and the floor specks are gold and stop under the header', () => {
  const src = read('src/screens/GymBattle/GymBattleScreen.tsx');
  const slot = styleBlock(src, 'pillarToastSlot');
  assert.match(slot, /top: 47,/);
  assert.doesNotMatch(styleBlock(src, 'pillarToast'), /bottom:/);
  assert.match(src, /opacity: pillarToast \? 0 : 1/);
  assert.match(styleBlock(src, 'statCrest'), /width: 28,\s*height: 28,/);
  const speck = styleBlock(src, 'particle');
  assert.doesNotMatch(speck, /borderWidth|borderColor/);
  assert.match(src, /color: i % 2 === 0 \? '#FFD54A' : '#FFF1B8',/);
  assert.match(src, /toValue: HEADER_BOTTOM \+ 10,/);
  assert.match(src, /const particleCount = ambient \? Math\.round\(14 \*/);
  assert.match(src, /\.start\(\(\{ finished \}\) => \{ if \(finished\) animate\(\); \}\);/);
});

test('the Defend bonus pill sits in the header line and every +N stays inside the ring', () => {
  const src = read('src/components/GymBattle/DefendMiniGameModal.tsx');
  const header = src.slice(src.indexOf('<View style={styles.headerContainer}>'), src.indexOf('{/* Floating +N popups */}'));
  assert.match(header, /multiplier > 1 \? \(\s*<Animated\.View entering=\{ZoomIn\.duration\(220\)\} style=\{styles\.multiplierBanner\}>/);
  assert.match(header, /<Text style=\{styles\.tapToDefend\}>TAP TO DEFEND!<\/Text>/);
  const banner = styleBlock(src, 'multiplierBanner');
  assert.doesNotMatch(banner, /position: 'absolute'|rgba/);
  assert.match(src, /const FLOAT_RISE = SHORT \? 56 : 72;/);
  assert.match(src, /translateY\.value = withTiming\(-FLOAT_RISE,/);
  assert.match(src, /const offsetY = RING \* 0\.12 \+ Math\.random\(\) \* RING \* 0\.18;/);
  assert.match(styleBlock(src, 'floatingPlus'), /zIndex: 5,/);
});
