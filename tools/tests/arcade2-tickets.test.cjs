// Lane app-tickets, fix pass 1 (Nov 20 2026): P13, P19, P20, P14, P23 and the Get Tickets hand-offs.
const assert = require('node:assert/strict');
const test = require('node:test');
const { read } = require('./helpers/load-ts.cjs');

test('P13 the unwon coin card is anchored on a real view, so it opens centered from any shelf slot', () => {
  // Every sheet is drawn in a window overlay placed from its parent's native frame (ui/OverlaySheet.tsx). A shelf
  // slot's wrappers are layout only and get flattened, which put the card and its backdrop at the slot's offset.
  const src = read('src/components/UnfoundCoinModal.tsx');
  const anchorAt = src.indexOf('<View collapsable={false} pointerEvents="box-none" style={styles.modalAnchor}>');
  const modalAt = src.indexOf('<Modal', anchorAt);
  assert.ok(anchorAt > 0, 'the card has a non-collapsable anchor view');
  assert.ok(modalAt > anchorAt && !src.slice(anchorAt, modalAt).includes('</View>'), 'the Modal sits inside the anchor');
  assert.ok(src.indexOf('</Modal>\n      </View>') > modalAt, 'the anchor closes right after the Modal');
  assert.match(src, /modalAnchor: \{ position: 'absolute', top: 0, left: 0, width: 0, height: 0 \}/);
  // It can always be closed: the backdrop, a swipe and Not now (or Got It!) all close it.
  assert.match(src, /onBackdropPress=\{\(\) => setVisible\(false\)\}/);
  assert.match(src, /onSwipeComplete=\{\(\) => setVisible\(false\)\}/);
  assert.match(src, />Not now</);
  assert.match(src, /text="Got It!" onPress=\{\(\) => setVisible\(false\)\}/);
});

function memoryStorage() {
  const data = new Map();
  return { data, store: { __esModule: true, default: {
    getItem: async key => (data.has(key) ? data.get(key) : null),
    setItem: async (key, value) => { data.set(key, value); },
    removeItem: async key => { data.delete(key); }, getAllKeys: async () => [...data.keys()],
    multiGet: async keys => keys.map(key => [key, data.has(key) ? data.get(key) : null]),
  } } };
}

test('P19 an old win card comes back only on its own park map, with its own price and park', async () => {
  const { loadTs } = require('./helpers/ts-module.cjs');
  const { data, store } = memoryStorage();
  const pending = loadTs('src/services/task-attempt/pendingWins.ts', {
    '@react-native-async-storage/async-storage': store,
    '../../api/endpoints/me/task-attempts': { getTaskAttempt: async id => ({ attempt: { id, status: 'won', ticket_cost: 3 } }) },
  });
  const cp = loadTs('src/services/task-attempt/checkpoint.ts', { '@react-native-async-storage/async-storage': store });
  const base = { version: 1, playerId: 96, requestId: 'tps-1234567890-abcdefgh', latitude: 28.47, longitude: -81.44, savedAt: Date.now() };
  // Won at Epic Universe (park 10), card left open, app relaunched at Magic Kingdom (park 2).
  await cp.writeTaskAttemptCheckpoint({ ...base, taskType: 'task', taskId: 70, attemptId: 901, card: { name: 'Stardust Racers', park_id: 10 } });
  assert.equal((await pending.findPendingWin(96, undefined, 2)).win, null, 'never on another park map');
  assert.equal(data.has('task_attempt_checkpoint_v1_96_task_70'), true, 'kept for its own park');
  assert.equal((await pending.findPendingWin(96, undefined, null)).win, null, 'never at home or with no park');
  const home = await pending.findPendingWin(96, undefined, 10);
  assert.equal(home.win.attempt.id, 901, 'back on its own park map');
  const model = pending.pendingWinRedeemable(home.win).model;
  assert.equal(model.park_id, 10);
  assert.equal(model.ticket_cost, 3, 'its own price, never a guessed 1');
  // A card saved by an older build names no park: it cannot prove where it belongs, so it stays put.
  await cp.writeTaskAttemptCheckpoint({ ...base, taskType: 'task', taskId: 71, attemptId: 902, card: { name: 'Mine-Cart Madness' }, savedAt: base.savedAt - 5 });
  assert.equal(pending.winBelongsHere(undefined, 10), false);
  assert.equal(pending.winBelongsHere(10, undefined), true, 'a caller that does not filter keeps the older rule');
  // The card writes its park; the map asks with its park.
  assert.match(read('src/components/RedeemRedeemableModal.tsx'), /\.\.\.\(park\?\.id \? \{ park_id: park\.id \} : \{\}\) \},/);
  assert.match(read('src/components/RedeemModal.tsx'), /findPendingWin\(player\.id, undefined, park\?\.id \?\? null\)/);
  assert.doesNotMatch(read('src/services/task-attempt/pendingWins.ts'), /ticket_cost: 1\b/);
});
