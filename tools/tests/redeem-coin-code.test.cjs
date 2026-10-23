const assert = require('node:assert/strict'), test = require('node:test');
const fs = require('node:fs'), path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const model = loadTs('src/screens/RedeemCoinCode/redeemCodeModel.ts');
const root = path.resolve(__dirname, '../..');

test('codes up to 20 letters and numbers fit (Shark Drop codes are 4 to 20)', () => {
  assert.equal(model.cleanCode('pbugs-zero 1tix'), 'PBUGSZERO1TIX');
  assert.equal(model.cleanCode('A'.repeat(25)).length, 20);
  assert.equal(model.codeReady('ABC'), false);
  assert.equal(model.codeReady('SHARKDROPHALLOWEEN26'), true);
  const screen = fs.readFileSync(path.join(root, 'src/screens/RedeemCoinCodeScreen.tsx'), 'utf8');
  assert.doesNotMatch(screen, /maxLength=\{9\}/, 'the old 9 character cap is gone');
});

test('a 0-coin code never shows a coin line and shows what it really gave', () => {
  assert.deepEqual(plain(model.codeRewardLines({ coins: 0, tickets: 1, energy: 5, item: [],
    granted: { coins: 0, tickets: 1, energy: 5, item: false } }).map(l => l.text)), ['+1 Ticket', '+5 Energy']);
  assert.deepEqual(plain(model.codeRewardLines({ coins: 0, tickets: 0, energy: 0, item: null })), []);
});

test('the server granted values win (a ticket cap can turn tickets into coins)', () => {
  const lines = model.codeRewardLines({ coins: 0, tickets: 3, granted: { coins: 20, tickets: 1, energy: 0 } });
  assert.deepEqual(plain(lines.map(l => l.text)), ['+20 coins', '+1 Ticket']);
});

test('an item code names the item and uses its art', () => {
  const [line] = model.codeRewardLines({ coins: 0, item: { name: 'Shark Hat', icon_url: 'https://x/hat.png' } });
  assert.equal(line.text, 'Shark Hat unlocked!');
  assert.equal(line.imageUrl, 'https://x/hat.png');
});

test('errors read in kid words: every known server reply maps to kid copy', () => {
  const C = model.REDEEM_COPY;
  // The exact replies release-3-be sends (CoinCodeController, the two CoinCode exceptions, RedeemCoinCodeAction).
  assert.equal(model.redeemErrorMessage({ response: { status: 404,
    data: { message: 'The code you have entered is incorrect, please try again.' } } }), C.wrong);
  assert.equal(model.redeemErrorMessage({ response: { status: 422, data: { message: 'You already used this coin code.' } } }), C.used);
  assert.equal(model.redeemErrorMessage({ response: { status: 422,
    data: { message: 'This coin code has been used up. Watch for a new one!' } } }), C.usedUp);
  assert.equal(model.redeemErrorMessage({ response: { status: 410,
    data: { message: 'This Shark Drop has ended. Watch @themeparkshark for the next one!' } } }), C.dropEnded);
  assert.equal(model.redeemErrorMessage({ response: { status: 422,
    data: { message: 'The code field must only contain letters and numbers.', errors: { code: ['x'] } } } }), C.wrong);
  assert.equal(model.redeemErrorMessage({ response: { status: 429, data: { message: 'Too Many Attempts.' } } }), C.slowDown);
  assert.equal(model.redeemErrorMessage(new Error('Network Error')), C.offline);
  assert.equal(model.redeemErrorMessage({ message: 'Network Error', response: { status: 0 } }), C.offline);
  assert.equal(model.redeemErrorMessage({ response: { status: 500, data: {} } }), C.offline);
  // A reply we have never seen still shows the server's words rather than nothing.
  assert.equal(model.redeemErrorMessage({ response: { status: 418, data: { message: 'Brand new rule.' } } }), 'Brand new rule.');
  assert.equal(model.redeemError(new Error('x')).icon, 'retry');
  assert.equal(model.redeemError({ response: { status: 404, data: {} } }).icon, 'search');
  for (const text of Object.values(C)) assert.doesNotMatch(text, /\u2014/, 'no em dashes');
});

test('the error card has a picture, a gentle shake and a haptic; the open chest pops with a burst', () => {
  const screen = fs.readFileSync(path.join(root, 'src/screens/RedeemCoinCodeScreen.tsx'), 'utf8');
  assert.match(screen, /<GameIcon name=\{error\.icon\}/);
  assert.match(screen, /Haptics\.notificationAsync/);
  assert.match(screen, /shake/);
  assert.match(screen, /chest_open_empty/, 'no gold pile on a code that gave no coins');
  assert.match(screen, /reward\.mp3/);
  assert.match(screen, /useNativeDriver: true/);
});

test('the screen never draws a bare number outside Text (the old 0-coin crash)', () => {
  const screen = fs.readFileSync(path.join(root, 'src/screens/RedeemCoinCodeScreen.tsx'), 'utf8');
  assert.doesNotMatch(screen, /\.coins &&/);
  assert.doesNotMatch(screen, /Alert\.alert/);
});

test('the chest opens on the same frame as the burst, and the prize card never shows empty', () => {
  const screen = fs.readFileSync(path.join(root, 'src/screens/RedeemCoinCodeScreen.tsx'), 'utf8');
  // The chest swap is a native opacity change, not React state, so it rides in the same batch as the pop and burst.
  assert.doesNotMatch(screen, /useLayoutEffect/);
  assert.match(screen, /opacity: Animated\.subtract\(1, Animated\.add\(openCoins, openEmpty\)\)/);
  assert.match(screen, /\{ opacity: openCoins \}/);
  assert.match(screen, /\{ opacity: openEmpty \}/);
  const party = screen.slice(screen.indexOf('const celebrate'), screen.indexOf('const opened'));
  assert.match(party, /Animated\.parallel\(\[\s*now\(chest, 1\),/);
  assert.match(party, /now\(pop, 0\.9\)/, 'the pop starts moving on the first frame');
  assert.match(party, /now\(burst, 0\.5\)/, 'the first burst ray shows on the first frame');
  assert.match(party, /toValue: 1\.12/);
  // It starts before the prize card renders, in the same tick as the reply.
  assert.match(screen, /celebrate\(coins\);\s*setRewards\(lines\);/);
  // The card fades and grows in on the native driver, and resets before the next code.
  assert.match(screen, /<Animated\.View style=\{\[styles\.prizeCard, \{ opacity: cardIn,/);
  assert.match(screen, /outputRange: \[0\.96, 1\]/);
  assert.match(screen, /cardIn\.setValue\(0\);\s*openCoins\.setValue\(0\);\s*openEmpty\.setValue\(0\);\s*formIn\.setValue\(1\);/);
  assert.match(screen, /const celebrate = useCallback\(\(coins: boolean\) => \{\s*playSound\(require\('..\/..\/assets\/sounds\/reward\.mp3'\)/);
});

test('the chest never jumps: the code box and the prize card share one slot above it', () => {
  const screen = fs.readFileSync(path.join(root, 'src/screens/RedeemCoinCodeScreen.tsx'), 'utf8');
  // The form stays mounted (it fades up and away), so the slot keeps its height.
  assert.doesNotMatch(screen, /\{!opened && \(/);
  assert.match(screen, /<View style=\{styles\.slot\}>\s*<Animated\.View style=\{\[styles\.form, \{ opacity: formIn,/);
  assert.match(screen, /pointerEvents=\{opened \? 'none' : 'auto'\}/);
  assert.match(screen, /Animated\.timing\(formIn, \{ toValue: 0, duration: 150,[^}]*useNativeDriver: true \}\)/);
  // The prize card is laid over the slot, so its size never moves the chest.
  assert.match(screen, /prizeCard: \{\s*position: 'absolute', left: 0, right: 0, bottom: 0,/);
  const slot = screen.indexOf('<View style={styles.slot}>'), stage = screen.indexOf('<View style={styles.stage}>');
  const card = screen.indexOf('styles.prizeCard, {');
  assert.ok(slot < card && card < stage, 'the prize card lives in the slot, above the chest');
});

test('the redeem call skips the grey toast: the prize card already lists every grant', () => {
  const api = fs.readFileSync(path.join(root, 'src/api/endpoints/coin-codes/redeemCoinCode.ts'), 'utf8');
  assert.match(api, /'\/coin-codes\/redeem', \{ code \},\s*\{ skipBroadcasts: true \} as object\)/);
});
