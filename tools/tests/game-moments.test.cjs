const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/game-moments.test.cjs
// In-game moment language (wow-games lane): the 3-2-1-GO, the last 5 seconds, combo tiers, one callout at a time.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const gm = loadTs('src/gamekit/core/gameMoments.ts');
const plain = v => JSON.parse(JSON.stringify(v));
const motion = loadTs('src/ui/motion.ts');

test('3, 2, 1 land at 0, 700, 1400 ms; GO at 2100 opens play; the tail is gone by 2600', () => {
  assert.deepEqual(plain(gm.COUNT_STEPS.map(s => s.at)), [0, 700, 1400, 2100]);
  assert.equal(gm.GO_AT_MS, 2100);
  assert.equal(gm.COUNT_END_MS, 2600);
  assert.equal(gm.countPose(-1, false, false).index, -1);
  assert.equal(gm.countPose(2600, false, false).index, -1);
  assert.equal(gm.countPose(10, false, false).index, 0);
  assert.equal(gm.countPose(710, false, false).index, 1);
  assert.equal(gm.countPose(1410, false, false).index, 2);
  assert.equal(gm.countPose(2110, false, false).index, 3);
  assert.deepEqual(plain(gm.countSteps('go').map(s => s.label)), ['GO!']);
  assert.equal(gm.countSteps('none').length, 0);
});

test('each number slams from 1.6 to 1.0 in DURATION.slam, squashes by SLAM_SQUASH, then leaves to 0.8', () => {
  const start = gm.countPose(0, false, false);
  assert.ok(Math.abs(start.scale - 1.6) < 1e-6, `starts at 1.6, got ${start.scale}`);
  assert.equal(start.alpha, 0);
  const landed = gm.countPose(motion.DURATION.slam + 10, false, false);
  assert.equal(landed.scale, 1);
  assert.ok(Math.abs(landed.sx - (1 + motion.SLAM_SQUASH)) < 1e-9 && Math.abs(landed.sy - (1 - motion.SLAM_SQUASH)) < 1e-9, 'squash on landing');
  const held = gm.countPose(530, false, false);
  assert.equal(held.sx, 1);
  assert.equal(held.alpha, 1);
  assert.ok(held.ringAlpha < 0.2, 'the ring has faded by the hold');
  const leaving = gm.countPose(699, false, false);
  assert.ok(leaving.scale < 0.82 && leaving.alpha < 0.05, 'exits to 0.8 and gone');
  // Exits are faster than entrances' reading time: the hold is the longest beat.
  assert.ok(560 - (motion.DURATION.slam + 130) > 140 * 2);
});

test('3 is brand blue, 2 white, 1 gold, GO gold; the haptics climb tick, tick, tap, incoming', () => {
  const [three, two, one, go] = gm.COUNT_STEPS;
  assert.equal(three.fill.toLowerCase(), '#2aa9f5');
  assert.equal(two.fill.toLowerCase(), '#ffffff');
  assert.equal(one.fill, motion.GOLD_FX.rays);
  assert.equal(go.fill, motion.GOLD_FX.rays);
  assert.deepEqual(plain(gm.COUNT_STEPS.map(s => s.haptic)), ['tick', 'tick', 'tap', 'incoming']);
  assert.deepEqual(plain(gm.COUNT_STEPS.map(s => s.cue)), ['ui_tick', 'ui_tick', 'ui_tick_high', 'sh_go_horn']);
  assert.equal(go.variant, 'sh_whistle');
  assert.deepEqual(plain(gm.COUNT_STEPS.map(s => s.sfx)), ['countdown', 'countdown', 'countdown', 'go'], 'switch off: today\'s sounds');
});

test('GO pops past full size once (SPRING.pop), kicks the screen at most KICK.maxPt, never while walking or reduced', () => {
  let peak = 0;
  let kickPeak = 0;
  for (let t = 2100; t < 2450; t += 4) {
    const p = gm.countPose(t, false, false);
    peak = Math.max(peak, p.scale);
    kickPeak = Math.max(kickPeak, p.kick);
  }
  assert.ok(peak >= 1.18 && peak <= 1.35, `GO overshoot in the prize range, got ${peak.toFixed(3)}`);
  assert.ok(kickPeak > 2 && kickPeak <= motion.KICK.maxPt + 1e-9, `kick ${kickPeak}`);
  assert.equal(gm.countPose(2100 + motion.KICK.ms + 1, false, false).kick, 0, 'the kick is over inside KICK.ms');
  for (let t = 2100; t < 2600; t += 10) {
    assert.equal(gm.countPose(t, false, true).kick, 0, 'calm (walking) never kicks');
    assert.equal(gm.countPose(t, true, false).kick, 0, 'reduced never kicks');
  }
});

test('Reduce Motion: numbers fade with the same timings, no travel, no ring, no sparkles', () => {
  for (const t of [0, 50, 200, 650, 800, 1500, 2150, 2500]) {
    const p = gm.countPose(t, true, false);
    assert.equal(p.scale, 1);
    assert.equal(p.sx, 1);
    assert.equal(p.ringAlpha, 0);
    assert.equal(p.sparkle, 0);
  }
  assert.ok(gm.countPose(200, true, false).alpha === 1);
  assert.ok(gm.countPose(2, true, false).alpha < 0.05, 'fades in over 160 ms');
});

test('GO sparkles burst out, fall a little and fade (never vanish at full opacity)', () => {
  assert.equal(gm.GO_SPARKLES, 8);
  for (let k = 0; k < 8; k++) {
    const a = gm.goSparkle(k, 8, 0.1);
    const b = gm.goSparkle(k, 8, 0.6);
    const end = gm.goSparkle(k, 8, 1);
    assert.ok(Math.hypot(b.x, b.y) > Math.hypot(a.x, a.y), 'flies outward');
    assert.ok(end.alpha <= 0.001, 'faded at the end');
    assert.ok(b.alpha > 0 && b.alpha < 1, 'fading mid-flight');
  }
});

test('the last 5 seconds: gold, a tick and soft buzz per second, TIME! with the finisher at 0, nothing outside the window', () => {
  assert.equal(gm.finalSecondsBeat(6).second, null);
  assert.equal(gm.finalSecondsBeat(null).second, null);
  for (const s of [5, 4, 3, 2, 1]) {
    const b = gm.finalSecondsBeat(s);
    assert.equal(b.second, s);
    assert.equal(b.haptic, 'tick');
    assert.equal(b.cue, 'mm_clock_tick');
    assert.equal(b.variant, 'tv_heartbeat_soft');
    assert.ok(b.vignette > 0 && b.vignette <= 0.12);
  }
  const zero = gm.finalSecondsBeat(0);
  assert.equal(zero.haptic, 'finisher');
  assert.equal(zero.cue, 'sh_whistle');
  assert.equal(gm.FINAL_COLOR.hot, motion.GOLD_FX.rays, 'hot is gold, never red');
  assert.ok(!/ff6b5c|f44336|red/i.test(JSON.stringify(gm.FINAL_COLOR)));
  // The pill pulses to 1.15 and settles back to 1 within the second.
  let max = 0;
  for (let t = 0; t < 1000; t += 5) max = Math.max(max, gm.timerPulse(t));
  assert.ok(max >= 1.149 && max < 1.2, `pulse peak ${max}`);
  assert.ok(Math.abs(gm.timerPulse(999) - 1) < 0.01, 'back to rest before the next second');
  assert.equal(gm.finalVignette(0, 0.12), 0);
  assert.ok(Math.abs(gm.finalVignette(500, 0.12) - 0.12) < 1e-9, 'breathes to its peak mid-second');
});

test('combo tiers climb in size, colour, sparkles, haptic and pitch (x1, x2, x3, x5)', () => {
  const tiers = [1, 2, 3, 5].map(m => gm.comboTierStyle(m));
  assert.deepEqual(plain(tiers.map(t => t.size)), [1, 1.12, 1.25, 1.4]);
  assert.deepEqual(plain(tiers.map(t => t.haptic)), ['tap', 'goodHit', 'crit', 'feverStart']);
  for (let i = 1; i < tiers.length; i++) {
    assert.ok(tiers[i].sparkles >= tiers[i - 1].sparkles);
    assert.ok(tiers[i].pitch > tiers[i - 1].pitch);
  }
  assert.ok(tiers.every(t => t.sparkles <= motion.PARTICLES.sparkles), 'never above 12 per burst');
  assert.equal(tiers[0].fill.toLowerCase(), '#ffffff');
  assert.equal(tiers[2].fill, motion.GOLD_FX.rays);
  assert.equal(tiers[3].core, true);
  assert.equal(tiers[3].flame, true);
  assert.equal(gm.comboTierStyle(1.5).size, 1, 'in-between multipliers take the tier below');
  assert.equal(gm.comboTierStyle(4).size, 1.25);
  assert.deepEqual([1, 1.5, 2, 2.5, 3, 4, 5, 8].map(m => gm.comboTierRank(m)), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.ok(!tiers.some(t => /ff6b5c|f44336/i.test(t.fill)), 'no red tier');
  assert.equal(gm.TIER_STAMP_FROM, 1.8);
});

test('one callout at a time: the same word waits 600 ms, labels stay inside the screen', () => {
  const g = gm.createCalloutGate();
  assert.equal(gm.calloutAdmit(g, 'Too fast!', 1000), true);
  assert.equal(gm.calloutAdmit(g, 'Too fast!', 1300), false);
  assert.equal(gm.calloutAdmit(g, 'Too fast!', 1601), true);
  assert.equal(gm.calloutAdmit(g, 'Nice!', 1602), true, 'a different word replaces at once');
  assert.equal(gm.clampCalloutX(5, 100, 400), 60);
  assert.equal(gm.clampCalloutX(395, 100, 400), 340);
  assert.equal(gm.clampCalloutX(200, 100, 400), 200);
});

test('the springs match Reanimated physics: SPRING.pop overshoots once, SPRING.settle does not', () => {
  let peak = 0;
  for (let t = 0; t < 1500; t += 2) peak = Math.max(peak, gm.springAt(t, motion.SPRING.pop, 0, 1));
  assert.ok(peak > 1.25 && peak < 1.45, `pop peak ${peak}`);
  let settlePeak = 0;
  for (let t = 0; t < 1500; t += 2) settlePeak = Math.max(settlePeak, gm.springAt(t, motion.SPRING.settle, 0, 1));
  assert.ok(settlePeak < 1.08, `settle peak ${settlePeak}`);
  assert.ok(Math.abs(gm.springAt(3000, motion.SPRING.pop, 0, 1) - 1) < 0.001);
});

test('the shell wires the countdown, the GO frame and the last 5 seconds', () => {
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(shell, /<CountdownStage /);
  assert.match(shell, /<FinalSeconds /);
  assert.match(shell, /if \(step\.at >= GO_AT_MS\) beginPlayRef\.current\(\)/, 'play opens on the GO frame');
  assert.match(shell, /\}, \[phase, visible, clearCountdown, countdownStyle, stageOn\]\);/, 'a re-rendering game never restarts the count');
  assert.match(shell, /runCountStage\(GO_AT_MS\)/, 'tap skips straight to GO');
  assert.match(shell, /secondsLeft\?: number \| null/);
  assert.match(shell, /cdPill/, 'the instruction sits in a pill, the number in clear space');
  assert.match(shell, /reduceMotion: CLOCK_ALWAYS/, 'Reduce Motion fades the numbers; the clock itself never jumps to the end');
  assert.match(read('src/gamekit/fx/FinalSeconds.tsx'), /reduceMotion: ReduceMotion\.Never/);
  const stage = read('src/gamekit/fx/CountdownStage.tsx');
  assert.match(stage, /useDerivedValue\(\(\) => countPose\(clock\.value/, 'one UI-thread clock');
  assert.doesNotMatch(stage, /setState|useState/, 'no per-frame React state');
});

test('Whack: one Too fast! callout (no BUTTERFINGERS stacking), a gold clock (never coral) and tiered medallion', () => {
  const juice = read('src/games/whack/useWhackJuice.ts');
  assert.doesNotMatch(juice, /BUTTERFINGERS/);
  assert.match(juice, /calloutAdmit\(callouts\.current, 'Too fast!'/);
  assert.match(juice, /key: 'callout'/);
  const board = read('src/games/whack/render/WhackBoard.tsx');
  assert.doesNotMatch(board, /left < 3000 && Math\.floor\(left \/ 500\) % 2 === 0 \? CORAL/);
  assert.match(board, /comboTierStyle\(medMult\.value\)/);
  assert.match(board, /FlameTongue/, 'the fever flame is three cached tongues');
  assert.doesNotMatch(board, /const flamePath = useDerivedValue/, 'no Skia path rebuilt every frame');
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /finalSecondsFeedback=\{false\}/);
});

test('round 2: the count waits for the stage to draw (with a cap), the field fades in, the pill breathes', () => {
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(shell, /stageReady\?: boolean/);
  assert.match(shell, /if \(phase !== 'countdown' \|\| !visible \|\| !stageOn\) return;/, 'no count over a blank stage');
  assert.match(shell, /setTimeout\(\(\) => setReadyCap\(true\), STAGE_READY_MAX_MS\)/, 'a stage that never reports still counts');
  assert.ok(gm.STAGE_READY_MAX_MS <= 4000);
  assert.match(shell, /fieldInStyle/);
  assert.match(shell, /pillBreath/, 'the pill moves while the stage loads (no dead hold)');
  assert.match(read('src/games/whack/WhackAShark.tsx'), /stageReady=\{!!L && !!images\.bg/);
  assert.match(read('src/games/memory/MemoryGame.tsx'), /stageReady=\{stageDealt\}/);
  assert.match(read('src/games/current-quest/CurrentQuestGame.tsx'), /stageReady=\{!!\(layout && board && stableImages\.idle\)\}/);
  assert.match(read('src/games/banana-basket/BananaBasketGame.tsx'), /stageReady=\{/);
  // tap to skip lives inside the pill, never over the board.
  assert.doesNotMatch(shell, /skipHint: \{ position: 'absolute', bottom: 64/);
});

test('round 2: a repeat start counts 2-1-GO in 1.4 s; a rare GO throws capped gold confetti, never on the first play', () => {
  gm.resetCountStarts();
  assert.equal(gm.noteCountStart('whack'), 1);
  assert.equal(gm.noteCountStart('whack'), 2);
  assert.equal(gm.noteCountStart('memory'), 1);
  assert.deepEqual(plain(gm.countSteps('full', true).map(s => s.label)), ['2', '1', 'GO!']);
  const q = gm.countSteps('full', true);
  assert.equal(q[q.length - 1].at - q[0].at, 1400, '2-1-GO takes 1.4 s');
  assert.deepEqual(plain(gm.countSteps('go', true).map(s => s.label)), ['GO!']);
  assert.equal(gm.isRareGo(1, 0), false, 'never the first play');
  assert.equal(gm.isRareGo(2, 0.05), true);
  assert.equal(gm.isRareGo(2, 0.5), false);
  assert.ok(gm.RARE_GO_SPARKLES <= motion.PARTICLES.sparkles);
  assert.ok(gm.PARTICLE_MAX_CONFETTI <= motion.PARTICLES.confetti);
  // Confetti pops up, falls under gravity and fades out (never vanishes at full opacity).
  const mid = gm.goConfetti(3, 24, 0.3);
  const end = gm.goConfetti(3, 24, 1);
  assert.ok(end.y > mid.y, 'gravity pulls it down');
  assert.ok(end.alpha < 1e-6, "faded out");
  for (let k = 0; k < 24; k++) assert.ok([0, 1, 2].includes(gm.goConfetti(k, 24, 0.5).color), 'gold, white and blue only');
  assert.ok(!/ff6b5c|f44336/i.test(JSON.stringify(gm.CONFETTI_COLORS)));
});

test('round 2: numbers swing in tilted and rock once as they land (hand-drawn wobble), none with Reduce Motion', () => {
  const inn = gm.countPose(10, false, false);
  assert.ok(Math.abs(inn.rot) > 0.08 && Math.abs(inn.rot) <= gm.COUNT_TILT + 1e-9, `tilted on the way in: ${inn.rot}`);
  let crossed = false;
  let prev = gm.countPose(motion.DURATION.slam, false, false).rot;
  for (let t = motion.DURATION.slam; t < 560; t += 5) {
    const r = gm.countPose(t, false, false).rot;
    if (Math.sign(r) !== Math.sign(prev) && r !== 0) crossed = true;
    prev = r;
  }
  assert.ok(crossed, 'rocks past level once');
  assert.ok(Math.abs(gm.countPose(540, false, false).rot) < 0.02, 'level by the hold');
  assert.equal(gm.countPose(10, true, false).rot, 0, 'no wobble with Reduce Motion');
  assert.ok(gm.countPose(10, false, false).rot * gm.countPose(710, false, false).rot < 0, '3 and 2 lean opposite ways');
});

test('round 2: the last 5 stamp slams with a squash and rock, the ring closes over the second, the 1 holds until TIME!', () => {
  const a = gm.finalStampPose(0, false, false, false);
  assert.ok(Math.abs(a.scale - 1.6) < 1e-9);
  const land = gm.finalStampPose(motion.DURATION.slam + 10, false, false, false);
  assert.ok(Math.abs(land.sx - (1 + motion.SLAM_SQUASH)) < 1e-9, 'squash on landing');
  assert.equal(gm.finalStampPose(0, false, false, false).ring, 1);
  assert.ok(Math.abs(gm.finalStampPose(500, false, false, false).ring - 0.5) < 1e-9, 'half closed mid-second');
  assert.equal(gm.finalStampPose(1000, false, false, false).ring, 0);
  assert.equal(gm.finalStampPose(990, false, true, false).alpha, 1, 'the 1 stays at full strength');
  assert.ok(gm.finalStampPose(990, false, false, false).alpha < 1 && gm.finalStampPose(990, false, false, false).alpha > 0.5, '5 to 2 dim a little, never vanish');
  const time = gm.finalStampPose(0, true, false, false);
  assert.ok(Math.abs(time.scale - 1.8) < 1e-9, 'TIME! slams from 1.8');
  const rm = gm.finalStampPose(10, false, false, true);
  assert.equal(rm.scale, 1);
  assert.equal(rm.rot, 0);
  const fs2 = read('src/gamekit/fx/FinalSeconds.tsx');
  assert.match(fs2, /const NUM_PX = 110;/, 'the second is 110 pt');
  assert.match(fs2, /start=\{0\} end=\{ringEnd\}/, 'the ring closes by trimming a cached path (no per-frame path)');
  assert.match(fs2, /edgeOn/, 'the breathing edge obeys the power budget');
});

test('round 2: kid-safe in-game copy: no red minus vs best, no BEHIND, a calm slip chip, the barker cheers in the last 5', () => {
  const board = read('src/games/whack/render/WhackBoard.tsx');
  assert.doesNotMatch(board, /#c2412f/, 'no red pace text');
  assert.match(board, /d > 0 \? `\+\$\{d\} \$\{paceLabel\}` : paceLabel/, 'behind shows only the chase, no minus');
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.doesNotMatch(whack, /BEHIND YOUR BEST/);
  assert.doesNotMatch(read('src/games/whack/ui/Overlays.tsx'), /#c2412f|#ffe4de/);
  assert.doesNotMatch(read('src/games/memory/Hud.tsx'), /chipSlip: \{ backgroundColor: MM\.coral \}/);
  assert.match(read('src/games/memory/MemoryGame.tsx'), /if \(ev\.left === 5\) stage\.current\?\.pose\('fist'\)/);
});

test('round 2: the medallion draws the decimal as a dot (x2.5 never reads x25), stamps never leave the screen', () => {
  const board = read('src/games/whack/render/WhackBoard.tsx');
  assert.match(board, /multDotX/);
  assert.match(board, /<Circle cx=\{multDotX\}/);
  const stamp = read('src/gamekit/fx/StampLayer.tsx');
  assert.match(stamp, /\(width - 28\) \/ Math\.max\(1, raw \* 1\.22\)/, 'a long stamp shrinks to fit');
  assert.match(stamp, /const half = w \* 0\.61 \+ 10;/, 'room for overshoot and tilt');
});

test('round 2: Whack hits hotter by tier (kick from x3, tier-up hit-stop, pitch climbs by tier); the last 5 only crosses to React on change', () => {
  const juice = read('src/games/whack/useWhackJuice.ts');
  assert.match(juice, /rank >= 2 && camera && !reducedMotion && !walking && !party && nowMs - lastKick\.current >= KICK\.ms/);
  assert.match(juice, /camera\.kick\(0, rank >= 3 \? KICK\.maxPt - 1 : 2\)/);
  assert.match(juice, /govHitStop\(governor, Date\.now\(\), reducedMotion \? 30 : 55, 3, false\)/);
  assert.match(juice, /comboTierRank\(multNow\(\)\) \* 2\)/);
  assert.ok(motion.KICK.maxPt - 1 <= 4);
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /if \(nextLeft !== lastLeftRef\.current\)/);
});

test('round 2: Current Quest shows one banner at a time (the voyage ribbon waits for the GO burst)', () => {
  const cq = read('src/games/current-quest/CurrentQuestGame.tsx');
  assert.match(cq, /if \(!playing\.current\) return;/);
  assert.match(cq, /later\(COUNT_END_MS - GO_AT_MS, \(\) => \{ if \(playing\.current && run\.voyage\.strokes === 0\) showRibbon\(run\); \}\)/);
});
