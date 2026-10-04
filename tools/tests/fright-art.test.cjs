const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./helpers/fright-fixtures.cjs');

const art = load('art');
const root = path.resolve(__dirname, '../..');
const U = name => `https://cdn.example.test/fright/card/${name}`;

test('art: tonight assets.card file names map to the art set; non-URLs are ignored', () => {
  const set = art.artFromAssets({ 'header-title.webp': U('header-title.webp'), 'header-blank.webp': U('header-blank.webp'),
    'recap-bg.webp': U('recap-bg.webp'), 'tutorial-hero.webp': U('tutorial-hero.webp'), 'frame-gold.webp': U('frame-gold.webp'),
    'frame-silver.webp': null, 'frame-glow.webp': 'not a url' });
  assert.equal(set.title, U('header-title.webp'));
  assert.equal(set.recapBg, U('recap-bg.webp'));
  assert.equal(set.tutorial, U('tutorial-hero.webp'));
  assert.equal(set.frames['frame-gold'], U('frame-gold.webp'));
  assert.equal(set.frames['frame-silver'], undefined);
  assert.equal(set.frames['frame-glow'], undefined);
  assert.equal(Object.keys(art.artFromAssets(null)).length, 0);
});

test('art: card art merges in; known URLs are never wiped by nulls', () => {
  let set = art.mergeArt(art.NO_ART, art.artFromAssets({ 'recap-bg.webp': U('recap-bg.webp') }));
  set = art.mergeArt(set, art.artFromCard({ card: U('t'), chip: U('chip'), recap_bg: null, frames: { 'frame-glow': U('g') } }));
  assert.equal(set.recapBg, U('recap-bg.webp'));
  assert.equal(set.chip, U('chip'));
  assert.equal(set.frames['frame-glow'], U('g'));
});

test('Deep Lantern frames: gold for Ten-in-One, glow when completed, locked when empty, silver otherwise', () => {
  const base = { ten_in_one: false, completed: false, haunts_done: 3, pins_earned: 1, case_files_found: 2 };
  assert.equal(art.frameFor({ ...base, ten_in_one: true, completed: true }), 'frame-gold');
  assert.equal(art.frameFor({ ...base, completed: true }), 'frame-glow');
  assert.equal(art.frameFor(base), 'frame-silver');
  assert.equal(art.frameFor({ ...base, haunts_done: 0, pins_earned: 0, case_files_found: 0 }), 'frame-locked');
});

test('pins: pin_art image when earned, the locked silhouette otherwise, null draws the fallback', () => {
  const pinArt = { image: U('pin.webp'), locked: U('pin-locked.webp') };
  assert.equal(art.pinImage({ earned: true, pin_art: pinArt }).uri, U('pin.webp'));
  assert.equal(art.pinImage({ earned: false, pin_art: pinArt }).uri, U('pin-locked.webp'));
  assert.equal(art.pinImage({ earned: false, pin_art: pinArt }).earned, false);
  assert.equal(art.pinImage({ earned: false, pin_art: null }).uri, null);
  assert.equal(art.pinImage({ earned: true, pin_art: null, pin: { image: U('item.webp'), earned_on: 'x' } }).uri, U('item.webp'));
});

test('no "35 Case Files" assumption anywhere (the deck is 36: 1991 to 2026); no wardrobe promise in copy', () => {
  const trivia = JSON.parse(fs.readFileSync(path.join(root, 'src/services/fright/content/trivia.json'), 'utf8'));
  const deck = trivia.find(q => q.slug === 'lore-deck-size');
  if (deck) assert.equal(deck.choices[deck.correct_index], '36');
  const dirs = ['src/components/fright', 'src/services/fright'];
  const walk = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  for (const file of dirs.flatMap(walk)) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(text, /\b35 Case Files|of 35\b/, file);
    // The wardrobe line exists only in rewards.ts, gated on a real item (pin/cosmetic with item_id).
    if (file.endsWith('services/fright/rewards.ts')) continue;
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /added to your wardrobe/i, file);
  }
});
