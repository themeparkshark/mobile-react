// P0 guard: a fatal JS error must never silently close the app.
// The coin-shelf crash ("Rendered more hooks than during the previous render") was a fatal
// error with no .ips on the phone and nothing for the tester to report. Error boundaries
// cannot catch throws in onPress handlers, timers or async code; in release those reach
// ErrorUtils' global handler, whose default closes the app. services/fatalErrors wraps it.
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs, read } = require('./helpers/load-ts.cjs');

function setup({ dev = false } = {}) {
  const store = new Map();
  const storage = {
    getItem: async key => (store.has(key) ? store.get(key) : null),
    setItem: async (key, value) => { store.set(key, value); },
  };
  const mod = loadTs('src/services/fatalErrors.ts', {
    '@react-native-async-storage/async-storage': storage,
    '../utils/hermesSafeError': loadTs('src/utils/hermesSafeError.ts'),
  });
  const calls = [];
  let handler = (error, isFatal) => calls.push(['default', error.message, isFatal]);
  const errorUtils = { getGlobalHandler: () => handler, setGlobalHandler: next => { handler = next; } };
  const reports = [];
  mod.installFatalHandler({ errorUtils, dev, storage, report: (error, fatal) => reports.push([error.message, fatal]) });
  return { mod, store, calls, reports, fire: (error, fatal) => handler(error, fatal) };
}

const flush = () => new Promise(resolve => setImmediate(resolve));
const hookCrash = () => new Error('Rendered more hooks than during the previous render.');

test('release: a fatal throw outside render shows the reload card instead of closing the app', async () => {
  const { mod, store, calls, reports, fire } = setup();
  const shown = [];
  mod.subscribeFatal(error => shown.push(error));
  fire(hookCrash(), true);
  await flush();
  assert.deepEqual(calls, [], 'the default handler (which kills the app) is not called');
  assert.equal(shown.length, 1);
  assert.equal(shown[0].message, 'Rendered more hooks than during the previous render.');
  assert.equal(shown[0].fatal, true);
  assert.deepEqual(reports, [['Rendered more hooks than during the previous render.', true]]);
  const saved = JSON.parse(store.get(mod.LAST_ERROR_KEY));
  assert.equal(saved.name, 'Error');
  assert.equal(saved.source, 'global');
  assert.deepEqual(await mod.readLastError(), saved);
});

test('release: before the app shell mounts (no card to show) the default handler still runs', () => {
  const { calls, fire } = setup();
  fire(new Error('boot'), true);
  assert.deepEqual(calls, [['default', 'boot', true]]);
});

test('dev keeps the red box; non-fatal errors keep the default path but are still saved', async () => {
  const dev = setup({ dev: true });
  dev.mod.subscribeFatal(() => assert.fail('dev never hides an error behind the card'));
  dev.fire(new Error('dev boom'), true);
  assert.deepEqual(dev.calls, [['default', 'dev boom', true]]);

  const rel = setup();
  rel.mod.subscribeFatal(() => assert.fail('a non-fatal error never replaces the app'));
  rel.fire(new Error('soft'), false);
  await flush();
  assert.deepEqual(rel.calls, [['default', 'soft', false]]);
  assert.equal(JSON.parse(rel.store.get(rel.mod.LAST_ERROR_KEY)).fatal, false);
});

test('odd throwables never break the handler', async () => {
  const { mod, fire } = setup();
  const shown = [];
  mod.subscribeFatal(error => shown.push(error));
  fire('a string', true);
  fire(null, true);
  fire({ get message() { throw new Error('getter'); } }, true);
  await flush();
  assert.equal(shown.length, 3);
  assert.equal(shown[0].message, 'a string');
  assert.equal(shown[1].message, 'Non-error thrown');
});

test('testers see the error text on the card; players do not', () => {
  const { mod } = setup();
  assert.equal(mod.showsErrorDetail('testflight', false), true);
  assert.equal(mod.showsErrorDetail('internal-tunnel', false), true);
  assert.equal(mod.showsErrorDetail('production', false), false);
  assert.equal(mod.showsErrorDetail(null, true), true);
  const line = mod.lastErrorLine({ name: 'TypeError', message: 'x is undefined', stack: 'TypeError: x\n at a\n at b', fatal: true, source: 'global', at: 0 });
  assert.match(line, /^Last error 1970-01-01T00:00:00.000Z \(fatal, global\): TypeError: x is undefined \(/);
});

test('wiring: App installs the handler, the boundary shows the card, Report a Problem attaches the last error', () => {
  const app = read('App.tsx');
  assert.match(app, /installFatalHandler\(\{/);
  assert.ok(app.indexOf('installFatalHandler({') > app.indexOf('initTelemetry()'), 'installed after telemetry so it wraps it');
  const boundary = read('src/components/AppErrorBoundary.tsx');
  assert.match(boundary, /subscribeFatal\(/);
  assert.match(boundary, /TAP TO RELOAD/);
  assert.doesNotMatch(boundary, /Updates\.reloadAsync\(/, 'no native JS reload: it hit the Fabric reload crash');
  assert.match(boundary, /showsErrorDetail\(Updates\.channel/);
  const feedback = read('src/components/Feedback/FeedbackHost.tsx');
  assert.match(feedback, /readLastError\(\)/);
  assert.match(feedback, /lastErrorLine\(/);
});
