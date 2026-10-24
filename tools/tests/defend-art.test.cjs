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
