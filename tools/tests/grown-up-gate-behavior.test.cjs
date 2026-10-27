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
    useContext(ctx) { return ctx.value; },
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
      rerender(next) { inst.props = next; render(inst); },
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

test('a gate iOS could not show closes as a no at once and the kid sees "Tap Share again" with the retry arrow, never a silent tap', async () => {
  const { gate, settle, tick, mountHost } = loadGate();
  const root = mountHost(false);
  const ask = track(gate.askGrownUp(SHARE, 5));
  await settle();
  assert.ok(modalOf(root));
  // onShow never fires: iOS refused to present it.
  await tick(gate.GATE_SHOW_WATCHDOG_MS - 1);
  assert.doesNotMatch(textOf(root.tree), /again/);
  await tick(1);
  assert.equal(ask.value, false, 'it never showed, so there is no fade to wait for');
  assert.match(textOf(root.tree), /Tap Share again/, 'a kind hint, not a silent no');
  const icons = find(root.tree, n => n.type === 'GameIcon').map(n => n.props.name);
  assert.deepEqual(icons, ['retry'], 'the retry arrow, never a lock (a lock reads as "not allowed")');
  assert.equal(gate.gateRetryHint(SHARE), 'Tap Share again');
  assert.equal(gate.gateRetryHint({ kind: 'leave', where: 'a website' }), 'Tap it again');
  // A second tap right away asks fresh (the first ask is over).
  const again = track(gate.askGrownUp(SHARE, 6));
  await settle();
  modalOf(root).props.onShow();
  assert.equal(again.done, false);
  root.unmount();
  await settle();
  assert.equal(again.value, false);
});

test('the retry hint draws from the top host (inside the front modal), never under it', async () => {
  const { gate, settle, tick, mountHost } = loadGate();
  const root = mountHost(false);
  const slot = mountHost(true);
  const ask = track(gate.askGrownUp(SHARE, 5));
  await settle();
  await tick(gate.GATE_SHOW_WATCHDOG_MS);
  assert.equal(ask.value, false);
  assert.match(textOf(slot.tree), /Tap Share again/, 'the slot inside the front modal shows it');
  assert.doesNotMatch(textOf(root.tree) || '', /again/, 'the root host under the modal shows nothing');
  await tick(gate.GATE_HINT_MS);
  assert.doesNotMatch(textOf(slot.tree) || '', /again/, 'then it goes away');
  assert.equal(slot.tree, null);
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

test('a slow or hot phone that presents the gate at 3.5 s still gets the gate, not "Tap Share again"', async () => {
  const { gate, settle, tick, mountHost } = loadGate();
  const root = mountHost(false);
  const ask = track(gate.askGrownUp(SHARE, 9));
  await settle();
  await tick(3500);
  assert.doesNotMatch(textOf(root.tree), /again/, 'no hint while the gate is still on its way');
  assert.equal(ask.done, false);
  modalOf(root).props.onShow();
  await tick(gate.GATE_SHOW_WATCHDOG_MS * 2);
  assert.equal(ask.done, false, 'the gate showed late, so the grown-up gets to answer');
  assert.equal(modalOf(root).props.visible, true);
  answer(gate, root, 9);
  await pressOk(root, settle);
  modalOf(root).props.onDismiss();
  await settle();
  assert.equal(ask.value, true);
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

function loadExternal({ gateYes = true, sheet = 'hang', os = 'android', iosAction = 'sharedAction' } = {}) {
  const clock = fakeClock();
  const calls = { share: [], copy: [], del: [], mkdir: [], rnShare: [] };
  // A tiny cache folder: share-card/<slot>/ entries the helper made.
  const dirs = new Set();
  const pending = [];
  const sheetResult = value => {
    if (sheet === 'hang') return new Promise(() => {});
    if (sheet === 'manual') return new Promise(resolve => pending.push(() => resolve(value)));
    return Promise.resolve(value);
  };
  const external = loadTs('src/services/external.ts', {
    'expo-file-system': {
      cacheDirectory: 'file:///cache/',
      readDirectoryAsync: async dir => { assert.equal(dir, 'file:///cache/share-card/'); return [...dirs]; },
      deleteAsync: async (path, opts) => { calls.del.push([path, opts]); dirs.delete(path.replace('file:///cache/share-card/', '').replace(/\/$/, '')); },
      makeDirectoryAsync: async dir => { calls.mkdir.push(dir); dirs.add(dir.replace('file:///cache/share-card/', '').replace(/\/$/, '')); },
      copyAsync: async ({ from, to }) => { calls.copy.push([from, to]); },
    },
    'expo-sharing': {
      isAvailableAsync: async () => true,
      shareAsync: (uri, options) => { calls.share.push([uri, options]); return sheetResult(undefined); },
    },
    'expo-web-browser': { openBrowserAsync: async () => undefined },
    'react-native': {
      Platform: { OS: os },
      Linking: { canOpenURL: async () => true, openURL: async () => undefined, openSettings: async () => undefined },
      Share: {
        sharedAction: 'sharedAction', dismissedAction: 'dismissedAction',
        share: content => { calls.rnShare.push(content); return sheetResult({ action: iosAction }); },
      },
    },
    '../components/GrownUpGate': { askGrownUp: async () => gateYes },
  }, { setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  // Real macrotask turns flush every pending microtask (the copy, the sheet and the race).
  const settle = async () => { for (let k = 0; k < 12; k++) await new Promise(resolve => setImmediate(resolve)); };
  return { external, calls, dirs, pending, tick: ms => clock.tick(ms, settle), settle };
}

/** share-card/<slot>/<Name> with the slot taken out, so assertions read the readable name. */
const named = path => path.replace(/share-card\/[^/]+\//, 'share-card/*/');

test('a share sheet that never answers frees the button at SHARE_SHEET_WAIT_MS', async () => {
  for (const os of ['android', 'ios']) {
    const { external, tick, settle } = loadExternal({ sheet: 'hang', os });
    const done = track(external.shareFileExternal('file:///tmp/1ED163AE-B648.png', { mimeType: 'image/png' }, 'Whack-a-Shark 460'));
    await settle();
    await tick(external.SHARE_SHEET_WAIT_MS - 1);
    assert.equal(done.done, false, os);
    await tick(1);
    assert.equal(done.value, 'timeout', `${os}: a slow sheet is not a grown-up no`);
    const text = track(external.shareExternal({ message: 'hi' }));
    await settle();
    await tick(external.SHARE_SHEET_WAIT_MS);
    assert.equal(text.done, true);
    assert.equal(text.value, external.SHARE_TIMED_OUT, `${os}: a text sheet that never answered is a timeout, not a cancel`);
  }
});

test('iOS tells a real share from a cancel: "shared" only on sharedAction, "closed" on a cancel (no Shared! stamp)', async () => {
  const went = loadExternal({ sheet: 'closes', os: 'ios', iosAction: 'sharedAction' });
  const a = track(went.external.shareFileExternal('/private/var/tmp/AB.png', { mimeType: 'image/png' }, 'Autopia Ride Card'));
  await went.settle();
  assert.equal(a.value, 'shared');
  assert.equal(went.calls.share.length, 0, 'iOS goes through Share.share, which reports the action');
  assert.equal(named(went.calls.rnShare[0].url), 'file:///cache/share-card/*/Autopia-Ride-Card.png');
  const backedOut = loadExternal({ sheet: 'closes', os: 'ios', iosAction: 'dismissedAction' });
  const b = track(backedOut.external.shareFileExternal('/private/var/tmp/AB.png', { mimeType: 'image/png' }, 'Autopia Ride Card'));
  await backedOut.settle();
  assert.equal(b.value, 'closed', 'a cancel is never reported as shared');
  // Android never says which, so it stays "closed" (no stamp).
  const android = loadExternal({ sheet: 'closes', os: 'android' });
  const c = track(android.external.shareFileExternal('file:///tmp/a.png', undefined, 'Ride Photo'));
  await android.settle();
  assert.equal(c.value, 'closed');
  // Without a name, a bare iOS path still goes out as a file url.
  const bare = loadExternal({ sheet: 'closes', os: 'ios' });
  await bare.external.shareFileExternal('/private/var/tmp/x.png');
  assert.equal(bare.calls.rnShare[0].url, 'file:///private/var/tmp/x.png');
});

test('the ride card stamps "Shared!" only when the share went, never after a cancel', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'src/components/RideTracker/ShareableRideCard.tsx'), 'utf8');
  assert.match(code, /if \(outcome === 'shared'\) setShared\(true\);/);
  assert.doesNotMatch(code, /outcome === 'closed'\)\s*\{\s*setShared/);
});

test('the share sheet shows a readable file name, never the capture UUID', async () => {
  const { external, calls, settle } = loadExternal({ sheet: 'closes' });
  const done = track(external.shareFileExternal('file:///tmp/1ED163AE-B648-4C2B.png', { mimeType: 'image/png' }, 'Whack-a-Shark 460'));
  await settle();
  assert.equal(done.value, 'closed');
  assert.equal(calls.copy[0][0], 'file:///tmp/1ED163AE-B648-4C2B.png');
  assert.equal(named(calls.copy[0][1]), 'file:///cache/share-card/*/Whack-a-Shark-460.png');
  assert.equal(calls.share[0][0], calls.copy[0][1]);
  assert.equal(external.shareFileName('Space Mountain Ride Card', 'jpg'), 'Space-Mountain-Ride-Card.jpg');
  assert.equal(external.shareFileName("Pirates' Lair: Tom & Becky", 'png'), 'Pirates-Lair-Tom-Becky.png');
  assert.equal(external.shareFileName('***', 'png'), 'Theme-Park-Shark.png');
  // view-shot's bare iOS path is copied too.
  await external.shareFileExternal('/private/var/tmp/ABC.jpg', undefined, 'Ride Photo');
  assert.equal(calls.copy.at(-1)[0], 'file:///private/var/tmp/ABC.jpg');
  assert.equal(named(calls.copy.at(-1)[1]), 'file:///cache/share-card/*/Ride-Photo.jpg');
  assert.equal(calls.share.at(-1)[0], calls.copy.at(-1)[1]);
  // No name: the capture is shared as is.
  await external.shareFileExternal('file:///tmp/x.png');
  assert.equal(calls.share.at(-1)[0], 'file:///tmp/x.png');
});

test('each share gets its own copy; old copies are cleared, but never one a sheet still holds after a timeout', async () => {
  const { external, calls, dirs, pending, tick, settle } = loadExternal({ sheet: 'manual' });
  const first = track(external.shareFileExternal('file:///tmp/a.png', undefined, 'Whack-a-Shark 1'));
  await settle();
  await tick(external.SHARE_SHEET_WAIT_MS);
  assert.equal(first.value, 'timeout', 'the button comes back');
  const firstFile = calls.share[0][0];
  const firstSlot = /share-card\/([^/]+)\//.exec(firstFile)[1];
  // The first sheet is still up: a second share must not pull its file out from under it.
  const second = track(external.shareFileExternal('file:///tmp/b.png', undefined, 'Whack-a-Shark 2'));
  await settle();
  const secondFile = calls.share[1][0];
  assert.notEqual(secondFile, firstFile);
  assert.ok(dirs.has(firstSlot), 'the open sheet keeps its file');
  assert.equal(calls.del.length, 0);
  // Both sheets close; the next share clears both old copies and keeps only its own.
  pending.splice(0).forEach(close => close());
  await settle();
  assert.equal(second.value, 'closed');
  const third = track(external.shareFileExternal('file:///tmp/c.png', undefined, 'Whack-a-Shark 3'));
  await settle();
  assert.equal(calls.del.length, 2, 'both finished copies are cleared, so copies never pile up');
  assert.equal(dirs.size, 1);
  pending.splice(0).forEach(close => close());
  await settle();
  assert.equal(third.value, 'closed');
});

test('Share Studio cards (iOS Share.share with a file url) get a readable name too; links and text are untouched', async () => {
  const { external, calls, settle } = loadExternal({ sheet: 'closes', os: 'ios' });
  const flex = track(external.shareExternal({ url: '/private/var/tmp/4F1C-UUID.jpg' }, undefined, 'Golden Churro'));
  await settle();
  assert.deepEqual(flex.value, { action: 'sharedAction' });
  assert.equal(calls.copy.at(-1)[0], 'file:///private/var/tmp/4F1C-UUID.jpg');
  assert.equal(named(calls.copy.at(-1)[1]), 'file:///cache/share-card/*/Golden-Churro.jpg');
  assert.equal(calls.rnShare.at(-1).url, calls.copy.at(-1)[1]);
  const copies = calls.copy.length;
  await external.shareExternal({ message: 'hi', url: 'https://themeparkshark.com/x' }, undefined, 'Article');
  assert.equal(calls.rnShare.at(-1).url, 'https://themeparkshark.com/x', 'a web link is shared as is');
  await external.shareExternal({ message: 'hi' });
  assert.equal(calls.copy.length, copies, 'nothing copied for a link or text');
});

test('a grown-up no shares nothing and copies nothing', async () => {
  const { external, calls, settle } = loadExternal({ gateYes: false, sheet: 'closes' });
  const done = track(external.shareFileExternal('file:///tmp/a.png', undefined, 'Whack-a-Shark 1'));
  await settle();
  assert.equal(done.value, 'declined');
  assert.equal(calls.share.length, 0);
  assert.equal(calls.rnShare.length, 0);
});

test('the named copy is made while the grown-up answers, and a no leaves nothing held open', async () => {
  const clock = fakeClock();
  const calls = { copy: [], del: [] };
  const dirs = new Set();
  let answer;
  const external = loadTs('src/services/external.ts', {
    'expo-file-system': {
      cacheDirectory: 'file:///cache/',
      readDirectoryAsync: async () => [...dirs],
      deleteAsync: async path => { calls.del.push(path); dirs.delete(path.replace('file:///cache/share-card/', '').replace(/\/$/, '')); },
      makeDirectoryAsync: async dir => { dirs.add(dir.replace('file:///cache/share-card/', '').replace(/\/$/, '')); },
      copyAsync: async ({ from, to }) => { calls.copy.push([from, to]); },
    },
    'expo-sharing': { isAvailableAsync: async () => true, shareAsync: async () => undefined },
    'expo-web-browser': { openBrowserAsync: async () => undefined },
    'react-native': {
      Platform: { OS: 'ios' }, Linking: {},
      Share: { sharedAction: 'sharedAction', dismissedAction: 'dismissedAction', share: async () => ({ action: 'dismissedAction' }) },
    },
    '../components/GrownUpGate': { askGrownUp: () => new Promise(resolve => { answer = resolve; }) },
  }, { setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  const settle = async () => { for (let k = 0; k < 12; k++) await new Promise(resolve => setImmediate(resolve)); };
  const no = track(external.shareFileExternal('file:///tmp/a.png', undefined, 'Ride Photo'));
  await settle();
  assert.equal(calls.copy.length, 1, 'the copy is ready before the grown-up answers');
  assert.equal(no.done, false);
  answer(false);
  await settle();
  assert.equal(no.value, 'declined');
  // The next share sweeps the declined copy: a no never pins a file.
  const flex = track(external.shareExternal({ url: '/private/var/tmp/b.jpg' }, undefined, 'Golden Churro'));
  await settle();
  assert.equal(calls.copy.length, 2, 'the flex card copy is made during the gate too');
  answer(true);
  await settle();
  assert.deepEqual(flex.value, { action: 'dismissedAction' });
  assert.equal(calls.del.length, 1, 'only the declined copy was cleared');
  assert.equal(dirs.size, 1);
});

test('the old-copy sweep runs after the copy, never between OK and the sheet', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'src/services/external.ts'), 'utf8');
  const body = code.slice(code.indexOf('async function namedShareCopy'), code.indexOf('async function sweepShareCopies'));
  assert.doesNotMatch(body, /await\s+FileSystem\.readDirectoryAsync/, 'no directory read on the share path');
  assert.match(body, /void sweepShareCopies\(root\)/);
  assert.ok(body.indexOf('liveShareDirs.add(slot)') < body.indexOf('makeDirectoryAsync'), 'the slot is held before it is made');
});

test('the ride card share sheets keep their buttons reachable: the backdrop and panel are not one big accessible element', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const file of ['src/screens/RideTracker/RideDetailScreen.tsx', 'src/screens/RideTracker/RideHistoryScreen.tsx']) {
    const code = fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8');
    assert.match(code, /style=\{\w+\.modalOverlay\} onPress=\{\(\) => set\w+\(null\)\} accessible=\{false\}>/, file);
    assert.match(code, /style=\{\w+\.modalContent\} onPress=\{\(\) => \{\}\} accessible=\{false\}>/, file);
    // A plain Pressable needs its own role and label; the kit's GameButton carries both from its label.
    assert.match(code, /style=\{\w+\.modalClose\} accessibilityRole="button" accessibilityLabel="Close">|<GameButton label="Close"[^\n]*style=\{\w+\.modalClose\} \/>/, file);
  }
});

test('useGameMusic: a mid-game Music off stops only this game\'s bed and never writes the app-wide Music setting', async () => {
  const rt = hooksRuntime();
  const calls = [];
  const auth = { value: { player: { enabled_music: true } } };
  const GameAudio = {
    init: async () => undefined,
    setMusicEnabled: v => calls.push(['setMusicEnabled', v]),
    music: {
      setAppMusicBridge: () => undefined,
      play: async (bed, fade) => { calls.push(['play', bed, fade]); },
      switchTo: async bed => { calls.push(['switchTo', bed]); },
      stop: ms => { calls.push(['stop', ms]); },
    },
  };
  const { useGameMusic } = loadTs('src/gamekit/audio/useGameMusic.ts', {
    react: rt.React,
    '../../context/AuthProvider': { AuthContext: auth },
    '../../context/MusicProvider': { MusicContext: { value: null } },
    './GameAudio': { GameAudio },
  });
  const Game = props => { useGameMusic(props.bed, { at: 'bar', enabled: props.enabled }); return null; };
  const game = rt.mount(Game, { bed: 'mm_loop_main', enabled: true });
  await rt.settle();
  assert.deepEqual(calls, [['play', 'mm_loop_main', 300]], 'the bed starts');
  calls.length = 0;
  // The game turns its music off mid-round: its bed fades out, and the app-wide setting is untouched.
  game.rerender({ bed: 'mm_loop_main', enabled: false });
  await rt.settle();
  assert.deepEqual(calls, [['stop', 400]]);
  // Back on: the bed starts fresh (not a switch on a stopped director).
  calls.length = 0;
  game.rerender({ bed: 'mm_loop_main', enabled: true });
  await rt.settle();
  assert.deepEqual(calls, [['play', 'mm_loop_main', 300]]);
  // A bed change while on is a musical switch, not a restart.
  calls.length = 0;
  game.rerender({ bed: 'mm_loop_fever', enabled: true });
  await rt.settle();
  assert.deepEqual(calls, [['switchTo', 'mm_loop_fever']]);
  // The player's Music setting off (from Settings) also stops the bed, still without writing the setting.
  calls.length = 0;
  auth.value = { player: { enabled_music: false } };
  game.rerender({ bed: 'mm_loop_fever', enabled: true });
  await rt.settle();
  assert.deepEqual(calls, [['stop', 400]]);
  calls.length = 0;
  game.unmount();
  assert.deepEqual(calls, [['stop', 400]], 'leaving the game fades its bed');
  assert.equal(calls.some(c => c[0] === 'setMusicEnabled'), false);
});

test('flex card art that is blocked or slow is replaced by its bundled fallback before the share captures, so no slot is ever blank', async () => {
  const clock = fakeClock();
  const rt = hooksRuntime();
  const ctx = { value: null };
  const art = loadTs('src/share/FlexArtwork.tsx', {
    react: { ...rt.React, createContext: () => ctx, useMemo: (fn) => fn() },
    'react/jsx-runtime': { jsx: el, jsxs: el, Fragment: 'Fragment' },
    'expo-image': { Image: 'Image' },
  }, { setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  const ready = [];
  // The readiness the card uses (onReadyChange -> the share's readyRef).
  const wanted = new Set(); const done = new Set();
  ctx.value = { register: k => wanted.add(k), ready: k => { done.add(k); ready.push(k); } };
  const images = tree => find(tree, n => n.type === 'Image');
  const shown = tree => images(tree).filter(n => ![].concat(n.props.style).some(s => s && s.opacity === 0));
  const settle = rt.settle;

  // 1. A coin url that never answers (throttled): at FLEX_ART_FALLBACK_MS the plain coin takes the slot.
  const slow = rt.mount(art.FlexArtwork, { art: 'https://cdn.example/slow-coin.png', fallback: 7, style: { width: 10 } });
  await settle();
  assert.equal(shown(slow.tree).length, 0, 'nothing drawn yet, and the card is not ready');
  await clock.tick(art.FLEX_ART_FALLBACK_MS - 1, settle);
  assert.equal(shown(slow.tree).length, 0);
  await clock.tick(1, settle);
  const fb = shown(slow.tree);
  assert.equal(fb.length, 1);
  assert.equal(fb[0].props.source, 7, 'the bundled Ride Coin');
  fb[0].props.onLoad();
  assert.equal(done.size, 1, 'the slot counts as drawn once the fallback is on screen');

  // 2. A coin url that fails (blocked): the fallback at once.
  const blocked = rt.mount(art.FlexArtwork, { art: 'https://blocked.example/coin.png', fallback: 7, style: { width: 10 } });
  await settle();
  images(blocked.tree)[0].props.onError();
  await settle();
  assert.equal(shown(blocked.tree)[0].props.source, 7);

  // 3. No art at all (a park day with no coin art): the fallback from the first frame.
  const none = rt.mount(art.FlexArtwork, { art: null, fallback: 7, style: { width: 10 } });
  await settle();
  assert.equal(shown(none.tree)[0].props.source, 7);

  // The share waits past the fallback swap before it captures.
  const host = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '..', 'src/share/ShareStudioHost.tsx'), 'utf8');
  assert.match(host, /FLEX_CAPTURE_WAIT_MS = FLEX_ART_FALLBACK_MS \+ 2000/);
});
