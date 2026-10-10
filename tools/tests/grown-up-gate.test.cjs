const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.join(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function walk(dir, out = []) {
  for (const name of fs.readdirSync(path.join(root, dir))) {
    const rel = path.join(dir, name);
    if (fs.statSync(path.join(root, rel)).isDirectory()) walk(rel, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(rel.split(path.sep).join('/'));
  }
  return out;
}
const SRC = walk('src').map(file => ({ file, code: read(file) }));
/** Code without comments, so a doc line that names a call never trips a scan. */
const strip = code => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const where = re => SRC.filter(({ code }) => re.test(strip(code))).map(({ file }) => file);

function gateModule(store = {}, navigated = [], dev = true) {
  return loadTs('src/components/GrownUpGate.tsx', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async k => store[k] ?? null, setItem: async (k, v) => { store[k] = v; } } },
    react: { useEffect() {}, useState: v => [v, () => {}] },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'Fragment' },
    '../ui/iconNames': {}, './RealMoneyMark': { default: 'RealMoneyMark' },
    'react-native': { Modal: 'Modal', Pressable: 'Pressable', StyleSheet: { create: s => s }, Text: 'Text', View: 'View' },
    '../RootNavigation': { navigate: (...args) => navigated.push(args) },
    '../ui': { BRAND: { goldLip: '#d99a00', navy: '#05346e' }, FONT: {}, GameIcon: 'GameIcon' },
    '../ui/modalLayers': { useModalLayer: () => true },
  }, { __DEV__: dev });
}

test('the grown-up question: a sum written in words, 2-digit times 1-digit, hard to guess, typed in', () => {
  const gate = gateModule();
  const seen = new Set();
  for (let seed = 0; seed < 1000; seed++) {
    const { a, b, answer } = gate.grownUpQuestion(seed);
    assert.ok(a >= 23 && a <= 89 && a % 10 >= 3 && b >= 6 && b <= 9, `${a} x ${b}`);
    assert.equal(answer, a * b);
    const { words } = gate.grownUpQuestion(seed);
    assert.doesNotMatch(words, /\d/, 'written in words: no digits to copy');
    assert.match(words, /^[a-z]+(-[a-z]+)? times [a-z]+$/);
    assert.ok(String(answer).length <= 3, 'fits the 3-digit answer box');
    seen.add(`${a}x${b}`);
  }
  assert.ok(seen.size >= 150, 'plenty of different sums');
  gate.resetGrownUpGateForTests();
  assert.equal(gate.judgeGate(String(gate.grownUpQuestion(42).answer), 42, 0), true);
  assert.equal(gate.judgeGate('', 42, 0), false);
  assert.equal(gate.judgeGate('1', -1, 0), false, 'a resting gate never opens');
  const ui = read('src/components/GrownUpGate.tsx');
  assert.match(ui, /const KEYS = \['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'\] as const;/, 'typed on a pad, no choices');
  assert.match(ui, /'Ask a grown-up'/);
  assert.equal(gate.grownUpQuestion(0).words, 'twenty-three times six');
  assert.equal(gate.numberWords(47), 'forty-seven');
  assert.equal(gate.numberWords(80), 'eighty');
  assert.doesNotMatch(ui, /violet|purple|#7b|#8e44|#6a/i, 'blue, white and gold only');
  assert.match(ui, /const offer = ok \? gateDetails\(req\.reason\) : null;/, 'offer details only after a right answer');
  assert.match(ui, /A grown-up can try again in \$\{lastRestText\}\. No worries!/, 'calm, says what happened and when');
});

test('a wrong answer rests the gate for 30 s, and the rest survives a relaunch', async () => {
  const store = {};
  const gate = gateModule(store);
  assert.equal(gate.judgeGate('0', 5, 1000), false);
  await Promise.resolve();
  assert.equal(Number(store['grown-up-gate:rest-until']), 1000 + gate.GATE_REST_MS);
  const relaunched = gateModule(store);
  // No host mounted: the gate answers no, so a door never opens ungated.
  assert.equal(await relaunched.askGrownUp(null, 5, 2000), false);
});

test('pitch first: anyone sees VIP, and the paywall Buy is the gated real-money step', async () => {
  const navigated = [];
  const gate = gateModule({}, navigated, false);
  assert.equal(await gate.openMembership(), true, 'the VIP page (perks, plans, prices) opens for everyone');
  assert.deepEqual(navigated, [['Membership']]);
  assert.match(read('src/context/AuthProvider.tsx'), /setGateVipMember\(player\?\.is_subscribed === true\)/);
  assert.doesNotMatch(read('src/components/profile/StatusBadges.tsx'), /member: own/, 'never decided by whose badge was tapped');
  const paywall = read('src/screens/MembershipScreen.tsx');
  // Buy: a grown-up answers (plan and price restated) before StoreKit is ever called.
  // Funnel tracking may sit between the gate and the buy; the gate must still come first.
  assert.match(paywall, /if \(!\(await grownUpForNextStep\('vip', Date\.now\(\), vipGateReason\(plan\)\)\)\) return;\s*Haptics[\s\S]{0,220}const outcome = await buyVip\(plan\);/);
  assert.equal((strip(paywall).match(/buyVip\(/g) || []).length, 1, 'one StoreKit call, after the gate');
  assert.match(paywall, /if \(!plan \|\| busy \|\| buying\.current\) return;\s*buying\.current = true;/);
});

test('no door grants a pass: every real-money Buy asks a grown-up fresh', async () => {
  const src = read('src/components/GrownUpGate.tsx');
  assert.equal((strip(src).match(/pass = \{/g) || []).length, 0, 'nothing pre-approves a Buy');
  assert.match(src, /const held = pass;\s*pass = null;[^\n]*\n\s*if \(held && held\.flow === flow && now < held\.until\) return true;\s*return askGrownUp\(reason\);/);
  assert.match(src, /if \(!ok\) \{\s*pass = null;/, 'a wrong answer cancels any pass');
  assert.deepEqual(where(/grownUpForNextStep\(/).filter(f => f !== 'src/components/GrownUpGate.tsx'), ['src/screens/MembershipScreen.tsx']);
  assert.deepEqual(where(/ensureGrownUp/), [], 'no blanket pass helper');
  const external = strip(read('src/services/external.ts'));
  assert.equal((external.match(/await askGrownUp\((exitReason\(url\)|SHARE)\)/g) || []).length, 3, 'each exit asks');
  const gate = gateModule();
  assert.equal(await gate.grownUpForNextStep('vip'), false, 'no host: the Buy is refused');
});

test('server-named screens (push taps, inbox rows) never open the paywall ungated', () => {
  const navigated = [];
  const gate = gateModule({}, navigated);
  gate.openServerRoute('Membership', {});
  gate.openServerRoute('Park', { park: 3 });
  assert.deepEqual(navigated, [['Membership'], ['Park', { park: 3 }]], 'Membership goes through openMembership (the pitch; its Buy is gated)');
  assert.match(read('src/services/push.ts'), /if \(route\?\.screen\) openServerRoute\(route\.screen, route\.params \?\? \{\}\);/);
  assert.match(read('src/screens/NotificationsScreen.tsx'), /openServerRoute\(target\.screen, target\.params\)/);
  assert.deepEqual(where(/navigate\(\s*(route|target)\.screen/), [], 'no raw server route navigation');
});

test('every way into the VIP paywall goes through openMembership, by any API or a name held elsewhere', () => {
  // The screen name itself appears only where the paywall is registered and opened. A constant, a template,
  // a reset, a push, a deep link: all need the literal, so all would land here.
  const literal = /['"`]Membership['"`]/;
  assert.deepEqual(where(literal).sort(), ['src/Root.tsx', 'src/components/GrownUpGate.tsx']);
  const root = strip(read('src/Root.tsx')).match(/[^\n]*['"`]Membership['"`][^\n]*/g).map(l => l.trim());
  assert.deepEqual(root, ['name="Membership"', "const SCREENS_WITHOUT_JOYSTICK = new Set(['Store', 'Membership', 'Inventory', 'Settings']);"]);
  const gateLines = strip(read('src/components/GrownUpGate.tsx')).match(/[^\n]*['"`]Membership['"`][^\n]*/g).map(l => l.trim());
  assert.deepEqual(gateLines, ["RootNavigation.navigate('Membership');", "if (screen === 'Membership') { void openMembership(); return; }"]);
  assert.deepEqual(where(/MembershipScreen/).sort(), ['src/Root.tsx', 'src/screens/MembershipScreen.tsx']);
  const entries = {
    'src/screens/StoreScreen/Item.tsx': /void openMembership\(\)/,
    'src/components/profile/StatusBadges.tsx': /void openMembership\(\)/,
    'src/components/PostWinRewardsModal.tsx': /closeTo\(\(\) => \{ void openMembership\(\); \}\)/,
    'src/context/DailyGiftProvider.tsx': /preview === 'vip'\) void openMembership\(\{ devPreview: true \}\)/,
    'src/screens/SocialScreen.tsx': /BecomeAMember\)\) void openMembership\(\)/,
    'src/screens/ProfileScreen.tsx': /is_secret_store && !player\?\.is_subscribed\) \{[\s\S]{0,260}void openMembership\(\)/,
  };
  for (const [file, re] of Object.entries(entries)) assert.match(read(file), re, file);
  assert.match(read('src/dev/ws7Preview.ts'), /if \(!__DEV__\) return '';/);
});

test('real money is bought in exactly two gated places', () => {
  assert.deepEqual(where(/\bbuyVip\(/).filter(f => f !== 'src/services/purchases.ts'), ['src/screens/MembershipScreen.tsx']);
  assert.deepEqual(where(/\bbuyShopProduct\(/).filter(f => f !== 'src/services/purchases.ts'), ['src/services/money/supplies.ts']);
  const supplies = read('src/services/money/supplies.ts');
  // One gated helper for every pack, app-wide: a second tap anywhere is ignored while one runs,
  // and a grown-up answers (price and contents restated) before StoreKit is called.
  // Funnel tracking may sit around the gate; the gate must come before the one StoreKit call.
  const code = strip(supplies);
  assert.match(code, /if \(buying\) return \{ status: 'busy' \};[\s\S]{0,320}buying = true;\s*try \{[\s\S]{0,200}if \(!\(await askGrownUp\(gateReasonFor\(product, state\.prices\[product\.product_id\]\)\)\)\) \{[\s\S]{0,120}return \{ status: 'declined' \};/);
  assert.ok(code.indexOf('await askGrownUp(') < code.indexOf('await purchaseNow('), 'the gate comes before the buy');
  assert.ok(code.indexOf('async function purchaseNow') > code.indexOf('await askGrownUp('), 'StoreKit is reached only from purchaseNow, after the gate');
  assert.equal((strip(supplies).match(/buyShopProduct\(/g) || []).length, 1, 'StoreKit is reached from one line, after the gate');
});

test('nothing leaves the app without a grown-up: one helper, an exact allowlist', () => {
  // Any mention of an exit API outside services/external, however it is reached: a direct call,
  // a destructure ({ openURL } = Linking), a bracket lookup (Linking['openURL']) or an alias.
  const exitApi = /\b(openURL|openBrowserAsync|shareAsync|openAuthSessionAsync|openSettings|openBrowser)\b|\bShare\s*\.\s*share\b|\bShare\s*\[|\{[^}]*\bshare\b[^}]*\}\s*=\s*Share\b|\bLinking\s*\[|=\s*(Share|Linking|WebBrowser|Sharing)\s*[;,)]|from 'expo-web-browser'/;
  assert.deepEqual(where(exitApi).filter(f => f !== 'src/services/external.ts'), [], 'use openExternal / shareExternal / shareFileExternal');
  const external = read('src/services/external.ts');
  assert.doesNotMatch(external, /export \{ Share \}/, 'no re-export of the raw share API');
  for (const fn of ['openExternal', 'shareExternal', 'shareFileExternal']) {
    assert.match(external, new RegExp(`export async function ${fn}\\([^)]*\\)[^{]*\\{\\s*if \\((!url \\|\\| )?!\\(await askGrownUp\\((exitReason\\(url\\)|SHARE)\\)\\)\\)`), `${fn} asks a grown-up first`);
  }
  // Mail goes out only through the two support builders, and only into openExternal.
  assert.deepEqual(where(/['"`]mailto:/).sort(), ['src/screens/Settings/accountDeletion.ts', 'src/screens/threads/SocialHelp.tsx', 'src/services/accountRecovery/model.ts']);
  assert.match(read('src/screens/threads/SocialHelp.tsx'), /void openExternal\(`mailto:/);
  assert.match(read('src/screens/SettingsScreen.tsx'), /const url = supportMailto\([\s\S]{0,400}if \(await openExternal\(url, 'system'\)\) return;/);
  assert.match(read('src/components/FindOriginalAccount.tsx'), /const url = recoverySupportMailto\([\s\S]{0,400}if \(await openExternal\(url, 'system'\)\) return;/);
  // The ungated allowlist, by exact call: Terms and Privacy (Apple allows legal links) and iOS Settings.
  const calls = re => SRC.filter(({ file }) => file !== 'src/services/external.ts')
    .flatMap(({ file, code }) => (strip(code).match(re) || []).map(c => `${file}: ${c}`)).sort();
  assert.deepEqual(calls(/openLegal\([^)]*\)/g), [
    'src/screens/MembershipScreen.tsx: openLegal(urls?.privacy_policy)',
    'src/screens/MembershipScreen.tsx: openLegal(urls?.terms)',
    'src/screens/SettingsScreen.tsx: openLegal(urls.privacy_policy)',
    'src/screens/SettingsScreen.tsx: openLegal(urls.terms)',
  ]);
  assert.deepEqual(calls(/openAppSettings\([^)]*\)/g), [
    'src/context/LocationProvider.tsx: openAppSettings()',
    'src/screens/LinePlay/LinePlayScreen.tsx: openAppSettings()',
    'src/screens/SettingsScreen.tsx: openAppSettings()',
  ]);
  assert.match(external, /export function openLegal\(url: string \| null \| undefined\): void \{\s*if \(url\) void WebBrowser\.openBrowserAsync\(url\)/);
  // In-app YouTube is not an exit: the player blocks every link out in place.
  assert.match(read('src/components/watch/watchFeed.ts'), /export const PLAYER_ORIGIN_WHITELIST = \['\*'\];/);
  assert.match(read('src/screens/SocialScreen.tsx'), /runAfterShortcuts\(\(\) => \{ void openExternal\(urls\.shop\); \}\)/, 'merch');
});

test('every WebView keeps its navigation in place: whitelist "*" plus a guard, never a narrow whitelist', () => {
  // A narrow originWhitelist makes react-native-webview hand the URL to Linking.openURL (Safari, ungated).
  const web = loadTs('src/components/minigameWeb.ts');
  assert.deepEqual([...web.MINIGAME_ORIGIN_WHITELIST], ['*']);
  assert.equal(web.allowMinigameNavigation({ url: 'file:///data/sharky.html' }), true);
  assert.equal(web.allowMinigameNavigation({ url: 'about:blank' }), true);
  assert.equal(web.allowMinigameNavigation({ url: 'https://example.com/' }), false);
  assert.equal(web.allowMinigameNavigation({ url: 'itms-apps://apps.apple.com' }), false);
  assert.equal(web.allowMinigameNavigation({ url: 'mailto:a@b.c' }), false);
  const guards = {
    'src/components/SharkMiniGame.tsx': ['MINIGAME_ORIGIN_WHITELIST', 'allowMinigameNavigation'],
    'src/screens/BananaBasketScreen.tsx': ['MINIGAME_ORIGIN_WHITELIST', 'allowMinigameNavigation'],
    'src/components/watch/YouTubePlayerModal.tsx': ['PLAYER_ORIGIN_WHITELIST', 'shouldStart'],
  };
  const views = SRC.filter(({ code }) => /<WebView\s/.test(strip(code))).map(({ file }) => file).sort();
  assert.deepEqual(views, Object.keys(guards).sort(), 'a new WebView needs the same guard');
  for (const [file, [list, guard]] of Object.entries(guards)) {
    const tags = strip(read(file)).match(/<WebView\s[\s\S]*?\/>/g);
    assert.ok(tags.length >= 1, file);
    for (const tag of tags) {
      assert.match(tag, new RegExp(`originWhitelist=\\{${list}\\}`), `${file}: whitelist`);
      assert.match(tag, new RegExp(`onShouldStartLoadWithRequest=\\{${guard}\\}`), `${file}: guard`);
      assert.match(tag, /setSupportMultipleWindows=\{false\}/, `${file}: no new windows`);
    }
  }
  assert.match(read('src/components/watch/watchFeed.ts'), /export const PLAYER_ORIGIN_WHITELIST = \['\*'\];/);
});

test('the minigames make no network request and play offline: three.js is bundled locally', () => {
  for (const game of ['sharky', 'banana-basket']) {
    const html = read(`src/assets/minigames/${game}/${game}.html`);
    assert.doesNotMatch(html, /unpkg|jsdelivr|cdnjs|fonts\.googleapis|fonts\.gstatic|importmap/, `${game}: nothing fetched`);
    assert.doesNotMatch(html, /\b(src|href)\s*=\s*["']https?:/i, `${game}: no remote src or href`);
    assert.doesNotMatch(html, /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/, `${game}: no network calls`);
    assert.match(html, /three\.js 0\.160\.0 \(MIT[^)]*\), bundled locally: no network\./);
    assert.ok(html.length < 600 * 1024, `${game}.html is ${Math.round(html.length / 1024)} KB`);
    // Its source keeps the import map; the shipped page is built from it.
    assert.match(read(`tools/minigames/${game}.src.html`), /"three": "https:\/\/unpkg\.com\/three@0\.160\.0\/build\/three\.module\.js"/);
  }
  assert.match(read('tools/minigames/build.cjs'), /threeVersion !== '0\.160\.0'/);
});

test('leaving the paywall clears its pass', () => {
  const paywall = read('src/screens/MembershipScreen.tsx');
  assert.match(paywall, /useFocusEffect\(useCallback\(\(\) => \(\) => clearGrownUpPass\(\), \[\]\)\);/);
  assert.match(read('src/components/GrownUpGate.tsx'), /export function clearGrownUpPass\(\): void \{\s*pass = null;\s*\}/);
});

test('the try-on opens the gate only after the sheet has fully hidden', () => {
  const sheet = read('src/screens/StoreScreen/TryOnSheet.tsx');
  assert.match(sheet, /case 'vip': afterHiddenRef\.current = \(\) => \{ void openMembership\(\); \}; closeAnimated\(\); break;/);
  assert.match(sheet, /onCloseRef\.current\(\);\s*const after = afterHiddenRef\.current;\s*afterHiddenRef\.current = null;\s*after\?\.\(\);/);
  assert.match(sheet, /onDismiss=\{finishClose\}/, 'finishClose runs on the modal\'s own dismissal');
});

test('one gate host, mounted once at the root', () => {
  assert.equal((read('src/Root.tsx').match(/<GrownUpGateHost \/>/g) || []).length, 1);
  assert.deepEqual(where(/<GrownUpGateHost/), ['src/Root.tsx']);
});

test('every real-money App Store call sits behind the grown-up gate in the same function (compliance r4)', () => {
  const pass = read('src/screens/SharkPassScreen.tsx');
  assert.match(pass, /askGrownUp\([\s\S]{0,900}buySharkPass\(/, 'Shark Pass and Plus');
  const vip = read('src/screens/MembershipScreen.tsx');
  assert.match(vip, /askGrownUp\([\s\S]{0,600}buyVipGift\(/, 'VIP gift plans');
  assert.match(vip, /grownUpForNextStep\([\s\S]{0,600}buyVip\(/, 'VIP plans');
  const supplies = read('src/services/money/supplies.ts');
  assert.match(supplies, /if \(!state\.prices\[product\.product_id\]\?\.price\) return \{ status: 'declined' \};[\s\S]*askGrownUp\(/, 'no price, no buy');
  // Exact allowlists: a new caller anywhere else fails the build until it is gated and listed here.
  const callers = re => where(re).filter(f => f !== 'src/services/purchases.ts');
  assert.deepEqual(callers(/\bbuySharkPass\(/), ['src/screens/SharkPassScreen.tsx']);
  assert.deepEqual(callers(/\bbuyVipGift\(/), ['src/screens/MembershipScreen.tsx']);
  assert.deepEqual(callers(/\bbuyVip\(/), ['src/screens/MembershipScreen.tsx']);
  assert.deepEqual(callers(/\bbuyShopProduct\(/), ['src/services/money/supplies.ts']);
});

test('repeated misses rest the gate longer: 30 s, 2 min, 10 min', () => {
  const gate = gateModule();
  assert.equal(gate.restMsFor(1), 30000);
  assert.equal(gate.restMsFor(2), 120000);
  assert.equal(gate.restMsFor(3), 600000);
});

test('the miss count survives a force-quit, so the longer rests hold', async () => {
  const store = {};
  const gate = gateModule(store);
  gate.judgeGate('0', 5, 1000);
  gate.judgeGate('0', 5, 2000);
  await Promise.resolve();
  assert.equal(JSON.parse(store['grown-up-gate:misses']).count, 2);
  const relaunched = gateModule(store);
  // The module loads the saved count when the app starts.
  await new Promise(r => setTimeout(r, 5));
  relaunched.judgeGate('0', 5, 4000);
  await Promise.resolve();
  assert.equal(Number(store['grown-up-gate:rest-until']), 4000 + 600000, 'third miss in a row: 10 minutes');
});
