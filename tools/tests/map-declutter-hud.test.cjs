const assert = require('node:assert/strict'), test = require('node:test');
const fs = require('node:fs');
const { loadTs } = require('./helpers/ts-module.cjs');
const { exploreScreen } = require('./helpers/explore-screen.cjs');
const { plain } = require('./helpers/plain.cjs');
const hud = loadTs('src/components/map/statusStack.ts');

const named = name => node => typeof node.type === 'function' && node.type.name === name;
const task = { id: 11, name: 'Space Ride', latitude: 34.1382, longitude: -118.3533, asset_id: 13 };
const redeemables = { tasks: [task], coins: [{ id: 4, latitude: 34.1383, longitude: -118.3534, active_to: '2026-09-30T19:00:00Z' }],
  keys: [], redeemables: [], items: [], pins: [], vaults: [] };

test('one HUD row: right now beats tonight beats always-on', () => {
  assert.deepEqual(plain([...hud.statusOrder({ live: false, show: 'teaser', nightMode: true, control: true })]), ['fright', 'show', 'control']);
  assert.deepEqual(plain([...hud.statusOrder({ live: true, show: 'teaser', nightMode: true, control: true })]), ['live', 'fright', 'show', 'control']);
  assert.deepEqual(plain([...hud.statusOrder({ live: false, show: 'live', nightMode: true, control: true })]), ['show', 'fright', 'control'],
    'a show that is on right now leads over the night mode');
  assert.deepEqual(plain([...hud.statusOrder({ live: false, show: null, nightMode: false, control: true })]), ['control']);
  assert.equal(hud.HUD_BOTTOM, 76);
});

const frightModules = (extra = {}) => ({
  '../hooks/useFrightNight': { default: () => ({ modeOn: true, title: 'Fin-ister Nights', tonight: null, phase: 'live' }) },
  '../components/map/alive/useNightShow': { default: () => ({ show: { label: 'Lagoon show', anchor: { latitude: 1, longitude: 2 } }, phase: 'teaser' }) },
  ...extra,
});

test('Fin-ister Nights at USF: Fin-ister leads the one row, Ride Control and the Lagoon show wait behind +2', async () => {
  const app = exploreScreen({ redeemables, modules: frightModules() });
  await app.settle(); await app.settle();
  const stacks = app.findAll ? app.findAll(named('MapStatusStack')) : [app.find(named('MapStatusStack'))];
  assert.equal(stacks.filter(Boolean).length, 1, 'exactly one status row');
  const entries = stacks[0].props.entries;
  assert.deepEqual(plain(entries.map(e => e.key)), ['fright', 'show', 'control']);
  const lead = entries[0].node({ lead: true, open: false, alone: false });
  assert.equal(lead.props.showHelp, false, 'collapsed, the stack button takes the "?" spot on the lead pill');
  assert.equal(entries[0].node({ lead: true, open: true, alone: false }).props.showHelp, true, 'open, the tutorial replay is one tap away');
  assert.equal(entries[0].node({ lead: true, open: false, alone: true }).props.showHelp, true);
  assert.equal(lead.props.inline, true);
  // Nothing else stacks a banner over the map.
  for (const name of ['RideControlBar', 'NightShowPill', 'FrightPill', 'LiveEventsPill']) {
    assert.equal(app.find(node => named(name)(node)), undefined, `${name} only inside the row`);
  }
});

test('the map gets the declutter: every marker footprint, the HUD row and both button columns as insets', async () => {
  const app = exploreScreen({ redeemables, modules: frightModules() });
  await app.settle(); await app.settle();
  const map = app.find(named('Map'));
  const { declutter } = map.props;
  assert.ok(declutter && declutter.store, 'a placement store');
  const ids = declutter.items.map(item => item.id);
  assert.ok(ids.includes('ride:11') && ids.includes('coin:4'));
  assert.deepEqual(plain(declutter.insets[0]), { left: 0, top: 0, width: 9999, height: 76 }, 'the status row');
  assert.ok(declutter.insets.some(inset => inset.left === 0 && inset.bottom === 0), 'bottom-left buttons');
  assert.ok(declutter.insets.some(inset => inset.right === 0 && inset.bottom === 0), 'bottom-right buttons');
  // Timed finds draw through FindMarker so their chip can move.
  assert.ok(app.find(node => named('FindMarker')(node) && node.props.id === 'coin:4'));
});

test('the map runs the solver on settled camera moves only, and the shark is a chip obstacle, never an art one', () => {
  const map = fs.readFileSync('src/components/Map.tsx', 'utf8');
  assert.match(map, /onRegionDidChange=\{\(feature\) => \{[\s\S]*feedDeclutter\(/);
  assert.doesNotMatch(map, /onRegionIsChanging/, 'nothing per frame');
  assert.match(map, /tagObstacleOnly: true/);
  const hook = fs.readFileSync('src/components/map/declutter/useMapDeclutter.ts', 'utf8');
  assert.match(hook, /THROTTLE_MS = 300/);
  // Soft round shadow: no hard ring border under the player shark.
  const styles = map.slice(map.indexOf('groundRing: {'), map.lastIndexOf('sharkDirectionCone'));
  assert.doesNotMatch(styles, /borderWidth/);
  assert.match(map, /<Image source=\{GROUND_GLOW\} tintColor="#05143c" style=\{styles\.groundRing\}/, 'a radial texture, no hard edge');
});

test('markers read their own placement (only they re-render) and stay mounted when hidden', () => {
  for (const file of ['src/screens/ExploreScreen/TaskMarker.tsx', 'src/screens/ExploreScreen/FindMarker.tsx',
    'src/screens/ExploreScreen/ItemMarker.tsx', 'src/screens/ExploreScreen/PinMarker.tsx', 'src/screens/ExploreScreen/VaultMarker.tsx',
    'src/components/map/fright/FrightMapSources.tsx']) {
    const src = fs.readFileSync(file, 'utf8');
    assert.match(src, /usePlacement\(/, file);
    assert.match(src, /<Placed /, file);
  }
  const placed = fs.readFileSync('src/components/map/declutter/Placed.tsx', 'utf8');
  assert.match(placed, /useSyncExternalStore/);
  assert.match(placed, /pointerEvents=\{placement\.visible \? 'box-none' : 'none'\}/);
});
