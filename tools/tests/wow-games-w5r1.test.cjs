'use strict';
/**
 * Wow lane wow-games, wave 5 round 1: Whack's last 5 seconds are true seconds, the beat log checks each
 * queued cue against the frame that stamps it, the breather reads as pictures, and frame-rate captures
 * carry a control probe.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const clock = loadTs('src/gamekit/core/clock.ts');

test('clock: lastWallDt is the raw frame time, untouched by hit-stop or slow-mo, and 0 while paused', () => {
  const c = clock.createClock();
  clock.hitStop(c, 110, { holdSim: true, force: true });
  clock.advanceClock(c, 40);
  assert.equal(c.simMs, 0, 'the golden freeze still holds the sim');
  assert.equal(c.lastWallDt, 40, 'but the wall delta is the whole frame');
  const s = clock.createClock();
  clock.slowMo(s, 0.35, 280, 120);
  clock.advanceClock(s, 100);
  assert.ok(Math.abs(s.lastFxDt - 35) < 1e-6);
  assert.equal(s.lastWallDt, 100);
  clock.advanceClock(s, 400);
  assert.equal(s.lastWallDt, s.cfg.maxFrameMs, 'a background gap is clamped like every other delta');
  clock.pauseClock(s);
  clock.advanceClock(s, 16);
  assert.equal(s.lastWallDt, 0, 'paused: no time passes');
});

test('Whack: the last stretch of a Burst advances on wall time, covering the last 5 and the ticks\' lead', () => {
  const rt = read('src/games/whack/useWhackRuntime.ts');
  assert.match(rt, /const dt = s\.len - s\.t <= TRUE_TIME_MS \? c\.lastWallDt : fxDt;/);
  assert.match(rt, /r\.acc \+= dt \* f;/);
  assert.doesNotMatch(rt, /r\.acc \+= fxDt \* f;/, 'the sim no longer rides the presentation clock to the end');
  const trueMs = Number(/export const TRUE_TIME_MS = (\d+);/.exec(rt)[1]);
  const wh = read('src/games/whack/WhackAShark.tsx');
  const lead = Number(/const LAST5_LEAD_MS = (\d+);/.exec(wh)[1]);
  assert.ok(trueMs >= 5000 + lead, `TRUE_TIME_MS ${trueMs} covers 5 s plus the ${lead} ms lead`);
});

test('Whack beat log (dev only): each queued cue prints when it is due and the UI frame that stamps its second', () => {
  const wh = read('src/games/whack/WhackAShark.tsx');
  assert.match(wh, /const SYNC_LOG = __DEV__ && process\.env\.EXPO_PUBLIC_AUDIO_LOG === '1';/);
  assert.match(wh, /due=\$\{\(Date\.now\(\) \+ delayMs\) % 100000\}/);
  assert.match(wh, /\[wow-cross\] \$\{uiAt % 100000\} sec=\$\{sec\}/);
  assert.match(wh, /if \(!SYNC_LOG\) return -1;/, 'the cross reaction does nothing outside the dev beat log');
});

// The picture-stat helpers are plain functions: evaluate them straight from the source.
function overlayHelpers() {
  const ov = read('src/games/whack/ui/Overlays.tsx');
  const grab = (re) => { const m = re.exec(ov); assert.ok(m, `missing ${re}`); return m[0].replace(/^export /, ''); };
  const src = [
    grab(/export const BONK_HEADS = \d+;/),
    grab(/export const BONKS_PER_HEAD = \d+;/),
    grab(/export function bonkHeadsLit\(bonks: number\): number \{[\s\S]*?\n\}/),
    grab(/export function streakFlameSize\(streak: number\): number \{[\s\S]*?\n\}/),
  ].join('\n').replace(/\((\w+): number\): number/g, '($1)');
  // eslint-disable-next-line no-new-func
  return new Function(`${src}\nreturn { BONK_HEADS, bonkHeadsLit, streakFlameSize };`)();
}

test('breather picture stats: shark heads light up with the bonks (never more than 5), the flame grows by combo tier', () => {
  const h = overlayHelpers();
  assert.equal(h.BONK_HEADS, 5);
  assert.equal(h.bonkHeadsLit(0), 0, 'no bonks, no lit heads');
  assert.equal(h.bonkHeadsLit(1), 1, 'one bonk already lights a head');
  assert.equal(h.bonkHeadsLit(12), 3);
  assert.equal(h.bonkHeadsLit(80), 5, 'capped at the row');
  const sizes = [1, 3, 6, 10, 25].map(h.streakFlameSize);
  assert.deepEqual(sizes, [18, 23, 28, 34, 34]);
});

test('breather: the shark-head row and the combo flame replace the number chips; heads pop on the card clock', () => {
  const ov = read('src/games/whack/ui/Overlays.tsx');
  assert.match(ov, /p\.bonks != null \? \(/);
  assert.match(ov, /accessibilityLabel=\{`Sharks bonked: \$\{p\.bonks\}`\}/);
  assert.match(ov, /<GameIcon name="streak" size=\{streakFlameSize\(p\.bestStreak \?\? 0\)\} \/>/);
  assert.match(ov, /at=\{enterIn \+ HEADS_START_MS \+ i \* HEAD_STEP_MS\}/, 'heads pop on the UI-thread delay from the card landing');
  assert.match(ov, /v\.value = withDelay\(at, withSequence\(/);
  const wh = read('src/games/whack/WhackAShark.tsx');
  assert.match(wh, /bonks: b\.result\.hits,\s*bestStreak: b\.result\.maxStreak,/);
  assert.match(wh, /bonks=\{breather\.bonks\}\s*bestStreak=\{breather\.bestStreak\}/);
});

test('frame-rate captures: a control probe on the still tester list, and the idle card starts a fresh window', () => {
  const tester = read('src/screens/MiniGameTesterScreen.tsx');
  assert.match(tester, /const WHACK_PERF_CONTROL = process\.env\.EXPO_PUBLIC_MOTION_CAPTURE === 'Whack' && process\.env\.EXPO_PUBLIC_WHACK_PERF === '1';/);
  assert.match(tester, /\{WHACK_PERF_CONTROL \? <PerfControl \/> : null\}/);
  const wh = read('src/games/whack/WhackAShark.tsx');
  assert.match(wh, /if \(PERF_GRAPH\) perf\.reset\(\);/);
  assert.match(wh, /const PERF_GRAPH = \(__DEV__ \|\| WHACK_CAPTURE\) && process\.env\.EXPO_PUBLIC_WHACK_PERF === '1';/, 'store builds never draw the graph');
});
