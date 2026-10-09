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
  assert.match(card, /maxFontSizeMultiplier=\{1\}>\{shownLevel\}/, 'the badge never clips at large text sizes');
  assert.match(bar, /export const XP_BAR_LIP = 3;/);
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
  assert.doesNotMatch(read('src/components/Experience.tsx'), /setInterval/, 'no 30 Hz React count-up');
  assert.match(bar, /count\.value = withTiming\(now\.current/, 'the XP counts on the UI thread');
  assert.match(bar, /if \(!busy && acc\.value < IDLE_FRAME_MS\) return;/, 'calm idle frame rate');
  assert.match(bar, /createPotionDriver/, 'same level-up rules as the potion (tested in profile-v2)');
  const card = read('src/components/Experience.tsx');
  assert.match(card, /const barTransition = useCallback\(\(kind: PotionTransition\) => handlers\.current\.onTransition\(kind\), \[\]\)/);
});

test('XP level up: gold hold with a pulse, bounded stars, LEVEL UP!, refill shows the latest XP', () => {
  const bar = read('src/components/XpBar.tsx');
  const card = read('src/components/Experience.tsx');
  assert.match(bar, /if \(banner\.value\) return 'LEVEL UP!'/);
  assert.match(card, /HapticPatterns\.levelUp\(\)/);
  assert.match(card, /assets\/sounds\/reward\.mp3/);
  assert.match(card, /announceForAccessibility\(`Level \$\{level\}!`\)/);
  assert.match(card, /toValue: 1\.3, duration: 140/, 'badge pop');
  // The refill reads the latest props, so a refetch during the celebration never leaves stale numbers.
  assert.match(bar, /refill: \(latest\) => \{\n\s+const now = latestXp\.current;/);
  // Brim + gold hold + drain end before the driver refills.
  const hold = Number(/const GOLD_HOLD_MS = (\d+);/.exec(bar)[1]);
  const drain = Number(/const DRAIN_MS = (\d+);/.exec(bar)[1]);
  assert.ok(520 + hold + drain <= 1400, 'drain ends before the refill');
  assert.match(read('src/components/xpPotionModel.ts'), /BURST_AT_MS = 520;[\s\S]*REFILL_AT_MS = 1400/);
  // Stars stay in their lane: never more than PAD_TOP above the bar.
  const padTop = Number(/const PAD_TOP = (\d+);/.exec(bar)[1]);
  const sparks = [...bar.matchAll(/\{ a: (-?[\d.]+), d: (\d+), s: ([\d.]+) \}/g)].map((m) => m.slice(1).map(Number));
  assert.ok(sparks.length >= 5);
  const innerHalf = (28 - 2 * 5.5) / 2;
  for (const [a, d, size] of sparks) {
    const above = -Math.sin(a) * d - innerHalf - 5.5 + size; // star top above the bar top
    assert.ok(above <= padTop, `star at ${a} reaches ${above.toFixed(1)} pt above the bar`);
    assert.ok(above <= 18, 'never reaches the title pill');
  }
});

test('XP numbers format on the UI thread', () => {
  const { groupDigits } = require('./helpers/ts-module.cjs').loadTs('src/components/xpPotionModel.ts');
  assert.equal(groupDigits(0), '0');
  assert.equal(groupDigits(760), '760');
  assert.equal(groupDigits(4600), '4,600');
  assert.equal(groupDigits(1234567.4), '1,234,567');
});

test('Social chest: squash on press, lid pop, wiggle, stars, haptic, Chris sounds, then the sheet', () => {
  const chest = read('src/screens/threads/ChestButton.tsx');
  assert.match(chest, /onPressIn=\{pressIn\}/);
  assert.match(chest, /sx\.value = withTiming\(1\.14/);
  assert.match(chest, /setLidOpen\(true\)/);
  assert.match(chest, /chest_open_empty\.png/, 'an empty open chest, never the coin pile');
  assert.doesNotMatch(chest, /chestOpen|chest_opened|reveal\.mp3/);
  assert.match(chest, /if \(locked\.current\) return;\n\s+locked\.current = true;/, 'one tap owns the beat: no stacked sounds');
  assert.match(chest, /playSfx\(CHEST_SHUT_CUE/, 'the lid shuts with a tick');
  assert.match(chest, /Haptics\.impactAsync\('medium'\)/);
  const delay = Number(/CHEST_OPEN_DELAY_MS = (\d+);/.exec(chest)[1]);
  assert.ok(delay >= 150 && delay <= 260, 'the pop reads first, the sheet still feels instant');
  assert.match(chest, /CHEST_OPEN_CUE = 'fx\.hit'/, "Chris's clack, a shipped cue");
  assert.match(chest, /if \(!reduced\) \{\n\s+lift\.value/, 'Reduce Motion: no hop or stars');
  const social = read('src/screens/SocialScreen.tsx');
  assert.match(social, /<ChestButton open=\{shortcuts\} onPress=\{\(\) => setShortcuts\(true\)\} label="More" accessibilityLabel="More"/);
});

test('every Social tap clicks once: PressScale clicks by default, actions with their own sound opt out', () => {
  const look = read('src/screens/threads/socialLook.tsx');
  assert.match(look, /sound = 'tap'/);
  assert.match(look, /if \(sound === 'tap'\) playSfx\(PRESS_CUE/, 'preloaded cue, no file load per tap');
  assert.match(look, /if \(!onPress\) return; \/\/ nothing happens: no fake click/);
  assert.match(look, /if \(reduced\) dim\.value = withTiming\(0\.7/, 'Reduce Motion still shows the press');
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
