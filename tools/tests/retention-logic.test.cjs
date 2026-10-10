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
  assert.deepEqual(plain(rows.map(r => r.kind)), ['xp', 'coins', 'tickets', 'item', 'mystery_boxes']);
  assert.equal(rows[1].label, 'coins');
  assert.equal(rows[2].label, 'Ticket');
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
  assert.equal(L.streakLine(state()), 'Finish today to make it 4!');
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
  assert.equal(L.goalAction(goal('x', false, 'catch')), 'snack');
  assert.equal(L.goalAction({ ...goal('x', false, 'catch'), park: true }), 'ride');
  assert.equal(L.goalAction(goal('x', false, 'play')), 'ride');
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

test('weekly line is honest about what is still reachable this week', () => {
  const days = states => states.map((state, i) => ({ date: `2026-10-${12 + i}`, state }));
  const wk = (over) => state({ week: { ...state().week, ...over } });
  assert.equal(L.weeklyLine(wk({ done: 0, days: days(['before', 'before', 'before', 'before', 'today', 'future', 'future']) })),
    'A new week starts Monday');
  assert.equal(L.weeklyLine(wk({ done: 3, days: days(['done', 'done', 'done', 'today', 'future', 'future', 'future']) })), '2 more flames open the gift');
  assert.equal(L.weeklyLine(wk({ done: 4, days: days(['done', 'done', 'done', 'done', 'today', 'future', 'future']) })), '1 more flame opens the gift');
  assert.equal(L.weeklyLine(wk({ claimable: true })), 'Your Weekly Box is ready!');
  assert.equal(L.weeklyLine(wk({ claimed: true })), 'Gift opened! A new week starts Monday.');
  assert.equal(L.weeklyLine(wk({ done: 0, days: days(['today', 'future', 'future', 'future', 'future', 'future', 'future']) })), '5 flames this week open the gift');
});

test('bars only where the title names the count; the park catch never shows 0/2', () => {
  const g = (over) => ({ ...goal('x', false, 'catch'), target: 2, ...over });
  assert.equal(L.showsBar(g({ park: false })), true);
  assert.equal(L.showsBar(g({ park: true })), false);
  assert.equal(L.showsBar(g({ park: true, bar: false })), false);
  assert.equal(L.showsBar({ ...goal('x', false, 'play'), target: 2 }), true);
  assert.equal(L.showsBar({ ...goal('x', false, 'look'), target: 1 }), false);
});

test('the reveal holds before gear and boxes so each gets its own beat', () => {
  const rows = L.rewardRows({ coins: 50, tickets: 1, item: { id: 1, name: 'Cap', image: null, rarity: 1 }, mystery_boxes: 1 });
  const t = L.rowSchedule(rows, 460, 450, 420);
  assert.deepEqual(plain(t), [420, 880, 1790, 2700]);
  assert.equal(L.doneDelay(rows), 600, 'the big card gets time to be seen before the button');
  assert.equal(L.doneDelay(L.rewardRows({ coins: 5 })), 150);
  assert.equal(L.isBigReward('freezes'), true, 'the Weekly Box always ends on a hero card');
});

test('closing beats point at tomorrow and the next milestone, and a lost streak keeps its record', () => {
  const s = state({ done: true, claimed: true, streak: { ...state().streak, days: 6, next_milestone: { day: 7, gear: true, mystery_boxes: 0, label: 'New gear', days_away: 1 } } });
  assert.equal(L.tomorrowLine(s), 'Come back tomorrow: Day 7 holds new gear!');
  assert.equal(L.milestoneLine(s), 'Tomorrow: New gear!');
  assert.equal(L.milestoneLine(state({ streak: { ...state().streak, next_milestone: { day: 7, gear: true, mystery_boxes: 0, label: 'New gear', days_away: 4 } } })), '4 more days: new gear');
  assert.equal(L.streakSubline(state({ streak: { ...state().streak, days: 0, best: 5, at_risk: false } })), 'Best: 5 days. Start a new flame!');
  assert.equal(L.sameJson({ a: 1 }, { a: 1 }), true);
});
