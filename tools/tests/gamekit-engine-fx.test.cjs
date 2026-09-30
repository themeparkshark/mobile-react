'use strict';
/**
 * Studio engine pass 3: FX governor (flash gate, hit-stop budget, camera
 * exclusion, priority), perf tiers, ribbon trails and brush strokes,
 * afterimages, the bright-world colour guard, walk-safe hit testing, the
 * card flip pose and the results near-miss line.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const gov = loadTs('src/gamekit/core/fxGovernor.ts');
const tier = loadTs('src/gamekit/core/perfTier.ts');
const trail = loadTs('src/gamekit/core/trail.ts');
const color = loadTs('src/gamekit/core/color.ts');
const hit = loadTs('src/gamekit/core/hitTest.ts');
const flip = loadTs('src/gamekit/core/flip.ts');
const near = loadTs('src/gamekit/core/nearMiss.ts');

test('flash gate: never two within 500 ms, capped at 35%, calm caps at 15%, force passes', () => {
  const g = gov.createFxGovernor();
  assert.equal(gov.govFlash(g, 1000, 0.8), 0.35);
  assert.equal(gov.govFlash(g, 1200, 0.3), 0, 'inside min gap');
  assert.equal(gov.govFlash(g, 1600, 0.3), 0, 'rolling window: 1 per 2 s');
  assert.equal(gov.govFlash(g, 3100, 0.3), 0.3);
  assert.equal(gov.govFlash(g, 3150, 0.9, 0, true), 0.35, 'force still respects the cap');
  assert.ok(g.denied >= 2);
  const calm = gov.createFxGovernor({ calm: true });
  assert.equal(gov.govFlash(calm, 0, 0.6), 0.15);
  // Photosensitivity: the gate keeps any flash point under 3 Hz.
  assert.ok(gov.flashRateHz(g.cfg.flashMinGapMs) < 3);
});

test('flash gate: a lower-priority moment in the same beat cannot flash; a higher one can', () => {
  const g = gov.createFxGovernor({ flashesPerWindow: 3, flashMinGapMs: 0 });
  assert.ok(gov.govFlash(g, 100, 0.3, 5) > 0, 'golden flashes');
  assert.equal(gov.govFlash(g, 140, 0.3, 1), 0, 'pearl bank in the same beat is denied');
  const h = gov.createFxGovernor({ flashesPerWindow: 3, flashMinGapMs: 0 });
  assert.ok(gov.govFlash(h, 100, 0.3, 1) > 0);
  assert.ok(gov.govFlash(h, 150, 0.3, 5) > 0, 'a bigger moment overrides a smaller one');
});

test('hit-stop budget: <= 90 ms of global freeze per second, one stop per stroke', () => {
  const g = gov.createFxGovernor();
  assert.equal(gov.govHitStop(g, 0, 70), 70);
  assert.equal(gov.govHitStop(g, 300, 70), 20, 'trimmed to the remaining budget');
  assert.equal(gov.govHitStop(g, 500, 70), 0, 'budget spent');
  assert.equal(gov.govHitStop(g, 1400, 70), 70, 'window rolled');
  assert.equal(gov.govHitStop(g, 1500, 400, 0, true), 160, 'force is still clamped to the max single stop');
  const s = gov.createFxGovernor({ hitStopBudgetMs: 1000 });
  gov.govBeginStroke(s, 1);
  assert.equal(gov.govHitStop(s, 0, 60), 60);
  assert.equal(gov.govHitStop(s, 400, 60), 0, 'one hit-stop per stroke');
  gov.govBeginStroke(s, 2);
  assert.equal(gov.govHitStop(s, 800, 60), 60);
});

test('camera: punch is denied within 150 ms of a shake; merged shakes keep the larger trauma', () => {
  const g = gov.createFxGovernor();
  assert.equal(gov.govShake(g, 0, 0.3), 0.3);
  assert.ok(Math.abs(gov.govShake(g, 50, 0.5) - 0.2) < 1e-9, 'adds only the difference');
  assert.equal(gov.govShake(g, 60, 0.2), 0);
  assert.equal(gov.govPunch(g, 100), false);
  assert.equal(gov.govPunch(g, 400), true);
  const calm = gov.createFxGovernor({ calm: true });
  assert.ok(Math.abs(gov.govShake(calm, 0, 1) - 0.3) < 1e-9, 'walking shakes x0.3');
  assert.equal(gov.govPunch(calm, 1000), false, 'no punch while calm');
});

test('perf tier: first 60 frames pick lite on missed vsyncs; later only steps down, with hysteresis', () => {
  const fast = tier.createTierProbe();
  for (let i = 0; i < 200; i++) tier.tierFrame(fast, 16.7);
  assert.equal(fast.tier, tier.TIER_FULL);
  assert.equal(fast.decided, true);

  const slow = tier.createTierProbe();
  let changed = false;
  for (let i = 0; i < 100; i++) changed = tier.tierFrame(slow, i % 10 === 0 ? 25 : 16.7) || changed;
  assert.equal(slow.tier, tier.TIER_LITE, '10% missed vsyncs -> lite');
  assert.ok(changed);

  const spiky = tier.createTierProbe();
  for (let i = 0; i < 100; i++) tier.tierFrame(spiky, i === 50 ? 900 : 16.7);
  assert.equal(spiky.tier, tier.TIER_FULL, 'a single app-switch hitch is ignored');

  // Later degradation: needs a full window over threshold * 1.15 and a cooldown.
  const p = tier.createTierProbe();
  for (let i = 0; i < 100; i++) tier.tierFrame(p, 16.7);
  for (let i = 0; i < 100; i++) tier.tierFrame(p, 17);
  assert.equal(p.tier, tier.TIER_FULL, 'marginal frames do not flip the tier');
  for (let i = 0; i < 400; i++) tier.tierFrame(p, 24);
  assert.equal(p.tier, tier.TIER_LITE);
  for (let i = 0; i < 400; i++) tier.tierFrame(p, 12);
  assert.equal(p.tier, tier.TIER_LITE, 'never steps back up mid-run');

  const forced = tier.createTierProbe();
  forced.forced = 2;
  assert.equal(tier.tierFrame(forced, 10), true);
  assert.equal(forced.tier, 2);
  assert.equal(tier.tierCount(tier.TIER_LITE, 16), 8);
  assert.equal(tier.tierCount(tier.TIER_MIN, 2), 1, 'never rounds a requested burst to zero');
  assert.equal(tier.TIER_SCALES[2].shaders, false);
});

test('ribbon trail: ages out, skips jitter, builds a tapering strip with fading alpha', () => {
  const t = trail.createTrail(8, 300, 3);
  trail.trailPush(t, 0, 0, 0);
  trail.trailPush(t, 1, 0, 10);
  assert.equal(t.size, 1, 'sub-minDist jitter is merged');
  for (let i = 1; i <= 10; i++) trail.trailPush(t, i * 10, 0, i * 20);
  assert.equal(t.size, 8, 'ring capped');
  const xs = [];
  const ys = [];
  const ag = [];
  const n = trail.trailPoints(t, 200, xs, ys, ag);
  assert.ok(n >= 2 && n <= 8);
  assert.equal(xs[0], 100, 'newest first');
  assert.ok(ag[0] < ag[n - 1], 'older points are older');
  assert.equal(trail.trailPoints(t, 5000, xs, ys, ag), 0, 'everything ages out');

  const out = [];
  const al = [];
  const v = trail.buildStrip([0, 50, 100], [0, 0, 0], 3, { head: 20, tail: 4, taperIn: 0, grow: 0 }, out, al);
  assert.equal(v, 6);
  assert.equal(Math.abs(out[1] - out[3]), 20, 'head width 20');
  assert.ok(Math.abs(Math.abs(out[9] - out[11]) - 4) < 1e-9, 'tail width 4');
  const outGrow = [];
  trail.buildStrip([0, 50, 100], [0, 0, 0], 3, { head: 20, tail: 4, taperIn: 0, grow: 2 }, outGrow, al);
  assert.equal(Math.abs(outGrow[1] - outGrow[3]), 24, 'outline pass grows 2 px per side');
  const taper = [];
  trail.buildStrip([0, 50, 100], [0, 0, 0], 3, { head: 20, tail: 20, taperIn: 0.5, grow: 0 }, taper, al);
  assert.equal(Math.abs(taper[1] - taper[3]), 0, 'brush start tapers in from 0');
  assert.equal(trail.buildStrip([0], [0], 1, { head: 1, tail: 1, taperIn: 0, grow: 0 }, out, al), 0);

  const qx = [];
  const qy = [];
  assert.equal(trail.quadPolyline(0, 0, 50, -50, 100, 0, 10, qx, qy), 11);
  assert.equal(qx[10], 100);
  assert.equal(trail.ringPolyline(0, 0, 10, 12, qx, qy), 13);
  assert.ok(Math.abs(Math.hypot(qx[5], qy[5]) - 10) < 1e-9);
});

test('afterimages: every 30 ms, newest strongest, expire after life', () => {
  const a = trail.createAfterimages(4, 30, 160);
  assert.equal(trail.afterimagePush(a, 0, 1, 1), true);
  assert.equal(trail.afterimagePush(a, 10, 2, 2), false);
  trail.afterimagePush(a, 30, 3, 3);
  assert.ok(trail.afterimageAlpha(a, 1, 40) > trail.afterimageAlpha(a, 0, 40));
  assert.equal(trail.afterimageAlpha(a, 0, 400), 0);
  assert.equal(trail.afterimageAlpha(a, 3, 40), 0, 'empty slot');
});

test('colour guard: dark, navy and purple team colours become bright; bright ones pass', () => {
  assert.equal(color.brightTeamColor('#ffcf3b'), '#ffcf3b');
  assert.equal(color.brightTeamColor('3db8ff'), '#3db8ff');
  assert.equal(color.brightTeamColor('#6a1b9a'), color.BRIGHT.sky, 'purple -> sky');
  assert.equal(color.brightTeamColor('#b0208f'), color.BRIGHT.coral, 'magenta-violet -> coral');
  assert.equal(color.brightTeamColor('#0b3a66'), color.BRIGHT.sky, 'navy -> sky');
  assert.equal(color.brightTeamColor('#111111'), color.BRIGHT.gold, 'near black -> gold');
  assert.equal(color.brightTeamColor('not a colour'), color.BRIGHT.gold);
  assert.equal(color.isPurple('#8e44ad'), true);
  assert.equal(color.isPurple('#3db8ff'), false);
  assert.ok(Math.abs(color.contrastRatio('#000000', '#ffffff') - 21) < 1e-9);
  assert.ok(color.contrastRatio(color.BRIGHT.ink, color.BRIGHT.skyLight) >= 3, 'navy ink reads on the pale sky');
  assert.equal(color.pickReadable(['#ffffff', '#0b3a66'], ['#bfeaff', '#3db8ff'], 3), '#0b3a66');
  assert.equal(color.mixHex('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(color.lighten('#ff0000', 1), '#ffffff');
});

test('hit test: nearest target wins with forgiveness; a bump between two cards is ignored', () => {
  const xs = [100, 200, 300];
  const ys = [100, 100, 100];
  const rs = [40, 40, 40];
  assert.equal(hit.nearestTarget(xs, ys, rs, null, 3, 110, 104), 0);
  assert.equal(hit.nearestTarget(xs, ys, rs, null, 3, 100, 150), hit.MISS, 'outside radius');
  assert.equal(hit.nearestTarget(xs, ys, rs, null, 3, 100, 145, { forgiveness: 1.2 }), 0, 'walking forgiveness catches it');
  assert.equal(hit.nearestTarget(xs, ys, rs, [0, 1, 1], 3, 110, 100), hit.MISS, 'dead targets are skipped');
  assert.equal(hit.nearestTarget(xs, ys, rs, null, 3, 150, 100, { forgiveness: 1.4 }), hit.AMBIGUOUS, 'dead centre between two');
  assert.equal(hit.nearestTarget(xs, ys, rs, null, 3, 138, 100, { forgiveness: 1.4 }), 0, 'inside one true radius wins');
  // Radius-normalized: a big target does not steal a tap on a small one.
  assert.equal(hit.nearestTarget([0, 60], [0, 0], [100, 20], null, 2, 55, 0), 1);
  assert.equal(hit.inRectForgiving(0, 0, 10, 10, 20, 20), false);
  assert.equal(hit.inRectForgiving(8, 20, 10, 10, 20, 20, 1.3), true);
  assert.equal(hit.swipeKind(10, 12, 300), hit.STROKE_TAP, 'a walking wobble is still a tap');
  assert.equal(hit.swipeKind(80, 0, 120), hit.STROKE_SWIPE);
  assert.equal(hit.swipeKind(80, 0, 900), hit.STROKE_DRAG);
  assert.equal(hit.swipeDir(-50, 10), 3);
  assert.equal(hit.swipeDir(5, -40), 0);
});

test('flip pose: face swaps at exactly 90 deg, edge strip only 70-110, landing squash', () => {
  const f0 = flip.flipPose(0);
  assert.equal(f0.angle, 0);
  assert.equal(f0.faceUp, false);
  assert.equal(f0.edge, 0);
  const mid = flip.flipPose(110);
  assert.ok(Math.abs(mid.angle - 90) < 1e-9);
  assert.equal(mid.faceUp, true);
  assert.equal(mid.edge, 1);
  assert.ok(mid.shadowStretch > 1.3);
  const done = flip.flipPose(220);
  assert.equal(done.angle, 180);
  assert.ok(done.squash <= 1);
  const land = flip.flipPose(265);
  assert.ok(land.squash < 0.975, 'squash dips toward 0.97');
  assert.equal(flip.flipPose(400).squash, 1);
  assert.equal(flip.flipPose(0, flip.FLIP_DEFAULT, true).angle, 180, 'reverse flips face-down');
  // Network hold: 60 deg, no wobble before 180 ms.
  assert.equal(flip.holdPose(110), 60);
  assert.equal(flip.holdPose(170), 60);
  assert.ok(flip.holdPose(220) !== 60);
  assert.ok(Math.abs(flip.holdPose(1000) - 60) <= 2);
  const d = flip.dealPose(0, 3);
  assert.equal(d.alpha, 0);
  const dd = flip.dealPose(1000, 3);
  assert.ok(Math.abs(dd.scale - 1) < 1e-9 && Math.abs(dd.rot) < 1e-9);
});

test('near miss: picks the most motivating true line, positive framing', () => {
  const t = { one: 1000, two: 2000, three: 3000 };
  assert.deepEqual(plain(near.nearMissLine({ score: 2100, thresholds: t, rival: { name: 'Sam', score: 1980 } })),
    { kind: 'beatRival', text: 'You beat Sam by 120', gap: 120 });
  assert.equal(near.nearMissLine({ score: 1900, thresholds: t, rival: { name: 'Sam', score: 2000 } }).kind, 'nearRival');
  assert.equal(near.nearMissLine({ score: 500, thresholds: t, rival: { name: 'Sam', score: 2000 } }).kind, 'nextStar',
    'a big gap to a rival falls through to the star goal');
  assert.equal(near.nearMissLine({ score: 1950, thresholds: t, best: 2500 }).text, 'Just 50 from star 2');
  assert.equal(near.nearMissLine({ score: 2300, thresholds: t, best: 2400 }).kind, 'nearBest');
  assert.equal(near.nearMissLine({ score: 2600, thresholds: t, best: 2400 }).kind, 'newBest');
  assert.equal(near.nearMissLine({ score: 3200, thresholds: t }).kind, 'maxed');
  assert.equal(near.nearMissLine({ score: 10 }).kind, 'none');
  for (const r of [near.nearMissLine({ score: 1, thresholds: t }), near.nearMissLine({ score: 1900, thresholds: t, rival: { name: 'A', score: 2000 } })]) {
    assert.ok(!/lost|lose|fail|worst/i.test(r.text));
  }
});
