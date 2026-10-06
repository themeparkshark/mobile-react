'use strict';
/**
 * Secret Shop freeze (Dustin, October 2026): heart in the try-on, swipe it away, frozen.
 * The first heart asked "Want a heads-up?" in a second sibling <Modal> while the try-on
 * <Modal> was up; iOS refused to present it, nothing showed, and the orphan blocked every
 * tap after the sheet left. Root fix: one full-screen layer at a time (src/ui/modalLayers.ts).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const src = file => fs.readFileSync(path.join(root, file), 'utf8');
const { modalLayers } = loadTs('src/ui/modalLayers.ts', {
  react: { createContext: v => ({ v }), useContext: () => false, useEffect() {}, useState: v => [v, () => {}], useSyncExternalStore: (s, get) => get() },
});

test('a dialog opened while a sheet is up waits, and shows the moment the sheet is gone', () => {
  modalLayers.reset();
  const sheet = modalLayers.add();          // try-on sheet (shows at once)
  const ask = modalLayers.add();            // "Want a heads-up?" asks to open
  assert.equal(modalLayers.isFront(ask), false, 'never a second sibling modal over the sheet');
  modalLayers.remove(sheet);                // swiped away, even mid-action
  assert.equal(modalLayers.isFront(ask), true, 'the ask presents after the sheet, so nothing is orphaned');
  modalLayers.remove(ask);
  assert.equal(modalLayers.count(), 0, 'nothing is left holding the screen');
});

test('layers queue in order and a removed layer never lingers', () => {
  modalLayers.reset();
  const a = modalLayers.add(); const b = modalLayers.add(); const c = modalLayers.add();
  modalLayers.remove(b);
  assert.equal(modalLayers.isFront(c), false);
  modalLayers.remove(a);
  assert.equal(modalLayers.isFront(c), true);
  modalLayers.remove(c); modalLayers.remove(c);
  assert.equal(modalLayers.count(), 0, 'removing twice is harmless');
});

test('every shop sheet registers as a layer and marks its children nested', () => {
  for (const file of ['src/screens/StoreScreen/TryOnSheet.tsx', 'src/screens/StoreScreen/WishlistSheet.tsx', 'src/screens/StoreScreen/SetCompleteReveal.tsx']) {
    const code = src(file);
    assert.match(code, /useModalLayer\([^)]*'show'\)/, `${file} registers`);
    // `(?:=>|[^>])*`: a prop may hold an arrow handler (the reveal's onRequestClose={() => leave(false)}).
    assert.match(code, /<Modal\b(?:=>|[^>])*>\s*<ModalLayerContext\.Provider value>/, `${file} marks what it presents as nested`);
  }
});

test('dialogs and the grown-up gate wait their turn instead of stacking', () => {
  const dialog = src('src/ui/GameDialog.tsx');
  assert.match(dialog, /useModalLayer\(visible \|\| mounted, 'wait'\)/);
  assert.match(dialog, /const shown = visible && front;/);
  assert.match(dialog, /if \(shown\) \{/, 'the dialog opens only once it is the front layer');
  const gate = src('src/components/GrownUpGate.tsx');
  assert.match(gate, /const front = useModalLayer\(!!req, 'wait'\);\s*if \(!req \|\| !front\) return null;/);
});

test('no Modal in the shop bypasses the layers', () => {
  const dir = path.join(root, 'src/screens/StoreScreen');
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.tsx'))) {
    const code = fs.readFileSync(path.join(dir, file), 'utf8');
    if (!/<Modal\b/.test(code)) continue;
    assert.match(code, /useModalLayer\(/, `${file} has a <Modal> but no layer`);
  }
});

test('the first heart asks about alerts through a waiting dialog, never a modal over the try-on', () => {
  const shelves = src('src/screens/StoreScreen/ShopShelves.tsx');
  assert.match(shelves, /\{askAlerts && \(\s*<GameDialog visible title="Want a heads-up\?"/, 'GameDialog (which waits), not a raw Modal');
});
