'use strict';
// Intro rev 2 (live test feedback): opaque modal, safe areas, Skip corner, copy band, bottom band, queued park tip.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const tut = loadTs('src/services/fright/tutorial.ts');
const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const DEVICES = {
  'iPhone 16 Pro (Dynamic Island)': { width: 402, height: 874, insetTop: 62, insetBottom: 34 },
  'iPhone 15 Pro Max': { width: 430, height: 932, insetTop: 59, insetBottom: 34 },
  'iPhone SE': { width: 375, height: 667, insetTop: 20, insetBottom: 0 },
};

test('the card sits below the island/status bar and above the dots, Next and home indicator on every size', () => {
  for (const [name, d] of Object.entries(DEVICES)) {
    const l = tut.cardLayout(d);
    assert.ok(l.top >= d.insetTop + 44, `${name}: card clears the safe top and the Skip bar`);
    assert.ok(l.top + l.cardHeight <= d.height - l.bottomBand, `${name}: card ends above the bottom band`);
    assert.ok(l.cardWidth <= d.width - 40, `${name}: 20 pt gutters`);
    assert.equal(Math.round(l.cardHeight / l.cardWidth * 10) / 10, 1.5, `${name}: the hero keeps 2:3`);
    assert.ok(l.titleSize >= 20 && l.lineSize >= 14, `${name}: readable type (${l.titleSize}/${l.lineSize})`);
  }
});

test('copy lives in the clear sky band of the hero, clear of the moon, stars and characters', () => {
  assert.ok(tut.HERO_COPY_BAND.top >= 0.3, 'below the moon and the top stars (the lowest star is at 0.28)');
  assert.ok(tut.HERO_COPY_BAND.bottom <= 0.48, 'above the shark (head top at 0.49)');
});

test('the intro is a full-screen opaque modal with Skip in the safe top-right corner on its own backing', () => {
  const src = read('src/components/fright/tutorial/FrightTutorial.tsx');
  assert.match(src, /<Modal visible/);
  assert.match(src, /statusBarTranslucent/);
  assert.match(src, /useSafeAreaInsets/);
  assert.match(src, /top: insets\.top \+ 6/);
  assert.match(src, /skip: \{[^}]*backgroundColor: NIGHT\.midnight/);
  assert.match(src, /paddingBottom: insets\.bottom \+ 14/);
  assert.match(src, /LinearGradient colors=\{\[NIGHT\.ink, NIGHT\.midnight, NIGHT\.haunt\]\}/, 'opaque night sky, not a dim scrim');
  assert.doesNotMatch(src, /rgba\(30,24,70,0\.9\)/, 'the old see-through scrim is gone');
  assert.doesNotMatch(src, /GameIcon/, 'no generic sparkle badge: the Deep Lantern art lights up');
  assert.match(src, /require\('\.\.\/art\/lantern\.webp'\)/);
});

test('the app park tip waits while the Fin-ister intro is up', () => {
  const src = read('src/screens/ExploreScreen.tsx');
  assert.match(src, /dialogOpen: [^\n]*!!frightEngine\.tutorial/);
});

test('pill uses the short mode name so the haunt count never truncates', () => {
  const src = read('src/components/fright/FrightPill.tsx');
  assert.match(src, /shortTitle\(title\)/);
  assert.match(src, /replace\(\/\\s\+Nights\?\$\/i, ''\)/);
});

test('each tutorial card has its own subject art on the shared night scene', () => {
  const src = read('src/components/fright/tutorial/FrightTutorial.tsx');
  for (const key of ['haunts', 'rank', 'reefs', 'marquee', 'lantern']) assert.match(src, new RegExp(`${key}: \\{ kind:`));
  assert.match(src, /SUBJECT_BAND = \{ top: 0\.5, bottom: 0\.84 \}/);
  assert.match(src, /RadialGradient/, 'the lantern glow is soft, never a flat disc');
});
