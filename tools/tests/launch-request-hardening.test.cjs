const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/launch-request-hardening.test.cjs
// Launch-time and map-render reads: a 200 in the wrong shape (empty body,
// error JSON, old server) rejects or falls back; it never reaches a render.

const root = path.resolve(__dirname, '../..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const clientWith = body => ({ __esModule: true, default: { get: async () => ({ data: body }), post: async () => ({ data: body }) } });
const PORTALISH = ['', null, { error: 'nope' }, [], 'hello'];

function gymApi(body) {
  return loadTs('src/api/endpoints/gym-battle/index.ts', {
    '../../client': clientWith(body),
    './arenaLocation': { arenaLocation: async () => ({}) },
    './getMyParkCoins': { getMyParkCoins: () => undefined },
  });
}

test('getSwords: bad shapes reject, real spawns (number or decimal-string coords) pass, junk spawns drop', async () => {
  for (const body of PORTALISH) await assert.rejects(gymApi(body).getSwords(8), /Unexpected reply/);
  const ok = await gymApi({ swords: [
    { id: 1, latitude: 33.81, longitude: -117.9 },
    { id: 2, latitude: '33.81210000', longitude: '-117.91900000' },
    { id: 3, latitude: null, longitude: 1 },
    null,
  ], count: 4 }).getSwords(8);
  assert.deepEqual(Array.from(ok.swords, s => s.id), [1, 2]);
  assert.equal(ok.count, 2);
  assert.equal(ok.swords[1].latitude, '33.81210000', 'values are never rewritten');
});

test('getGym: no gym or no coordinates rejects; the decimal-string gym passes', async () => {
  for (const body of [...PORTALISH, { gym: null }, { gym: { latitude: 'x', longitude: 1 } }]) {
    await assert.rejects(gymApi(body).getGym(8), /Unexpected reply/);
  }
  const ok = await gymApi({ gym: { id: 1, latitude: '33.8', longitude: '-117.9' }, scores: {} }).getGym(8);
  assert.equal(ok.gym.id, 1);
});

test('getMyTeam: a non-object rejects', async () => {
  for (const body of ['', null, [], 'x']) await assert.rejects(gymApi(body).getMyTeam(), /Unexpected reply/);
  assert.equal((await gymApi({ has_team: true, team: 'shark' }).getMyTeam()).team, 'shark');
});

test('getCommunityCenter: anything without coordinates is "none here"', async () => {
  const load = body => loadTs('src/api/endpoints/community-center/getCommunityCenter.ts', { '../../client': clientWith(body) }).default;
  for (const body of [...PORTALISH, { id: 1 }]) assert.equal(await load(body)(8), null);
  assert.equal((await load({ id: 4, latitude: '33.8', longitude: '-117.9' })(8)).id, 4);
});

test('daily gift: a reply without a gift rejects, and the launch timer catches it', async () => {
  const load = body => loadTs('src/api/endpoints/daily-gifts/create.ts', { '../../client': clientWith(body) }).default;
  for (const body of ['', { message: 'x' }, { data: null }]) await assert.rejects(load(body)(), /Unexpected reply/);
  assert.equal((await load({ data: { id: 3 } })()).id, 3);
  assert.match(read('src/context/DailyGiftProvider.tsx'), /try \{\s*setDailyGift\(await getDailyGift\(\)\);\s*\} catch/);
});

test('theme: a theme without a tracks list gets an empty list; provider guards the map', () => {
  const src = read('src/api/endpoints/current-theme/get.ts');
  assert.match(src, /Array\.isArray\(tracks\) \? data : \{ \.\.\.data, tracks: \[\] \}/);
  assert.match(read('src/context/ThemeProvider.tsx'), /!Array\.isArray\(theme\?\.tracks\)/);
});

test('launch promises are never left unhandled', () => {
  const drop = read('src/components/SharkDropHandler.tsx');
  assert.match(drop, /Linking\.getInitialURL\(\)\.then\(queue\)\.catch\(/);
  assert.match(drop, /if \(!data\?\.data \|\| typeof data\.data !== 'object'\) throw/);
  assert.match(drop, /typeof serverMessage === 'string'/);
  assert.match(read('src/hooks/useAxiosSetup.ts'), /Promise\.resolve\(logoutRef\.current\(\)\)\.catch\(/);
  assert.match(read('src/components/Tutorial/TutorialProvider.tsx'), /\}\)\.catch\(\(\) => setLoaded\(true\)\)/);
  const auth = read('src/context/AuthProvider.tsx');
  assert.match(auth, /await logout\(\)\.catch\(\(\) => undefined\)/);
  assert.match(auth, /AsyncStorage\.getItem\('player'\)\.catch\(\(\) => null\)/);
  assert.match(read('src/screens/ExploreScreen.tsx'), /getMyTeam\(\)\.then\(setPlayerTeam\)\.catch\(/);
});
