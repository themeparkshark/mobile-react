const assert = require('node:assert/strict'), test = require('node:test');
const { exploreScreen } = require('./helpers/explore-screen.cjs');
const { loadTs } = require('./helpers/ts-module.cjs');

const named = name => node => typeof node.type === 'function' && node.type.name === name;
const task = { id: 11, name: 'Space Ride', latitude: 34.1382, longitude: -118.3533, asset_id: 13 };
const redeemables = { tasks: [task], coins: [], keys: [], redeemables: [], items: [], pins: [], vaults: [] };

test('a failed park map load keeps the park buttons and shows the calm retry note', async () => {
  let loaded = false;
  const app = exploreScreen({ modules: {
    '../api/endpoints/me/current-redeemables': { default: async () => { throw new Error('weak signal'); } },
    // Like the real clock: one load on mount, a failed load is caught.
    '../hooks/useMapOpportunityClock': { default: (_items, refresh, enabled) => {
      if (enabled && !loaded) { loaded = true; void refresh().catch(() => undefined); }
      return Date.parse('2026-09-30T18:00:00Z');
    } },
  } });
  await app.settle(); await app.settle();
  assert.ok(app.find(named('HelpButton')), 'How to play stays on the park map');
  assert.ok(app.find(named('MapResourcePill')), 'Energy stays on the park map');
  assert.ok(app.find(named('ParkMapRetry')), 'the retry note shows');
});

test('a good park map load shows no retry note', async () => {
  const app = exploreScreen({ redeemables });
  await app.settle(); await app.settle();
  assert.ok(app.find(named('HelpButton')));
  assert.equal(app.find(named('ParkMapRetry')), undefined);
});

test('park map retries back off calmly: 5 s, 10 s, 20 s, then every 30 s', () => {
  const { mapRetryDelay } = loadTs('src/screens/ExploreScreen/ParkMapRetry.tsx', {
    react: { memo: c => c, useCallback: f => f, useEffect: () => undefined, useRef: v => ({ current: v }), useState: v => [v, () => undefined] },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'Fragment' },
    'react-native': { Pressable: 'Pressable', StyleSheet: { create: s => s }, Text: 'Text', View: 'View' },
    '../../ui': new Proxy({}, { get: () => new Proxy({}, { get: () => 1 }) }),
  });
  assert.deepEqual([0, 1, 2, 3, 8].map(mapRetryDelay), [5000, 10000, 20000, 30000, 30000]);
});

test('a first slow load reads as looking for rides; the weak-signal note waits for a failed retry', () => {
  const read = f => require('node:fs').readFileSync(require('node:path').join(__dirname, '../../', f), 'utf8');
  assert.match(read('src/screens/ExploreScreen/ParkMapRetry.tsx'), /calm: failed && attempt\.current === 0/);
  assert.match(read('src/screens/ExploreScreen.tsx'), /<ParkMapRetryCard retrying=\{mapRetry\.retrying \|\| mapRetry\.calm\}/);
});

test('while the rides have not loaded, the status bar never claims every ride is open', () => {
  const read = f => require('node:fs').readFileSync(require('node:path').join(__dirname, '../../', f), 'utf8');
  // The team bar makes no ride-status claim at all (no leader = "no team has a ride yet"),
  // so it needs no ride-load gate; only Fin-ister nights swap the title.
  const bar = read('src/components/RideControlBar.tsx');
  assert.doesNotMatch(bar, /EVERY RIDE IS OPEN/);
  assert.match(read('src/screens/ExploreScreen.tsx'), /hideAllOpen=\{hideEveryRideOpen\(/);
  // Before standings load the title already says the no-leader line; a leader then cross-fades in.
  assert.match(bar, /const \[shownHeadline, setShownHeadline\] = useState\(headline\);/);
  assert.match(bar, /<Animated\.Text style=\{\[styles\.kicker, titleStyle\]\}/);
});

test('standing at a resting ride, its "Back" chip sits above the art, clear of the player shark', () => {
  const marker = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/screens/ExploreScreen/TaskMarker.tsx'), 'utf8');
  assert.match(marker, /styles\.restingSlot, near && styles\.restingSlotNear/);
  assert.match(marker, /restingSlotNear: \{ bottom: undefined, top: -?\d+ \}/);
});
