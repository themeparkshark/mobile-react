const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
// Run with: node --test tools/tests/live-poll.test.cjs
// Battery pass: repeating refreshes sleep in the background and off screen.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const policy = loadTs('src/hooks/livePollPolicy.ts');

test('a poll runs only when enabled, focused and in the foreground, unless it asks for a background rate', () => {
  const on = { enabled: true, appActive: true, focused: true };
  assert.equal(policy.pollIntervalFor(on, 30000), 30000);
  assert.equal(policy.pollIntervalFor({ ...on, enabled: false }, 30000), null);
  assert.equal(policy.pollIntervalFor({ ...on, focused: false }, 30000), null);
  assert.equal(policy.pollIntervalFor({ ...on, appActive: false }, 30000), null);
  assert.equal(policy.pollIntervalFor({ ...on, appActive: false }, 300000, 900000), 900000);
  assert.equal(policy.pollIntervalFor({ ...on, appActive: false, focused: false }, 300000, 900000), 900000,
    'a background rate is about the app, not the screen');
  assert.equal(policy.pollIntervalFor({ ...on, enabled: false, appActive: false }, 300000, 900000), null);
  assert.equal(policy.pollIntervalFor(on, 0), null);
});

test('resuming runs at once only when a refresh is overdue', () => {
  assert.equal(policy.pollDelay(null, 1000, 30000), 0, 'never ran');
  assert.equal(policy.pollDelay(1000, 11000, 30000), 20000, 'a quick app switch waits out the rest');
  assert.equal(policy.pollDelay(1000, 31000, 30000), 0);
  assert.equal(policy.pollDelay(1000, 90000, 30000), 0, 'long away: one catch-up, not a burst');
  assert.equal(policy.pollDelay(50000, 1000, 30000), 0, 'a clock that moved backwards refreshes');
});

function mountPoll(options = {}) {
  let now = 1_000_000;
  const listeners = [];
  const AppState = { currentState: 'active', addEventListener: (_, fn) => { listeners.push(fn); return { remove() { listeners.splice(listeners.indexOf(fn), 1); } }; } };
  const FakeDate = { now: () => now };
  const runs = [];
  const view = runtime('src/hooks/useLivePoll.ts', { 'react-native': { AppState } },
    { run: () => runs.push(now), ms: 30000, opts: options }, { Date: FakeDate },
    { arguments: props => [props.run, props.ms, props.opts] });
  const flush = () => { for (const [id, fn] of [...view.timers]) { view.timers.delete(id); fn(); } view.render(); };
  const appState = state => { listeners.forEach(fn => fn(state)); view.render(); };
  return { view, runs, flush, appState, advance: ms => { now += ms; }, listeners };
}

test('the hook runs on mount, repeats, pauses in the background and catches up once on return', () => {
  const h = mountPoll();
  assert.equal(h.runs.length, 1, 'runs right away');
  assert.equal(h.view.timers.size, 1, 'next run scheduled');
  h.advance(30000); h.flush();
  assert.equal(h.runs.length, 2);

  h.appState('background');
  assert.equal(h.view.timers.size, 0, 'no timer while backgrounded');
  h.advance(10000);
  h.appState('active');
  assert.equal(h.runs.length, 2, 'not due yet: no request on a quick app switch');
  assert.equal(h.view.timers.size, 1, 'waits out the rest of the interval');

  h.appState('background');
  h.advance(10 * 60_000);
  assert.equal(h.runs.length, 2, 'nothing ran in the pocket');
  h.appState('active');
  assert.equal(h.runs.length, 3, 'one catch-up refresh on return');
  h.view.unmount();
  assert.equal(h.listeners.length, 0, 'the shared AppState listener is released');
});

test('an unfocused screen pauses its poll and a new key starts over at once', () => {
  const h = mountPoll({ focused: false, key: 'park-1' });
  assert.equal(h.runs.length, 0);
  assert.equal(h.view.timers.size, 0);
  h.view.change({ opts: { focused: true, key: 'park-1' } });
  assert.equal(h.runs.length, 1, 'first focus loads');
  h.advance(5000);
  h.view.change({ opts: { focused: true, key: 'park-2' } });
  assert.equal(h.runs.length, 2, 'a new park refreshes immediately');
  h.view.change({ opts: { focused: true, key: 'park-2', enabled: false } });
  assert.equal(h.view.timers.size, 0, 'disabled: nothing scheduled');
});

test('a poll with a background rate keeps going while the phone is in a pocket', () => {
  const h = mountPoll({ backgroundMs: 900000 });
  h.appState('background');
  assert.equal(h.view.timers.size, 1);
  h.advance(900000); h.flush();
  assert.equal(h.runs.length, 2);
});

test('app-wide and map polls go through useLivePoll instead of a raw setInterval', () => {
  for (const file of ['src/context/NotificationProvider.tsx', 'src/hooks/useRideControlMap.ts', 'src/components/home/HomeLive.tsx']) {
    const src = read(file);
    assert.match(src, /useLivePoll\(/, file);
    assert.doesNotMatch(src, /setInterval\((load|refresh|fetchGym|async)/, file);
  }
  const raid = read('src/components/boss/BossRaidFlow.tsx');
  assert.match(raid, /useLivePoll\(refresh, idlePollInterval\(20000, idle && !raidRunning\), \{ enabled: !!parkId && !!player\?\.id, focused, key: scope \}\)/);
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /useLivePoll\(loadLivePark, idlePollInterval\(60000, mapIdle, 2\), \{ enabled: !!park\?\.id, focused: mapFocused/);
  assert.match(explore, /useLivePoll\(fetchGymData, idlePollInterval\(30000, mapIdle\), \{ enabled: !!park\?\.id, focused: mapFocused/);
  assert.match(explore, /useParkRaid\(park\?\.id, \{ focused: mapFocused, idle: mapIdle \}\)/);
  assert.doesNotMatch(read('src/components/GymBattle/GymMarker.tsx'), /getGym\(/, 'the gym marker reads the map\'s gym data instead of polling it again');
});

test('ride detection polls posted waits for the current park only, slower in the background', () => {
  const src = read('src/hooks/useRideDetection.ts');
  assert.match(src, /useLivePoll\(refreshWaitTimes, WAIT_TIMES_FOREGROUND_MS, \{\s*enabled: enabled && ridesLoaded, backgroundMs: WAIT_TIMES_BACKGROUND_MS/);
  assert.doesNotMatch(src, /setInterval/);
  assert.match(read('src/Root.tsx'), /<RideDetectionDriver enabled=\{[^}]*\}\s*parkId=\{currentPark\?\.id \?\? null\} \/>/);
  const ids = loadTs('src/hooks/useRideDetection.ts', {
    react: {}, 'react-native': { AppState: {} },
    '../api/endpoints/rides': {}, '../api/endpoints/parks/queue-times/getWikiTimes': { default: () => [] },
    '../services/RideDetectionService': { default: {} }, '../RootNavigation': {}, '../services/RideDetectionEmitter': {},
    '../context/LocationProvider': {}, './useLivePoll': { default: () => undefined },
  }).waitTimeParkIds;
  const rides = [{ park_id: 8 }, { park_id: 13 }, { park_id: 2 }, { park_id: 99 }];
  assert.deepEqual([...ids(rides, 8)], [8]);
  assert.deepEqual([...ids(rides, 99)], [], 'a park without a feed fetches nothing');
  assert.deepEqual([...ids(rides, null)], [8, 13, 2]);
});

test('map markers and pills stop timers and loops while the map is off screen', () => {
  const sword = read('src/components/GymBattle/SwordMarker.tsx');
  assert.match(sword, /if \(!active\) return;\s*const interval = setInterval\(updateTime, 1000\)/);
  assert.match(sword, /autoplay=\{running\}/);
  // A vault the declutter hid stops decoding too.
  assert.match(read('src/screens/ExploreScreen/VaultMarker.tsx'), /autoplay=\{running && placement\.visible\}/);
  const gym = read('src/components/GymBattle/GymMarker.tsx');
  assert.match(gym, /if \(!running\) \{\s*cancelAnimation\(pulseScale\)/);
  const marker = read('src/screens/ExploreScreen/TaskMarker.tsx');
  // Pausing never mounts or unmounts views inside a map marker (MapLibre crash).
  assert.doesNotMatch(marker, /alive\.(running|active) \?|&& alive\.(running|active) &&|alive\.(running|active) && /);
  assert.match(marker, /const timerTicking = shown \? alive\.active : false;/);
  assert.match(marker, /<MarkerTimer expiresAt=\{expiresAt!\} ticking=\{timerTicking\}/);
  assert.match(read('src/components/map/RideAmbience.tsx'), /const \{ running \} = useMapAlive\(\);\s*useEffect\(\(\) => \{\s*if \(!running\) \{ cancelAnimation\(p\); return; \}/);
  const pill = read('src/components/LiveEventsPill.tsx');
  assert.match(pill, /const ticking = focused && appActive && \(rushes\.length > 0 \|\| raid\?\.status === 'active'\)/);
});

test('entry screens left under the map stop their video and loops', () => {
  const loading = read('src/screens/LoadingScreen.tsx');
  assert.match(loading, /const focused = useIsFocused\(\);/);
  assert.match(loading, /shouldPlay=\{focused\}/);
  assert.match(loading, /\{focused && BUBBLES\.map/);
  assert.match(loading, /wobbleLoop\.stop\(\);/, 'bubbles stop their loops on unmount');
  const login = read('src/screens/Auth/LoginScreen.tsx');
  assert.match(login, /shouldPlay=\{focused\}/);
  assert.match(login, /if \(!focused\) return;\s*const float = Animated\.loop/);
  const welcome = read('src/screens/WelcomeScreen.tsx');
  assert.match(welcome, /if \(!focused \|\| reduced\) return;/);
});

test('only the launch path loads with the app; other screens load on first visit', () => {
  const root = read('src/Root.tsx');
  const eager = [...root.matchAll(/^import (\w+) from '\.\/screens\/[^']+';$/gm)].map(m => m[1]).sort();
  assert.deepEqual(eager, ['ExploreScreen', 'LoadingScreen', 'LoginScreen', 'SplashScreen', 'WelcomeScreen']);
  assert.match(root, /name="LinePlay"\s*getComponent=\{\(\) => require\('\.\/screens\/LinePlay\/LinePlayScreen'\)\.default\}/);
  assert.ok((root.match(/getComponent=\{\(\) => require\(/g) ?? []).length >= 40);
});


test('an idle map polls 3x slower; touches and steps count as activity', () => {
  const idleMod = loadTs('src/hooks/useUserIdle.ts', { react: {} });
  assert.equal(idleMod.idlePollInterval(30000, false), 30000);
  assert.equal(idleMod.idlePollInterval(30000, true), 90000);
  assert.equal(idleMod.idlePollInterval(60000, true, 2), 120000);

  let now = 1_000_000;
  const view = runtime('src/hooks/useUserIdle.ts', {}, {}, { Date: { now: () => now } }, { arguments: () => [120000] });
  const flush = () => { for (const [id, fn] of [...view.timers]) { view.timers.delete(id); fn(); } view.render(); };
  assert.equal(view.tree, false, 'active at launch');
  now += 60000; flush();
  assert.equal(view.tree, false, 'one minute quiet is not idle');
  now += 61000; flush();
  assert.equal(view.tree, true, 'two quiet minutes: idle');
  assert.equal(view.timers.size, 0, 'no timers while idle');
  const raid = read('src/components/boss/BossRaidFlow.tsx');
  assert.match(raid, /idle && !raidRunning/, 'an active raid keeps its 20 s cadence even when idle');
  assert.match(read('src/Root.tsx'), /<View style=\{\{ flex: 1 \}\} onTouchStart=\{onAnyTouch\}>/);
  assert.match(read('src/screens/ExploreScreen.tsx'), /useEffect\(\(\) => \{ if \(playerLat != null\) markUserActivity\(\); \}, \[playerLat, playerLng\]\);/);
});
