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

test('errors read in plain words, the server message first', () => {
  assert.equal(model.redeemErrorMessage({ response: { status: 422, data: { message: 'You already used this coin code.' } } }),
    'You already used this coin code.');
  assert.equal(model.redeemErrorMessage(new Error('Network Error')), model.REDEEM_COPY.offline);
  assert.equal(model.redeemErrorMessage({ response: { status: 500, data: {} } }), model.REDEEM_COPY.wrong);
});

test('the screen never draws a bare number outside Text (the old 0-coin crash)', () => {
  const screen = fs.readFileSync(path.join(root, 'src/screens/RedeemCoinCodeScreen.tsx'), 'utf8');
  assert.doesNotMatch(screen, /\.coins &&/);
  assert.doesNotMatch(screen, /Alert\.alert/);
});
