const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/power-budget.test.cjs
// Battery stream: one app-wide power budget and one poll clock. No feature is removed.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const policy = loadTs('src/power/powerPolicy.ts');
const coord = loadTs('src/power/pollCoordinator.ts');
const gps = loadTs('src/context/gpsWatchPolicy.ts');

const on = { appActive: true, idle: false, stationary: false, lowPower: false, reduceMotion: false };

test('normal play is full power: nothing rests, nothing slows', () => {
  const b = policy.powerBudget(on);
  assert.equal(b.level, 'full');
  assert.equal(b.ambient, true);
  assert.equal(b.animate, true);
  assert.equal(b.pollMultiplier, 1);
  assert.equal(b.particleScale, 1);
  assert.equal(b.compass, true);
  assert.equal(b.gpsRest, false);
});

test('Battery Saver while playing keeps loops (no visible loss) but slows data and thins particles', () => {
  const b = policy.powerBudget({ ...on, lowPower: true });
  assert.equal(b.level, 'calm');
  assert.equal(b.ambient, true);
  assert.equal(b.pollMultiplier, 2);
  assert.equal(b.particleScale, 0.5);
  assert.equal(b.gpsRest, true);
});

test('idle rests ambient loops; a touch (idle false) restores full', () => {
  const b = policy.powerBudget({ ...on, idle: true });
  assert.equal(b.level, 'calm');
  assert.equal(b.ambient, false);
  assert.equal(b.animate, true, 'tap feedback still animates');
  assert.equal(policy.powerBudget({ ...on, idle: true, lowPower: true }).pollMultiplier, 3);
  assert.equal(policy.powerBudget(on).ambient, true);
});

test('background sleeps everything: no motion, polls paused, compass off', () => {
  const b = policy.powerBudget({ ...on, appActive: false });
  assert.equal(b.level, 'sleep');
  assert.equal(b.animate, false);
  assert.equal(b.ambient, false);
  assert.equal(b.compass, false);
  assert.equal(policy.budgetedInterval(30000, b), null);
});

test('reduce motion stops ambient loops only, not data', () => {
  const b = policy.powerBudget({ ...on, reduceMotion: true });
  assert.equal(b.level, 'full');
  assert.equal(b.ambient, false);
  assert.equal(b.pollMultiplier, 1);
});

test('standing still rests GPS steps but nothing visual', () => {
  const b = policy.powerBudget({ ...on, stationary: true });
  assert.equal(b.gpsRest, true);
  assert.equal(b.ambient, true);
  assert.equal(policy.isStationary(null, 1e9), false, 'no fix yet is not still');
  assert.equal(policy.isStationary(0, policy.STATIONARY_AFTER_MS - 1), false);
  assert.equal(policy.isStationary(0, policy.STATIONARY_AFTER_MS), true);
});

test('budget helpers: intervals stretch, particles never vanish in the foreground', () => {
  assert.equal(policy.budgetedInterval(10000, { pollMultiplier: 2 }), 20000);
  assert.equal(policy.budgetedInterval(0, { pollMultiplier: 1 }), null);
  assert.equal(policy.budgetedParticles(12, { particleScale: 0.5, animate: true }), 6);
  assert.equal(policy.budgetedParticles(1, { particleScale: 0.5, animate: true }), 1);
  assert.equal(policy.budgetedParticles(12, { particleScale: 0, animate: false }), 0);
});

function fakeClock() {
  let t = 0; let seq = 0; const timers = new Map();
  return {
    now: () => t,
    setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { at: t + ms, fn }); return id; },
    clearTimeout: id => timers.delete(id),
    advance(ms) {
      const end = t + ms;
      for (;;) {
        let next = null;
        for (const [id, x] of timers) if (x.at <= end && (!next || x.at < next[1].at)) next = [id, x];
        if (!next) break;
        timers.delete(next[0]); t = next[1].at; next[1].fn();
      }
      t = end;
    },
    pending: () => timers.size,
  };
}

test('the poll clock runs polls on time, aligns near-due polls into one wake', () => {
  const clock = fakeClock();
  const c = new coord.PollCoordinator(clock);
  const runs = { a: [], b: [] };
  c.register({ id: 'a', run: () => runs.a.push(clock.now()), intervalMs: 10000 });
  c.register({ id: 'b', run: () => runs.b.push(clock.now()), intervalMs: 11000 });
  clock.advance(0);
  assert.deepEqual(runs.a, [0]); assert.deepEqual(runs.b, [0]);
  clock.advance(10000);
  assert.deepEqual(runs.a, [0, 10000]);
  assert.deepEqual(runs.b, [0, 10000], 'b was due within ALIGN_MS so it rode the same wake');
});

test('the poll clock pauses in the background, keeps background-rate polls, and slows by the budget', () => {
  const clock = fakeClock();
  const c = new coord.PollCoordinator(clock);
  let fg = 0; let bg = 0;
  c.register({ id: 'fg', run: () => fg++, intervalMs: 10000 });
  c.register({ id: 'bg', run: () => bg++, intervalMs: 10000, backgroundMs: 60000 });
  clock.advance(0);
  c.setAppActive(false);
  clock.advance(120000);
  assert.equal(fg, 1, 'foreground poll paused');
  assert.equal(bg, 3, 'background-rate poll kept going at its slow rate');
  c.setAppActive(true);
  clock.advance(0);
  assert.equal(fg, 2, 'overdue poll runs at once on return');
  c.setMultiplier(3);
  const before = fg;
  clock.advance(29000);
  assert.equal(fg, before);
  clock.advance(1000);
  assert.equal(fg, before + 1, 'idle/saver stretches 10 s to 30 s');
  c.setMultiplier(Infinity);
  clock.advance(600000);
  assert.equal(fg, before + 1);
});

test('unregistering stops the timer; a throwing poll never breaks the clock', () => {
  const clock = fakeClock();
  const c = new coord.PollCoordinator(clock);
  let ok = 0;
  const off = c.register({ id: 'x', run: () => { throw new Error('net'); }, intervalMs: 1000 });
  c.register({ id: 'y', run: () => { ok++; return Promise.reject(new Error('x')); }, intervalMs: 1000 });
  clock.advance(3000);
  assert.ok(ok >= 3);
  off();
  assert.equal(c.size(), 1);
});

test('GPS: background stops the foreground watcher; a still player on a map takes 6 m steps; queues untouched', () => {
  const base = { mapOnScreen: true, queueTracking: false, inPark: true, confirmedOutside: false };
  assert.equal(gps.gpsWatchSettings({ ...base, appActive: false }).tier, 'off');
  assert.equal(gps.gpsWatchSettings(base).distanceInterval, 3, 'unchanged at normal power');
  assert.equal(gps.gpsWatchSettings({ ...base, appActive: true }).distanceInterval, 3);
  assert.equal(gps.gpsWatchSettings({ ...base, rest: true }).distanceInterval, 6);
  assert.equal(gps.gpsWatchSettings({ ...base, rest: true }).accuracy, 'high', 'accuracy never drops');
  assert.equal(gps.gpsWatchSettings({ ...base, rest: true, queueTracking: true }).distanceInterval, 3, 'LinePlay needs every step');
  assert.equal(gps.gpsWatchSettings({ ...base, mapOnScreen: false, rest: true }).distanceInterval, 10);
});

test('wiring: provider wraps the app, LocationProvider rests compass and watcher, polls ride the clock, Settings has the switch', () => {
  assert.match(read('App.tsx'), /<PowerProvider>/);
  const loc = read('src/context/LocationProvider.tsx');
  assert.match(loc, /compassOn = headingEnabled && power\.compass/);
  assert.match(loc, /watch\.tier === 'off'/);
  assert.match(loc, /markMoved\(\)/);
  assert.match(read('src/components/GymBattle/BattleHUD.tsx'), /useBudgetedPoll\(fetchGym, 10000\)/);
  assert.doesNotMatch(read('src/components/GymBattle/BattleHUD.tsx'), /setInterval\(fetchGym/);
  assert.match(read('src/screens/QueueTimesScreen.tsx'), /ticking = screenFocused && appActive/);
  assert.match(read('src/gamekit/net/PartyClient.ts'), /this\.state\.room \|\| this\.backgrounded/);
  assert.match(read('src/screens/SettingsScreen.tsx'), /title="Battery Saver"/);
});
