'use strict';
/**
 * Attention rules on the map (core loop blueprint 4.3). Base step: rule 10,
 * "one door for every sheet": useNativeModalLayer holds a sheet's layer until
 * UIKit reports it gone, so the challenge card can never present into a
 * half-dismissed sheet (the PLAY RIDE freeze, lc-dustin 85 to 91). Also the
 * X-Core-Loop: 1 request header the server's old-bundle guard keys on.
 * The guide-map lane extends this file with the map queue rules.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');

/** A tiny hook renderer: enough React for these hooks, effects run after each render, one state per mount. */
function harness() {
  let slots = [];
  let index = 0, dirty = false, nested = false, pending = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    createContext: value => ({ value }),
    useContext: () => nested,
    useState(init) {
      const own = slots, i = index++;
      if (!own[i]) own[i] = { value: typeof init === 'function' ? init() : init };
      return [own[i].value, update => {
        const value = typeof update === 'function' ? update(own[i].value) : update;
        if (!Object.is(value, own[i].value)) { own[i].value = value; dirty = true; }
      }];
    },
    useRef(init) { const i = index++; if (!slots[i]) slots[i] = { current: init }; return slots[i]; },
    useCallback(fn, deps) { const i = index++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) {
      const own = slots, i = index++;
      const prev = own[i];
      if (prev && deps && same(prev.deps, deps)) return;
      own[i] = { deps, effect: true, cleanup: prev?.cleanup };
      pending.push(() => { prev?.cleanup?.(); own[i].cleanup = fn(); });
    },
    useSyncExternalStore(subscribe, get) {
      const i = index++;
      if (!slots[i]) slots[i] = { unsubscribe: subscribe(() => { dirty = true; }) };
      return get();
    },
  };
  const timers = [];
  const globals = {
    setTimeout: (fn, ms) => { const t = { fn, ms, live: true }; timers.push(t); return t; },
    clearTimeout: t => { if (t) t.live = false; },
  };
  const M = loadTs('src/ui/modalLayers.ts', { react }, globals);
  function mount(hook) {
    const own = [];
    let out;
    const render = () => {
      for (let guard = 0; guard < 20; guard += 1) {
        slots = own; dirty = false; index = 0; pending = [];
        out = hook();
        const run = pending; pending = [];
        run.forEach(effect => effect());
        if (!dirty) return out;
      }
      throw new Error('render loop');
    };
    render();
    return {
      get value() { return out; },
      render,
      unmount() { own.forEach(slot => { if (slot?.effect) slot.cleanup?.(); }); },
    };
  }
  return {
    M, mount,
    setNested(value) { nested = value; },
    flushTimers() { timers.splice(0).forEach(t => { if (t.live) t.fn(); }); },
  };
}

test('a waiting sheet presents only once it is the front layer', () => {
  const h = harness();
  h.M.modalLayers.reset();
  const other = h.M.modalLayers.add();
  let wanted = true;
  const card = h.mount(() => h.M.useNativeModalLayer(wanted, 'wait'));
  assert.equal(card.value.present, false, 'never a second sibling modal');
  assert.equal(h.M.modalLayers.count(), 2);
  h.M.modalLayers.remove(other);
  card.render();
  assert.equal(card.value.present, true);
  wanted = false;
  card.render();
  assert.equal(card.value.present, false);
  assert.equal(h.M.modalLayers.count(), 1, 'held until UIKit says it is gone');
  card.value.onDismissed();
  card.render();
  assert.equal(h.M.modalLayers.count(), 0);
});

test('PLAY RIDE after a swipe-closed Ride Control sheet opens the challenge card, 20 out of 20', () => {
  const h = harness();
  h.M.modalLayers.reset();
  let sheetWanted = false, cardWanted = false;
  const sheet = h.mount(() => h.M.useNativeModalLayer(sheetWanted, 'show'));
  const card = h.mount(() => h.M.useNativeModalLayer(cardWanted, 'wait'));
  const both = () => { sheet.render(); card.render(); };
  for (let run = 0; run < 20; run += 1) {
    sheetWanted = true; both();
    assert.equal(sheet.value.present, true, `run ${run}: the Ride Control sheet opens`);
    // Swipe closed: React hides it at once while UIKit is still dismissing it.
    sheetWanted = false; both();
    // PLAY RIDE, tapped 4 times while the sheet slides away.
    for (let tap = 0; tap < 4; tap += 1) { cardWanted = true; both(); }
    assert.equal(card.value.present, false, `run ${run}: the card never presents into the half-dismissed sheet`);
    sheet.value.onDismissed(); both();     // UIKit: the sheet is gone
    assert.equal(card.value.present, true, `run ${run}: the challenge card opens`);
    cardWanted = false; both();
    card.value.onDismissed(); both();
    assert.equal(h.M.modalLayers.count(), 0, `run ${run}: nothing left holding the screen`);
  }
});

test('the swipe-closed sheet itself holds its layer until onDismiss, then frees it', () => {
  const h = harness();
  h.M.modalLayers.reset();
  let wanted = true;
  const sheet = h.mount(() => h.M.useNativeModalLayer(wanted, 'show'));
  assert.equal(sheet.value.present, true, 'a sheet the player opened shows at once');
  wanted = false;
  sheet.render();
  assert.equal(h.M.modalLayers.count(), 1, 'still dismissing natively');
  const waiting = h.M.modalLayers.add();
  assert.equal(h.M.modalLayers.isFront(waiting), false, 'the next modal cannot present into it');
  sheet.value.onDismissed();
  sheet.render();
  assert.equal(h.M.modalLayers.isFront(waiting), true);
  h.M.modalLayers.remove(waiting);
});

test('a sheet that never presented frees its layer at once; a silent native sheet frees it after the fallback', () => {
  const h = harness();
  h.M.modalLayers.reset();
  const blocker = h.M.modalLayers.add();
  let wanted = true;
  const never = h.mount(() => h.M.useNativeModalLayer(wanted, 'wait'));
  assert.equal(never.value.present, false);
  wanted = false;
  never.render();
  assert.equal(h.M.modalLayers.count(), 1, 'only the blocker remains');
  h.M.modalLayers.remove(blocker);

  let open = true;
  const silent = h.mount(() => h.M.useNativeModalLayer(open, 'show'));
  open = false;
  silent.render();
  assert.equal(h.M.modalLayers.count(), 1);
  h.flushTimers();
  silent.render();
  assert.equal(h.M.modalLayers.count(), 0, `freed after ${h.M.NATIVE_DISMISS_FALLBACK_MS} ms with no onDismiss`);
});

test('a native dismiss before React catches up frees the layer the moment React hides it', () => {
  const h = harness();
  h.M.modalLayers.reset();
  let wanted = true;
  const sheet = h.mount(() => h.M.useNativeModalLayer(wanted, 'show'));
  sheet.value.onDismissed();
  sheet.render();
  assert.equal(h.M.modalLayers.count(), 1, 'still wanted: the layer stays');
  wanted = false;
  sheet.render();
  assert.equal(h.M.modalLayers.count(), 0, 'UIKit already said it is gone');
});

test('unmounting never leaves a layer behind; nested layers never register', () => {
  const h = harness();
  h.M.modalLayers.reset();
  const sheet = h.mount(() => h.M.useNativeModalLayer(true, 'wait'));
  assert.equal(h.M.modalLayers.count(), 1);
  sheet.unmount();
  assert.equal(h.M.modalLayers.count(), 0);
  const n = harness();
  n.M.modalLayers.reset();
  n.M.modalLayers.add();
  n.setNested(true);
  const inner = n.mount(() => n.M.useNativeModalLayer(true, 'wait'));
  assert.equal(inner.value.present, true, 'presented from its parent sheet');
  assert.equal(n.M.modalLayers.count(), 1);
});

test('every API request carries X-Core-Loop: 1 (the server stages ladder features only for this bundle)', () => {
  const client = fs.readFileSync(path.join(root, 'src/api/client.ts'), 'utf8');
  assert.match(client, /^client\.defaults\.headers\.common\['X-Core-Loop'\] = '1';/m);
  assert.equal(client.match(/X-Core-Loop/g).length, 1, 'one line, set once');
});


// ---------------------------------------------------------------------------
// guide-map lane, round 1: the root fix on the map path.

const PLAIN_REACT = { react: { createContext: v => ({ value: v }), useContext: () => false, useCallback: f => f, useRef: v => ({ current: v }), useEffect() {}, useState: v => [v, () => {}], useSyncExternalStore: (_s, g) => g() } };

test('PLAY! holds presses while a sheet is still leaving, never longer than HOLD_MAX_MS, never over the open challenge', () => {
  const H = loadTs('src/components/guide/playTapHold.ts', PLAIN_REACT);
  assert.equal(H.holdPlayTaps({ layers: 1, sinceChangeMs: 0, flowOpen: false }), true, 'the swipe-closed sheet still holds its layer');
  assert.equal(H.holdPlayTaps({ layers: 0, sinceChangeMs: 0, flowOpen: false }), false, 'UIKit said it is gone: PLAY! answers');
  assert.equal(H.holdPlayTaps({ layers: 1, sinceChangeMs: H.HOLD_MAX_MS, flowOpen: false }), false, 'a leaked layer can never block PLAY! for good');
  assert.equal(H.holdPlayTaps({ layers: 2, sinceChangeMs: 0, flowOpen: true }), false, 'the challenge flow owns its own sheet');
});

test('PLAY RIDE after a swipe-closed Ride Control sheet opens the card on the first press it takes, 20 out of 20 (sheet layer plus PLAY hold)', () => {
  const h = harness();
  const H = loadTs('src/components/guide/playTapHold.ts', PLAIN_REACT);
  h.M.modalLayers.reset();
  let sheetWanted = false;
  const sheet = h.mount(() => h.M.useNativeModalLayer(sheetWanted, 'show'));
  for (let run = 0; run < 20; run += 1) {
    sheetWanted = true; sheet.render();
    assert.equal(sheet.value.present, true, `run ${run}: the sheet opens`);
    assert.equal(H.holdPlayTaps({ layers: h.M.modalLayers.leavingCount(), sinceChangeMs: 0, flowOpen: false }), false,
      `run ${run}: an open sheet is not leaving (it covers PLAY! itself)`);
    sheetWanted = false; sheet.render();                       // swiped closed: React hides it at once
    assert.equal(h.M.modalLayers.leavingCount(), 1, `run ${run}: the sheet is leaving`);
    const held = H.holdPlayTaps({ layers: h.M.modalLayers.leavingCount(), sinceChangeMs: 0, flowOpen: false });
    assert.equal(held, true, `run ${run}: a press in the dismissal window cannot start the card`);
    sheet.value.onDismissed(); sheet.render();                  // UIKit: the sheet is gone
    assert.equal(h.M.modalLayers.count(), 0, `run ${run}: the layer is free`);
    assert.equal(H.holdPlayTaps({ layers: h.M.modalLayers.leavingCount(), sinceChangeMs: 0, flowOpen: false }), false,
      `run ${run}: the next press opens the card`);
  }
});

test('PLAY! never holds for a dialog that only waits its turn, and a sheet reopened before it was gone is not leaving', () => {
  const h = harness();
  h.M.modalLayers.reset();
  let first = true; let second = true;
  const a = h.mount(() => h.M.useNativeModalLayer(first, 'wait'));
  const b = h.mount(() => h.M.useNativeModalLayer(second, 'wait'));
  assert.equal(h.M.modalLayers.count(), 2);
  assert.equal(h.M.modalLayers.leavingCount(), 0, 'a waiting dialog is registered but not leaving');
  first = false; a.render();
  assert.equal(h.M.modalLayers.leavingCount(), 1, 'the first one hides: leaving');
  first = true; a.render();
  assert.equal(h.M.modalLayers.leavingCount(), 0, 'wanted again before UIKit finished: not leaving any more');
  first = false; a.render(); a.value.onDismissed(); a.render();
  assert.equal(h.M.modalLayers.leavingCount(), 0, 'gone: nothing leaving');
  b.render();
  assert.equal(b.value.present, true, 'the waiting dialog is in front now');
  second = false; b.render(); b.value.onDismissed(); b.render();
  assert.equal(h.M.modalLayers.count(), 0);
});

test('every map-path sheet registers with the native modal layer list and frees it on the native dismissal', () => {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  for (const file of ['src/components/RideControlBar.tsx', 'src/screens/ExploreScreen/TooFarDialog.tsx',
    'src/screens/ExploreScreen/AdventureTicketCard.tsx', 'src/components/SharkDropHandler.tsx']) {
    const source = read(file);
    assert.match(source, /useNativeModalLayer\(/, `${file} adopts useNativeModalLayer`);
    assert.match(source, /isVisible=\{layer\.present\}/, `${file} presents only through its layer`);
    assert.match(source, /onDismiss=\{[^}]*layer\.onDismissed/, `${file} frees the layer on UIKit's dismissal`);
    assert.match(source, /layer\.onHidden/, `${file} settles the layer one transaction after its JS hide (onDismiss never arrives here)`);
  }
  assert.match(read('src/components/SharkDropHandler.tsx'), /useNativeModalLayer\(!!state, 'wait'\)/, 'a Shark Drop waits its turn');
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /usePlayTapHold\(redeemFlowOpen\)/);
  assert.match(explore, /playTapHold && <View testID="play-ride-tap-hold"/);
});

test('a dialog: a late second request is never ended by the first one\'s leftover fade, 10 out of 10', () => {
  const D = loadTs('src/ui/gameDialogModel.ts');
  for (let run = 0; run < 10; run += 1) {
    const gate = D.createDialogCloseGate();
    gate.open();                                        // the first prize shows
    const first = gate.close(0);                        // OK
    assert.equal(typeof first, 'number');
    assert.equal(gate.close(0), null, 'one close at a time');
    gate.open();                                        // the second request arrives 0 to 180 ms after OK
    assert.equal(gate.fadeDone(first), false, `run ${run}: the first close's late fade does not end the second card`);
    assert.equal(gate.answer(), null, 'nothing is answered for the card that is showing');
    assert.equal(gate.busy, false);
    const second = gate.close(1);
    assert.equal(gate.fadeDone(second), true, 'the close in progress ends the dialog');
    assert.deepEqual({ ...gate.answer() }, { index: 1 }, 'answered once, after the native dialog is gone');
    assert.equal(gate.answer(), null, 'never twice');
  }
});

test('a dialog answers only after UIKit dismisses it, so the next dialog or sheet never presents into it', () => {
  const source = fs.readFileSync(path.join(root, 'src/ui/GameDialog.tsx'), 'utf8');
  assert.match(source, /useNativeModalLayer\(visible \|\| mounted, 'wait'\)/);
  assert.match(source, /<Modal transparent visible=\{mounted\}[^>]*\n\s*onDismiss=\{\(\) => deliverRef\.current\(\)\}/);
  assert.match(source, /runOnJS\(fadeDone\)\(token\)/, 'each close carries its token');
  // onDismiss does not arrive on this React Native (measured): the answer goes out NATIVE_SETTLE_MS after the hide.
  assert.match(source, /const timer = setTimeout\(\(\) => deliverRef\.current\(\), NATIVE_SETTLE_MS\);/, 'a silent native dialog still answers, quickly');
});

test('attention rules: no chest ever opens by itself at a park; nothing in the first 30 s, while walking, during play or within 10 s of a win card', () => {
  const Q = loadTs('src/screens/ExploreScreen/mapPresentationQueue.ts', { '../../components/map/statusStack': { HUD_BOTTOM: 76 } });
  const t0 = Date.parse('2026-10-28T19:00:00Z');
  const park = { atPark: true, now: t0 + 60_000, arrivedAt: t0, walkingToTarget: false, playing: false, winCardClosedAt: null, autoOpenUsed: false };
  for (const kind of ['daily_chest', 'reward', 'monday_results']) assert.equal(Q.autoOpenAllowed(kind, park), false, `${kind} never by itself at a park`);
  assert.equal(Q.autoOpenAllowed('event_recap', park), true, 'a calm park moment');
  assert.equal(Q.autoOpenAllowed('event_recap', { ...park, now: t0 + Q.PARK_QUIET_MS - 1 }), false, 'first 30 s at a park');
  assert.equal(Q.autoOpenAllowed('event_recap', { ...park, arrivedAt: null }), false, 'not yet arrived');
  assert.equal(Q.autoOpenAllowed('event_recap', { ...park, walkingToTarget: true }), false, 'while walking to the guide target');
  assert.equal(Q.autoOpenAllowed('event_recap', { ...park, playing: true }), false, 'during a game or LinePlay');
  assert.equal(Q.autoOpenAllowed('event_recap', { ...park, winCardClosedAt: park.now - Q.WIN_CARD_QUIET_MS + 1 }), false, 'within 10 s of a win card');
  assert.equal(Q.autoOpenAllowed('event_recap', { ...park, winCardClosedAt: park.now - Q.WIN_CARD_QUIET_MS }), true);
  const home = { ...park, atPark: false, arrivedAt: null };
  assert.equal(Q.autoOpenAllowed('daily_chest', home), true, 'at home the daily chest may open itself');
  assert.equal(Q.autoOpenAllowed('daily_chest', { ...home, autoOpenUsed: true }), false, 'one automatic open per app open');
  // The queue: one automatic open per app open, keyed by the ladder's app-open id.
  Q.attentionQueue.reset();
  assert.equal(Q.attentionQueue.take('open-1', 'daily_chest'), true);
  assert.equal(Q.attentionQueue.used('open-1', 'daily_chest'), false, 'the chest that took it may keep showing');
  assert.equal(Q.attentionQueue.used('open-1', 'event_recap'), true, 'everything else waits on its button');
  assert.equal(Q.attentionQueue.take('open-1', 'event_recap'), false);
  assert.equal(Q.attentionQueue.used('open-2', 'event_recap'), false, 'a new app open');
  Q.attentionQueue.reset();
});

test('state B at the gate through the first coin: the map wiring keeps chests, reward sheets and offers from opening by themselves', () => {
  const explore = fs.readFileSync(path.join(root, 'src/screens/ExploreScreen.tsx'), 'utf8');
  assert.match(explore, /const chestReady = !firstVisitHold && !\(homeIntroOwed && !park\) && attentionFor\('daily_chest'\) && chestMayPresent\(/);
  assert.match(explore, /&& !\(chestUnclaimed && !!dailyGift && !chestDismissed\(dailyGift\.id\)\) && attentionFor\('reward'\),/, 'level chests and Daily 3 sheets');
  assert.match(explore, /eventsRung\.open && attentionFor\('event_recap'\)/);
  assert.doesNotMatch(explore, /<ParkDayOffer|<NextUpRail|<DwellCard|<MapSuggestionStub/, 'no offer, rail or extra card over the map');
  assert.match(explore, /walkingToTarget: !!park && nextCoin\.state === 'walk', playing: redeemFlowOpen, winCardClosedAt: flowClosedAt,/);
});

test('the Rewards button: one chest, one number; the flame after rung 4, the Trail ring after rung 6', () => {
  const R = loadTs('src/components/map/RewardsButton.tsx', {
    react: {}, 'react/jsx-runtime': { jsx() {}, jsxs() {} }, 'react-native': { StyleSheet: { create: v => v } }, 'expo-image': {},
    'react-native-svg': {}, '../../gamekit/Haptics': {}, '../../ui': { BRAND: {}, SHADOW: { card: {} }, GameIcon: 'GameIcon' } });
  const m = R.rewardsButtonModel({ chestUnclaimed: true, trailReady: 2, dailyOpen: false, flame: 4, trailOpen: false, trailProgress: 0.4 });
  assert.deepEqual({ ...m }, { count: 1, flame: null, trail: null }, 'before rungs 4 and 6: just the chest');
  const later = R.rewardsButtonModel({ chestUnclaimed: false, trailReady: 1, dailyOpen: true, flame: 4, trailOpen: true, trailProgress: 1.4 });
  assert.deepEqual({ ...later }, { count: 1, flame: 4, trail: 1 });
  assert.equal(R.rewardsLabel(later), 'Rewards, 1 to claim, flame 4, Trail Box 100 percent walked');
  // The Rewards sheet's summary (rewards-unlocks) wins when the build has it: it knows every row.
  assert.deepEqual({ ...R.withRewardsSummary(later, { count: 3, flame: 5, trailRing: 0.25 }) }, { count: 3, flame: 5, trail: 0.25 });
  assert.deepEqual({ ...R.withRewardsSummary(m, { count: 2, flame: null, trailRing: null }) }, { count: 2, flame: null, trail: null });
  assert.equal(R.withRewardsSummary(later, undefined), later, 'no sheet in this build: the map count');
  assert.equal(R.withRewardsSummary(later, { count: 'x' }), later, 'a bad summary is ignored');
  const explore = fs.readFileSync(path.join(root, 'src/screens/ExploreScreen.tsx'), 'utf8');
  assert.doesNotMatch(explore, /<MapResourcePill icon="energy"/, 'no Energy pill on the resting map');
  assert.match(explore, /style=\{styles\.trailHostHidden\}/, 'no Trail pill: the Rewards ring and its sheet');
});

test('teaching: park help page 1 opens itself once, only for an account that never had Finn\'s park lesson here, through the queue', () => {
  const explore = fs.readFileSync(path.join(root, 'src/screens/ExploreScreen.tsx'), 'utf8');
  assert.match(explore, /const helpPageKey = player \? `tps\.help\.parkPage1\.v1@p\$\{player\.id\}` : null;/, 'once per account');
  assert.match(explore, /&& !parkLessonRan\.current && !isActive && parkTipReady && !parkTipShowing && attentionFor\('help_page'\);/,
    'never after Finn\'s park lesson in this session, never over a tip, never in the park\'s quiet moments');
  assert.match(explore, /if \(!attentionQueue\.take\(appOpenId, 'help_page'\)\) return;[\s\S]{0,200}openHelpSheet\('park_map'\);/);
  // "Tap PLAY!": the guide card's picture every time PLAY! rises until the first win (no second Finn card).
  assert.match(explore, /teachPlay=\{!hasWonACoin\}/);
  assert.match(explore, /rideCoinInRange: false \}\);/);
  const card = fs.readFileSync(path.join(root, 'src/components/guide/NextCoinCard.tsx'), 'utf8');
  assert.match(card, /\{copy\.pointsAtPlay && teachPlay && <View style=\{styles\.teach\}><CoinTipPicture \/><\/View>\}/);
});

test('rewards fly where they live: Energy to the Shelf button (park and home), XP to the Profile tab; no gift badge on the shark', () => {
  const A = loadTs('src/components/guide/flyAnchors.ts', { react: { useCallback: f => f, useEffect() {}, useRef: v => ({ current: v }) },
    'react-native': { Dimensions: { get: () => ({ width: 402, height: 874 }) } }, '../../context/CurrencyFlyProvider': { useCurrencyFly: () => ({}) } });
  const at = A.profileTabCenter(402, 874, 34);
  assert.ok(Math.abs(at.x - 344) < 6 && Math.abs(at.y - 818) < 6, `the Profile tab is at about (344, 818): ${at.x}, ${at.y}`);
  const explore = fs.readFileSync(path.join(root, 'src/screens/ExploreScreen.tsx'), 'utf8');
  assert.match(explore, /const shelfAnchor = useFlyAnchor\('energy', avatarRef\);/);
  assert.match(explore, /useProfileTabAnchor\(0\);/);
  assert.match(fs.readFileSync(path.join(root, 'src/components/guide/HomeShelfButton.tsx'), 'utf8'), /useFlyAnchor\('energy'\)/);
  assert.match(fs.readFileSync(path.join(root, 'src/components/Map.tsx'), 'utf8'), /const SHARK_TRAIL_BADGE = false;/);
  // Header: Shark Coins and Tickets; Keys and event tokens only while held.
  assert.match(explore, /\(currency\.name === 'Coins' \|\| currencyBalance\(player, currency\.name\) > 0\)\)/);
  assert.match(explore, /\{park && theme\?\.currency && currencyBalance\(player, theme\.currency\.name\) > 0 && \(/);
});

test('a layer settles NATIVE_SETTLE_MS after the sheet reports its JS hide (react-native-modal onModalHide), not the 1.2 s fallback', () => {
  const h = harness();
  h.M.modalLayers.reset();
  let wanted = true;
  const sheet = h.mount(() => h.M.useNativeModalLayer(wanted, 'show'));
  wanted = false; sheet.render();
  assert.equal(h.M.modalLayers.count(), 1, 'still leaving');
  sheet.value.onHidden();
  h.flushTimers();
  sheet.render();
  assert.equal(h.M.modalLayers.count(), 0, 'freed after the short settle');
  assert.ok(h.M.NATIVE_SETTLE_MS <= 200 && h.M.NATIVE_SETTLE_MS < h.M.NATIVE_DISMISS_FALLBACK_MS);
});

test('the guide target\'s island never folds away or hides while it is the target', () => {
  const L = loadTs('src/screens/ExploreScreen/parkMapLayout.ts', { '../../components/map/statusStack': { HUD_BOTTOM: 76 } });
  const plain = { adventure: false, playable: false, goal: false, rush: false, closed: false, near: false, selected: false };
  assert.ok(L.ridePriority({ ...plain, goal: true }, false) > L.ridePriority({ ...plain, near: true }, false), 'the target outranks its neighbours');
  const explore = fs.readFileSync(path.join(root, 'src/screens/ExploreScreen.tsx'), 'utf8');
  assert.match(explore, /goal: goalTaskId === task\.id \|\| guideTargetId === task\.id, rush, near, closed, tag \};/);
});

test('attentionGate: other lanes ask the map\'s rules before opening by themselves (ride question, membership look)', () => {
  const Q = loadTs('src/screens/ExploreScreen/mapPresentationQueue.ts', { '../../components/map/statusStack': { HUD_BOTTOM: 76 } });
  Q.attentionQueue.reset(); Q.attentionGate.reset();
  const t0 = Date.parse('2026-10-28T19:00:00Z');
  Q.attentionGate.publish({ atPark: true, arrivedAt: t0, walkingToTarget: false, playing: false, winCardClosedAt: null }, 'open-1');
  assert.equal(Q.attentionGate.request('ride_question', t0 + 5_000), false, 'never in the first 30 s at a park (the Ride Journal at launch)');
  assert.equal(Q.attentionGate.request('ride_question', t0 + 60_000), true, 'a calm moment takes the one automatic open');
  assert.equal(Q.attentionGate.request('membership', t0 + 61_000), false, 'one automatic open per app open');
  Q.attentionGate.publish({ atPark: true, arrivedAt: t0, walkingToTarget: true, playing: false, winCardClosedAt: null }, 'open-2');
  assert.equal(Q.attentionGate.allowed('ride_question', t0 + 60_000), false, 'never while walking to the target');
  // Before the map knows the place (launch), only a Shark Drop link the player tapped may open.
  Q.attentionGate.hold();
  assert.equal(Q.attentionGate.allowed('ride_question', t0 + 60_000), false, 'the Ride Journal never opens before the map knows the place');
  assert.equal(Q.attentionGate.allowed('membership', t0 + 60_000), false);
  assert.equal(Q.attentionGate.allowed('share_drop', t0 + 60_000), true, 'a link the player tapped');
  Q.attentionQueue.reset(); Q.attentionGate.reset();
  const explore = fs.readFileSync(path.join(root, 'src/screens/ExploreScreen.tsx'), 'utf8');
  assert.match(explore, /const placeKnown = parkLoaded && \(!!park \|\| homeLocationConfirmed\);/);
  assert.match(explore, /if \(!placeKnown\) \{ attentionGate\.hold\(\); return; \}/);
  assert.match(explore, /attentionGate\.publish\(\{ atPark: !!park, arrivedAt: nextCoin\.arrivedAt,/);
});

test('calm clocks on the map and the home map: whole minutes, never a ticking m:ss (core loop 4.3 rule 7)', () => {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  for (const file of ['src/components/home/HomeLive.tsx', 'src/screens/ExploreScreen/TaskMarker.tsx', 'src/screens/ExploreScreen/FindLife.tsx',
    'src/screens/ExploreScreen/Coin.tsx', 'src/components/LiveEventsPill.tsx']) {
    assert.doesNotMatch(read(file), /% 60\)\.padStart\(2/, `${file} draws no seconds`);
  }
  const live = read('src/components/home/HomeLive.tsx');
  assert.match(live, /export function raidMinutes\(endsAt: string, now: number\): string \{/);
  assert.match(live, /return `\$\{Math\.max\(1, Math\.ceil\(ms \/ 60_000\)\)\} min`;/, 'a raid says "4 min", never 3:59');
  assert.doesNotMatch(live, /setInterval\(\(\) => setNow\(Date\.now\(\)\), 1000\)/, 'no per-second ticking on the home map');
  const marker = read('src/screens/ExploreScreen/TaskMarker.tsx');
  assert.match(marker, /id = setTimeout\(tick, rest < 60_000 \? rest : \(rest % 60_000\) \|\| 60_000\);/, 'the island chip wakes once a minute');
});

test('at home Finn\'s first-time intro goes first: the daily chest waits while the intro is owed (4.3 rule 1)', () => {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const home = read('src/screens/ExploreScreen/HomeExplore.tsx');
  assert.match(home, /const introOwed = introSeen !== true && introEligible && homeLocationConfirmed;/);
  assert.match(home, /onIntroOwedChange\?\.\(introOwed\)/);
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /const chestReady = !firstVisitHold && !\(homeIntroOwed && !park\) && attentionFor\('daily_chest'\)/);
  assert.match(explore, /onIntroOwedChange=\{setHomeIntroOwed\}/);
});

test('the map\'s team chip is one "your team" chip once the player has a team; the three-team scoreboard waits in the sheet', () => {
  const bar = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/components/RideControlBar.tsx'), 'utf8');
  assert.match(bar, /const chipTeams = compact && yours \? \[yours\] : TEAM_ORDER;/);
  assert.match(bar, /\{chipTeams\.map\(team => <TeamChip/);
  assert.match(bar, /`Your team, \$\{teamName\(yours, names\)\}/);
});

test('signing out or a second player on the phone resets the guide (one shark never inherits another\'s target)', () => {
  const explore = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/screens/ExploreScreen.tsx'), 'utf8');
  assert.match(explore, /guide\.forPlayer\(player\.id\)/);
  assert.match(explore, /guide\.forPlayer\(null\)/);
});

test('Shark Drop: OK lets the dialog go in a quick fade, so a PLAY! press right after it is not swallowed by a leaving native modal (r3)', () => {
  const drop = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/components/SharkDropHandler.tsx'), 'utf8');
  assert.match(drop, /export const DROP_EXIT_MS = 140;/);
  assert.match(drop, /animationOut="fadeOut" animationOutTiming=\{DROP_EXIT_MS\} backdropTransitionOutTiming=\{DROP_EXIT_MS\}/);
});

test('reward broadcast banners stop: coins and Tickets fly to their pill with +N; server news still shows (BLUEPRINT row 329)', () => {
  const fs = require('node:fs'); const path = require('node:path');
  const filter = loadTs('src/api/broadcastFilter.ts');
  const setup = fs.readFileSync(path.join(__dirname, '../../src/hooks/useAxiosSetup.ts'), 'utf8');
  assert.match(setup, /export const REWARD_BANNERS_FOLDED = true;/);
  assert.match(setup, /visibleBroadcasts<string>\(response\.data\.broadcasts, REWARD_BANNERS_FOLDED \|\| Boolean\(cfg\?\.\[QUIET_COIN_BROADCAST\]\)\)/);
  const server = ['You earned 25 coins!', 'You earned 1 Ticket!', 'A new limited coin is here!', 'Maintenance tonight at 2 AM.'];
  assert.deepEqual([...filter.visibleBroadcasts(server, true)], ['A new limited coin is here!', 'Maintenance tonight at 2 AM.']);
  // The header pill is what shows the gain: it celebrates any plain gain with +N.
  const pill = fs.readFileSync(path.join(__dirname, '../../src/components/Topbar/Currency.tsx'), 'utf8');
  assert.match(pill, /setPlusText\(`\+\$\{countText\(gain\)\}`\)/);
});
