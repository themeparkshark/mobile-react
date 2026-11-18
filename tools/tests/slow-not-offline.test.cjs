const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');

test('T172: the words match what happened: slow says the game is slow, only a real outage says internet', () => {
  const C = loadTs('src/services/connectivity.ts');
  const copy = loadTs('src/services/connectionCopy.ts', { './connectivity': C });
  assert.equal(copy.tryAgainLine(), 'The game is slow right now. Try again.');
  C.reportTimeout(); C.reportTimeout(); C.reportTimeout();
  assert.equal(C.connectionState(), 'slow');
  assert.equal(copy.tryAgainLine({ code: 'ECONNABORTED' }), 'The game is slow right now. Try again.', 'a timeout is never the player’s internet');
  C.reportUnreachable();
  assert.equal(copy.tryAgainLine({ code: 'ERR_NETWORK' }), 'Check your internet and try again.');
  assert.equal(copy.tryAgainLine({ response: { status: 503 } }), 'The game is slow right now. Try again.', 'a server answer is not an internet problem');
  assert.equal(copy.tryAgainWith('tap Reconnect'), 'Check your internet and tap Reconnect.');
  C.reportReachable();
  assert.equal(copy.tryAgainWith('tap Reconnect'), 'The game is slow right now. Tap Reconnect.');
});

test('T172: the chest, rewards, shelf, catch, Welcome and team pick never blame the internet while the server is slow', () => {
  assert.match(read('src/components/DailyGiftModal.tsx'), /`Your chest is still waiting\. \$\{tryAgainLine\(\)\}`/);
  assert.match(read('src/components/retention/useRetention.tsx'), /`Your reward is safe\. \$\{tryAgainLine\(\)\}`/);
  assert.match(read('src/screens/CoinShelfScreen.tsx'), /Couldn’t refresh your coins\. \$\{tryAgainLine\(\)\}/);
  assert.match(read('src/screens/GymBattle/TeamSelectionScreen.tsx'), /Couldn’t join just now\. \$\{tryAgainLine\(\)\}/);
  assert.match(read('src/components/RedeemRedeemableModal.tsx'), /We could not tell if this game started\. \$\{tryAgainWith\('tap Reconnect'\)\}/);
  // Loading: the CMS "check your internet" line only while really offline.
  const loading = read('src/components/Loading.tsx');
  assert.match(loading, /const slowLine = isOffline\(\) && crumb \? crumb : SLOW_LOADING_LINE;/);
  assert.match(read('src/ui/SharkLoader.tsx'), /message: props\.message \?\? tryAgainLine\(\),/);
  // No core-loop surface hard-codes the old line.
  for (const file of ['src/components/DailyGiftModal.tsx', 'src/components/retention/useRetention.tsx', 'src/components/TaskCoinModal.tsx',
    'src/components/RedeemKeyModal.tsx', 'src/components/RedeemCurrentRedeemableModel.tsx', 'src/screens/ExploreScreen/TripGoalCard.tsx',
    'src/screens/ExploreScreen/adventureTicketPresentation.ts', 'src/screens/StoreScreen/SuppliesShop.tsx', 'src/hooks/usePurchaseItem.tsx']) {
    assert.doesNotMatch(read(file), /'[^'\n]*Check your (internet|connection) and try again\.[^'\n]*'/, file);
  }
});

test('T172 + T176: the banner has a slow state, and the map chip is a labelled picture whose tap shows the retry', () => {
  const src = read('src/components/OfflineBanner.tsx');
  assert.match(src, /slow: \{ title: 'GAME IS SLOW', body: 'Your game is safe\. Try again', chip: 'Slow'/);
  assert.match(src, /offline: \{ title: 'RECONNECTING', body: 'Some things may not load', chip: 'Offline'/);
  assert.match(src, /const stateIcon = back \? BACK_ONLINE_ICON : slow \? SHARK_LOADER_ART : OFFLINE_ICON;/, 'slow shows his shark, not the no-signal art');
  assert.match(src, /accessibilityLabel=\{copy\.label\}/, 'the chip is in the accessibility tree with what it means');
  assert.match(src, /<Text style=\{styles\.chipTagText\}[^>]*>\{copy\.chip\}<\/Text>/, 'a word tag under the picture');
  assert.match(src, /setExpanded\(true\);\n\s*expandTimer\.current = setTimeout\(\(\) => \{ expandTimer\.current = null; setExpanded\(false\); \}, CHIP_EXPAND_MS\);/, 'a tap opens the full card with the Retry button');
  assert.match(src, /\{cardShown && \(\n\s*<View pointerEvents=\"box-none\" style=\{\[styles\.host, \{ top \}\]\}>/, 'the tapped card is its own layer under the header; the chip stays put');
  assert.match(src, /state === 'offline' \? OFFLINE_SHOW_DELAY_MS : SLOW_SHOW_DELAY_MS/, 'slow shows only once it lasts');
  assert.match(src, /onConnectionState\(apply\)/);
  assert.doesNotMatch(src, /—/);
});
