'use strict';
/** STICKER BOOK kit spike (src/ui/sticker): tokens, the two-level rule, outlined text, kit rules. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const dir = path.join(root, 'src/ui/sticker');
const files = [];
(function walk(d) {
  for (const name of fs.readdirSync(d)) {
    const full = path.join(d, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(name)) files.push(full);
  }
})(dir);
const rel = full => path.relative(root, full);
const source = full => fs.readFileSync(full, 'utf8');
const tokens = loadTs('src/ui/sticker/tokens.ts');
const level = loadTs('src/ui/sticker/level.ts');
const outline = loadTs('src/ui/sticker/outline.ts');

test('only tokens.ts holds a hex colour or an rgba under src/ui/sticker', () => {
  assert.ok(files.length >= 15, 'the kit files are found');
  for (const full of files) {
    if (rel(full) === 'src/ui/sticker/tokens.ts') continue;
    const text = source(full);
    assert.doesNotMatch(text, /#[0-9a-fA-F]{3,8}\b/, `${rel(full)} holds a hex colour`);
    assert.doesNotMatch(text, /rgba?\(/, `${rel(full)} holds an rgb or rgba colour`);
  }
});

test('the palette is exactly the DIRECTION.md final tokens', () => {
  const want = {
    navy: '#05346e', navySoft: '#3d5f8c', blue: '#0768b9', blueBright: '#1590e6', blueLip: '#05468f', sky: '#cfe9fb', skyLip: '#9cc9ec',
    white: '#ffffff', cream: '#fff6dc', creamDeep: '#f3e3b4', creamLip: '#dcc78c', gold: '#ffcf3b', goldLight: '#ffe37d', goldLip: '#d99a00',
    goldInk: '#8a5a00', red: '#ef4a3c', redLip: '#b92e22', green: '#3cb85c', scrim: 'rgba(5,52,110,0.52)',
  };
  assert.deepEqual({ ...tokens.INK }, want);
  assert.deepEqual({ ...tokens.LINE }, { page: 3, card: 2.5, button: 2.5, chip: 2, tag: 2, map: 3 });
  assert.deepEqual({ ...tokens.EDGE }, { page: 4, card: 3, button: 3, label: 3 });
  assert.equal(tokens.DROP.page, 5);
  assert.equal(tokens.DROP.cardOnWorld, 4);
  assert.equal(tokens.DROP.cardInPage, 3);
  assert.equal(tokens.DROP.tag, 2.5);
  assert.equal(tokens.FLOAT_SHADOW.y, 18);
  assert.equal(tokens.FLOAT_SHADOW.blur, 28);
  assert.deepEqual([tokens.BUTTON.heightLarge, tokens.BUTTON.height, tokens.BUTTON.heightSmall, tokens.BUTTON.heightKey], [58, 44, 36, 42]);
  assert.deepEqual([tokens.BUTTON.lip, tokens.BUTTON.lipSmall, tokens.BUTTON.shine], [5, 4, 2]);
  assert.deepEqual({ ...tokens.RADIUS }, { page: 24, pageSmall: 20, card: 16, buttonLarge: 22, button: 18, buttonSmall: 14, key: 15, label: 11, pill: 999 });
  assert.equal(tokens.SPACE.base, 4);
  assert.equal(tokens.SPACE.margin, 16);
  assert.equal(tokens.STROKE.max, 3);
  assert.equal(tokens.STROKE.minSize, 17);
  assert.equal(tokens.STROKE.button, 2.2);
  assert.ok(tokens.STROKE.title >= 2.6 && tokens.STROKE.title <= 2.8);
  assert.equal(tokens.TYPE.min, 12);
  // Drops are navy, never black: every drop colour is a navy rgba.
  for (const key of ['color', 'inPage', 'map', 'knob']) assert.match(tokens.DROP[key], /^rgba\(5,(36|40|44),(82|90|96),0\.\d+\)$/);
});

test('no black and no gray anywhere in the tokens', () => {
  const all = [...Object.values(tokens.INK), ...Object.values(tokens.SHADE), ...Object.values(tokens.GALLERY)];
  for (const value of all) {
    const hex = /^#([0-9a-f]{6})$/i.exec(value);
    if (!hex) continue;
    const [r, g, b] = [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16));
    assert.ok(Math.max(r, g, b) > 40, `${value} is near black`);
    assert.ok(!(Math.max(r, g, b) - Math.min(r, g, b) < 12 && Math.max(r, g, b) < 240), `${value} is a neutral gray`);
  }
});

test('two levels: the white edge only on the world and the map, never inside a page', () => {
  assert.deepEqual({ ...level.decideEdge('world') }, { edge: true, refused: false });
  assert.deepEqual({ ...level.decideEdge('map') }, { edge: true, refused: false });
  assert.deepEqual({ ...level.decideEdge('page') }, { edge: false, refused: false });
  assert.deepEqual({ ...level.decideEdge('page', true) }, { edge: false, refused: true }, 'forcing an edge inside a page is refused');
  assert.deepEqual({ ...level.decideEdge('world', false) }, { edge: false, refused: false });
  assert.equal(level.levelNumber('world'), 1);
  assert.equal(level.levelNumber('map'), 1);
  assert.equal(level.levelNumber('page'), 2);
  assert.deepEqual({ ...level.insidePage() }, { level: 'page', surface: 'blue' });
  assert.deepEqual({ ...level.insideCard({ level: 'page', surface: 'blue' }) }, { level: 'page', surface: 'paper' });
  assert.deepEqual({ ...level.insideCard({ level: 'world', surface: 'blue' }) }, { level: 'world', surface: 'paper' });
  assert.equal(level.lineFor('map', 2.5, 3), 3);
  assert.equal(level.lineFor('page', 2.5, 3), 2.5);
});

test('a forced edge inside a page warns once per part, in development only', () => {
  level.resetEdgeWarnings();
  const said = [];
  assert.equal(level.warnRefusedEdge('Card', false, m => said.push(m)), false, 'release builds stay quiet');
  assert.equal(level.warnRefusedEdge('Card', true, m => said.push(m)), true);
  assert.equal(level.warnRefusedEdge('Card', true, m => said.push(m)), false, 'once per part');
  assert.equal(level.warnRefusedEdge('StickerButton', true, m => said.push(m)), true);
  assert.equal(said.length, 2);
  assert.match(said[0], /Card: a white cut edge was asked for inside a page/);
});

test('the level rule lives in the parts: Page sets it, the edge parts ask useEdge, the rest never draw an edge', () => {
  const read = name => source(path.join(dir, name));
  assert.match(read('Page.tsx'), /<PlaceProvider value=\{insidePage\(\)\}>/);
  assert.match(read('Card.tsx'), /useEdge\('Card', asked\)/);
  assert.match(read('Card.tsx'), /<PlaceProvider value=\{insideCard\(place\)\}>/);
  assert.match(read('StickerButton.tsx'), /useEdge\('StickerButton', asked\)/);
  assert.match(read('TitleLabel.tsx'), /useEdge\('TitleLabel', asked\)/);
  for (const name of ['Tag.tsx', 'Spot.tsx', 'ProgressBar.tsx', 'CurrencyChip.tsx', 'Badge.tsx', 'StickerText.tsx', 'WaveFoot.tsx']) {
    assert.doesNotMatch(read(name), /\bEDGE\./, `${name} draws no white cut edge`);
  }
  // Page's own title label is mounted outside the page's level 2 (it shares the page's edge).
  const page = read('Page.tsx');
  assert.ok(page.indexOf('<TitleLabel') > page.indexOf('</PlaceProvider>'), 'the label sits outside the page provider');
});

test('outlined type: no stroke under 17 pt, never above 3 pt, 16 copies on a round ring', () => {
  assert.equal(outline.strokeFor(16), 0);
  assert.equal(outline.strokeFor(16.9, 2.5), 0);
  assert.equal(outline.strokeFor(17), 2.2);
  assert.equal(outline.strokeFor(30), 2.7);
  assert.equal(outline.strokeFor(35, 5), 3, 'clamped to 3');
  assert.equal(outline.dropFor(30), 2.5);
  assert.equal(outline.dropFor(19), 2);
  const r = outline.ring(2.7, outline.RING_COPIES);
  assert.equal(r.length, 16);
  for (const p of r) assert.ok(Math.abs(Math.hypot(p.x, p.y) - 2.7) < 0.02);
  assert.ok(outline.scallop(2.8, outline.RING_COPIES) < 0.06, 'the ring is round to under 0.06 pt');
  assert.equal(outline.nodeCount('shadow', 16), 17);
  assert.equal(outline.nodeCount('shadow', 12), 13);
  assert.equal(outline.nodeCount('copies', 16), 25);
});

test('a one-line title is sized once for every copy: never bigger, never under 60 percent', () => {
  const text = loadTs('src/ui/sticker/StickerText.tsx', {
    react: { memo: x => x, useState: v => [v, () => {}], useRef: v => ({ current: v }), useEffect: () => {}, useCallback: f => f, createContext: () => ({ Provider: 'P' }), useContext: () => null, useMemo: f => f() },
    'react-native': { StyleSheet: { create: x => x } },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'F' },
  });
  assert.equal(text.fitSize(30, 200, 150), 30, 'fits: unchanged');
  assert.equal(text.fitSize(30, 0, 150), 30, 'not measured yet');
  assert.equal(text.fitSize(30, 150, 200), 22.5);
  assert.equal(text.fitSize(30, 50, 200), 18, 'floor at 60 percent');
  assert.equal(text.fitSize(35, 157, 211), 26, 'rounded down to 0.1 pt');
  const source = fs.readFileSync(path.join(root, 'src/ui/sticker/StickerText.tsx'), 'utf8');
  assert.doesNotMatch(source, /adjustsFontSizeToFit/, 'no copy and no label shrinks itself');
});

test('one VoiceOver element per title: the copies are never accessible', () => {
  const text = source(path.join(dir, 'StickerText.tsx'));
  assert.match(text, /accessible: false,/, 'every copy and the fill are inaccessible');
  assert.match(text, /accessible: true, accessibilityRole: role, accessibilityLabel: label \?\? children/);
  assert.match(text, /importantForAccessibility: 'no-hide-descendants'/, 'inside a button the title hides');
});

test('kit engineering rules: no Skia, no measured SVG, no linear easing, springs from ui/motion, transforms for motion', () => {
  for (const full of files) {
    const text = source(full);
    const name = rel(full);
    assert.doesNotMatch(text, /@shopify\/react-native-skia/, `${name} uses Skia`);
    if (/from 'react-native-svg'/.test(text)) {
      assert.doesNotMatch(text, /onLayout/, `${name} mixes an SVG with onLayout`);
      assert.doesNotMatch(text, /createAnimatedComponent/, `${name} animates an SVG`);
    }
    assert.doesNotMatch(text, /Easing\.linear/, `${name} moves on a linear curve`);
    assert.doesNotMatch(text, /—/, `${name} has an em dash`);
    assert.doesNotMatch(text, /fontWeight/, `${name} fakes bold`);
    assert.doesNotMatch(text, /[\u{1F300}-\u{1FAFF}☀-➿]/u, `${name} has an emoji or dingbat`);
    if (/withSpring\(/.test(text)) assert.match(text, /from '\.\.\/motion'|from '\.\.\/\.\.\/motion'/, `${name} springs without ui/motion`);
    // Animated styles change transform and opacity only.
    for (const m of text.matchAll(/useAnimatedStyle\(\(\) => (?:reduced\s*\?[^]*?:\s*)?\(?\{([^]*?)\}\)?\)/g)) {
      const keys = [...m[1].matchAll(/(\w+):/g)].map(k => k[1]).filter(k => !['translateX', 'translateY', 'scale', 'rotate'].includes(k));
      for (const k of keys) assert.ok(['opacity', 'transform'].includes(k), `${name} animates ${k}`);
    }
  }
});

test('every pressable has a role and a VoiceOver label, and reaches 44 pt', () => {
  for (const full of files) {
    const text = source(full);
    for (const m of text.matchAll(/<Pressable([^>]*)>/g)) {
      assert.match(m[1], /accessibilityRole="(button|tab)"/, `${rel(full)} pressable without a role`);
      assert.match(m[1], /accessibilityLabel=/, `${rel(full)} pressable without a label`);
      assert.match(m[1], /accessibilityState=/, `${rel(full)} pressable without its state`);
    }
  }
  assert.equal(tokens.BUTTON.minTouch, 44);
  assert.match(source(path.join(dir, 'RoundButton.tsx')), /const HIT = 48;/);
});

test('the gallery is a dev-only route, never in a release bundle', () => {
  const load = (dev, env = {}) => loadTs('src/devRoutes.tsx', {}, { __DEV__: dev, process: { env } });
  assert.ok(load(true).DEV_SCREENS.some(s => s.name === 'StickerGallery'));
  for (const env of [{}, { EXPO_PUBLIC_MOTION_CAPTURE: 'BoxRevealPreview' }, { EXPO_PUBLIC_PERF_CAPTURE: '1' }, { EXPO_PUBLIC_SHARE_WALK: '1' }]) {
    assert.ok(!load(false, env).DEV_SCREENS.some(s => s.name === 'StickerGallery'), JSON.stringify(env));
  }
  // No screen a player can reach imports the kit yet.
  const { execFileSync } = require('node:child_process');
  let hits = '';
  try { hits = execFileSync('git', ['grep', '-l', 'ui/sticker', '--', 'src'], { cwd: root, encoding: 'utf8' }).trim(); } catch { hits = ''; }
  const outside = hits.split('\n').filter(Boolean).filter(f => !f.startsWith('src/ui/sticker/') && f !== 'src/devRoutes.tsx');
  assert.deepEqual(outside, []);
});

test('wave foot path and badge text', () => {
  const wave = loadTs('src/ui/sticker/WaveFoot.tsx', {
    react: { memo: x => x, useRef: v => ({ current: v }) },
    'react-native': {},
    'react-native-svg': {},
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'F' },
  });
  const d = wave.wavePath(294, 60);
  assert.match(d, /^M0,9 Q10\.50,3\.80 21\.00,9 Q31\.50,14\.20 42\.00,9 /, 'the board wave: half-waves of 21 pt, controls at 3.8 and 14.2');
  assert.match(d, / L294,64 L0,64 Z$/);
  const badge = loadTs('src/ui/sticker/Badge.tsx', {
    react: { memo: x => x, createContext: () => ({ Provider: 'P' }), useContext: () => null, useMemo: f => f(), useState: v => [v, () => {}], useRef: v => ({ current: v }), useEffect: () => {}, useCallback: f => f },
    'react-native': { StyleSheet: { create: x => x } },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'F' },
  });
  assert.equal(badge.badgeText(0), '');
  assert.equal(badge.badgeText(3), '3');
  assert.equal(badge.badgeText(12), '9+');
});

// ---------- spike step 0, part 2: the three proof screens ----------
const proof = loadTs('src/ui/sticker/proof/proofData.ts');
const plain = v => JSON.parse(JSON.stringify(v));

test('gate keys: digits add up to the answer length, delete takes one off', () => {
  assert.equal(proof.gatePress('', '2', 3), '2');
  assert.equal(proof.gatePress('29', '7', 3), '297');
  assert.equal(proof.gatePress('297', '1', 3), '297');
  assert.equal(proof.gatePress('297', 'del', 3), '29');
  assert.equal(proof.gatePress('', 'del', 3), '');
  assert.equal(proof.gatePress('2', 'ok', 3), '2');
});

test('gate answer box is spots: typed are yours, the next wears the gold ring, the rest are empty', () => {
  assert.deepEqual(plain(proof.gateSpots('', 3).map(s => s.state)), ['next', 'empty', 'empty']);
  assert.deepEqual(plain(proof.gateSpots('29', 3).map(s => s.state)), ['yours', 'yours', 'next']);
  assert.deepEqual(plain(proof.gateSpots('29', 3).map(s => s.glyph)), ['2', '9', null]);
  assert.deepEqual(plain(proof.gateSpots('297', 3).map(s => s.state)), ['yours', 'yours', 'yours']);
});

test('week row shows all four spot states', () => {
  assert.deepEqual(plain(proof.weekSpots(3)), ['yours', 'yours', 'next', 'ghost', 'empty', 'empty', 'empty']);
});

test('shelf states: one next up, coins not out yet are empty, found are yours', () => {
  const states = proof.shelfStates([true, false, false, true, false], [false, false, true, false, false]);
  assert.deepEqual(states, ['yours', 'next', 'empty', 'yours', 'ghost']);
  const sample = proof.sampleFound(35, 15);
  assert.equal(sample.length, 35);
  assert.equal(sample.filter(Boolean).length, 15);
  assert.deepEqual(plain(proof.rowsOf([1, 2, 3, 4, 5, 6, 7], 5)), [[1, 2, 3, 4, 5], [6, 7]]);
});

test('proof screens use kit parts only: no raw Pressable, Modal, shadow blur or system font', () => {
  for (const name of ['ProofGate.tsx', 'ProofRewards.tsx', 'ProofShelf.tsx']) {
    const text = source(path.join(dir, 'proof', name));
    assert.doesNotMatch(text, /<Pressable|<Modal|<TouchableOpacity|shadowRadius|fontFamily|fontWeight/, `${name} draws a one-off control or style`);
  }
});

test('the shelf grid never renders React while scrolling: memoised cells, no onScroll', () => {
  const text = source(path.join(dir, 'proof', 'ProofShelf.tsx'));
  assert.match(text, /const CoinCell = memo\(/);
  assert.match(text, /const ShelfRow = memo\(/);
  assert.doesNotMatch(text, /onScroll|useAnimatedScrollHandler/);
});
