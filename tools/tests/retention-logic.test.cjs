const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));

function load(file) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, Date, Math, Number, Map, Promise, require() { return {}; } });
  return module.exports;
}

const L = load('src/services/retention/logic.ts');
// vm objects come from another realm: compare plain copies.
const plain = v => JSON.parse(JSON.stringify(v));

const goal = (key, done, kind = 'catch') => ({ key, kind, done, target: 1, progress: done ? 1 : 0, park: false, title: '', hint: '', icon: '' });
const state = (over = {}) => ({
  enabled: true, date: '2026-10-14', resets_at: '2026-10-15T07:00:00Z', level: 4,
  goals: [goal('chest', true, 'chest'), goal('catch', false), goal('bonus', false, 'look')],
  done: false, claimable: false, claimable_date: null, claimed: false,
  reward: { coins: 100, tickets: 1, energy: 20, xp: 40 },
  streak: { days: 3, best: 3, freezes: 1, freeze_cap: 2, freeze_price: 200, at_risk: true, counted_today: false },
  week: { key: '2026-W42', days: [], done: 2, needed: 5, claimable: false, claimed: false, reward: { coins: 300, tickets: 2, freezes: 1, mystery_boxes: 1 } },
  ...over,
});

test('reward rows follow what the server paid, rare things last, zeros skipped', () => {
  const rows = L.rewardRows({ coins: 700, tickets: 1, energy: 0, xp: 40, mystery_boxes: 1, item: { id: 3, name: 'Star Shades', image: 'x.png', rarity: 2 } });
  assert.deepEqual(plain(rows.map(r => r.kind)), ['coins', 'tickets', 'xp', 'item', 'mystery_boxes']);
  assert.equal(rows[0].label, 'coins');
  assert.equal(rows[1].label, 'Ticket');
  assert.equal(rows[3].label, 'Star Shades');
  assert.equal(rows[4].label, 'Mystery Box');
  assert.deepEqual(plain(L.rewardRows({ coins: 0, item: null })), []);
});

test('newly done goals pop once, only on a real change', () => {
  const before = [goal('a', false), goal('b', true), goal('c', false)];
  const after = [goal('a', true), goal('b', true), goal('c', false)];
  assert.deepEqual(plain(L.newlyDone(before, after)), ['a']);
  assert.deepEqual(plain(L.newlyDone(null, after)), [], 'the first load never celebrates');
  assert.deepEqual(plain(L.newlyDone(after, after)), []);
});

test('map button: pips per goal, a ready chest beats everything, streak nags only from 5 PM', () => {
  assert.deepEqual(plain(L.buttonState(state(), 10)), { pips: [true, false, false], streak: 3, attention: 'none' });
  assert.equal(L.buttonState(state(), 17).attention, 'risk');
  assert.equal(L.buttonState(state({ claimable: true }), 17).attention, 'claim');
  assert.equal(L.buttonState(state({ week: { ...state().week, claimable: true } }), 9).attention, 'weekly');
  assert.equal(L.buttonState(state({ streak: { ...state().streak, days: 0, at_risk: false } }), 19).attention, 'none');
});

test('weekday letters and the reset countdown', () => {
  assert.equal(L.weekdayLetter('2026-10-12'), 'M');
  assert.equal(L.weekdayLetter('2026-10-18'), 'S');
  const now = Date.parse('2026-10-15T02:00:00Z');
  assert.equal(L.resetLabel('2026-10-15T07:00:00Z', now), 'New goals in 5h');
  assert.equal(L.resetLabel('2026-10-15T02:40:00Z', now), 'New goals in 40m');
  assert.equal(L.resetLabel('2026-10-15T01:00:00Z', now), 'New goals soon');
});

test('next level chest is the lowest unopened', () => {
  const c = (level, opened) => ({ level, opened, preview: {}, rewards: null });
  assert.equal(L.nextLevelChest([c(6, false), c(4, true), c(5, false)]).level, 5);
  assert.equal(L.nextLevelChest([c(4, true)]), null);
});

test('streak copy never shames and says what to do', () => {
  assert.equal(L.streakLine(state()), '3-day streak. Finish today to make it 4!');
  assert.equal(L.streakLine(state({ done: true, streak: { ...state().streak, days: 4 } })), '4 days in a row!');
  assert.equal(L.streakLine(state({ streak: { ...state().streak, days: 0 } })), 'Finish all 3 to start a streak');
});

test('push pre-prompt: only while undecided, at most 3 asks, 3 days apart', () => {
  const now = Date.parse('2026-10-14T18:00:00Z');
  assert.equal(L.pushAskAllowed({ asks: 0, lastAt: null }, 'undetermined', now), true);
  assert.equal(L.pushAskAllowed({ asks: 0, lastAt: null }, 'granted', now), false);
  assert.equal(L.pushAskAllowed({ asks: 0, lastAt: null }, 'denied', now), false);
  assert.equal(L.pushAskAllowed({ asks: 1, lastAt: now - 86400000 }, 'undetermined', now), false);
  assert.equal(L.pushAskAllowed({ asks: 1, lastAt: now - 3 * 86400000 }, 'undetermined', now), true);
  assert.equal(L.pushAskAllowed({ asks: 3, lastAt: null }, 'undetermined', now), false);
});

test('each goal opens the right place', () => {
  assert.equal(L.goalAction(goal('x', false, 'chest')), 'chest');
  assert.equal(L.goalAction(goal('x', false, 'look')), 'closet');
  assert.equal(L.goalAction(goal('x', false, 'heart')), 'friends');
  assert.equal(L.goalAction(goal('x', false, 'catch')), 'map');
  assert.equal(L.goalAction(goal('x', true, 'look')), null);
});

test('retention flags: absent reads as off, a failed read is retried; only a true turns a feature on', async () => {
  const F = load('src/services/retention/flags.ts');
  assert.deepEqual(plain(await F.loadRetentionFlags(async () => ({ flags: {} }))), { dailyThree: false, levelChests: false });
  F.resetRetentionFlagsForTests();
  assert.equal(await F.loadRetentionFlags(async () => { throw new Error('offline'); }), null, 'a failed read is retried later, never cached as off');
  F.resetRetentionFlagsForTests();
  assert.deepEqual(plain(await F.loadRetentionFlags(async () => ({ flags: { daily_three: true, level_chests: 'yes' } }))), { dailyThree: true, levelChests: false });
});
