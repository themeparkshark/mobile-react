'use strict';
// Fin-ister Nights map FX, round 3: chips clear of the right-rail HUD, full names on two lines,
// half-visible facades stay, the off-screen player shark hides, and the scareactor redo's rows.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const fb = loadTs('src/components/map/fright/frightBudget.ts');
const fa = loadTs('src/components/map/fright/frightAssets.ts');
const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// iPhone SE: 375 wide; the map's rail (compass, chest) sits at the right edge.
const SE_W = 375;
const RAIL = { x: 305, y: 120, width: 54, height: 120 };

test('chips keep clear of the right-rail HUD when they sit beside it', () => {
  // A chip centered at x 300, 140 wide, top 150 (beside the rail): its right edge stops at 305 - 6.
  const shift = fb.chipShiftClear(300, 150, 140, 30, SE_W, [RAIL]);
  assert.equal(300 + shift + 70, 299);
  // Below the rail: only the 12 pt screen margin applies.
  assert.equal(fb.chipShiftClear(300, 400, 140, 30, SE_W, [RAIL]), fb.chipShift(300, 140, SE_W));
  // A HUD on the left (a joystick) lifts the left edge.
  const joy = { x: 10, y: 500, width: 80, height: 80 };
  const left = fb.chipShiftClear(60, 520, 100, 30, SE_W, [joy]);
  assert.equal(60 + left - 50, 96);
  // No room between the HUDs: fall back to the plain screen clamp.
  const wide = { x: 40, y: 140, width: 300, height: 40 };
  assert.equal(fb.chipShiftClear(200, 150, 160, 30, SE_W, [wide]), fb.chipShift(200, 160, SE_W));
  // Unknown chip y: avoid the rail anyway.
  assert.ok(fb.chipShiftClear(300, Number.NaN, 140, 30, SE_W, [RAIL]) < fb.chipShift(300, 140, SE_W));
  assert.equal(fb.chipShiftClear(200, 150, 100, 30, SE_W, []), 0);
});

test('chip text: the full name on up to two lines, with a small detail line; never cut at normal widths', () => {
  const cabin = { name: 'The Cabin with the Creaky Book', status: 'CLOSED', posted_minutes: 50 };
  assert.deepEqual({ ...fb.hauntChipParts(cabin) }, { name: 'The Cabin with the Creaky Book', detail: 'Closed' });
  assert.deepEqual({ ...fb.hauntChipParts({ name: 'The Robot City', status: 'OPERATING', posted_minutes: 25 }) },
    { name: 'The Robot City', detail: '25 min' });
  assert.deepEqual({ ...fb.hauntChipParts({ name: 'The Robot City', status: null, posted_minutes: null }) }, { name: 'The Robot City', detail: null });
  assert.equal(fb.hauntChipParts({ name: 'X', status: 'OPERATING', posted_minutes: 25 }, true).detail, null, 'survived: name only');
  const sprites = read('src/components/map/fright/FrightSprites.tsx');
  assert.match(sprites, /<Text style=\{styles\.chipText\} numberOfLines=\{2\}>\{label\}<\/Text>/);
  assert.match(sprites, /<Text style=\{styles\.chipDetail\} numberOfLines=\{1\}>\{chipDetail\}<\/Text>/);
  assert.doesNotMatch(sprites, /numberOfLines=\{1\}>\{label\}/, 'the name never ellipsizes on one line');
  // Two lines of the narrow font hold every haunt name in the art kit at the chip's width.
  const longest = 'The Cabin with the Creaky Book'.length;
  assert.ok(longest * 5.4 < 2 * (168 - 14), 'fits in two lines at 10.5 pt');
});

test('facades stay while half visible (40 pt slack); farther off they hide (corner-parking guard)', () => {
  const sources = read('src/components/map/fright/FrightMapSources.tsx');
  assert.match(sources, /export const ON_SCREEN_SLACK = 40;/);
  const c = { latitude: 28.4787, longitude: -81.4686 };
  const ppm = 2 ** 17 * 512 / (40075016.686 * Math.cos(c.latitude * Math.PI / 180));
  const at = pts => ({ latitude: c.latitude, longitude: c.longitude + (pts / ppm) / (111320 * Math.cos(c.latitude * Math.PI / 180)) });
  assert.equal(fb.onScreen(at(375 / 2 + 30), c, 17, 0, 375, 667, 40), true, '30 pt past the right edge: still drawn');
  assert.equal(fb.onScreen(at(375 / 2 + 60), c, 17, 0, 375, 667, 40), false, '60 pt past: hidden');
});

test('Map hides the panned-away player shark while it is off screen (no corner shark; the declutter owns it)', () => {
  const map = read('src/components/Map.tsx');
  assert.match(map, /<View style=\{\{ opacity: focusedOnPlayer \|\| !playerOnScreen \? 0 : 1 \}\}>\{playerShark\}<\/View>/);
  assert.match(map, /<FrightMapSources input=\{fright\} zoom=\{cameraZoom\} mapRef=\{mapViewRef\} hud=\{rail\} \/>/);
});

test('scareactor redo sheets (rows idle, lurk, scare, slide) play their scare row as the jump', () => {
  assert.deepEqual([...fa.critterRows({ rows: ['idle', 'lurk', 'scare', 'slide'] })], [0, 1, 2]);
  assert.deepEqual([...fa.critterRows({ rows: ['idle', 'lurk', 'jump'] })], [0, 1, 2]);
  assert.deepEqual([...fa.critterRows({ rows: ['idle'] })], [0, -1, -1]);
  const pilot = { sheet: 'x', static: 'y', frame: [128, 128], rows: ['idle', 'lurk', 'scare', 'slide'], frames_per_row: 10, fps: 10 };
  assert.ok(fa.critterAsset({ critters: { 'sa-jester': pilot } }, 'sa-jester'), 'a 4-row sheet parses');
});

test('image cache: unused decoded images are disposed after a minute; in-use ones never', async () => {
  let now = 0;
  const disposed = [];
  const cache = fa.createImageCache(url => Promise.resolve({ url }), () => now, img => disposed.push(img.url));
  cache.retain('a');
  cache.get('a');
  cache.retain('b');
  cache.get('b');
  await new Promise(r => setTimeout(r, 0));
  assert.equal(cache.size(), 2);
  cache.release('b');
  now = fa.IMAGE_IDLE_MS - 1;
  assert.equal(cache.sweep(), 0, 'not idle long enough');
  now = fa.IMAGE_IDLE_MS + 1;
  assert.equal(cache.sweep(), 1);
  assert.deepEqual(disposed, ['b']);
  assert.equal(cache.peek('a').url, 'a', 'a retained image stays');
  cache.retain('b');
  assert.equal(cache.get('b'), null, 'reloads on next use');
  assert.equal(cache.loads(), 3);
  const hook = read('src/components/map/fright/useFrightImage.ts');
  assert.match(hook, /cache\.retain\(url\);[\s\S]*return \(\) => cache\.release\(url\);/);
  assert.match(hook, /image => image\.dispose\?\.\(\)/);
});
