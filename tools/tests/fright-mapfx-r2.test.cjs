'use strict';
// Fin-ister Nights map FX, panel r2: feathered fog and round critter bases, chips inside the screen
// margin, the survived state (pin + check, no "1" bead, no wait), and the one-thunder arrival beat.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const fb = loadTs('src/components/map/fright/frightBudget.ts');
const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sprites = () => read('src/components/map/fright/FrightSprites.tsx');

test('chips clamp inside a 12 pt screen margin', () => {
  assert.equal(fb.CHIP_EDGE_MARGIN, 12);
  assert.equal(fb.chipShift(200, 120, 390), 0, 'fits: no shift');
  assert.equal(fb.chipShift(30, 120, 390), 42, 'left edge: slides right to x = 12');
  assert.equal(fb.chipShift(380, 120, 390), -62, 'right edge: its right side slides in to 378');
  assert.equal(fb.chipShift(-40, 100, 390), 102, 'facade just off the left edge');
  assert.equal(fb.chipShift(100, 500, 390), 95, 'wider than the screen: centered');
  assert.equal(fb.chipShift(Number.NaN, 100, 390), 0);
  assert.ok(fb.chipWidth('The Midnight Juke Joint · 75 min') <= 168);
  assert.ok(fb.chipWidth('The Robot City') < fb.chipWidth('The Robot City · 60 min'));
});

test('screen projection follows the map heading; the camera center is the player while following', () => {
  const c = { latitude: 28.4775, longitude: -81.4685 };
  const east = { latitude: 28.4775, longitude: -81.4675 }; // ~98 m east
  const ppm = 2 ** 17 * 512 / (40075016.686 * Math.cos(28.4775 * Math.PI / 180));
  assert.ok(Math.abs(fb.screenX(east, c, 17, 0, 390) - (195 + 97.9 * ppm)) < 3, 'north up: east is right');
  assert.ok(Math.abs(fb.screenX(east, c, 17, 90, 390) - 195) < 1, 'facing east: straight ahead');
  assert.ok(fb.screenX(east, c, 17, 180, 390) < 195, 'facing south: east is left');
  const bounds = { north: 28.479, south: 28.476, east: -81.467, west: -81.470 };
  const mid = { latitude: 28.4775, longitude: -81.4685 };
  assert.deepEqual({ ...fb.cameraCenter({ latitude: 28.4776, longitude: -81.4685 }, bounds) }, { latitude: 28.4776, longitude: -81.4685 });
  assert.deepEqual({ ...fb.cameraCenter({ latitude: 28.49, longitude: -81.4685 }, bounds) }, mid, 'panned away: the view center');
  assert.equal(fb.cameraCenter(null, null), null);
  const sources = read('src/components/map/fright/FrightMapSources.tsx');
  assert.match(sources, /chipX=\{chipCenter && chip \? screenX\(at, chipCenter, zoom, heading, screenW\) : null\}/);
  assert.match(sprites(), /chipShiftClear\(chipX, chipY \?\? Number\.NaN, chipSize\.w, chipSize\.h, screenW, huds\)/, 'clamped with the measured chip size');
  assert.match(sprites(), /transform: \[\{ translateX: shift \}\]/);
});

test('no hard fog edge: every mist is feathered to zero alpha inside its canvas; critter bases are round', () => {
  const src = sprites();
  assert.match(src, /export function SoftEllipse/);
  // Mist fades to zero at its edges by blur (a Skia Mask rendered nothing inside a MarkerView);
  // performer frames are feathered in the art itself (round 4).
  assert.match(src, /<BlurMask blur=\{Math\.max\(4, Math\.min\(w, h\) \* 0\.16\)\} style="normal" \/>/, 'fades to zero alpha');
  assert.doesNotMatch(src, /<SkImage image=\{mist\}/, 'no raw, rectangular mist sprite');
  assert.equal((src.match(/<FeatheredMist /g) ?? []).length, 2, 'reef mist and fog-thick props');
  assert.doesNotMatch(src, /x=\{-20\} y=\{PH - 70\} width=\{PW \+ 40\}/, 'never wider than its canvas (the canvas edge cut a hard band)');
  assert.match(src, /<SoftEllipse x=\{-fw \/ 4\} y=\{-fh \/ 2\}[^>]*>\s*<SheetFrame image=\{sheet\}/, 'critter sheet base masked round');
  assert.match(src, /<SoftEllipse x=\{6\} y=\{2\}[^>]*><SkImage image=\{still\}/, 'static critter base masked round');
  // Screen fog is repeating tiles over the whole screen: no edges to show.
  const layer = read('src/components/map/fright/FrightMapLayer.tsx');
  assert.match(layer, /tx="repeat" ty="repeat"/);
});

test('survived haunts: pin and check badge, no "1" bead, no posted wait', () => {
  assert.equal(fb.hauntChipLabel({ name: 'The Robot City', status: 'OPERATING', posted_minutes: 60 }, true), 'The Robot City');
  assert.notEqual(fb.hauntChipLabel({ name: 'The Robot City', status: 'OPERATING', posted_minutes: 60 }), 'The Robot City');
  const src = sprites();
  assert.doesNotMatch(src, /styles\.bead|beadDot|beadText/, 'the cryptic bead chip is gone');
  assert.match(src, /styles\.survived/);
  assert.match(src, /styles\.check/);
  const sources = read('src/components/map/fright/FrightMapSources.tsx');
  assert.match(sources, /survivedPin=\{assets\?\.event_pins\?\.\['ev-survived'\]\?\.\['256'\] \?\? null\}/);
  assert.match(sources, /hauntChipParts\(haunt, beads\[haunt\.key\] !== undefined\)/);
});

test('arrival beat: the haunts light over 1.5 s after the intro, and the map adds no second thunder', () => {
  const layer = read('src/components/map/fright/FrightMapLayer.tsx');
  assert.match(layer, /export const ARRIVAL_LIGHT_MS = 1500;/);
  assert.match(layer, /withTiming\(1, \{ duration: ARRIVAL_LIGHT_MS/);
  assert.match(layer, /const thunderOn = [^;]*input\.cinematic !== 'intro'/, 'the storm waits out the intro');
  const intro = layer.slice(layer.indexOf('// Season intro'), layer.indexOf('if (visible <= 0 || width <= 0'));
  assert.doesNotMatch(intro, /playThunder|flashAt/);
});

test('off-screen spots draw the hidden stand-in (MapLibre iOS parks off-screen MarkerViews in the top-left corner)', () => {
  const c = { latitude: 28.4787, longitude: -81.4686 };
  const south = { latitude: 28.4741, longitude: -81.46926 }; // ~510 m south: below the screen at zoom 16.3
  assert.equal(fb.onScreen(c, c, 16.3, 0, 402, 874), true);
  assert.equal(fb.onScreen(south, c, 16.3, 0, 402, 874), false);
  assert.equal(fb.onScreen(south, c, 16.3, 180, 402, 874), false, 'facing south it is above the screen');
  assert.equal(fb.onScreen(south, c, 14.5, 0, 402, 874), true, 'zoomed out it is on screen');
  assert.equal(fb.onScreen(south, null, 16.3, 0, 402, 874), true, 'unknown camera: draw');
  assert.ok(Math.abs(fb.screenY({ latitude: 28.4796, longitude: -81.4686 }, c, 17, 0, 874) - (437 - 100 * fb.screenY.length * 0 - 100 * (2 ** 17 * 512 / (40075016.686 * Math.cos(28.4787 * Math.PI / 180))))) < 3,
    'north of center is up');
  const sources = read('src/components/map/fright/FrightMapSources.tsx');
  assert.match(sources, /return !at \|\| onScreen\(at, chipCenter, zoom, heading, screenW, screenH, ON_SCREEN_SLACK\);/);
  assert.match(sources, /<ShowWhen box=\{(RING|CRITTER)_BOX\} on=\{encounterOnScreen && !!encounter\}>/);
  assert.match(sources, /setInterval\(read, BOUNDS_POLL_MS\)/); // 1.5 s, plus an immediate read on a GPS jump or resume
});
