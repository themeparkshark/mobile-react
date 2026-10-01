const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));

function compile(file, imports) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const moduleRef = { exports: {} };
  vm.runInNewContext(code, {
    module: moduleRef,
    exports: moduleRef.exports,
    require(name) {
      if (name in imports) return imports[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
    console: { warn() {}, error() {} }, Date, Math, JSON,
  }, { filename: file });
  return moduleRef.exports;
}

test('pending queue rewards survive screen teardown, repeated failures, and app reload', async () => {
  const store = new Map();
  const storage = {
    getItem: async key => store.get(key) ?? null,
    setItem: async (key, value) => { store.set(key, value); },
    removeItem: async key => { store.delete(key); },
  };
  let attempts = 0;
  let succeed = false;
  const complete = async sessionId => {
    attempts++;
    if (!succeed) throw new Error('offline');
    return { success: true, session_id: sessionId, status: 'completed' };
  };
  const create = () => {
    const queue = compile('src/services/lineplay/RedeemRetryQueue.ts', {
      '@react-native-async-storage/async-storage': { default: storage },
      'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    });
    return compile('src/services/lineplay/rewardRecovery.ts', {
      '../../api/endpoints/me/inline-timer/complete': { default: complete },
      '../../api/endpoints/me/inline-timer/start': { default: async () => { throw new Error('unused'); } },
      './RedeemRetryQueue': queue,
    });
  };

  const first = create();
  await first.linePlayRewardQueue.enqueue({ sessionId: 'server-123' }, 'complete_server-123');
  assert.equal(await first.linePlayRewardQueue.size(), 1);
  first.setLinePlayRecoverySignedIn(true);
  await new Promise(resolve => setImmediate(resolve));
  for (let i = 0; i < 10; i++) {
    await first.linePlayRewardQueue.drain();
  }
  assert.ok(attempts >= 8);
  assert.equal(await first.linePlayRewardQueue.size(), 1);

  first.setLinePlayRecoverySignedIn(false);
  const restored = create();
  let delivered = 0;
  restored.subscribeLinePlayRewardRecovery(() => { delivered++; });
  succeed = true;
  restored.setLinePlayRecoverySignedIn(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await restored.linePlayRewardQueue.size(), 0);
  assert.equal(delivered, 1);
});
