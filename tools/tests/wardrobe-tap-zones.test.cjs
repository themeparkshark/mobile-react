'use strict';
/**
 * Tapping the shark picks the worn item under the finger. Shoulder pals (neck
 * items perched behind the head, paper x 0.65-0.81, y 0.28-0.45) used to hit
 * no zone up top and the right-fin hand zone lower down.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const { slotAtPoint } = loadTs('src/helpers/wardrobe.ts');
const item = (id) => ({ id, name: `Item ${id}`, paper_url: `paper-${id}` });
const SHOULDER = [0.73, 0.36];

test('a shoulder pal is tapped as the neck item', () => {
  assert.equal(slotAtPoint(...SHOULDER, { neck_item: item(1), hand_item: item(2) }), 'neck_item');
});

test('with no neck item, the shoulder area falls through to the hand item', () => {
  assert.equal(slotAtPoint(...SHOULDER, { neck_item: null, hand_item: item(2) }), 'hand_item');
});

test('hats still win on the head, the right fin is still the hand', () => {
  const all = { head_item: item(3), neck_item: item(1), hand_item: item(2) };
  assert.equal(slotAtPoint(0.62, 0.14, all), 'head_item');
  assert.equal(slotAtPoint(0.70, 0.27, all), 'head_item', 'head wins where it overlaps the shoulder zone');
  assert.equal(slotAtPoint(0.78, 0.55, { hand_item: item(2) }), 'hand_item');
  assert.equal(slotAtPoint(0.78, 0.55, all), 'hand_item');
});

test('nothing worn under the finger is null', () => {
  assert.equal(slotAtPoint(...SHOULDER, { neck_item: null, hand_item: null }), null);
  assert.equal(slotAtPoint(0.5, 0.5, {}), null);
  assert.equal(slotAtPoint(0.5, 0.5, null), null);
});

test('Playercard resolves taps through the shared helper', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/components/Playercard.tsx'), 'utf8');
  assert.match(src, /slotAtPoint\(xPct, yPct, inventory\)/);
  assert.doesNotMatch(src, /const SLOT_ZONES/);
});
