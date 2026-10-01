'use strict';
/**
 * S0 economy core, app side (economy review K15, K16): one PresentationQueue
 * for full-screen moments, one haptic gate (1 per 120ms, priority) and one
 * SFX voice limiter (2 voices).
 */
const assert = require('node:assert/strict'), test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const queueModule = () => loadTs('src/services/presentation/PresentationQueue.ts');
const req = (id, kind, badge = 'standings') => ({ id, kind, badge });

test('one moment at a time, Crowning > Home Hunt results > re-mint > reward sheets', () => {
  const q = queueModule().createPresentationQueue(5);
  assert.equal(q.enqueue(req('sheet', 'reward_sheet')), 'showing');
  assert.equal(q.enqueue(req('remint', 'remint')), 'queued');
  assert.equal(q.enqueue(req('hunt', 'home_hunt_results')), 'queued');
  assert.equal(q.enqueue(req('crown', 'crowning')), 'queued');
  assert.equal(q.getState().current.id, 'sheet', 'a showing moment is never interrupted');
  const order = [];
  for (let i = 0; i < 4; i++) {
    const current = q.getState().current;
    order.push(current.id);
    q.dismiss(current.id);
  }
  assert.deepEqual(order, ['sheet', 'crown', 'hunt', 'remint']);
  assert.equal(q.getState().current, null);
});

test('at most 2 full-screen moments per app open; the rest become badge dots', () => {
  const m = queueModule();
  assert.equal(m.FULL_SCREEN_PER_APP_OPEN, 2);
  const q = m.createPresentationQueue();
  q.enqueue(req('a', 'reward_sheet', 'inventory'));
  q.enqueue(req('b', 'remint', 'coin_shelf'));
  q.enqueue(req('c', 'home_hunt_results', 'standings'));
  q.dismiss('a');
  assert.equal(q.getState().current.id, 'c', 'the higher priority goes second');
  q.dismiss('c');
  assert.equal(q.getState().current, null);
  assert.deepEqual(plain(q.badgesFor('coin_shelf').map(item => item.id)), ['b']);
  assert.equal(q.enqueue(req('d', 'crowning', 'coin_shelf')), 'badge', 'even a Crowning waits as a badge past the cap');
  assert.equal(q.enqueue(req('d', 'crowning', 'coin_shelf')), 'badge', 'a duplicate never stacks');
  assert.equal(q.getState().badges.length, 2);
  q.clearBadge('b');
  assert.deepEqual(plain(q.getState().badges.map(item => item.id)), ['d']);
});

test('a new app open resets the allowance and a re-sent badge gets its turn', () => {
  const q = queueModule().createPresentationQueue(1);
  q.enqueue(req('first', 'reward_sheet'));
  q.dismiss('first');
  assert.equal(q.enqueue(req('results', 'home_hunt_results')), 'badge');
  q.startAppOpen();
  assert.equal(q.getState().current, null, 'badges stay badges on their own');
  assert.equal(q.enqueue(req('results', 'home_hunt_results')), 'showing');
  assert.equal(q.getState().badges.length, 0);
});

test('subscribers hear every change', () => {
  const q = queueModule().createPresentationQueue();
  let calls = 0;
  const off = q.subscribe(() => { calls += 1; });
  q.enqueue(req('x', 'reward_sheet'));
  q.dismiss('x');
  off();
  q.enqueue(req('y', 'reward_sheet'));
  assert.equal(calls, 2);
});

function hapticHarness() {
  const fired = [];
  const timers = [];
  let clock = 1000;
  const haptics = loadTs('src/gamekit/Haptics.ts', { 'expo-haptics': { impactAsync() {}, selectionAsync() {}, notificationAsync() {},
    ImpactFeedbackStyle: {}, NotificationFeedbackType: {} } });
  const gate = haptics.createHapticGate({
    fire: intent => fired.push([clock, intent]),
    now: () => clock,
    schedule: (fn, ms) => timers.push([clock + ms, fn]),
  });
  const advance = ms => {
    clock += ms;
    for (const timer of timers.splice(0)) {
      if (timer[0] <= clock) timer[1](); else timers.push(timer);
    }
  };
  return { haptics, gate, fired, advance };
}

test('haptics: at most 1 per 120ms app-wide', () => {
  const { haptics, gate, fired, advance } = hapticHarness();
  assert.equal(haptics.HAPTIC_GATE_MS, 120);
  assert.equal(gate.request('tapLight'), 'fired');
  assert.equal(gate.request('tapLight'), 'queued');
  advance(60);
  assert.equal(fired.length, 1);
  advance(60);
  assert.deepEqual(plain(fired), [[1000, 'tapLight'], [1120, 'tapLight']]);
  // 10 taps in 3 s never fire faster than the gate.
  for (let i = 0; i < 10; i++) { gate.request('tickSelection'); advance(30); }
  advance(500);
  for (let i = 1; i < fired.length; i++) assert.ok(fired[i][0] - fired[i - 1][0] >= 120);
});

test('haptics: a land replaces a queued selection, a selection never replaces a land', () => {
  const { gate, fired, advance } = hapticHarness();
  gate.request('tapLight');
  assert.equal(gate.request('tickSelection'), 'queued');
  assert.equal(gate.request('comboHeavy'), 'queued');
  assert.equal(gate.request('tickSelection'), 'dropped');
  assert.equal(gate.pending(), 'comboHeavy');
  advance(120);
  assert.deepEqual(plain(fired.map(entry => entry[1])), ['tapLight', 'comboHeavy']);
});

test('sfx: 2 voices; land > tap > whoosh steals the lowest oldest voice', () => {
  let clock = 0;
  const { createSfxLimiter, SFX_PRIORITY, SFX_MAX_VOICES } = loadTs('src/audio/sfxLimiter.ts');
  assert.equal(SFX_MAX_VOICES, 2);
  const limiter = createSfxLimiter({ now: () => clock });
  const stopped = [];
  const whoosh = limiter.request('whoosh', { priority: SFX_PRIORITY.whoosh, stop: () => stopped.push('whoosh') });
  clock = 10;
  limiter.request('tap', { priority: SFX_PRIORITY.tap, stop: () => stopped.push('tap') });
  clock = 20;
  assert.notEqual(limiter.request('land', { priority: SFX_PRIORITY.land }), null);
  assert.deepEqual(stopped, ['whoosh']);
  assert.equal(limiter.active().length, 2);
  assert.equal(limiter.request('whoosh', { priority: SFX_PRIORITY.whoosh }), null, 'a weaker sound is dropped, never steals');
  assert.ok(whoosh > 0);
});

test('sfx: a whoosh is dropped while another flight is airborne, and slots free up when sounds end', () => {
  let clock = 0;
  const { createSfxLimiter, SFX_PRIORITY } = loadTs('src/audio/sfxLimiter.ts');
  const limiter = createSfxLimiter({ now: () => clock });
  limiter.request('whoosh', { priority: SFX_PRIORITY.whoosh, durationMs: 300 });
  assert.equal(limiter.request('whoosh', { priority: SFX_PRIORITY.whoosh, dropIfActive: true }), null);
  clock = 301;
  assert.notEqual(limiter.request('whoosh', { priority: SFX_PRIORITY.whoosh, dropIfActive: true }), null);
  const id = limiter.request('tap', { priority: SFX_PRIORITY.tap });
  limiter.release(id);
  assert.equal(limiter.active().length, 1);
});
