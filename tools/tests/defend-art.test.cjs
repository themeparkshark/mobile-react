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
  assert.match(gym, /const maxWinner = \(SCREEN_H \* 0\.58 - 190\) \/ aspectRatio;/);
  assert.match(gym, /Math\.min\(SCREEN_W \* 0\.32, winnerSize \* sideRatio\)/);
  const defend = read('src/components/GymBattle/DefendMiniGameModal.tsx');
  assert.match(defend, /const SHORT = SCREEN_H < 700;/);
  assert.match(defend, /bottom: SHORT \? 64 : 120,/);
  assert.match(defend, /top: SHORT \? 168 : 220,/);
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
  assert.match(src, /\{multiplier > 1 && totalPoints > taps && \(/);
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
