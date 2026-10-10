'use strict';
/**
 * Golden Box (Dustin, Oct 10 2026): its odds table uses the player's own golden
 * odds (pins you have show 0% while you still need some), it only shows where
 * coin boxes are allowed, and the coin shortfall is for its own price.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');

const m = loadTs('src/screens/pins/pinsModel.ts');

const pin = (o = {}) => ({ item_id: 1, name: 'Mermaid', icon_url: 'x', owned: false, spares: 0, kind: 'mystery', tradable: true, ...o });
const golden = (o = {}) => ({
  price: 900, chaser_bp: 2500, no_duplicates: true, paid_allowed: true,
  odds: [{ pin_id: 11, is_chaser: false, chance_bp: 0 }, { pin_id: 12, is_chaser: false, chance_bp: 7500 }, { pin_id: 19, is_chaser: true, chance_bp: 2500 }],
  ...o,
});
const series = (o = {}) => ({
  open: true, paid_allowed: true, golden: golden(),
  pins: [pin({ item_id: 1, pin_id: 11, chance_bp: 4650, owned: true }), pin({ item_id: 2, pin_id: 12, chance_bp: 4650 }), pin({ item_id: 9, pin_id: 19, chance_bp: 700, is_chaser: true })],
  ...o,
});

test('golden odds replace the regular chances, and still add up to 100%', () => {
  const pins = m.goldenPins(series());
  assert.deepEqual(pins.map(p => p.chance_bp), [0, 7500, 2500]);
  assert.equal(pins.reduce((a, p) => a + p.chance_bp, 0), 10000);
  assert.equal(m.formatChance(pins[2].chance_bp), '25%');
  assert.equal(m.oneIn(2500), '1 in 4');
  // The regular box's own table is untouched.
  assert.equal(series().pins[1].chance_bp, 4650);
});

test('shown only when on for you, the series is open and coin boxes are allowed', () => {
  assert.equal(m.showGolden(series()), true);
  assert.equal(m.showGolden(series({ golden: null })), false);
  assert.equal(m.showGolden(series({ golden: undefined })), false);
  assert.equal(m.showGolden(series({ open: false })), false);
  assert.equal(m.showGolden(series({ paid_allowed: false })), false);
  assert.equal(m.showGolden(series({ golden: golden({ paid_allowed: false }) })), false);
});

test('coins short is for the Golden Box price', () => {
  assert.equal(m.goldenShort(series(), 1000), 0);
  assert.equal(m.goldenShort(series(), 900), 0);
  assert.equal(m.goldenShort(series(), 250), 650);
  assert.equal(m.goldenShort(series(), -5), 900);
});

test('the gold edge reaches every pin view: lanyard strap, My Pins, profile lanyard', () => {
  const fs = require('node:fs');
  const screen = fs.readFileSync('src/screens/pins/PinsScreen.tsx', 'utf8');
  assert.match(screen, /found: p\.found, golden: p\.golden/);
  assert.match(screen, /golden=\{p\.golden\}/);
  assert.match(fs.readFileSync('src/screens/pins/Lanyard.tsx', 'utf8'), /golden=\{pin\.golden\}/);
  // Golden opens send box=golden; a retried tap reuses the Golden Box's own request id.
  assert.match(screen, /box: 'golden' as const/);
});
