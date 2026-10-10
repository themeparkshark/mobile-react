'use strict';
/**
 * Launch "Uncaught Error: Error.stack getter called with an invalid receiver".
 *
 * Root cause: on Hermes (RN 0.76), Error.prototype.stack is an accessor that
 * throws for objects the Error constructor did not build. axios 0.27's
 * AxiosError is one (Error.call(this) + Object.create(Error.prototype)), so
 * any reader of `.stack` on an unhandled API rejection threw: React Native's
 * dev rejection tracker (the red screen), and our release telemetry handlers
 * once a DSN is set. The fix gives axios rejections an own stack and makes
 * telemetry read stacks without throwing.
 */
const assert = require('node:assert/strict'), test = require('node:test'), fs = require('node:fs');
const path = require('node:path'), os = require('node:os'), { execFileSync } = require('node:child_process');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const safe = () => loadTs('src/utils/hermesSafeError.ts');
const HERMES_MESSAGE = 'Error.stack getter called with an invalid receiver';

/** Node stand-in for Hermes: a prototype whose stack getter rejects the receiver. */
function hermesLikeAxiosError(message) {
  const proto = Object.create(Error.prototype, {
    stack: { get() { throw new TypeError(HERMES_MESSAGE); }, configurable: true },
  });
  function AxiosError(m) { this.message = m; this.name = 'AxiosError'; this.isAxiosError = true; }
  AxiosError.prototype = Object.create(proto, { constructor: { value: AxiosError } });
  return new AxiosError(message);
}

test('an axios-shaped error throws on .stack before the fix and reads a stack after', () => {
  const { withOwnStack, readStack } = safe();
  const error = hermesLikeAxiosError('Request failed with status code 401');
  assert.throws(() => error.stack, { message: HERMES_MESSAGE });
  assert.equal(readStack(error), undefined, 'readStack never throws');
  assert.equal(withOwnStack(error), error, 'same object, so isAxiosError and response survive');
  assert.match(error.stack, /^AxiosError: Request failed with status code 401/);
  assert.equal(error.isAxiosError, true);
  assert.equal(Object.keys(error).includes('stack'), false, 'not enumerable: JSON and logs unchanged');
});

test('real errors and non-objects pass through untouched', () => {
  const { withOwnStack, readStack } = safe();
  const real = new Error('boom');
  const before = real.stack;
  assert.equal(withOwnStack(real).stack, before);
  assert.equal(withOwnStack('text'), 'text');
  assert.equal(withOwnStack(null), null);
  assert.equal(readStack({ stack: 42 }), undefined);
});

test('the reproducer from React Native\'s rejection tracker no longer throws', () => {
  const { withOwnStack } = safe();
  // promiseRejectionTrackingOptions.js:39, verbatim condition.
  const tracker = rejection => (rejection.stack && typeof rejection.stack === 'string') ? rejection.stack : undefined;
  const error = hermesLikeAxiosError('Network Error');
  assert.throws(() => tracker(error), { message: HERMES_MESSAGE });
  withOwnStack(error);
  assert.match(tracker(error), /^AxiosError: Network Error/);
});

test('every axios rejection gets its own stack first, on the app client and the default instance', () => {
  const client = fs.readFileSync(path.join(root, 'src/api/client.ts'), 'utf8');
  const handler = client.slice(client.indexOf('(error: AxiosError) => {'));
  assert.ok(handler.indexOf('withOwnStack(error);') < handler.indexOf('axios.isCancel(error)'),
    'before the cancel early return, so CanceledError is covered too');
  assert.match(client, /\(error: unknown\) => Promise\.reject\(withOwnStack\(error\)\),\n\);/);
  assert.match(client, /Promise\.reject\(withOwnStack\(nonJsonError\(response\)\)\)/, 'portal-page rejections get a stack too');
  const telemetry = fs.readFileSync(path.join(root, 'src/services/telemetry/index.ts'), 'utf8');
  assert.match(telemetry, /stack: readStack\(candidate\)/);
  assert.doesNotMatch(telemetry, /candidate\.stack/);
});

test('on the real Hermes engine: axios 0.27 AxiosError throws, withOwnStack fixes it', (t) => {
  const hermes = path.join(root, 'node_modules/react-native/sdks/hermesc/osx-bin/hermes');
  if (!fs.existsSync(hermes)) { t.skip('Hermes CLI not in this checkout'); return; }
  const ts = require(path.join(root, 'node_modules/typescript'));
  const helper = ts.transpileModule(fs.readFileSync(path.join(root, 'src/utils/hermesSafeError.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const axiosError = fs.readFileSync(path.join(root, 'node_modules/axios/lib/core/AxiosError.js'), 'utf8');
  const script = `
    var exports = {}; var module = { exports: {} };
    ${helper}
    var safe = exports;
    var axiosModule = { exports: {} };
    var axiosUtils = {
      inherits: function (ctor, superCtor, props, descriptors) {
        ctor.prototype = Object.create(superCtor.prototype, descriptors);
        ctor.prototype.constructor = ctor;
        if (props) Object.assign(ctor.prototype, props);
      },
      toFlatObject: function () { return {}; },
    };
    (function (module, require) { ${axiosError} })(axiosModule, function () { return axiosUtils; });
    var AxiosError = axiosModule.exports;
    var e = new AxiosError('Request failed with status code 401', 'ERR_BAD_REQUEST');
    var before = 'ok'; try { void e.stack; } catch (x) { before = x.message; }
    safe.withOwnStack(e);
    var after = 'ok'; try { after = typeof e.stack === 'string' && e.stack.indexOf('AxiosError: Request failed') === 0 ? 'ok' : 'bad'; } catch (x) { after = x.message; }
    print(before + '|' + after);
  `;
  const file = path.join(os.tmpdir(), `hermes-safe-error-${process.pid}.js`);
  fs.writeFileSync(file, script);
  try {
    const out = execFileSync(hermes, [file], { encoding: 'utf8' }).trim();
    assert.equal(out, `${HERMES_MESSAGE}|ok`);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test('the launch-time /reaction-types fetch (app root ForumProvider) cannot reject unhandled offline', () => {
  const forum = fs.readFileSync(path.join(root, 'src/context/ForumProvider.tsx'), 'utf8');
  assert.match(forum, /try \{\s*const types = await all\(\);\s*if \(Array\.isArray\(types\)\) setReactionTypes\(types\);\s*\} catch \{/);
});
