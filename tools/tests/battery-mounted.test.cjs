const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
// Run with: node --test tools/tests/battery-mounted.test.cjs
// Battery stream: mounted screens on a fake clock.

function fakeClock() {
  let t = 1_000_000; let seq = 0; const timers = new Map();
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
  };
}

test('BattleHUD: polls the gym on the shared clock, pauses in the background, refetches at once on a new park', () => {
  const clock = fakeClock();
  const coord = loadTs('src/power/pollCoordinator.ts');
  const hooks = loadTs('src/power/useBudgetedPoll.ts', { react: { useEffect() {}, useRef: v => ({ current: v }) } });
  const c = new coord.PollCoordinator(clock);
  const fetched = [];
  // The real hook's contract, bound to a coordinator on the fake clock.
  let registered = null; let off = null; const seen = new Set();
  const useBudgetedPoll = (run, ms, opts = {}) => {
    const id = hooks.pollId('hud', opts.key);
    if (registered === id) return;
    off?.();
    registered = id;
    off = c.register({ id, run, intervalMs: ms }, !seen.has(id));
    seen.add(id);
  };
  const view = runtime('src/components/GymBattle/BattleHUD.tsx', {
    '../../power': { useBudgetedPoll },
    '../../api/endpoints/gym-battle': { getGym: async parkId => { fetched.push([parkId, clock.now()]); return null; } },
    './battleHUDEvents': { battleHUDEvents: { subscribe: () => () => {} } },
    '@react-navigation/native': { useNavigation: () => ({ addListener: () => () => {} }) },
    '../../constants/teams': loadTs('src/constants/teams.ts'),
    '../../ui': { GameIcon: 'GameIcon', GameRichText: 'GameRichText' },
    'expo-blur': { BlurView: 'BlurView' },
  }, { parkId: 1 });
  clock.advance(0);
  assert.deepEqual(fetched.map(f => f[0]), [1], 'loads on mount');
  clock.advance(10_000);
  assert.equal(fetched.length, 2, 'every 10 s at full power');
  c.setAppActive(false);
  clock.advance(120_000);
  assert.equal(fetched.length, 2, 'nothing in the pocket');
  c.setAppActive(true);
  clock.advance(0);
  assert.equal(fetched.length, 3, 'one catch-up on return');
  c.setMultiplier(2);
  clock.advance(10_000);
  assert.equal(fetched.length, 3, 'Saver/idle: 20 s');
  clock.advance(10_000);
  assert.equal(fetched.length, 4);
  view.change({ parkId: 2 });
  clock.advance(0);
  assert.deepEqual(fetched.at(-1)[0], 2, 'a new park fetches at once');
  view.unmount();
});

test('QueueTimesScreen: the countdown only ticks on screen in the foreground, and a stale list refreshes on return', async () => {
  let now = 5_000_000;
  const intervals = new Map(); let seq = 0;
  const loads = [];
  let focused = true; let active = true;
  const view = runtime('src/screens/QueueTimesScreen.tsx', {
    '@react-navigation/native': { useIsFocused: () => focused, useNavigation: () => ({ navigate() {}, goBack() {} }) },
    '../hooks/useLivePoll': { useAppActive: () => active },
    '../api/endpoints/parks/queue-times/getWikiTimes': { default: async park => { loads.push([park, now]); return []; }, __esModule: true },
    '../context/LocationProvider': { LocationContext: { value: { location: null } } },
    '@shopify/flash-list': { FlashList: 'FlashList' },
    '../constants/parkWaitTimes': loadTs('src/constants/parkWaitTimes.ts'),
    '../services/lineplay/queuePlayPolicy': loadTs('src/services/lineplay/queuePlayPolicy.ts'),
    '../services/lineplay/queueWaitPresentation': loadTs('src/services/lineplay/queueWaitPresentation.ts'),
  }, { route: { params: { park: 7 } } }, {
    Date: { now: () => now },
    setInterval: (fn, ms) => { const id = ++seq; intervals.set(id, { fn, ms }); return id; },
    clearInterval: id => intervals.delete(id),
  });
  await view.settle();
  assert.equal(loads.length, 1, 'first load');
  assert.equal(intervals.size, 1, 'countdown running on screen');
  active = false; view.render();
  assert.equal(intervals.size, 0, 'countdown stops in the background');
  now += 61_000;
  active = true; view.render(); await view.settle();
  assert.equal(loads.length, 2, 'stale after a minute away: refreshed at once');
  assert.equal(intervals.size, 1);
  focused = false; view.render();
  assert.equal(intervals.size, 0, 'stops under another screen');
  focused = true; view.render(); await view.settle();
  assert.equal(loads.length, 2, 'fresh: no extra fetch on a quick return');
  view.unmount();
});

test('useLivePoll: Battery Saver doubles the interval (mounted)', () => {
  const now = 1_000_000;
  const AppState = { currentState: 'active', addEventListener: () => ({ remove() {} }) };
  const mount = lowPower => runtime('src/hooks/useLivePoll.ts', {
    'react-native': { AppState },
    '../power': { usePowerBudget: () => ({ lowPower, pollMultiplier: lowPower ? 3 : 1 }) },
  }, { run: () => {}, ms: 30000, opts: {} }, { Date: { now: () => now } },
  { arguments: props => [props.run, props.ms, props.opts] });
  const off = mount(false); const on = mount(true);
  assert.deepEqual([...off.delays.values()], [30000]);
  assert.deepEqual([...on.delays.values()], [60000], 'fixed 2x, not the budget multiplier (3)');
  off.unmount(); on.unmount();
});

test('LocationProvider policy: the foreground GPS watcher is off in the background', () => {
  const gps = loadTs('src/context/gpsWatchPolicy.ts');
  for (const mapOnScreen of [true, false]) for (const queueTracking of [true, false]) {
    assert.equal(gps.gpsWatchSettings({ mapOnScreen, queueTracking, inPark: true, confirmedOutside: false, appActive: false }).tier, 'off');
  }
});
