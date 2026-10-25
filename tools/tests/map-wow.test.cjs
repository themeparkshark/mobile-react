const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/map-wow.test.cjs
// Dustin, Oct 24: "visually blow my mind with how fun it is ... how great the animations and polish is".
// The map and the catch: four-beat catch, getting warmer, the spawn pop and the rolling HUD counter.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const wow = loadTs('src/components/map/alive/mapWow.ts');
const motion = loadTs('src/ui/motion.ts');
// Objects from the loaded module live in another realm: compare them as plain data.
const plain = v => JSON.parse(JSON.stringify(v));

test('the catch: squash, three growing wobbles, a held beat, the burst inside 1.5 s and home inside 2.6 s', () => {
  const plan = wow.catchPlan({ reduced: false });
  assert.equal(plan.squashMs, motion.DURATION.tap);
  assert.ok(plan.squashTo < 0.9 && plan.squashTo > 0.8);
  assert.deepEqual(plain(plan.wobbles.map(w => w.deg)), [8, 12, 16], 'each wobble stronger than the last');
  for (let i = 1; i < plan.wobbles.length; i++) assert.ok(plan.wobbles[i].at - plan.wobbles[i - 1].at >= 150, 'wobbles never overlap');
  assert.equal(plan.burstAt - plan.hitStopAt, motion.DURATION.hitStop, 'one held 70 ms frame');
  assert.ok(plan.burstAt <= 1500, 'payoff inside 1.5 s');
  assert.ok(plan.landAt <= 2600, 'home inside 2.6 s');
  assert.ok(plan.burstScale >= 1.18 && plan.burstScale <= 1.35, 'prize overshoot in the shared range');
  assert.ok(plan.burstSparkles <= motion.PARTICLES.sparkles, 'sparkles within the cap');
  assert.ok(plan.flyAt - plan.burstAt <= 600, 'never a dead hold over 600 ms');
  assert.equal(plan.kickPt, 3);
  assert.equal(wow.catchPlan({ reduced: false, walking: true }).kickPt, 0, 'no screen kick while walking');
  assert.equal(wow.catchPlan({ reduced: false, calm: true }).kickPt, 0, 'no screen kick in calm power');
});

test('Reduce Motion: no wobble, no flight, a short fade; the haptics stay', () => {
  const plan = wow.catchPlan({ reduced: true });
  assert.equal(plan.wobbles.length, 0);
  assert.equal(plan.arcPt, 0);
  assert.ok(plan.landAt <= motion.DURATION.quick);
  const haptics = wow.catchHaptics(plan);
  assert.ok(haptics.some(h => h.intent === 'comboHeavy'), 'the burst still buzzes');
});

test('catch haptics climb tap, tick, light, medium, then the golden heavy and success 180 ms later', () => {
  const plan = wow.catchPlan({ reduced: false });
  const h = wow.catchHaptics(plan);
  assert.deepEqual(plain(h.map(s => s.intent)), ['tapLight', 'tickSelection', 'tapLight', 'hitMedium', 'comboHeavy', 'success']);
  assert.deepEqual(plain(h.map(s => s.at)), [0, 200, 350, 480, plan.burstAt, plan.burstAt + 180]);
  for (let i = 1; i < h.length; i++) assert.ok(h[i].at - h[i - 1].at >= 120, 'one haptic per 120 ms gate');
  const walking = wow.catchHaptics(plan, { walking: true });
  assert.equal(walking[3].intent, 'tapLight', 'walking drops one rung');
  assert.ok(!h.some(s => s.intent === 'failBuzz'), 'no error buzz in a catch');
});

test('wobbleAt alternates sides and peaks at each wobble strength', () => {
  const plan = wow.catchPlan({ reduced: false });
  const peaks = plan.wobbles.map(w => wow.wobbleAt(w.at + 75, plan.wobbles));
  assert.deepEqual(plain(peaks.map(p => Math.round(p))), [8, -12, 16]);
  assert.equal(wow.wobbleAt(10, plan.wobbles), 0);
  assert.equal(wow.wobbleAt(900, plan.wobbles), 0);
});

test('the flight arc starts at the find, ends at home and rises above both', () => {
  const from = { x: 200, y: 500 }, to = { x: 60, y: 60 };
  assert.deepEqual(plain(wow.arcPoint(from, to, 80, 0)), from);
  assert.deepEqual(plain(wow.arcPoint(from, to, 80, 1)), to);
  const mid = wow.arcPoint(from, to, 80, 0.5);
  assert.ok(mid.y < (from.y + to.y) / 2, 'bows upward');
});

test('getting warmer: four bands by distance, each brighter and livelier than the last', () => {
  assert.equal(wow.findBand(400, false), 'far');
  assert.equal(wow.findBand(null, false), 'far');
  assert.equal(wow.findBand(120, false), 'mid');
  assert.equal(wow.findBand(40, false), 'near');
  assert.equal(wow.findBand(400, true), 'inRange');
  const order = ['far', 'mid', 'near', 'inRange'].map(b => wow.BAND_LOOK[b]);
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i].level > order[i - 1].level);
    assert.ok(order[i].halo >= order[i - 1].halo, 'the halo only grows');
    assert.ok(order[i].opacity >= order[i - 1].opacity);
  }
  assert.equal(order[0].halo, 0, 'far finds have no glow');
  assert.ok(order[3].rings && !order[2].rings, 'only in range calls with rings');
  assert.equal(wow.BAND_FADE_MS, motion.DURATION.base, 'bands cross-fade, never snap');
});

test('in-range rings expand 1.0 to 2.2 and fade, two of them half a beat apart', () => {
  const a = wow.ringAt(0, 0), b = wow.ringAt(1099, 0);
  assert.equal(a.scale, 1);
  assert.ok(Math.abs(a.opacity - 0.5) < 1e-9);
  assert.ok(b.scale > 2.1 && b.opacity < 0.01);
  const second = wow.ringAt(550, 1);
  assert.equal(second.scale, 1, 'the second ring starts 550 ms later');
});

test('the in-range hop is a quick jump then rest, so a field of finds stays calm', () => {
  let still = 0;
  for (let t = 0; t < 2400; t += 10) if (wow.hopAt(t, 2400, 0).lift === 0) still++;
  assert.ok(still / 240 > 0.7, 'mostly at rest');
  assert.ok(wow.hopAt(180, 2400, 0).lift > 0.99, 'peaks mid-jump');
  assert.ok(wow.hopAt(400, 2400, 0).squash > 0.5, 'squashes on landing');
});

test('the spawn pop: finds arriving together stagger 90 ms, at most 5 pop, the rest fade in', () => {
  const clock = wow.newSpawnClock();
  const booked = Array.from({ length: 7 }, () => wow.bookSpawn(clock, 1000));
  assert.deepEqual(plain(booked.slice(0, 5).map(b => b.delay)), [0, 90, 180, 270, 360]);
  assert.ok(booked.slice(0, 5).every(b => b.pop));
  assert.ok(booked.slice(5).every(b => !b.pop));
  assert.deepEqual(plain(wow.bookSpawn(clock, 5000)), { delay: 0, pop: true }, 'a later wave starts fresh');
  assert.ok(wow.SPAWN.overshoot >= 1.18 && wow.SPAWN.overshoot <= 1.35);
});

test('the odometer rolls only the digits that change, ones first, 30 ms per column', () => {
  const cols = wow.digitColumns('1,349', '1,374');
  assert.deepEqual(plain(cols.map(c => c.to).join('')), '1,374');
  assert.deepEqual(plain(cols.map(c => c.rolls)), [false, false, false, true, true]);
  assert.equal(cols[4].delay, 0, 'the ones roll first');
  assert.equal(cols[3].delay, motion.COUNT.digitStaggerMs);
  const grow = wow.digitColumns('999', '1,000');
  assert.equal(grow.length, 5);
  assert.equal(grow[0].from, null, 'a new leading digit appears');
  assert.equal(wow.rollMs(10, 35), motion.COUNT.ms);
  assert.ok(wow.rollMs(35, 10) < wow.rollMs(10, 35), 'a spend rolls down quicker and quieter');
});

test('the HUD chip rolls on the UI thread and waits for its coins (no per-frame setState)', () => {
  const chip = read('src/components/Topbar/Currency.tsx');
  assert.ok(!/requestAnimationFrame\(tick\)/.test(chip), 'the old JS-thread tick is gone');
  assert.match(chip, /RollingDigits/);
  assert.match(chip, /HUD_BUMP\.peak/);
  assert.match(chip, /onHudPulse/);
  const fly = read('src/context/CurrencyFlyProvider.tsx');
  assert.match(fly, /holdHud\(targetPosition/);
  assert.match(fly, /pulseHud\(targetPosition\)/);
  const digits = read('src/components/Topbar/RollingDigits.tsx');
  assert.ok(!/onLayout/.test(digits), 'no layout callbacks on animated views');
});

test('the catch uses the shared motion language and never punishes a miss', () => {
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  assert.match(src, /catchPlan\(/);
  assert.match(src, /flashPeak\(isDimFlashingLightsEnabled\(\)/, 'the flash respects Dim Flashing Lights');
  assert.match(src, /momentParticles\(PARTICLES\.sparkles/, 'sparkles go through the power budget');
  assert.match(src, /<CatchBurst /, "the gold is the hand-inked fan on a bloom, drawn by the burst canvas");
  assert.match(read('src/screens/ExploreScreen/CatchBurst.tsx'), /<CatchRaysArt size=\{goldSize\} bloomOnly \/>/);
  const common = src.slice(src.indexOf('const plan = catchPlan('), src.indexOf("catchMark('fly')"));
  assert.ok(!/failBuzz/.test(common), 'a missed common catch is soft, never an error buzz');
});

test('the map shark breathes on the shared clock and rests in the background', () => {
  const map = read('src/components/Map.tsx');
  assert.match(map, /AMBIENT\.breathMs/);
  assert.match(map, /!appActive\)/);
  assert.match(map, /\[shark-life\] rest/);
  assert.match(map, /contact = m\.wake\.value/);
});

// Round 2 (panel blockers): the catch settles inside 2.6 s, later catches are short, the coins come out of
// the find, the header never moves for a common, nothing blinks.
test('round 2: the first catch settles by 2.6 s with no still hold over 600 ms; repeats finish in about 1.4 s', () => {
  const first = wow.catchPlan({ reduced: false });
  assert.equal(first.repeat, false);
  assert.ok(first.doneAt <= 2600, `first catch done by 2.6 s (${first.doneAt})`);
  assert.equal(first.coinsAt, first.burstAt, 'the coins leave on the burst frame');
  assert.ok(first.tickAt > first.landAt && first.tickAt - first.landAt <= 600, 'the set bar ticks soon after the find lands');
  assert.ok(first.exitAt - first.tickAt <= 600, 'never a still hold over 600 ms before the badge leaves');
  assert.ok(first.exitMs < motion.DURATION.enter, 'exits are faster than entrances');
  const again = wow.catchPlan({ reduced: false, repeat: true });
  assert.equal(again.repeat, true);
  assert.equal(again.wobbles.length, 2, 'the repeat wobbles twice');
  assert.ok(again.doneAt <= 1400 && again.doneAt >= 1200, `repeat settled by 1.4 s (${again.doneAt})`);
  assert.ok(again.burstAt < first.burstAt && again.burstAt - again.hitStopAt === motion.DURATION.hitStop, 'the repeat keeps its held frame');
  assert.ok(again.burstScale >= 1.18 && again.burstScale <= 1.35);
  const h = wow.catchHaptics(again);
  assert.deepEqual(plain(h.map(s => s.intent)), ['tapLight', 'tickSelection', 'hitMedium', 'comboHeavy', 'success']);
  for (let i = 1; i < h.length; i++) assert.ok(h[i].at - h[i - 1].at >= 120, 'one haptic per 120 ms gate');
  const reduced = wow.catchPlan({ reduced: true, repeat: true });
  assert.ok(reduced.doneAt <= 1300 && reduced.wobbles.length === 0);
});

test('round 2: the coin stream bursts out of the find and lands one coin after another in the counter', () => {
  const s = wow.coinStreamPlan(25, false);
  assert.equal(s.count, wow.COIN_STREAM.max, 'at most 8 coins fly, whatever the amount');
  assert.equal(wow.coinStreamPlan(3, false).count, 3, 'a small win flies its real number of coins');
  assert.equal(wow.coinStreamPlan(0, false).count, 0);
  assert.equal(wow.coinStreamPlan(10, true).count, 0, 'Reduce Motion: no flight, the counter just rolls');
  for (let i = 1; i < s.landAt.length; i++) assert.equal(s.landAt[i] - s.landAt[i - 1], 40, '40 ms apart');
  const first = wow.catchPlan({ reduced: false });
  assert.ok(first.coinsAt + s.landAt[s.landAt.length - 1] < first.doneAt, 'every coin is home before the moment ends');
  const from = { x: 200, y: 500 }, to = { x: 40, y: 20 };
  const start = wow.coinStreamAt(1, 0, 8, from, to);
  assert.ok(Math.abs(start.x - from.x) < 3 && Math.abs(start.y - from.y) < 3, 'starts at the find (never a screen corner)');
  const sprayEnd = wow.coinStreamAt(wow.COIN_STREAM.sprayMs - 1, 3, 8, from, to);
  assert.ok(sprayEnd.y < from.y, 'the spray goes up, toward the counter');
  const near = wow.coinStreamAt(s.landAt[0] - 5, 0, 8, from, to);
  assert.ok(Math.hypot(near.x - to.x, near.y - to.y) < 12, 'arrives at the counter');
  assert.equal(wow.coinStreamAt(s.landAt[0] + 5, 0, 8, from, to), null, 'gone once landed');
  assert.equal(wow.coinStreamAt(10, 3, 8, from, to), null, 'later coins wait their turn');
});

test('round 2: a common catch never moves the header or the tab bar, can be skipped, and the halo never blinks', () => {
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  const effect = src.slice(src.indexOf('const { item, pivotId } = request;'), src.indexOf('A new request (or a retry'));
  const rideBranch = effect.slice(effect.indexOf("if (catchStyleFor(item.rarity) === 'ride_photo')"), effect.indexOf('dimCatchChrome(true)'));
  assert.match(rideBranch, /showCatchChrome\(true\)/, 'only the full-screen viewfinder slides the chrome away');
  const commonPart = effect.slice(effect.indexOf('dimCatchChrome(true)'));
  assert.ok(!/showCatchChrome\(true\)/.test(commonPart), 'a common keeps the header where the coins land');
  assert.match(src, /Math\.max\(0\.4 \* on/, 'the halo holds a floor once the catch starts');
  assert.match(src, /Gesture\.Tap\(\)[\s\S]{0,80}onBegin\(\(\) => \{\s*'worklet';\s*if \(clockOn\.value\) skipToEnd\(\);/, 'tap anywhere skips after the burst, on the UI thread');
  assert.match(src, /onAccessibilityTap=\{onSkip\}/, 'VoiceOver can still skip');
  assert.match(src, /targetRef\.current/, 'the stable callbacks read the badge spot through a ref (no stale top-left start)');
  assert.match(commonPart, /streamHud\('coins'/, 'coins leave from the find on the burst');
  const wrapper = read('src/components/Wrapper.tsx');
  assert.match(wrapper, /1 - 0\.4 \* catchDim\.value/, 'the tab bar softens in place');
  const chip = read('src/components/Topbar/Currency.tsx');
  assert.ok(!/shadowRadius: 10/.test(chip), 'the gain glow is a texture, not a live shadow');
  assert.match(chip, /kind === 'punch'/);
  const map = read('src/components/Map.tsx');
  assert.match(map, /const DecorationLayer = memo\(/, 'trees are not re-sent to MapLibre on every Map render');
  assert.match(map, /decoFrozen\.current\) return/, 'no re-plant under a catch');
});

test('round 2: the shark has character beats (fin flick, a look toward a find, a hop for a new find)', () => {
  const life = loadTs('src/components/map/sharkLife.ts');
  const seven = [0, 1, 2, 3, 4, 5, 6].map(n => life.nextFidget(n, false));
  assert.ok(seven.includes('flick') && seven.includes('look') && seven.includes('hop'));
  for (let i = 1; i < seven.length; i++) assert.notEqual(seven[i], seven[i - 1], 'never the same beat twice in a row');
  const map = read('src/components/Map.tsx');
  assert.match(map, /mood === 'flick'/);
  assert.match(map, /lookRef\.current/);
  assert.match(map, /sharkHop > hopSeen\.current/);
});

// Round 3 (panel blockers): one UI-thread clock drives every beat, the pin never blinks, the counter never
// rewinds, the burst stays on screen and the badge waits for it.
const sample = (plan, step = 8) => {
  const out = [];
  for (let t = 0; t <= plan.doneAt; t += step) out.push({ t, f: wow.catchFrame(t, plan) });
  return out;
};

test('round 3: the catch is one function of the clock: squash, wobbles, held flash, a 2x hero pop, home, settled by 2.6 s', () => {
  const plan = wow.catchPlan({ reduced: false });
  const f0 = wow.catchFrame(0, plan);
  assert.equal(f0.squash, 0, 'the copy starts exactly as the pin looked');
  assert.ok(Math.abs(wow.catchFrame(plan.squashMs, plan).squash - 1) < 1e-6, 'full squash at 90 ms');
  const w = plan.wobbles.map(x => Math.round(wow.catchFrame(x.at + 75, plan).wobble));
  assert.deepEqual(plain(w), [8, -12, 16], 'three growing wobbles, alternating');
  assert.ok(wow.catchFrame(plan.hitStopAt + 40, plan).flash > 0.99, 'the flash peaks on the held frame');
  const hero = wow.catchFrame(plan.burstAt + 90, plan).scale;
  assert.ok(hero > 2 && hero < 2.2, `the find pops to about 2x on the burst (${hero})`);
  assert.ok(Math.abs(wow.catchFrame(plan.flyAt - 1, plan).scale - plan.heroScale) < 0.05, 'it settles at its hero size before flying');
  assert.ok(Math.abs(wow.catchFrame(plan.landAt, plan).scale - plan.landScale) < 1e-6, 'it lands at sticker size');
  assert.ok(plan.burstAt <= 1500 && plan.doneAt <= 2600, 'payoff inside 1.5 s, settled inside 2.6 s');
  const r = wow.catchPlan({ reduced: false, repeat: true });
  assert.ok(r.doneAt <= 1450, `the repeat is about 1.4 s (${r.doneAt})`);
});

test('round 3: one celebration at a time: the badge rises only once the inked burst fades, and is in before the find lands', () => {
  for (const plan of [wow.catchPlan({ reduced: false }), wow.catchPlan({ reduced: false, repeat: true })]) {
    assert.ok(plan.suckAt + plan.suckMs <= plan.badgeAt, 'the ink is gone before the badge moves (round 4: no cross-fade)');
    assert.match(read('src/screens/ExploreScreen/CatchBurst.tsx'), /suck < 0\.7 \? 1/);
    assert.ok(plan.badgeAt + plan.badgeInMs <= plan.landAt, 'the slot is there when the find arrives');
    assert.equal(wow.catchFrame(plan.badgeAt - 1, plan).badge, 0);
    assert.ok(wow.catchFrame(plan.landAt, plan).badge > 0.99);
  }
});

test('round 3: never a still hold over 600 ms between the tap and done', () => {
  for (const plan of [wow.catchPlan({ reduced: false }), wow.catchPlan({ reduced: false, repeat: true })]) {
    const frames = sample(plan);
    let still = 0, worst = 0;
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1].f, b = frames[i].f;
      const moved = Object.keys(a).some(k => Math.abs(a[k] - b[k]) > 1e-4);
      still = moved ? 0 : still + 8;
      worst = Math.max(worst, still);
    }
    assert.ok(worst <= 600, `longest still stretch ${worst} ms`);
  }
});

test('round 3: the stage keeps the whole burst on screen (never cut off at an edge)', () => {
  const area = { width: 402, top: 100, bottom: 700 };
  const r = 141;
  const left = wow.catchStage({ x: 20, y: 400 }, 24, area, r);
  assert.ok(left.x - r >= 12 && left.x + r <= area.width - 12, 'clamped inside the left and right edges');
  const high = wow.catchStage({ x: 200, y: 110 }, 24, area, r);
  assert.ok(high.y - r * 0.9 >= area.top, 'below the header');
  const low = wow.catchStage({ x: 200, y: 690 }, 24, area, r);
  assert.ok(low.y + r <= area.bottom, 'above the badge');
  const mid = wow.catchStage({ x: 201, y: 400 }, 24, area, r);
  assert.deepEqual(plain(mid), { x: 201, y: 376 }, 'a find already in a good spot simply rises');
});

test('round 3: the counter rolls on the same clock, starts on the first landing and never shows a lower number', () => {
  const lands = [700, 740, 780];
  assert.equal(wow.hudPunch(699, lands), 1, 'still before the first coin');
  assert.ok(wow.hudPunch(700 + 30, lands) > 1.05, 'the first coin punches');
  assert.ok(Math.abs(wow.hudPunch(780 + 60, lands) - 1.22) < 1e-6, 'the last coin lands the full HUD bump');
  assert.equal(wow.rollPos(600, 700, 6, 7, 650), 6, 'holds the old digit until the first coin lands');
  let prev = 6;
  for (let t = 700; t <= 1400; t += 10) {
    const v = wow.rollPos(t, 700, 6, 7, 650);
    assert.ok(v >= 6, 'never below the old digit');
    if (t < 700 + 650 * 0.82) assert.ok(v >= prev - 1e-9, 'rolls forward');
    prev = v;
  }
  assert.ok(wow.rollPos(700 + 200, 700, 6, 7, 650) > 6.3 && wow.rollPos(700 + 200, 700, 6, 7, 650) < 7, 'a visible partial digit mid-roll');
  assert.equal(wow.rollPos(2000, 700, 6, 7, 650), 7);
  assert.ok(wow.hudGlow(700 + 160, 700) > 0.49 && wow.hudGlow(699, 700) === 0, 'the gold glow starts with the first coin');
});

test('round 3: no JS timer paces the catch; the pin hides only after the layer drew it; the chip plans its roll from the stream', () => {
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  assert.match(src, /useDerivedValue\(\(\) => catchFrame\(cc\.value, planSV\.value\)\)/, 'every view derives from one clock');
  assert.match(src, /runOnUI\(startClock\)/);
  assert.match(src, /runOnJS\(onBeat\)/, 'haptics and sounds come off the clock');
  const effect = src.slice(src.indexOf('const { item, pivotId } = request;'), src.indexOf('A new request (or a retry'));
  const caught = effect.slice(effect.indexOf('const data = settled.data;'));
  assert.ok(!/await (wait|pause)\(/.test(caught), 'no awaited JS waits between the answer and done');
  assert.ok(!/setTimeout\(\(\) => \{ if \(i === 0\)/.test(src), 'no per-coin JS timers');
  const explore = read('src/screens/ExploreScreen/HomeExplore.tsx');
  assert.ok(!/hidden=\{catchingPivot === /.test(explore), 'the pin is not hidden on the tap commit');
  assert.match(src, /catchHidePivot\.value = pivot/, 'the pin hides on the UI thread when the copy starts moving');
  assert.match(src, /onDisplay=\{onCopyShown\}/, 'the pin hands over to the copy once it has drawn');
  assert.match(read('src/screens/ExploreScreen/PrepItem.tsx'), /catchHidePivot\.value === myPivot/);
  const marker = read('src/screens/ExploreScreen/HomeFindMarker.tsx');
  assert.match(marker, /squashFind\(item\.pivot_id\)/, 'the pin itself squishes on the tap frame');
  const chip = read('src/components/Topbar/Currency.tsx');
  assert.match(chip, /event\.kind === 'stream'/);
  assert.match(chip, /hudPunch\(hudClock\.value/);
  const digits = read('src/components/Topbar/RollingDigits.tsx');
  assert.ok(!/pos\.value % 10/.test(digits), 'the roll never starts from a live read of the column (the 370, 360, 370 rewind)');
  assert.match(digits, /rollPos\(hudClock\.value/);
  const find = read('src/screens/ExploreScreen/PrepItem.tsx');
  assert.match(find, /mapGlowColor\(prepItem\.rarity\)/, 'map glows stay in the house palette');
  const pres = loadTs('src/screens/ExploreScreen/findPresentation.ts');
  for (const c of Object.values(pres.MAP_GLOW_COLORS)) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
    assert.ok(!(r > 150 && b > 150 && g < 120), `${c} is not purple or magenta`);
  }
});

test('round 3: Battery Saver thins the coin stream to 3 or 4 coins', () => {
  assert.equal(wow.coinStreamPlan(10, false, 3).count, 3);
  assert.equal(wow.coinStreamPlan(10, false).count, 8);
  assert.equal(wow.coinStreamPlan(2, false, 4).count, 2);
});

// Round 4 (panel fixes): a clean burst exit, readable coins, honest badge, a goal after every catch, milestone
// variety, a hand-drawn beam, a map kick and the controls coming back one after another.
test('round 4: the burst exits in one clean beat: ink and rays hold full, suck into the find, then the badge pops', () => {
  for (const plan of [wow.catchPlan({ reduced: false }), wow.catchPlan({ reduced: false, repeat: true })]) {
    assert.ok(plan.suckMs >= 90 && plan.suckMs <= 130, 'about 120 ms of suck');
    assert.equal(wow.catchFrame(plan.suckAt - 1, plan).gold, 1, 'rays at full strength until the suck');
    assert.equal(wow.catchFrame(plan.suckAt + plan.suckMs, plan).gold, 0, 'gone once sucked in');
    assert.equal(plan.badgeAt, plan.suckAt + plan.suckMs, 'the badge pops on the frame the rays are gone');
    assert.equal(plan.flyAt, plan.badgeAt, 'the suck is the anticipation for the flight');
    assert.equal(wow.catchFrame(plan.badgeAt + 70, plan).badge, 1, 'fully opaque within 70 ms (never ghosting)');
    let peak = 0;
    for (let t = plan.badgeAt; t < plan.exitAt; t += 4) peak = Math.max(peak, wow.catchFrame(t, plan).badgeScale);
    assert.ok(peak > 1.02 && peak < 1.12, `one visible overshoot (${peak.toFixed(3)})`);
    assert.ok(plan.burstAt <= 1500 && plan.doneAt <= 2600);
  }
});

test('round 4: coins spray past the ray tips, 40 pt inked coins that shrink as they land', () => {
  assert.ok(wow.COIN_STREAM.sprayPt >= 120, 'out past the inked burst');
  assert.equal(wow.COIN_STREAM.sizePt, 40);
  const from = { x: 200, y: 500 }, to = { x: 40, y: 20 };
  const spray = wow.coinStreamAt(wow.COIN_STREAM.sprayMs - 1, 0, 8, from, to);
  assert.ok(Math.hypot(spray.x - from.x, spray.y - from.y) > 110, 'each coin stands clear of the find on the burst frame');
  const near = wow.coinStreamAt(wow.COIN_STREAM.sprayMs + wow.COIN_STREAM.flightMs - 4, 0, 8, from, to);
  assert.ok(near.scale < 0.7 && near.scale > 0.55, 'about 25 pt when it lands in the chip');
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  assert.match(src, /assets\/icons\/game\/coin\.png/, 'Alex\'s single inked coin, not the chip\'s coin pile');
});

test('round 4: milestone variety (never chance): stars every 5th, the beam every 10th, grand on the 25th', () => {
  const kinds = new Set();
  for (let n = 1; n <= 50; n++) {
    const v = wow.burstVariant(n);
    kinds.add(v.kind);
    assert.equal(v.beam, n % 10 === 0 || n % 25 === 0, `beam only on milestones (${n})`);
    assert.ok(v.stars <= wow.BURST_STARS_MAX && v.rings >= 1 && v.rings <= wow.BURST_RINGS_MAX);
    assert.deepEqual(plain(wow.burstVariant(n)), plain(v), 'deterministic');
  }
  assert.ok(kinds.size >= 4, 'at least four looks across 50 catches');
  assert.equal(wow.burstVariant(25).kind, 'grand');
  assert.equal(wow.burstVariant(5).kind, 'stars');
  assert.ok(wow.burstVariant(25).inkScale > wow.burstVariant(10).inkScale && wow.burstVariant(10).inkScale > 1);
  const plan = wow.catchPlan({ reduced: false, repeat: true, milestone: true });
  const drop = wow.beamAt(plan.hitStopAt - 1, plan);
  assert.ok(drop.drop > 0.98, 'the beam head reaches the find on the held frame');
  assert.equal(wow.beamAt(plan.hitStopAt - 301, plan), null);
  assert.equal(wow.beamAt(plan.hitStopAt + 500, plan), null, 'gone after its fade');
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  assert.match(src, /const BeamColumn = memo/, 'a drawn, tapered column of light, not a flat bar');
  assert.match(src, /strokeWidth=\{2\.5\}/, 'inked edges');
  assert.ok(!/BEAM_EVERY/.test(src));
});

test('round 4: the burst kicks the map (KICK), not while walking or calm; milestones kick the full KICK.maxPt', () => {
  const plan = wow.catchPlan({ reduced: false });
  let peak = 0;
  for (let t = plan.burstAt; t < plan.burstAt + 200; t += 4) peak = Math.max(peak, Math.abs(wow.catchFrame(t, plan).shake));
  assert.ok(peak > 2 && peak <= 3, `a visible 3 pt kick (${peak.toFixed(2)})`);
  assert.equal(wow.catchFrame(plan.burstAt + motion.KICK.ms + 1, plan).shake, 0, 'over inside KICK.ms');
  assert.equal(wow.catchPlan({ reduced: false, milestone: true }).kickPt, motion.KICK.maxPt);
  assert.equal(wow.catchPlan({ reduced: false, milestone: true, walking: true }).kickPt, 0);
  assert.equal(wow.catchPlan({ reduced: true, milestone: true }).kickPt, 0);
  const map = read('src/components/Map.tsx');
  assert.match(map, /catchKickX\.value/, 'Map.tsx moves the map layer with the kick');
});

test('round 4: the controls come back one after another, popping from 0.85 with one small overshoot', () => {
  const pres = wow;
  const total = pres.CHROME_BACK.stepMs * (pres.CHROME_BACK.slots - 1) + pres.CHROME_BACK.popMs;
  const at = (slot, ms) => pres.chromeBack(slot, 0, 1 - ms / total, 1);
  assert.equal(at(0, 0).opacity, 0);
  assert.ok(at(0, 120).opacity === 1 && at(3, 120).opacity === 0, 'the HUD goal comes back first, the last slot waits');
  assert.ok(Math.abs(at(2, 60).scale - pres.CHROME_BACK.from) < 0.02, 'from 0.85');
  let peak = 0;
  for (let ms = 0; ms <= total; ms += 4) peak = Math.max(peak, at(1, ms).scale);
  assert.ok(peak > 1.005 && peak < 1.05, `one small overshoot (${peak.toFixed(3)})`);
  assert.equal(at(3, total).scale, 1);
  assert.deepEqual(plain(pres.chromeBack(1, 0, 1, 0)), { opacity: 0, scale: 1 }, 'hidden while the catch plays');
});

test('round 4: an honest badge and a goal after every catch; +N on the header blue; far finds sleep', () => {
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  assert.match(src, /frame\.value\.barGlow \* isNewSV\.value/, 'a repeat find never flashes a fill that did not happen');
  assert.match(src, /if \(next\.isNew\) list\.push\(\{ at: plan\.tickAt, kind: BEAT\.tick/);
  assert.match(src, /coinStamp != null/, 'a repeat find stamps its coins on the badge instead');
  assert.match(src, /total - collected === 1/, 'one more to finish: the last stretch glows');
  assert.match(src, /backgroundColor: BRAND\.blue, borderWidth: 3, borderColor: BRAND\.gold/, 'the badge wears the house blue and gold');
  assert.match(src, /kind: BEAT\.exit/, 'the controls start back as the badge leaves');
  const chips = read('src/screens/ExploreScreen/HomeHudChips.tsx');
  assert.match(chips, /stampPip/, 'the freshly filled ticket pip stamps in gold');
  const explore = read('src/screens/ExploreScreen/HomeExplore.tsx');
  assert.match(explore, /useChromeBack\(0\)/);
  const chip = read('src/components/Topbar/Currency.tsx');
  assert.match(chip, /plusAnchor/, '+N sits just right of the chip, on the header blue (round 5: on an anchor after the pill)');
  const find = read('src/screens/ExploreScreen/PrepItem.tsx');
  assert.match(find, /const tick = live \? clock : still/, 'a far find stops reading the map clock');
});

test('round 4: nothing on the catch path re-renders mid-catch (the caught pin, the coins)', () => {
  assert.match(read('src/screens/ExploreScreen/HomeExplore.tsx'), /cascadeOn && prepItem\.pivot_id !== catchingPivot/);
  assert.match(read('src/screens/ExploreScreen/HomeCatchPreviewScreen.tsx'), /cascadeOn && item\.pivot_id !== request\?\.pivotId/);
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  assert.match(src, /const StreamCoin = memo\(/);
  assert.match(src, /!c\.on && styles\.gateOff/, 'a finished badge is gated off in the done commit');
});


// Round 5 (panel blockers and fixes): a readable counter, no stale frames after commits, snappier repeats,
// hand-inked gold with a bloom, and every catch ends on the next goal.
test('round 5: odometer digits fade inside the pill instead of relying on a clip', () => {
  assert.equal(wow.digitCellOpacity(0), 1);
  assert.equal(wow.digitCellOpacity(0.1), 1);
  assert.ok(wow.digitCellOpacity(0.4) > 0 && wow.digitCellOpacity(0.4) < 1);
  assert.equal(wow.digitCellOpacity(0.6), 0, 'a digit half a line away is already gone (well inside the rim)');
  assert.equal(wow.digitCellOpacity(-1), 0);
  const src = fs.readFileSync(path.join(root, 'src/components/Topbar/RollingDigits.tsx'), 'utf8');
  assert.match(src, /digitCellPose\(at - v\)/, 'each rolling cell takes its pose from its distance (wave 5)');
  assert.doesNotMatch(src, /const STRIP/, 'no 20-digit strip that can draw past the pill');
});

// Wave 5, round 1: the counter never shows a half digit, it pops once when it lands, and the next goal is big enough to read.
test('wave 5: exactly one whole digit shows on every frame of a roll', () => {
  for (let v = 5; v <= 6; v += 0.01) {
    let shown = 0;
    for (let at = 4; at <= 7; at++) {
      const pose = wow.digitCellPose(at - v);
      if (pose.opacity > 0) { shown += 1; assert.equal(pose.opacity, 1, 'never a faded digit'); }
      assert.ok(Math.abs(pose.y) <= 0.21 && pose.sy >= 0.75, 'a short squashed slide that stays inside the pill');
    }
    assert.ok(shown <= 1, `at most one digit at ${v.toFixed(2)}`);
    if (Math.abs(v - Math.round(v) - 0.5) > 1e-9) assert.equal(shown, 1, `a digit is always readable at ${v.toFixed(2)}`);
  }
});

test('wave 5: the counter pops once on the frame its roll ends', () => {
  assert.equal(wow.countLandPop(999, 1000), 1);
  assert.ok(Math.abs(wow.countLandPop(1120, 1000) - 1.12) < 1e-6, 'peaks at COUNT.finalBump');
  assert.equal(wow.countLandPop(1240, 1000), 1);
  const src = read('src/components/Topbar/Currency.tsx');
  assert.match(src, /countLandPop\(hudClock\.value, streamRollEnd\.value\)/);
  assert.match(src, /streamRollEnd\.value = stream\.lands\[0\] \+ rollMs\(from, next\) \+ lastDelay/);
});

test('wave 5: the next goal is sticker size and on screen about half a second on repeats', () => {
  const r = wow.catchPlan({ reduced: false, repeat: true });
  assert.ok(r.exitAt - r.nextAt >= 420, `repeat next goal on screen ${r.exitAt - r.nextAt} ms`);
  const t = wow.catchPlan({ reduced: false, repeat: true, treat: true });
  assert.ok(t.exitAt - t.nextAt >= 420 && t.doneAt <= 1450);
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  assert.match(src, /nextArt: \{ width: 44, height: 44, opacity: 0\.5 \}/);
});

test('wave 5: release-like captures log every catch frame (beam, gold, ink) and never ship that probe', () => {
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  assert.match(src, /const CATCH_PROBE = process\.env\.EXPO_PUBLIC_MOTION_CAPTURE === 'HomeCatchPreview';/);
  assert.match(src, /if \(!CATCH_PROBE\) return;/);
  const audio = read('src/screens/ExploreScreen/ridePhoto/catchAudio.ts');
  assert.match(audio, /if \(!__DEV__ && !CAPTURE_TRACE\) return;/);
  // The beam is driven by a flag set from JS on the tap; JS never reads beamOn back.
  assert.doesNotMatch(src, /if \(beamOn\.value\)/);
  assert.match(src, /if \(current\.beam\) list\.push\(\{ at: plan\.hitStopAt, kind: BEAT\.beam/);
});

test('round 5: "+N" hangs off an anchor after the pill, never over the digits', () => {
  const src = fs.readFileSync(path.join(root, 'src/components/Topbar/Currency.tsx'), 'utf8');
  assert.doesNotMatch(src, /left: '100%'/, 'no percentage left (it resolved inside the pill)');
  assert.match(src, /plusAnchor: \{ width: 0/);
  const pill = src.indexOf('</TouchableOpacity>'), anchor = src.indexOf('styles.plusAnchor'), plus = src.indexOf('styles.plus, plusStyle');
  assert.ok(pill > 0 && anchor > pill && plus > anchor, 'the +N lives after the pill, inside the zero-width anchor');
});

test('round 5: styles that must survive a commit re-send after it (commitHeal)', () => {
  const heal = fs.readFileSync(path.join(root, 'src/components/map/alive/commitHeal.ts'), 'utf8');
  assert.match(heal, /useLayoutEffect\(\(\) => \{/);
  for (const [file, min] of [['src/screens/ExploreScreen/HomeCatchMoment.tsx', 20], ['src/components/Topbar/Currency.tsx', 3],
    ['src/screens/ExploreScreen/useChromeBack.ts', 1], ['src/components/Map.tsx', 1], ['src/components/Wrapper.tsx', 1]]) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    const n = (src.match(/touchHeal\(/g) || []).length;
    assert.ok(n >= min, `${file} heals ${n} styles (want ${min}+)`);
  }
  for (const file of ['src/screens/ExploreScreen/HomeExplore.tsx', 'src/components/Map.tsx', 'src/components/Wrapper.tsx', 'src/screens/ExploreScreen/HomeCatchPreviewScreen.tsx']) {
    assert.match(fs.readFileSync(path.join(root, file), 'utf8'), /useCommitHeal\(chromeHeal(, \w+)?\)/, `${file} bumps the chrome heal on commit`);
  }
});

test('round 5: repeats are snappy (hold <= 200 ms, badge by 0.9 s, settled by 1.4 s) and the first still fits 2.6 s', () => {
  const r = wow.catchPlan({ reduced: false, repeat: true });
  assert.ok(r.suckAt - r.burstAt <= 200, `burst hold ${r.suckAt - r.burstAt}`);
  assert.ok(r.badgeAt <= 900, `badge in by ${r.badgeAt}`);
  assert.ok(r.doneAt <= 1400, `settled by ${r.doneAt}`);
  const f = wow.catchPlan({ reduced: false });
  assert.ok(f.doneAt <= 2600 && f.burstAt <= 1500);
  // The next goal pops in after the badge, early enough to read before the badge leaves.
  for (const p of [f, r]) {
    assert.ok(p.nextAt > p.badgeAt && p.exitAt - p.nextAt >= 300, `next goal on screen ${p.exitAt - p.nextAt} ms`);
    assert.equal(wow.nextGoalAt(p.nextAt - 1, p).scale, 0);
    let peak = 0;
    for (let t = p.nextAt; t < p.nextAt + 400; t += 4) peak = Math.max(peak, wow.nextGoalAt(t, p).scale);
    assert.ok(peak > 1.05 && peak < 1.35, `one visible overshoot (${peak})`);
    assert.ok(Math.abs(wow.nextGoalAt(p.nextAt + 500, p).scale - 1) < 1e-9);
  }
  const src = fs.readFileSync(path.join(root, 'src/screens/ExploreScreen/HomeCatchMoment.tsx'), 'utf8');
  assert.match(src, /cc\.value = cut;/, 'skip cuts the burst and plays the coin stream fast');
  assert.match(src, /nextMissing\(page, item\.id, next\.complete\)/, 'the next goal is the set\'s next missing find');
});

test('round 5: the gold is a hand-inked fan on a soft bloom, varied, and breathing through the hold', () => {
  const rays = wow;
  const shapes = Array.from({ length: rays.CATCH_RAY_COUNT }, (_, i) => rays.catchRayShape(i, 320));
  const lens = new Set(shapes.map(s => Math.round(s.len))), widths = new Set(shapes.map(s => Math.round(s.half * 10)));
  assert.ok(lens.size >= 10 && widths.size >= 10, 'every ray a little different (hand-made)');
  for (const s of shapes) assert.ok(s.len <= 160 && s.r0 > 0 && s.half > 4);
  const src = fs.readFileSync(path.join(root, 'src/screens/ExploreScreen/HomeCatchMoment.tsx'), 'utf8');
  assert.doesNotMatch(src, /<GoldBurst /, 'no image fan on the map catch');
  assert.match(read('src/screens/ExploreScreen/CatchBurst.tsx'), /const breathe = 1 \+ 0\.03 \* Math\.sin/, 'a living hold');
  assert.match(src, /itemRim/, 'the find keeps a white sticker rim on the gold');
  assert.match(src, /repeat: sessionCatches > 0 && !variant\.milestone/, 'a milestone plays the full show, never the snappy repeat');
});

test('wave 4: the burst lives in one Skia canvas on the clock, never an animated view a commit could reset', () => {
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  const burst = read('src/screens/ExploreScreen/CatchBurst.tsx');
  assert.doesNotMatch(src, /const goldStyle = useAnimatedStyle|const inkStyle = useAnimatedStyle/, 'no view style carries the gold or the ink');
  assert.doesNotMatch(src, /fx\.gold|fx\.ink/);
  assert.match(burst, /<Canvas style=\{StyleSheet\.absoluteFill\}/);
  for (const name of ['goldT', 'goldO', 'inkT', 'inkO', 'ringT', 'ringO']) assert.match(burst, new RegExp(`const ${name} = useDerivedValue\\(`), `${name} is a UI-thread derived value`);
  assert.doesNotMatch(burst, /useState\([^)]*\)[\s\S]*setInk\([^)]*\)[\s\S]*useAnimatedStyle/, 'no animated view styles in the burst');
  assert.doesNotMatch(burst, /useAnimatedStyle/);
  assert.match(burst, /Skia\.Image\.MakeImageFromEncoded/, 'the ink art is decoded once for the app');
  assert.match(src, /useEffect\(\(\) => \{ void loadBurstInk\(\)\.then\(setBurstInk\); \}, \[\]\)/, 'and preloaded when the map mounts');
  assert.match(src, /warmStep === 0 && !reducedMotion && <Canvas[\s\S]{0,200}<CatchRaysArt size=\{goldSize\} \/>/, 'and drawn once, tiny, at launch (no first-catch compile)');
  // Wave 5 round 2: the clock never waits for the answer's commit (that put every tier about 190 ms behind plan).
  assert.doesNotMatch(src, /caughtPending|releaseCaught/);
  assert.match(src, /endAt\.value = end;[\s\S]{0,900}runOnUI\(markCaught\)\(\);/);
});

test('wave 4: the 10th-catch beam is set from a JS flag on the tap (JS never reads back a value it just wrote)', () => {
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  const effect = src.slice(src.indexOf('const variant = burstVariant(sessionCatches + 1'), src.indexOf('// ── Ride Photo hand-offs'));
  assert.match(effect, /const beam = motion && variant\.beam;/);
  assert.match(effect, /beamOn\.value = beam \? 1 : 0;/);
  assert.match(effect, /if \(current\.beam\) list\.push\(\{ at: plan\.hitStopAt, kind: BEAT\.beam/);
  assert.doesNotMatch(effect, /if \(beamOn\.value\)/, 'no JS read of the beam value');
  assert.doesNotMatch(src.slice(src.indexOf('const onBeat = useCallback'), src.indexOf('useAnimatedReaction(() => cc.value')), /beamOn\.value/);
  // The beam drops 300 ms before the held frame: it is on before the clock reaches it on every plan.
  for (const plan of [wow.catchPlan({ reduced: false, milestone: true })]) assert.ok(plan.hitStopAt - wow.BEAM.dropMs > 0);
});

test('wave 4: every tier climbs: the 5th holds its stars 250+ ms, the 25th is 1.4x the 10th with a second ring and confetti', () => {
  const v5 = wow.burstVariant(5), v10 = wow.burstVariant(10), v25 = wow.burstVariant(25), v2 = wow.burstVariant(2);
  assert.ok(v5.treat && !v2.treat && !v10.treat);
  const treat = wow.catchPlan({ reduced: false, repeat: true, treat: true });
  const plain = wow.catchPlan({ reduced: false, repeat: true });
  assert.ok(treat.suckAt - treat.burstAt >= 250, `5th burst hold ${treat.suckAt - treat.burstAt}`);
  assert.ok(plain.suckAt - plain.burstAt <= 200, 'ordinary repeats stay snappy');
  assert.ok(treat.doneAt <= 1450, `5th still settled by ${treat.doneAt}`);
  assert.ok(v25.inkScale / v10.inkScale >= 1.12, `grand vs beam ${v25.inkScale / v10.inkScale}`);
  assert.ok(v25.grand && !v10.grand && v25.beam && v10.beam);
  const p = wow.catchPlan({ reduced: false, milestone: true });
  assert.equal(wow.confettiAt(p.burstAt - 1, p, 0, 10), null);
  const mid = wow.confettiAt(p.burstAt + 500, p, 3, 10);
  assert.ok(mid && mid.alpha === 1 && Number.isFinite(mid.x + mid.y));
  assert.equal(wow.confettiAt(p.burstAt + wow.CONFETTI.ms, p, 0, 10), null);
  assert.equal(wow.confettiAt(p.burstAt + 100, wow.catchPlan({ reduced: true }), 0, 10), null, 'no confetti in Reduce Motion');
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  assert.match(src, /motionFx && grandCatch \? momentParticles\(CONFETTI\.max, power, reducedMotion\) : 0/, 'confetti goes through the power budget, and mounts only on the grand catch');
  assert.match(src, /treat: variant\.treat/);
});

test('wave 4: the finger steps aside during a catch, the wash is thin edge bands, cloud shadows are soft house blue', () => {
  const item = read('src/screens/ExploreScreen/PrepItem.tsx');
  assert.match(item, /const away = 1 - catchDim\.value;/);
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  assert.match(src, /vignetteTop: \{[^}]*height: '15%'/);
  assert.match(src, /vignetteBottom: \{[^}]*height: '15%'/);
  const sky = read('src/components/map/alive/MapSkyOverlay.tsx');
  assert.match(sky, /SHADOW_INK = 'rgba\(7,104,185,0\.055\)'/);
  const wrapper = read('src/components/Wrapper.tsx');
  assert.match(wrapper, /useCommitHeal\(chromeHeal, catchHasChrome\)/, 'the app-wide bar heals only while a catch has the chrome');
  assert.match(read('src/components/map/alive/commitHeal.ts'), /if \(when && !when\(\)\) return;/);
});

test('wave 4: the catch can be captured in release-like JS (motion capture route, never in store builds)', () => {
  const routes = read('src/devRoutes.tsx');
  assert.match(routes, /process\.env\.EXPO_PUBLIC_MOTION_CAPTURE\s*\?\s*\[[\s\S]*'HomeCatchPreview'/);
  assert.match(routes, /motion === 'HomeCatchPreview' \? motion : null/);
  assert.match(read('src/utils/standalonePreview.ts'), /EXPO_PUBLIC_MOTION_CAPTURE === 'HomeCatchPreview'/);
  assert.match(read('src/screens/ExploreScreen/HomeCatchPreviewScreen.tsx'), /const CAPTURE = process\.env\.EXPO_PUBLIC_MOTION_CAPTURE === 'HomeCatchPreview';/);
});

test('wave 5: the burst canvas redraws only inside the burst window (gold, ink, grand confetti)', () => {
  const src = read('src/screens/ExploreScreen/CatchBurst.tsx');
  assert.match(src, /return f\.gold > 0 \|\| f\.ink >= 0 \|\| confettiLive \? t : -1;/);
  assert.match(src, /\(t, prev\) => \{ if \(t !== prev\) bt\.value = t; \}/, 'written only when it changes');
  // Inside the derived values nothing reads the per-frame clock or frame (they would redraw every frame).
  const body = src.slice(src.indexOf('const bf = useDerivedValue'));
  assert.doesNotMatch(body, /v\.frame\.value|v\.clock\.value/);
  // Outside the window the plan really shows nothing (so -1 hides nothing that should be seen).
  for (const plan of [wow.catchPlan({ reduced: false }), wow.catchPlan({ reduced: false, repeat: true }), wow.catchPlan({ reduced: false, milestone: true })]) {
    for (let t = 0; t < plan.burstAt; t += 5) {
      const f = wow.catchFrame(t, plan);
      assert.ok(f.gold === 0 && f.ink < 0, `nothing gold before the burst (${t})`);
    }
    const end = plan.suckAt + plan.suckMs;
    for (let t = end + 1; t < plan.doneAt; t += 5) {
      const f = wow.catchFrame(t, plan);
      assert.ok(f.gold === 0 && f.ink < 0, `nothing gold after the suck-back (${t})`);
    }
  }
});

test('wave 5: the badge makes room for the next-goal disc, so it never covers the set count', () => {
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  assert.match(src, /styles\.badge, nextArt && !photo && styles\.badgeNextRoom/);
  assert.match(src, /badgeNextRoom: \{ paddingRight: 16 \+ 30 \}/);
  assert.match(src, /nextAt: \{ position: 'absolute', right: -34,/, 'the 60 pt disc reaches 26 pt into the badge, inside the 46 pt room');
});

/* ------------------------------------------------------------- wave 5, round 2 */

test('wave 5 r2: the catch clock starts on the tap, and the pin follows it until the copy draws (no 200 ms late start)', () => {
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  const effect = src.slice(src.indexOf('const variant = burstVariant(sessionCatches + 1'), src.indexOf('// ── Ride Photo hand-offs'));
  const start = effect.indexOf('runOnUI(startClock)(plan.hitStopAt, !motion, t0);');
  assert.ok(start > 0 && start < effect.indexOf('catchFind('), 'the clock starts before the server call, on the tap');
  assert.match(effect, /startRef\.current = \(\) => \{ startRef\.current = null; runOnUI\(showCopy\)\(pivotId\); \};/);
  assert.match(src, /const showCopy = \(pivot: number\) => \{\s*'worklet';\s*catchHidePivot\.value = pivot;\s*copyOn\.value = 1;/);
  // The start never runs behind the tap: it begins at the time already gone (one or two frames at most).
  assert.match(src, /const elapsed = Math\.max\(0, now - tapAt\);\s*[^\n]*\n\s*const e = Math\.min\(48, elapsed\);/);
  // Until the copy draws, the pin rises, glides and wobbles with the clock.
  assert.match(src, /if \(!clockOn\.value \|\| copyOn\.value\) return null;/);
  const pin = read('src/screens/ExploreScreen/PrepItem.tsx');
  assert.match(pin, /const pose = tapped \? catchPinPose\.value : null;/);
  assert.match(read('src/screens/ExploreScreen/catchPresence.ts'), /export const catchPinPose = makeMutable\(\{ x: 0, y: 0, rot: 0 \}\);/);
});

test('wave 5 r2: the answer never holds the clock for a React commit; a server wait is won back after the burst', () => {
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  const effect = src.slice(src.indexOf('const variant = burstVariant(sessionCatches + 1'), src.indexOf('// ── Ride Photo hand-offs'));
  const answer = effect.slice(effect.indexOf("catchMark('answer');"));
  assert.doesNotMatch(answer, /onCascade/, 'the parent re-render left the answer (it rides the tap now)');
  const tapPart = src.slice(src.indexOf('const { item, pivotId } = request;'), src.indexOf("catchMark(plan.repeat ? 'tap-repeat' : 'tap')"));
  assert.match(tapPart.slice(tapPart.indexOf('dimCatchChrome(true);')), /latest\.current\.onCascade\?\.\(true\);/);
  assert.match(answer, /runOnUI\(markCaught\)\(\);/);
  // continueRun keeps the wind-up and the burst at plan pace and speeds up only what follows the hold (at most 20%).
  const cont = src.slice(src.indexOf('const continueRun = () => {'), src.indexOf('const startClock ='));
  assert.match(cont, /const mid = Math\.min\(end, Math\.max\(from, p\.suckAt\)\);/);
  assert.match(cont, /Math\.max\(0\.8, \(tail - behind\) \/ tail\)/);
  assert.match(cont, /cc\.value = withTiming\(end, \{ duration: total, easing: twoSpeed \}\);/, 'one timing, no frame lost at a hand-over');
  // The wind-up aims the held frame at its planned wall time from the tap (at most a third faster).
  assert.match(src, /const duration = Math\.max\(1, hitStopAt \* 0\.75, hitStopAt - elapsed\);\s*heldGoal\.value = now \+ duration;/);
  // On every plan the done frame lands by 2.6 s from the tap, even when the server answered 150 ms after the held frame.
  for (const plan of [wow.catchPlan({ reduced: false }), wow.catchPlan({ reduced: false, milestone: true }),
    wow.catchPlan({ reduced: false, repeat: true }), wow.catchPlan({ reduced: false, repeat: true, treat: true })]) {
    const waited = 150;
    const tail = plan.doneAt - plan.suckAt;
    const k = Math.max(0.8, (tail - waited) / tail);
    const done = plan.suckAt + waited + tail * k;
    // The two-speed shape is continuous and ends where it should.
    const shape = { a: 0.3, b: 0.2 };
    const ease = u => (u <= shape.a ? (u / shape.a) * shape.b : shape.b + ((u - shape.a) / (1 - shape.a)) * (1 - shape.b));
    assert.ok(Math.abs(ease(shape.a) - shape.b) < 1e-9 && Math.abs(ease(1) - 1) < 1e-9 && ease(0) === 0);
    assert.ok(done <= 2600, `done ${done}`);
    assert.ok(Math.abs(done - plan.doneAt) <= 50, `within 50 ms of plan (${done} vs ${plan.doneAt})`);
  }
});

test('wave 5 r2: a clear staircase: 1st, 5th, 10th, 25th each at least 1.12x the last and each adds something new', () => {
  const v = [1, 5, 10, 25].map(n => wow.burstVariant(n));
  for (let i = 1; i < v.length; i++) assert.ok(v[i].inkScale / v[i - 1].inkScale >= 1.12, `tier ${i}: ${v[i].inkScale / v[i - 1].inkScale}`);
  assert.ok(!v[0].fan && !v[1].fan && v[2].fan && v[3].fan, 'the spike fan only on milestones');
  assert.ok(v[1].homeStars && !v[0].homeStars && !v[2].homeStars, 'the 5th throws its stars into the counter');
  assert.ok(v[2].counterRing && v[3].counterRing && !v[1].counterRing, 'the 10th gets the counter-turning ring');
  assert.ok(v[3].grand && !v[2].grand, 'confetti stays the 25th');
  for (const n of [2, 3, 4, 6, 7, 8, 9, 11]) assert.ok(!wow.burstVariant(n).fan, `common ${n} is Alex's star on the bloom`);
  const burst = read('src/screens/ExploreScreen/CatchBurst.tsx');
  assert.match(burst, /const fanO = useDerivedValue\(\(\) => \(v\.fan\.value \? goldO\.value : 0\)\);/);
  assert.match(burst, /const g = f && v\.ring2\.value \? f\.gold : 0;/);
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  assert.match(src, /if \(run\.beam\) setTimeout\(\(\) => \{ if \(runRef\.current === run\) catchHaptic\('comboHeavy', 3\); \}, 120\);/, 'a stronger haptic on the 10th');
});

test('wave 5 r3: the 5th-catch stars are big, fling out, then land in the counter one by one before the coins', () => {
  const to = { x: 120, y: -420 };
  assert.equal(wow.homeStarAt(0, 0, 8, to), null);
  const out = wow.homeStarAt(100, 1, 8, to);
  assert.ok(out && out.y < 0, 'flung up first');
  assert.ok(out.scale * 28 >= 28, 'at least 28 pt while it flies out');
  const land0 = wow.homeStarLand(0);
  const late = wow.homeStarAt(land0 - 1, 0, 8, to);
  assert.ok(late && Math.hypot(late.x - to.x, late.y - to.y) < 6, `lands on the counter (${late && late.x}, ${late && late.y})`);
  assert.ok(late.scale * 28 >= 24, 'still about 25 pt as it lands');
  assert.equal(wow.homeStarAt(land0 + 1, 0, 8, to), null, 'gone once it lands');
  for (let i = 0; i < 8; i++) assert.ok(wow.homeStarLand(i) < motion.DURATION.sparkle, 'every star lands inside the sparkle window');
  for (let i = 1; i < 8; i++) assert.ok(wow.homeStarLand(i) - wow.homeStarLand(i - 1) >= 40, 'one punch per star, never merged');
  // The stars lead: the last star lands before the first coin (each landing punches the counter).
  assert.ok(wow.homeStarLand(7) < wow.coinStreamPlan(10, false).landAt[0], 'stars first, then the coins');
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  assert.match(src, /const lands = \[\.\.\.starLands, \.\.\.coinLands\]\.sort/, 'star landings punch the counter too');
  assert.match(src, /homeTrail\(t\.value, 35, index/, 'a short gold trail behind each star');
  assert.match(src, /^function homeTrail\(/m, 'a module-level worklet (a nested function declaration is not hoisted after the worklet plugin)');
});

test('wave 5 r2: where to walk next: only once nothing is in range, a new find first, its edge arrow when off screen', () => {
  const edges = loadTs('src/screens/ExploreScreen/findEdges.ts');
  const size = { width: 400, height: 800 };
  const inset = { top: 74, bottom: 190, side: 30 };
  const finds = [
    { pivot: 1, inRange: false, distance: 10, isNew: false, point: { x: 200, y: 400 } },
    { pivot: 2, inRange: true, distance: 20, isNew: false, point: { x: 220, y: 380 } },
    { pivot: 3, inRange: false, distance: 90, isNew: true, point: { x: 900, y: 300 } },
    { pivot: 4, inRange: false, distance: 60, isNew: false, point: { x: 100, y: 500 } },
  ];
  assert.equal(edges.whereNextAfterCatch(finds, 1, size, inset), null, 'another find is in range: catch that one first');
  const at = plain(edges.whereNextAfterCatch(finds.filter(f => f.pivot !== 2), 1, size, inset));
  assert.equal(at.pivot, 3, 'a new find first');
  assert.ok(at.edge && at.x === size.width - inset.side, 'off screen: its edge arrow');
  const onScreen = plain(edges.whereNextAfterCatch(finds.filter(f => f.pivot !== 2 && f.pivot !== 3), 1, size, inset));
  assert.deepEqual(onScreen, { pivot: 4, x: 100, y: 500, edge: false });
  assert.equal(edges.whereNextAfterCatch([finds[0]], 1, size, inset), null, 'no other find: no flight');
});

test('wave 5 r2: the next-goal disc shows the real find, flies onto it after being read, and the next bar slot glows', () => {
  for (const plan of [wow.catchPlan({ reduced: false }), wow.catchPlan({ reduced: false, repeat: true })]) {
    const at = wow.whereFlightAt(plan);
    assert.ok(at - plan.nextAt >= 380, 'read on the badge first');
    assert.ok(at < plan.exitAt, 'leaves before the badge does');
  }
  const from = { x: 350, y: 700 }, to = { x: 30, y: 300 };
  assert.deepEqual(plain(wow.whereAt(0, from, to)).x, 350);
  const landed = plain(wow.whereAt(wow.WHERE.flightMs + 1, from, to));
  assert.ok(Math.abs(landed.x - to.x) < 1 && landed.ring >= 0, 'lands with a ring');
  assert.equal(wow.whereAt(wow.WHERE.totalMs, from, to), null);
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  assert.doesNotMatch(src, /tintColor: '#0b3a73'/, 'no navy shadow nobody can name');
  assert.match(src, /const flown = w\.on && cc\.value >= w\.at;/, 'one disc on screen at a time');
  assert.match(src, /if \(flightAt >= 0\) end = Math\.max\(end, flightAt \+ WHERE\.totalMs\);/, 'the clock runs on for the flight');
  assert.match(src, /styles\.ghostSlot, \{ left: `\$\{\(100 \* collected\) \/ total\}%`, width: `\$\{100 \/ total\}%` \}/);
  assert.match(read('src/screens/ExploreScreen/HomeExplore.tsx'), /whereNext=\{whereNext\}/);
});

test('wave 5 r2: the burst canvas is mounted only while a catch shows (nothing on the resting map)', () => {
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  assert.match(src, /const item = showing\?\.item \?\? chompRequest\?\.item \?\? null;/);
  assert.match(src, /\{item && <CatchFx /);
  assert.match(src, /\{motionFx && <CatchBurst v=\{burst\}/);
  // The capture route can pin daytime light (a night capture is the time-of-day tint, not a grey map).
  assert.match(read('src/screens/ExploreScreen/HomeCatchPreviewScreen.tsx'), /sunOverride=\{Number\.isFinite\(CAPTURE_SUN\) \? CAPTURE_SUN : undefined\}/);
});

test('wave 5 r2: Alex star is the common burst, drawn bigger, and the stage keeps each tier on screen', () => {
  const burst = read('src/screens/ExploreScreen/CatchBurst.tsx');
  assert.match(burst, /export const INK_BASE = 0\.9;/);
  assert.match(burst, /Math\.min\(INK_TIER_MAX, v\.inkScale\.value\) \* INK_BASE \*/);
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  assert.match(src, /catchStage\(stageFrom, plan\.risePt, area, inkReach\(variant\.inkScale\)\)/);
  // On a 402 pt phone the 5th's ink fits between the edges (the hero reaches about 85%); the 10th and 25th fill the
  // screen and are centred.
  const reach = Math.round((220 * 0.9 * 1.3 * 1.31) / 2);
  assert.ok(reach * 2 + 24 <= 402, `5th ink ${reach * 2} pt`);
  const hero = (220 * 0.9 * wow.burstVariant(1, { firstEver: true }).inkScale * 1.28) / 402;
  assert.ok(hero >= 0.82 && hero <= 0.92, `hero ink ${Math.round(hero * 100)}% of the width`);
  const stage = wow.catchStage({ x: 20, y: 300 }, 24, { width: 402, top: 100, bottom: 700 }, reach);
  assert.ok(stage.x - reach >= 12 && stage.x + reach <= 390);
  const grand = Math.round((220 * 0.9 * 1.6 * 1.31) / 2);
  assert.equal(wow.catchStage({ x: 20, y: 300 }, 24, { width: 402, top: 100, bottom: 700 }, grand).x, 201, 'too wide to fit: centred');
});

// Wave 5 round 3 (grader fixes): the hero first catch, a 5th that reads, a funny miss, beats on time against the server,
// no dead hold on the badge, a where-next cue a kid can point at, a lighter answer commit, and variety on repeats.
test('wave 5 r3: the first catch ever is the hero (centre stage, about 85% of the width, a screen-wide bloom); commons keep their size', () => {
  const hero = wow.burstVariant(1, { firstEver: true });
  assert.ok(hero.hero && hero.centre && hero.kind === 'hero');
  assert.ok(hero.inkScale > wow.burstVariant(1).inkScale * 1.25, 'well past the session-first catch');
  for (const n of [2, 3, 4, 6, 7, 8, 9]) assert.ok(!wow.burstVariant(n).centre && wow.burstVariant(n).inkScale <= 1, `common ${n} keeps its size`);
  assert.ok(wow.burstVariant(1).centre && wow.burstVariant(10).centre && wow.burstVariant(25).centre, 'the big ones play centre stage');
  const burst = read('src/screens/ExploreScreen/CatchBurst.tsx');
  assert.match(burst, /const heroT = useDerivedValue/);
  assert.match(burst, /<Group transform=\{heroT\} opacity=\{heroO\}>\s*<CatchRaysArt size=\{goldSize\} bloomOnly \/>/);
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  assert.match(src, /burstVariant\(sessionCatches \+ 1, \{ firstEver: firstCatchDone === false, golden: item\.golden_hour === true \}\)/);
  assert.match(src, /const stageFrom = variant\.centre \? \{ x: layer\.width \/ 2,/);
  assert.match(src, /markFirstCatchDone\(\);/);
});

test('wave 5 r3: a repeat holds its breath about as long as the server takes, so the burst lands on its beat', () => {
  assert.equal(wow.heldFromAnswers([]), wow.REPEAT_HELD.min);
  assert.equal(wow.heldFromAnswers([440, 455, 470]), 475, 'the median answer plus a frame');
  assert.equal(wow.heldFromAnswers([3000, 2900, 3100]), wow.REPEAT_HELD.max, 'a slow server never stretches it past the max');
  assert.equal(wow.heldFromAnswers([100, 120]), wow.REPEAT_HELD.min);
  const p = wow.catchPlan({ reduced: false, repeat: true, heldAt: 475 });
  assert.equal(p.hitStopAt, 475);
  assert.equal(p.burstAt, 545);
  assert.ok(p.doneAt <= 1420, `still a quick repeat (${p.doneAt})`);
  assert.ok(p.wobbles[p.wobbles.length - 1].at <= p.hitStopAt - 140, 'the last wobble still lands before the hold');
  const t = wow.catchPlan({ reduced: false, repeat: true, treat: true, heldAt: 475 });
  assert.ok(t.doneAt <= 1530 && t.suckAt - t.burstAt >= 250);
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  assert.match(src, /heldAt: heldFromAnswers\(answerTimes\)/);
  assert.match(src, /answerTimes\.push\(Date\.now\(\) - t0\);/);
  assert.match(src, /catchMark\(`plan:\$\{variant\.kind\}:h\$\{plan\.hitStopAt\}/, 'captures read the plan from the trace');
});

test('wave 5 r3: no dead hold on the first catch badge (a beat at least every 400 ms from land to exit)', () => {
  const p = wow.catchPlan({ reduced: false });
  const beats = [p.landAt, p.landAt + 60, p.nextAt, p.landAt + p.barMs, p.tickAt, p.nextAt + 200, p.exitAt].sort((a, b) => a - b);
  for (let i = 1; i < beats.length; i++) assert.ok(beats[i] - beats[i - 1] <= 400, `gap ${beats[i - 1]} to ${beats[i]}`);
  assert.ok(p.nextAt > p.landAt, 'the next goal pops after the find lands, not mid-flight');
  assert.ok(wow.whereFlightAt(p) - p.nextAt >= 380, 'still read on the badge before it flies');
});

test('wave 5 r3: a funny miss within a frame of the server no: boing, hop home, nope shake, a dotted come-closer ring', () => {
  assert.ok(wow.missAt(60).sx > 1.1 && wow.missAt(60).sy < 0.9, 'squashed in the grab');
  const mid = wow.missAt(wow.MISS.squashMs + wow.MISS.hopMs / 2);
  assert.ok(mid.hop >= 25 && mid.back > 0.3 && mid.back < 0.7, 'hops back home, high');
  const home = wow.missAt(wow.MISS.squashMs + wow.MISS.hopMs + 1);
  assert.equal(home.back, 1);
  const shake = [0.1, 0.3, 0.6].map(u => wow.missAt(wow.MISS.squashMs + wow.MISS.hopMs + wow.MISS.landMs + u * wow.MISS.shakeMs).rot);
  assert.ok(shake.some(r => r > 4) && shake.some(r => r < -4), 'a nope shake both ways');
  assert.deepEqual(plain(wow.missAt(wow.MISS.doneMs)), { back: 1, hop: 0, sx: 1, sy: 1, rot: 0 }, 'at rest before it hands back to the pin');
  assert.equal(wow.missRingAt(wow.MISS.ringAt - 1), null);
  const a = wow.missRingAt(wow.MISS.ringAt + 100), b = wow.missRingAt(wow.MISS.ringAt + 600);
  assert.ok(a.scale > b.scale, 'the ring pulls in toward the find (come closer)');
  assert.equal(wow.missRingAt(wow.MISS.ringAt + wow.MISS.ringMs), null);
  assert.ok(wow.MISS.ringAt <= 400 && wow.MISS.doneMs <= 1000, 'a picture cue inside 0.4 s, back to the map inside 1 s');
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  const miss = src.slice(src.indexOf("if (settled.kind !== 'caught') {"), src.indexOf('const data = settled.data;'));
  assert.match(miss, /runOnUI\(markMiss\)\(ring\);/);
  assert.ok(miss.indexOf('runOnUI(markMiss)') < miss.indexOf('await wait('), 'the boing starts on the answer, before any wait');
  assert.doesNotMatch(miss, /plan\.hitStopAt - \(Date\.now\(\) - t0\)/, 'never waits for the held frame first');
  assert.match(miss, /sharkShrug\.value = shrugCount;/);
  assert.match(read('src/components/Map.tsx'), /if \(mood === 'shrug'\)/);
  assert.match(read('src/components/Map.tsx'), /useAnimatedReaction\(\(\) => sharkShrug\.value/);
});

test('wave 5 r3: where to walk: a bigger landing, a dotted trail, and a beacon that keeps pulsing 2 to 3 s (never on Battery Saver)', () => {
  const from = { x: 350, y: 700 }, to = { x: 30, y: 120 };
  const seen = [];
  for (let d = 0; d < wow.WHERE.flightMs; d += 10) for (let i = 0; i < wow.WHERE.trailDots; i++) if (wow.whereTrailAt(d, i, from, to) && !seen.includes(i)) seen.push(i);
  assert.deepEqual(seen, [...Array(wow.WHERE.trailDots).keys()], 'the dots appear in order behind the disc');
  assert.equal(wow.whereTrailAt(wow.WHERE.flightMs + wow.WHERE.trailMs, 0, from, to), null, 'and fade');
  assert.ok(wow.BEACON.ms >= 2000 && wow.BEACON.ms <= 3000);
  assert.ok(wow.beaconAt(100) && wow.beaconAt(wow.BEACON.ms - 1));
  assert.equal(wow.beaconAt(wow.BEACON.ms), null, 'it stops by itself');
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  assert.match(src, /beaconOk\.value = power\.ambient && !power\.lowPower \? 1 : 0;/);
  assert.match(src, /const land = cc\.value - w\.at >= WHERE\.flightMs \? 1\.12 : 1;/);
});

test('wave 5 r3: the answer re-renders only the badge host (no catch-layer commit on the burst or the Reduce Motion badge)', () => {
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  assert.doesNotMatch(src, /useState<CatchSummary \| null>/);
  assert.doesNotMatch(src, /setCoinStamp|setNextArt|setBadgeOn/);
  assert.match(src, /const c = useSyncExternalStore\(store\.subscribe, store\.get\);/);
  const answer = src.slice(src.indexOf("catchMark('answer');"), src.indexOf('runOnUI(markCaught)();'));
  assert.equal((answer.match(/badgeStore\.set\(/g) || []).length, 1, 'one store write on the answer');
  assert.doesNotMatch(answer, /\bset(?!Timeout)[A-Z]\w*\(/, 'no React state set on the answer');
  // Captures count every real frame (the probe only logs when the clock moves).
  assert.match(read('src/screens/ExploreScreen/HomeCatchPreviewScreen.tsx'), /\[frame\] \$\{Date\.now\(\)\} dt=/);
});

test('wave 5 r3: ordinary repeats vary: three fidgets round-robin, the chime steps up, and golden finds get the beam', () => {
  const kinds = [2, 3, 4].map(n => wow.burstVariant(n).fidget);
  assert.deepEqual([...new Set(kinds)].sort(), [0, 1, 2], 'three different fidgets in a row');
  for (let n = 2; n < 12; n++) if (n % 5 && (n + 1) % 5) assert.notEqual(wow.burstVariant(n).pitch, wow.burstVariant(n + 1).pitch, `pitch ${n} vs ${n + 1}`);
  const twirl = wow.catchPlan({ reduced: false, repeat: true, fidget: 1 });
  assert.ok(Math.abs(wow.catchFrame(twirl.hitStopAt - 1, twirl).wobble) > 300, 'a full twirl while it rises');
  const hop = wow.catchPlan({ reduced: false, repeat: true, fidget: 2 });
  assert.ok(wow.catchFrame(hop.squashMs + (hop.hitStopAt - hop.squashMs) / 4, hop).hop > 10, 'a little hop');
  assert.equal(wow.catchFrame(500, wow.catchPlan({ reduced: false })).hop, 0, 'the full show keeps its own wobbles');
  const gold = wow.burstVariant(7, { golden: true });
  assert.ok(gold.beam && gold.golden && !gold.milestone, 'a golden find gets the beam (a real server flag, never chance)');
  assert.ok(!wow.burstVariant(7).beam);
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  assert.match(src, /run\.pitch \? \{ volume: 0\.8, pitch: run\.pitch \}/);
});
