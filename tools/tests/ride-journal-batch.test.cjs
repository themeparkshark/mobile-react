const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = 'src/services/rideJournalBatch.ts';
const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(code, { module: moduleRef, exports: moduleRef.exports, Date, Set }, { filename: file });
const { saveDetectedRideBatch } = moduleRef.exports;

const rides = [
  { id: 'det_one', rideId: 10, enteredAt: Date.UTC(2026, 8, 25, 12) },
  { id: 'det_two', rideId: 11, enteredAt: Date.UTC(2026, 8, 25, 13) },
];

test('partial save counts only confirmed memories and leaves the failed detection pending', async () => {
  const posted = [];
  const removed = [];
  const result = await saveDetectedRideBatch(rides, new Map([
    ['det_one', { rating: 5, reaction: '🤯' }],
  ]), new Set(), async payload => {
    posted.push(payload);
    if (payload.source_detection_id === 'det_two') throw new Error('offline');
  }, async id => { removed.push(id); });

  assert.deepEqual([...result.savedIds], ['det_one']);
  assert.deepEqual([...result.failedIds], ['det_two']);
  assert.deepEqual(removed, ['det_one']);
  assert.equal(posted[0].source_detection_id, 'det_one');
  assert.equal(posted[0].rating, 5);
  assert.equal(posted[1].source_detection_id, 'det_two');
});

test('retry skips the already saved journal entry and saves only the remaining detection', async () => {
  const posted = [];
  const removed = [];
  const result = await saveDetectedRideBatch(rides, new Map(), new Set(['det_one']),
    async payload => { posted.push(payload.source_detection_id); },
    async id => { removed.push(id); });

  assert.deepEqual(posted, ['det_two']);
  assert.deepEqual(removed, ['det_one', 'det_two']);
  assert.deepEqual([...result.savedIds], ['det_one', 'det_two']);
  assert.equal(result.failedIds.size, 0);
});

test('local cleanup failure does not pretend the server save failed or post twice', async () => {
  let posts = 0;
  const first = await saveDetectedRideBatch([rides[0]], new Map(), new Set(),
    async () => { posts++; }, async () => { throw new Error('storage failure'); });
  assert.deepEqual([...first.savedIds], ['det_one']);
  assert.equal(first.failedIds.size, 0);

  const second = await saveDetectedRideBatch([rides[0]], new Map(), first.savedIds,
    async () => { posts++; }, async () => {});
  assert.equal(posts, 1);
  assert.equal(second.failedIds.size, 0);
});
