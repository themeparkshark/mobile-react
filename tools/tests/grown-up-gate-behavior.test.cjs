'use strict';
/**
 * Behavior tests for the grown-up gate host and the share helper (ship gate, Oct 23):
 * the real GrownUpGateHost runs on a tiny hooks runtime with fake timers, so the
 * host stack, the show-watchdog, the dismiss fallback and the unmount answer are
 * exercised, not just pattern-matched in the source.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');

/** Fake timers shared by the vm realm. */
function fakeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map();
  return {
    setTimeout(fn, ms = 0) { const id = ++seq; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    async tick(ms, settle) {
      const end = now + ms;
      for (;;) {
        let next = null;
        for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
        if (!next) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].fn();
        if (settle) await settle();
      }
      now = end;
      if (settle) await settle();
    },
  };
}

/** A minimal hooks runtime: enough for useState, useRef, useCallback and useEffect. */
function hooksRuntime() {
  let current = null;
  const dirty = new Set();
  function render(inst) {
    current = inst;
    inst.i = 0;
    inst.effects = [];
    inst.tree = inst.fn(inst.props);
    current = null;
    for (const { slot, fn } of inst.effects) {
      if (slot.cleanup) slot.cleanup();
      slot.cleanup = fn() || null;
    }
  }
  const React = {
    useState(init) {
      const inst = current;
      const slot = inst.hooks[inst.i] ??= { v: typeof init === 'function' ? init() : init };
      inst.i++;
      return [slot.v, next => {
        const v = typeof next === 'function' ? next(slot.v) : next;
        if (Object.is(v, slot.v)) return;
        slot.v = v;
        if (inst.alive) dirty.add(inst);
      }];
    },
    useRef(init) {
      const inst = current;
      const slot = inst.hooks[inst.i] ??= { current: init };
      inst.i++;
      return slot;
    },
    useCallback(fn, deps) {
      const inst = current;
      const slot = inst.hooks[inst.i] ??= { fn, deps };
      inst.i++;
      if (deps.some((d, k) => !Object.is(d, slot.deps[k]))) { slot.fn = fn; slot.deps = deps; }
      return slot.fn;
    },
    useEffect(fn, deps) {
      const inst = current;
      const slot = inst.hooks[inst.i] ??= { deps: null, cleanup: null };
      inst.i++;
      if (!slot.deps || !deps || deps.some((d, k) => !Object.is(d, slot.deps[k]))) {
        slot.deps = deps;
        inst.effects.push({ slot, fn });
      }
    },
  };
  async function settle() {
    for (let round = 0; round < 50; round++) {
      for (let k = 0; k < 10; k++) await Promise.resolve();
      if (!dirty.size) return;
      const list = [...dirty];
      dirty.clear();
      for (const inst of list) if (inst.alive) render(inst);
    }
  }
  function mount(fn, props) {
    const inst = { fn, props, hooks: [], alive: true, tree: null };
    render(inst);
    return {
      get tree() { return inst.tree; },
      unmount() {
        inst.alive = false;
        for (const slot of inst.hooks) if (slot && slot.cleanup) { slot.cleanup(); slot.cleanup = null; }
      },
    };
  }
  return { React, settle, mount };
}

const el = (type, props) => ({ type, props: props ?? {} });
function find(tree, pred, out = []) {
  if (!tree || typeof tree !== 'object') return out;
  if (Array.isArray(tree)) { for (const t of tree) find(t, pred, out); return out; }
  if (pred(tree)) out.push(tree);
  find(tree.props && tree.props.children, pred, out);
  return out;
}
const modalOf = host => find(host.tree, n => n.type === 'Modal')[0] ?? null;
const textOf = tree => find(tree, n => n.type === 'Text').flatMap(n => [].concat(n.props.children)).filter(c => typeof c === 'string').join(' ');

function loadGate(os = 'ios') {
  const clock = fakeClock();
  const rt = hooksRuntime();
  const gate = loadTs('src/components/GrownUpGate.tsx', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => null, setItem: async () => undefined } },
    react: rt.React,
    'react/jsx-runtime': { jsx: el, jsxs: el, Fragment: 'Fragment' },
    '../ui/iconNames': {}, './RealMoneyMark': { default: 'RealMoneyMark' },
    'react-native': { Modal: 'Modal', Platform: { OS: os }, Pressable: 'Pressable', ScrollView: 'ScrollView', StyleSheet: { create: s => s }, Text: 'Text', View: 'View' },
    '../RootNavigation': { navigate: () => undefined },
    '../ui': { BRAND: { goldLip: '#d99a00', navy: '#05346e' }, FONT: {}, GameIcon: 'GameIcon' },
    '../ui/modalLayers': { useModalLayer: () => true },
  }, { __DEV__: false, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  const settle = rt.settle;
  const tick = ms => clock.tick(ms, settle);
  const mountHost = nested => rt.mount(gate.GrownUpGateHost, { nested });
  return { gate, settle, tick, mountHost };
}

/** Types the right answer for `seed` on the host's pad and presses OK. */
function answer(gate, host, seed, right = true) {
  const want = String(gate.grownUpQuestion(seed).answer + (right ? 0 : 1));
  for (const digit of want) {
    find(host.tree, n => n.type === 'Pressable' && n.props.accessibilityLabel === digit)[0].props.onPress();
  }
}
async function pressOk(host, settle) {
  await settle();
  find(host.tree, n => n.type === 'Pressable' && n.props.accessibilityLabel === 'Done')[0].props.onPress();
  await settle();
}
const SHARE = { kind: 'share' };
const track = promise => { const box = { done: false, value: undefined }; promise.then(v => { box.done = true; box.value = v; }); return box; };

test('the top host answers: a slot inside a modal shows the gate, the root host stays hidden', async () => {
  const { gate, settle, mountHost } = loadGate();
  const root = mountHost(false);
  const slot = mountHost(true);
  const ask = track(gate.askGrownUp(SHARE, 42));
  await settle();
  assert.ok(modalOf(slot), 'the slot (inside the top modal) shows the gate');
  assert.equal(modalOf(root), null, 'the root host shows nothing');
  slot.unmount();
  await settle();
  assert.equal(ask.done, true);
  assert.equal(ask.value, false, 'the modal holding it went away: a no, never a hang');
  // With the slot gone the root host is the top one again.
  const again = track(gate.askGrownUp(SHARE, 42));
  await settle();
  assert.ok(modalOf(root), 'the root host shows the next ask');
  root.unmount();
  await settle();
  assert.equal(again.value, false);
});

test('a yes given during the fade is never lost when the modal holding the gate closes', async () => {
  const { gate, settle, mountHost } = loadGate();
  mountHost(false);
  const slot = mountHost(true);
  const ask = track(gate.askGrownUp(SHARE, 42));
  await settle();
  modalOf(slot).props.onShow();
  answer(gate, slot, 42);
  await pressOk(slot, settle);
  assert.equal(modalOf(slot).props.visible, false, 'the gate fades out first');
  assert.equal(ask.done, false, 'the answer waits for the fade');
  slot.unmount();
  await settle();
  assert.equal(ask.value, true, 'the grown-up said yes: it still counts');
});

test('the answer comes after the gate fades: on onDismiss, or the 2 s fallback when iOS never reports it', async () => {
  const { gate, settle, tick, mountHost } = loadGate();
  const root = mountHost(false);
  const first = track(gate.askGrownUp(SHARE, 7));
  await settle();
  modalOf(root).props.onShow();
  answer(gate, root, 7);
  await pressOk(root, settle);
  modalOf(root).props.onDismiss();
  await settle();
  assert.equal(first.value, true, 'onDismiss answers at once');

  const second = track(gate.askGrownUp(SHARE, 8));
  await settle();
  modalOf(root).props.onShow();
  answer(gate, root, 8);
  await pressOk(root, settle);
  await tick(gate.GATE_DISMISS_FALLBACK_MS - 1);
  assert.equal(second.done, false, 'still fading');
  await tick(1);
  assert.equal(second.value, true, 'the fallback answers when onDismiss never comes');
  assert.equal(modalOf(root), null, 'the gate is gone');
});

test('Not now and a wrong answer both end as a no', async () => {
  const { gate, settle, mountHost } = loadGate();
  const root = mountHost(false);
  const no = track(gate.askGrownUp(SHARE, 3));
  await settle();
  modalOf(root).props.onShow();
  find(root.tree, n => n.type === 'Pressable' && textOf(n) === 'Not now')[0].props.onPress();
  await settle();
  modalOf(root).props.onDismiss();
  await settle();
  assert.equal(no.value, false);
  const wrong = track(gate.askGrownUp(SHARE, 4));
  await settle();
  modalOf(root).props.onShow();
  answer(gate, root, 4, false);
  await pressOk(root, settle);
  modalOf(root).props.onDismiss();
  await settle();
  assert.equal(wrong.value, false);
});

test('a gate iOS could not show closes as a no and the kid sees "Try again in a sec", never a silent tap', async () => {
  const { gate, settle, tick, mountHost } = loadGate();
  const root = mountHost(false);
  const ask = track(gate.askGrownUp(SHARE, 5));
  await settle();
  assert.ok(modalOf(root));
  // onShow never fires: iOS refused to present it.
  await tick(gate.GATE_SHOW_WATCHDOG_MS - 1);
  assert.doesNotMatch(textOf(root.tree), /Try again/);
  await tick(1);
  assert.match(textOf(root.tree), /Try again in a sec/, 'a kind hint, not a silent no');
  assert.equal(gate.GATE_RETRY_HINT, 'Try again in a sec');
  await tick(gate.GATE_DISMISS_FALLBACK_MS);
  assert.equal(ask.value, false);
  assert.match(textOf(root.tree), /Try again in a sec/, 'the hint outlives the gate');
  await tick(gate.GATE_HINT_MS);
  assert.doesNotMatch(textOf(root.tree), /Try again/, 'then it goes away');
  assert.equal(root.tree, null);
});

test('a gate that did show never trips the watchdog', async () => {
  const { gate, settle, tick, mountHost } = loadGate();
  const root = mountHost(false);
  const ask = track(gate.askGrownUp(SHARE, 6));
  await settle();
  modalOf(root).props.onShow();
  await tick(gate.GATE_SHOW_WATCHDOG_MS * 3);
  assert.equal(ask.done, false, 'the grown-up can take their time');
  assert.equal(modalOf(root).props.visible, true);
});

test('Android answers at once (no iOS fade wait)', async () => {
  const { gate, settle, mountHost } = loadGate('android');
  const root = mountHost(false);
  const ask = track(gate.askGrownUp(SHARE, 9));
  await settle();
  modalOf(root).props.onShow();
  answer(gate, root, 9);
  await pressOk(root, settle);
  assert.equal(ask.value, true);
});

function loadExternal({ gateYes = true, sheet = 'hang' } = {}) {
  const clock = fakeClock();
  const calls = { share: [], copy: [], del: [], mkdir: [] };
  const external = loadTs('src/services/external.ts', {
    'expo-file-system': {
      cacheDirectory: 'file:///cache/',
      deleteAsync: async (dir, opts) => { calls.del.push([dir, opts]); },
      makeDirectoryAsync: async dir => { calls.mkdir.push(dir); },
      copyAsync: async ({ from, to }) => { calls.copy.push([from, to]); },
    },
    'expo-sharing': {
      isAvailableAsync: async () => true,
      shareAsync: (uri, options) => { calls.share.push([uri, options]); return sheet === 'hang' ? new Promise(() => {}) : Promise.resolve(); },
    },
    'expo-web-browser': { openBrowserAsync: async () => undefined },
    'react-native': { Linking: { canOpenURL: async () => true, openURL: async () => undefined, openSettings: async () => undefined }, Share: { share: () => new Promise(() => {}) } },
    '../components/GrownUpGate': { askGrownUp: async () => gateYes },
  }, { setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  const settle = async () => { for (let k = 0; k < 20; k++) await Promise.resolve(); };
  return { external, calls, tick: ms => clock.tick(ms, settle), settle };
}

test('a share sheet that never answers frees the button at SHARE_SHEET_WAIT_MS', async () => {
  const { external, tick, settle } = loadExternal({ sheet: 'hang' });
  const done = track(external.shareFileExternal('file:///tmp/1ED163AE-B648.png', { mimeType: 'image/png' }, 'Whack-a-Shark 460'));
  await settle();
  await tick(external.SHARE_SHEET_WAIT_MS - 1);
  assert.equal(done.done, false);
  await tick(1);
  assert.equal(done.value, false);
  const text = track(external.shareExternal({ message: 'hi' }));
  await settle();
  await tick(external.SHARE_SHEET_WAIT_MS);
  assert.equal(text.done, true);
  assert.equal(text.value, null);
});

test('the share sheet shows a readable file name, never the capture UUID', async () => {
  const { external, calls, settle } = loadExternal({ sheet: 'closes' });
  const done = track(external.shareFileExternal('file:///tmp/1ED163AE-B648-4C2B.png', { mimeType: 'image/png' }, 'Whack-a-Shark 460'));
  await settle();
  assert.equal(done.value, true);
  assert.deepEqual(calls.copy, [['file:///tmp/1ED163AE-B648-4C2B.png', 'file:///cache/share-card/Whack-a-Shark-460.png']]);
  assert.equal(calls.share[0][0], 'file:///cache/share-card/Whack-a-Shark-460.png');
  assert.equal(calls.del[0][0], 'file:///cache/share-card/', 'the last copy is cleared first, so copies never pile up');
  assert.equal(external.shareFileName('Space Mountain Ride Card', 'jpg'), 'Space-Mountain-Ride-Card.jpg');
  assert.equal(external.shareFileName("Pirates' Lair: Tom & Becky", 'png'), 'Pirates-Lair-Tom-Becky.png');
  assert.equal(external.shareFileName('***', 'png'), 'Theme-Park-Shark.png');
  // No name: the capture is shared as is.
  await external.shareFileExternal('file:///tmp/x.png');
  assert.equal(calls.share[1][0], 'file:///tmp/x.png');
});

test('a grown-up no shares nothing and copies nothing', async () => {
  const { external, calls, settle } = loadExternal({ gateYes: false, sheet: 'closes' });
  const done = track(external.shareFileExternal('file:///tmp/a.png', undefined, 'Whack-a-Shark 1'));
  await settle();
  assert.equal(done.value, false);
  assert.equal(calls.share.length, 0);
  assert.equal(calls.copy.length, 0);
});

test('the ride card share sheets keep their buttons reachable: the backdrop and panel are not one big accessible element', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const file of ['src/screens/RideTracker/RideDetailScreen.tsx', 'src/screens/RideTracker/RideHistoryScreen.tsx']) {
    const code = fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8');
    assert.match(code, /style=\{\w+\.modalOverlay\} onPress=\{\(\) => set\w+\(null\)\} accessible=\{false\}>/, file);
    assert.match(code, /style=\{\w+\.modalContent\} onPress=\{\(\) => \{\}\} accessible=\{false\}>/, file);
    assert.match(code, /style=\{\w+\.modalClose\} accessibilityRole="button" accessibilityLabel="Close">/, file);
  }
});
