const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { root } = require('./helpers/load-ts.cjs');
const babel = require(path.join(root, 'node_modules/@babel/core'));

const transform = (code, isDev) => babel.transformSync(code, {
  cwd: root,
  filename: path.join(root, 'src/example.ts'),
  caller: { name: 'metro', isDev, platform: 'ios' },
}).code;

const SOURCE = [
  'console.log("launch");',
  'console.info("info"); console.debug("debug"); console.warn("warn");',
  'const value = ready && console.log("inline");',
  'console.error("keep me");',
  'function scoped(console) { console.log("local binding"); }',
].join('\n');

test('release bundles strip console noise but keep console.error', () => {
  const out = transform(SOURCE, false);
  assert.doesNotMatch(out, /console\.(log|info|debug|warn)\("(launch|info|debug|warn|inline)"\)/);
  assert.match(out, /console\.error\("keep me"\)/);
  assert.match(out, /ready\s*&&\s*void 0/);
  // A local variable named console is not the global console.
  assert.match(out, /console\.log\("local binding"\)/);
});

test('development bundles keep every console call', () => {
  const out = transform(SOURCE, true);
  assert.match(out, /console\.log\("launch"\)/);
  assert.match(out, /console\.warn\("warn"\)/);
});
