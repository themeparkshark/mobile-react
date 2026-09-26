const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const source = fs.readFileSync(path.join(root, 'src/services/task-attempt/checkpoint.ts'), 'utf8');
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
    throw new Error(`Unexpected dependency: ${name}`);
  },
}, { filename: 'task-attempt/checkpoint.ts' });
const { taskAttemptCheckpointKey, parseTaskAttemptCheckpoint,
  readTaskAttemptCheckpoint, writeTaskAttemptCheckpoint,
  removeTaskAttemptCheckpoint } = moduleRef.exports;

const savedAt = Date.now();
const checkpoint = {
  version: 1,
  playerId: 7,
  taskType: 'task',
  taskId: 91,
  requestId: 'tps-paid-attempt-0001',
  attemptId: null,
  latitude: 28.4,
  longitude: -81.5,
  savedAt,
};

test('a lost start response retains the same paid request and location after remount', async () => {
  await writeTaskAttemptCheckpoint(checkpoint);
  assert.deepEqual(JSON.parse(JSON.stringify(await readTaskAttemptCheckpoint(7, 'task', 91))), checkpoint);
  await writeTaskAttemptCheckpoint({ ...checkpoint, attemptId: 123 });
  assert.equal((await readTaskAttemptCheckpoint(7, 'task', 91)).attemptId, 123);
  assert.equal(await readTaskAttemptCheckpoint(8, 'task', 91), null);
  assert.equal(await readTaskAttemptCheckpoint(7, 'secret_task', 91), null);
  await removeTaskAttemptCheckpoint(7, 'task', 91);
  assert.equal(await readTaskAttemptCheckpoint(7, 'task', 91), null);
});

test('invalid, future, and stale saves cannot be reused to spend a Ticket', () => {
  const raw = JSON.stringify(checkpoint);
  assert.equal(parseTaskAttemptCheckpoint(raw, 7, 'task', 91, savedAt + 2 * 60 * 60 * 1000 + 1), null);
  assert.equal(parseTaskAttemptCheckpoint(JSON.stringify({ ...checkpoint, savedAt: savedAt + 120_000 }), 7, 'task', 91, savedAt), null);
  assert.equal(parseTaskAttemptCheckpoint(JSON.stringify({ ...checkpoint, latitude: 200 }), 7, 'task', 91), null);
  assert.equal(parseTaskAttemptCheckpoint(JSON.stringify({ ...checkpoint, requestId: 'short' }), 7, 'task', 91), null);
  assert.equal(taskAttemptCheckpointKey(7, 'task', 91) === taskAttemptCheckpointKey(7, 'task', 92), false);
});

test('a storage read failure is surfaced so the app does not assume no paid attempt exists', async () => {
  const original = storage.getItem;
  storage.getItem = async () => { throw new Error('storage unavailable'); };
  try {
    await assert.rejects(readTaskAttemptCheckpoint(7, 'task', 91), /storage unavailable/);
  } finally {
    storage.getItem = original;
  }
});
