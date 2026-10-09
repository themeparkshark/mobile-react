'use strict';
/**
 * Juice (Dustin, Oct 8 2026): the slim animated XP bar on profiles (#15) and
 * the Social chest tap plus one consistent press feel across Social (#12).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { scanSource } = require('./helpers/ui-copy-rules.cjs');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

const FILES = [
  'src/components/XpBar.tsx',
  'src/components/Experience.tsx',
  'src/screens/threads/ChestButton.tsx',
  'src/screens/threads/ShortcutTiles.tsx',
  'src/screens/threads/socialLook.tsx',
  'src/screens/SocialScreen.tsx',
];

test('juice surfaces carry no emoji, em dashes or glyph icons', () => {
  const offenders = [];
  for (const file of FILES) for (const hit of scanSource(read(file), file)) offenders.push(`${file}:${hit.line} ${hit.kind}`);
  assert.deepEqual(offenders, []);
});

test('XP is one slim row: badge, bar, potion cap; the big potion card is gone', () => {
  const card = read('src/components/Experience.tsx');
  assert.doesNotMatch(card, /XpPotion/);
  assert.ok(!exists('src/components/XpPotion.tsx'), 'the 70 pt potion component is removed');
  assert.match(card, /<XpBar/);
  assert.doesNotMatch(card, /minHeight: 104/, 'no 104 pt card');
  const bar = read('src/components/XpBar.tsx');
  const height = Number(/export const XP_BAR_HEIGHT = (\d+);/.exec(bar)[1]);
  assert.ok(height <= 28, `bar ${height} pt`);
  const badge = Number(/const BADGE = (\d+);/.exec(card)[1]);
  assert.ok(badge <= 46, `badge ${badge} pt`);
  // The level stays readable: the badge number is 20 pt Shark, the bar text 15 pt with an ink outline.
  assert.match(card, /badgeNumber: \{ fontFamily: 'Shark', fontSize: 20/);
  assert.match(bar, /const FONT_PX = 15;/);
  assert.match(bar, /style="stroke" strokeWidth=\{4\}/);
});

test('XP bar is cheap: one canvas, reused paths, a stopped clock that pauses, no blur, label in shared values', () => {
  const bar = read('src/components/XpBar.tsx');
  assert.equal((bar.match(/<Canvas/g) || []).length, 1);
  assert.match(bar, /useFrameCallback\([\s\S]*?, false\)/);
  assert.match(bar, /AppState\.addEventListener/);
  assert.match(bar, /usePathValue/);
  assert.doesNotMatch(bar, /BlurMask|setInterval/);
  assert.match(bar, /const text = useSharedValue\(label \?\? ''\)/, 'count-up never re-renders the canvas paths');
  assert.match(bar, /createPotionDriver/, 'same level-up rules as the potion (tested in profile-v2)');
  const card = read('src/components/Experience.tsx');
  assert.match(card, /const barTransition = useCallback\(\(kind: PotionTransition\) => handlers\.current\.onTransition\(kind\), \[\]\)/);
});

test('XP level up: gold bar, LEVEL UP! on the bar, badge pop, sound and haptic, also under Reduce Motion', () => {
  const card = read('src/components/Experience.tsx');
  assert.match(card, /label=\{ribbonOn \? 'LEVEL UP!' : numbers\}/);
  assert.match(card, /gold=\{ribbonOn\}/);
  assert.match(card, /HapticPatterns\.levelUp\(\)/);
  assert.match(card, /assets\/sounds\/reward\.mp3/);
  assert.match(card, /toValue: 1\.3, duration: 140/, 'badge pop');
  const bar = read('src/components/XpBar.tsx');
  // The bar drains before the driver refills it.
  const { REFILL_AT_MS, BURST_AT_MS } = { REFILL_AT_MS: 1400, BURST_AT_MS: 520 };
  const hold = Number(/withDelay\((\d+), withTiming\(0, \{ duration: (\d+)/.exec(bar)[1]);
  const drain = Number(/withDelay\(\d+, withTiming\(0, \{ duration: (\d+)/.exec(bar)[1]);
  assert.ok(BURST_AT_MS + hold + drain <= REFILL_AT_MS, 'drain ends before the refill');
  assert.match(read('src/components/xpPotionModel.ts'), /REFILL_AT_MS = 1400/);
});

test('Social chest: squash on press, lid pop, wiggle, stars, haptic, Chris sounds, then the sheet', () => {
  const chest = read('src/screens/threads/ChestButton.tsx');
  assert.match(chest, /onPressIn=\{pressIn\}/);
  assert.match(chest, /sx\.value = withTiming\(1\.14/);
  assert.match(chest, /setLidOpen\(true\)/);
  assert.match(chest, /name="chestOpen"/);
  assert.match(chest, /Haptics\.impactAsync\('medium'\)/);
  const delay = Number(/CHEST_OPEN_DELAY_MS = (\d+);/.exec(chest)[1]);
  assert.ok(delay >= 150 && delay <= 260, 'the pop reads first, the sheet still feels instant');
  for (const file of [...chest.matchAll(/require\('\.\.\/\.\.\/\.\.\/(assets\/sounds\/[\w.]+)'\)/g)].map((m) => m[1])) {
    assert.ok(fs.statSync(path.join(root, file)).size > 2000, `${file} is a real sound`);
    assert.doesNotMatch(file, /games\/audio/, 'only shipped, approved sounds');
  }
  assert.match(chest, /if \(!reduced\) \{\n\s+lift\.value/, 'Reduce Motion: no hop or stars');
  const social = read('src/screens/SocialScreen.tsx');
  assert.match(social, /<ChestButton open=\{shortcuts\}/);
});

test('every Social tap clicks once: PressScale clicks by default, actions with their own sound opt out', () => {
  const look = read('src/screens/threads/socialLook.tsx');
  assert.match(look, /sound = 'tap'/);
  assert.match(look, /if \(sound === 'tap'\) playSound\(PRESS_SOUND/);
  assert.match(read('src/screens/SocialScreen.tsx'), /haptic="medium" sound="none" style=\{styles\.compose\}/, 'the composer plays its own open sound');
  assert.doesNotMatch(read('src/screens/SocialScreen.tsx'), /TAB_SOUND/, 'tabs click through PressScale, never twice');
  assert.match(read('src/screens/threads/ThreadCard.tsx'), /sound="none"\n\s+onPress=\{\(\) => onMenu\(thread\)\}/);
  // The shortcut sheet uses the same press, not the old silent-scale tiles.
  assert.match(read('src/screens/threads/ShortcutTiles.tsx'), /<PressScale onPress=\{tile\.onPress\}/);
  assert.ok(!exists('src/components/PlayerButtons.tsx'));
});

test('no Social sound points at the broken success.mp3', () => {
  for (const file of ['src/screens/threads/Composer.tsx', 'src/screens/ThreadScreen.tsx', 'src/screens/SocialScreen.tsx']) {
    assert.doesNotMatch(read(file).replace(/\/\/.*$/gm, ''), /sounds\/success\.mp3/, file);
  }
  assert.ok(fs.statSync(path.join(root, 'assets/sounds/success.mp3')).size < 200, 'still the broken file: keep it unused');
});
