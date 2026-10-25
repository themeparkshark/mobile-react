'use strict';
/**
 * Wow lane wow-games, wave 5 round 3: the start runs on one anchored UI-thread clock (every number and GO is
 * drawn, play opens on GO's own frame, the demo pill is gone before the 3), the card's money frame is a gold
 * ray fan with coins flying into the +N, a special card gets a rare extra, the flame chip shows the next
 * flame to grow into, and the exit pad is a 60 pt round button.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

/** Run the shell's frame logic over a list of frame gaps; returns what each frame drew and fired. */
function simulateStart(gm, steps, lead, gaps) {
  const ats = steps.map((s) => s.at);
  const from = ats[0];
  let t = from - lead;
  let next = 0;
  const frames = [];
  let first = true;
  for (const gap of gaps) {
    t = gm.advanceCountClock(t, first ? null : gap);
    first = false;
    const drawn = t >= from && t < gm.COUNT_END_MS ? t : -1;
    let fired = null;
    if (next < ats.length && t >= ats[next]) { fired = next; next += 1; }
    frames.push({ t, drawn, index: gm.countPose(drawn, false, false).index, fired });
    if (t >= gm.COUNT_END_MS && next >= ats.length) break;
  }
  return frames;
}

test('the start clock: a stalled frame clock slows the count, it never skips 1 or GO', () => {
  const gm = loadTs('src/gamekit/core/gameMoments.ts');
  assert.equal(gm.COUNT_MAX_STEP_MS, 100);
  assert.equal(gm.advanceCountClock(0, null), 0, 'the first frame after a start moves nothing');
  assert.equal(gm.advanceCountClock(0, 16.7), 16.7);
  assert.equal(gm.advanceCountClock(0, 2000), 100, 'a 2 s stall moves the clock one capped step');
  const steps = gm.countSteps('full', false);
  const lead = gm.COACH_LEAD_MS + gm.COACH_EXIT_MS;
  // The w5r2 release failure: frames at 60 Hz, then a 2 s stall right after the 2.
  const gaps = [];
  for (let i = 0; i < 400; i++) gaps.push(i === 150 ? 2000 : i % 37 === 0 ? 190 : 16.7);
  const frames = simulateStart(gm, steps, lead, gaps);
  const firedOrder = frames.filter((f) => f.fired != null).map((f) => f.fired);
  assert.deepEqual(firedOrder, [0, 1, 2, 3], '3, 2, 1, GO each fire once, in order');
  for (let i = 0; i < 4; i++) {
    const own = frames.filter((f) => f.index === i).length;
    assert.ok(own >= 3, `step ${i} is drawn on ${own} frames`);
    const fireFrame = frames.find((f) => f.fired === i);
    assert.equal(fireFrame.index, i, `step ${i} fires on a frame that draws it`);
  }
  // Nothing is drawn while the demo pill plays alone.
  const beforeThree = frames.filter((f) => f.t < steps[0].at);
  assert.ok(beforeThree.length > 0 && beforeThree.every((f) => f.drawn === -1));
});

test('the shell drives the start from that one clock, and play opens from the GO frame', () => {
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(shell, /const countFrame = useFrameCallback\(countFrameFn, false\);/);
  assert.match(shell, /else t = advanceCountClock\(t, frame\.timeSincePreviousFrame\);/);
  assert.match(shell, /if \(i < ats\.length && t >= ats\[i\]\) \{\n\s+cdNext\.value = i \+ 1;\n\s+runOnJS\(onCountStep\)\(i\);/, 'one step per frame');
  assert.match(shell, /if \(step\.at >= GO_AT_MS\) beginPlayRef\.current\(\);/);
  // No JS timer fires a count step any more (only the safety watchdog remains).
  assert.doesNotMatch(shell, /step\.at - from \+ lead/);
  assert.match(shell, /expected \* 3 \+ COUNT_WATCHDOG_MS/);
  // The demo pill leaves on the same clock, before the 3: it is fully gone at the 3's first frame.
  assert.match(shell, /const lead = hasDemoRef\.current && !quick \? COACH_LEAD_MS \+ COACH_EXIT_MS : 0;/);
  assert.match(shell, /cdPillExitAt\.value = lead > 0 \? from - COACH_EXIT_MS : NO_PILL_EXIT;/);
  assert.match(shell, /const p = Math\.min\(1, Math\.max\(0, \(t - exitAt\) \/ COACH_EXIT_MS\)\);/);
  assert.match(shell, /opacity: fieldIn\.value \* \(1 - pillOut\.value\),/);
  // A hold stops the clock; the GO tail keeps running over live play.
  assert.match(shell, /if \(!startedRef\.current\) stopCountStage\(\);/);
  assert.match(shell, /cdLive\.value = false;\n\s+countFrame\.setActive\(false\);/);
  // The frame callback is memoized, so a re-render never re-registers it.
  assert.match(shell, /const countFrameFn = useCallback\(\(frame: FrameInfo\) => \{\n\s+'worklet';/);
});

test('card money frame: a gold ray fan behind the +N and coins into it (no hard rim), Battery Saver and Dim Flashing Lights respected', () => {
  const ov = read('src/games/whack/ui/Overlays.tsx');
  assert.doesNotMatch(ov, /RIM_FLASH|rimGlow|styles\.rim\b/, 'the hard gold rectangle is gone');
  assert.match(ov, /<GoldBurst size=\{CARD_FAN\.size\} amount=\{fan\} bloom=\{fanBloom\} spin=\{false\} \/>/);
  assert.match(ov, /const fancy = !p\.reduced && !p\.lite;/);
  assert.match(ov, /if \(fancy && p\.burstScore > 0\) \{/);
  assert.match(ov, /if \(flash > 0\) \{\n\s+fanBloom\.value/, 'the white swell scales with the flash ceiling');
  assert.match(ov, /if \(!p\.lite\) shine\.value = withDelay/, 'Battery Saver skips the pad shine');
  assert.match(ov, /COIN_FLY = \{ max: 8, staggerMs: 45, flightMs: 380 \}/);
  // The coins land before the roll's gold pop (720 ms).
  assert.ok((8 - 1) * 45 + 380 <= 720);
  assert.doesNotMatch(ov, /withRepeat/, 'everything on the card is finite');
  const wh = read('src/games/whack/WhackAShark.tsx');
  assert.match(wh, /coinFly=\{momentParticles\(COIN_FLY\.max, budget, reducedMotion\)\}/);
  assert.match(wh, /lite=\{budget\.lowPower \|\| !budget\.animate\}/);
  assert.match(wh, /flash=\{flashPeak\(isDimFlashingLightsEnabled\(\), reducedMotion\)\}\n\s+lite=/);
});

test('the come-back goal and the special card: the next flame size, and a rare extra on a new record', () => {
  const ov = read('src/games/whack/ui/Overlays.tsx');
  const grab = (re) => { const m = re.exec(ov); assert.ok(m, `missing ${re}`); return m[0].replace(/^export /, ''); };
  const src = [
    grab(/export const FLAME_SIZES = \[[^\]]*\] as const;/).replace(' as const', ''),
    grab(/export function streakFlameTier\(streak: number\): number \{[\s\S]*?\n\}/),
    grab(/export function nextFlameGoal\(record: number \| null \| undefined\): number \| null \{[\s\S]*?\n\}/),
  ].join('\n').replace(/\((\w+): number\): number/g, '($1)').replace(/\(record: number \| null \| undefined\): number \| null/, '(record)');
  // eslint-disable-next-line no-new-func
  const h = new Function(`${src}\nreturn { FLAME_SIZES, streakFlameTier, nextFlameGoal };`)();
  assert.deepEqual([0, 2, 3, 5, 6, 9, 10, 20].map(h.streakFlameTier), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.equal(h.nextFlameGoal(null), 23);
  assert.equal(h.nextFlameGoal(0), 23);
  assert.equal(h.nextFlameGoal(2), 34);
  assert.equal(h.nextFlameGoal(3), null, 'the biggest flame has no goal left');
  assert.match(ov, /accessibilityLabel="Your next flame size to grow"/);
  assert.match(ov, /\{p\.special && fancy && p\.burstScore > 0 \? <SparkleBurst progress=\{extra\} count=\{10\} radius=\{130\} \/> : null\}/);
  const wh = read('src/games/whack/WhackAShark.tsx');
  assert.match(wh, /const FLAME_RECORD_KEY = '@whack\/flame_record';/);
  assert.match(wh, /const newFlame = flameRecord != null && flameTier > flameRecord;/);
  assert.match(wh, /const passedBest = aheadNow && !passedBestRef\.current;/, 'passing your best is special once per run');
  assert.match(wh, /special: newFlame \|\| passedBest \|\|/);
  // No clocks, no countdowns, no words on the goal.
  assert.doesNotMatch(ov, /tomorrow|hours left|ends in/i);
});

test('the exit pad: a 60 pt round trophy button set clear of the GO pads', () => {
  const ov = read('src/games/whack/ui/Overlays.tsx');
  assert.match(ov, /bank: \{ marginTop: 18, width: 60, height: 60, alignItems: 'center', justifyContent: 'center',\n\s+borderRadius: 30,/);
  assert.match(ov, /<GameIcon name="trophy" size=\{32\} \/>\n\s+<View style=\{styles\.bankCheck\}><GameIcon name="check" size=\{18\} \/><\/View>/);
});
