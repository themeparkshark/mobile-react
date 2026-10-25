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

test('Whack: the last stretch of a Burst advances on wall time, covering the last 5 and the ticks\' lead', () => {
  const rt = read('src/games/whack/useWhackRuntime.ts');
  assert.match(rt, /const dt = s\.len - s\.t <= TRUE_TIME_MS \? \(c\.paused \? 0 : wallDt\) : fxDt;/);
  assert.match(rt, /const wallDt = r\.frameWall > 0 \? Math\.min\(WALL_CAP_MS, Math\.max\(0, now - r\.frameWall\)\) : 0;/,
    'the wall delta comes from Date.now, so a slow or throttled frame clock cannot stretch the last 5');
  assert.match(rt, /export const WALL_CAP_MS = 250;/);
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

test('FINISH! is on screen on its first frame (no empty sky band between the last 1 and the word)', () => {
  const motion = loadTs('src/ui/motion.ts');
  const gm = loadTs('src/gamekit/core/gameMoments.ts');
  assert.ok(gm.FINISH_FIRST_ALPHA >= 0.6);
  assert.ok(gm.finishPose(0, false).alpha >= gm.FINISH_FIRST_ALPHA, 'the zero frame already shows the word');
  assert.ok(gm.finishPose(0, true).alpha >= gm.FINISH_FIRST_ALPHA, 'Reduce Motion too (a fade from 0.7, no slam)');
  assert.equal(gm.finishPose(-1, false).alpha, 0, 'nothing before the beat');
  assert.equal(gm.finishPose(motion.DURATION.slam + 10, false).alpha, 1, 'full once landed');
});
