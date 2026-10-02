'use strict';
/**
 * Inventory upgrade phase 1 (dressing-room.md 13.3, 7.10, 9.1-9.2, 8.6):
 * the optimistic look queue behind useLook, rarity cards, NEW tracking and
 * the pinned deep-link item.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const { loadTs } = require('./helpers/ts-module.cjs');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
const { plain } = require('./helpers/plain.cjs');

const { LookQueue, MERGE_WINDOW_MS, RETRY_DELAYS_MS, changedSlots } = loadTs('src/helpers/lookQueue.ts');
const wardrobe = loadTs('src/helpers/wardrobe.ts');

const item = (id, type, extra = {}) => ({ id, name: `Item ${id}`, item_type: { id: type }, icon_url: `icon-${id}`, paper_url: `paper-${id}`, ...extra });
const SAVED = { background_item: item(1, 6), skin_item: item(2, 7), head_item: null, face_item: null, body_item: null };
const ids = (slots) => Object.fromEntries(Object.entries(slots).map(([slot, worn]) => [slot, worn ? worn.id : null]));
const flush = async () => { for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setImmediate(resolve)); };

/** A LookQueue on a fake clock with a scripted server. */
function harness({ version = 0, server = {}, legacy = false, known = true } = {}) {
  let now = 0;
  let serverLook = { version, slots: { ...SAVED, ...server } };
  const timers = [];
  const calls = { save: [], load: 0, legacy: [] };
  const notices = [];
  const saved = [];
  const script = [];
  const deps = {
    now: () => now,
    schedule: (fn, ms) => { const timer = { fn, at: now + ms }; timers.push(timer); return timer; },
    cancel: (timer) => { const i = timers.indexOf(timer); if (i >= 0) timers.splice(i, 1); },
    onChange: () => {},
    onSaved: (slots) => saved.push(ids(slots)),
    onNotice: (notice) => notices.push(plain(notice)),
    async load() { calls.load += 1; const next = script.shift(); if (next === 'offline') throw new Error('offline'); return serverLook; },
    async save(v, slots) {
      calls.save.push({ version: v, slots: plain(slots) });
      const next = script.shift();
      if (legacy) return { kind: 'unsupported' };
      if (next === 'offline') throw new Error('offline');
      if (next === 'reject') return { kind: 'rejected', slots: Object.keys(slots).slice(0, 1) };
      if (v !== serverLook.version) return { kind: 'conflict', look: serverLook };
      const merged = { ...serverLook.slots };
      for (const [slot, id] of Object.entries(slots)) merged[slot] = id === null ? null : item(id, 0);
      serverLook = { version: v + 1, slots: merged };
      return { kind: 'saved', look: serverLook };
    },
    async legacyToggle(target) {
      calls.legacy.push(target.id);
      return {};
    },
  };
  const queue = new LookQueue(deps, { ...SAVED }, known ? version : null);
  return {
    queue, calls, notices, saved, script,
    get server() { return serverLook; },
    set server(value) { serverLook = value; },
    async advance(ms) {
      const until = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const due = timers[0];
        if (!due || due.at > until) break;
        timers.shift();
        now = due.at;
        due.fn();
        await flush();
      }
      now = until;
      await flush();
    },
  };
}

test('a tap shows on the shark in the same frame, before any save', () => {
  const h = harness();
  h.queue.intend('head_item', item(10, 1));
  assert.equal(h.queue.display().head_item.id, 10);
  assert.equal(h.calls.save.length, 0);
});

test('taps within 400ms merge into one save carrying only the changed slots', async () => {
  const h = harness();
  h.queue.intend('head_item', item(10, 1));
  await h.advance(100);
  h.queue.intend('face_item', item(11, 2));
  await h.advance(MERGE_WINDOW_MS + 10);
  assert.deepEqual(h.calls.save, [{ version: 0, slots: { head_item: 10, face_item: 11 } }]);
  assert.equal(h.queue.savedVersion, 1);
  assert.deepEqual(h.saved.at(-1).head_item, 10);
});

test('ten taps in three seconds send at most three saves', async () => {
  const h = harness();
  for (let i = 0; i < 10; i += 1) {
    h.queue.intend('head_item', item(20 + i, 1));
    await h.advance(300);
  }
  await h.advance(2000);
  assert.ok(h.calls.save.length <= 3, `sent ${h.calls.save.length}`);
  assert.equal(h.server.slots.head_item.id, 29);
  assert.equal(h.queue.dirty, false);
});

test('tapping back to the saved look sends nothing', async () => {
  const h = harness();
  h.queue.intend('head_item', item(10, 1));
  h.queue.intend('head_item', null);
  await h.advance(2000);
  assert.equal(h.calls.save.length, 0);
});

test('an unknown version reads the look first, then saves against it', async () => {
  const h = harness({ version: 4, known: false });
  assert.equal(h.queue.savedVersion, null);
  h.queue.intend('head_item', item(10, 1));
  await h.advance(MERGE_WINDOW_MS);
  assert.equal(h.calls.load, 1);
  assert.equal(h.calls.save[0].version, 4);
  assert.equal(h.queue.savedVersion, 5);
});

test('409: adopt the other device, replay the pending taps once, and say so when the shark changed', async () => {
  const h = harness();
  // Another device wore glasses and saved first.
  h.server = { version: 1, slots: { ...SAVED, face_item: item(30, 2) } };
  h.queue.intend('head_item', item(10, 1));
  await h.advance(MERGE_WINDOW_MS * 3);
  assert.equal(h.calls.save.length, 2);
  assert.deepEqual(h.calls.save[1], { version: 1, slots: { head_item: 10 } });
  assert.equal(h.queue.display().face_item.id, 30);
  assert.equal(h.queue.display().head_item.id, 10);
  assert.deepEqual(h.notices, [{ kind: 'other_device', slots: ['face_item'] }]);
});

test('network failure keeps the look, retries at 2s and 6s, then puts back what did not save', async () => {
  const h = harness();
  h.script.push('offline', 'offline', 'offline');
  h.queue.intend('head_item', item(10, 1));
  await h.advance(MERGE_WINDOW_MS);
  assert.equal(h.calls.save.length, 1);
  assert.equal(h.queue.display().head_item.id, 10, 'still worn while retrying');
  await h.advance(RETRY_DELAYS_MS[0]);
  assert.equal(h.calls.save.length, 2);
  await h.advance(RETRY_DELAYS_MS[1]);
  assert.equal(h.calls.save.length, 3);
  assert.equal(h.calls.load, 1, 'reconciles with the server look');
  assert.equal(h.queue.display().head_item, null);
  assert.deepEqual(h.notices, [{ kind: 'save_failed', slots: ['head_item'] }]);
});

test('a retry that gets through saves quietly', async () => {
  const h = harness();
  h.script.push('offline');
  h.queue.intend('head_item', item(10, 1));
  await h.advance(MERGE_WINDOW_MS + RETRY_DELAYS_MS[0]);
  assert.equal(h.server.slots.head_item.id, 10);
  assert.deepEqual(h.notices, []);
});

test('422: the item that is not in the closet comes off with a notice', async () => {
  const h = harness();
  h.script.push('reject');
  h.queue.intend('head_item', item(10, 1));
  await h.advance(MERGE_WINDOW_MS);
  assert.equal(h.queue.display().head_item, null);
  assert.deepEqual(h.notices, [{ kind: 'not_owned', slots: ['head_item'] }]);
});

test('an older backend without /me/look falls back to one PUT /me/inventory toggle per slot', async () => {
  const h = harness({ legacy: true });
  h.queue.intend('head_item', item(10, 1));
  h.queue.intend('face_item', item(11, 2));
  await h.advance(MERGE_WINDOW_MS * 4);
  assert.deepEqual(plain(h.calls.legacy), [10, 11]);
  // Taking a worn item off toggles that same item.
  h.queue.intend('head_item', null);
  await h.advance(MERGE_WINDOW_MS * 2);
  assert.deepEqual(plain(h.calls.legacy), [10, 11, 10]);
  assert.equal(h.calls.save.length, 1, 'only the first save probes /me/look');
});

test('changedSlots compares by item id', () => {
  assert.deepEqual(plain(changedSlots({ head_item: item(1, 1), face_item: null }, { head_item: item(1, 1), face_item: item(2, 2) })), ['face_item']);
});

test('the save endpoint maps 409, 404 and 422 and throws on network failure', async () => {
  const replies = [];
  const look = loadTs('src/api/endpoints/me/look.ts', {
    '../../client': { __esModule: true, default: { put: async () => { const next = replies.shift(); if (next.ok) return { data: { data: next.ok } }; throw next.error; } } },
  });
  replies.push({ ok: { version: 2, slots: {} } });
  assert.equal((await look.putLook(1, { head_item: 3 })).kind, 'saved');
  replies.push({ error: { response: { status: 409, data: { data: { version: 5, slots: {} } } } } });
  assert.deepEqual(plain(await look.putLook(1, { head_item: 3 })), { kind: 'conflict', look: { version: 5, slots: {} } });
  replies.push({ error: { response: { status: 404, data: {} } } });
  assert.equal((await look.putLook(1, { head_item: 3 })).kind, 'unsupported');
  replies.push({ error: { response: { status: 422, data: { errors: { 'slots.face_item': ['no'] } } } } });
  assert.deepEqual(plain(await look.putLook(1, { head_item: 3, face_item: 4 })), { kind: 'rejected', slots: ['face_item'] });
  replies.push({ error: new Error('Network Error') });
  await assert.rejects(look.putLook(1, { head_item: 3 }));
});

test('wearable rarity: white Common, CODE and VIP labels instead of a rarity, Legendary double stroke', () => {
  assert.deepEqual(plain(wardrobe.wearableBadge({ rarity: 1 })), { rarity: 1, border: '#FFFFFF', inner: null, glow: null, label: null, labelColor: '#123e65' });
  assert.equal(wardrobe.wearableBadge({}).border, '#FFFFFF', 'old backends read as Common');
  assert.equal(wardrobe.wearableBadge({ rarity: 2 }).label, 'UNCOMMON');
  assert.equal(wardrobe.wearableBadge({ rarity: 3, source: 'vip' }).label, 'VIP');
  assert.equal(wardrobe.wearableBadge({ rarity: 2, is_coin_code_item: true }).label, 'CODE');
  assert.equal(wardrobe.wearableBadge({ rarity: 4 }).border, '#FF6B00');
  assert.equal(wardrobe.wearableBadge({ rarity: 4 }).labelColor, '#E05A00');
  const legendary = wardrobe.wearableBadge({ rarity: 5, source: 'level' });
  assert.deepEqual([legendary.border, legendary.inner, legendary.label], ['#FFD700', '#123e65', 'LEGENDARY']);
  // Prep items, stamps and ride parts keep their green Common.
  const system = fs.readFileSync('src/design-system.ts', 'utf8');
  assert.match(system, /1: \{ name: 'Common', color: colors\.rarity\.common\.main/);
});

test('slots, names and outfits map the way the server does', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map((type) => wardrobe.slotForItem({ item_type: { id: type } })),
    ['head_item', 'face_item', 'neck_item', 'body_item', 'hand_item', 'background_item', 'skin_item', 'pin_item']);
  assert.equal(wardrobe.slotForItem({ item_type: { id: 99 } }), null);
  assert.equal(wardrobe.itemDisplayName({ name: 'Epcot Beta Party Hat', display_name: 'Beta Party Hat' }), 'Beta Party Hat');
  assert.equal(wardrobe.itemDisplayName({ name: 'Party Hat', display_name: '  ' }), 'Party Hat');
  const slots = plain(wardrobe.lookSlotsOf({ id: 3, skin_item: item(2, 7), head_item: item(10, 1) }));
  assert.equal(Object.keys(slots).length, 8);
  assert.equal(slots.face_item, null);
  assert.equal(slots.head_item.id, 10);
});

function card(target, inventory, extra = {}) {
  return runtime('src/components/Item.tsx', {
    '../context/AuthProvider': { AuthContext: { value: { player: { id: 5, inventory: {} } } } },
    '../helpers/wardrobe': wardrobe,
    '../hooks/useReducedGameMotion': { default: () => extra.reduceMotion ?? false },
  }, { item: target, inventory, onToggle: () => {}, ...extra.props });
}
const collect = (node, predicate, found = []) => {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) { node.forEach((child) => collect(child, predicate, found)); return found; }
  if (predicate(node)) found.push(node);
  collect(node.props?.children, predicate, found);
  return found;
};
const texts = (tree) => collect(tree, (n) => n.type === 'Text').map((n) => [].concat(n.props.children).join(''));
const pressable = (app) => app.find((n) => n.type === 'Pressable');
const flat = (style) => Object.assign({}, ...[].concat(typeof style === 'function' ? style({ pressed: false }) : style).flat(3).filter(Boolean));

test('cards: the border is rarity only, WORN is the yellow pill plus a navy check, never the border', () => {
  const look = { skin_item: item(2, 7), head_item: item(10, 1, { rarity: 4 }) };
  const epicWorn = card(item(10, 1, { rarity: 4 }), look);
  assert.equal(flat(pressable(epicWorn).props.style).borderColor, '#FF6B00');
  assert.ok(texts(epicWorn.tree).includes('WORN'));
  assert.ok(texts(epicWorn.tree).includes('EPIC'));
  assert.equal(collect(epicWorn.tree, (n) => n.props?.style?.backgroundColor === '#123e65' && n.props?.style?.borderRadius === 10).length, 1, 'check stamp');

  const commonWorn = card(item(11, 2), { face_item: item(11, 2) });
  assert.equal(flat(pressable(commonWorn).props.style).borderColor, '#FFFFFF');
  assert.ok(!texts(commonWorn.tree).some((text) => /COMMON/.test(text)), 'Common has no label');
});

test('cards: NEW for unseen owned items, VIP and CODE sources, reviewed names', () => {
  const fresh = card(item(12, 1, { seen: false, display_name: 'Beta Party Hat', name: 'Epcot Beta Party Hat' }), {});
  assert.ok(texts(fresh.tree).includes('NEW'));
  assert.ok(texts(fresh.tree).includes('Beta Party Hat'));
  assert.equal(pressable(fresh).props.accessibilityLabel, 'Wear Beta Party Hat on your shark');

  const wornFresh = card(item(13, 1, { seen: false }), { head_item: item(13, 1) });
  assert.ok(!texts(wornFresh.tree).includes('NEW'), 'WORN outranks NEW');

  assert.ok(texts(card(item(14, 3, { rarity: 3, is_member_item: true }), {}).tree).includes('VIP'));
  assert.ok(texts(card(item(15, 4, { rarity: 2, is_coin_code_item: true, paper_url: null }), {}).tree).includes('CODE'));
});

test('cards: a deep-linked item pulses a gold ring twice, and only the ring under Reduce Motion', () => {
  const lit = card(item(16, 1), {}, { props: { highlighted: true } });
  assert.equal(collect(lit.tree, (n) => n.props?.style?.borderColor === '#ffcf3b').length, 1);
  assert.equal(lit.animations.filter((a) => a.kind === 'sequence' && a.started).length, 1);
  const still = card(item(16, 1), {}, { props: { highlighted: true }, reduceMotion: true });
  assert.equal(collect(still.tree, (n) => n.props?.style?.borderColor === '#ffcf3b').length, 1);
  assert.equal(still.animations.filter((a) => a.started).length, 0);
});

test('Inventory: same screen, NEW is reported in batches, the deep link pins its item, copy has no em dashes', () => {
  const screen = fs.readFileSync('src/screens/InventoryScreen.tsx', 'utf8');
  assert.match(screen, /<TopbarText>Inventory<\/TopbarText>/);
  assert.match(screen, /height: 400,/);
  assert.match(screen, /itemVisiblePercentThreshold: 60, minimumViewTime: 800/);
  assert.match(screen, /markItemsSeen\(ids\)/);
  assert.match(screen, /getItems\(currentItemType\.id, page, pin\)/);
  assert.match(screen, /setParams\?\.\(\{ highlightItemId: undefined \}\)/);
  assert.match(screen, /estimatedItemSize=\{compact \? 116 : 150\}/);
  const items = fs.readFileSync('src/api/endpoints/me/inventory/items.ts', 'utf8');
  assert.match(items, /pin_item_id: pinItemId/);
  for (const file of ['src/screens/InventoryScreen.tsx', 'src/components/Item.tsx', 'src/helpers/wardrobe.ts', 'src/helpers/lookQueue.ts', 'src/hooks/useLook.ts']) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /—/, `${file} has an em dash`);
  }
});

test('the save failure copy matches the spec', () => {
  const source = fs.readFileSync('src/screens/InventoryScreen.tsx', 'utf8');
  assert.match(source, /'Updated from your other device\.'/);
  assert.match(source, /"That item isn't in your closet\."/);
  assert.match(source, /"Couldn't save\. Your shark is back to your last look\."/);
});

test('tapping a worn item on the shark takes it off even though worn items carry no item_type', () => {
  const screen = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/screens/InventoryScreen.tsx'), 'utf8');
  assert.match(screen, /onItemTap=\{\(item, slot\) => changeOutfit\(item, true, slot\)\}/);
  const fn = screen.slice(screen.indexOf('const changeOutfit'), screen.indexOf('look.set(slot'));
  assert.match(fn, /SLOT_KEYS\.find\(\(key\) => key === tappedSlot\)/);
  assert.match(fn, /\?\.id === item\.id\)/);
});

test('the inventory shark keeps its original stage size (460 tall, lifted 50)', () => {
  const screen = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/screens/InventoryScreen.tsx'), 'utf8');
  const card = screen.slice(screen.indexOf('<Playercard'), screen.indexOf('/>', screen.indexOf('<Playercard')));
  assert.match(card, /height: 460,\s*marginTop: -50,/);
});
