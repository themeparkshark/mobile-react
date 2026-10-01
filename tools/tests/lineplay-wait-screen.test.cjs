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
  assert.equal(p.ready, false); assert.equal(p.label, '3 of 4 Parts to Gold');
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
  const none = m.waitEstimate({ postedMinutes: 60, waitSource: 'posted', ratio: null, elapsedSeconds: 600 });
  assert.equal(none.tracking, null); assert.equal(none.detail, 'Posted wait');
  const past = m.waitEstimate({ postedMinutes: 60, waitSource: 'posted', ratio: 0.7, elapsedSeconds: 45 * 60 });
  assert.equal(past.tracking, null, 'never a countdown that lies');
  const noSign = m.waitEstimate({ postedMinutes: 35, waitSource: 'estimate', ratio: 0.7, elapsedSeconds: 0 });
  assert.equal(noSign.posted, null); assert.equal(noSign.title, 'NO SIGN TIME');
});

test('sharks in line, time in line and Parts this wait', () => {
  const m = model();
  assert.equal(m.sharksInLine(null), null); assert.equal(m.sharksInLine(0), null);
  assert.equal(m.sharksInLine(1).label, 'FIRST SHARK HERE');
  assert.deepEqual(plain(m.sharksInLine(14)), { value: '14', label: 'SHARKS IN LINE', accessibilityLabel: '14 sharks in this line now.' });
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
