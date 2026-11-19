'use strict';
/**
 * Fix pass w4, lane press (Nov 19 2026): a press that does nothing.
 * Read on the simulator with the hosts' phase log, release-like JS: a tap on the map right after a sheet closed landed
 * on the sheet while UIKit was still taking it down (1.0 to 1.3 s after BACK TO MAP) and nothing answered it, 10 of 16
 * first presses on Rewards. Root fix: the app's one native door keeps that tap and, once the sheet is gone, presses what
 * is under it (src/ui/tapThrough.ts). Each test fails on 11f2e5f8 (no tapThrough, no keep, no claim).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const src = file => fs.readFileSync(path.join(root, file), 'utf8');
const reactStub = { createContext: v => ({ v }), useContext: () => false, useEffect() {}, useState: v => [v, () => {}],
  useSyncExternalStore: (s, get) => get(), useRef: v => ({ current: v }), useCallback: f => f };
const T = loadTs('src/ui/tapThrough.ts');

// A tiny fiber chain: host view -> Pressable -> YellowButton -> ... -> screen root.
const chain = (...nodes) => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].return = nodes[i + 1]; return nodes[0]; };

test('the nearest onPress above the hit answers, a disabled one answers nothing', () => {
  const press = () => 'pressed';
  const hit = chain({ tag: 5, type: 'RCTView', memoizedProps: {} }, { tag: 11, memoizedProps: { onPress: press } },
    { tag: 0, memoizedProps: { onPress: () => 'outer' } }, { tag: 5, type: 'RCTView', memoizedProps: {} });
  const target = T.pressTargetFromChain(hit);
  assert.equal(target.onPress, press);
  const off = chain({ tag: 5, type: 'RCTView', memoizedProps: {} }, { tag: 11, memoizedProps: { onPress: press, disabled: true } });
  assert.equal(T.pressTargetFromChain(off), null, 'a disabled button is never pressed by a replay');
  const offA11y = chain({ tag: 11, memoizedProps: { onPress: press, accessibilityState: { disabled: true } } });
  assert.equal(T.pressTargetFromChain(offA11y), null);
});

test('a hit inside another sheet, or on the map itself, is never replayed', () => {
  const inSheet = chain({ tag: 11, memoizedProps: { onPress: () => 1 } }, { tag: 5, type: 'RCTModalHostView', memoizedProps: {} },
    { tag: 5, type: 'RCTView', memoizedProps: {} });
  assert.equal(T.pressTargetFromChain(inSheet), null);
  const onMap = chain({ tag: 5, type: 'AIRMap', memoizedProps: { region: {}, onPress: () => 1 } });
  assert.equal(T.pressTargetFromChain(onMap), null);
  assert.equal(T.pressTargetFromChain(null), null);
});

test('the screen root is the outermost host view', () => {
  const top = { tag: 5, type: 'RCTView', memoizedProps: {}, stateNode: { node: 'root-node' } };
  const leaf = chain({ tag: 5, type: 'RCTModalHostView' }, { tag: 0 }, { tag: 5, type: 'RCTView' }, { tag: 3 }, top, { tag: 3 });
  assert.equal(T.rootHostFromChain(leaf), top);
});

function rig(hitFor) {
  let now = 1000;
  const calls = [];
  const t = T.createTapThrough({
    now: () => now,
    findNodeAtPoint: () => (node, x, y, cb) => { calls.push({ node, x, y }); cb(hitFor(x, y)); },
  });
  t.setScreenRoot({ tag: 5, type: 'RCTView', stateNode: { node: 'root-node' } });
  return { t, calls, tick: ms => { now += ms; } };
}

test('the first tap on a leaving sheet presses what is under it once the sheet is gone, once', () => {
  const pressed = [];
  const { t, calls, tick } = rig((x, y) => ({ tag: 11, memoizedProps: { onPress: e => pressed.push([x, y, e.nativeEvent.pageX]) } }));
  t.keep(359, 284);
  t.keep(100, 100);                         // a second tap in the same leave is the same press, not two
  tick(600);
  assert.equal(t.deliver(), 'pending');
  assert.deepEqual(calls.map(c => [c.node, c.x, c.y]), [['root-node', 359, 284]]);
  assert.deepEqual(pressed, [[359, 284, 359]]);
  assert.equal(t.deliver(), 'none', 'nothing is pressed twice');
});

test('a claimed tap (PLAY! took it), a stale tap and a sheet that stayed replay nothing', () => {
  const pressed = [];
  const { t, tick } = rig(() => ({ tag: 11, memoizedProps: { onPress: () => pressed.push(1) } }));
  t.keep(1, 1).claimed = true;
  assert.equal(t.deliver(), 'claimed');
  t.keep(1, 1); tick(T.TAP_THROUGH_MAX_AGE_MS + 1);
  assert.equal(t.deliver(), 'stale');
  t.keep(1, 1); t.drop();
  assert.equal(t.deliver(), 'none');
  assert.deepEqual(pressed, []);
});

test('no hit test in this build: the tap is not replayed and nothing throws', () => {
  const t = T.createTapThrough({ findNodeAtPoint: () => null });
  t.setScreenRoot({ tag: 5, stateNode: { node: 'n' } });
  t.keep(1, 1);
  assert.equal(t.deliver(), 'no_hit_test');
  const boom = T.createTapThrough({ findNodeAtPoint: () => (n, x, y, cb) => cb({ tag: 11, memoizedProps: { onPress: () => { throw new Error('x'); } } }) });
  boom.setScreenRoot({ tag: 5, stateNode: { node: 'n' } });
  boom.keep(1, 1);
  assert.equal(boom.deliver(), 'pending', 'a throwing handler is caught');
});

test('a tap on a leaving top-level sheet is kept for the screen; a listener that claims it keeps it from replaying', () => {
  const tapStub = { kept: [], dropped: 0 };
  const L = loadTs('src/ui/modalLayers.ts', { react: reactStub, './tapThrough': { tapThrough: {
    keep: (x, y) => { const k = { x, y, claimed: false }; tapStub.kept.push(k); return k; }, drop: () => { tapStub.dropped++; } } } });
  L.modalLayers.reset();
  const id = L.modalLayers.add();
  L.leavingSheetTap.note(10, 10, Date.now(), false, true);
  assert.equal(tapStub.kept.length, 0, 'the tap that closes a sheet (before it leaves) is never kept');
  L.modalLayers.markLeaving(id);
  const stop = L.leavingSheetTap.listen((x, y, claim) => claim());
  L.leavingSheetTap.note(359, 284, Date.now(), false, true);
  assert.equal(tapStub.kept.length, 1);
  assert.equal(tapStub.kept[0].claimed, true, 'PLAY! claimed it: no replay');
  stop();
  L.leavingSheetTap.note(5, 5, Date.now(), false, false);
  assert.equal(tapStub.kept.length, 1, 'a sheet inside a sheet never replays');
  L.modalLayers.clearLeaving(id);
  assert.equal(tapStub.dropped, 1, 'the sheet stayed: its kept tap is dropped');
});

test('the door hides a sheet in the same commit it stops being wanted, and replays the kept tap once it is gone', () => {
  const door = src('src/ui/DoorModal.tsx');
  assert.match(door, /visible=\{doorNativeVisible\(phase\) && !blink && !\(phase === 'up' && !wants\)\}/);
  assert.match(door, /phase === 'off' && was !== 'off' && !nested\) \{\s*const how = tapThrough\.deliver\(\)/);
  assert.match(door, /leavingSheetTap\.note\(.*!now\.current\.nested\);/);
  assert.match(door, /if \(event\.nativeEvent\.tpsSheetNoted\) return;\s*event\.nativeEvent\.tpsSheetNoted = true;/, 'a touch on the gate inside a sheet is noted once, by the gate');
  assert.match(door, /tapThrough\.setScreenRoot\(internalHandle\(host\)\)/);
});

// N02: the grown-up gate was asked for while a sheet was up, never drew, and the money log said tap, gate_shown,
// gate_declined. A gate that could not be shown is never a grown-up's no.
function suppliesWith(outcome) {
  const events = [];
  const product = { product_id: 'park_day', grants: { tickets: 5 }, available: true };
  const S = loadTs('src/services/money/supplies.ts', {
    react: reactStub,
    '../../components/GrownUpGate': { askGrownUpOutcome: async () => outcome },
    '../../api/endpoints/me/shop': { getShop: async () => ({ enabled: true, products: [product] }) },
    './track': { trackMoney: event => events.push(event) },
    '../purchases': { storeAvailable: () => true, loadShopPrices: async () => ({ park_day: { price: '$4.99' } }),
      buyShopProduct: async () => ({ status: 'cancelled' }) },
    '../../helpers/countText': { __esModule: true, default: n => String(n) },
    './offers': { baseRates: () => ({}), bundleWorth: () => null },
  });
  return { S, events, product };
}

test('a gate iOS never drew is not logged as shown or declined, and the buy says unshown (never a no)', async () => {
  const { S, events, product } = suppliesWith('unshown');
  await S.refreshSupplies(true);
  const out = await S.buyPack(product, { placement: 'offer.need_ticket' });
  assert.equal(out.status, 'unshown');
  assert.deepEqual(events, ['tap'], 'no gate_shown, no gate_declined for a gate nobody saw');
  assert.equal(S.outcomeMessage(out, null), null, 'no alert: the gate shows its own "Tap it again" hint');
});

test('a grown-up\'s real no is still logged as shown, then declined', async () => {
  const { S, events, product } = suppliesWith('no');
  await S.refreshSupplies(true);
  const out = await S.buyPack(product, { placement: 'offer.need_ticket' });
  assert.equal(out.status, 'declined');
  assert.deepEqual(events, ['tap', 'gate_shown', 'gate_declined']);
});

test('the gate marks an ask it never drew as unshown, and the offer row is busy from the tap with a pressed look', () => {
  const gate = src('src/components/GrownUpGate.tsx');
  assert.match(gate, /pressTrace\('gate\.watchdog'[^\n]*\n\s*showRetryHint\(gateRetryHint\(reqRef\.current\.reason\)\);\n\s*reqRef\.current\.unshown = true;/);
  assert.match(gate, /resolve: ok => resolve\(request\.unshown \? 'unshown' : ok \? 'yes' : 'no'\)/);
  assert.match(gate, /if \(left && !shownRef\.current\) left\.unshown = true;/, 'a gate torn before it showed is not a no');
  const offer = src('src/components/money/CalmOffer.tsx');
  assert.match(offer, /haptic\('tapLight'\);\n[^\n]*\n\s*if \(placement !== 'win_vip' && placement !== 'high_point' && pack\) setBusy\(true\);/);
  assert.match(offer, /style=\{\(\{ pressed \}\) => \[st\.slimTap, pressed && st\.slimPressed, busy && st\.slimBusy\]\}/);
});
