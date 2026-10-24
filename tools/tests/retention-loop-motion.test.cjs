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
  const lid = L.CHECK.ring + L.FULL_SET.sheetAt + L.FULL_SET.chestAt + chest.burstAt;
  assert.ok(lid <= 1600, `lid pops ${lid} ms after the third check lands`);
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

test('the level chest rattles three times, each harder, then a hand, then it opens by itself at 2 s', () => {
  const r = L.LEVEL_CHEST.rattles;
  assert.deepEqual(plain(r.map(x => x.at)), [0, 380, 760]);
  assert.deepEqual(plain(r.map(x => x.deg)), [8, 13, 18]);
  assert.ok(L.LEVEL_CHEST.handAt > r[2].at && L.LEVEL_CHEST.autoOpenAt === 2000);
  assert.equal(L.LEVEL_CHEST.rowBeat, 180);
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
  assert.match(hook, /setView\(\{ k: 'flying' \}\)/);
  assert.match(hook, /setView\(\{ k: 'flame', moment: flameRef\.current \}\)/);
  assert.match(hook, /setView\(\{ k: 'tomorrow' \}\)/);
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
  assert.match(btn, /runOnJS\(handOff\)/);
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
