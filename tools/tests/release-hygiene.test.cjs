const assert = require('node:assert/strict');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const { read, root } = require('./helpers/load-ts.cjs');

test('the local API backup env file is not tracked', () => {
  const tracked = execFileSync('git', ['ls-files', '--', '.env.local.backup'], { cwd: root, encoding: 'utf8' });
  assert.equal(tracked.trim(), '');
  assert.match(read('.gitignore'), /^\.env\.local\.backup$/m);
});

test('the API URL is never logged at startup', () => {
  assert.doesNotMatch(read('src/config.ts'), /console\./);
});

test('the API client does not send the owner-chosen device name', () => {
  const client = read('src/api/client.ts');
  assert.doesNotMatch(client, /headers\.common\['Device-Name'\]/);
  assert.doesNotMatch(client, /deviceName/);
});

test('unhandled promise rejections are not hidden from LogBox', () => {
  const app = read('App.tsx');
  assert.doesNotMatch(app, /LogBox\.ignoreLogs/);
  assert.doesNotMatch(app, /Possible Unhandled Promise Rejection/);
});

test('node_modules is never tracked, including a worktree symlink', () => {
  const tracked = execFileSync('git', ['ls-files', '--', 'node_modules'], { cwd: root, encoding: 'utf8' });
  assert.equal(tracked.trim(), '');
  assert.match(read('.gitignore'), /^\/node_modules$/m);
});
