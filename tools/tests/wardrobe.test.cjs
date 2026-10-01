'use strict';
/**
 * The shark wardrobe (Inventory, reached by tapping the shark on Profile):
 * category tabs, outfit layering, and the live outfit shown everywhere.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const { loadTs } = require('./helpers/ts-module.cjs');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
const { plain } = require('./helpers/plain.cjs');

const wardrobe = loadTs('src/helpers/wardrobe.ts');

const item = (id, type, extra = {}) => ({ id, name: `Item ${id}`, item_type: { id: type }, icon_url: `icon-${id}`, paper_url: `paper-${id}`, ...extra });
const outfit = (extra = {}) => ({
  id: 1,
  skin_item: item(2, 7, { no_eye_url: 'skin-no-eye' }),
  background_item: item(1, 6),
  head_item: item(10, 1), face_item: item(11, 2), neck_item: item(12, 3), body_item: item(13, 4), hand_item: item(14, 5),
  pin_item: null,
  ...extra,
});

function collect(node, predicate, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) { node.forEach((child) => collect(child, predicate, found)); return found; }
  if (predicate(node)) found.push(node);
  collect(node.props?.children, predicate, found);
  return found;
}
const imageUris = (tree) => collect(tree, (n) => n.type === 'Image' && n.props?.source?.uri).map((n) => n.props.source.uri);

test('every wardrobe category has a readable tab name even when the server sends no tab art', () => {
  const labels = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => wardrobe.wardrobeCategoryLabel({ id, name: 'Head' }));
  assert.deepEqual(plain(labels), ['Hats', 'Eyewear', 'Neck', 'Tops', 'Props', 'Backdrops', 'Sharks', 'Pins']);
  assert.equal(wardrobe.wardrobeCategoryLabel({ id: 99, name: 'Capes' }), 'Capes');
});

test('outfit layers stack back to front in the same order the server renders avatars', () => {
  assert.deepEqual(plain(wardrobe.outfitLayerUrls(outfit())), ['paper-13', 'paper-11', 'paper-12', 'paper-14', 'paper-10']);
  assert.deepEqual(plain(wardrobe.outfitLayerUrls(outfit({ head_item: null, face_item: item(11, 2, { paper_url: null }) }))),
    ['paper-13', 'paper-12', 'paper-14']);
  assert.deepEqual(plain(wardrobe.outfitLayerUrls(null)), []);
  const source = fs.readFileSync('src/helpers/wardrobe.ts', 'utf8');
  assert.match(source, /'body_item', 'face_item', 'neck_item', 'hand_item', 'head_item'/);
});

test('the worn shark and backdrop are locked; worn clothes can come off', () => {
  const worn = outfit();
  assert.equal(wardrobe.isItemWorn(worn, { id: 10 }), true);
  assert.equal(wardrobe.isItemWorn(worn, { id: 99 }), false);
  assert.equal(wardrobe.isLockedWhileWorn(worn, { id: 2 }), true);
  assert.equal(wardrobe.isLockedWhileWorn(worn, { id: 1 }), true);
  assert.equal(wardrobe.isLockedWhileWorn(worn, { id: 10 }), false);
  assert.equal(wardrobe.isItemWorn(null, { id: 10 }), false);
});

test('your own avatar in a list shows the outfit you just put on, other players keep theirs', () => {
  const me = { id: 5, inventory: outfit() };
  const listRowForMe = { id: 5, inventory: { pin_item: null } };
  const listRowForFriend = { id: 6, inventory: { pin_item: null } };
  assert.equal(wardrobe.liveOutfitFor(listRowForMe, me), me.inventory);
  assert.equal(wardrobe.liveOutfitFor(listRowForFriend, me), listRowForFriend.inventory);
  assert.equal(wardrobe.liveOutfitFor(listRowForMe, null), listRowForMe.inventory);
});

function avatar(player, signedIn) {
  return runtime('src/components/Avatar.tsx', {
    '../context/AuthProvider': { AuthContext: { value: { player: signedIn } } },
    '../helpers/wardrobe': wardrobe,
    '../config': { default: { secondary: '#123', lightBlue: '#abc' } },
  }, { player, size: 'sm' });
}

test('a leaderboard row for the signed-in player draws the live outfit instead of the stale picture', () => {
  const me = { id: 5, avatar_url: 'old-picture', inventory: outfit() };
  const mine = avatar({ id: 5, avatar_url: 'old-picture', inventory: { pin_item: null } }, me);
  assert.deepEqual(imageUris(mine.tree), ['paper-1', 'skin-no-eye', 'paper-13', 'paper-11', 'paper-12', 'paper-14', 'paper-10']);

  const friend = avatar({ id: 6, avatar_url: 'friend-picture', inventory: { pin_item: null } }, me);
  assert.ok(collect(friend.tree, (n) => n.type === 'Image' && n.props.source === 'friend-picture').length === 1);
});

function card(target, inventory, onToggle = () => {}, extra = {}) {
  return runtime('src/components/Item.tsx', {
    '../context/AuthProvider': { AuthContext: { value: { player: { id: 5, inventory } } } },
    '../helpers/wardrobe': wardrobe,
    '../hooks/useReducedGameMotion': { default: () => extra.reduceMotion ?? false },
  }, { item: target, onToggle, ...extra.props });
}
const button = (app) => app.find((n) => n.type === 'Pressable');

test('wardrobe cards: the worn shark reads as worn, a worn hat can come off, and a new item can be worn', () => {
  const worn = outfit();
  // Cards never lock: the screen answers a tap on the worn shark with
  // "Your shark always needs a skin" instead of taking it off.
  const sharkTaps = [];
  const shark = button(card(item(2, 7), worn, (value) => sharkTaps.push(value.id)));
  assert.equal(shark.props.disabled, false);
  assert.equal(shark.props.accessibilityLabel, 'Item 2, currently worn');
  shark.props.onPress();
  assert.deepEqual(sharkTaps, [2]);
  assert.equal(wardrobe.isRequiredSlot(wardrobe.slotForItem(item(2, 7))), true);
  assert.equal(wardrobe.requiredSlotCopy('skin_item'), 'Your shark always needs a skin');
  assert.equal(wardrobe.requiredSlotCopy('background_item'), 'Your shark always needs a backdrop');

  const hat = button(card(item(10, 1), worn));
  assert.equal(hat.props.disabled, false);
  assert.equal(hat.props.accessibilityLabel, 'Remove Item 10 from your shark');

  const tapped = [];
  const glasses = button(card(item(20, 2), worn, (value) => tapped.push(value.id)));
  assert.equal(glasses.props.accessibilityLabel, 'Wear Item 20 on your shark');
  glasses.props.onPress();
  assert.deepEqual(tapped, [20]);
});

test('a top without shark-layer art still shows its own icon instead of a bare shark', () => {
  const top = card(item(30, 4, { paper_url: null }), outfit());
  assert.ok(collect(top.tree, (n) => n.type === 'Image' && n.props.source === 'icon-30').length === 1);
  const dressed = card(item(31, 4), outfit());
  assert.deepEqual(imageUris(dressed.tree), ['skin-no-eye']);
  assert.ok(collect(dressed.tree, (n) => n.type === 'Image' && n.props.source === 'paper-31').length === 1);
});

test('Profile opens the Inventory dressing room without changing the navigation shell', () => {
  const root = fs.readFileSync('src/Root.tsx', 'utf8');
  const profile = fs.readFileSync('src/screens/ProfileScreen.tsx', 'utf8');
  assert.match(root, /name="Inventory"/);
  assert.match(profile, /RootNavigation\.navigate\('Inventory'\)/);
});

test('the stage dresses the shark from useLook, so a tap shows at once and nothing locks', () => {
  const screen = fs.readFileSync('src/screens/InventoryScreen.tsx', 'utf8');
  assert.match(screen, /const look = useLook\(\);/);
  assert.match(screen, /<Playercard\s+inventory=\{worn\}/);
  assert.match(screen, /look\.set\(slot, isWorn \? null : item\)/);
  assert.doesNotMatch(screen, /outfitMutation|pendingItemId|outfitNeedsRefresh|disabled=\{/);
  const hook = fs.readFileSync('src/hooks/useLook.ts', 'utf8');
  assert.match(hook, /setPlayer\(\{ \.\.\.current, inventory: \{ \.\.\.current\.inventory, \.\.\.slots \}/);
});
