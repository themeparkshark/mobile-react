const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { read, root } = require('./helpers/load-ts.cjs');

const pkg = JSON.parse(read('package.json'));

test('typecheck and test scripts exist and verify chains them', () => {
  assert.equal(pkg.scripts.typecheck, 'tsc --noEmit');
  assert.equal(pkg.scripts.test, 'node --test tools/tests/*.test.cjs');
  assert.match(pkg.scripts.verify, /typecheck/);
});

test('every EAS build runs the API gate, even when eas build is called directly', () => {
  assert.match(pkg.scripts['eas-build-pre-install'], /check-api-target\.cjs "\$EAS_BUILD_PROFILE"/);
  for (const [name, script] of Object.entries(pkg.scripts)) {
    if (/eas build --profile (\S+)/.test(script)) {
      const profile = script.match(/eas build --profile (\S+)/)[1];
      assert.match(script, new RegExp(`check:api -- ${profile} &&`), name);
    }
  }
  assert.equal(pkg.scripts['build-preview'], undefined, 'the dead preview profile is gone');
});

test('the pre-commit hook is executable and runs both gates', () => {
  const hook = path.join(root, '.githooks/pre-commit');
  assert.ok(fs.statSync(hook).mode & 0o111, 'hook must be executable');
  const body = fs.readFileSync(hook, 'utf8');
  assert.match(body, /typecheck/);
  assert.match(body, /npm test/);
  assert.equal(pkg.scripts['hooks:install'], 'git config core.hooksPath .githooks');
});

test('CI runs typecheck and node tests', () => {
  const ci = read('.github/workflows/app-ci.yml');
  assert.match(ci, /npm run typecheck/);
  assert.match(ci, /npm test/);
});
