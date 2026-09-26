const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = 'src/services/lineplay/episodeRotation.ts';
const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function harness(store = new Map()) {
  const moduleRef = { exports: {} };
  const storage = {
    getItem: async key => store.get(key) ?? null,
    setItem: async (key, value) => { store.set(key, value); },
  };
  vm.runInNewContext(code, {
    module: moduleRef, exports: moduleRef.exports,
    require: name => name === '@react-native-async-storage/async-storage'
      ? { default: storage } : (() => { throw new Error(name); })(),
  }, { filename: file });
  return { ...moduleRef.exports, store };
}

test('opening a story does not consume it; playing cycles through every episode per ride', async () => {
  const { selectAdaptiveEpisode, recordAdaptiveEpisode, adaptiveEpisodeKey, store } = harness();
  const first = await selectAdaptiveEpisode(12, 8, 99, 3, 5);
  assert.equal(await selectAdaptiveEpisode(12, 8, 99, 3, 5), first);
  assert.equal(store.has(adaptiveEpisodeKey(12, 8, 99)), false);
  await recordAdaptiveEpisode(12, 8, 99, first, 3);
  const second = await selectAdaptiveEpisode(12, 8, 99, 3, 5);
  await recordAdaptiveEpisode(12, 8, 99, second, 3);
  const third = await selectAdaptiveEpisode(12, 8, 99, 3, 5);
  assert.equal(new Set([first, second, third]).size, 3);
  assert.equal(store.get(adaptiveEpisodeKey(12, 8, 99)), String(second));
  assert.equal(await selectAdaptiveEpisode(12, 8, 100, 3, 5), first);
  assert.equal(await selectAdaptiveEpisode(13, 8, 99, 3, 5), first);
});

test('bad history and storage failure still allow a queue story', async () => {
  const store = new Map([['lineplay_last_adaptive_episode_v1_12_8_99', 'bad']]);
  const { selectAdaptiveEpisode } = harness(store);
  assert.equal(await selectAdaptiveEpisode(12, 8, 99, 3, 5), 2);
  const unavailable = harness();
  unavailable.store.set = () => { throw new Error('storage unavailable'); };
  assert.equal(await unavailable.selectAdaptiveEpisode(12, 8, 99, 3, 5), 2);
  await unavailable.recordAdaptiveEpisode(12, 8, 99, 2, 3);
});
