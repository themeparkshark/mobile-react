const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');

function realm() {
  const timers = [];
  const globals = {
    setTimeout: (fn, ms) => { const t = { fn, ms, unref() {} }; timers.push(t); return t; },
    clearTimeout: t => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); },
  };
  return { W: loadTs('src/services/walletSync.ts', {}, globals), timers };
}

test('T139: a spend or game start answer moves the header Tickets at once (the punch never shows the old 80)', () => {
  const { W } = realm();
  const patches = [];
  W.setWalletSink({ patch: p => patches.push(plain(p)), refresh: async () => undefined });
  W.noteApiAnswer('post', '/me/task-attempts', { data: { attempt: { id: 1 }, tickets: 79 } });
  W.noteApiAnswer('post', '/me/spend-tickets', { data: { tickets: 78, spent: 1 } });
  W.noteApiAnswer('post', '/prep-items/4/redeem', { data: { rewards: { tickets: 1 }, new_totals: { energy: 30, tickets: 79, experience: 120 } } });
  W.noteApiAnswer('post', '/me/trip-goal', { data: { wallet: { tickets: 80, energy: 31 } } });
  assert.deepEqual(patches, [{ tickets: 79 }, { tickets: 78 }, { tickets: 79, energy: 30, experience: 120 }, { tickets: 80, energy: 31 }]);
  // A reward amount is never read as a balance.
  assert.equal(W.walletFromAnswer('post', '/me/stamps/3/claim', { data: { tickets: 5 } }), null);
  assert.equal(W.walletFromAnswer('get', '/me/trip-goal', { data: { wallet: { tickets: 2 } } }), null, 'reads never patch (an old GET could land late)');
});

test('T139: every grant or spend asks for one fresh /me, coalesced, retried while the server is slow', async () => {
  const { W, timers } = realm();
  let refreshes = 0;
  let fail = true;
  W.setWalletSink({ patch() {}, refresh: async () => { refreshes += 1; if (fail) throw new Error('timeout'); } });
  W.noteApiAnswer('post', '/me/daily-three/claim', { data: {} });
  W.noteApiAnswer('post', '/me/stamps/9/claim', { data: {} });
  assert.equal(timers.length, 1, 'two grants, one refresh');
  assert.equal(timers[0].ms, W.WALLET_REFRESH_DEBOUNCE_MS);
  timers.shift().fn();
  await new Promise(r => setImmediate(r));
  assert.equal(refreshes, 1);
  assert.equal(timers.length, 1, 'a slow /me is tried again');
  assert.equal(timers[0].ms, 2000);
  fail = false;
  timers.shift().fn();
  await new Promise(r => setImmediate(r));
  assert.equal(refreshes, 2);
  assert.equal(timers.length, 0, 'done once the header is true');
  // Seen marks, heartbeats and reads never trigger a /me.
  for (const [m, u] of [['post', '/me/shark-pass/seen'], ['post', '/me/line-sessions/a/heartbeat'], ['get', '/me/stamps'], ['post', '/me/push-tokens']]) {
    assert.equal(W.isWalletWrite(m, u), false, `${m} ${u}`);
  }
  for (const u of ['/me/level-chests/3/open', '/me/shark-pass/claim-all', '/me/shop/redeem', '/prep-items/2/redeem', '/me/vip-gift/claim', '/me/trail/boxes/4/open', '/raids/2/attack']) {
    assert.equal(W.isWalletWrite('post', u), true, u);
  }
});

test('T139: /me answers apply in order, never joined to an older read; the client feeds every answer', () => {
  const auth = read('src/context/AuthProvider.tsx');
  assert.match(auth, /const asked = \+\+meAsked\.current;/);
  assert.match(auth, /if \(asked < meApplied\.current\) return response;/, 'an older /me never overwrites a newer one');
  assert.match(auth, /getMe\(\{ throwOnError: true, fresh: true \}\)/);
  assert.match(auth, /setWalletSink\(\{/);
  assert.match(read('src/api/endpoints/me/me.ts'), /\.\.\.\(fresh \? \{ tpsNoDedupe: true \} : \{\}\)/);
  assert.match(read('src/api/client.ts'), /noteApiAnswer\(response\.config\?\.method, response\.config\?\.url, response\.data\)/);
});
