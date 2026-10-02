const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const seen = loadTs('src/services/help/seenTips.ts');
const gate = loadTs('src/services/help/tipGate.ts');

function memoryKv({ failRead = false, failWrite = false } = {}) {
  const data = new Map();
  return {
    data,
    async getItem(key) { if (failRead) throw new Error('read'); return data.has(key) ? data.get(key) : null; },
    async setItem(key, value) { if (failWrite) throw new Error('write'); data.set(key, value); },
    async removeItem(key) { data.delete(key); },
  };
}

test('seen state is stored per player under one versioned key', async () => {
  const kv = memoryKv();
  const a = seen.createSeenTipStore(kv, 18);
  const b = seen.createSeenTipStore(kv, 10);
  let state = await a.load();
  state = await a.mark('lineplay_intro', state);
  state = await a.mark('game:tap', state);
  assert.deepEqual([...await a.load()].sort(), ['game:tap', 'lineplay_intro']);
  assert.equal((await b.load()).size, 0, 'another player on the same phone starts fresh');
  assert.equal(seen.tipStorageKey(18), 'tps_tips_seen_v1:18');
  assert.equal(kv.data.get('tps_tips_seen_v1:18'), '["game:tap","lineplay_intro"]');
});

test('marking twice is a no-op and never loses earlier tips', async () => {
  const kv = memoryKv();
  const store = seen.createSeenTipStore(kv, 1);
  let state = await store.mark('park_hud', new Set());
  state = await store.mark('park_hud', state);
  state = await store.markMany(['coin_card', 'park_hud'], state);
  assert.deepEqual([...state].sort(), ['coin_card', 'park_hud']);
});

test('broken storage never traps a player', async () => {
  assert.equal(seen.parseSeen('not json').size, 0);
  assert.equal(seen.parseSeen('{"a":1}').size, 0);
  assert.deepEqual([...seen.parseSeen('["a", 3, "", null, "b"]')], ['a', 'b']);
  const unreadable = seen.createSeenTipStore(memoryKv({ failRead: true }), 1);
  assert.equal((await unreadable.load()).size, 0);
  assert.deepEqual(plain({ ...(await unreadable.loadState()), seen: [] }), { seen: [], fresh: false },
    'a failed read is not "fresh", so veterans are not re-marked on every launch');
  const unwritable = seen.createSeenTipStore(memoryKv({ failWrite: true }), 1);
  const kept = await unwritable.mark('coin_card', new Set());
  assert.ok(kept.has('coin_card'), 'memory still remembers the tip for this session');
});

test('a tip shows once, only when loaded, free, and nothing else is showing', () => {
  const free = { loaded: true, seen: new Set(), busy: false };
  assert.equal(seen.shouldShowTip('park_hud', free), true);
  assert.equal(seen.shouldShowTip('park_hud', { ...free, loaded: false }), false);
  assert.equal(seen.shouldShowTip('park_hud', { ...free, busy: true }), false);
  assert.equal(seen.shouldShowTip('park_hud', { ...free, tipShowing: true }), false);
  assert.equal(seen.shouldShowTip('park_hud', { ...free, seen: new Set(['park_hud']) }), false);
});

test('first launch on a device: veterans skip the new-player tips, feature tips still show once', async () => {
  const kv = memoryKv();
  const store = seen.createSeenTipStore(kv, 7);
  const first = await store.loadState();
  assert.equal(first.fresh, true);
  const veteran = seen.initialSeenFor(first.fresh, true, first.seen);
  for (const id of ['park_hud', 'coin_in_range', 'ride_challenge']) assert.ok(veteran.has(id), id);
  assert.equal(veteran.has('lineplay_intro'), false, 'LinePlay is new to everyone');
  assert.equal(seen.initialSeenFor(first.fresh, false, first.seen).size, 0, 'a new player sees everything');
  await store.markMany([], veteran);
  assert.equal((await store.loadState()).fresh, false);
  assert.equal(seen.initialSeenFor(false, true, new Set()), null, 'only the first load decides');
});

test('replay clears every tip without looking like a fresh install', async () => {
  const kv = memoryKv();
  const store = seen.createSeenTipStore(kv, 3);
  await store.markMany(['park_hud', 'game:memory'], new Set());
  assert.equal((await store.reset()).size, 0);
  const after = await store.loadState();
  assert.equal(after.fresh, false, 'a replaying veteran must not get the basics pre-skipped again');
  assert.equal(after.seen.size, 0);
});

test('veteran detection matches the Finn tutorial rule', () => {
  assert.equal(seen.isExistingPlayer(null), false);
  assert.equal(seen.isExistingPlayer({ completed_tasks_count: 0, total_experience: 35, friends_count: 0 }), false);
  assert.equal(seen.isExistingPlayer({ completed_tasks_count: 1 }), true);
  assert.equal(seen.isExistingPlayer({ total_experience: 51 }), true);
  assert.equal(seen.isExistingPlayer({ friends_count: 2 }), true);
});

test('map tips wait for a calm map: no game, dialog, find, chest, boss, Finn or coin flight', () => {
  const calm = { mapFocused: true, finnActive: false, rideOpen: false, findOpen: false, dialogOpen: false,
    bossOrChest: false, adventureOpen: false, coinFlying: false };
  assert.equal(gate.mapTipReady(calm), true);
  for (const key of Object.keys(calm)) {
    const busy = { ...calm, [key]: !calm[key] };
    assert.equal(gate.mapTipReady(busy), false, key);
  }
});

test('LinePlay tips never interrupt a game, a moving line or a sheet', () => {
  const calm = { screenReady: true, gameOpen: false, lineMoving: false, sheetOpen: false, finished: false };
  assert.equal(gate.linePlayTipReady(calm), true);
  for (const key of Object.keys(calm)) {
    assert.equal(gate.linePlayTipReady({ ...calm, [key]: !calm[key] }), false, key);
  }
});

test('the park tip waits for Finn\'s arrival lesson, then a coin in range beats the welcome', () => {
  assert.equal(gate.parkTipFor({ inPark: false, rideCoinInRange: true, arrivalLessonDone: true }), null);
  assert.equal(gate.parkTipFor({ inPark: true, rideCoinInRange: true, arrivalLessonDone: false }), null);
  assert.equal(gate.parkTipFor({ inPark: true, rideCoinInRange: false, arrivalLessonDone: true }), 'park_hud');
  assert.equal(gate.parkTipFor({ inPark: true, rideCoinInRange: true, arrivalLessonDone: true }), 'coin_in_range');
});
