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
  assert.match(bar, /if \(!active && !shining && quiet\.value > SLEEPY_AFTER_S\) \{[\s\S]{0,80}runOnJS\(sleep\)\(\);/, 'a quiet bar stops its clock (between shines)');
  assert.match(bar, /function playKind\(kind: PotionTransition, next: PotionState\) \{\n\s+wake\(\);/, 'any change wakes it');
  assert.match(bar, /if \(!active && !shining && acc\.value < IDLE_FRAME_MS\) return;/, 'calm idle frame rate');
  assert.match(bar, /createPotionDriver/, 'same level-up rules as the potion (tested in profile-v2)');
  const card = read('src/components/Experience.tsx');
  assert.match(card, /const barTransition = useCallback\(\(kind: PotionTransition\) => handlers\.current\.onTransition\(kind\), \[\]\)/);
});

test('XP level up: gold hold with a pulse, bounded stars, LEVEL UP!, refill shows the latest XP', () => {
  const bar = read('src/components/XpBar.tsx');
  const card = read('src/components/Experience.tsx');
  assert.match(bar, /if \(banner\.value\) return 'LEVEL UP!'/);
  assert.match(card, /HapticPatterns\.levelUp\(\)/);
  assert.match(card, /playSfx\('fx\.reward'\)/, 'preloaded reward cue');
  // The payoff lands on the first full frame (UI thread), and the refill waits for the drain.
  assert.match(bar, /withTiming\(1, \{ duration: BURST_AT_MS, easing: Easing\.in\(Easing\.quad\) \}, \(finished\) => \{[\s\S]*?\/\/ First full frame[\s\S]*?runOnJS\(onBrim\)\(token\)/);
  assert.match(bar, /const now = gate\.due\(latest\);/);
  assert.match(bar, /const now = gate\.drained\(token, \{ level, progress: progressOf\(latestXp\.current\) \}\);/);
  assert.doesNotMatch(bar, /pulse\.value|scale: pulse/, 'no scaling pulse that could touch the badge or cap');
  assert.match(bar, /if \(r < 4\) continue;/, 'no outline-only specks');
  assert.match(bar, /if \(!finished\) return; \/\/ a cancelled run-up never pays out/);
  assert.match(bar, /if \(paused\) return;\n[\s\S]{0,80}driver\.update\(next, reduced\)/, 'a hidden profile holds the level up until it is seen');
  assert.match(card, /announceForAccessibility\(`Level \$\{level\}!`\)/);
  assert.match(card, /toValue: 1\.3, duration: 140/, 'badge pop');
  // The refill reads the latest props, so a refetch during the celebration never leaves stale numbers.
  assert.match(bar, /function startRefill\(latest: PotionState\) \{\n\s+wake\(\);\n\s+const now = latestXp\.current;/);
  // Brim + gold hold + drain end before the driver refills.
  const hold = Number(/const GOLD_HOLD_MS = (\d+);/.exec(bar)[1]);
  const drain = Number(/const DRAIN_MS = (\d+);/.exec(bar)[1]);
  assert.ok(520 + hold + drain <= 1400, 'drain ends before the refill');
  assert.match(read('src/components/xpPotionModel.ts'), /BURST_AT_MS = 520;[\s\S]*REFILL_AT_MS = 1400/);
  // Stars stay in their lane: a row above the bar end, 18 pt apart (no overlap), never more than 18 pt up.
  const padTop = Number(/const PAD_TOP = (\d+);/.exec(bar)[1]);
  const sparks = [...bar.matchAll(/\{ dx: (-?[\d.]+), dy: (-?[\d.]+), s: ([\d.]+) \}/g)].map((m) => m.slice(1).map(Number));
  assert.ok(sparks.length >= 5);
  for (const [, dy, size] of sparks) {
    const above = -dy + size * 1.15; // at the peak of the grow overshoot
    assert.ok(above <= Math.min(18, padTop), `star reaches ${above} pt above the bar`);
  }
  for (let i = 1; i < sparks.length; i++) {
    const [x1, y1, s1] = sparks[i - 1];
    const [x2, y2, s2] = sparks[i];
    assert.ok(Math.hypot(x2 - x1, y2 - y1) >= s1 + s2, 'neighbouring stars never overlap');
  }
  const starMs = Number(/const STAR_MS = (\d+);/.exec(bar)[1]);
  assert.ok(starMs <= Number(/const GOLD_HOLD_MS = (\d+);/.exec(bar)[1]), 'the stars are gone before the drain');
  assert.match(bar, /banner\.value = withDelay\(BANNER_LAG_MS[^\n]*\n\s+flash\.value = 1;/, 'gold snaps on at the brim (no lime)');
  assert.match(bar, /flash\.value = 0;\n\s+if \(finished\) runOnJS\(onDrained\)/, 'gold snaps off as the bar empties (no olive)');
  assert.match(bar, /if \(busy \|\| Date\.now\(\) - lastWake\.current < 250\) \{ quiet\.value = 0; return; \}/, 'a change in the frame before sleep keeps the bar awake');
  assert.doesNotMatch(bar, /BURST_AT_MS - 40/, 'no gold pre-fade over green');
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
  assert.match(social, /<ChestButton open=\{shortcuts\} onPress=\{\(\) => \{ setTileClosed\(false\); setShortcuts\(true\); \}\} label="More" accessibilityLabel="More"/);
  assert.match(social, /<SocialSheet\n\s+visible=\{shortcuts\}/, 'the More sheet slides on the UI thread');
  assert.doesNotMatch(social, /react-native-modal/);
  const sheet = read('src/screens/threads/SocialSheet.tsx');
  assert.match(sheet, /Gesture\.Pan\(\)/);
  assert.match(sheet, /onDismiss=/, 'shortcuts run after the native modal is gone (iOS Safari/push)');
  assert.match(social, /quietClose=\{tileClosed\}/, 'a tile tap already clicked: no second sound when the sheet closes');
  assert.match(chest, /if \(reduced\) \{ dim\.value = withTiming\(0\.7/, 'Reduce Motion press dim');
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

test('level-up gate: refill once, the moment the drain ends, with the latest data', () => {
  const { createCelebrationGate } = require('./helpers/ts-module.cjs').loadTs('src/components/xpPotionModel.ts');
  const g = createCelebrationGate();
  assert.equal(g.celebrating, false);
  const t = g.start();
  assert.equal(g.celebrating, true);
  // The drain ends first: refill now; the driver's later refill time does nothing.
  assert.deepEqual(g.drained(t, { level: 6, progress: 0.2 }), { level: 6, progress: 0.2 });
  assert.equal(g.due({ level: 6, progress: 0.3 }), null);
  assert.equal(g.celebrating, false);
  // The driver's time arrives first: wait for the drain, then refill once.
  const t2 = g.start();
  assert.equal(g.due({ level: 7, progress: 0.1 }), null);
  assert.deepEqual(g.drained(t2, { level: 7, progress: 0.15 }), { level: 7, progress: 0.15 });
  assert.equal(g.fallback(t2), null, 'no second refill');
  // The drain never reports: the fallback refills with what the driver gave.
  const t3 = g.start();
  g.due({ level: 8, progress: 0.4 });
  assert.deepEqual(g.fallback(t3), { level: 8, progress: 0.4 });
  // A stale drain from an old celebration, or anything after unmount, is ignored.
  const t4 = g.start();
  assert.equal(g.drained(t3, { level: 8, progress: 0.5 }), null);
  g.cancel();
  assert.equal(g.drained(t4, { level: 8, progress: 0.5 }), null);
});

test('the bar holds changes while hidden and never replays on return', () => {
  const { shouldPlay } = require('./helpers/ts-module.cjs').loadTs('src/components/xpPotionModel.ts');
  const a = { level: 5, progress: 0.4 };
  const b = { level: 6, progress: 0.1 };
  assert.equal(shouldPlay(true, a, b), false, 'hidden: hold the level up');
  assert.equal(shouldPlay(false, a, b), true, 'seen again: play it');
  assert.equal(shouldPlay(false, b, { ...b }), false, 'nothing new on return: no snap, no replay');
  assert.equal(shouldPlay(false, null, a), true, 'first view');
  const card = read('src/components/Experience.tsx');
  assert.match(card, /if \(own && !hidden\) \{/, 'no sound or haptic for a level up that lands on a hidden screen');
  assert.doesNotMatch(card, /useEffect\(\(\) => \{\n\s+seen\.set/, 'last seen is recorded when the bar plays, not on data change');
});

test('driver + gate on a fake clock: a level up refills once, at the drain, with the latest data', () => {
  const { createPotionDriver, createCelebrationGate, BURST_AT_MS, REFILL_AT_MS } = require('./helpers/ts-module.cjs').loadTs('src/components/xpPotionModel.ts');
  const DRAIN_END = 1380; // BURST_AT_MS + GOLD_HOLD_MS + DRAIN_MS in XpBar
  for (const drainFirst of [true, false]) {
    let now = 0;
    let queue = [];
    const at = (ms, fn) => { const h = { at: ms, fn }; queue.push(h); return h; };
    const run = (until) => { for (;;) { queue.sort((a, b) => a.at - b.at); const n = queue[0]; if (!n || n.at > until) break; queue.shift(); now = n.at; n.fn(); } now = until; };
    const gate = createCelebrationGate();
    const refills = [];
    let latestData = { level: 6, progress: 0.1 };
    const driver = createPotionDriver({ level: 5, progress: 0.8 }, {
      setTimer: (fn, ms) => at(now + ms, fn), clearTimer: (h) => { queue = queue.filter((x) => x !== h); },
      burst: () => {},
      play: (kind) => {
        if (kind !== 'levelUp') return;
        const t = gate.start();
        // The UI-thread drain callback (it lands a little before or after the driver's refill time).
        at(drainFirst ? DRAIN_END : REFILL_AT_MS + 30, () => { const r = gate.drained(t, latestData); if (r) refills.push(['drain', r]); });
      },
      refill: (latest) => { const r = gate.due(latest); if (r) refills.push(['driver', r]); },
    });
    assert.equal(driver.update({ level: 6, progress: 0.1 }, false), 'levelUp');
    run(BURST_AT_MS + 300);
    // A refetch mid celebration: deferred by the driver, shown by the refill.
    latestData = { level: 6, progress: 0.25 };
    assert.equal(driver.update(latestData, false), 'defer');
    run(3000);
    assert.equal(refills.length, 1, 'exactly one refill');
    assert.equal(refills[0][1].progress, 0.25, 'with the latest data');
    assert.equal(refills[0][0], 'drain', 'the refill always waits for the drain, whichever lands first');
    assert.equal(gate.celebrating, false);
  }
});
