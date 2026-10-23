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
  // The celebration starts from a layout effect on the open state, not before the open chest renders.
  assert.match(screen, /useLayoutEffect\(\(\) => \{ if \(opened\) celebrate\(\); \}, \[opened\]\)/);
  assert.doesNotMatch(screen, /celebrate\(lines\.length\)/);
  // All three chests stay mounted; only opacity changes, so there is no image load gap.
  assert.match(screen, /chest_closed\.png'\)\}\s*style=\{\[styles\.chestLayer, \{ opacity: opened \? 0 : 1 \}\]\}/);
  assert.match(screen, /opacity: opened && gaveCoins \? 1 : 0/);
  assert.match(screen, /opacity: opened && !gaveCoins \? 1 : 0/);
  // The card fades and grows in on the native driver, and resets before the next code.
  assert.match(screen, /<Animated\.View style=\{\[styles\.prizeCard, \{ opacity: cardIn,/);
  assert.match(screen, /outputRange: \[0\.96, 1\]/);
  assert.match(screen, /cardIn\.setValue\(0\);\s*setRewards\(null\)/);
  // A bigger pop: 0.85 up to 1.12, then a spring back to 1, with the reward sound at the start.
  assert.match(screen, /pop\.setValue\(0\.85\)/);
  assert.match(screen, /toValue: 1\.12/);
  assert.match(screen, /const celebrate = useCallback\(\(\) => \{\s*playSound\(require\('..\/..\/assets\/sounds\/reward\.mp3'\)/);
});

test('the redeem call skips the grey toast: the prize card already lists every grant', () => {
  const api = fs.readFileSync(path.join(root, 'src/api/endpoints/coin-codes/redeemCoinCode.ts'), 'utf8');
  assert.match(api, /'\/coin-codes\/redeem', \{ code \},\s*\{ skipBroadcasts: true \} as object\)/);
});
