const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
const flags = loadTs('src/services/mapFlags.ts', {
  react: { useEffect() {}, useState: initial => [initial, () => {}] },
  '../api/endpoints/platform/feature-flags': { default: async () => ({ flags: {} }) },
});

test('map_gym_swords: absent or false reads as off, true turns it on, a failed read stays off', async () => {
  const payload = map => async () => ({ flags: map, min_app_version: '1.0.0', update_required: false, app_store_url: '' });
  flags.resetMapFlagsForTests();
  assert.equal((await flags.loadMapFlags(payload({}))).gymSwords, false, 'absent on the backend = off');
  flags.resetMapFlagsForTests();
  assert.equal((await flags.loadMapFlags(payload({ map_gym_swords: false }))).gymSwords, false);
  flags.resetMapFlagsForTests();
  assert.equal((await flags.loadMapFlags(async () => { throw new Error('offline'); })).gymSwords, false);
  flags.resetMapFlagsForTests();
  assert.equal((await flags.loadMapFlags(payload({ map_gym_swords: true }))).gymSwords, true);
  flags.resetMapFlagsForTests();
});

test('map_gym_swords off: Gym and Sword markers stay mounted but hidden, still and untouchable', () => {
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /const mapFlags = useMapFlags\(\);/);
  // Rendered exactly as before (no flag in the mount condition), only hidden.
  assert.match(explore, /\{gymData && \(\s*<GymMarker\s*hidden=\{!mapFlags\.gymSwords\}/);
  assert.match(explore, /\{swords\.map\(\(sword\) => \(\s*<SwordMarker\s*key=\{sword\.id\}\s*hidden=\{!mapFlags\.gymSwords\}/);
  assert.doesNotMatch(explore, /mapFlags\.gymSwords && \(?\s*<(GymMarker|SwordMarker)/);
  // The Community Center marker is untouched.
  assert.match(explore, /\{communityCenter && \(\s*<CommunityCenterMarker/);
  const marker = read('src/components/map/Marker.tsx');
  assert.match(marker, /pointerEvents=\{hidden \? 'none' : 'auto'\}/);
  assert.match(marker, /style=\{hidden \? HIDDEN : undefined\}/);
  assert.match(read('src/components/GymBattle/GymMarker.tsx'), /const running = alive && !hidden;/);
  assert.match(read('src/components/GymBattle/SwordMarker.tsx'), /const active = alive\.active && !hidden, running = alive\.running && !hidden;/);
  assert.match(read('src/api/endpoints/platform/feature-flags.ts'), /\| 'map_gym_swords'/);
});
