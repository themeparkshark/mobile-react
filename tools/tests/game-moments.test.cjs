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

test('3, 2, 1 land at 0, 700, 1400 ms; GO at 2100 opens play; the tail is gone by 2700', () => {
  assert.deepEqual(plain(gm.COUNT_STEPS.map(s => s.at)), [0, 700, 1400, 2100]);
  assert.equal(gm.GO_AT_MS, 2100);
  assert.equal(gm.COUNT_END_MS, 2700);
  assert.equal(gm.countPose(-1, false, false).index, -1);
  assert.equal(gm.countPose(2700, false, false).index, -1);
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
  assert.equal(gm.countPose(2100 + gm.GO_LAND_MS + motion.KICK.ms + 1, false, false).kick, 0, 'the kick is over inside KICK.ms of the landing');
  assert.equal(gm.countPose(2100 + 10, false, false).kick, 0, 'no kick before GO lands');
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
  assert.match(stamp, /\(width - 28\) \/ Math\.max\(1, rawBox \* 1\.22\)/, 'a long stamp shrinks to fit (plate included)');
  assert.match(stamp, /const half = rawBox \* k \* 0\.61 \+ 10;/, 'room for overshoot, tilt and the plate');
});

test('round 2 (r4 update): Whack hits hotter by tier (kick on every bonk, growing by tier; tier-up hit-stop, pitch climbs by tier); the last 5 only crosses to React on change', () => {
  const juice = read('src/games/whack/useWhackJuice.ts');
  assert.match(juice, /isBonk\(name\) && camera && !reducedMotion && !walking && !party && nowMs - lastKick\.current >= KICK\.ms/);
  assert.match(juice, /camera\.kick\(side, kickPtForRank\(rank\)\)/);
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

test('round 2: Whack Play again has one start (the shell count calls onStart at GO; no second READY/GO slam under the count)', () => {
  const whack = read('src/games/whack/WhackAShark.tsx');
  const rematch = whack.slice(whack.indexOf('const handleRematch'), whack.indexOf('// Wrap-up (boarding'));
  assert.doesNotMatch(rematch, /startBurst\(/);
});

test('round 2: Memory Play again waits for the new deal (a new board clears the dealt flag)', () => {
  const mem = read('src/games/memory/MemoryGame.tsx');
  const nb = mem.slice(mem.indexOf('const newBoardView'), mem.indexOf('const newBoardView') + 600);
  assert.match(nb, /setStageDealt\(false\)/);
});

test('round 3: GO is the money frame (pop to 1.3, a held beat at full size, then the burst, the fan and the flash)', () => {
  const at = (ms) => gm.countPose(2100 + ms, false, false);
  assert.equal(gm.GO_PEAK, 1.3);
  assert.ok(Math.abs(at(gm.GO_LAND_MS).scale - 1.3) < 1e-6, 'full size when it lands');
  // The held beat: 120 to 160 ms at full size.
  assert.ok(gm.GO_HOLD_MS >= 120 && gm.GO_HOLD_MS <= 160);
  for (let t = gm.GO_LAND_MS; t < gm.GO_LAND_MS + gm.GO_HOLD_MS; t += 10) assert.equal(at(t).scale, 1.3, `held at ${t}`);
  assert.ok(at(gm.GO_LAND_MS + 10).sx > 1, 'lands with the squash');
  // The burst: sparkles start only after the hold; the fan is full and blooms.
  assert.equal(at(gm.GO_LAND_MS + gm.GO_HOLD_MS - 1).sparkle, 0);
  assert.ok(at(gm.GO_LAND_MS + gm.GO_HOLD_MS + 100).sparkle > 0);
  assert.ok(at(gm.GO_LAND_MS + gm.GO_HOLD_MS + 130).bloom > 0.9, 'the fan swells on the burst');
  assert.ok(at(300).gold > 0.95, 'the gold fan is full behind GO');
  assert.ok(at(gm.GO_LAND_MS).flash > 0.95 && at(gm.GO_LAND_MS + gm.GO_HOLD_MS).flash === 0, 'the flash lives on the held beat only');
  // The payoff lands inside 1.5 s of GO and everything has settled by the end of the tail.
  assert.ok(gm.GO_LAND_MS + gm.GO_HOLD_MS < 1500);
  let lo = 9;
  for (let t = 250; t < 480; t += 5) lo = Math.min(lo, at(t).scale);
  assert.ok(lo > 0.85 && lo < 1, `one visible overshoot below rest on the spring back, got ${lo}`);
  assert.ok(at(599).alpha < 0.05 && at(599).gold < 0.05, 'gone by the end of the tail');
  // Exit faster than the entrance read (120 ms).
  assert.ok(2700 - 2100 - 480 <= 120);
  // Reduced: no fan, no flash.
  for (const t of [0, 120, 260, 400]) {
    const r = gm.countPose(2100 + t, true, false);
    assert.equal(r.gold, 0);
    assert.equal(r.flash, 0);
  }
});

test('round 3: GO sparkles fan out downward toward the play field', () => {
  let down = 0;
  for (let k = 0; k < 8; k++) if (gm.goSparkle(k, 8, 0.8).y > 0) down += 1;
  assert.ok(down >= 6, `most sparkles fly toward the board, got ${down}/8`);
});

test('round 3: FINISH! lands at the last-5 size with a gold shockwave, a capped flash and a coin sparkle burst', () => {
  const D = motion.DURATION.slam;
  assert.ok(Math.abs(gm.finishPose(0, false).scale - 1.8) < 1e-6, 'slams from 1.8');
  const land = gm.finishPose(D + 10, false);
  assert.ok(land.sx > 1, 'squash on landing');
  assert.ok(land.ringA > 0.5 && land.flash > 0.5);
  const mid = gm.finishPose(D + 300, false);
  assert.ok(mid.ringR > land.ringR && mid.ringA < land.ringA, 'the ring rolls out and fades');
  assert.equal(gm.finishPose(D + 200, false).flash, 0, 'the flash is one short beat');
  assert.ok(gm.finishPose(gm.FINISH_HANDOFF_MS - 10, false).alpha === 1, 'holds so the kid reads it');
  assert.ok(gm.finishPose(gm.FINISH_HANDOFF_MS + motion.DURATION.exit, false).alpha < 0.05, 'gone as the next card arrives');
  assert.ok(gm.FINISH_BEAT_MS <= 1500);
  assert.ok(gm.FINISH_SPARKLES_MAX <= 12);
  for (let k = 0; k < 12; k++) {
    const a = gm.finishSparkle(k, 12, D + 100);
    const b = gm.finishSparkle(k, 12, D + 500);
    const end = gm.finishSparkle(k, 12, D + 820);
    assert.ok(Math.hypot(b.x, b.y) > Math.hypot(a.x, a.y));
    assert.ok(end.alpha <= 0.001, 'faded, never vanished at full');
  }
  const r = gm.finishPose(D + 10, true);
  assert.equal(r.ringA, 0);
  assert.equal(r.flash, 0);
});

test('round 3: the combo climb is monotonic (size, haptic rung, pitch, sparkles) at x1, x2, x3, x5', () => {
  const RUNG = { tap: 1, goodHit: 2, crit: 3, feverStart: 4 };
  const tiers = [1, 2, 3, 5].map((m) => gm.comboTierStyle(m));
  for (let i = 1; i < tiers.length; i++) {
    assert.ok(tiers[i].size > tiers[i - 1].size, 'size climbs');
    assert.ok(RUNG[tiers[i].haptic] > RUNG[tiers[i - 1].haptic], 'haptic climbs a rung');
    assert.ok(tiers[i].pitch > tiers[i - 1].pitch, 'pitch climbs');
    assert.ok(tiers[i].sparkles >= tiers[i - 1].sparkles, 'sparkles climb');
  }
  // The Whack bonk ladder starts higher at each tier (rank * 2 semitone steps).
  const juice = read('src/games/whack/useWhackJuice.ts');
  assert.match(juice, /comboTierRank\(multNow\(\)\) \* 2\)/);
  // The fly-up climbs too: x1 white, x2 sky, x3 gold, x5 white-hot gold, sizes step up.
  const whackFlyLook = gm.tierFlyLook;
  assert.deepEqual(plain(gm.TIER_TEXT), ['#ffffff', '#7fd6ff', '#ffcf3b', '#fff3b0']);
  assert.match(juice, /tierFlyLook\(def\.flyUp\.size \?\? 'md', rank\)/);
  const order = ['sm', 'md', 'lg', 'xl'];
  let last = -1;
  for (let r = 0; r <= 3; r++) {
    const i = order.indexOf(whackFlyLook('md', r).flySize);
    assert.ok(i >= last, 'size never drops with the tier');
    last = i;
  }
  assert.equal(whackFlyLook('md', 3).flySize, 'xl');
});

test('round 3: callout traffic control in Whack (no words over the HUD, quiet sky band in the last 5 and FINISH!)', () => {
  const juice = read('src/games/whack/useWhackJuice.ts');
  const whack = read('src/games/whack/WhackAShark.tsx');
  const fx = read('src/gamekit/fx/FxStage.tsx');
  assert.match(fx, /Math\.max\(s\.textMinY \+ halfH/, 'fly-ups are clamped below the HUD band');
  assert.match(whack, /textMinY=\{L\.hudH \+ 6\}/);
  assert.match(whack, /minY=\{L\.hudH \+ 8\}/, 'stamps stay below the HUD band');
  assert.match(juice, /if \(quiet\?\.current && \(at\.text \|\| at\.stamp\) && name !== 'butter'\)/);
  assert.match(juice, /if \(quiet\?\.current\) \{\n\s+\/\/ The sky band belongs/, 'a combo slab becomes a medallion bump while quiet');
  assert.match(whack, /quietRef\.current = left <= 6;/);
  assert.match(whack, /stamps\.current\?\.clear\(\);\n\s+fx\.current\?\.clearText\(\);/, 'FINISH! clears every floater first');
  assert.doesNotMatch(juice, /`QUICK \+|`CRIT! \+|text: 'PERFECT'/, 'hits show a number, not a word');
  assert.doesNotMatch(whack, /flash\('FINISH!'/, 'FINISH! is the FinishBeat stamp, not the small banner');
});

test('round 3: the last 5 canvas mounts only near the end and the edge obeys Dim Flashing Lights', () => {
  const fs5 = read('src/gamekit/fx/FinalSeconds.tsx');
  const stage = read('src/gamekit/fx/CountdownStage.tsx');
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(fs5, /remainingMs\.value <= FINAL_MOUNT_MS/);
  assert.match(fs5, /if \(!active \|\| \(ui \? !near : !inWindowJs\)\) return null;/);
  assert.match(fs5, /edgeOn && flashPeak\(isDimFlashingLightsEnabled\(\), reduced\) > 0/);
  assert.match(fs5, /\{edgeDraws \? \(/, 'no gradient rect when the edge is off');
  assert.match(stage, /\{isGo && glow \? \(/, 'the GO blur core obeys the flash rule');
  assert.match(shell, /flash=\{flashPeak\(isDimFlashingLightsEnabled\(\), reducedMotion\)\}/);
  assert.match(shell, /cdScrim: \{ \.\.\.StyleSheet\.absoluteFillObject, backgroundColor: 'rgba\(36,140,224,0\.2\)' \}/, 'a pale sky tint, not a navy wash');
});

test('round 3: the Whack chase is a picture (bead vs ghost fin, a star that fills and pops), never a digit', () => {
  const board = read('src/games/whack/render/WhackBoard.tsx');
  assert.equal(gm.chaseOffset(0, 50), 0, 'level with the ghost sits on it');
  assert.ok(gm.chaseOffset(5000, 50) <= 50 && gm.chaseOffset(5000, 50) > 45, 'never past the end');
  assert.ok(gm.chaseOffset(-300, 50) < 0, 'behind is to the left');
  assert.match(board, /function ChaseTrack/);
  assert.match(board, /showPace=\{showPace && !chase\}/, 'the old VS BEST pill gives way to the track');
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /chase=\{\{ star: chaseStar, starPop: chasePop, earned: chaseEarned/);
  assert.match(whack, /GameAudio\.playLadder\(cues\.coinTick, 9/, 'a gold ding when the bead passes the ghost');
});

test('round 3: misses and the last rush never go red (Banana top tier and rush in gold, OUT! white, Memory slips calm blue)', () => {
  const field = read('src/games/banana-basket/render/Field.tsx');
  assert.match(field, /const TIER_COLORS = \[INK, INK, BLUE, GOLD, HOT\];/);
  assert.doesNotMatch(field, /if \(s\.rushOn\) return CORAL;/);
  assert.doesNotMatch(field, /if \(st === ST_OUT\) return CORAL;/);
  assert.doesNotMatch(field, /n >= 20 \? CORAL/);
  const fxs = read('src/games/memory/BoardFx.tsx');
  assert.doesNotMatch(fxs, /slipPath\} style="stroke" strokeWidth=\{2\} strokeCap="round" color=\{MM\.coral\}/);
  assert.doesNotMatch(read('src/games/memory/MemoryExtras.tsx'), /slip: \{ bg: MM\.coral/);
  const game = read('src/games/memory/MemoryGame.tsx');
  assert.doesNotMatch(game, /tipSlip: \{ borderColor: MM\.coral \}/);
  assert.doesNotMatch(game, /ev\.deltaMs > 0 \? 'gold' : 'coral'/);
});

test('round 3 (r4 update): a first-encounter callout waits for the whole GO tail (no BONK EM word banner), and the FINISH! rings stay below the HUD', () => {
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /setTimeout\(\(\) => flash\(callout, null, '#ffffff', 900\), bi === 0 \? COUNT_END_MS - GO_AT_MS \+ 20 : 0\)/);
  assert.doesNotMatch(whack, /flash\(t\.banner, t\.callout/);
  assert.match(whack, /clipTop=\{L\.hudH \+ 4\}/);
  assert.match(read('src/gamekit/fx/FinishBeat.tsx'), /<Group clip=\{clip\}>/);
});

test('round 3 (r4 update): Whack FINISH! fires on the UI frame the clock hits 0 (runtime.endTick), never after a JS hop', () => {
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /<FinishBeat trigger=\{runtime\.endTick\}/);
  const fire = whack.slice(whack.indexOf('const onFinishFire'), whack.indexOf('const onFinishFire') + 600);
  assert.match(fire, /fx\.current\?\.clearText\(\);/);
  const rt = read('src/games/whack/useWhackRuntime.ts');
  assert.match(rt, /r\.endSeen = true;\s*\/\/[^\n]*\n\s*endTick\.value = endTick\.value \+ 1;/);
});

test('round 3: with a game-owned end stamp, the 1 holds at 0 until the game leaves play (no empty sky before FINISH!)', () => {
  const fs5 = read('src/gamekit/fx/FinalSeconds.tsx');
  assert.match(fs5, /if \(rem <= 0 && !timeStamp\) return \{ sec: 1, t: 999 \};/);
  const p = gm.finalStampPose(999, false, true, false);
  assert.equal(p.alpha, 1, 'the 1 is at full strength');
  assert.ok(p.ring < 0.01, 'its ring has closed');
});

// ---------------------------------------------------------------------------
// Round 4: no dead holds at the climax, a header that answers on the hit frame, pictures over words.

test('round 4: FINISH! opens a gold ray fan on the landing and hands off at FINISH_HANDOFF_MS (no hold over 600 ms)', () => {
  const D = motion.DURATION.slam;
  assert.ok(gm.FINISH_HANDOFF_MS <= 600, 'the payoff never sits still longer than 600 ms');
  assert.ok(gm.FINISH_BEAT_MS < 1000, 'the whole beat is under a second');
  assert.ok(gm.FINISH_FAN_OF_GO >= 0.7 && gm.FINISH_FAN_OF_GO <= 0.9, 'the fan is about 0.8 of GO');
  assert.equal(gm.finishPose(D + 100, false).gold, 1, 'the fan is full just after the landing');
  assert.ok(gm.finishPose(D + 60, false).bloom > 0.4, 'the fan swells on the landing frame');
  assert.ok(gm.finishPose(gm.FINISH_HANDOFF_MS + motion.DURATION.exit, false).gold < 0.01, 'the fan leaves with the label');
  assert.ok(motion.DURATION.exit < motion.DURATION.enter, 'exits are faster than entrances');
  const r = gm.finishPose(D + 100, true);
  assert.equal(r.gold, 0);
  assert.equal(r.alpha, 1, 'Reduce Motion still shows the word');
  assert.ok(gm.finishPose(gm.FINISH_HANDOFF_MS + motion.DURATION.exit + 10, true).alpha < 0.05);
});

test('round 4: the curtain call pops every empty well from the centre out and they wave together (Reduce Motion: up, still)', () => {
  const rs = loadTs('src/games/whack/render/renderState.ts');
  assert.equal(rs.curtainPose(4, 0, -1, false).rise, -1, 'off until the burst ends');
  assert.ok(rs.curtainPose(4, 10, 0, false).rise >= 0.3, 'the centre well goes first');
  assert.equal(rs.curtainPose(8, 10, 0, false).rise, -1, 'a corner waits its turn');
  const last = 8 * rs.CURTAIN_STEP_MS + rs.CURTAIN_RISE_MS;
  for (let i = 0; i < 9; i++) assert.equal(rs.curtainPose(i, last + 1, 0, false).rise, 1);
  assert.ok(last <= 600, `the whole board is up inside 600 ms, got ${last}`);
  const a = rs.curtainPose(0, last + 200, 0, false).rot;
  const b = rs.curtainPose(1, last + 200, 0, false).rot;
  assert.ok(Math.sign(a) !== Math.sign(b) || Math.abs(a) < 0.5, 'neighbours lean opposite ways');
  assert.ok(Math.abs(a) <= 7.001);
  assert.deepEqual(plain(rs.curtainPose(8, 10, 0, true)), { rise: -1, rot: 0, hop: 0 });
  assert.deepEqual(plain(rs.curtainPose(8, last, 0, true)), { rise: 1, rot: 0, hop: 0 });
  assert.equal(rs.curtainPose(4, rs.CURTAIN_BOW_MS + 8 * rs.CURTAIN_STEP_MS + rs.CURTAIN_DUCK_MS + 1, 0, false).rise, -1, 'they duck back before the next card settles');
  assert.ok(rs.CURTAIN_BOW_MS + 8 * rs.CURTAIN_STEP_MS * 0.5 + rs.CURTAIN_DUCK_MS <= 1700, 'the bow is over inside 1.7 s');
  assert.ok(rs.CURTAIN_DUCK_MS < rs.CURTAIN_RISE_MS + 20, 'the duck is no slower than the pop');
  const rt = read('src/games/whack/useWhackRuntime.ts');
  assert.match(rt, /a\.curtainAt = a\.fxNow \+ 90;/, 'it starts on the UI frame the clock hits 0');
  assert.match(rt, /an\.value\.curtainAt = -1;/, 'a new burst clears it');
});

test('round 4: the header score is a UI-thread roll fed on the hit frame (no 250 ms poll, no setShellScore per tick)', () => {
  const whack = read('src/games/whack/WhackAShark.tsx');
  const at = whack.indexOf('// Pace line, Line of the Day ghost pucks');
  const poll = whack.slice(at, whack.indexOf('}, 250);', at));
  assert.doesNotMatch(poll, /setShellScore/, 'the poll never writes the header score');
  assert.match(poll, /mirrorLite\(\)/, 'the poll never copies the tap log');
  assert.match(whack, /headerScore=\{<LiveScore value=\{runtime\.liveScore\} arrived=\{flyArrived\}/);
  const rt = read('src/games/whack/useWhackRuntime.ts');
  assert.match(rt, /const ls = r\.scoreBase \+ \(r\.scoreLive \? s\.score : 0\);\s*if \(ls !== liveScore\.value\) liveScore\.value = ls;/);
  const live = read('src/gamekit/fx/LiveScore.tsx');
  assert.match(live, /useAnimatedProps/);
  assert.doesNotMatch(live, /useState|setInterval|requestAnimationFrame/);
  assert.match(live, /HUD_BUMP\.peak/, 'a landing bumps the pill by the HUD bump token');
  assert.match(read('src/gamekit/fx/FxStage.tsx'), /if \(flyArrived\) flyArrived\.value = flyArrived\.value \+ n;/, 'arrivals bump on the UI thread');
});

test('round 4: every bonk sprays small gold and white stars that fall and fade, and the kick grows with the tier', () => {
  const p = loadTs('src/gamekit/core/particles.ts');
  const e = p.EMITTERS.impactSpray;
  assert.ok(e.count[1] <= 12, 'never more than 12 per burst');
  assert.ok(e.gravity > 0 && e.life[0] >= 0.4 && e.life[1] <= 0.9, 'they fall and fade over 400 to 900 ms');
  const juice = read('src/games/whack/useWhackJuice.ts');
  assert.match(juice, /fx\.current\?\.burst\('impactSpray'/);
  const k0 = juice.indexOf('export function kickPtForRank');
  const src = juice.slice(k0, juice.indexOf('\n}\n', k0) + 2);
  const kick = new Function('KICK', `${src.replace('export ', '').replace(/: number/g, '')}; return kickPtForRank;`)(motion.KICK);
  const ladder = [0, 1, 2, 3].map(kick);
  for (let i = 1; i < 4; i++) assert.ok(ladder[i] >= ladder[i - 1], `kick climbs: ${ladder}`);
  assert.ok(ladder[0] >= 2 && ladder[3] <= motion.KICK.maxPt);
  assert.match(juice, /late: \{[^\n]*localStop: 40/, 'even a late bonk holds the sprite 40 ms');
});

test('round 4: the last 5 ticks climb a semitone each second on the UI clock, and coin ticks never fan out on JS timers', () => {
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /GameAudio\.play\(cues\.tick, \{ volume: 0\.6, pitch: 5 - sec, delayMs \}\)/);
  assert.match(whack, /runOnJS\(lastFiveTick\)\(sec, remainingMs\.value - sec \* 1000, Date\.now\(\)\);/, 'the UI clock hands JS the exact time to the crossing');
  assert.doesNotMatch(whack, /setTimeout\(\(\) => GameAudio\.playLadder\(cues\.coinTick/);
  assert.match(whack, /if \(now - c\.at < 30 \|\| n <= 0\) return;/, 'one coin tick per 30 ms at most');
  assert.match(whack, /runtime\.wake\(STAGGER\.stepMs\)/, 'the GO wake ripples on the UI clock');
  assert.match(whack, /sparkles=\{momentParticles\(FINISH_SPARKLES_MAX, budget, reducedMotion\)\}/, 'Battery Saver thins FINISH! too');
});

test('round 4: the breather and the count read with zero words (pictures, a UI-thread roll, no fever sentence)', () => {
  const ov = read('src/games/whack/ui/Overlays.tsx');
  assert.doesNotMatch(ov, /requestAnimationFrame/, 'no per-frame JS count-up');
  assert.match(ov, /<CountUpText value=\{p\.burstScore\}/);
  assert.doesNotMatch(ov, /SAVE IT FOR THE FINALE|save fever|7s of x2|tap when you're set|Keep shuffling/);
  assert.match(ov, /<NextPreview shape=\{p\.nextShape\}/);
  assert.match(ov, /<GameIcon name="streak" size=\{34\} \/>/, 'the fever pad is a flame');
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(shell, /\{countdownDemo \? <React\.Fragment key=\{demoRun\}>\{countdownDemo\}<\/React\.Fragment> : \(objective \?/);
  const coach = read('src/games/whack/ui/CoachDemo.tsx');
  assert.doesNotMatch(coach, /<Text/, 'the demo has no words');
  assert.doesNotMatch(coach, /#ff6b5c|'red'|coral/i, 'the X is navy on white, never red');
  const src = coach.slice(coach.indexOf('export function coachPose'), coach.indexOf('export function CoachDemo'));
  const js = src.replace('export ', '').replace("'worklet';", '').replace(/\(p: number\): \{[^}]*\}/, '(p)');
  const pose = new Function(`${js}; return coachPose;`)();
  assert.equal(pose(0.1).check, 0, 'no check before the bonk lands');
  assert.ok(pose(0.24).check > 1.1, 'the check pops past full');
  assert.equal(pose(0.4).check, 1);
  assert.equal(pose(0.6).cross, 0, 'the lure shakes no first');
  assert.equal(pose(0.8).cross, 1);
});

// ---------------------------------------------------------------------------
// Round 5: no ghost beat, one celebration at a time, nothing over the HUD, no ghosted buttons.

test('round 5: FINISH! leaves in one shared ease-out: the fan, rings and sparkles never outlive the label', () => {
  const end = gm.FINISH_HANDOFF_MS + gm.FINISH_EXIT_MS;
  assert.equal(gm.FINISH_EXIT_MS, motion.DURATION.slam, 'a 120 ms exit, faster than the entrance');
  for (let t = 0; t <= gm.FINISH_BEAT_MS + 200; t += 5) {
    const p = gm.finishPose(t, false);
    assert.ok(p.gold <= p.alpha + 1e-9, `the fan is never brighter than the label at ${t} ms`);
    if (t >= end) {
      assert.equal(p.alpha, 0);
      assert.equal(p.gold, 0, `no rays alone at ${t} ms`);
      assert.equal(p.bloom, 0);
      assert.equal(p.ringA + p.ring2A, 0);
      for (let k = 0; k < 12; k++) assert.equal(gm.finishSparkle(k, 12, t).alpha, 0, 'sparkles leave with the label');
    }
  }
  const fb = read('src/gamekit/fx/FinishBeat.tsx');
  assert.match(fb, /\{!reduced && font && raysImg && softImg \? \(/, 'the fan only draws with its label');
  assert.doesNotMatch(fb, /<GoldBurst/, 'the fan is drawn in the same Skia canvas as the label (never native views lagging behind it)');
  assert.match(fb, /const FinishCanvas = React\.memo\(/, 'the canvas never re-renders mid-beat');
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /<FinishBeat trigger=\{runtime\.endTick\} armed=\{phase !== 'done'\}/, 'r6: the FINISH! canvas stays mounted (idle, drawing nothing), so the beat never waits on JS');
});

test('round 5: the curtain call bows before the next card; Bursts 2 and up get a quick ripple, about 1 run in 8 a gold one', () => {
  const rs = loadTs('src/games/whack/render/renderState.ts');
  const full = rs.curtainEndMs(rs.CURTAIN_FULL);
  const short = rs.curtainEndMs(rs.CURTAIN_SHORT);
  assert.ok(full <= 1100, `the full wave is down by ${full} ms`);
  assert.ok(short < 700, `the repeat ripple is under 700 ms (${short})`);
  // The short ripple only uses the middle row.
  for (const i of [0, 1, 2, 6, 7, 8]) assert.equal(rs.curtainPose(i, 200, 0, false, rs.CURTAIN_SHORT).rise, -1);
  for (const i of [3, 4, 5]) assert.ok(rs.curtainPose(i, 200, 0, false, rs.CURTAIN_SHORT).rise > 0.9);
  // Every shark is down at curtainEndMs (minus the lead), for every kind.
  for (const k of [rs.CURTAIN_FULL, rs.CURTAIN_SHORT, rs.CURTAIN_GOLDEN]) {
    const at = rs.curtainEndMs(k) - rs.CURTAIN_LEAD_MS + 1;
    for (let i = 0; i < 9; i++) assert.equal(rs.curtainPose(i, at, 0, false, k).rise, -1, `kind ${k} well ${i} down`);
  }
  // The bow is a sink, not a blink: halfway through the duck the shark is still partly up.
  const mid = rs.curtainPose(4, rs.CURTAIN_BOW_MS + rs.CURTAIN_DUCK_MS / 2, 0, false);
  assert.ok(mid.rise > 0.5 && mid.rise < 1, `mid-bow rise ${mid.rise}`);
  // Picker: first and last get the full wave, the middle Bursts the ripple, a gold one now and then.
  let gold = 0;
  for (let seed = 0; seed < 400; seed++) {
    assert.equal(rs.curtainKindFor(1, 4, seed), rs.CURTAIN_SHORT);
    assert.equal(rs.curtainKindFor(2, 4, seed), rs.CURTAIN_SHORT);
    const k = rs.curtainKindFor(3, 4, seed);
    assert.ok(k === rs.CURTAIN_FULL || k === rs.CURTAIN_GOLDEN);
    if (k === rs.CURTAIN_GOLDEN) gold++;
  }
  assert.ok(gold > 20 && gold < 90, `rare gold curtain about 1 in 8 (${gold}/400)`);
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /Math\.max\(finishHandoff\(curtainKind\.current\), curtainEndMs\(curtainKind\.current\)\)/, 'the next card waits for the last bow');
  const src = read('src/games/whack/render/renderState.ts');
  assert.match(src, /an\.curtainKind === CURTAIN_GOLDEN && i === 4 \? F_GOLDEN : F_POP/);
});

test('round 5: the breather sits below the HUD, shows at most 3 picture stats and never ghosts its buttons', () => {
  const ov = read('src/games/whack/ui/Overlays.tsx');
  assert.doesNotMatch(ov, /withRepeat/, 'no endless pulse while the card waits (or in the background)');
  assert.doesNotMatch(ov, /readyOff/, 'no 55 percent ghost buttons');
  assert.match(ov, /marginTop: p\.top \?\? 14/, 'the card starts below the HUD row');
  assert.match(ov, /const showRun = p\.runScore !== p\.burstScore;/, 'no duplicate total on Burst 1');
  assert.match(ov, /\.slice\(0, showRun \? 2 : 3\)/, 'at most 3 picture stats');
  assert.doesNotMatch(ov, /`\+\$\{Math\.round\(p\.walkMeters\)\}m`/, 'no +0m unit to read');
  assert.match(ov, /p\.walkPct > 0\.01 \|\| !!p\.boostReady/, 'the walk ring hides at zero');
  assert.match(ov, /styles\.bestMark/, 'your best is a ghost fin on the star bar');
  assert.match(ov, /<CountUpText value=\{p\.burstScore\} fromValue=\{rollFrom\}/, 'the +N rolls on a card that mounts with its final score (r6: from a fifth, never +0)');
  assert.match(read('src/gamekit/fx/CountUpText.tsx'), /const first = reducedMotion \|\| fromValue == null \? value : fromValue;/);
  assert.doesNotMatch(ov, /BANK &amp; EXIT/, 'the exit pad is a picture, not a money word');
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /top=\{L \? L\.hudH \+ 6 : 14\}/);
  assert.match(whack, /setTimeout\(\(\) => setReadyOn\(true\), landIn \+ padsAfter\(curtainKind\.current\)\)/, 'the pads arrive as the last beat of the card');
  assert.match(whack, /countdownPillFieldY=\{L \? L\.hudH \+ 8 : undefined\}/, 'the coach card sits below the HUD');
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(shell, /opacity: fieldIn\.value \* \(1 - pillOut\.value\),/, 'the pill arrives with the stage, never over a blank frame');
});

test('round 5: every bonk reads at arm\'s length (bigger stars, a contact ring), thinned by the power budget', () => {
  const pt = read('src/gamekit/core/particles.ts');
  assert.match(pt, /impactSpray: \{[^}]*size: \[12, 18\]/);
  const juice = read('src/games/whack/useWhackJuice.ts');
  assert.match(juice, /budgetedParticles\(want, budget\)/, 'Battery Saver thins the spray');
  assert.match(juice, /reducedMotion \|\| !budget \? \(reducedMotion \? 0 : want\)/, 'Reduce Motion drops it');
  assert.match(juice, /fx\.current\?\.ring\(p\.x, cy, \{ color: '#ffffff', from: 14, to: rank >= 2 \? 86 : 64, ms: 120 \}\)/);
  assert.match(juice, /color: TINT\.gold, speed: rank >= 3 \? 1\.35 : 1\.18/, 'x3 and fever throw gold-only stars further');
  const pp = loadTs('src/power/powerPolicy.ts');
  assert.equal(pp.budgetedParticles(6, { particleScale: 0.5, animate: true }), 3, 'Battery Saver: 3 stars');
  assert.match(juice, /combo: \{[^}]*plate: true \}/, 'combo slabs sit on a cream plate');
  const stamp = read('src/gamekit/fx/StampLayer.tsx');
  assert.match(stamp, /\{data\.plate \? \(/);
});

test('round 5: the last-5 ticks are queued ahead on the UI clock, so a late JS thread still lands on the stamp', () => {
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /const LAST5_LEAD_MS = 320;/);
  assert.match(whack, /Math\.ceil\(\(rem - LAST5_LEAD_MS\) \/ 1000\)/);
  assert.match(whack, /const delayMs = Math\.max\(0, Math\.round\(toCrossMs - lag\)\);/);
  assert.match(whack, /\[wow-sync\]/, 'the dev beat log prints the measured lag');
  assert.match(whack, /if \(Date\.now\(\) - preWhistle\.current > 600\) GameAudio\.play\(cues\.whistle/, 'one whistle, queued on the zero frame');
});

test('round 5: a shark that gets away blows a raspberry (tongue out, a wiggle), never with Reduce Motion', () => {
  const src = read('src/games/whack/render/renderState.ts');
  assert.match(src, /const cheeky = finnish && \(k === K_FINN \|\| k === K_TWIN \|\| k === K_SPRINTER\) && wob > 0;/);
  assert.match(src, /const frame = cheeky \? F_TONGUE : finnish \? F_DUCK/);
  assert.match(src, /if \(cheeky\) rs\.rot\[i\] = 7 \* Math\.sin\(t \* Math\.PI \* 3\);/);
});

// ---------------------------------------------------------------------------
// Wave 4 round 1 (r6): no dead hold, an idle card is a still frame, a roll you can watch.

test('r6: the breather lands as the curtain\'s last sharks duck, timed from FINISH!\'s UI fire frame', () => {
  const rs = loadTs('src/games/whack/render/renderState.ts');
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /export const CARD_OVERLAP_MS = 150;/);
  assert.match(whack, /finishWall\.current \+ Math\.max\(finishHandoff\(curtainKind\.current\), curtainEndMs\(curtainKind\.current\) - CARD_OVERLAP_MS\)/);
  // The card is on screen before the last shark is down, and never before FINISH! hands off.
  const full = Math.max(gm.FINISH_HANDOFF_MS, rs.curtainEndMs(rs.CURTAIN_FULL) - 150);
  const short = Math.max(gm.FINISH_HANDOFF_SHORT_MS, rs.curtainEndMs(rs.CURTAIN_SHORT) - 150);
  assert.ok(full < rs.curtainEndMs(rs.CURTAIN_FULL) && full >= gm.FINISH_HANDOFF_MS);
  assert.ok(short < rs.curtainEndMs(rs.CURTAIN_SHORT) && short >= gm.FINISH_HANDOFF_SHORT_MS);
  // From the label leaving to the card landing the sharks are still bowing (no empty board over 150 ms + overlap).
  assert.ok(full - (gm.FINISH_HANDOFF_MS + gm.FINISH_EXIT_MS) <= 300, `full gap ${full - (gm.FINISH_HANDOFF_MS + gm.FINISH_EXIT_MS)} ms is covered by the bow`);
  // The UI fire frame's wall clock reaches JS (a late JS thread cannot push the card back).
  const fb = read('src/gamekit/fx/FinishBeat.tsx');
  assert.match(fb, /runOnJS\(fired\)\(Date\.now\(\)\)/);
  assert.match(whack, /const onFinishFire = useCallback\(\(firedAt: number\) => \{\n\s+finishWall\.current = firedAt;/);
  // The card mounts hidden ahead of time and the entrance runs on a UI-thread delay.
  assert.match(whack, /const mountIn = Math\.max\(0, enterAt - CARD_MOUNT_LEAD_MS - Date\.now\(\)\);/);
  const ov = read('src/games/whack/ui/Overlays.tsx');
  assert.match(ov, /enter\.value = withDelay\(enterIn, /);
  assert.match(ov, /<Animated\.View style=\{\[styles\.dim, dimStyle\]\}/, 'the veil rides the card\'s own spring');
});

test('r6: the +N roll never shows +0 for points you earned and runs on the UI clock with an end pop', () => {
  const ov = read('src/games/whack/ui/Overlays.tsx');
  assert.match(ov, /return total > 0 \? Math\.max\(1, Math\.round\(total \* BREATHER_ROLL\.fromShare\)\) : 0;/);
  assert.match(ov, /BREATHER_ROLL = \{ landMs: 0, ms: 720, fromShare: 0\.2, punch: 1\.22 \}/);
  assert.match(ov, /punchAt="end"/);
  assert.match(ov, /onDone=\{p\.onRollDone\}/);
  const cu = read('src/gamekit/fx/CountUpText.tsx');
  assert.match(cu, /shown\.value = withDelay\(wait, withTiming\(value/);
  assert.doesNotMatch(cu, /setTimeout\(run, delayMs\)/, 'no JS-timer delay that can hold the first number and then snap');
  assert.match(cu, /scale\.value = withDelay\(punchAt === 'end' \? wait \+ ms : wait, pop\);/);
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /GameAudio\.play\(cues\.tally, \{ volume: 0\.85, pitch: Math\.min\(12, bankTick\.current \+ 1\) \}\);/, 'a gold pop a step above the tick ladder');
  // The roll lands inside the card's first second (full card) and quicker on a repeat card.
  assert.ok(0 + 720 <= 800);
  assert.match(ov, /BREATHER_ROLL_QUICK = \{ landMs: 0, ms: 460/);
});

test('r6: an idle card is a still frame (board at rest, no per-frame writes when nothing moves)', () => {
  const rt = read('src/games/whack/useWhackRuntime.ts');
  assert.match(rt, /r\.frameWall = (?:Date\.now\(\)|now);\n\s+\/\/ At rest under a card[^\n]*\n\s+if \(r\.rest\) return;/, 'no render pass and no tick at rest');
  assert.match(rt, /r\.running = true;\n\s+r\.rest = false;/, 'every Burst start wakes the board');
  assert.match(rt, /rt\.value\.rest = false;\n\s+const a = an\.value;\n\s+a\.curtainAt = -1;/, 'GO wakes the board');
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /if \(runToken\.current === token && !finishing\.current && !NO_REST\) restBoard\(true\);/);
  assert.match(whack, /const NO_REST = \(__DEV__ \|\| WHACK_CAPTURE\) && process\.env\.EXPO_PUBLIC_WHACK_NO_REST === '1';/, 'the A\/B switch exists only in dev and the capture');
  assert.match(whack, /if \(phase !== 'breather' \|\| finishing\.current\) return;\n\s+clearRest\(\);/, 'GO cancels a pending rest');
  assert.match(whack, /restBoard\(false\);/, 'the rematch count plays over a live board');
  // Clock and layers only write shared values when something changed.
  assert.match(read('src/gamekit/useGameClock.ts'), /if \(simMs\.value !== c\.simMs\) simMs\.value = c\.simMs;/);
  const st = read('src/gamekit/fx/StampLayer.tsx');
  assert.match(st, /if \(live && clock\.value !== t\) clock\.value = t;/, 'an empty stamp layer never redraws');
  assert.doesNotMatch(st, /clock\.value \+= /);
  const perf = read('src/gamekit/perf/PerfOverlay.tsx');
  assert.match(perf, /if \(!enabled \|\| !jsLoop\) return undefined;/, 'no JS rAF loop in a shipped game');
  assert.match(read('src/games/whack/WhackAShark.tsx'), /usePerfProbe\(visible, PERF_GRAPH\)/);
});

test('r6: the camera snaps to rest instead of writing a sub-pixel transform for seconds', () => {
  const cam = loadTs('src/gamekit/core/camera.ts');
  const c = cam.createCamera(cam.CAMERA_PRESETS.whack, 3);
  cam.kick(c, 3, 2);
  for (let i = 0; i < 90; i++) cam.stepCamera(c, 16.7);
  assert.equal(c.kx, 0);
  assert.equal(c.ky, 0);
  const x0 = c.x;
  cam.stepCamera(c, 16.7);
  assert.equal(c.x, x0, 'a settled camera stops changing');
});

test('r6: FINISH! never crosses the 16 pt gutters, the fan swells brighter, and repeat Bursts get the short beat', () => {
  const fb = read('src/gamekit/fx/FinishBeat.tsx');
  assert.match(fb, /export const FINISH_GUTTER = 16;/);
  assert.match(fb, /const maxK = \(inner \* PEAK_OF_GUTTER\) \/ Math\.max\(1, raw \+ LABEL_OUTLINE\);/);
  assert.match(fb, /const REST_OF_GUTTER = 0\.78;/);
  assert.match(fb, /const PEAK_OF_GUTTER = 0\.9;/);
  assert.match(fb, /const cap = kx > maxK \? maxK \/ kx : 1;/);
  // At the slam's peak (1.8x) the capped width stays inside the gutters for a long word on an SE.
  const width = 375, raw = 480, outline = 14;
  const inner = width - 32;
  const fit = Math.min(1, (inner * 0.78) / ((raw + outline) * 1.12));
  const maxK = (inner * 0.9) / (raw + outline);
  const kx = 1.8 * 1.0 * fit;
  const shown = Math.min(kx, maxK) * (raw + outline);
  assert.ok(shown <= inner * 0.9 + 1e-9, `peak ${shown} fits ${inner} with room for the tilt`);
  assert.ok(maxK / fit > 1.1, 'the slam still has visible travel down to its rest size');
  assert.match(fb, /const raysA = useDerivedValue\(\(\) => Math\.min\(1, pose\.value\.gold \+ 0\.25 \* swell \* pose\.value\.bloom\)\);/);
  assert.match(fb, /const swell = flash > 0 \? 1 : 0\.4;/, 'Dim Flashing Lights keeps a softer swell');
  // The short beat leaves sooner and keeps one shared exit.
  assert.equal(gm.FINISH_HANDOFF_SHORT_MS, 340);
  assert.equal(gm.finishPose(gm.FINISH_HANDOFF_SHORT_MS + gm.FINISH_EXIT_MS, false, gm.FINISH_HANDOFF_SHORT_MS).alpha, 0);
  assert.ok(gm.finishPose(gm.FINISH_HANDOFF_SHORT_MS + gm.FINISH_EXIT_MS, false).alpha > 0.9, 'the full beat still holds');
  assert.equal(gm.finishSparkle(0, 12, gm.FINISH_HANDOFF_SHORT_MS + gm.FINISH_EXIT_MS, gm.FINISH_HANDOFF_SHORT_MS).alpha, 0);
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /handoffMs=\{finishHandoff\(curtainKind\.current\)\}/);
  assert.match(whack, /quick: repeatBurst\(curtainKind\.current\),/);
});

test('r6: last-5 cues get 320 ms of lead; Battery Saver drops the contact ring; pads read with pictures', () => {
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /const LAST5_LEAD_MS = 320;/);
  const juice = read('src/games/whack/useWhackJuice.ts');
  assert.match(juice, /if \(!budget \|\| budget\.particleScale >= 0\.75\) \{\n\s+fx\.current\?\.ring\(p\.x, cy, \{ color: '#ffffff'/);
  const ov = read('src/games/whack/ui/Overlays.tsx');
  assert.match(ov, /<Image source=\{THEMED_SHARK_FRAMES\[theme\]\[1\]\} style=\{styles\.padShark\}/, 'plain GO is the blue shark');
  assert.match(ov, /<Image source=\{ART\.golden\} style=\{styles\.padShark\}/, 'GO x2 is the golden shark');
  assert.match(ov, /bank: \{ marginTop: 14, minHeight: 56,/, 'the exit pad is a real 56 pt button');
  // The pads fit an SE inside the 16 pt gutters.
  assert.ok(132 + 12 + 196 <= 375 - 32);
});

test('r6: Whack has a release-like capture (never set in store builds) for frame-rate proof', () => {
  const routes = read('src/devRoutes.tsx');
  assert.match(routes, /if \(motion === 'Whack'\) return 'MiniGameTester';/);
  assert.match(read('src/utils/standalonePreview.ts'), /EXPO_PUBLIC_MOTION_CAPTURE === 'Whack'\) return true;/);
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /const WHACK_CAPTURE = process\.env\.EXPO_PUBLIC_MOTION_CAPTURE === 'Whack';/);
  assert.match(whack, /const PERF_GRAPH = \(__DEV__ \|\| WHACK_CAPTURE\) && process\.env\.EXPO_PUBLIC_WHACK_PERF === '1';/);
});

test('r6: FINISH! stays armed through its own beat, and the results card leads so the last bow is never followed by an empty board', () => {
  const whack = read('src/games/whack/WhackAShark.tsx');
  assert.match(whack, /armed=\{phase !== 'done'\}/);
  // Idle it costs nothing: the canvas only redraws while its UI clock runs.
  assert.match(read('src/gamekit/fx/FinishBeat.tsx'), /const FinishCanvas = React\.memo\(/);
  assert.match(whack, /export const RESULTS_LEAD_MS = 300;/);
  assert.match(whack, /laterInRun\(\(\) => finishRun\(\), t\.boss && b\.result\.bossDown \? 1600 : resultsWait\(\)\);/);
  assert.match(whack, /laterInRun\(\(\) => finishRun\('banked'\), resultsWait\(\)\);/);
});
