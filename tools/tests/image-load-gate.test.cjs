'use strict';
/**
 * w5 cold-launch crash (Nov 19): expo-image 2.0 on iOS makes the
 * SDWebImageManager behind Image.loadAsync in an unlocked Swift lazy var, and
 * two loads starting together at a cold launch could both make it, freeing one
 * that a third load was still calling (EXC_BAD_ACCESS in ImageLoader.load).
 * Every loadAsync now goes through src/helpers/imageLoadGate.ts, which runs
 * loads one at a time until one has succeeded. These tests fail if two native
 * loads can ever run at once before that first success, or if any other file
 * reaches loadAsync without the gate.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const GATE = 'src/helpers/imageLoadGate.ts';
const tick = () => new Promise(resolve => setImmediate(resolve));

/** A stand-in for expo-image whose native loads stay open until the test settles them. */
function fakeExpoImage() {
  const calls = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let maxBeforeFirstSuccess = 0;
  let succeeded = false;
  const Image = {
    loadAsync(source, options) {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      if (!succeeded) maxBeforeFirstSuccess = Math.max(maxBeforeFirstSuccess, inFlight);
      let settle;
      const promise = new Promise((resolve, reject) => {
        settle = {
          resolve: () => { inFlight -= 1; succeeded = true; resolve({ source }); },
          reject: error => { inFlight -= 1; reject(error); },
        };
      });
      calls.push({ source, options, ...settle });
      return promise;
    },
  };
  return { module: { Image }, calls, stats: () => ({ inFlight, maxInFlight, maxBeforeFirstSuccess }) };
}

const reactNative = { Image: { resolveAssetSource: () => ({ uri: 'file:///a.png' }) }, PixelRatio: { get: () => 3 } };

test('the first loads of a launch never overlap; after one success they start together', async () => {
  const fake = fakeExpoImage();
  const gate = loadTs(GATE, { 'expo-image': fake.module });
  const loads = Array.from({ length: 6 }, (_, i) => gate.loadImageRef({ uri: `https://cdn.test/${i}.png` }, { maxWidth: 192 }));
  await tick();
  assert.equal(fake.calls.length, 1, 'one native load until one has succeeded');
  assert.equal(fake.calls[0].options.maxWidth, 192, 'options pass through');
  fake.calls[0].resolve();
  await tick();
  assert.equal(fake.calls.length, 6, 'then the rest start at once');
  assert.equal(fake.stats().inFlight, 5);
  fake.calls.slice(1).forEach(c => c.resolve());
  const refs = await Promise.all(loads);
  assert.deepEqual(refs.map(r => r.source.uri), loads.map((_, i) => `https://cdn.test/${i}.png`), 'each caller gets its own image');
  assert.equal(fake.stats().maxBeforeFirstSuccess, 1, 'never two native loads before the first success');
  gate.loadImageRef({ uri: 'https://cdn.test/later.png' });
  assert.equal(fake.calls.length, 7, 'once warm, a load starts right away');
});

test('a failed load proves nothing: the line stays single file until a load works', async () => {
  const fake = fakeExpoImage();
  const gate = loadTs(GATE, { 'expo-image': fake.module });
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(name => gate.loadImageRef({ uri: `https://cdn.test/${name}.png` }));
  await tick();
  assert.equal(fake.calls.length, 1);
  fake.calls[0].reject(new Error('404'));
  await assert.rejects(a, /404/, 'the caller still hears the failure');
  await tick();
  assert.equal(fake.calls.length, 2, 'the next load starts alone');
  assert.equal(fake.stats().inFlight, 1);
  fake.calls[1].resolve();
  await tick();
  assert.equal(fake.calls.length, 4, 'after a success the rest go together');
  fake.calls[2].resolve();
  fake.calls[3].resolve();
  await Promise.all([b, c, d]);
  assert.equal(fake.stats().maxBeforeFirstSuccess, 1);
});

test('a load that throws before it starts never jams the line', async () => {
  let n = 0;
  const gate = loadTs(GATE, {
    'expo-image': { Image: { loadAsync: () => { n += 1; if (n === 1) throw new Error('bad source'); return Promise.resolve({ n }); } } },
  });
  const first = gate.loadImageRef('not a source');
  const second = gate.loadImageRef({ uri: 'https://cdn.test/ok.png' });
  await assert.rejects(first, /bad source/);
  assert.deepEqual({ ...(await second) }, { n: 2 });
});

test('Standings faces at a cold launch: one decode first, then faceLayers runs its 4 at once', async () => {
  const fake = fakeExpoImage();
  const fl = loadTs('src/screens/LeaderboardsScreen/faceLayers.ts', { 'expo-image': fake.module, 'react-native': reactNative });
  // The launch warm-up: the first rows of This Week decode their layers together.
  fl.prefetchLayers(Array.from({ length: 10 }, (_, i) => ({ uri: `https://cdn.test/layer${i}.png` })), 40);
  await tick();
  assert.equal(fake.calls.length, 1, 'the warm-up starts with a single native decode (the w5 crash needed several at once)');
  fake.calls[0].resolve();
  await tick();
  assert.equal(fake.stats().inFlight, 4, 'then the usual 4 at once, so faces stay quick');
  for (let i = 1; i < fake.calls.length && i < 10; i += 1) {
    fake.calls[i].resolve();
    await tick();
  }
  await tick();
  assert.equal(fake.calls.length, 10, 'every layer decoded once');
  assert.ok(fake.stats().maxInFlight <= 4, 'never more than faceLayers allows');
  assert.equal(fake.stats().maxBeforeFirstSuccess, 1);
  assert.ok(fl.readyLayer({ uri: 'https://cdn.test/layer9.png' }, fl.faceBucket(40)), 'the decoded layer is ready to draw');
});

/** Files in src/ that reach expo-image's loadAsync without the gate. */
function directLoaders(files) {
  const found = [];
  for (const [file, text] of files) {
    if (/requireNativeModule\(\s*['"]ExpoImage['"]\s*\)/.test(text)) found.push(`${file}: ExpoImage native module`);
    if (/from\s+['"]expo-image\/build/.test(text)) found.push(`${file}: expo-image internals`);
    if (/require\(\s*['"]expo-image['"]\s*\)/.test(text)) found.push(`${file}: require('expo-image')`);
    for (const m of text.matchAll(/import\s+\*\s+as\s+(\w+)\s+from\s+['"]expo-image['"]/g)) {
      if (new RegExp(`\\b${m[1]}\\.(Image\\.loadAsync|useImage)\\b`).test(text)) found.push(`${file}: ${m[1]}.Image.loadAsync`);
    }
    for (const m of text.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]expo-image['"]/g)) {
      for (const spec of m[1].split(',').map(s => s.trim().replace(/^type\s+/, '')).filter(Boolean)) {
        const [name, alias] = spec.split(/\s+as\s+/).map(s => s.trim());
        if (name === 'useImage') found.push(`${file}: useImage from expo-image (it calls loadAsync)`);
        if (name === 'Image' && file !== GATE && new RegExp(`\\b${alias || name}\\.loadAsync\\b`).test(text)) found.push(`${file}: ${alias || name}.loadAsync`);
      }
    }
  }
  return found;
}

function srcFiles(dir = path.join(root, 'src'), out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) srcFiles(full, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) out.push([path.relative(root, full), fs.readFileSync(full, 'utf8')]);
  }
  return out;
}

test('nothing in src/ reaches loadAsync without the gate', () => {
  const offenders = directLoaders(srcFiles());
  assert.deepEqual(offenders, [], 'route these through loadImageRef in src/helpers/imageLoadGate.ts');
  const gate = fs.readFileSync(path.join(root, GATE), 'utf8');
  assert.equal(gate.match(/ExpoImage\.loadAsync\(/g)?.length, 1, 'the gate holds the only loadAsync call');
  // The guard itself catches the Oct 4 shape that crashed, and the hook that wraps loadAsync.
  const crashed = "import { Image as ExpoImage, type ImageRef } from 'expo-image';\n.then(() => ExpoImage.loadAsync({ uri }, { maxWidth: px }).finally(done))";
  assert.equal(directLoaders([['src/screens/LeaderboardsScreen/faceLayers.ts', crashed]]).length, 1);
  assert.equal(directLoaders([['src/x.tsx', "import { Image, useImage } from 'expo-image';"]]).length, 1);
  assert.equal(directLoaders([['src/x.tsx', "import { useImage } from '@shopify/react-native-skia';"]]).length, 0, "Skia's useImage is a different loader");
});
