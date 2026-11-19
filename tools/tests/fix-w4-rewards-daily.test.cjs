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
const chestDay = loadTs('src/services/retention/chestDay.ts');

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

test('T096 (B07): the first look is told to the server once, only by a server that keeps seen_at', () => {
  const api = read('src/api/endpoints/retention/index.ts');
  assert.match(api, /client\.post<[^>]+>\('\/me\/daily-three\/seen'/);
  const hook = read('src/components/retention/useRetention.tsx');
  assert.match(hook, /if \(daily\.seen_at === null\) void markDailyThreeSeen\(\)/, 'absent field: nothing is sent (today\'s behavior)');
});

test('T110 (B06): a chest that started over says why, once, kindly; absent field means today\'s card', () => {
  assert.equal(chestDay.chestRestartLine({ days_away: 3 }), 'Welcome back! Away 3 days, so your chest starts at Day 1 again.');
  assert.equal(chestDay.chestRestartLine({ days_away: 1 }), 'Welcome back! Away 1 day, so your chest starts at Day 1 again.');
  assert.equal(chestDay.chestRestartLine(null), null);
  assert.equal(chestDay.chestRestartLine(undefined), null);
  assert.equal(chestDay.chestRestartLine({ days_away: 0 }), null);
  const base = { daily3: null, weekly: null, levelChest: null, trail: null, stamps: null, events: null };
  const row = r => model.rewardsRows({ ...base, dailyChest: { unclaimed: true, day: 1, of: 7, restarted: r } })[0].line;
  assert.equal(row(true), 'Welcome back! Day 1 of 7 is ready');
  assert.equal(row(false), 'Day 1 of 7 is ready');
  const gift = read('src/components/DailyGiftModal.tsx');
  assert.match(gift, /const restartLine = chestRestartLine\(displayedGift\.streak_reset \?\? dailyGift\.streak_reset\);/);
  assert.match(gift, /!simple && !!restartLine && phase !== 'open' && <Text style=\{styles\.restart\}/);
  // The flame says the same kind thing in Rewards (fix round w3).
  assert.equal(model.flameNote({ flame: 0, best: 4, done: 0, total: 3, claimable: false, claimed: false }), 'Welcome back! Finish Daily 3 to light a new flame');
});

test('T104: the chest card is sized to its prizes, the lid pops on the phone, prizes land together, no white oval', () => {
  const L = loadTs('src/services/retention/logic.ts');
  const four = [{ kind: 'xp' }, { kind: 'energy' }, { kind: 'coins' }, { kind: 'tickets' }];
  assert.equal(L.rowsAreaHeight(four, false, 300), 4 * 46 + 3 * 6 + 8, 'four prizes: a tight area, not 300');
  assert.equal(L.rowsAreaHeight([], false, 300), 64, 'nothing known yet: a short line, never a tall empty panel');
  assert.equal(L.rowsAreaHeight([...four, { kind: 'item' }, { kind: 'mystery_boxes' }], false, 300), 300, 'capped, then it scrolls');
  const quick = L.rowSchedule(four, 110, 380, 80);
  assert.ok(quick[3] - quick[0] <= 330, `prizes land together (${quick.join(',')})`);
  const reveal = read('src/components/retention/RewardReveal.tsx');
  assert.match(reveal, /const lid = setTimeout\(\(\) => \{ cancelAnimation\(shake\); shake\.value = 0; popLid\(\); \}, reducedMotion \? 0 : LOCAL_POP_MS\);/);
  assert.match(reveal, /!revealed && popped && previewRows\.length \? previewRows\.map/, 'the held prizes wait inside, dim');
  assert.doesNotMatch(reveal, /styles\.flash|useCountUp/, 'no white flash oval, no count-up');
  assert.match(reveal, /colors=\{GOLD_BURST\}/, 'a gold burst');
  const hook = read('src/components/retention/useRetention.tsx');
  assert.match(hook, /preview=\{chestPreview\(r\.src, daily, chests\.find\(c => c\.level === r\.level\) \?\? null\)\}/);
});

test('T107: Daily 3 reads as three pictured goals, their chest, one This week row and BACK', () => {
  const sheet = read('src/components/retention/Daily3Sheet.tsx');
  const body = sheet.slice(sheet.indexOf('<View style={styles.card}>'), sheet.indexOf('{coach && <Coach'));
  const order = ['<View style={styles.goals}>', '<ChestBlock', 'styles.weekRow', '{closeLabel}'].map(k => body.indexOf(k));
  assert.ok(order.every(n => n >= 0), 'all four parts are there');
  assert.deepEqual(plain([...order].sort((a, b) => a - b)), plain(order), 'goals, chest, This week, BACK in that order');
  assert.doesNotMatch(body, /styles\.hero\b|New goals tomorrow/, 'no flame hero card on top, no extra footer line');
  // Week dots, the gift line, freezes and the milestone tease wait behind the This week row.
  const more = body.slice(body.indexOf('{weekOpen && ('));
  for (const k of ['<WeekDay', 'weekStartsLine(state.week)', '{tease && (', 'showFreezes &&']) assert.ok(more.includes(k), k);
  assert.match(sheet, /goal\.target > 1 && !doneNow && <View style=\{styles\.goalCount\}>/, 'each goal leads with its picture and number');
  assert.match(body, /state\.week\.claimable \? onClaimWeekly :/, 'a ready Weekly Box opens from the row itself');
});
