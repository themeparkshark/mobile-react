'use strict';
/**
 * Fix pass w4, lane rewards-daily (Nov 18 2026): Daily 3 met as goals that tick one by one (T096), the reset
 * reason (T110), the chest reveal (T104), the Daily 3 sheet (T107), tomorrow pictured (T103, N13).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const storage = { '@react-native-async-storage/async-storage': { default: { getItem: async () => null, setItem: async () => undefined } } };
const seen = loadTs('src/services/retention/daily3Seen.ts', storage);
const model = loadTs('src/services/retention/rewardsModel.ts');

const goals = [{ key: 'chest', done: true }, { key: 'catch', done: false }, { key: 'play', done: true }];

test('T096: first sight of the day ticks every goal already done, in goal order; never once seen', () => {
  assert.deepEqual(plain(seen.ticksOnFirstSight({ goals }, false)), ['chest', 'play']);
  assert.deepEqual(plain(seen.ticksOnFirstSight({ goals }, true)), []);
  // The server's own list (B07) leads; a goal done since then still ticks.
  assert.deepEqual(plain(seen.ticksOnFirstSight({ goals, done_before_seen: ['play'] }, false)), ['play', 'chest']);
  assert.deepEqual(plain(seen.ticksOnFirstSight({ goals, done_before_seen: [] }, false)), ['chest', 'play']);
});

test('T096: seen is the server seen_at or this phone record of the day', () => {
  assert.equal(seen.seenToday({ date: '2026-11-18' }, null), false);
  assert.equal(seen.seenToday({ date: '2026-11-18', seen_at: null }, '2026-11-17'), false);
  assert.equal(seen.seenToday({ date: '2026-11-18', seen_at: '2026-11-18T20:00:00Z' }, null), true);
  assert.equal(seen.seenToday({ date: '2026-11-18', seen_at: null }, '2026-11-18'), true);
});

test('T096: the chest is offered only after the last tick has landed', () => {
  assert.equal(seen.chestAfterTicksMs(0), 0);
  assert.equal(seen.chestAfterTicksMs(3), seen.TICK_FIRST_MS + 2 * seen.TICK_GAP_MS + seen.TICK_SETTLE_MS);
  const sheet = read('src/components/retention/Daily3Sheet.tsx');
  assert.match(sheet, /const ready = state\.claimable && ticked < 0;/, 'OPEN! waits for the ticks');
  assert.match(sheet, /const doneNow = goal\.done && ticked;/, 'a goal reads done only on its own beat');
  assert.match(sheet, /tick=\{celebrate\.includes\(g\.key\) \? celebrate\.indexOf\(g\.key\) : null\} held=\{ticksHeld\}/);
});

test('T096: before the goals were shown, the Rewards row names the goals, never a done count or the chest', () => {
  const base = { dailyChest: null, weekly: null, levelChest: null, trail: null, stamps: null, events: null };
  for (const d of [{ done: 3, claimable: true }, { done: 1, claimable: false }, { done: 0, claimable: false }]) {
    const row = model.rewardsRows({ ...base, daily3: { ...d, total: 3, claimed: false, flame: 0, seen: false } }).find(r => r.key === 'daily3');
    assert.equal(row.line, 'See your 3 goals for today');
    assert.equal(row.action, 'go');
    assert.doesNotMatch(row.line, /done|chest/i);
  }
  const hook = read('src/components/retention/useRetention.tsx');
  assert.match(hook, /const first = ticksOnFirstSight\(/, 'opening the sheet plays the first-sight ticks');
  assert.match(hook, /if \(first\.length\) setCelebrate\(first\);/);
  assert.match(hook, /ticksHeld=\{coach\}/, 'the ticks wait for the how-it-works card');
});
