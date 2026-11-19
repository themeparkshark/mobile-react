'use strict';
/**
 * Fix round w3, hold-fix 2: the items checker 2 sent back.
 *   T040  blind mashing never wins a Whack ride round on the bonk meter (the Nov 3 safety tapper
 *         scored 0 of 13; after b21824b6 it won with 3 stars in 25 s). The meter still never goes back.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');

const W = loadTs('src/games/whack/waves.ts');
const T = loadTs('src/games/whack/timeline.ts');
const S = loadTs('src/games/whack/sim.ts');
const A = loadTs('src/games/whack/autoplayer.ts');
const P = loadTs('src/games/whack/proof.ts');

const ride = (seed, extra = {}) => T.buildBurst({ seed, burstIndex: 0, format: 'ride', difficulty: 2, theme: 'pirates', unlockLevel: 0, ...extra });

/** The device safety tapper (verify-2 tools/ride.py W): every hole in turn, gapMs apart, never aims. */
function seqMash(tl, gapMs, start) {
  const s = S.createSim(tl, undefined, true);
  let h = start % 9;
  let next = 300;
  let bonksSeen = 0;
  while (!s.ended && s.t < tl.lengthMs + 5) {
    if (s.t >= next) { S.simTap(s, h); h = (h + 1) % 9; next += gapMs; }
    if (s.frozen) { if (s.tapCount >= W.MAX_TAPS) break; S.simUnfreeze(s); continue; }
    S.simAdvance(s, 1);
    assert.ok(s.bonks >= bonksSeen, 'the meter never goes back');
    bonksSeen = s.bonks;
  }
  return { sim: s, result: S.simResult(s) };
}

/** The device tapper in bursts: 9 holes 50 ms apart, then `gap` ms. */
function burstMash(tl, gap, start) {
  const s = S.createSim(tl, undefined, true);
  let h = start % 9;
  let k = 0;
  let next = 300;
  while (!s.ended && s.t < tl.lengthMs + 5) {
    if (s.t >= next) { S.simTap(s, h); h = (h + 4) % 9; k++; next += k % 9 === 0 ? gap : 50; }
    if (s.frozen) { if (s.tapCount >= W.MAX_TAPS) break; S.simUnfreeze(s); continue; }
    S.simAdvance(s, 1);
  }
  return { sim: s, result: S.simResult(s) };
}

test('T040 hold-2: a blind 9-hole mash never wins the ride coin (adult and kid rules)', () => {
  for (const kid of [false, true]) {
    for (const gap of [50, 92, 150]) {
      let wins = 0;
      let bonks = 0;
      for (let i = 0; i < 30; i++) {
        const r = seqMash(ride(9000 + i * 7919, { kid }), gap, i).result;
        if (r.win) wins++;
        bonks += r.bonks;
      }
      assert.equal(wins, 0, `${kid ? 'kid' : 'adult'} mash every ${gap} ms won ${wins}/30`);
      assert.ok(bonks / 30 <= 1, `${kid ? 'kid' : 'adult'} mash every ${gap} ms got ${(bonks / 30).toFixed(1)} bonks`);
    }
    let rnd = 0;
    for (let i = 0; i < 30; i++) if (A.autoplayBurst(ride(9000 + i * 7919, { kid }), 'masher', i * 31 + 7).result.win) rnd++;
    assert.equal(rnd, 0, `random masher (12 taps a second) won ${rnd}/30`);
    // The device mash comes in bursts: 9 taps 50 ms apart, then a gap while idb's taps land (verify-2 ride.py).
    for (const gap of [300, 450, 600, 900]) {
      let w = 0;
      let b = 0;
      for (let i = 0; i < 30; i++) {
        const r = burstMash(ride(9000 + i * 7919, { kid }), gap, i).result;
        if (r.win) w++;
        b += r.bonks;
      }
      assert.equal(w, 0, `${kid ? 'kid' : 'adult'} burst mash (gap ${gap} ms) won ${w}/30`);
      assert.ok(b / 30 <= 1, `${kid ? 'kid' : 'adult'} burst mash (gap ${gap} ms) got ${(b / 30).toFixed(1)} bonks`);
    }
  }
});

test('T040 hold-2: aimed play keeps its round (stray taps, slow kid, every adult profile)', () => {
  const N = 40;
  const rate = (prof, kid) => {
    let w = 0;
    for (let i = 0; i < N; i++) if (A.autoplayBurst(ride(9000 + i * 7919, { kid }), prof, i * 31 + 7).result.win) w++;
    return w / N;
  };
  for (const prof of ['novice', 'median', 'expert', 'walking', 'glance', 'onbeat']) assert.ok(rate(prof, false) >= 0.95, prof);
  // An aimed player who also bumps 2 random holes a second still wins every round.
  assert.ok(rate({ ...A.PROFILES.median, bumpsPerSec: 1 }, false) >= 0.95, 'median plus 1 stray tap a second');
  assert.ok(rate({ ...A.PROFILES.median, bumpsPerSec: 2 }, false) >= 0.4, 'median plus 2 stray taps a second still wins some');
  // The slow picture-only kid (1 tap a second) never slips: still about 2 wins in 3 under kid rules.
  const kid = rate('kid', true);
  assert.ok(kid >= 0.55 && kid <= 0.85, `kid ${kid}`);
});

test('T040 hold-2: two quick misses slip the fins on the bonk meter; a slipped tap bonks nothing, a stop and an aimed tap bonks again', () => {
  const tl = ride(4242);
  const s = S.createSim(tl, undefined, true);
  const finn = tl.events.find((e) => e.kind === W.K_FINN && e.emergeAt > 2500);
  assert.ok(finn);
  // Keep the board live (an idle board freezes for a look-up), then two whiffs just before the Finn pops.
  while (s.t < finn.emergeAt - 150) { S.simAdvance(s, 1); if (s.frozen) S.simUnfreeze(s); }
  for (let k = 0; k < 2; k++) {
    const h = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((x) => x !== finn.hole && s.hPh[x] === S.P_EMPTY && s.hSplat[x] !== S.SPLAT_DOWN && s.t >= s.hLock[x]);
    S.simTap(s, h);
    S.simAdvance(s, 60);
  }
  assert.equal(s.whiffs, 2);
  S.simAdvanceTo(s, finn.emergeAt + 30);
  assert.equal(s.hPh[finn.hole], S.P_UP);
  const before = s.bonks;
  S.simTap(s, finn.hole);
  assert.equal(s.bonks, before, 'a tap right after two misses slips: no bonk');
  assert.equal(s.slips, 1);
  // Stop for the slip, then aim.
  S.simAdvanceTo(s, Math.max(s.slipUntil, s.m0 + W.RIDE_MASH_WINDOW_MS) + 1);
  if (s.hPh[finn.hole] === S.P_UP) {
    S.simTap(s, finn.hole);
    assert.equal(s.bonks, before + 1, 'an aimed tap after a stop bonks');
  }
  // The proof replays the same slips (the taps are logged).
  const run = burstMash(ride(77), 600, 0);
  const proof = P.buildProof(ride(77), { meter: 0, feverLeft: 0, streak: 0 }, run.sim.taps, run.result, { wallMs: run.result.elapsedMs ?? 25000, pos: run.sim.pos });
  const replay = P.replayProof(proof).result;
  assert.equal(replay.win, run.result.win);
  assert.equal(replay.bonks, run.result.bonks);
});

test('T040 hold-2: slips only exist on the bonk meter ride (queue, daily and party rules are unchanged)', () => {
  const q = T.buildBurst({ seed: 5, burstIndex: 0, format: 'queue', difficulty: 2, theme: 'park', unlockLevel: 9 });
  const s = S.createSim(q, undefined, true);
  assert.equal(s.bonkMeter, false);
  S.simAdvanceTo(s, 1500);
  for (let i = 0; i < 6; i++) { S.simTap(s, i); S.simAdvance(s, 50); }
  assert.equal(s.slipUntil, -1);
});

/* T053 hold-2: every loss line has its pip row, the Whack bonk meter (the most common loss) included. */
test('T053 hold-2: the Whack bonk-meter loss line carries have/need like Memory and trivia; every summary with a line has pips', () => {
  const RT = loadTs('src/gamekit/results/rideTry.ts');
  const tap = RT.rideTrySummary({ stars: 0, meta: { game: 'tap', rideBonks: 4, winBonks: 13, ridePercent: 30 } });
  assert.equal(tap.line, '4 of 13 bonks.');
  assert.deepEqual([tap.have, tap.need], [4, 13]);
  const kid = RT.rideTrySummary({ stars: 0, meta: { game: 'tap', rideBonks: 9, winBonks: 10 } });
  assert.deepEqual([kid.have, kid.need, kid.near], [9, 10, true]);
  const runs = [
    { meta: { game: 'tap', rideBonks: 0, winBonks: 13 } },
    { meta: { game: 'tap', rideBonks: 20, winBonks: 13 } },
    { meta: { game: 'tap', ridePercent: 62 } },
    { meta: { game: 'memory', pairs: 2, pairsTotal: 6, bestPairs: 4 } },
    { meta: { game: 'memory', pairs: 3, pairsTotal: 8 } },
    { meta: { game: 'trivia', correctCount: 1 } },
    { meta: { mode: 'task', correctCount: 0 } },
  ];
  for (const run of runs) {
    const s = RT.rideTrySummary(run);
    assert.ok(s.line, JSON.stringify(run));
    assert.ok(Number.isInteger(s.need) && s.need > 0, `pips need for ${JSON.stringify(run)}`);
    assert.ok(Number.isInteger(s.have) && s.have <= s.need, `pips have for ${JSON.stringify(run)}`);
    const nums = s.line.match(/\d+/g).map(Number);
    assert.equal(nums[0], s.have, 'the line and the pips say the same count');
  }
  // The card draws the row from the summary (RedeemRedeemableModal), so a Whack loss shows pips too.
  const modal = require('node:fs').readFileSync('src/components/RedeemRedeemableModal.tsx', 'utf8');
  assert.match(modal, /pips=\{rideTry\?\.need \? \{ have: rideTry\.have \?\? 0, need: rideTry\.need \} : null\}/);
});

/* T046 hold-2: a steady once-a-second tapper never presses a result button; the win card and the shared card lock too. */
test('T046 hold-2: the steady tapper (1 tap a second, any phase, 4 minutes) never presses TRY AGAIN; a player who stops presses first time', () => {
  const M = loadTs('src/components/rewards/mashGuard.ts');
  for (const gap of [600, 800, 1000, 1200]) {
    for (let phase = 0; phase < gap; phase += 50) {
      const taps = [];
      for (let t = phase; t < 240000; t += gap) taps.push(t);
      assert.equal(M.firstPressOf(taps), null, `a tapper every ${gap} ms (first tap at ${phase} ms) pressed a button`);
    }
  }
  // Under the old 600 ms lock the same tapper pressed within about 2 s (checker 2: 4 Tickets in 4 minutes).
  assert.notEqual(M.firstPressOf([300, 1300, 2300, 3300], 600, 600), null);
  // A player who reads the card and taps once presses it.
  assert.equal(M.firstPressOf([1400]), 1400);
  // A stray tap, a stop, then a deliberate tap.
  assert.equal(M.firstPressOf([300, 2000]), 2000);
  assert.equal(M.firstPressOf([300, 1500]), null, 'a second tap inside the quiet wait is still a mash');
});

test('T046 hold-2: the loss and try card, the win card and the shared results card all use the one lock, dimmed until it wakes', () => {
  const fs = require('node:fs');
  const read = (p) => fs.readFileSync(p, 'utf8');
  const hook = read('src/components/rewards/useResultInputLock.ts');
  assert.match(hook, /nextMashUnlock\(unlockAt\.current, now, quietMs\)/);
  assert.match(hook, /useAnimatedStyle\(\(\) => \(\{ opacity: glow\.value \}\)\)/, 'the dim runs on the UI thread');
  const status = read('src/components/rewards/ChallengeStatusCard.tsx');
  assert.match(status, /const \{ armed, lockedTap, dimStyle \} = useResultInputLock\(true, lockMs\);/);
  assert.match(status, /<Animated\.View style=\{\[styles\.buttons, dimStyle\]\}>/);
  const win = read('src/components/PostWinRewardsModal.tsx');
  assert.match(win, /useResultInputLock\(visible && caught\)/);
  assert.match(win, /\{caught && !armed && <View testID="post-win-input-lock" style=\{StyleSheet\.absoluteFill\}\s+onStartShouldSetResponder=\{\(\) => \{ lockedTap\(\); return true; \}\} \/>\}/);
  assert.match(win, /onBackdropPress=\{caught \? \(armed \? closeCard : lockedTap\) : undefined\}/);
  assert.match(win, /const pressPrimary = \(\) => \{\n    if \(!armedRef\.current\) return;/);
  assert.match(win, /const pressShelf = \(\) => \{\n    if \(!armedRef\.current\) return;/);
  assert.match(win, /styles\.footer, leaving && styles\.footerLeaving, dimStyle\]/);
  const shell = read('src/gamekit/GameShellV2.tsx');
  assert.match(shell, /const resultsLock = useResultInputLock\(showSharedCard\);/);
  assert.match(shell, /\{!resultsLock\.armed \? <View testID="results-input-lock" style=\{StyleSheet\.absoluteFill\}\n\s+onStartShouldSetResponder=\{\(\) => \{ resultsLock\.lockedTap\(\); return true; \}\} \/> : null\}\n\s+<\/Animated\.View>\n\s+<\/ResultsCard>/);
});

/* T232 hold-2: the paid loss at the switch says the new game, and so does the Setting Up card after TRY AGAIN. */
test('T232 hold-2: a paid loss whose TRY AGAIN deals the other game says "New game"; the Setting Up card keeps the name', () => {
  const lost = loadTs('src/components/rewards/lostTryCard.ts');
  const paid = { usedRescuePass: false, rescueRetryAvailable: false, firstCoinTicketReturned: false, lostTicketCost: 1, sameGame: true };
  assert.equal(lost.lostTryCopy(paid).message, '1 Ticket used.');
  assert.equal(lost.lostTryCopy({ ...paid, nextGame: 'Whack-a-Shark' }).message, '1 Ticket used. New game: Whack-a-Shark!');
  assert.equal(lost.lostTryCopy({ ...paid, retryOffered: true, nextGame: 'Whack-a-Shark' }).message, '1 Ticket used. New game: Whack-a-Shark!');
  const fs = require('node:fs');
  const modal = fs.readFileSync('src/components/RedeemRedeemableModal.tsx', 'utf8');
  // The name is kept before TRY AGAIN clears the lost attempt, so the Setting Up card says it.
  const press = modal.indexOf('retryNextGameRef.current = retryGameNameFor(attemptRef.current);');
  const clear = modal.indexOf('attemptRef.current = null;', press);
  assert.ok(press > 0 && clear > press, 'kept before the attempt is cleared');
  assert.match(modal, /const retryGameName = flowState === 'retrying' \? retryNextGameRef\.current : retryGameNameFor\(attemptRef\.current\);/);
  assert.match(modal, /message=\{retryingLine\(retryGameName\)\}/);
});

/* T158 hold-2: the Just once sticker reads whole on the 76 pt Profile badge (it clipped to "JUST ON..."). */
test('T158 hold-2: a sticker sizes to its own words in a wide clear box, so a narrow picture never clips it', () => {
  const fs = require('node:fs');
  const ui = fs.readFileSync('src/components/money/moneyUi.tsx', 'utf8');
  // The visible sticker is not the absolute view: it sits inside a STICKER_ROOM-wide clear box.
  assert.match(ui, /export const STICKER_ROOM = 200;/);
  assert.match(ui, /<View style=\{\[s\.stickerRoom, align === 'center' \? s\.stickerRoomCenter : s\.stickerRoomEnd, style\]\} pointerEvents="none">\n\s+<View style=\{\[s\.sticker, tone === 'gold' && s\.stickerGold\]\}>/);
  assert.match(ui, /stickerRoom: \{ position: 'absolute', width: STICKER_ROOM \}/);
  assert.match(ui, /stickerRoomCenter: \{ left: '50%', marginLeft: -STICKER_ROOM \/ 2, alignItems: 'center' \}/);
  assert.doesNotMatch(ui, /sticker: \{ position: 'absolute'/, 'the sticker itself is never the absolute view its parent squeezes');
  // "JUST ONCE" at 14 pt in the display face is about 100 pt with its padding and border: it fits the room, not a 76 pt badge.
  const W = loadTs('src/components/money/StarterSticker.tsx', {
    react: { useContext: () => ({}) }, 'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
    '../../context/AuthProvider': { AuthContext: {} }, '../../services/money/supplies': { useSupplies: () => ({}) },
    '../../services/purchases': { storeAvailable: () => true }, './moneyUi': { Sticker: 'Sticker' },
  });
  assert.ok(W.STARTER_STICKER_TEXT.length * 10 + 20 < 200);
  const profile = fs.readFileSync('src/screens/ProfileScreen.tsx', 'utf8');
  assert.match(profile, /sticker: <StarterSticker align="center" style=\{\{ top: -10 \}\} \/>/, 'centered over the Profile badge, clear of the next badge');
});

/* T043 hold-2: the bank reads as its writers wrote it; the display-edge word swap garbled it. */
test('T043 hold-2: bank lines the swap garbled now read as written (row 198 and its siblings)', () => {
  const L = loadTs('src/games/trivia-duel/engine/labels.ts');
  const C = loadTs('src/games/trivia-duel/engine/content.ts');
  // Lines from the published scratch bank (verify-2 v2-81 and the full-bank scan in hold-2/gen-before.txt).
  const bank = [
    'Which Disneyland Railroad engine is named after a Disney animator instead of a railroad legend?',
    'The Walt Disney World Railroad, dating back to 1971, cut through the site.',
    'Stardust Racers holds which record at Universal Orlando Resort?',
    'The train runs to King’s Cross Station in the London area of Universal Studios Florida.',
    'Joe Rohde, portfolio creative director at Walt Disney Imagineering, described the breakout story in 2016.',
    'In Florida the tree is a Disneyodendron eximus, or out-of-the-ordinary Disney tree.',
    'Guardians of the Galaxy - Mission: BREAKOUT! opened at Disney California Adventure in which year?',
    'Main Street, U.S.A. and Frontierland',
    'Roy O. Disney',
    'Bowser Jr. swiped the Golden Mushroom.',
  ];
  for (const line of bank) assert.equal(L.genericize(line), line);
  const before = /park company|Walt World|the studio (?:Studios|Orlando)|park designering|park companyodendron|Roy O\. The|BREAKOUT! Opened|U\.S\.A\. And|Jr\. Swiped/;
  for (const line of bank) assert.doesNotMatch(L.genericize(line), before);
  // A dealt bank question (the coin's Beat the Buzzer round) goes through the same display edge and keeps its words.
  const q = C.withGenericLabels({ id: 'x', prompt: bank[0], choices: ['the Ward Kimball', 'Ernest S. Marsh'], correctIndex: 0, fact: bank[1] });
  assert.equal(q.prompt, bank[0]);
  assert.equal(q.fact, bank[1]);
  assert.deepEqual([...q.choices], ['The Ward Kimball', 'Ernest S. Marsh'], 'a choice still starts with a capital');
});
