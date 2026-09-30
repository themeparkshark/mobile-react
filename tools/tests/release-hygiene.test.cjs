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

test('the crash fallback is an on-brand card: kit tokens, his yellow button art, brand fonts', () => {
  const app = read('App.tsx');
  const fallback = app.slice(app.indexOf('const ErrorFallback'), app.indexOf("import { ToastProvider }"));
  assert.ok(fallback.length > 0, 'ErrorFallback block found');
  assert.match(fallback, /backgroundColor: BRAND\.cream/, 'cream card');
  assert.match(fallback, /borderColor: BRAND\.navy/, 'navy outline');
  // The CTA is the WS0 GameButton (Dustin's yellow_button.png), not a hand-rolled gold box.
  assert.match(fallback, /<GameButton label="Try again" onPress=\{resetError\}/);
  assert.doesNotMatch(fallback, /#[0-9a-f]{6}\b/i, 'colours come from BRAND tokens');
  assert.match(app, /from '\.\/src\/ui'/);
  assert.match(fallback, /fontFamily: FONT\.display/);
  assert.match(fallback, /fontFamily: FONT\.body/);
  // Card waits for fonts so the brand type never flashes as system text.
  assert.match(fallback, /fontsSettled && <View style=\{errorStyles\.card\}>/);
  // No dark or neon surfaces, no system-weight-only text, no em dashes.
  assert.doesNotMatch(fallback, /fontWeight/);
  assert.doesNotMatch(fallback, /#0{3,6}\b|#050a1e|black/i);
  assert.doesNotMatch(fallback, /—/);
  // The crash is still reported.
  assert.match(app, /onError=\{reportBoundaryError\}/);
});
