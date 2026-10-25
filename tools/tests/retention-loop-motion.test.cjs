const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/retention-loop-motion.test.cjs
// The daily loops' motion and copy rules: Daily 3 check-off, full set, flame tiers, milestones, tomorrow card.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const L = loadTs('src/services/retention/loopMotion.ts');
const motion = loadTs('src/ui/motion.ts');
const plain = v => JSON.parse(JSON.stringify(v));

test('the flame only grows with the streak, and each tier looks different', () => {
  const days = [0, 1, 2, 3, 6, 7, 29, 30, 99, 100, 365];
  let prev = null;
  for (const d of days) {
    const look = L.flameLook(d);
    if (prev) {
      assert.ok(look.scale >= prev.scale, `scale grows at ${d}`);
      assert.ok(look.sparks >= prev.sparks, `sparks grow at ${d}`);
      assert.ok(look.halo >= prev.halo, `halo grows at ${d}`);
    }
    prev = look;
  }
  assert.deepEqual(['ember', 'small', 'medium', 'big', 'core', 'crown'],
    [0, 1, 3, 7, 30, 100].map(d => L.flameLook(d).tier));
  assert.equal(L.flameLook(29).core, false);
  assert.equal(L.flameLook(30).core, true);
  assert.equal(L.flameLook(99).crown, false);
  assert.equal(L.flameLook(100).crown, true);
  // Ambient sparks stay inside the 12-sprite budget even with several flames on screen.
  assert.ok(L.flameLook(1000).sparks <= 5);
});

test('milestones play once, on the day the streak lands on them', () => {
  assert.deepEqual(plain(L.flameMomentFor(2, 3, true)), { kind: 'milestone', day: 3, from: 2 });
  assert.deepEqual(plain(L.flameMomentFor(6, 7, true)), { kind: 'milestone', day: 7, from: 6 });
  assert.deepEqual(plain(L.flameMomentFor(29, 30, true)), { kind: 'milestone', day: 30, from: 29 });
  assert.deepEqual(plain(L.flameMomentFor(99, 100, true)), { kind: 'milestone', day: 100, from: 99 });
  assert.deepEqual(plain(L.flameMomentFor(4, 5, true)), { kind: 'plusOne', from: 4, to: 5 });
  // Already celebrated, not counted yet, or a fresh install with an old streak: nothing fake.
  assert.equal(L.flameMomentFor(7, 7, true).kind, 'none');
  assert.equal(L.flameMomentFor(6, 7, false).kind, 'none');
  assert.equal(L.flameMomentFor(null, 12, true).kind, 'none');
  assert.deepEqual(plain(L.flameMomentFor(null, 1, true)), { kind: 'plusOne', from: 0, to: 1 });
  assert.equal(L.milestoneHaptic(3), 'finisher');
  assert.equal(L.milestoneHaptic(7), 'finisher');
  assert.equal(L.milestoneHaptic(30), 'ko');
  assert.equal(L.milestoneHaptic(100), 'ko');
});

test('milestone flame rows read with zero words', () => {
  assert.deepEqual(plain(L.milestoneFlames(3)), { rows: 1, perRow: 3, crown: false });
  assert.deepEqual(plain(L.milestoneFlames(7)), { rows: 1, perRow: 7, crown: false });
  assert.deepEqual(plain(L.milestoneFlames(30)), { rows: 3, perRow: 10, crown: false });
  assert.deepEqual(plain(L.milestoneFlames(100)), { rows: 1, perRow: 10, crown: true });
});

test('every loop line is kid-safe: no loss, guilt or rush words', () => {
  const lines = [
    L.milestoneBadge(3), L.milestoneBadge(100),
    ...[0, 1, 2, 3, 6, 7, 29, 30, 99, 100, 140].map(L.nextFlameLine),
    L.tomorrowPrize(null).line,
    L.tomorrowPrize({ done: true, reward: { coins: 15, tickets: 1, energy: 0, xp: 35 }, streak: { days: 4 } }).line,
    L.tomorrowPrize({ done: true, reward: { coins: 15, tickets: 1, energy: 0, xp: 35 },
      streak: { days: 6, next_milestone: { day: 7, gear: true, mystery_boxes: 0, label: 'New gear', days_away: 1 } } }).line,
    'Your flame is lit!', 'SEE YOU TOMORROW!', 'All 3 done!', 'Start a new flame today!',
  ];
  for (const line of lines) assert.ok(L.kidSafeCopy(line), line);
  assert.equal(L.kidSafeCopy('You lost your streak'), false);
  assert.equal(L.kidSafeCopy('Hurry, last chance!'), false);
  assert.equal(L.nextFlameLine(6), '1 more day to the big flame!');
  assert.equal(L.nextFlameLine(4), '3 more days to the big flame');
});

test("tomorrow's prize comes from the server's numbers only", () => {
  const t = L.tomorrowPrize({ done: true, reward: { coins: 15, tickets: 1, energy: 0, xp: 35 }, streak: { days: 4 } });
  assert.equal(t.kind, 'chest');
  assert.equal(t.flameNext, 5);
  assert.deepEqual(plain(t.chips), [{ icon: 'coins', n: 15 }, { icon: 'ticket', n: 1 }, { icon: 'xp', n: 35 }]);
  const gear = L.tomorrowPrize({ done: true, reward: { coins: 15, tickets: 1, energy: 20, xp: 35 },
    streak: { days: 6, next_milestone: { day: 7, gear: true, mystery_boxes: 0, label: 'New gear', days_away: 1 } } });
  assert.equal(gear.kind, 'gear');
  const unknown = L.tomorrowPrize(null);
  assert.equal(unknown.kind, 'flame');
  assert.equal(unknown.chips.length, 0);
});

test('check-off and full set fit the motion language (payoff inside 1.5 s, settle inside 2.6 s)', () => {
  // The check lands and the ring fills well inside the 1.5 s payoff.
  assert.ok(L.CHECK.fly + L.CHECK.ring <= 1500);
  assert.equal(L.CHECK.fly, 500);
  assert.equal(L.CHECK.ring, 400);
  assert.equal(L.CHECK.draw, 260);
  assert.ok(L.CHECK.sparkles <= motion.PARTICLES.sparkles && L.CHECK.fullSparkles <= motion.PARTICLES.sparkles);
  assert.deepEqual(plain(L.FULL_SET.tickSteps), [0, 4, 8]);
  assert.equal(L.FULL_SET.checkStep, 120);
  // From the third check landing to the chest's lid: ring + sheet hand-off + chest beat + the chest anticipation and hit-stop.
  const chest = motion.momentBeats('chest', { reduced: false });
  // The third segment fills faster and the card grows out of the button as it completes.
  assert.ok(L.CHECK.fullRing < L.CHECK.ring);
  const lid = L.CHECK.fullRing + L.FULL_SET.sheetAt + L.FULL_SET.chestAt + chest.burstAt;
  assert.ok(lid <= 1400, `lid pops ${lid} ms after the third check lands`);
  // The chest's own lid beat matches: checks dive in, then the chest gather.
  assert.equal(L.lidDelay({ autoOpen: true }), L.FULL_SET.chestAt + chest.anticipation);
  assert.equal(L.lidDelay({ dropIn: true }), L.LEVEL_CHEST.holdMs);
  assert.ok(L.FULL_SET.flash <= motion.DURATION.flash);
});

test('loop code uses the shared press, stagger and count tokens (one motion language)', () => {
  assert.deepEqual(plain(L.PRESS), plain(motion.PRESS));
  assert.deepEqual(plain(L.STAGGER), plain(motion.STAGGER));
  assert.deepEqual(plain(L.COUNT), plain(motion.COUNT));
  assert.deepEqual(plain(L.HUD_BUMP), plain(motion.HUD_BUMP));
});

test('chest rows all land and finish counting inside 1.2 s, and never show +0', () => {
  const logic = loadTs('src/services/retention/logic.ts');
  const rows = [{ kind: 'xp' }, { kind: 'energy' }, { kind: 'coins' }, { kind: 'tickets' }];
  const t = logic.rowSchedule(rows, L.REVEAL_ROWS.beat, L.REVEAL_ROWS.hold, L.REVEAL_ROWS.first);
  for (const start of t) assert.ok(start + L.rowCountMs(start, motion.COUNT.ms) <= 1200 || L.rowCountMs(start) === 260, `row at ${start}`);
  assert.ok(t[t.length - 1] + L.rowCountMs(t[t.length - 1]) <= 1200);
  assert.equal(L.countStart(0), 0);
  assert.equal(L.countStart(1), 1);
  assert.ok(L.countStart(15) >= 1 && L.countStart(15) < 15);
  assert.ok(L.countStart(35) > 0);
});

test('a normal day is one tap after the chest; big flames and tomorrow cards only when they matter', () => {
  const chest = { kind: 'chest', flameNext: 9, chips: [{ icon: 'coins', n: 15 }], line: '' };
  const gear = { ...chest, kind: 'gear' };
  const plus = { kind: 'plusOne', from: 7, to: 8 };
  assert.deepEqual(plain(L.dailyChain({ moment: plus, prize: chest, tomorrowSeen: true, milestoneAway: 5 })), []);
  assert.deepEqual(plain(L.dailyChain({ moment: plus, prize: chest, tomorrowSeen: false })), ['tomorrow']);
  assert.deepEqual(plain(L.dailyChain({ moment: plus, prize: gear, tomorrowSeen: true })), ['tomorrow']);
  assert.deepEqual(plain(L.dailyChain({ moment: { kind: 'milestone', day: 7, from: 6 }, prize: chest, tomorrowSeen: true, milestoneAway: 23 })), ['flame']);
  assert.deepEqual(plain(L.dailyChain({ moment: plus, prize: chest, tomorrowSeen: true, milestoneAway: 1 })), ['tomorrow']);
  assert.equal(L.mayAskAfterChain([]), true);
  assert.equal(L.mayAskAfterChain(['tomorrow']), false);
});

test('the level chest rattles three times inside 900 ms, shows a hand at 900 ms and bursts inside 1.5 s untapped', () => {
  const C = L.LEVEL_CHEST;
  const r = C.rattles;
  assert.deepEqual(plain(r.map(x => x.deg)), [8, 13, 18]);
  // Rattles never overlap and all end by 900 ms after the card opens.
  for (let i = 1; i < r.length; i++) assert.ok(r[i].at - r[i - 1].at >= C.rattleMs, `rattle ${i} spacing`);
  assert.ok(C.landMs + r[2].at + C.rattleMs <= 900);
  assert.equal(C.handAt, 900);
  // Auto-open, the held lid beat and the hit-stop: the burst lands inside 1.5 s of the card.
  assert.ok(C.autoOpenAt + C.holdMs + motion.DURATION.hitStop <= 1500);
  assert.equal(C.rowBeat, 180);
  const reveal = read('src/components/retention/RewardReveal.tsx');
  assert.match(reveal, /later\(\(\) => requestOpen\(\), LEVEL_CHEST\.autoOpenAt\)/);
  // Its claim starts when it lands (onArrive), so a slow server never makes it late.
  assert.match(read('src/components/retention/useRetention.tsx'), /levelAhead\.current = \{ level: r\.level, p \}/);
});

test('prizes fly home from their own rows: coins first, then tickets, then energy, 300 ms to the next card', () => {
  const rows = [{ kind: 'xp', amount: 55 }, { kind: 'energy', amount: 20 }, { kind: 'coins', amount: 20 }, { kind: 'tickets', amount: 1 },
    { kind: 'bonus_coins', amount: 5 }, { kind: 'item', amount: 1 }];
  const plan = plain(L.flightPlan(rows, () => true));
  assert.deepEqual(plan.map(l => l.target), ['coins', 'tickets', 'energy']);
  assert.equal(plan[0].amount, 25);
  assert.ok(plan[0].icons >= 6 && plan[0].icons <= 8);
  assert.ok(plan.every(l => l.icons <= L.PRIZE_FLIGHT.maxIcons));
  assert.deepEqual(plan.map(l => l.delay), [30, 110, 190]);
  // Every icon lands inside about 1 s, and the next card starts 140 ms after the last landing (no still map).
  const done = L.flightDoneMs(plan);
  assert.ok(done <= 1150, `next card at ${done}`);
  assert.equal(done, Math.max(...plan.map(l => l.lastLand)) + 140);
  // A counter that is not on screen gets no flight; nothing to fly hands off right after the exit.
  assert.deepEqual(plain(L.flightPlan(rows, t => t !== 'tickets')).map(l => l.target), ['coins', 'energy']);
  assert.ok(L.flightDoneMs([]) <= 400);
  assert.equal(L.flightTarget('xp'), null);
});

test('repeat chests are shorter and about one in ten is rare (stable per day)', () => {
  assert.equal(L.isRepeatChest(0), false);
  assert.equal(L.isRepeatChest(3), true);
  assert.ok(L.REPEAT_CHEST.gatherMs < motion.momentBeats('chest', { reduced: false }).anticipation);
  assert.equal(L.isRareChest('2026-10-24', 35), L.isRareChest('2026-10-24', 35));
  let rare = 0;
  for (let d = 1; d <= 365; d++) if (L.isRareChest(`2026-day-${d}`, 35)) rare++;
  assert.ok(rare > 15 && rare < 60, `rare ${rare} of 365`);
  assert.equal(L.isRareChest(null, 35), false);
});

test('the Shark Pass track glides, pours at most three steps one by one, and pops each', () => {
  const P = loadTs('src/services/money/passMotion.ts');
  const plan = plain(P.climbFills(2, 7));
  assert.deepEqual(Object.keys(plan.at).map(Number), [3, 4, 5, 6, 7]);
  assert.equal(plan.at[3].at, P.PASS_FX.openAt + Math.round(P.PASS_FX.scrollMs * 0.6));
  assert.equal(plan.at[4].at - plan.at[3].at, P.PASS_FX.pourMs);
  assert.equal(plan.at[6].ms, 0);
  assert.equal(plan.at[7].ms, 0);
  assert.equal(P.PASS_FX.nodePop, 1.3);
  assert.equal(P.PASS_FX.sparkles, 8);
  assert.deepEqual(plain(P.climbFills(4, 4).at), {});
  const screen = read('src/screens/SharkPassScreen.tsx');
  // The glide runs on the UI thread, and no price ever animates.
  assert.match(screen, /scrollTo\(list, x, 0, false\)/);
  assert.match(screen, /useAmbientLoop\(/);
});

test('the check flight arc starts at the shark and ends on the button', () => {
  const from = { x: -150, y: 80 };
  const to = { x: 0, y: 0 };
  assert.deepEqual(plain(L.arcPoint(0, from, to, 90)), from);
  assert.deepEqual(plain(L.arcPoint(1, from, to, 90)), to);
  assert.ok(L.arcPoint(0.5, from, to, 90).y < 0, 'the arc lifts above the button');
});

test('every loop sound has a Chris fallback (the app plays today\'s sounds until the studio switch is approved)', () => {
  for (const [name, cue] of Object.entries(L.LOOP_CUES)) {
    assert.match(cue.fallback, /^(fx|ui)\./, name);
    assert.ok(cue.studio.length > 0, name);
  }
});

test('loop moments run on the UI thread and respect the power budget', () => {
  for (const file of ['FlameArt', 'Daily3MapButton', 'StreakMoment', 'TomorrowCard', 'StampRibbon']) {
    const src = read(`src/components/retention/${file}.tsx`);
    assert.doesNotMatch(src, /from 'react-native-svg'/, `${file}: no animated SVG`);
    assert.doesNotMatch(src, /useNativeDriver:\s*false/, `${file}: no JS-driven Animated`);
    assert.doesNotMatch(src, /\u2014/, `${file}: no em dashes`);
  }
  // Ambient loops go through the budget (idle, background, Saver idle, Reduce Motion rest them).
  assert.match(read('src/components/retention/FlameArt.tsx'), /useAmbientLoop\(/);
  assert.match(read('src/components/retention/TomorrowCard.tsx'), /useAmbientLoop\(/);
  // Bursts are budgeted and flashes capped.
  assert.match(read('src/components/retention/Daily3MapButton.tsx'), /momentParticles\(full \? CHECK\.fullSparkles : CHECK\.sparkles/);
  assert.match(read('src/components/retention/Daily3MapButton.tsx'), /flashPeak\(isDimFlashingLightsEnabled\(\)/);
  assert.match(read('src/components/retention/StreakMoment.tsx'), /flashPeak\(isDimFlashingLightsEnabled\(\), false\)/);
});

test('the full set flows into the chest, prizes fly home in sight, then the big flame or tomorrow (one modal, never stacked)', () => {
  const hook = read('src/components/retention/useRetention.tsx');
  // The claim starts when the third check lands, so the chest never waits on the server.
  assert.match(hook, /claimAhead\.current = claimDailyThree\(\)/);
  assert.match(hook, /src: 'daily', claimDate: daily\.claimable_date, rewards: null, opening: false, auto: true/);
  // The modal steps aside while prizes fly into the HUD, then the chain continues one card at a time.
  assert.match(hook, /setView\(\{ k: 'flying', legs \}\)/);
  assert.match(hook, /setLegs\(legs\);/);
  // The next card is mounted early, hidden, in a second host and grows in on the UI thread the frame the last prize
  // lands (PrizeFlight writes `landed`), so mounting never stutters the flight and the map never sits still.
  assert.match(hook, /useAnimatedReaction\(\(\) => flightLanded\.value/);
  assert.match(hook, /setPreNext\(\{ step: chain\[0\] \}\)/);
  assert.match(read('src/components/retention/PrizeFlight.tsx'), /if \(landed\) landed\.value = Date\.now\(\);/);
  assert.match(read('src/components/retention/LoopStage.tsx'), /<NextBody store=\{store\} \/>/);
  // Worklet helpers are declared before the worklets that call them (a later declaration is undefined on the UI thread).
  const du = read('src/components/retention/delayUntil.ts');
  assert.ok(du.indexOf('function delayed') < du.indexOf('export function withDelayUntil'));
  assert.match(read('src/components/retention/LoopStage.tsx'), /<PrizeFlight legs=\{s\.legs\}/);
  // The next card never waits on the balance read (no 1.4 s hold): it starts 140 ms after the last landing.
  assert.doesNotMatch(hook, /setTimeout\(r, 1400\)/);
  assert.match(hook, /flightDoneMs\(plan\)/);
  // The last card stays mounted through its exit (no lone default ribbon), and the card leaves faster than it came.
  assert.match(hook, /lastCard\.current/);
  assert.match(hook, /PRIZE_FLIGHT\.exitMs, easing: EASE\.in/);
  assert.match(hook, /setView\(\{ k: 'flame', moment: flameRef\.current, enterAt \}\)/);
  assert.match(hook, /setView\(\{ k: 'tomorrow', enterAt \}\)/);
  assert.match(read('src/components/retention/StreakMoment.tsx'), /withDelayUntil\(startAt, a as never\)/);
  assert.match(read('src/components/retention/TomorrowCard.tsx'), /withDelayUntil\(startAt, x as never\)/);
  assert.match(hook, /dailyChain\(/);
  // The +1 lives inside the chest card.
  assert.match(hook, /<FlameUpRow /);
  const reveal = read('src/components/retention/RewardReveal.tsx');
  assert.match(reveal, /if \(autoOpen && !revealed && !opening\) requestOpen\(\)/);
  // Never a static "Opening..." line while the claim is in flight; the gold gathers instead.
  assert.doesNotMatch(reveal, /'Opening\.\.\.'/);
  assert.match(reveal, /<GoldBurst /);
  assert.match(reveal, /<RadialFlash /);
  assert.doesNotMatch(reveal, /flash: \{ backgroundColor: BRAND\.white \}/);
});

test('done checks are gold and the map ring flash is a capped gold glow (never a white strobe, never green)', () => {
  const sheet = read('src/components/retention/Daily3Sheet.tsx');
  assert.match(sheet, /<GoldCheck /);
  assert.doesNotMatch(sheet, /GameIcon name="check"/);
  assert.doesNotMatch(sheet, /styles\.strike/);
  const btn = read('src/components/retention/Daily3MapButton.tsx');
  assert.doesNotMatch(btn, /\? 1 : 0\.25/);
  // The full set's card mounts first, hidden; the check flies once it is mounted, and the card grows out of the
  // button on the UI thread the frame the ring completes (ringDone), so no JS delay can reorder them.
  assert.match(btn, /if \(finished && full && ringDone\) ringDone\.value = Date\.now\(\)/);
  assert.match(btn, /if \(!landing \|\| landing\.armed \|\| landed\.current === landing\.key\) return;/);
  const hook2 = read('src/components/retention/useRetention.tsx');
  assert.match(hook2, /useAnimatedReaction\(\(\) => ringDone\.value/);
  assert.match(hook2, /onShow=\{\(\) => goFullSetRef\.current\?\.\(\)\}/);
  assert.match(hook2, /withDelayUntil\(at, withSpring\(1, SPRING\.settle\)\)/);
  // Finn never covers words: he stands beside the button.
  assert.match(read('src/components/retention/StreakMoment.tsx'), /finn: \{ width: 72, height: 72 \}/);
});

test('loop copy stays kind: no loss words in the new moments', () => {
  for (const file of ['FlameUpRow', 'TomorrowCard', 'StreakMoment', 'RewardReveal', 'Daily3Sheet']) {
    const src = read(`src/components/retention/${file}.tsx`);
    const strings = [...src.matchAll(/'([^'\n]{6,})'/g)].map(m => m[1]).filter(t => /[a-z] [a-z]/i.test(t));
    for (const t of strings) assert.ok(L.kidSafeCopy(t), `${file}: "${t}"`);
  }
});

test('welcome back: only after 3+ days, real cards only, kind words, at most three', () => {
  const day = 86400000;
  const now = new Date(2026, 9, 24, 15, 0).getTime();
  assert.equal(L.daysAway(null, now), 0);
  assert.equal(L.daysAway(now - day, now), 1);
  assert.equal(L.daysAway(now - 5 * day, now), 5);
  assert.equal(L.daysAway(now + day, now), 0);
  assert.ok(L.WELCOME_FX.minDaysAway === 3);
  const goals = [{ key: 'chest', kind: 'chest', done: false }, { key: 'catch', kind: 'catch', done: false }, { key: 'bonus', kind: 'look', done: false }];
  const ember = plain(L.welcomeCards({ goals, streak: { days: 0 } }));
  assert.deepEqual(ember.map(c => c.kind), ['goals', 'ember', 'chest']);
  const saved = plain(L.welcomeCards({ goals, streak: { days: 9, freeze_saved: 2 } }, { levelChest: 4 }));
  assert.deepEqual(saved.map(c => c.kind), ['goals', 'saved', 'levelChest']);
  for (const c of [...ember, ...saved]) assert.ok(L.kidSafeCopy(c.text), c.text);
  for (const c of [...ember, ...saved]) assert.doesNotMatch(c.text, /miss|away|days ago/i);
  // Picture-first tiles: one number or one short word under each picture.
  assert.deepEqual(saved.map(c => L.welcomeTileLabel(c)), ['0 of 3', '9', 'Lv 4']);
  assert.deepEqual(ember.map(c => L.welcomeTileLabel(c)), ['0 of 3', 'New!', 'Open!']);
  for (const c of [...ember, ...saved]) assert.ok(L.welcomeTileLabel(c).length <= 6);
  assert.equal(L.WELCOME_FX.finnAt, 0);
  assert.equal(L.welcomeCards(null).length, 0);
});

test('next up: the chest shines when close and wiggles when very close', () => {
  assert.equal(L.nextUpTease(0.5), 'far');
  assert.equal(L.nextUpTease(0.8), 'close');
  assert.equal(L.nextUpTease(0.95), 'veryClose');
  assert.equal(L.NEXT_UP_FX.shineEveryMs, 5000);
  assert.equal(L.NEXT_UP_FX.wiggleEveryMs, 3000);
  const rail = read('src/components/nextUp/NextUpRail.tsx');
  assert.match(rail, /useAmbientLoop\(/);
  assert.match(rail, /experienceProgress\(player\)/);
  assert.doesNotMatch(rail, /useNativeDriver:\s*false/);
});

test('freezes: earned shields fly home, a saved flame cracks its ice, an ended flame becomes an ember (kind, no store)', () => {
  const src = read('src/components/retention/FreezeMoments.tsx');
  assert.match(src, /useAmbientLoop\(/);
  assert.match(src, /momentParticles\(FREEZE_FX\.frost/);
  assert.doesNotMatch(src, /navigate|Store|price/);
  assert.equal(L.FREEZE_FX.glintEveryMs, 6000);
  assert.equal(L.FREEZE_FX.fallMs, 600);
  for (const t of ['Your freeze saved your flame!', 'Start a new flame today!']) assert.ok(L.kidSafeCopy(t));
});

test('reward numbers roll on the UI thread and every loop card has the hand-drawn surface', () => {
  const reveal = read('src/components/retention/RewardReveal.tsx');
  assert.doesNotMatch(reveal, /setInterval\(/);
  assert.match(reveal, /useAnimatedProps\(/);
  for (const f of ['RewardReveal', 'StreakMoment', 'TomorrowCard', 'FreezeMoments', 'WelcomeBack', 'Daily3Sheet']) {
    assert.match(read(`src/components/retention/${f}.tsx`), /<CardSurface \/>/, f);
  }
  const flight = read('src/components/retention/PrizeFlight.tsx');
  assert.match(flight, /'worklet'/);
  assert.doesNotMatch(flight, /useNativeDriver: false/);
  // The flame ladder reads across the room: six clearly different sizes.
  assert.deepEqual([0, 1, 3, 7, 30, 100].map(d => L.flameLook(d).scale), [0.55, 0.7, 0.85, 1.0, 1.1, 1.2]);
  assert.equal(L.FREEZE_FX.landPop, 1.6);
});

test('one chest reveal, no strobe: one render starts it, the lid and every row run on the UI thread', () => {
  const reveal = read('src/components/retention/RewardReveal.tsx');
  // No state flips mid-burst (a render there showed a frame of the closed chest and replayed the burst).
  assert.doesNotMatch(reveal, /setLanded|setSwapped|setButtonReady|setShowTap|setReplay/);
  // The reveal plan is made once (a ref), and the reveal effect is guarded so it never runs twice.
  assert.match(reveal, /if \(revealed && !plan\.current\)/);
  assert.match(reveal, /if \(!revealed \|\| revealRan\.current\) return;/);
  // The lid swaps on the UI thread on the hit-stop frame (both arts mounted).
  assert.match(reveal, /lid\.value = atPop\(withTiming\(1, \{ duration: 0 \}\)\)/);
  // The open chest holds big on its rays for at least 300 ms before it glides into its slot.
  assert.ok(L.REVEAL_ROWS.heroHold >= 300);
  // Then it glides (eased, 280 to 350 ms) with its rays receding, and the first prize lands as it passes 60 percent.
  assert.match(reveal, /lift\.value = withDelayAfter\(entered, pl\.pop \+ pl\.hold, withTiming\(0, \{ duration: REVEAL_ROWS\.glideMs, easing: EASE\.out \}\)\)/);
  assert.ok(L.REVEAL_ROWS.glideMs >= 280 && L.REVEAL_ROWS.glideMs <= 350);
  const eased = 1 - Math.pow(1 - L.REVEAL_ROWS.firstAfterGlide / L.REVEAL_ROWS.glideMs, 3);
  assert.ok(eased >= 0.6, `first row lands at ${eased.toFixed(2)} of the glide`);
  // The answer goes straight to the card (no second JS wait before the burst); the chest keeps its own lid beat.
  const ret = read('src/components/retention/useRetention.tsx');
  assert.doesNotMatch(ret, /const wait = reducedMotion/);
  assert.match(ret, /gatherMs=\{lidDelay\(/);
  // The chest's preview and size never change mid-gather when the claim's answer updates the goals.
  assert.match(ret, /revealDaily\.current/);
});

test('a waiting layer knows its own id before listeners hear it (no one-frame flip that hid a just-opened card)', () => {
  const layers = read('src/ui/modalLayers.ts');
  assert.match(layers, /add\(claim\?: \(id: number\) => void\): number \{\s*const id = nextId\+\+;\s*claim\?\.\(id\);/);
  assert.match(layers, /const me = id \?\? mineRef\.current;/);
});

test('round 5: every beat of a loop card counts from the moment the card really enters (UI-thread mark)', () => {
  const delay = read('src/components/retention/delayUntil.ts');
  // Absolute marks read on the UI thread each frame (never a relative delay that a late hand-over stretches).
  assert.match(delay, /Date\.now\(\) >= when\(\)/);
  assert.match(delay, /export function withDelayAfter/);
  const reveal = read('src/components/retention/RewardReveal.tsx');
  assert.match(reveal, /useAnimatedReaction\(\(\) => entered\.value/);
  for (const sv of ['amp', 'flash', 'leak']) assert.match(reveal, new RegExp(`${sv}\\.value = atLid\\(`));
  for (const sv of ['pop', 'bloom', 'burst', 'sparkle']) assert.match(reveal, new RegExp(`${sv}\\.value = atPop\\(`));
  assert.match(reveal, /withDelayAfter\(entered, FULL_SET\.checksAt/);
  assert.match(reveal, /doneIn\.value = withDelayAfter\(entered, pl\.ready/);
  // Rows, checks, preview and the gather are scheduled in the commit that mounts them (layout effects).
  assert.ok((reveal.match(/useLayoutEffect\(/g) || []).length >= 5);
});

test('round 5: the loop card host never re-renders (no first-frame style can blink the card out)', () => {
  const stage = read('src/components/retention/LoopStage.tsx');
  assert.match(stage, /const LoopStage = memo\(/);
  assert.match(stage, /useSyncExternalStore/);
  assert.match(stage, /collapsable=\{false\}/);
  const hook = read('src/components/retention/useRetention.tsx');
  assert.match(hook, /useLayoutEffect\(\(\) => \{ stage\.set\(stageState\); \}\)/);
  assert.match(hook, /<LoopStage store=\{stage\} dimStyle=\{dimLayer\} cardStyle=\{cardLayer\}/);
  // AWESOME: the card fades and settles to 0.96 while the prizes lift off (never a one-frame cut).
  assert.match(hook, /\(1 - 0\.04 \* o\)/);
  assert.match(hook, /out\.value = withTiming\(1, \{ duration: reducedMotion \? DURATION\.quick : PRIZE_FLIGHT\.exitMs, easing: EASE\.in \}\)/);
});

test('round 5: a slow server never shakes the chest frantically (strong gather capped, then a calm glow and bob)', () => {
  const reveal = read('src/components/retention/RewardReveal.tsx');
  assert.match(reveal, /export const GATHER_CAP_MS = 1500;/);
  assert.match(reveal, /calm\.value = at\(GATHER_CAP_MS, withRepeat\(/);
  assert.doesNotMatch(reveal, /\), 60, true\)/);
});

test('round 5: kid clarity: gear without art is a gift (never a bare shark), the welcome flame reads as days', () => {
  const reveal = read('src/components/retention/RewardReveal.tsx');
  assert.match(reveal, /if \(!uri \|\| failed\) return <GameIcon name="gift"/);
  assert.doesNotMatch(reveal, /: <GameIcon name="shark" size=\{64\} \/>/);
  const goals = [{ key: 'chest', kind: 'chest', done: false }];
  const saved = plain(L.welcomeCards({ goals, streak: { days: 6, freeze_saved: 1 } }));
  assert.equal(saved.find(c => c.kind === 'saved').freezes, 1);
  const welcome = read('src/components/retention/WelcomeBack.tsx');
  assert.match(welcome, /<GameIcon name="streak" size=\{hero \? 26 : 18\} \/>/);
  // Finn says hello at once; tiles wait (bobbing) while today's goals load, never a still map.
  assert.match(welcome, /WaitingTile/);
  const hook = read('src/components/retention/useRetention.tsx');
  assert.match(hook, /setView\(\{ k: 'welcome', cards \}\);/);
  // The flame cards lead with tomorrow (one more day plus its prize), the far ladder small under it.
  assert.match(read('src/components/retention/FlameArt.tsx'), /export function TomorrowGoal/);
  assert.match(read('src/components/retention/StreakMoment.tsx'), /<TomorrowGoal days=\{to\} prize=\{prize\}/);
  assert.match(read('src/components/retention/FlameUpRow.tsx'), /<TomorrowGoal days=\{to\} prize=\{prize\}/);
});

test('round 5: a return to the app knows the days away at once, and a level chest card ends under its button', () => {
  const hook = read('src/components/retention/useRetention.tsx');
  assert.match(hook, /const lastOpenMem = new Map<string, number>\(\);/);
  assert.match(hook, /const last = id \? lastOpenMem\.get\(String\(id\)\) : undefined;/);
  const reveal = read('src/components/retention/RewardReveal.tsx');
  assert.match(reveal, /known && \(footer \? \(dropIn \? styles\.bottomLevel : styles\.bottomKnown\) : styles\.bottomButton\)/);
  assert.match(reveal, /styles\.floor/);
});

test('the full set never mounts its prize rows while the card is growing in, and it is always in before the lid', () => {
  const hook = read('src/components/retention/useRetention.tsx');
  const quiet = Number(/export const ENTER_QUIET_MS = (\d+);/.exec(hook)[1]);
  assert.ok(quiet >= 400, 'past the settle spring');
  assert.ok(quiet < L.lidDelay({ autoOpen: true, repeat: true }) - 200, 'well before the shortest full-set lid beat');
  // The answer waits for the entrance before the render that mounts the rows, and the auto chest skips the extra "opening" render.
  assert.match(hook, /if \(current\.auto\) await quietAfterEntrance\(\);\s*\n\s*if \(mounted\.current\) setView\(\{ \.\.\.current, opening: false, rewards: result\.rewards/);
  assert.match(hook, /if \(!current\.auto\) setView\(\{ \.\.\.current, opening: true \}\);/);
});

test('wave 5: thinner Battery Saver look, one big tomorrow picture, a promise button, one continuous chain', () => {
  const reveal = read('src/components/retention/RewardReveal.tsx');
  const flame = read('src/components/retention/StreakMoment.tsx');
  // Confetti only at full power, and the rays stand still on Battery Saver.
  for (const src of [reveal, flame]) {
    assert.match(src, /budget\.particleScale >= 1 && /);
    assert.doesNotMatch(src, /particleScale >= 0\.5/);
    assert.match(src, /spin=\{budget\.level === 'full'\}/);
  }
  // The rows' empty plates show from the glide, so the card is never an empty panel.
  assert.match(reveal, /slots\.value = withDelayAfter\(entered, pl\.pop \+ Math\.max\(0, pl\.hold - DURATION\.quick\) \+ SLOTS_AFTER_HINT_MS/);
  // A level chest's line fades in as the chest lands (never drawn over).
  assert.match(reveal, /subtitleStyle = useAnimatedStyle\(\(\) => \(\{ opacity: Math\.max\(0, Math\.min\(1, 1 - drop\.value/);
  // Tomorrow is one big picture row: no far ladder, prize art at 44 pt on the flame card.
  const art = read('src/components/retention/FlameArt.tsx');
  assert.doesNotMatch(art, /farRow\}><NextFlameGoal/);
  assert.match(flame, /<TomorrowGoal days=\{to\} prize=\{prize\} size=\{44\}/);
  // The tomorrow card's button is the promise, not a second "see you tomorrow".
  const tomorrow = read('src/components/retention/TomorrowCard.tsx');
  assert.doesNotMatch(tomorrow, /SEE YOU TOMORROW!/);
  assert.match(tomorrow, /I'LL BE BACK!/);
  // The next chain card overlaps the last prize landings (no still map between cards).
  const hook = read('src/components/retention/useRetention.tsx');
  const overlap = Number(/export const NEXT_OVERLAP_MS = (\d+);/.exec(hook)[1]);
  const min = Number(/export const NEXT_MIN_MS = (\d+);/.exec(hook)[1]);
  assert.ok(overlap >= 200 && min >= 300, 'the prizes lift off and fly first');
  // Freeze earn: a hit-stop beat, a kick and a frost ring.
  const freeze = read('src/components/retention/FreezeMoments.tsx');
  assert.match(freeze, /withDelay\(DURATION\.hitStop, withSpring\(1, SPRING\.land\)\)/);
  assert.match(freeze, /frostRing/);
});

test('the loops frame graph shows only in dev or a release-like perf capture flag store builds never set', () => {
  const perf = read('src/components/retention/LoopPerf.tsx');
  assert.match(perf, /export const LOOPS_PERF_CAPTURE = process\.env\.EXPO_PUBLIC_LOOPS_PERF === '1';/);
  assert.match(perf, /return LOOPS_PERF_CAPTURE \|\| \(__DEV__ && /);
  const hook = read('src/components/retention/useRetention.tsx');
  assert.match(hook, /\{LOOPS_PERF_CAPTURE && !visible && <LoopPerf style=\{loopPerfMapStyle\} \/>\}/);
  for (const f of ['eas.json', 'app.config.js']) {
    if (fs.existsSync(path.join(root, f))) assert.doesNotMatch(read(f), /EXPO_PUBLIC_LOOPS_PERF/);
  }
});

test('wave 5 round 2: the chain handoff is one render, the dim always comes back with the next card', () => {
  const hook = read('src/components/retention/useRetention.tsx');
  const start = hook.indexOf('const finishReveal = ');
  const end = hook.indexOf('const next = async () => {', start);
  const handoff = hook.slice(start, end);
  // The B path says everything in one render (the flight and which card is up) and returns: no timer that renders
  // again mid-flight or mid-entrance, and no balance read in the middle of the moment.
  const b = handoff.slice(handoff.indexOf("if (src === 'daily' && pre && !reducedMotion)"));
  assert.match(b, /setView\(pre\.step === 'flame' && flameRef\.current \? \{ k: 'flame', moment: flameRef\.current, slot: 'B' \} : \{ k: 'tomorrow', slot: 'B' \}\);\s*\n\s*setLegs\(legs\);\s*\n\s*setLegsAt\(t0\);/);
  assert.doesNotMatch(handoff, /setTimeout/);
  assert.doesNotMatch(handoff, /refreshPlayer/);
  assert.doesNotMatch(hook, /legsTimer/);
  assert.match(handoff, /playerReadDue\.current = true;/);
  assert.match(hook, /if \(!playerReadDue\.current \|\| \(view && view\.k !== 'sheet' && view\.k !== 'push'\)\) return;/);
  // The flight layer goes with the view (no extra render to take it down).
  assert.match(hook, /legs: view\?\.k === 'flying' \|\| slotB \? legs : null/);
  // The next card counts taps only once it has grown in.
  assert.match(hook, /onDone=\{\(\) => \{ if \(bIsIn\(\)\) afterTomorrowRef\.current\(\); \}\}/);
  // The dim: one write, from a JS mark set in the same render, never a shared value read back.
  assert.match(handoff, /nextAtRef\.current = nextAt;/);
  assert.match(hook, /dim\.value = dimForExit\(nextAtRef\.current\);/);
  assert.doesNotMatch(hook, /const nextAt = enteredB\.value;/);
  const now = 1_000_000;
  assert.deepEqual(plain(L.exitDimPlan(0, now, 200)), { lift: true, backAt: null, end: 0 });
  assert.deepEqual(plain(L.exitDimPlan(now + 700, now, 200)), { lift: true, backAt: now + 700, end: L.LOOP_DIM_LEVEL });
  // A booked card whose mark is near or past never leaves the map bright.
  assert.equal(L.exitDimPlan(now + 100, now, 200).end, L.LOOP_DIM_LEVEL);
  assert.equal(L.exitDimPlan(now - 500, now, 200).end, L.LOOP_DIM_LEVEL);
  assert.equal(L.LOOP_DIM_LEVEL, 0.55);
});

test('wave 5 round 2: HUD numbers step at most 3 times a flight and hold until the balance is read back', () => {
  const C = loadTs('src/services/retention/counterTicks.ts');
  assert.deepEqual([...C.counterStepIndexes(8)], [2, 5, 7]);
  assert.deepEqual([...C.counterStepIndexes(2)], [0, 1]);
  assert.deepEqual([...C.counterStepIndexes(1)], [0]);
  for (let n = 1; n <= 12; n++) {
    const s = C.counterStepIndexes(n);
    assert.ok(s.size <= C.COUNTER_STEPS && s.has(n - 1));
  }
  const cur = read('src/components/Topbar/Currency.tsx');
  assert.match(cur, /if \(expect\.current === null\) setDisplayCount\(prevCount\.current\);/);
  assert.match(cur, /if \(count === counted\) \{ prevCount\.current = count; setDisplayCount\(count\); return; \}/);
});

test('wave 5 round 2: the chest card tomorrow row is big, each fact is said once, plates never draw over chips', () => {
  const row = read('src/components/retention/FlameUpRow.tsx');
  assert.match(row, /<TomorrowGoal days=\{to\} prize=\{prize\} size=\{42\} reducedMotion=\{reducedMotion\} stacked/);
  assert.match(row, /pill: \{ backgroundColor: BRAND\.navy/);
  assert.doesNotMatch(row, /days in a row!/);
  // Flame up has a payoff on the number's squash (a ring and a second spark wave, budgeted).
  assert.match(row, /momentParticles\(6, budget, false\)/);
  const flame = read('src/components/retention/StreakMoment.tsx');
  assert.match(flame, /landRing/);
  assert.match(flame, /bloom\.value = W\(withDelay\(hit,/);
  assert.match(flame, /\{flameUpLine\(to\)\}/);
  assert.match(flame, /\{milestoneBadgeLine\(to\)\}/);
  assert.equal(L.flameUpLine(7), 'Days in a row!');
  assert.equal(L.flameUpLine(1), 'Your flame is lit!');
  assert.doesNotMatch(L.milestoneBadgeLine(7), /\d/);
  const reveal = read('src/components/retention/RewardReveal.tsx');
  const after = Number(/export const SLOTS_AFTER_HINT_MS = (\d+);/.exec(reveal)[1]);
  assert.ok(after >= 0.75 * motion.DURATION.quick, 'the chips are mostly gone before the plates show');
  assert.match(reveal, /hintOut\.value = withDelayAfter\(entered, pl\.pop \+ Math\.max\(0, pl\.hold - DURATION\.quick\), withTiming\(1, \{ duration: DURATION\.quick, easing: EASE\.out \}\)\)/);
  assert.match(reveal, /return small \* 50 \+ big \* 108 \+ 10;/);
  assert.match(reveal, /bottomLevel: \{ minHeight: 116 \}/);
  const tomorrow = read('src/components/retention/TomorrowCard.tsx');
  assert.match(tomorrow, /ghostDisc: \{ width: 76, height: 76, borderRadius: 38, backgroundColor: '#0d4f92'/);
  for (const line of [L.flameUpLine(5), L.milestoneBadgeLine(7)]) assert.ok(L.kidSafeCopy(line));
});
