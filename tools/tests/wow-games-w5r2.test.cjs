'use strict';
/**
 * Wow lane wow-games, wave 5 round 2: an idle breather card asks the UI thread for nothing (every frame
 * callback sleeps), the first start shows one callout at a time (the picture demo, then 3-2-1), the card
 * lands as a real event (gold rim, climbing number from the first frame, flame puff), the veil keeps the
 * board in its own colours, and the results scrim never lands before its card.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

test('frame callbacks follow their active flag after mount (useFrameCallback reads autostart only once)', () => {
  for (const f of ['src/gamekit/perf/usePerfTier.ts', 'src/gamekit/perf/useThermal.ts']) {
    const s = read(f);
    assert.match(s, /const frame = useFrameCallback\(\(info\) => \{/, f);
    assert.match(s, /const active = opts\.active !== false;\n\s+useEffect\(\(\) => \{\n\s+frame\.setActive\(active\);\n\s+\}, \[active, frame\]\);/, f);
  }
  const cam = read('src/gamekit/fx/useCamera.ts');
  assert.match(cam, /walking = false, active = true \}: CameraOptions/);
  assert.match(cam, /frame\.setActive\(active\);/);
  const fx = read('src/gamekit/fx/FxStage.tsx');
  assert.match(fx, /textMinY = 0, asleep = false \}/);
  assert.match(fx, /frame\.setActive\(!asleep\);/);
  const st = read('src/gamekit/fx/StampLayer.tsx');
  assert.match(st, /minY = 40, maxY, asleep = false \}/);
  assert.match(st, /layerFrame\.setActive\(!asleep\);/);
});

test('Whack: a settled card puts the game clock and every fx layer to sleep, and any start wakes them', () => {
  const rt = read('src/games/whack/useWhackRuntime.ts');
  assert.match(rt, /if \(!on\) clock\.setActive\(true\);/);
  assert.match(rt, /\}\)\(on\);\n\s+if \(on\) clock\.setActive\(false\);/, 'the clock sleeps after the rest flag is set on the UI thread');
  assert.match(rt, /start: \(s: WhackSim[^\n]*\n\s+clock\.setActive\(true\);/, 'a Burst start wakes the clock');
  assert.match(rt, /wake: \(stepMs: number\) => \{\n\s+clock\.setActive\(true\);/, 'GO wakes the clock');
  assert.match(rt, /r\.frameWall = 0;/, 'the first frame after a rest never carries the idle time');
  const wh = read('src/games/whack/WhackAShark.tsx');
  assert.match(wh, /const \[asleep, setAsleep\] = useState\(false\);/);
  assert.match(wh, /usePerfTier\(\{ active: visible && !asleep \}\)/);
  assert.match(wh, /useThermal\(\{ active: visible && !asleep \}\)/);
  assert.match(wh, /CAMERA_PRESETS\.whack, active: !asleep \}\)/);
  assert.match(wh, /onArrive=\{onCoinsArrive\} asleep=\{asleep\}/);
  assert.match(wh, /minY=\{L\.hudH \+ 8\} asleep=\{asleep\}/);
  assert.equal((wh.match(/runtime\.setRest\(/g) || []).length, 1, 'every rest goes through restBoard, so the layers and the board sleep together');
  assert.match(wh, /const restBoard = useCallback\(\(on: boolean\) => \{\n\s+runtime\.setRest\(on\);\n\s+setAsleep\(on\);/);
  assert.match(wh, /restTimer\.current = null;\n\s+setAsleep\(false\);/, 'GO (clearRest) wakes the layers');
  assert.match(wh, /setAsleep\(false\);\n\s+runtime\.wake\(STAGGER\.stepMs\);/, 'a fresh start wakes the layers');
});

test('first start: one callout at a time (the demo alone, then it shrinks away as the 3 lands)', () => {
  const gm = loadTs('src/gamekit/core/gameMoments.ts');
  assert.equal(gm.COACH_LEAD_MS, 1100);
  assert.ok(gm.COACH_EXIT_MS <= 200);
  gm.resetCountStarts();
  assert.equal(gm.countStartsOf('whack'), 0);
  gm.noteCountStart('whack');
  assert.equal(gm.countStartsOf('whack'), 1);
  gm.resetCountStarts();
  const shell = read('src/gamekit/GameShellV2.tsx');
  // w5r3: the lead now also covers the pill's exit, so the 3 lands only once the pill is gone (one anchored UI clock).
  assert.match(shell, /const lead = hasDemoRef\.current && !quick \? COACH_LEAD_MS \+ COACH_EXIT_MS : 0;/, 'repeat starts skip the demo');
  assert.match(shell, /cdPillExitAt\.value = lead > 0 \? from - COACH_EXIT_MS : NO_PILL_EXIT;/, 'the pill leaves just before the 3');
  assert.match(shell, /const pillShown = phase === 'countdown' && !\(hasDemo && pillGone\);/);
  assert.match(shell, /\{pillShown \? \(/, 'once gone, the demo is unmounted (its loop stops)');
  assert.match(shell, /if \(!pillShown \|\| !visible \|\| reducedMotion\) \{ cancelAnimation\(pillT\);/, 'the pill breath stops with it');
  // The demo plays its bonk and its "no" beats inside the lead.
  const coach = read('src/games/whack/ui/CoachDemo.tsx');
  const loop = Number(/export const COACH_LOOP_MS = (\d+);/.exec(coach)[1]);
  assert.ok(0.72 * loop <= gm.COACH_LEAD_MS, 'the X has stamped before the pill leaves');
});

test('results: the scrim fades in with the card (never a navy board with no card on it)', () => {
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(shell, /const resultsScrimStyle = useAnimatedStyle\(\(\) => \(\{ opacity: resultsOpacity\.value \}\)\);/);
  assert.match(shell, /<View style=\{\[styles\.overlay, styles\.scrimNone\]\} pointerEvents="box-none">/);
  assert.match(shell, /reducedMotion \? null : resultsScrimStyle\]\} \/>/, 'Reduce Motion keeps the plain still scrim');
  assert.match(shell, /scrimFill: \{ \.\.\.StyleSheet\.absoluteFillObject, backgroundColor: 'rgba\(8,56,128,0\.45\)' \}/);
});

test('breather: the card lands as an event and the number climbs from its first frame', () => {
  const ov = read('src/games/whack/ui/Overlays.tsx');
  assert.match(ov, /BREATHER_ROLL = \{ landMs: 0, ms: 720/);
  assert.match(ov, /BREATHER_ROLL_QUICK = \{ landMs: 0, ms: 460/);
  assert.match(ov, /fan\.value = withDelay\(enterIn \+ CARD_FAN\.at, withSequence\(/, 'the gold fan (w5r3, was a rim) runs on the card\'s UI clock');
  assert.match(ov, /<FlamePuff size=\{streakFlameSize\(p\.bestStreak \?\? 0\)\} reduced=\{p\.reduced\}\n\s+at=\{enterIn \+ HEADS_START_MS \+ BONK_HEADS \* HEAD_STEP_MS \+ FLAME_PUFF_AFTER_MS\} \/>/,
    'the flame puffs after the last head');
  assert.match(ov, /cardScore: \{ fontFamily: 'Shark', fontSize: 54,/);
  // The veil is a light frost, not a grey or navy wash.
  const veil = /export const BREATHER_VEIL = 'rgba\((\d+),(\d+),(\d+),([0-9.]+)\)';/.exec(ov);
  assert.ok(veil, 'veil colour');
  const [r, g, b, a] = veil.slice(1).map(Number);
  assert.ok(r >= 220 && g >= 240 && b >= 250, 'near-white blue frost');
  assert.ok(a <= 0.2, 'low alpha keeps the board bright');
  assert.match(ov, /dim: \{ \.\.\.StyleSheet\.absoluteFillObject, backgroundColor: BREATHER_VEIL \}/);
  // Everything on the card is finite: no loops while it waits.
  assert.doesNotMatch(ov, /withRepeat/);
  assert.match(ov, /if \(!p\.lite\) shine\.value = withDelay\(PAD_SHINE\.delayMs, withTiming\(1, \{ duration: PAD_SHINE\.ms/);
  assert.equal((ov.match(/<View pointerEvents="none" style=\{styles\.shineClip\}>/g) || []).length, 3, 'each pad shines once, clipped inside its own edge');
  // The gold fan (w5r3, was the rim) and the roll both land inside the first 800 ms of the card.
  const fan = /CARD_FAN = \{ at: (\d+), inMs: (\d+), holdMs: (\d+), outMs: (\d+),/.exec(ov).slice(1).map(Number);
  assert.ok(fan[0] + fan[1] + fan[2] + fan[3] <= 800);
});

test('Whack: the idle-card probe window opens after every finite card beat, and no 4 Hz poll runs under a card', () => {
  const wh = read('src/games/whack/WhackAShark.tsx');
  assert.match(wh, /const PADS_SETTLED_MS = 3600;/);
  assert.match(wh, /if \(PERF_GRAPH\) setTimeout\(\(\) => \{ if \(runToken\.current === token\) perf\.reset\(\); \}, landIn \+ padsAfter\(curtainKind\.current\) \+ PADS_SETTLED_MS\);/);
  // The pads' own beats end inside PADS_SETTLED_MS: pop (spring), the shine, then one pulse at 2600 ms (260 + 260).
  const ov = read('src/games/whack/ui/Overlays.tsx');
  const shine = /PAD_SHINE = \{ delayMs: (\d+), ms: (\d+) \}/.exec(ov).slice(1).map(Number);
  assert.ok(shine[0] + shine[1] < 3600);
  assert.match(ov, /withDelay\(2600, withTiming\(1\.06, \{ duration: 260, easing: EASE\.out \}\)\),\n\s+withTiming\(1, \{ duration: 260, easing: EASE\.inOut \}\),/);
  assert.ok(400 + 2600 + 260 + 260 <= 3600);
  assert.match(wh, /if \(!visible \|\| phase !== 'play'\) return undefined;\n\s+const iv = setInterval\(\(\) => \{\n\s+\/\/ The light snapshot/);
});
