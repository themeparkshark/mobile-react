const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');

test('T173: I promise wakes only after the three rules showed, and a stray tab-bar tap only closes the sheet', () => {
  const src = read('src/screens/threads/RulesCard.tsx');
  assert.match(src, /export const PROMISE_READY_MS = RULE_STEP_MS \* RULES\.length \+ 450;/);
  assert.match(src, /timers\.push\(setTimeout\(\(\) => setReady\(true\), PROMISE_READY_MS\)\);/);
  assert.match(src, /label="I promise"\n\s*icon="check"\n\s*disabled=\{!ready\}\n\s*onPress=\{\(\) => \{\n\s*if \(!ready\) return;/);
  // The promise is never the lowest button: Not now sits under it, over the tab bar.
  const promise = src.indexOf('label="I promise"');
  const notNow = src.indexOf('label="Not now"');
  assert.ok(promise > 0 && notNow > promise, 'Not now comes after (below) I promise');
  assert.match(src, /if \(!visible\) \{ rows\.forEach\(v => \{ v\.value = 0; \}\); setReady\(false\);/, 'every open starts locked again');
  assert.match(src, /withSpring\(1, SPRING\.settle\)/, 'rules settle in on springs');
});
