// P0 guard: a hook that runs only on some renders crashes the app.
// CoinLevelingModal called useDevAutoPress after `if (!rideCoin) return null;`. TaskCoinModal
// mounts it with no coin, so tapping a coin rendered two more hooks than the render before:
// "Rendered more hooks than during the previous render", a fatal error that closed the app.
//
// This runs eslint's react-hooks/rules-of-hooks over src/ and fails on every hook that is
// called conditionally (after an early return, inside an if, behind && or ?:) or in a loop.
// Older "hook inside a helper / callback" reports are fixed-count Reanimated patterns and
// are not counted here; this guard is about the order-changing class that crashes.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');

// Each entry needs a reason. The branch condition must be a constant for the life of the
// process (an EXPO_PUBLIC_ value inlined at bundle time), so the order never changes.
const ALLOWED = new Map([
  ['src/screens/MiniGameTesterScreen.tsx', 'dev-only screen; the branch is EXPO_PUBLIC_CQ_LAB, fixed at bundle time'],
  ['src/games/current-quest/LagoonBoard.tsx', 'fixed-length loops over constant arrays (same hook count every render)'],
]);

const ORDER_CHANGING = /called conditionally|executed more than once|after an early return/i;

test('no hook can change order between renders (rules-of-hooks)', { timeout: 240_000 }, async () => {
  const { ESLint } = require('eslint');
  const hooks = require('eslint-plugin-react-hooks');
  const parser = require('@typescript-eslint/parser');
  const eslint = new ESLint({
    cwd: ROOT,
    overrideConfigFile: true,
    allowInlineConfig: false,
    overrideConfig: [{
      files: ['**/*.ts', '**/*.tsx'],
      languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } },
      plugins: { 'react-hooks': hooks },
      rules: { 'react-hooks/rules-of-hooks': 'error' },
    }],
  });
  const results = await eslint.lintFiles(['src/**/*.ts', 'src/**/*.tsx']);
  const bad = [];
  for (const result of results) {
    const file = path.relative(ROOT, result.filePath);
    if (ALLOWED.has(file)) continue;
    for (const message of result.messages) {
      if (message.fatal) bad.push(`${file}:${message.line} parse error: ${message.message}`);
      else if (message.ruleId === 'react-hooks/rules-of-hooks' && ORDER_CHANGING.test(message.message)) {
        bad.push(`${file}:${message.line} ${message.message.split('.')[0]}`);
      }
    }
  }
  assert.equal(results.length > 500, true, 'the lint should cover all of src/');
  assert.deepEqual(bad, [], `Hooks that can change order between renders (a crash):\n${bad.join('\n')}`);
});

test('CoinLevelingModal runs every hook before its no-coin return', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(path.join(ROOT, 'src/components/CoinLevelingModal.tsx'), 'utf8');
  const early = source.indexOf('if (!rideCoin) return null;');
  assert.ok(early > 0, 'the no-coin return is still there');
  const tail = source.slice(early);
  assert.doesNotMatch(tail, /\buse[A-Z]\w*\(/, 'no hook call after `if (!rideCoin) return null;`');
});
