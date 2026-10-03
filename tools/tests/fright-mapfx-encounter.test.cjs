'use strict';
// Fin-ister Nights map FX, tranche 2: the encounter (icon sheet, Chaos Hour,
// skid-fin sparks, tap), the Lagoon Glow-Down, and the art manifest geometry.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const fa = loadTs('src/components/map/fright/frightAssets.ts');
const fb = loadTs('src/components/map/fright/frightBudget.ts');
const budget = loadTs('src/components/map/alive/ambientBudget.ts');
const { USF_FIXTURE_ASSETS: assets } = loadTs('src/components/map/fright/preview/usfAssets.ts');
const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Chaos Hour: the server flag wins; without it the window times decide', () => {
  const late = { starts_at: '2026-10-09T23:08:00-04:00', ends_at: '2026-10-09T23:15:00-04:00' };
  const early = { starts_at: '2026-10-09T21:00:00-04:00', ends_at: '2026-10-09T21:07:00-04:00' };
  assert.equal(fa.encounterChaos(late), true);
  assert.equal(fa.encounterChaos(early), false);
  assert.equal(fa.encounterChaos({ ...early, chaos_hour: true }), true);
  assert.equal(fa.encounterChaos({ ...late, chaos_hour: false }), false);
  assert.equal(fa.encounterChaos({ ...late, chaos_hour: null }), true);
});

test('encounter frames: appear once on spawn, chaos for 20 s (full), then idle; Chaos Hour loops chaos', () => {
  const rows = [0, 1, 2];
  assert.deepEqual({ ...fa.encounterPose(100, 0.35, rows, 10, 10, false, true) }, { row: 1, frame: 3 }, 'appear');
  assert.equal(fa.encounterPose(100, 5, rows, 10, 10, false, true).row, 2, 'chaos after a spawn');
  assert.equal(fa.encounterPose(100, 25, rows, 10, 10, false, true).row, 0, 'then idle');
  assert.equal(fa.encounterPose(100, 300, rows, 10, 10, true, true).row, 2, 'Chaos Hour keeps the chaos loop');
  assert.equal(fa.encounterPose(100, 5, rows, 10, 10, true, false).row, 0, 'lite: appear and idle only');
  assert.equal(fa.encounterPose(100, 0.2, rows, 10, 10, true, false).row, 1, 'lite still appears');
  assert.equal(fa.encounterPose(100, 5, [0, -1, -1], 10, 10, true, true).row, 0, 'a sheet without the rows idles');
  for (let t = 0; t < 30; t += 0.07) {
    const p = fa.encounterPose(t, t, rows, 10, 10, true, true);
    assert.ok(p.frame >= 0 && p.frame < 10);
  }
});

test('skid-fin sparks: 1.5 s at 80 pt/s, 16 fps frames, faded at both ends', () => {
  const mid = fa.sparkPass(0.75, 8, 16);
  assert.equal(mid.d, 60);
  assert.equal(mid.frame, 12 % 8);
  assert.equal(mid.opacity, 1);
  assert.equal(fa.sparkPass(-0.1, 8, 16).opacity, 0);
  assert.equal(fa.sparkPass(1.5, 8, 16).opacity, 0);
  assert.ok(fa.sparkPass(0.05, 8, 16).opacity < 1);
  assert.equal(fa.SPARK_RUN_S, 1.5);
});

test('Lagoon Glow-Down: only during a performance; never a canvas prop or a moving-prop cost', () => {
  const start = Date.parse('2026-10-09T21:00:00-04:00');
  const times = ['2026-10-09T19:00:00-04:00', '2026-10-09T21:00:00-04:00'];
  assert.equal(fa.activeShowStart(times, start + 60_000, fb.SHOW_WINDOW_MS), start);
  assert.equal(fa.activeShowStart(times, start - 60_000, fb.SHOW_WINDOW_MS), null);
  assert.equal(fa.activeShowStart(null, start, fb.SHOW_WINDOW_MS), null);
  assert.deepEqual([...fb.spotProps({ props: ['lagoon-glow', 'eyes'] })], ['eyes', 'lagoon-glow']);
  assert.deepEqual([...fb.movingProps(['eyes', 'lagoon-glow'])], ['eyes']);
  assert.deepEqual([...fb.canvasProps(['eyes', 'lagoon-glow'])], ['eyes']);
  // The glow is the one fright sprite that plays alongside the show: still under the ceiling.
  for (const t of ['full', 'lite', 'calm']) {
    assert.ok(budget.ambientSpriteBudget(budget.ALIVE_CAPS[t]) <= budget.MAX_AMBIENT_SPRITES, t);
  }
  assert.equal(budget.ambientSpriteBudget(budget.ALIVE_CAPS.full), 119);
});

test('art manifest geometry: every critter is a 3-row sheet of 128 px frames; icons and sparks parse', () => {
  const slugs = Object.keys(assets.critters);
  assert.ok(slugs.length >= 11);
  for (const slug of slugs) {
    const a = fa.critterAsset(assets, slug);
    assert.ok(a, slug);
    assert.deepEqual([...a.frame], [128, 128], slug);
    assert.deepEqual([fa.rowIndex(a, 'idle'), fa.rowIndex(a, 'lurk'), fa.rowIndex(a, 'jump')], [0, 1, 2], slug);
    assert.equal(fa.sheetTiming(a).frames, 10, slug);
    assert.ok(a.static, `${slug} has a still frame for calm`);
  }
  for (const icon of ['chuckles', 'riptide']) {
    const a = fa.iconAsset(assets, icon);
    assert.deepEqual([...a.frame], [160, 160]);
    assert.deepEqual([fa.rowIndex(a, 'idle'), fa.rowIndex(a, 'appear'), fa.rowIndex(a, 'chaos-hour')], [0, 1, 2], icon);
  }
  assert.deepEqual([...assets.ambient['skid-fin-sparks'].frame], [192, 64]);
  assert.deepEqual([...assets.ambient['skid-fin-sparks'].rows], [8]);
  assert.deepEqual([...assets.ambient['lagoon-glow'].frame], [256, 128]);
});

test('wiring: the encounter critter is tappable, its ring takes no touches; sparks go through the 2-event gate', () => {
  const types = read('src/components/map/fright/types.ts');
  assert.match(types, /readonly onEncounterPress\?: \(encounterKey: string\) => void;/);
  const api = read('src/api/endpoints/fright/types.ts');
  assert.match(api, /readonly chaos_hour\?: boolean \| null;/);
  const sources = read('src/components/map/fright/FrightMapSources.tsx');
  assert.match(sources, /onPress=\{encounterOnScreen && encounter && onEncounterPress \? \(\) => onEncounterPress\(encounter\.key\) : undefined\}/, 'tappable only while shown');
  const ring = sources.slice(sources.indexOf('<Marker key="fe"'), sources.indexOf('</Marker>', sources.indexOf('<Marker key="fe"')));
  assert.ok(ring.length > 0, 'the ring marker exists');
  assert.doesNotMatch(ring, /onPress/);
  assert.match(sources, /id: `sparks:\$\{encounter\.key\}`, minGapMs: 20_000, maxGapMs: 45_000, durationMs: 1500/);
  assert.match(sources, /chaos=\{encounterChaos\(encounter\)\}/);
  assert.match(sources, /activeShowStart\(spot\.times, st\.serverNow, SHOW_WINDOW_MS\)/);
  const sprites = read('src/components/map/fright/FrightSprites.tsx');
  assert.match(sprites, /ENCOUNTER_CRITTER_PT = 88/, 'tap target over 44 pt');
  assert.doesNotMatch(sprites, /TrailDot/, 'the Skia-drawn trail is gone');
});
