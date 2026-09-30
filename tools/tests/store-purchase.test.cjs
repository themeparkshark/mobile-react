const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const stub = {};
const hook = loadTs('src/hooks/usePurchaseItem.tsx', {
  react: { useCallback: fn => fn, useContext: () => ({}), useState: v => [v, () => {}] },
  'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
  'react-native': { StyleSheet: { create: v => v }, Text: 'Text', View: 'View' },
  'expo-image': { Image: 'Image' }, 'expo-haptics': {}, 'sprintf-js': { vsprintf: s => s },
  '../api/endpoints/me/inventory/purchase-item': stub, '../RootNavigation': stub,
  '../context/AuthProvider': stub, '../context/SoundEffectProvider': stub,
  '../ui': { BRAND: {}, GameDialog: 'GameDialog' }, './useCrumbs': { default: () => ({}) },
});

test('short players see the exact gap and one way to earn it', () => {
  const item = { cost: 350, currency: { name: 'Coins' } };
  assert.deepEqual({ ...hook.affordability({ coins: 310 }, item) }, { balance: 310, shortfall: 40 });
  assert.equal(hook.currencyLabel('Coins', 40), 'Shark Coins');
  assert.equal(hook.currencyLabel('Coins', 1), 'Shark Coin');
  assert.equal(hook.currencyLabel('Keys', 1), 'Key');
  assert.match(hook.earnAction('Coins').hint, /ride coin|daily chest/);
});

test('purchase UI uses the game dialog: no emoji, black scrims or silent failures', () => {
  const code = read('src/hooks/usePurchaseItem.tsx');
  assert.doesNotMatch(code, /[\u{1F300}-\u{1FAFF}]|rgba\(0,\s*0,\s*0|Alert\.alert/u);
  assert.match(code, /type: 'failed'/, 'a failed purchase shows an error sheet');
  assert.match(code, /not_enough_currency/, 'the server shortfall is shown');
});

test('the Shark Shop always reaches an end state and uses brand pills', () => {
  const code = read('src/screens/StoreScreen.tsx');
  assert.doesNotMatch(code, /<Loading \/>|rgba\(0, 0, 0, \.5\)/);
  assert.match(code, /setStatus\('error'\)/);
  assert.match(code, /state="empty"/);
  const card = read('src/screens/StoreScreen/Item.tsx');
  assert.match(card, /is_member_item/);
  assert.match(card, /navigate\('Membership'\)/);
});

test('the restock timer never sits on zero and uses brand surfaces', () => {
  const countdown = loadTs('src/components/StoreCountdown.tsx', {
    react: { useEffect() {}, useState: (v) => [typeof v === 'function' ? v() : v, () => {}] },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
    'react-native': { StyleSheet: { create: (s) => s }, Text: 'Text', View: 'View' },
    '../ui': { BRAND: { blue: '#0768b9', navy: '#05346e', white: '#fff', sky: '#bfe5ff' }, GameIcon: 'GameIcon' },
  });
  const now = Date.parse('2026-09-30T12:00:00Z');
  assert.deepEqual(plainObj(countdown.splitTimeLeft(now + 90_061_000, now)), { days: 1, hours: 1, minutes: 1, seconds: 1 });
  assert.equal(countdown.splitTimeLeft(now, now), null);
  assert.equal(countdown.splitTimeLeft(now - 5000, now), null);
  assert.equal(countdown.splitTimeLeft(NaN, now), null);

  const source = fs.readFileSync(path.join(root, 'src/components/StoreCountdown.tsx'), 'utf8');
  assert.doesNotMatch(source, /rgba\(0,\s*0,\s*0|FontAwesome/);
  assert.match(source, /Fresh gear is on its way/);
  const screen = fs.readFileSync(path.join(root, 'src/screens/StoreScreen.tsx'), 'utf8');
  assert.match(screen, /onElapsed=\{\(\) => setRestockPending\(true\)\}/);
});

function plainObj(value) { return JSON.parse(JSON.stringify(value)); }

test('paging never skips a page, a restock refresh never blanks the shop, and prices name their currency', () => {
  const screen = read('src/screens/StoreScreen.tsx');
  const loadMore = screen.slice(screen.indexOf('const loadMore'), screen.indexOf('return (', screen.indexOf('const loadMore')));
  assert.match(loadMore, /loadingMore\.current\) return;/, 'one page request at a time');
  assert.ok(loadMore.indexOf('await getItems') < loadMore.indexOf('setPage(next)'), 'the page advances only after it loads');
  assert.match(loadMore, /finally \{\s*loadingMore\.current = false;/);
  assert.match(screen, /silentReload\.current = true;\s*setAttempt/);
  assert.match(screen, /if \(!silent\) setStatus\('loading'\)/);
  assert.match(screen, /if \(live && !silent\) setStatus\('error'\)/);
  assert.match(read('src/hooks/usePurchaseItem.tsx'),
    /costs \$\{modal\.item\.cost\} \$\{currencyLabel\(modal\.item\.currency\.name, modal\.item\.cost\)\}\./);
});
