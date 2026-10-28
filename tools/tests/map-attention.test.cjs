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

