'use strict';
/**
 * Ride challenge, core loop wave (blueprint 5.3, 5.13 and the must-fix ledger):
 * PLAY! to the win card as one clear, kind path that never freezes, never
 * dead-ends at 0 Tickets, never deals trivia to a child who cannot read,
 * keeps VIP perks without upselling anyone, and ends by pointing at the next
 * coin. Traps first: the PLAY RIDE freeze (must-fix 1) and the team welcome
 * dead end (must-fix 2).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const memoryStore = () => {
  const data = new Map();
  return {
    data,
    getItem: async key => (data.has(key) ? data.get(key) : null),
    setItem: async (key, value) => { data.set(key, String(value)); },
    removeItem: async key => { data.delete(key); },
  };
};

/** A tiny hook renderer for the modal layer hooks (same idea as map-attention.test.cjs). */
function layerHarness() {
  let slots = [];
  let index = 0, dirty = false, pending = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    createContext: value => ({ value }),
    useContext: () => false,
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
  const M = loadTs('src/ui/modalLayers.ts', { react }, {
    setTimeout: (fn, ms) => { const t = { fn, ms, live: true }; timers.push(t); return t; },
    clearTimeout: t => { if (t) t.live = false; },
  });
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
    return { get value() { return out; }, render };
  }
  return { M, mount };
}

/* ---------- Trap 1: the PLAY RIDE freeze (must-fix 1) ---------- */

test('the challenge card and the win card both join the native modal layers and free them only on native dismiss', () => {
  const challenge = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(challenge, /useNativeModalLayer\(open === true && flowState !== 'postwin' && !!redeemable, 'wait'\)/);
  assert.match(challenge, /isVisible=\{challengeLayer\.present\}/);
  assert.match(challenge, /onModalHide=\{\(\) => \{ setChallengeModalHidden\(true\); challengeLayer\.onDismissed\(\); \}\}/);
  assert.doesNotMatch(challenge, /isVisible=\{showModal\}/, 'never a bare visible flag that ignores the layers');
  const win = read('src/components/PostWinRewardsModal.tsx');
  assert.match(win, /useNativeModalLayer\(visible, 'wait'\)/);
  assert.match(win, /isVisible=\{layer\.present\}/);
  assert.match(win, /onModalHide=\{\(\) => \{\n\s+layer\.onDismissed\(\);/);
});

test('PLAY! after a swipe-closed sheet: the card waits, opens, wins, and the win card waits for it, 20 out of 20', () => {
  const h = layerHarness();
  h.M.modalLayers.reset();
  let sheet = false, card = false, win = false;
  const sheetLayer = h.mount(() => h.M.useNativeModalLayer(sheet, 'show'));
  const cardLayer = h.mount(() => h.M.useNativeModalLayer(card, 'wait'));
  const winLayer = h.mount(() => h.M.useNativeModalLayer(win, 'wait'));
  const all = () => { sheetLayer.render(); cardLayer.render(); winLayer.render(); };
  for (let run = 0; run < 20; run += 1) {
    sheet = true; all();
    sheet = false; all();                          // swiped closed; UIKit still dismissing
    for (let tap = 0; tap < 4; tap += 1) { card = true; all(); }
    assert.equal(cardLayer.value.present, false, `run ${run}: never into a half-dismissed sheet`);
    sheetLayer.value.onDismissed(); all();
    assert.equal(cardLayer.value.present, true, `run ${run}: the challenge card opens`);
    // A win: the card hides, the win card wants to show but waits for UIKit to finish the card.
    card = false; win = true; all();
    assert.equal(winLayer.value.present, false, `run ${run}: the win card never presents into the closing card`);
    cardLayer.value.onDismissed(); all();
    assert.equal(winLayer.value.present, true, `run ${run}: the win card opens`);
    win = false; all();
    winLayer.value.onDismissed(); all();
    assert.equal(h.M.modalLayers.count(), 0, `run ${run}: nothing left behind to swallow taps`);
  }
});

/* ---------- Trap 2: the team welcome dead end (must-fix 2) ---------- */

const teamOffer = () => loadTs('src/components/rewards/teamOffer.ts', {
  '@react-native-async-storage/async-storage': { default: memoryStore(), __esModule: true },
});

test('LET\'S GO always takes the player somewhere: back, home, or on to the shelf', () => {
  const { teamExit } = teamOffer();
  // From Profile (with its refresh callback): back to Profile, the old dead end.
  assert.deepEqual({ ...teamExit({ onTeamSelected: () => undefined }, true) }, { kind: 'back' });
  assert.deepEqual({ ...teamExit({}, true) }, { kind: 'back' });
  assert.deepEqual({ ...teamExit({ isOnboarding: true }, true) }, { kind: 'reset' });
  assert.deepEqual({ ...teamExit(undefined, false) }, { kind: 'reset' }, 'nowhere to go back to: home');
  const next = teamExit({ firstCoin: true, next: { name: 'Park', params: { park: 8 } } }, true);
  assert.equal(next.kind, 'next');
  assert.equal(next.name, 'Park');
});

test('the team screen runs the callback and then always leaves; the first-coin step has a Later button', () => {
  const screen = read('src/screens/GymBattle/TeamSelectionScreen.tsx');
  const finish = screen.slice(screen.indexOf('const finish = () => {'), screen.indexOf('const firstCoin ='));
  assert.match(finish, /onTeamSelected\?\.\(\)/);
  assert.match(finish, /leave\(\);/, 'the callback never replaces the way out');
  assert.doesNotMatch(finish, /else navigation\?\.goBack/, 'no if/else that skips leaving');
  assert.match(screen, /onPress=\{leave\} accessibilityRole="button" accessibilityLabel="Close"/);
  assert.match(screen, /\{firstCoin && \(/);
  assert.match(screen, />LATER</);
  assert.doesNotMatch(screen, /bosses/i, 'no promise of a switched-off feature');
});
