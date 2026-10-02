'use strict';
/**
 * Art review: every wardrobe paper is drawn on Alex's 1353x1530 canvas against
 * the Classic shark (no-eye body + blink.png eyes). The default shark used to
 * be shark-colored-v2.png, a different drawing with the eye elsewhere, so on a
 * player with no skin every pair of glasses, mask and mouth item missed the
 * face. With no skin, every place that draws the player's shark now draws
 * Classic no-eye + blink, exactly like a worn skin.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.join(__dirname, '../..');
const wardrobe = loadTs('src/helpers/wardrobe.ts');
const CLASSIC = '../../assets/images/screens/inventory/classic-no-eye.png';
const EYES = '../../assets/images/screens/inventory/blink.png';

const item = (id, type, extra = {}) => ({ id, name: `Item ${id}`, item_type: { id: type }, icon_url: `icon-${id}`, paper_url: `paper-${id}`, ...extra });

function collect(node, predicate, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) { node.forEach((child) => collect(child, predicate, found)); return found; }
  if (predicate(node)) found.push(node);
  collect(node.props?.children, predicate, found);
  return found;
}
const sources = (tree) => collect(tree, (n) => n.type === 'Image').map((n) => n.props.source?.uri ?? n.props.source);

test('the Classic no-eye asset is Alex\'s 1353x1530 RGBA canvas', () => {
  const header = fs.readFileSync(path.join(root, 'assets/images/screens/inventory/classic-no-eye.png')).subarray(16, 26);
  assert.equal(header.readUInt32BE(0), 1353);
  assert.equal(header.readUInt32BE(4), 1530);
  assert.equal(header[9], 6, 'truecolour RGBA');
});

test('no skin draws Alex\'s Classic no-eye shark with the blink eyes', () => {
  assert.deepEqual(plain(wardrobe.sharkBaseLayers(null)), [CLASSIC, EYES]);
  assert.deepEqual(plain(wardrobe.sharkBaseLayers({ skin_item: null })), [CLASSIC, EYES]);
  assert.deepEqual(plain(wardrobe.sharkBaseLayers({ skin_item: item(2, 7, { no_eye_url: null }) })), [CLASSIC, EYES]);
});

test('a worn skin draws its own no-eye body with the same blink eyes', () => {
  assert.deepEqual(plain(wardrobe.sharkBaseLayers({ skin_item: item(2, 7, { no_eye_url: 'skin-no-eye' }) })),
    [{ uri: 'skin-no-eye' }, EYES]);
});

test('a player with items but no skin counts as dressed', () => {
  assert.equal(wardrobe.hasDressedShark({ skin_item: null, face_item: item(11, 2) }), true);
  assert.equal(wardrobe.hasDressedShark({ skin_item: item(2, 7, { no_eye_url: 'x' }) }), true);
  assert.equal(wardrobe.hasDressedShark({ skin_item: null, pin_item: null }), false);
  assert.equal(wardrobe.hasDressedShark(null), false);
});

test('no shark-drawing component falls back to the shark-colored-v2 drawing', () => {
  for (const file of ['src/components/Playercard.tsx', 'src/components/Avatar.tsx', 'src/components/Map.tsx', 'src/components/Item.tsx']) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(src, /shark-colored-v2/, file);
    assert.match(src, /sharkBaseLayers\(/, `${file} draws the shared shark base`);
    assert.doesNotMatch(src, /skin_item\?\.no_eye_url/, `${file} must not special-case the skin itself`);
  }
});

test('the Playercard stage draws Classic + eyes under a face item when no skin is worn', () => {
  const app = runtime('src/components/Playercard.tsx', { '../helpers/wardrobe': wardrobe },
    { inventory: { skin_item: null, face_item: item(77, 2, { paper_url: 'red-shades' }) } });
  const drawn = sources(app.tree);
  const classic = drawn.indexOf(CLASSIC), eyes = drawn.indexOf(EYES);
  assert.ok(classic >= 0 && eyes > classic, `Classic then eyes, got ${JSON.stringify(drawn)}`);
  assert.ok(!drawn.some((s) => typeof s === 'string' && s.includes('shark-colored-v2')));
});

test('an Avatar with items but no skin draws the outfit on the Classic shark, not the portrait', () => {
  const app = runtime('src/components/Avatar.tsx', {
    '../context/AuthProvider': { AuthContext: { value: { player: null } } },
    '../helpers/wardrobe': wardrobe,
    '../config': { default: { secondary: '#123', lightBlue: '#abc' } },
  }, { player: { id: 7, avatar_url: null, inventory: { skin_item: null, background_item: item(1, 6), face_item: item(164, 2, { paper_url: 'monocle' }) } }, size: 'sm' });
  assert.deepEqual(sources(app.tree), ['paper-1', CLASSIC, EYES, 'monocle']);
});

test('a wardrobe top card dresses the Classic shark when no skin is worn', () => {
  const app = runtime('src/components/Item.tsx', {
    '../context/AuthProvider': { AuthContext: { value: { player: { id: 5, inventory: { skin_item: null } } } } },
    '../helpers/wardrobe': wardrobe,
    '../hooks/useReducedGameMotion': { default: () => false },
  }, { item: item(31, 4), onToggle: () => {} });
  assert.deepEqual(sources(app.tree).slice(0, 3), [CLASSIC, EYES, 'paper-31']);
});
