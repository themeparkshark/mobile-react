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
  assert.match(src, /GoldBurst/);
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
  assert.ok(again.doneAt <= 1450 && again.doneAt >= 1300, `repeat about 1.4 s (${again.doneAt})`);
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
  assert.match(src, /onPress=\{onSkip\}/, 'tap anywhere skips after the burst');
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
    assert.match(read('src/screens/ExploreScreen/HomeCatchMoment.tsx'), /suck < 0\.7 \? 1/);
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
  assert.match(src, /onDisplay=\{onCopyShown\}/, 'the clock waits for the copy to draw');
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
  assert.match(chip, /left: '100%', marginLeft: 6/, '+N sits just right of the chip, on the header blue');
  const find = read('src/screens/ExploreScreen/PrepItem.tsx');
  assert.match(find, /const tick = live \? clock : still/, 'a far find stops reading the map clock');
});
