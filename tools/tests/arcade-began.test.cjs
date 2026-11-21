// T6 (arcade plan, Nov 20 2026): the began mark. Saved on the phone first, then sent until it lands; sent again
// before any saved try is reopened; a try that began and is reopened is a loss, never a free replay.
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { read } = require('./helpers/load-ts.cjs');

function harness({ fail = () => null } = {}) {
  const store = new Map();
  const sent = [];
  const timers = [];
  const began = loadTs('src/services/task-attempt/began.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async k => store.get(k) ?? null, setItem: async (k, v) => { store.set(k, v); } } },
    '../../api/endpoints/me/task-attempts': { markTaskAttemptBegan: async id => {
      sent.push(id);
      const status = fail(id, sent.length);
      if (status === 'network') throw new Error('Network Error');
      if (status) { const e = new Error('http'); e.response = { status }; throw e; }
      return { attempt: { id, began_at: 'now' } };
    } },
  }, { setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {} });
  return { began, store, sent, timers };
}

test('the mark is saved on the phone before it is sent, and sent once per try (Memory\'s 3 boards are one try)', async () => {
  const h = harness();
  await h.began.markBegan(41, 1000);
  await h.began.markBegan(41, 1100);
  assert.deepEqual(h.sent, [41]);
  assert.equal(h.began.beganHere(41), true);
  assert.equal(JSON.parse(h.store.get(h.began.BEGAN_KEY)).length, 0, 'landed: the saved copy is cleared');
});

test('in a dead zone the mark stays saved, retries, and lands first on the next start', async () => {
  let online = false;
  const h = harness({ fail: () => (online ? null : 'network') });
  await h.began.markBegan(77, 1000);
  assert.equal(JSON.parse(h.store.get(h.began.BEGAN_KEY))[0].id, 77, 'saved on the phone');
  assert.equal(h.timers.length, 1, 'a retry is scheduled');
  assert.equal(h.began.beganHere(77), true, 'this phone knows the try began');
  online = true;
  await h.began.flushBegan(2000);
  assert.deepEqual(h.sent, [77, 77]);
  assert.equal(JSON.parse(h.store.get(h.began.BEGAN_KEY)).length, 0);
});

test('today\'s server has no began route: a 404 drops the mark (it treats every try as begun at PLAY!)', async () => {
  const h = harness({ fail: () => 404 });
  await h.began.markBegan(5, 1000);
  assert.equal(h.timers.length, 0, 'no endless retry');
  assert.equal(h.began.beganHere(5), false, 'today\'s behavior there: the try is not settled as a loss by the app');
  assert.equal(JSON.parse(h.store.get(h.began.BEGAN_KEY)).length, 0);
});

test('recovery sends saved marks before it reads or reopens a try', () => {
  const src = read('src/services/task-attempt/recovery.ts');
  assert.ok(src.indexOf('await flushBegan()') < src.indexOf('await getTaskAttempt('));
});

test('the ride card marks round 1 on the game going live (or the first touch after a how-to card) and reopens a begun try as a loss', () => {
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(modal, /if \(flowState === 'minigame' && !introAheadRef\.current\) sendBegan\(\);/);
  assert.match(modal, /if \(flowStateRef\.current === 'minigame'\) sendBegan\(\);/);
  const recovery = read('src/services/task-attempt/recovery.ts');
  assert.match(recovery, /if \(known && known\.attempt\.status === 'started' && \(!!known\.attempt\.began_at \|\| beganHere\(known\.attempt\.id\)\)\) \{\n\s+return resolveTaskAttempt\(known\.attempt\.id, 'loss'\);/);
  assert.match(read('src/api/endpoints/me/task-attempts.ts'), /client\.post<\{ data: TaskAttemptResponse \}>\(`\/me\/task-attempts\/\$\{id\}\/began`\)/);
});
