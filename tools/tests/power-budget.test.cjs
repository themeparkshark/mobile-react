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
  assert.equal(policy.IDLE_AFTER_MS, 120000, 'one idle constant, two minutes');
  assert.equal('stationary' in b, false);
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



const gpsBase = { mapOnScreen: true, queueTracking: false, inPark: true, confirmedOutside: false };

test('GPS: background stops the foreground watcher; Saver uses Balanced except in a queue; steps never change', () => {
  assert.equal(gps.gpsWatchSettings({ ...gpsBase, appActive: false }).tier, 'off');
  assert.deepEqual({ ...gps.gpsWatchSettings({ ...gpsBase, appActive: true }) }, { tier: 'map', accuracy: 'high', distanceInterval: 3, timeInterval: 500 }, 'normal power unchanged');
  const saver = gps.gpsWatchSettings({ ...gpsBase, rest: true });
  assert.equal(saver.accuracy, 'balanced');
  assert.equal(saver.distanceInterval, 3, 'constant step: the watcher never restarts on a still/move flip');
  assert.equal(gps.gpsWatchSettings({ ...gpsBase, rest: true, queueTracking: true }).accuracy, 'high', 'LinePlay keeps High');
});

// Defect 1: a slow storage read never undoes the switch.
test('Battery Saver: flipping the switch before storage answers wins', async () => {
  let release; const stored = new Map([['tps.batterySaver.v1', '0']]);
  const AsyncStorage = { getItem: key => new Promise(r => { release = () => r(stored.get(key) ?? null); }),
    setItem: async (k, v) => { stored.set(k, v); } };
  const saver = loadTs('src/power/batterySaver.ts', { '@react-native-async-storage/async-storage': { default: AsyncStorage, __esModule: true }, react: { useSyncExternalStore: (_s, get) => get() } });
  const pending = saver.loadBatterySaver();
  saver.setBatterySaver(true);
  release(); await pending;
  assert.equal(saver.isBatterySaverOn(), true);
  assert.equal(stored.get('tps.batterySaver.v1'), '1');
});

test('Battery Saver: a stored "on" is restored at launch', async () => {
  const AsyncStorage = { getItem: async () => '1', setItem: async () => {} };
  const saver = loadTs('src/power/batterySaver.ts', { '@react-native-async-storage/async-storage': { default: AsyncStorage, __esModule: true }, react: { useSyncExternalStore: (_s, get) => get() } });
  await saver.loadBatterySaver();
  assert.equal(saver.isBatterySaverOn(), true);
});

// Defects 2, 3 and the park-change refetch.
test('poll ids: a new key (park) is a new poll that runs at once; re-registering the same id keeps its schedule', () => {
  const ids = loadTs('src/power/useBudgetedPoll.ts', { react: { useEffect() {}, useRef: v => ({ current: v }) } });
  assert.equal(ids.pollId('poll-1', null), 'poll-1');
  assert.equal(ids.pollId('poll-1', 12), 'poll-1:12');
  const clock = fakeClock();
  const c = new coord.PollCoordinator(clock);
  const runs = [];
  let off = c.register({ id: ids.pollId('hud', 1), run: () => runs.push(['p1', clock.now()]), intervalMs: 10000 }, true);
  clock.advance(4000);
  off();
  off = c.register({ id: ids.pollId('hud', 1), run: () => runs.push(['p1', clock.now()]), intervalMs: 10000 }, false);
  clock.advance(0);
  assert.deepEqual(runs, [['p1', 0]], 'a dep change / refocus costs no extra fetch');
  clock.advance(6000);
  assert.deepEqual(runs.at(-1), ['p1', 10000], 'kept the old schedule');
  off();
  c.register({ id: ids.pollId('hud', 2), run: () => runs.push(['p2', clock.now()]), intervalMs: 10000 }, true);
  clock.advance(0);
  assert.deepEqual(runs.at(-1), ['p2', 10000], 'a new park fetches at once');
});

test('pocket dim: face down or upside down for 3 s goes black; turning it up wakes at once', () => {
  const p = loadTs('src/power/pocketPolicy.ts');
  let s = p.POCKET_START;
  s = p.nextPocketState(s, { x: 0, y: -1, z: 0 }, 0);
  assert.equal(s.dim, false, 'held upright');
  s = p.nextPocketState(s, { x: 0, y: 0, z: 1 }, 1000);
  s = p.nextPocketState(s, { x: 0, y: 0, z: 1 }, 3500);
  assert.equal(s.dim, false);
  s = p.nextPocketState(s, { x: 0, y: 0, z: 1 }, 4000);
  assert.equal(s.dim, true, 'face down 3 s');
  s = p.nextPocketState(s, { x: 0, y: -0.9, z: -0.3 }, 4500);
  assert.equal(s.dim, false, 'picked up');
  s = p.nextPocketState(s, { x: 0, y: 0.95, z: 0 }, 5000);
  s = p.nextPocketState(s, { x: 0, y: 0.95, z: 0 }, 8000);
  assert.equal(s.dim, true, 'upside down in a pocket');
  assert.equal(p.nextPocketState(p.POCKET_START, { x: 0, y: 0, z: -1 }, 99), p.POCKET_START, 'face up on a table: no churn');
});

test('pocket dim: a recent touch means someone is playing; it restarts the wait', () => {
  const p = loadTs('src/power/pocketPolicy.ts');
  let s = p.POCKET_START;
  s = p.nextPocketState(s, { x: 0, y: 0, z: 1 }, 0, null);
  s = p.nextPocketState(s, { x: 0, y: 0, z: 1 }, 3000, 2500);
  assert.equal(s.dim, false, 'touched 0.5 s ago: never dims');
  assert.equal(s.since, null, 'the wait starts over');
  s = p.nextPocketState(s, { x: 0, y: 0, z: 1 }, 6000, 2500);
  s = p.nextPocketState(s, { x: 0, y: 0, z: 1 }, 9000, 2500);
  assert.equal(s.dim, true, 'face down 3 s after the last touch');
});

test('pocket dim: Android axes are flipped to the iOS convention', () => {
  const p = loadTs('src/power/pocketPolicy.ts');
  const androidFaceDown = { x: 0, y: 0, z: -1 };
  assert.equal(p.isPocketPose(p.toIosTilt(androidFaceDown, 'android')), true);
  assert.equal(p.isPocketPose(p.toIosTilt(androidFaceDown, 'ios')), false, 'the same reading on iOS is face up');
  assert.equal(p.isPocketPose(p.toIosTilt({ x: 0, y: 1, z: 0 }, 'android')), false, 'Android upright in a hand');
});

test('poll clock forgets keyed polls after 10 minutes', () => {
  const clock = fakeClock();
  const c = new coord.PollCoordinator(clock);
  const off = c.register({ id: 'hud:1', run: () => {}, intervalMs: 1000 });
  clock.advance(0); off();
  assert.equal(c.remembered(), 1);
  clock.advance(coord.FORGET_AFTER_MS + 1);
  c.register({ id: 'hud:2', run: () => {}, intervalMs: 1000 });
  assert.equal(c.remembered(), 0);
});

test('live polls: Battery Saver is a fixed 2x and never stacks with idle', () => {
  const lp = loadTs('src/hooks/livePollPolicy.ts');
  assert.equal(lp.saverInterval(30000, false), 30000);
  assert.equal(lp.saverInterval(30000, true), 60000);
  assert.equal(lp.saverInterval(90000, true), 180000, 'only the fixed 2x is added on top of the caller idle factor; the budget idle multiplier is never applied here');
});

// Defect 7: PartyClient knows it starts in the background and its safety poll rests there.
test('party: the safety poll rests in the background, from construction, and resumes on return', () => {
  const net = loadTs('src/gamekit/net/PartyClient.ts');
  const gets = []; const listeners = [];
  const http = { get: url => { gets.push(url); return new Promise(() => {}); }, post: () => new Promise(() => {}) };
  const make = currentState => new net.PartyClient({ http, userId: 7, setTimer: () => 0, clearTimer() {},
    appState: { currentState, addEventListener: (_e, cb) => { listeners.push(cb); return { remove() {} }; } } });
  const c = make('background');
  assert.equal(c.backgrounded, true);
  c.state = { ...c.state, room: { id: 5 } };
  c.lastSyncAt = -1e9;
  c.pollIfNeeded();
  assert.equal(gets.length, 0, 'no poll while backgrounded');
  listeners.forEach(cb => cb('active'));
  assert.equal(c.backgrounded, false);
  assert.ok(gets.some(u => u.includes('/party/rooms/5')), 'catches up on return');
  assert.equal(make('active').backgrounded, false);
});
