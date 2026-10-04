// Ride Photo v2 (Dustin, Oct 4, 2026): "the congrats / collection wasn't notable enough" and "it's not
// hard enough". Pins the harder, fair grading, the per-pass surges, the thinning telegraph, the camera
// sway, and the catch reveal's beat plan and state machine.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const ride = loadTs('src/screens/ExploreScreen/ridePhoto.ts');
const rules = loadTs('src/screens/ExploreScreen/ridePhoto/revealRules.ts');
const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');

test('grade thresholds: every tier is tighter than v1, Frame It! is tight everywhere, rarer is harder', () => {
  const v1Good = { 2: 250, 3: 225, 4: 190, 5: 150 };
  let prev = null;
  for (const tier of [2, 3, 4, 5]) {
    const w = ride.gradeWindows(tier);
    assert.ok(w.good < v1Good[tier], `tier ${tier} Good is tighter than v1`);
    assert.ok(w.frame_it <= 40 && w.frame_it < w.great && w.great < w.good);
    if (prev) assert.ok(w.good < prev.good && w.great < prev.great && w.frame_it <= prev.frame_it, `tier ${tier} is harder than ${tier - 1}`);
    prev = w;
    // Exact edges, with the one-frame coyote grace on each side.
    const c = ride.COYOTE_MS;
    assert.equal(ride.gradeOffset(w.frame_it + c - 0.01, 0, tier).grade, 'frame_it');
    assert.equal(ride.gradeOffset(-(w.frame_it + c + 1), 0, tier).grade, 'great');
    assert.equal(ride.gradeOffset(w.great + c - 0.01, 0, tier).grade, 'great');
    assert.equal(ride.gradeOffset(w.great + c + 1, 0, tier).grade, 'good');
    assert.equal(ride.gradeOffset(-(w.good + c - 0.01), 0, tier).grade, 'good');
    const miss = ride.gradeOffset(-(w.good + c + 1), 0, tier);
    assert.equal(miss.grade, 'blurry');
    assert.equal(miss.direction, 'early');
  }
  // Fair for kids: Uncommon still covers a +-200 ms spread; misses grow Good and Great (never Frame It!), capped.
  assert.equal(ride.gradeOffset(200, 0, 2).grade, 'good');
  const legend = ride.gradeWindows(5);
  assert.equal(ride.gradeOffset(legend.good * 1.5, 0, 5).grade, 'blurry');
  assert.equal(ride.gradeOffset(legend.good * 1.5, 3, 5).grade, 'good', '+60% after three misses');
  assert.equal(ride.gradeOffset(legend.good * 1.8, 9, 5).grade, 'blurry', 'mercy is capped');
  assert.equal(ride.gradeOffset(legend.frame_it + 20, 3, 5).grade, 'great', 'Frame It! never grows');
  // The client bonus table mirrors the server (config home_hunt.ride_photo.bonus_xp); the server decides.
  assert.deepEqual(plain(ride.GRADE_BONUS_XP), { blurry: 0, good: 0, great: 5, frame_it: 15 });
});

test('telegraph thins with rarity: react on Uncommon, a rhythm on Rare and Epic, read the car on Legendary', () => {
  const t = [2, 3, 4, 5].map(r => ride.telegraphFor(r));
  assert.deepEqual(plain(t.map(x => x.pips.length)), [3, 2, 2, 0]);
  assert.deepEqual(plain(t.map(x => x.greenLeadMs)), [200, 0, 0, 0]);
  // Rare and Epic: pip, pip, then tap on the silent third beat (arrival), evenly spaced.
  assert.deepEqual(plain(ride.RHYTHM_PIPS.map(p => p.atMs)), [800, 400], '400 ms apart: a beat ages 6 to 8 can keep');
  // Rare: the pips land on the real arrival (a fair rhythm). Epic: on the nominal one (a surge breaks it), and
  // its ring stops 300 ms out. Legendary: no pips, no ring, red lamp only.
  assert.deepEqual(plain(t.map(x => x.pipsOn)), ['arrival', 'arrival', 'nominal', 'arrival']);
  assert.deepEqual(plain(t.map(x => x.ring)), ['full', 'full', 'fade', 'none']);
  assert.deepEqual(plain(t.map(x => x.redOnly)), [false, false, false, true]);
  assert.equal(ride.readyLamp(100, 0, true), 4, 'Legendary: a gold ready glow, never red (kids learned red as wait)');
  assert.equal(ride.readyLamp(1100, 0, true), 0);
  // A child reacting to green (about 250 ms) lands Great or better on Uncommon, never Great from Rare up.
  for (const [i, tier] of [2, 3, 4, 5].entries()) {
    const grade = ride.gradeOffset(250 - t[i].greenLeadMs - ride.INPUT_LATENCY_MS, 0, tier).grade;
    if (tier === 2) assert.ok(grade === 'great' || grade === 'frame_it', `uncommon ${grade}`);
    else assert.ok(grade === 'good' || grade === 'blurry', `tier ${tier} ${grade}`);
  }
  // Tapping on the rhythm's silent beat (the next 200 ms step) is on time.
  assert.equal(ride.gradeOffset(0, 0, 3).grade, 'frame_it');
  assert.equal(ride.readyLamp(1200, 200), 0);
  assert.equal(ride.readyLamp(800, 200), 1);
  assert.equal(ride.readyLamp(300, 200), 2);
  assert.equal(ride.readyLamp(150, 200), 3);
  assert.equal(ride.readyLamp(150, 0), 2, 'Rare up: still yellow at 150 ms');
  assert.equal(ride.readyLamp(-200, 0), 0);
  // The lamps, ring and brackets follow the car's distance (pass time), never the surging wall clock.
  assert.ok(Math.abs(ride.distanceMs(0.6, 0.5, 2000) - 200) < 1e-9);
  const src = read('src/screens/ExploreScreen/ridePhoto/RidePhotoCatch.tsx');
  assert.match(src, /armed\.value && !parked\.value \? distanceMs\(tFrame, t\.value, passMs\)/);
});

test('the Legendary mercy ride: its last ride is steady, still and fully telegraphed', () => {
  const legend = ride.rideSpec(5);
  assert.equal(ride.isMercyRide(legend, 0), false);
  assert.equal(ride.isMercyRide(legend, 1), false);
  assert.equal(ride.isMercyRide(legend, 2), true, 'ride 3 of 3');
  assert.equal(ride.isMercyRide(ride.rideSpec(4), 9), false, 'only rides that can leave');
  assert.deepEqual(plain(ride.telegraphFor(5, true)), plain(ride.telegraphFor(2)));
  assert.deepEqual(plain(ride.swayFor(5, false, true)), { amp: 0, rollDeg: 0 });
  const p = ride.passPlan({ rarity: 5, seed: 3, pass: 2, fromT: 0.1, tFrame: 0.7, passMs: 1900, steady: true });
  assert.equal(p.k, 1); assert.equal(p.r, 1);
  const src = read('src/screens/ExploreScreen/ridePhoto/RidePhotoCatch.tsx');
  assert.match(src, /const mercy = isMercyRide\(spec, rideRef\.current\.passes\);/);
  assert.match(src, /passPlan\(\{[^}]*steady: mercy \}\)/);
  // A kid sees the rides left without reading: one vehicle per ride, used ones dim.
  assert.match(src, /accessibilityLabel=\{`Ride \$\{Math\.min\(spec\.maxRides, ride\.passes \+ 1\)\} of \$\{spec\.maxRides\}`\}/);
});

test('the moving camera matters: the frame holds still, the drift shifts the right moment (capped)', () => {
  // Scene drifted 8 pt right, car moving right at 0.2 pt/ms: the car meets the frame 40 ms early,
  // so a tap on the old moment reads 40 ms late.
  assert.equal(ride.swayShiftMs(8, 0.2, 1), 40);
  assert.equal(ride.swayShiftMs(-8, 0.2, 1), -40);
  assert.equal(ride.swayShiftMs(8, 0.2, 2), 20, 'a faster arrival shifts less');
  assert.equal(ride.swayShiftMs(8, 0.001, 1), 0, 'a car not moving across never divides by ~0');
  assert.equal(ride.swayShiftMs(50, 0.1, 1), ride.SWAY_SHIFT_CAP_MS);
  assert.equal(ride.SWAY_SHIFT_CAP_MS, 120);
  const src = read('src/screens/ExploreScreen/ridePhoto/RidePhotoCatch.tsx');
  assert.match(src, /\+ swayShiftMs\(camX\(\) \/ swayScale, frameVx, plan\.value\.r\);/);
  // The camera offset graded and locked is the sway plus the Legendary bump.
  assert.match(src, /const sw = swayAt\(sway, clock\.value, swayOn\.value\);\s*const b = bumpAt\(bumpV\.value, bumpDir\.value\);/);
  assert.match(src, /frameLock=\{frameLock\}/);
  assert.match(read('src/screens/ExploreScreen/ridePhoto/RideScene.tsx'), /<Group transform=\{lock\}>\s*<Group transform=\{bracketScale\}>/);
});

test('camera sway: still on Uncommon and Reduce Motion, small and slow everywhere, overscanned', () => {
  assert.deepEqual(plain(ride.swayFor(2)), { amp: 0, rollDeg: 0 });
  assert.deepEqual(plain(ride.swayFor(5, true)), { amp: 0, rollDeg: 0 });
  let prev = 0;
  for (const tier of [3, 4, 5]) {
    const s = ride.swayFor(tier);
    assert.ok(s.amp > prev && s.amp <= ride.SWAY_MAX.amp && s.rollDeg <= ride.SWAY_MAX.rollDeg);
    prev = s.amp;
    let maxX = 0, maxRoll = 0;
    for (let sec = 0; sec < 30; sec += 1 / 60) {
      const o = ride.swayAt(s, sec, 1);
      maxX = Math.max(maxX, Math.abs(o.x));
      maxRoll = Math.max(maxRoll, Math.abs(o.rollDeg));
    }
    assert.ok(maxX <= s.amp + 1e-9 && maxRoll <= s.rollDeg + 1e-9);
    if (tier >= 4) assert.ok(maxX >= 12, 'Epic and Legendary: a camera you can see moving');
    // The scaled scene still covers the screen at the worst drift and roll.
    const W = 402, H = 746, k = ride.swayOverscan(s, W, H);
    const rad = (s.rollDeg * Math.PI) / 180;
    const needW = W * Math.cos(rad) + H * Math.sin(rad) + 2 * s.amp;
    const needH = H * Math.cos(rad) + W * Math.sin(rad) + 2 * s.amp * 0.3;
    assert.ok(W * k >= needW && H * k >= needH, `tier ${tier} overscan ${k}`);
    assert.ok(k < 1.27, 'no big zoom (under 27%, with the Legendary bump covered too)');
  }
  { const z = plain(ride.swayAt(ride.swayFor(5), 3.3, 0)); assert.ok(z.x === 0 && z.y === 0 && z.rollDeg === 0, 'ramps in from still'); }
  const src = read('src/screens/ExploreScreen/ridePhoto/RidePhotoCatch.tsx');
  assert.match(src, /swayFor\(item\?\.rarity, parkedMode\)/, 'Reduce Motion and VoiceOver get no sway');
});

test('speed surges: deterministic, bounded, smooth, monotonic, and graded on the real clock', () => {
  const base = { fromT: 0.1, tFrame: 0.62, passMs: 2300 };
  // Uncommon is always steady, and so is Rare's first pass (where the first-ride freeze lives).
  for (let pass = 0; pass < 6; pass++) {
    const p = ride.passPlan({ ...base, rarity: 2, seed: 77, pass });
    assert.equal(p.k, 1); assert.equal(p.r, 1);
  }
  assert.equal(ride.passPlan({ ...base, rarity: 3, seed: 77, pass: 0 }).k, 1);
  const ks = new Set();
  for (const rarity of [3, 4, 5]) {
    for (let seed = 1; seed < 40; seed++) {
      for (let pass = 1; pass < 5; pass++) {
        const p = ride.passPlan({ ...base, rarity, seed, pass });
        assert.deepEqual(plain(p), plain(ride.passPlan({ ...base, rarity, seed, pass })), 'deterministic');
        assert.ok(p.k >= ride.SURGE_BOUNDS.k[0] && p.k <= ride.SURGE_BOUNDS.k[1]);
        assert.ok(p.r >= ride.SURGE_BOUNDS.r[0] && p.r <= ride.SURGE_BOUNDS.r[1]);
        ks.add(p.k.toFixed(2));
        const total = p.d1 + p.d2;
        // Starts at fromT, reaches the frame exactly at d1, ends at 1.
        assert.ok(Math.abs(ride.planT(p, 0) - p.fromT) < 1e-9);
        assert.ok(Math.abs(ride.planT(p, p.d1) - p.tFrame) < 1e-9);
        assert.ok(Math.abs(ride.planT(p, total) - 1) < 1e-9);
        // Monotonic, never stopped, no jump in speed at the frame.
        let last = -1, minSpeed = Infinity;
        for (let ms = 0; ms <= total; ms += 4) {
          const t = ride.planT(p, ms);
          assert.ok(t >= last - 1e-12, 'never reverses');
          if (ms > 0) minSpeed = Math.min(minSpeed, (t - last) / 4);
          last = t;
        }
        const nominal = 1 / base.passMs;
        assert.ok(minSpeed > nominal * 0.25, `never stalls (${(minSpeed / nominal).toFixed(2)}x)`);
        const before = (ride.planT(p, p.d1) - ride.planT(p, p.d1 - 1)) / 1;
        const after = (ride.planT(p, p.d1 + 1) - ride.planT(p, p.d1)) / 1;
        assert.ok(Math.abs(before - after) / nominal < 0.05, 'smooth at the frame');
        assert.ok(Math.abs(after / nominal - p.r) < 0.05, 'arrives at r x nominal speed');
        // The inverse: wall clock back from pass time, so a tap is graded in real milliseconds.
        for (const ms of [0, 200, p.d1 - 37, p.d1, p.d1 + 90, total - 1]) {
          assert.ok(Math.abs(ride.planMs(p, ride.planT(p, ms)) - ms) < 1.5, `inverse at ${ms}`);
        }
        // The easing withTiming runs is the same curve.
        const ease = ride.planEasing(p);
        assert.ok(Math.abs(ease(p.d1 / total) - (p.tFrame - p.fromT) / (1 - p.fromT)) < 1e-9);
      }
    }
  }
  assert.ok(ks.size > 10, 'passes really vary');
  // A tap exactly at arrival plus the input latency is a Frame It! on the surging clock.
  const p = ride.passPlan({ ...base, rarity: 5, seed: 9, pass: 2 });
  const tapMs = ride.planMs(p, ride.planT(p, p.d1 + ride.INPUT_LATENCY_MS));
  assert.equal(ride.gradeOffset(ride.shotOffsetMs(tapMs, p.d1), 0, 5).grade, 'frame_it');
});

const REWARDS = { experience: 72, coins: 0, energy: 16, tickets: 1, bonusXp: 15 };
const input = (over = {}) => ({ tier: 3, grade: 'great', isNew: true, golden: false, reducedMotion: false, rewards: REWARDS, ...over });

test('reveal plan: beat order, rarer is bigger, Legendary charges, Reduce Motion keeps the content', () => {
  const order = plan => plain(plan.map(slot => slot.beat));
  assert.deepEqual(order(rules.revealPlan(input())), ['lift', 'wobble', 'burst', 'title', 'tally', 'book', 'actions']);
  assert.deepEqual(order(rules.revealPlan(input({ tier: 5 }))), ['lift', 'charge', 'wobble', 'burst', 'title', 'tally', 'book', 'actions']);
  assert.deepEqual(order(rules.revealPlan(input({ reducedMotion: true, tier: 5 }))), ['lift', 'burst', 'title', 'tally', 'book', 'actions'],
    'no charge or wobble with Reduce Motion, but every piece of content');
  // Contiguous slots that start at 0.
  for (const plan of [rules.revealPlan(input()), rules.revealPlan(input({ tier: 5 }))]) {
    assert.equal(plan[0].at, 0);
    for (let i = 1; i < plan.length; i++) assert.equal(plan[i].at, plan[i - 1].at + plan[i - 1].ms);
  }
  // Rarer finds get a longer, bigger moment; more wobbles before the pop.
  const lengths = [2, 3, 4, 5].map(tier => rules.revealLength(rules.revealPlan(input({ tier }))));
  for (let i = 1; i < lengths.length; i++) assert.ok(lengths[i] > lengths[i - 1], `tier ${i + 2} longer`);
  assert.deepEqual(plain(rules.WOBBLES), { 2: 1, 3: 2, 4: 3, 5: 3 });
  const burst = tier => rules.revealPlan(input({ tier })).find(s => s.beat === 'burst').ms;
  assert.ok(burst(5) > burst(4) && burst(4) > burst(3) && burst(3) > burst(2));
  // Frame It! holds the light a touch longer; a new find gets the longer book beat (the NEW! stamp).
  assert.ok(rules.revealPlan(input({ grade: 'frame_it' })).find(s => s.beat === 'burst').ms > burst(3));
  const book = isNew => rules.revealPlan(input({ isNew })).find(s => s.beat === 'book').ms;
  assert.ok(book(true) > book(false));
  // Not a slog: an Uncommon plays out in under 5 s, a Legendary in under 7.5 s, Reduce Motion under 2.5 s.
  assert.ok(lengths[0] < 5500, `uncommon ${lengths[0]}`);
  assert.ok(lengths[3] < 7500, `legendary ${lengths[3]}`);
  assert.ok(rules.revealLength(rules.revealPlan(input({ reducedMotion: true, tier: 5 }))) < 2500);
  assert.equal(rules.beatAt(rules.revealPlan(input()), 0), 'lift');
  assert.equal(rules.beatAt(rules.revealPlan(input()), 1e9), 'actions');
});

test('reveal state machine: first viewing plays through, later a tap skips (never past NEW!), CONTINUE only from the actions', () => {
  const plan = rules.revealPlan(input());
  let s = rules.revealStart(rules.canSkip(new Set(), 3), true);
  assert.equal(s.skippable, false);
  s = rules.revealStep(s, { type: 'advance', beat: 'wobble' }, plan);
  assert.equal(rules.revealStep(s, { type: 'tap' }, plan), s, 'tap ignored on a first viewing');
  assert.equal(rules.revealStep(s, { type: 'continue' }, plan), s, 'no CONTINUE before the buttons');
  assert.equal(rules.revealStep(s, { type: 'advance', beat: 'lift' }, plan), s, 'beats never go back');
  for (const beat of ['burst', 'title', 'tally', 'book', 'actions']) s = rules.revealStep(s, { type: 'advance', beat }, plan);
  assert.equal(s.beat, 'actions');
  s = rules.revealStep(s, { type: 'continue' }, plan);
  assert.equal(s.done, true);
  assert.equal(rules.revealStep(s, { type: 'tap' }, plan), s, 'done is final');
  // Seen before and owned: a tap jumps to the buttons, and a late timer can't drag it back.
  let t = rules.revealStart(true, false);
  t = rules.revealStep(t, { type: 'advance', beat: 'burst' }, plan);
  t = rules.revealStep(t, { type: 'tap' }, plan);
  assert.equal(t.beat, 'actions'); assert.equal(t.skipped, true);
  assert.equal(rules.revealStep(t, { type: 'advance', beat: 'book' }, plan), t);
  // Seen before but NEW: the skip lands on the book page, so the NEW! stamp still slams.
  let n = rules.revealStart(true, true);
  n = rules.revealStep(n, { type: 'advance', beat: 'title' }, plan);
  n = rules.revealStep(n, { type: 'tap' }, plan);
  assert.equal(n.beat, 'book');
  assert.equal(rules.revealStep(n, { type: 'tap' }, plan), n, 'the NEW! page plays out');
  assert.equal(rules.revealStep(n, { type: 'advance', beat: 'actions' }, plan).beat, 'actions');
  // Per tier: a first Legendary still plays in full.
  assert.equal(rules.canSkip(new Set([2, 3]), 5), false);
});

test('repeats are short and continue on their own; the photo bonus is a prize, not a sum', () => {
  assert.equal(rules.isCompact(new Set([3]), 3, false), true);
  assert.equal(rules.isCompact(new Set([3]), 3, true), false, 'a new find always gets the full moment');
  assert.equal(rules.isCompact(new Set(), 3, false), false, 'a first viewing is never compact');
  const full = rules.revealLength(rules.revealPlan(input({ isNew: false })));
  const short = rules.revealLength(rules.revealPlan(input({ isNew: false, compact: true })));
  assert.ok(short <= 2600, `repeat to the buttons ${short} ms`);
  assert.ok(short < full * 0.6);
  assert.equal(rules.autoContinueMs({ compact: true }), rules.COMPACT_AUTO_CONTINUE_MS);
  assert.equal(rules.autoContinueMs({ compact: false }), null);
  const split = plain(rules.xpSplit(72, 15));
  assert.equal(split.base, 57); assert.equal(split.bonus, 15);
  assert.equal(rules.tallyValue(72, split.baseProgress), 57, 'the count lands exactly on the base XP first');
  assert.equal(plain(rules.xpSplit(40, 0)).baseProgress, 1);
});

test('reveal numbers: the server rewards count up, XP first, zeros hidden, the book page ticks by one', () => {
  assert.deepEqual(plain(rules.tallyRows(REWARDS)), [{ key: 'xp', to: 72 }, { key: 'energy', to: 16 }, { key: 'ticket', to: 1 }]);
  assert.deepEqual(plain(rules.tallyRows({ experience: 0, coins: 0, energy: 0, tickets: 0, bonusXp: 0 })), []);
  let last = -1;
  for (let p = 0; p <= 1.0001; p += 0.01) {
    const v = rules.tallyValue(72, p);
    assert.ok(Number.isInteger(v) && v >= last && v <= 72);
    last = v;
  }
  assert.equal(rules.tallyValue(72, 1), 72);
  assert.equal(rules.tallyValue(72, 0), 0);
  assert.deepEqual(plain(rules.bookPage(4, 12, true)), { grid: true, total: 12, before: 3, after: 4, newIndex: 3 });
  assert.deepEqual(plain(rules.bookPage(4, 12, false)), { grid: true, total: 12, before: 4, after: 4, newIndex: null });
  assert.equal(rules.bookPage(30, 40, true).grid, false, 'a big set shows a line, not 40 slots');
  assert.equal(rules.bookPage(99, 12, true).after, 12, 'never past the total');
  assert.equal(rules.bookPage(null, null, true).total, 0);
  assert.equal(rules.revealTitle(5), 'LEGENDARY!');
  assert.equal(rules.revealTitle(4), 'EPIC CATCH!');
  assert.equal(rules.revealTitle(2), 'CAUGHT!');
});

test('reveal wiring: always mounted, server numbers only, CONTINUE hands off to the badge, no new grants', () => {
  const reveal = read('src/screens/ExploreScreen/ridePhoto/CatchReveal.tsx');
  const moment = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  // Always mounted, never an early return: the component has no `return null`.
  assert.doesNotMatch(reveal, /return null;/);
  assert.match(moment, /<CatchReveal data=\{shownReveal\}/);
  assert.doesNotMatch(moment, /\{shownReveal && <CatchReveal/, 'never mounted on demand');
  // Rewards come from the server answer; the client never invents a grant.
  assert.match(moment, /const paid = !!data && !data\.replayed;/);
  assert.match(moment, /experience: paid \? data!\.rewards\.experience : 0/);
  assert.match(moment, /bonus = typeof data\?\.photo\?\.bonus_xp === 'number'/);
  assert.doesNotMatch(reveal, /grantCoins|addCurrency|increment|setCurrencies/);
  // The hand-off keeps the proven path: CONTINUE runs closeRide(true) and the print's flight to the badge.
  assert.match(moment, /const handOff = async \(\) => \{[\s\S]{0,260}await wait\(REVEAL_FADE_MS\);[\s\S]{0,120}closeRide\(true\);[\s\S]{0,300}flyTo/, 'fade first, then the close and the flight in one commit');
  assert.match(moment, /const brief = revealedRef\.current;/, 'the badge does not repeat the reveal');
  // The reveal starts while the server decides; a ride-by (or a failed call) shakes free instead of popping.
  assert.match(moment, /setRevealOutcome\('pending'\);\s*setReveal\(revealData\(req\.item, null,/);
  assert.match(moment, /escapeHand\.current = fail;[\s\S]{0,200}setRevealOutcome\('escaped'\);/);
  assert.match(moment, /if \(!reveal\) catchHaptic\('failBuzz', 3\);/, 'no outcome buzz while the roll plays');
  assert.match(moment, /latest\.current\.onRideAgain\?\.\(req\.item, req\.pivotId\)/, 'RIDE AGAIN reopens the same find');
  assert.match(reveal, /if \(result === 'escaped'\) \{ waiting\.current = null; runEscape\(\); return; \}/);
  assert.match(reveal, /PENDING_WOBBLE_CAP_MS/);
  // No black iris after a reveal: the viewfinder hides under it and the print flies over the map.
  assert.match(moment, /fadeClose=\{!!shownReveal\}/);
  // The catching photo's grade does not compete with the reveal: no cheer or confetti there.
  assert.match(read('src/screens/ExploreScreen/ridePhoto/RidePhotoCatch.tsx'), /if \(caught \|\| spec\.photosNeeded > 1\) \{\s*catchSound\('stamp', \{ volume: 0\.7 \}\); buzz\('hitSoft', 2\);/);
  // Skip and first-view rules come from revealRules, persisted per tier.
  assert.match(reveal, /revealStart\(canSkip\(seenTiers, data\.tier\), data\.isNew \|\| !!data\.newBest\)/);
  assert.match(reveal, /if \(!stateRef\.current\.skipped\) markSeen\(d\.tier\)/);
  // Reduce Motion: no rays, wobble or flash.
  assert.match(reveal, /rays\.value = rm \? 0 :/);
  // Counts tick on the UI thread (no React render per tick).
  assert.match(reveal, /const shown = useDerivedValue\(\(\) => tallyValue\(to, progress\.value\)\);/, 'native text only when the number changes');
  assert.doesNotMatch(reveal, /<FxStage/, 'no always-on FX frame loop in the reveal (one shared value per confetti volley)');
  assert.match(reveal, /<Volley x=\{cx\} y=\{L\.medal\} progress=\{volleyA\}/);
});

test('round 3: the book page never disagrees with its count; the shot earns a quicker pop; the mercy ride grades as Uncommon', () => {
  const page = Array.from({ length: 12 }, (_, i) => ({ id: 100 + i, owned: i < 3 }));
  // The page read at the ride's start (3 owned) plus this new find: the server says 4, so the art is exact.
  const slots = plain(rules.ownedSlots(page, 107, 4, 12));
  assert.equal(slots.filter(s => s.owned).length, 4);
  assert.equal(slots.find(s => s.id === 107).owned, true);
  assert.equal(slots.find(s => s.id === 107).caught, true);
  // A repeat never changes the count: an owned find caught again keeps 3.
  assert.equal(plain(rules.ownedSlots(page, 101, 3, 12)).filter(s => s.owned).length, 3);
  // The server disagrees (another device, a stale page): no guessed art, plain slots instead.
  assert.equal(rules.ownedSlots(page, 107, 5, 12), null);
  assert.equal(rules.ownedSlots(page, 999, 4, 12), null, 'not this set: plain slots');
  assert.equal(rules.ownedSlots(page, 107, 4, 13), null);
  // The tally's length is the sum the component plays, and the bonus lands before the book.
  const rw = { experience: 72, coins: 0, energy: 16, tickets: 1, bonusXp: 15 };
  const rowsSum = rules.tallyRows(rw).reduce((sum, row) => sum + 60 + rules.rowMs(row.to) + 40, 100);
  assert.equal(rules.tallyMs(rw), rowsSum + rules.BONUS_MS + 160);
  assert.ok(rules.tallyMs(rw) - (rowsSum + rules.BONUS_MS) >= 150, 'the bonus chime lands at least 150 ms before the book');
  assert.deepEqual([2, 3, 4, 5].map(t => rules.wobblesFor(t, 'frame_it')), [1, 1, 1, 1]);
  assert.deepEqual([2, 3, 4, 5].map(t => rules.wobblesFor(t, 'great')), [1, 2, 2, 2]);
  assert.deepEqual([2, 3, 4, 5].map(t => rules.wobblesFor(t, 'good')), [1, 2, 3, 3]);
  const src = read('src/screens/ExploreScreen/ridePhoto/RidePhotoCatch.tsx');
  assert.match(src, /gradeOffset\(offset, misses\.value, mercyOn\.value \? 2 : rarity\)/);
  // A repeat never shows NEW!: the stamp is gated in its animated style, and a skip never sets it.
  const reveal = read('src/screens/ExploreScreen/ridePhoto/CatchReveal.tsx');
  assert.match(reveal, /opacity: stampNew && stamp\.value > 0 \?/);
  assert.match(reveal, /to\(stamp, dataRef\.current\?\.isNew \|\| dataRef\.current\?\.newBest \? 1 : 0\)/);
});

test('round 5: beats run on the latest data, RIDE AGAIN keeps the card up and never replays a ride, Reduce Motion only fades', () => {
  const reveal = read('src/screens/ExploreScreen/ridePhoto/CatchReveal.tsx');
  const moment = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  const catchSrc = read('src/screens/ExploreScreen/ridePhoto/RidePhotoCatch.tsx');
  // The photo bonus (and every beat) reads the server's answer, not the pending render's zeros.
  assert.match(reveal, /runBeatRef\.current = runBeat;/);
  assert.doesNotMatch(reveal, /later\([^)]*\(\) => runBeat\(/, 'no timer holds a stale beat closure');
  // RIDE AGAIN: the card stays up and the next ride opens under it; the map never shows.
  assert.match(reveal, /if \(choice === 'map'\) shown\.value = withTiming\(0/);
  assert.match(moment, /finish\(false, true\)/);
  // The next ride's surges are seeded with the server's rides used, so it is a different ride.
  assert.match(catchSrc, /seed: \(item\?\.id \?\? 0\) \+ ridesUsed \* 7919/);
  const a = plain(ride.passPlan({ rarity: 5, seed: 900, pass: 0, fromT: 0.1, tFrame: 0.7, passMs: 1900 }));
  const b = plain(ride.passPlan({ rarity: 5, seed: 900 + 7919, pass: 0, fromT: 0.1, tFrame: 0.7, passMs: 1900 }));
  assert.notDeepEqual(a, b);
  // Reduce Motion: title, ribbon, rows, page and NEW! cross-fade with no scale or slide.
  for (const re of [/scale: rmOn \? 1 : title\.value/, /scaleX: rmOn \? 1 :/, /translateY: rmOn \? 0 : \(1 - rowIn0\.value\)/, /translateY: rmOn \? 0 : \(1 - page\.value\)/, /scale: rmOn \? 1 : stamp\.value/]) {
    assert.match(reveal, re);
  }
});

test('R6 camera obstacle: Epic 20 pt, Legendary 28 pt plus one seeded 10 pt bump 300 to 600 ms out; never mercy or Reduce Motion', () => {
  assert.equal(ride.swayFor(4).amp, 20);
  assert.equal(ride.swayFor(5).amp, 28);
  assert.equal(ride.swayFor(3).amp, 8, 'Rare unchanged');
  assert.equal(ride.swayFor(2).amp, 0, 'Uncommon unchanged');
  assert.equal(ride.bumpFor(4, 1, 1), null, 'Epic has no bump');
  assert.equal(ride.bumpFor(5, 1, 1, true), null, 'Reduce Motion: no bump');
  assert.equal(ride.bumpFor(5, 1, 1, false, true), null, 'mercy ride: no bump');
  const leads = new Set(), dirs = new Set();
  for (let seed = 1; seed < 60; seed++) for (let pass = 0; pass < 4; pass++) {
    const b = ride.bumpFor(5, seed, pass);
    assert.deepEqual(plain(b), plain(ride.bumpFor(5, seed, pass)), 'seeded');
    assert.ok(b.leadMs >= 300 && b.leadMs <= 600);
    leads.add(b.leadMs); dirs.add(b.dir);
  }
  assert.ok(leads.size > 20 && dirs.size === 2, 'bumps vary pass to pass');
  assert.deepEqual(plain(ride.bumpAt(1, -1)), { x: -10, y: -4.5 });
  assert.deepEqual(plain(ride.bumpAt(0, 1)), { x: 0, y: -0 });
  // The worst drift (sway + bump) still shifts a tap by at most the cap.
  assert.equal(ride.swayShiftMs(38, 0.1, 1), ride.SWAY_SHIFT_CAP_MS);
  const src = read('src/screens/ExploreScreen/ridePhoto/RidePhotoCatch.tsx');
  assert.match(src, /bumpFor\(item\?\.rarity, seed, passCount\.current, parkedMode \|\| reducedMotion, mercy\)/);
  assert.match(src, /if \(bumpLead\.value > 0 && ms <= bumpLead\.value\)/, 'fires on the car distance');
});

test('R6 gull photobomb: Rare and up, 1 pass in 4, crosses within 150 ms of arrival, caps at Good, seen coming', () => {
  for (const tier of [2]) for (let seed = 1; seed < 200; seed++) assert.equal(ride.gullFor(tier, seed, 1), null, 'never on Uncommon');
  assert.equal(ride.GULL_LEAD_MS, 600);
  for (const tier of [3, 4, 5]) {
    let hits = 0, n = 0;
    for (let seed = 1; seed < 400; seed++) for (let pass = 0; pass < 4; pass++) {
      n++;
      const g = ride.gullFor(tier, seed, pass);
      assert.deepEqual(plain(g), plain(ride.gullFor(tier, seed, pass)), 'seeded');
      if (!g) continue;
      hits++;
      assert.ok(Math.abs(g.centerMs) <= 150);
      assert.ok(g.dir === 1 || g.dir === -1);
      assert.equal(ride.gullFor(tier, seed, pass, { mercy: true }), null);
      assert.equal(ride.gullFor(tier, seed, pass, { reducedMotion: true }), null);
      assert.equal(ride.gullFor(tier, seed, pass, { freeze: true }), null);
    }
    assert.ok(Math.abs(hits / n - 0.25) < 0.04, `tier ${tier}: about 1 in 4 (${(hits / n).toFixed(3)})`);
  }
  assert.equal(ride.gullInFrame(0), true);
  assert.equal(ride.gullInFrame(80), true);
  assert.equal(ride.gullInFrame(-81), false);
  assert.deepEqual(['blurry', 'good', 'great', 'frame_it'].map(ride.photobombCap), ['blurry', 'good', 'good', 'good']);
  const src = read('src/screens/ExploreScreen/ridePhoto/RidePhotoCatch.tsx');
  assert.match(src, /gullInFrame\(gullMs\.value\) && grade !== 'blurry'\) \{\s*bombed = true;\s*grade = photobombCap\(grade\);/);
  assert.match(src, /Photobombed!/);
  assert.match(src, /gullFor\(item\?\.rarity, seed, passCount\.current, \{ reducedMotion: parkedMode \|\| reducedMotion, mercy, freeze: hintFreeze\.value \}\)/);
  // The scenery never sends a free gull any more (it would teach that a gull is harmless).
  const cat = loadTs('src/screens/ExploreScreen/ridePhoto/rides/catalog.ts');
  for (let seed = 1; seed < 300; seed++) assert.notEqual(cat.sceneVariant({ seed, kind: 'coaster' }).photobomb, 'gull');
});

test('R6 Uncommon grows up: the green lead is 200 ms for the first 10 catches, then 120 ms', () => {
  assert.equal(ride.uncommonGreenLead(0), 200);
  assert.equal(ride.uncommonGreenLead(9), 200);
  assert.equal(ride.uncommonGreenLead(10), 120);
  assert.equal(ride.uncommonGreenLead(500), 120);
  // A child reacting to a 120 ms green (about 250 ms) still lands Good on Uncommon.
  assert.equal(ride.gradeOffset(250 - 120, 0, 2).grade !== 'blurry', true);
  const src = read('src/screens/ExploreScreen/ridePhoto/RidePhotoCatch.tsx');
  assert.match(src, /!mercy && Math\.round\(item\?\.rarity \?\? 0\) === 2 \? uncommonGreenLead\(uncommonCatches\) : tele\.greenLeadMs/);
});

test('R6 NEW BEST!: only on the server word for a repeat; the slot flips to gold in 600 ms; book stars; skip never passes it', () => {
  assert.equal(rules.isNewBest(false, { new_best: true }), true);
  assert.equal(rules.isNewBest(true, { new_best: true }), false, 'a new find is NEW!, not NEW BEST!');
  assert.equal(rules.isNewBest(false, { new_best: false }), false);
  assert.equal(rules.isNewBest(false, null), false, 'older servers: no field, no NEW BEST!');
  assert.equal(rules.isNewBest(false, {}), false);
  assert.deepEqual([null, 'good', 'great', 'frame_it', 'weird'].map(rules.bestStars), [0, 1, 2, 3, 0]);
  assert.equal(rules.NEW_BEST_SWAP_MS, 600);
  const book = p => p.find(s => s.beat === 'book').ms;
  const rep = input({ isNew: false });
  assert.ok(book(rules.revealPlan({ ...rep, newBest: true })) >= rules.NEW_BEST_SWAP_MS + 340, 'room for the swap and stamp');
  assert.ok(book(rules.revealPlan({ ...rep, newBest: true, compact: true })) >= rules.NEW_BEST_SWAP_MS + 160 + 120);
  assert.equal(book(rules.revealPlan({ ...rep, newBest: false })), 760, 'plain repeat unchanged');
  const reveal = read('src/screens/ExploreScreen/ridePhoto/CatchReveal.tsx');
  assert.match(reveal, /'NEW BEST!'/);
  assert.match(reveal, /isNew: d\.isNew \|\| !!d\.newBest/);
  const moment = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  assert.match(moment, /const newBest = isNewBest\(sum\.isNew, data\?\.photo\);/);
  assert.match(moment, /'is_collected' \| 'best_photo_grade'/);
});
