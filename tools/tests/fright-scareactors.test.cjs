'use strict';
// Fin-ister Nights scareactors (art MANIFEST "Scareactors", MAP_FX_SPEC critter timing): the row
// mapping (slide_ok skip), the lurk cadence (6 to 14 s), the zoom and tier static rules, the flip
// toward the player within 60 m (only on an idle frame), the encounter's performer, and the wiring.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const sa = loadTs('src/components/map/fright/scareactors.ts');
const fa = loadTs('src/components/map/fright/frightAssets.ts');
const fb = loadTs('src/components/map/fright/frightBudget.ts');
const { USF_FIXTURE_ASSETS: fixture } = loadTs('src/components/map/fright/preview/usfAssets.ts');
const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const ROWS = ['idle', 'lurk', 'scare', 'slide'];
const sheet = (slide_ok, extra = {}) => ({ sheet: 'https://cdn/s.webp', static: 'https://cdn/s-static.webp', frame: [128, 128],
  rows: ROWS, frames_per_row: 10, fps: 10, slide_ok, ...extra });

test('rows: idle, lurk, scare, slide; the slide row is skipped unless slide_ok is true', () => {
  assert.deepEqual([...sa.scareactorRows(sheet(true))], [0, 1, 2, 3]);
  assert.deepEqual([...sa.scareactorRows(sheet(false))], [0, 1, 2, -1], 'swamp, ghost and stilt characters never slide');
  assert.deepEqual([...sa.scareactorRows({ rows: ROWS })], [0, 1, 2, -1], 'a missing flag never slides');
  assert.deepEqual([...sa.scareactorRows({ rows: ROWS, slide_ok: null })], [0, 1, 2, -1]);
  // Never a slide frame from a slide_ok false sheet, whatever the time or seed.
  const rows = sa.scareactorRows(sheet(false));
  for (let seed = 0; seed < 40; seed++) {
    for (let t = 0; t < 200; t += 0.5) assert.notEqual(sa.scareactorPose(seed, t, 10, 10, rows, true, -1).row, 3);
  }
});

test('slide_ok sheets slide now and then in full (one loop, then idle), never in lite', () => {
  const rows = sa.scareactorRows(sheet(true));
  let slid = 0;
  let lurked = 0;
  for (let seed = 0; seed < 40; seed++) {
    let prev = 0;
    let run = 0;
    for (let t = 0; t < 400; t += 0.1) {
      const p = sa.scareactorPose(seed, t, 10, 10, rows, true, -1);
      if (p.row === 3) { run++; if (prev !== 3) slid++; } else { if (prev === 3) assert.ok(run <= 11, `slide plays one loop (${run})`); run = 0; }
      if (p.row === 1 && prev !== 1) lurked++;
      prev = p.row;
    }
    for (let t = 0; t < 120; t += 0.25) assert.equal(sa.scareactorPose(seed, t, 10, 10, rows, false, -1).row, 0, 'lite: idle (and the jump) only');
  }
  assert.ok(slid > 0, 'some turns slide');
  assert.ok(lurked > slid, 'most turns lurk');
});

test('lurk cadence: an idle hold of 6 to 14 s between turns, then 1 or 2 lurk loops', () => {
  const rows = [0, 1, 2, -1];
  for (let seed = 0; seed < 60; seed++) {
    const turn = sa.lurkTurn(seed, 1);
    assert.ok(turn.gap >= sa.LURK_GAP_MIN_S && turn.gap <= sa.LURK_GAP_MAX_S, `gap ${turn.gap}`);
    assert.ok(turn.loops === 1 || turn.loops === 2);
    // Measure the idle holds between lurks on the real pose function.
    const starts = [];
    const ends = [];
    let prev = -1;
    for (let i = 0; i < 6000; i++) {
      const t = i * 0.01;
      const row = sa.scareactorPose(seed, t, 10, 10, rows, true, -1).row;
      if (row === 1 && prev === 0) starts.push(t);
      if (row === 0 && prev === 1) ends.push(t);
      prev = row;
    }
    assert.ok(starts.length >= 3, `seed ${seed} lurks (${starts.length})`);
    for (const end of ends) {
      const next = starts.find(s => s > end);
      if (next === undefined) continue;
      const hold = next - end;
      assert.ok(hold >= 6 - 0.02 && hold <= 14 + 0.02, `seed ${seed}: idle hold ${hold.toFixed(2)} s`);
    }
    for (let k = 0; k < ends.length; k++) {
      const start = starts.filter(s => s < ends[k]).pop();
      if (start === undefined) continue;
      const len = ends[k] - start;
      assert.ok(Math.abs(len - turn.loops) < 0.03, `seed ${seed}: lurk ${len.toFixed(2)} s for ${turn.loops} loop(s)`);
    }
  }
});

test('the jump plays the scare row once from its first frame (starts and ends hidden), then cuts to idle', () => {
  const rows = sa.scareactorRows(sheet(true));
  for (let i = 0; i < 10; i++) assert.deepEqual({ ...sa.scareactorPose(3, 50, 10, 10, rows, true, i / 10 + 0.01) }, { row: 2, frame: i });
  assert.equal(sa.scareactorPose(3, 50, 10, 10, rows, true, 1.0).row !== 2, true);
  assert.deepEqual({ ...sa.scareactorPose(3, 50, 10, 10, rows, false, 0.31) }, { row: 2, frame: 3 }, 'lite still jumps');
});

test('static only below zoom 15.5, and only static in calm (Reduce Motion, Spooky off) and low battery', () => {
  assert.equal(fb.critterLod(15.49), 'glyph');
  assert.equal(fb.critterLod(15.5), 'sprites');
  const base = { alive: 'full', spooky: true, reducedMotion: false };
  assert.equal(fb.frightTier({ ...base }), 'full');
  assert.equal(fb.frightTier({ ...base, batteryLevel: 0.19 }), 'calm', 'low battery: calm');
  assert.equal(fb.frightTier({ ...base, reducedMotion: true }), 'calm');
  assert.equal(fb.frightTier({ ...base, spooky: false }), 'calm');
  const sources = read('src/components/map/fright/FrightMapSources.tsx');
  // The glyph (the first performer's -static.webp) shows under 15.5 or in calm; the sheets never animate then.
  assert.match(sources, /const glyph = lod === 'glyph' \|\| st\.tier === 'calm';/);
  assert.match(sources, /animated=\{on && !glyph && animate && n > 0\}/);
  assert.match(sources, /<ReefGlyph staticUrl=\{sheets\[0\]\?\.static \?\? null\}/, 'the first scareactor of the reef, still');
  assert.match(sources, /full=\{st\.tier === 'full'\}/, 'lurks and slides in full only');
});

test('flip toward the player within 60 m of the reef (or inside it); otherwise each keeps its resting side', () => {
  // Bearing 90 (player east), map north up: face right. Map turned around: face left.
  assert.equal(sa.watchSide(55, 40, 90, 0), 1);
  assert.equal(sa.watchSide(55, 40, 270, 0), -1);
  assert.equal(sa.watchSide(55, 40, 90, 180), -1);
  assert.equal(sa.watchSide(100, 130, 270, 0), -1, 'inside a big reef counts');
  assert.equal(sa.watchSide(61, 40, 90, 0), 0, 'past 60 m: no watching');
  assert.equal(sa.watchSide(Number.NaN, 40, 90, 0), 0);
  const sides = new Set(Array.from({ length: 20 }, (_, i) => sa.restFace(i * 37)));
  assert.deepEqual([...sides].sort(), [-1, 1], 'a reef is never all mirrored');
});

test('facing flips only on an idle frame, never mid-lurk, mid-jump or mid-slide', () => {
  assert.equal(sa.nextFace(1, -1, 1, 0, 0), -1, 'idle: turns toward the player');
  assert.equal(sa.nextFace(1, -1, 1, 2, 0), 1, 'mid-jump: holds');
  assert.equal(sa.nextFace(1, -1, 1, 1, 0), 1, 'mid-lurk: holds');
  assert.equal(sa.nextFace(1, -1, 1, 3, 0), 1, 'mid-slide: holds');
  assert.equal(sa.nextFace(-1, 0, 1, 0, 0), 1, 'nobody near: back to the resting side on idle');
  const sprites = read('src/components/map/fright/FrightSprites.tsx');
  assert.match(sprites, /useAnimatedReaction\(\(\) => frameState\.value\.row, current => \{\s*face\.value = nextFace\(face\.value, watch, rest, current, idleRow\);/);
  assert.match(sprites, /\{ scaleX: face\.value \}/);
});

test('lookups: the reef cast comes from fx.scareactors (never the deprecated fx.critter); the encounter maps to its performer', () => {
  assert.deepEqual([...sa.reefCast({ scareactors: ['sa-jester', ' sa-juggler ', '', 'sa-jester'] })], ['sa-jester', 'sa-juggler']);
  assert.deepEqual([...sa.reefCast({ critter: 'barker-crab,juggler-octopus' })], [], 'old sea critters are never drawn');
  assert.deepEqual([...sa.reefCast(null)], []);
  const assets = { scareactors: { 'sa-jester': sheet(true), 'sa-ringmaster': sheet(true) }, lantern_star: { chuckles: 'sa-jester', riptide: 'sa-ringmaster' } };
  assert.equal(sa.encounterScareactor(assets, { critter: 'riptide', scareactor: 'sa-ringmaster' }), 'sa-ringmaster');
  assert.equal(sa.encounterScareactor(assets, { critter: 'chuckles' }), 'sa-jester', 'older servers: the lantern_star map');
  assert.equal(sa.encounterScareactor({}, { critter: 'chuckles' }), null);
  assert.equal(sa.encounterScareactor(assets, null), null);
  assert.deepEqual([...sa.castUrls(assets)], ['https://cdn/s-static.webp', 'https://cdn/s.webp'], 'statics first, each URL once');
});

test('the encounter appears with the scare row and loops the slide in chaos (lurk when it may not slide)', () => {
  assert.deepEqual([...sa.encounterRows(sheet(true))], [0, 2, 3]);
  assert.deepEqual([...sa.encounterRows(sheet(false))], [0, 2, 1]);
  const rows = sa.encounterRows(sheet(true));
  assert.deepEqual({ ...fa.encounterPose(100, 0.45, rows, 10, 10, false, true) }, { row: 2, frame: 4 }, 'appear on spawn');
  assert.equal(fa.encounterPose(100, 5, rows, 10, 10, false, true).row, 3, 'first 20 s: the slide');
  assert.equal(fa.encounterPose(100, 30, rows, 10, 10, true, true).row, 3, 'Chaos Hour: the slide');
  assert.equal(fa.encounterPose(100, 30, rows, 10, 10, false, true).row, 0, 'then idle');
  assert.equal(fa.encounterPose(100, 5, rows, 10, 10, true, false).row, 0, 'lite: appear and idle');
});

test('the USF fixture mirrors the server payload: the Orlando cast plus the Lantern Star pair, slide_ok per manifest', () => {
  assert.deepEqual({ ...fixture.lantern_star }, { chuckles: 'sa-jester', riptide: 'sa-ringmaster' });
  assert.equal(fixture.scareactors['sa-stilt-carny'].slide_ok, false);
  assert.equal(fixture.scareactors['sa-jester'].slide_ok, true);
  assert.equal(fixture.scareactors['sa-bog-creature'], undefined, 'no Hollywood cast in Orlando');
  for (const [slug, a] of Object.entries(fixture.scareactors)) {
    assert.match(a.sheet, new RegExp(`/scareactors/${slug}\\.webp$`));
    assert.match(a.static, new RegExp(`/scareactors/${slug}-static\\.webp$`));
  }
  // On a Mac with the art kit: every fixture slug is still in the regenerated MANIFEST (no deleted slug lingers).
  const manifestFile = path.join(process.env.HOME || '', 'apps/tps-prime-time-audit/next-wave/fright-nights/art/MANIFEST.json');
  if (fs.existsSync(manifestFile)) {
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    for (const slug of Object.keys(fixture.scareactors)) assert.ok(manifest.scareactors[slug], `${slug} is gone from the art MANIFEST`);
    for (const [slug, h] of Object.entries(fixture.haunts)) assert.equal(h.layers.window_count, manifest.haunts[slug].layers.window_count, slug);
  }
  const { USF_FRIGHT_SPOTS } = loadTs('src/components/map/fright/preview/usfFixture.ts');
  for (const reef of USF_FRIGHT_SPOTS.filter(s => s.kind === 'reef')) {
    assert.equal(reef.fx.critter, undefined, reef.key);
    for (const slug of reef.fx.scareactors) assert.ok(fixture.scareactors[slug], `${reef.key} ${slug}`);
  }
});

test('wiring: reefs and the encounter draw scareactor sheets only; no sea-critter placeholders; cast prefetched to disk', () => {
  const sources = read('src/components/map/fright/FrightMapSources.tsx');
  assert.match(sources, /const cast = reefCast\(reef\.fx\);/);
  assert.match(sources, /scareactorAsset\(assets, encounterScareactor\(assets, encounter\)\)/);
  assert.doesNotMatch(sources, /critterSlugs|critterAsset|iconAsset\(assets, encounter/);
  assert.match(sources, /prefetchFrightImages\(castKey\.split\('\|'\)\)/);
  const sprites = read('src/components/map/fright/FrightSprites.tsx');
  assert.doesNotMatch(sprites, /CritterBody|critterLook|critterPose/, 'the cute critter placeholders are gone');
  assert.ok(!fs.existsSync(path.join(root, 'src/components/map/fright/CritterBody.tsx')));
  assert.match(sprites, /scareactorPose\(seed, clock\.value, timing\.frames, timing\.fps, rows, full, jumper \? clock\.value - jumpStart\.value : -1\)/);
  assert.match(sprites, /: \{ row: idleRow, frame: 0 \}\)\); \/\/ paused: no clock read/);
  assert.match(sprites, /encounterRows\(asset\)/);
  const hook = read('src/components/map/fright/useFrightImage.ts');
  assert.match(hook, /ExpoImage\.getCachePathAsync\(url\)/);
  assert.match(hook, /ExpoImage\.prefetch\(todo, \{ cachePolicy: FRIGHT_CACHE_POLICY \}\)/);
  const api = read('src/api/endpoints/fright/types.ts');
  assert.match(api, /readonly scareactors\?: readonly string\[\] \| null;/);
  assert.match(api, /readonly slide_ok\?: boolean \| null;/);
  assert.match(api, /readonly scareactor\?: string \| null;/);
});
