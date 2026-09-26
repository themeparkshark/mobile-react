const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const crewSource = fs.readFileSync(path.join(root, 'src/services/lineplay/crewRelay.ts'), 'utf8');
const crewCode = ts.transpileModule(crewSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const crewModule = { exports: {} };
vm.runInNewContext(crewCode, { module: crewModule, exports: crewModule.exports }, { filename: 'crewRelay.ts' });

const source = fs.readFileSync(path.join(root, 'src/services/lineplay/checkpoint.ts'), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const store = new Map();
const storage = {
  getItem: async key => store.get(key) ?? null,
  setItem: async (key, value) => { store.set(key, value); },
  removeItem: async key => { store.delete(key); },
};
const moduleRef = { exports: {} };
vm.runInNewContext(code, {
  module: moduleRef,
  exports: moduleRef.exports,
  require(name) {
    if (name === '@react-native-async-storage/async-storage') return { default: storage };
    if (name === './crewRelay') return crewModule.exports;
    throw new Error(`Unexpected dependency: ${name}`);
  },
}, { filename: 'checkpoint.ts' });

const { checkpointKey, parseCheckpoint, readCheckpoint, writeCheckpoint, removeCheckpoint } = moduleRef.exports;
const startedAt = Date.now();
const checkpoint = {
  version: 1,
  playerId: 12,
  rideId: 99,
  startRequestId: 'line-reconnect-request-001',
  serverSessionId: 'server-session-1',
  startedAt,
  endedAt: null,
  plannedWaitMinutes: 25,
  waitSource: 'posted',
  playlist: [{ kind: 'minigame', id: 'mg-1', gameId: 'memory', seed: 1 }],
  completedActivityIds: ['mg-1'],
  loreChoices: { 'lo-2': 1 },
  prediction: { card: { id: 'prediction-1' }, guess: 'beat' },
  crewRelay: crewModule.exports.createCrewRelay(12345),
  state: 'active',
  verifiedEligibleSeconds: 120,
  rewards: null,
  rewardsPending: false,
};

test('queue chapter and progress survive a local remount for the same player and ride', async () => {
  await writeCheckpoint(checkpoint);
  assert.deepEqual(JSON.parse(JSON.stringify(await readCheckpoint(12, 99))), JSON.parse(JSON.stringify(checkpoint)));
  assert.equal(await readCheckpoint(13, 99), null);
  assert.equal(await readCheckpoint(12, 100), null);
  await removeCheckpoint(12, 99);
  assert.equal(await readCheckpoint(12, 99), null);
});

test('old, malformed, and cross-account checkpoints are rejected', () => {
  const raw = JSON.stringify(checkpoint);
  assert.equal(parseCheckpoint(raw, 13, 99), null);
  assert.equal(parseCheckpoint(raw, 12, 99, startedAt + 3 * 60 * 60 * 1000 + 1), null);
  assert.equal(parseCheckpoint('{bad-json', 12, 99), null);
  assert.equal(parseCheckpoint(JSON.stringify({ ...checkpoint, completedActivityIds: 'mg-1' }), 12, 99), null);
  assert.equal(parseCheckpoint(JSON.stringify({ ...checkpoint, loreChoices: { 'lo-2': 8 } }), 12, 99), null);
  assert.equal(parseCheckpoint(JSON.stringify({ ...checkpoint, loreChoices: [] }), 12, 99), null);
  assert.equal(parseCheckpoint(JSON.stringify({ ...checkpoint, crewGridMarks: [0, 0] }), 12, 99), null);
  assert.equal(parseCheckpoint(JSON.stringify({ ...checkpoint, crewGridMarks: [9] }), 12, 99), null);
  assert.equal(parseCheckpoint(JSON.stringify({ ...checkpoint, crewRelay: { step: 'complete' } }), 12, 99), null);
  assert.equal(parseCheckpoint(JSON.stringify({ ...checkpoint, waitSource: 'made_up' }), 12, 99), null);
  assert.equal(parseCheckpoint(JSON.stringify({ ...checkpoint, extraRoundsAdded: 100 }), 12, 99), null);
  assert.equal(parseCheckpoint(JSON.stringify({ ...checkpoint, boardingConfirmed: 'yes' }), 12, 99), null);
  assert.equal(parseCheckpoint(JSON.stringify({ ...checkpoint, boardingAt: startedAt - 1 }), 12, 99), null);
  assert.equal(parseCheckpoint(JSON.stringify({ ...checkpoint, currentQuestProof: {
    seed: 1, score: 975, duration_seconds: 30, paths: [[0, 99], [0], [0]],
  } }), 12, 99), null);
  assert.equal(checkpointKey(12, 99) === checkpointKey(13, 99), false);
});

test('an unfinished Current Quest proof survives a queue remount', () => {
  const proof = { seed: 314159, score: 975, duration_seconds: 70,
    paths: [[0, 1, 5, 9, 10, 11, 15],
      [0, 5, 6, 7, 8, 9, 14, 19, 24],
      [0, 5, 6, 7, 12, 13, 18, 19, 24]] };
  const restored = parseCheckpoint(JSON.stringify({ ...checkpoint, currentQuestProof: proof }), 12, 99);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.currentQuestProof)), proof);
});

test('a long queue can restore extra waves within the bounded playlist cap', () => {
  const playlist = Array.from({ length: 80 }, (_, index) => ({
    kind: 'minigame', id: `encore-${index}`, gameId: 'memory', seed: index,
  }));
  const extended = { ...checkpoint, playlist, extraRoundsAdded: 40 };
  assert.ok(parseCheckpoint(JSON.stringify(extended), 12, 99));
  assert.equal(parseCheckpoint(JSON.stringify({ ...extended, playlist: [...playlist, playlist[0]] }), 12, 99), null);
});
