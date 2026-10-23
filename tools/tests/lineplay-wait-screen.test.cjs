'use strict';
/**
 * L2 wait screen (IN_LINE_BUILD.md): the ride's own coin center stage, filling
 * one notch per Part, an honest posted-vs-real read, sharks in line, Parts this
 * wait, and the Marathon and Night marks. Offline-safe and battery-light.
 */
const assert = require('node:assert/strict'), test = require('node:test'), fs = require('node:fs');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const model = () => loadTs('src/services/lineplay/waitScreen.ts');
const read = file => fs.readFileSync(file, 'utf8');
const DIR = 'src/screens/LinePlay/components/waitscreen/';
const FILES = ['WaitCoinHero.tsx', 'WaitCoinStage.tsx', 'CoinFillRing.tsx', 'WaitStampBadge.tsx', 'useWaitScreenCoin.ts',
  'waitScreenPreview.ts'].map(name => DIR + name).concat(['src/services/lineplay/waitScreen.ts']);

test('the ring has one notch per Part and lights as Parts land', () => {
  const m = model();
  const p = m.waitCoinProgress({ level: 2, maxLevel: 10, partsBanked: 3, partsToNext: 4, energyToNext: 20, playerEnergy: 50,
    nextTierName: 'Gold' });
  assert.equal(p.notches, 4); assert.equal(p.lit, 3); assert.equal(p.fill, 0.75);
  assert.equal(p.ready, false); assert.equal(p.label, '3 of 4 Parts', 'one Parts idea: no tier name on the chip');
  const long = m.waitCoinProgress({ level: 9, maxLevel: 10, partsBanked: 10, partsToNext: 40, energyToNext: 260, playerEnergy: 0 });
  assert.equal(long.notches, 0, 'a 40 Part step draws a smooth arc'); assert.equal(long.fill, 0.25);
});

test('level up is offered only when Parts AND Energy cover it; never auto-spent', () => {
  const m = model();
  const base = { level: 3, maxLevel: 10, partsBanked: 6, partsToNext: 6, energyToNext: 30, nextTierName: 'Prismatic' };
  assert.equal(m.waitCoinProgress({ ...base, playerEnergy: 30 }).ready, true);
  const short = m.waitCoinProgress({ ...base, playerEnergy: 10 });
  assert.equal(short.ready, false); assert.equal(short.partsReady, true); assert.equal(short.energyShort, 20);
  assert.equal(short.label, 'Parts ready · 20 more Energy');
  assert.equal(m.waitCoinProgress({ ...base, playerEnergy: null }).ready, false, 'unknown Energy never offers a tap');
  const maxed = m.waitCoinProgress({ ...base, level: 10, playerEnergy: 999 });
  assert.equal(maxed.maxed, true); assert.equal(maxed.ready, false); assert.equal(maxed.fill, 1);
  // The stage calls the existing server level-up (Parts + Energy spent there), nothing else.
  const hook = read(DIR + 'useWaitScreenCoin.ts');
  assert.match(hook, /levelUpRideCoin\(coin\.id, coin\.level\)/);
  assert.doesNotMatch(read(DIR + 'WaitCoinStage.tsx'), /levelUpRideCoin/);
});

test('posted vs real: a tracking number only when real waits back it, gone once passed', () => {
  const m = model();
  const est = m.waitEstimate({ postedMinutes: 60, waitSource: 'posted', ratio: 0.7, elapsedSeconds: 20 * 60 });
  assert.equal(est.title, 'SIGN SAYS 60'); assert.equal(est.tracking, 42); assert.equal(est.detail, "You're tracking ~42");
  assert.equal(est.kidValue, '1h 00m', 'one wait number for kids: the sign they can see, never a guess stated as fact');
  assert.equal(m.waitEstimate({ postedMinutes: 90, waitSource: 'posted', ratio: null, elapsedSeconds: 0 }).kidValue, '1h 30m',
    'the sign is written like IN LINE (1h 30m), one unit style');
  assert.match(est.accessibilityLabel, /about 42 minutes/, 'the guess stays in the spoken label, marked as about');
  const none = m.waitEstimate({ postedMinutes: 60, waitSource: 'posted', ratio: null, elapsedSeconds: 600 });
  assert.equal(none.tracking, null); assert.equal(none.detail, 'Posted wait'); assert.equal(none.kidValue, '1h 00m', 'no guess: the sign');
  const past = m.waitEstimate({ postedMinutes: 60, waitSource: 'posted', ratio: 0.7, elapsedSeconds: 45 * 60 });
  assert.equal(past.tracking, null, 'never a countdown that lies');
  const noSign = m.waitEstimate({ postedMinutes: 35, waitSource: 'estimate', ratio: 0.7, elapsedSeconds: 0 });
  assert.equal(noSign.posted, null); assert.equal(noSign.title, 'NO SIGN TIME'); assert.equal(noSign.kidValue, null);
});

test('sharks in line, time in line and Parts this wait', () => {
  const m = model();
  assert.equal(m.sharksInLine(null), null); assert.equal(m.sharksInLine(0), null);
  assert.equal(m.sharksInLine(1).label, 'FIRST SHARK HERE');
  assert.deepEqual(plain(m.sharksInLine(14)), { value: '14', label: 'SHARKS HERE', accessibilityLabel: '14 sharks in this line now.' });
  assert.equal(m.sharksInLine(4000).value, '999+');
  assert.equal(m.inLineLabel(23 * 60 + 40), '23m'); assert.equal(m.inLineLabel(65 * 60), '1h 05m');
  assert.equal(m.partsThisWait(3, 1), 4); assert.equal(m.partsThisWait(null), 0);
});

test('Marathon after 60 minutes and Night after 8 PM are marks, not items', () => {
  const m = model();
  assert.deepEqual(plain(m.waitStamps(59 * 60, 14)), []);
  assert.deepEqual(plain(m.waitStamps(60 * 60, 14).map(s => s.kind)), ['marathon']);
  assert.deepEqual(plain(m.waitStamps(10, 21).map(s => s.kind)), ['night']);
  assert.deepEqual(plain(m.waitStamps(3700, 2).map(s => s.kind)), ['marathon', 'night']);
  assert.deepEqual(plain(m.waitStamps(10, 4)), []);
});

test('offline: the coin balance is the last server count plus Parts credited since', () => {
  const m = model();
  assert.equal(m.livePartsBanked({ serverBanked: 9, cachedBanked: 2, creditedNow: 5, creditedAtCache: 1 }), 9);
  assert.equal(m.livePartsBanked({ serverBanked: null, cachedBanked: 2, creditedNow: 5, creditedAtCache: 1 }), 6);
  assert.equal(m.livePartsBanked({ serverBanked: null, cachedBanked: null, creditedNow: 0, creditedAtCache: 3 }), 0);
  const hook = read(DIR + 'useWaitScreenCoin.ts');
  assert.match(hook, /AsyncStorage\.getItem/); assert.match(hook, /lineplay_wait_coin_v1:/);
});

test('battery: Skia ring loops run only while active and never under Reduce Motion', () => {
  const ring = read(DIR + 'CoinFillRing.tsx');
  assert.match(ring, /const loops = active && !reducedMotion/);
  assert.match(ring, /cancelAnimation\(breathe\); cancelAnimation\(spin\)/);
  const hero = read(DIR + 'WaitCoinHero.tsx');
  assert.match(hero, /AppState\.addEventListener/);
  assert.match(hero, /const active = appActive && !covered/);
});

test('level-up moment: queueHaptic, sfxLimiter, the v2 burst, and the Crowning only through the PresentationQueue', () => {
  const stage = read(DIR + 'WaitCoinStage.tsx');
  assert.match(stage, /queueHaptic\('success'\)/);
  assert.match(stage, /playLimited\('coin-level-up'/);
  assert.match(stage, /<LevelUpBurst /);
  assert.match(stage, /usePresentationSlot\(crowningId, 'crowning', 'coin_shelf'\)/);
  assert.match(stage, /visible=\{crowning\.visible\}/);
  assert.doesNotMatch(stage, /presentationQueue\.enqueue\(\{[^}]*reward_sheet/, 'in-line level-ups never take the queue');
});

test('the wait screen body is its own component the screen mounts in the WaitCard slot', () => {
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(screen, /hero=\{snapshot\.state !== 'complete' \? <WaitCoinHero/);
  assert.match(read('src/screens/LinePlay/components/WaitCard.tsx'), /\{compact && hero\}/);
  const session = read('src/services/lineplay/LinePlaySession.ts');
  assert.match(session, /if \(result\.wait_screen !== undefined\) this\.waitScreen = result\.wait_screen;/);
});

test('copy: no em dashes and no emoji in the wait screen files; preview is dev-only', () => {
  for (const file of FILES) {
    const text = read(file);
    assert.doesNotMatch(text, /—/, `${file} has an em dash`);
    assert.doesNotMatch(text, /[\u{1F300}-\u{1FAFF}]/u, `${file} has an emoji`);
  }
  assert.match(read(DIR + 'waitScreenPreview.ts'), /__DEV__ && process\.env\.EXPO_PUBLIC_LINEPLAY_WAIT_PREVIEW === '1'/);
});

test('no server rewards: the coin space collapses into one stat strip, no empty hole', () => {
  const m = model();
  assert.equal(m.waitHeroLayout(true), 'coin');
  assert.equal(m.waitHeroLayout(false), 'strip');
  const hero = read(DIR + 'WaitCoinHero.tsx');
  const strip = hero.slice(hero.indexOf("if (waitHeroLayout(rewardsOn) === 'strip')"), hero.indexOf('  return (\n    <View style={styles.row}>'));
  assert.ok(strip.length > 0, 'the strip branch returns before the coin row');
  assert.match(strip, /testID="wait-hero-strip"/);
  assert.doesNotMatch(strip, /WaitCoinStage|coinSize|statSpacer|PARTS THIS WAIT/, 'no coin, no placeholder, no Parts stat');
  assert.doesNotMatch(hero, /<View style=\{\{ width: coinSize \}\} \/>/, 'the old coin-sized placeholder is gone');
  assert.match(strip, /\{signStat\}/); assert.match(strip, /\{inLineStat\}/);
  // Fewer labels for kids: one short word under each number, no second line of fine print.
  assert.doesNotMatch(hero, /SIGN SAYS \(MIN\)|tracking|PARTS THIS WAIT/);
  // Round 4: the sign's number sits under the ride car, the kid's own time under the stopwatch.
  // Never two clocks, never "MIN" (which reads as "minimum").
  assert.match(hero, /label="SIGN SAYS"\n\s+accessibilityLabel=\{estimate\.accessibilityLabel\} icon="ride"/);
  assert.match(hero, /label="IN LINE"\n\s+accessibilityLabel=\{`In line \$\{inLineLabel\(elapsedSeconds\)\}\.`\} icon="timer"/);
  assert.doesNotMatch(hero, /MIN WAIT|icon="queue"/);
  // Round 3: one Parts idea. The ring chip says "2 of 4 Parts"; no second "+4 PARTS" number beside it,
  // and no level number or Marathon/Night chip on the coin.
  assert.doesNotMatch(hero, /label="PARTS"|partsThisWait|waitStamps/);
  const stage = read(DIR + 'WaitCoinStage.tsx');
  assert.doesNotMatch(stage, /WaitStampBadge|levelPipText/);
  const card = read('src/screens/LinePlay/components/WaitCard.tsx');
  assert.match(card, /waitStamps\(elapsedSeconds/, 'the marks moved into Details');
  assert.match(card, /const \[expanded, setExpanded\] = useState\(false\)/, 'fine print is hidden until Details is tapped');
  assert.match(card, /\{!hero && <Text style=\{styles\.waitSourceHint\}>/, 'no second copy of IN LINE and the wait under the hero');
});

test('one wait source of truth: "no sign time" never shows next to a SIGN SAYS number', () => {
  const m = model();
  for (const waitSource of ['posted', 'last_known', 'estimate']) {
    for (const postedMinutes of [null, 0, 35, 60]) {
      for (const ratio of [null, 0.7]) {
        const est = m.waitEstimate({ postedMinutes, waitSource, ratio, elapsedSeconds: 600 });
        const hint = m.waitSourceHint({ postedMinutes, waitSource });
        const noSign = /no sign time/i.test(hint);
        assert.equal(noSign, est.kidValue == null, `${waitSource} ${postedMinutes} ${ratio}: ${hint} / ${est.kidValue}`);
        if (est.kidValue != null) assert.equal(est.kidValue, m.inLineLabel(Math.round(postedMinutes) * 60), 'SIGN SAYS is the sign');
        assert.doesNotMatch(hint, /No posted wait was found/);
      }
    }
  }
  assert.equal(m.waitSourceHint({ postedMinutes: 60, waitSource: 'last_known' }), 'That is an older time from the ride sign.');
  // The card and its hero read the same sign time (the dev preview included).
  const card = read('src/screens/LinePlay/components/WaitCard.tsx');
  assert.match(card, /waitSourceHint\(\{ postedMinutes: postedWaitMinutes, waitSource \}\)/);
  assert.doesNotMatch(card, /No posted wait was found/);
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.equal((screen.match(/waitSource=\{shownWait\(snapshot\)\.waitSource\}/g) ?? []).length, 2);
  assert.equal((screen.match(/=\{shownWait\(snapshot\)\.plannedWaitMinutes\}/g) ?? []).length, 2);
  assert.doesNotMatch(read(DIR + 'WaitCoinHero.tsx'), /waitSource: 'posted'/, 'the hero preview never invents its own sign time');
  // Same for "earns Parts": the card never says "No Parts at this ride" beside a filling Parts ring.
  assert.match(screen, /rewardTrackingAvailable=\{shownRewards\(snapshot, ride\)\.tracking\}/);
  assert.match(screen, /lineRewardsReady=\{shownRewards\(snapshot, ride\)\.ready\}/);
  assert.match(screen, /rewardsOn=\{shownRewards\(snapshot, ride\)\.tracking && !shownRewards\(snapshot, ride\)\.unavailable\}/);
  assert.doesNotMatch(read(DIR + 'WaitCoinHero.tsx'), /rewardsOn: true/);
});

test('Details under the coin hero: two short lines at most, one Parts idea, the cap only once reached', () => {
  const card = loadTs('src/screens/LinePlay/components/WaitCard.tsx', {
    react: {}, 'react/jsx-runtime': { jsx() {}, jsxs() {}, Fragment: 'Fragment' }, 'react-native': { StyleSheet: { create: x => x } }, 'expo-linear-gradient': {}, 'react-native-svg': {},
    '../../../design-system': { colors: { textPrimary: '#fff' }, spacing: { sm: 8, xs: 4, md: 12 }, borderRadius: { xxl: 24 }, shadows: { lg: {} } },
    '../../../context/SoundEffectProvider': {}, '../../../helpers/hapticPatterns': {}, '../../../ui': {},
    '../../../services/lineplay/partCountdown': {}, '../../../services/lineplay/bonusRounds': {},
    '../../../services/lineplay/waitScreen': model(), './waitscreen/WaitStampBadge': {},
  });
  const base = { signLine: 'That is the ride sign’s time when you got in line.', sublineInHeadline: true,
    subline: 'until your next Ride Part', rewardTrackingAvailable: true, atCap: false, intervalSeconds: 600 };
  assert.deepEqual(plain(card.heroDetailLines(base)), [base.signLine, '1 Ride Part every 10 min near the ride.']);
  // The status line could not hold its subline (checking, paused, at the cap): Details shows it instead of a second Parts idea.
  const capped = card.heroDetailLines({ ...base, sublineInHeadline: false, atCap: true, subline: 'You got the most Parts for one wait. Great job!' });
  assert.deepEqual(plain(capped), [base.signLine, 'You got the most Parts for one wait. Great job!']);
  for (const lines of [card.heroDetailLines(base), capped]) {
    assert.ok(lines.length <= 2, 'two short lines at most');
    for (const line of lines) {
      assert.doesNotMatch(line, /per wait|up to \d|Time near the ride/, 'no per-wait cap ahead of time, no 0:00 clock');
      assert.ok(line.split(/\s+/).length <= 12, `short line: ${line}`);
    }
  }
  assert.equal(card.ticketHint(true, 0, 600), 'Stay near the ride 10:00 more for a ticket.');
  assert.equal(card.ticketHint(true, 700, 600), 'You get a ticket when this wait ends.');
  const src = read('src/screens/LinePlay/components/WaitCard.tsx');
  assert.match(src, /\{expanded && hero && <HeroDetails/);
  assert.match(src, /entranceWaitMinutes !== signMinutes\(\{ postedMinutes: postedWaitMinutes, waitSource \}\)/,
    'the sign number already on the card is never repeated in Details');
  assert.match(src, /\{expanded && !hero && <>/);
});

test('the dev preview runs one clock for the card and its hero', () => {
  const env = { EXPO_PUBLIC_LINEPLAY_WAIT_PREVIEW: '1' };
  const pv = loadTs(DIR + 'waitScreenPreview.ts', { react: { useEffect() {}, useState: v => [v, () => {}] } },
    { __DEV__: true, process: { env } });
  assert.equal(pv.previewElapsedSeconds(0), 20 * 60);
  assert.equal(pv.previewElapsedSeconds(65), (20 + 6 * 12) * 60 + 5, '1h 32m 05s after 65 s');
  assert.equal(pv.previewElapsedSeconds(4000), 92 * 60 + 40, 'stops growing at 1h 32m, never 33h');
  // A saved preview session can be hours old: the clock runs from this app run, not the session.
  const now = Date.now() + 65_000;
  const c = pv.shownClock({ elapsedSeconds: 9 * 3600, verifiedEligibleSeconds: 0, verifiedPresenceAt: null, creditedParts: 0 }, now);
  assert.equal(c.creditedParts, 4, 'the card says "next Part", never "first Part", beside a full preview coin');
  assert.ok(c.elapsedSeconds >= 92 * 60 && c.elapsedSeconds < 93 * 60, `about 1h 32m, got ${c.elapsedSeconds}`);
  assert.equal(c.verifiedEligibleSeconds, c.elapsedSeconds, 'never "Time near the ride: 0:00" beside 1h 32m in line');
  assert.equal(c.verifiedPresenceAt, now, 'checked just now, so no "Checking you are in line" in captures');
  env.EXPO_PUBLIC_LINEPLAY_WAIT_PREVIEW = '0';
  const live = pv.shownClock({ elapsedSeconds: 65, verifiedEligibleSeconds: 30, verifiedPresenceAt: 5, creditedParts: 2 }, 1000);
  assert.deepEqual(plain(live), { elapsedSeconds: 65, verifiedEligibleSeconds: 30, verifiedPresenceAt: 5, creditedParts: 2 },
    'live sessions are untouched');
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.equal((screen.match(/elapsedSeconds=\{shownClock\(snapshot\)\.elapsedSeconds\}/g) ?? []).length, 2, 'card and hero share one clock');
  assert.match(screen, /verifiedEligibleSeconds=\{shownClock\(snapshot\)\.verifiedEligibleSeconds\}/);
  assert.match(screen, /verifiedPresenceAt=\{shownClock\(snapshot\)\.verifiedPresenceAt\}/);
  assert.equal((screen.match(/creditedParts=\{shownClock\(snapshot\)\.creditedParts\}/g) ?? []).length, 2, 'and one Parts count');
  assert.doesNotMatch(read(DIR + 'WaitCoinHero.tsx'), /elapsedSeconds: \(20|creditedParts: 1 \+/, 'the hero never runs its own clock');
});
