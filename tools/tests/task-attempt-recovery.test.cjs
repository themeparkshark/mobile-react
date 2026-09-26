const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = 'src/services/task-attempt/recovery.ts';
const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const calls = { get: [], start: [], write: [], failWrite: false };
const moduleRef = { exports: {} };
vm.runInNewContext(code, {
  module: moduleRef,
  exports: moduleRef.exports,
  console: { warn: () => {} },
  require(name) {
    if (name === '../../api/endpoints/me/task-attempts') return {
      getTaskAttempt: async id => { calls.get.push(id); return { attempt: { id, status: 'started' } }; },
      startTaskAttempt: async (...args) => { calls.start.push(args); return { attempt: { id: 123, status: 'started' } }; },
    };
    if (name === './checkpoint') return {
      writeTaskAttemptCheckpoint: async value => {
        calls.write.push(value);
        if (calls.failWrite) throw new Error('storage failed');
      },
    };
    throw new Error(`Unexpected dependency: ${name}`);
  },
}, { filename: file });
const { recoverTaskAttempt } = moduleRef.exports;
const checkpoint = {
  version: 1, playerId: 7, taskType: 'task', taskId: 91,
  requestId: 'tps-paid-attempt-0001', attemptId: null,
  latitude: 28.4, longitude: -81.5, savedAt: Date.now(),
};

test('a lost start response repeats only the original paid request and saves its ID', async () => {
  calls.get.length = calls.start.length = calls.write.length = 0;
  const result = await recoverTaskAttempt(checkpoint);
  assert.equal(result.attempt.id, 123);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.start)), [
    ['tps-paid-attempt-0001', 'task', 91, 28.4, -81.5],
  ]);
  assert.equal(calls.get.length, 0);
  assert.equal(calls.write[0].attemptId, 123);
});

test('a known paid attempt is read by ID without starting or charging another', async () => {
  calls.get.length = calls.start.length = calls.write.length = 0;
  const result = await recoverTaskAttempt({ ...checkpoint, attemptId: 456 });
  assert.equal(result.attempt.id, 456);
  assert.deepEqual(calls.get, [456]);
  assert.equal(calls.start.length, 0);
  assert.equal(calls.write.length, 0);
});

test('losing the ID write still leaves the original request usable', async () => {
  calls.get.length = calls.start.length = calls.write.length = 0;
  calls.failWrite = true;
  try {
    const result = await recoverTaskAttempt(checkpoint);
    assert.equal(result.attempt.id, 123);
    assert.equal(calls.start[0][0], checkpoint.requestId);
  } finally {
    calls.failWrite = false;
  }
});
