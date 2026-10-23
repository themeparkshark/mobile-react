'use strict';
/**
 * Sharing and invites polish (October 23, 2026, lane share-invite).
 * - The Friends Invite shares a link that answers today (the App Store page 404s until release).
 * - Share pictures are kid-safe: no typed ride notes, no typed crew names, no date.
 * - Share pictures are story size (9:16) with the TPS link and a QR that scans to it.
 * - A Share Studio sheet fades out before the grown-up gate, so the gate can present.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const src = file => fs.readFileSync(path.join(root, file), 'utf8');

test('the Friends Invite shares the counted TPS link, never the dead App Store page', () => {
  const link = loadTs('src/share/link.ts', {});
  assert.equal(link.INVITE_URL, 'https://themeparkshark.com/app?c=flex_invite');
  // The server only counts campaigns that match ^flex_[a-z_]{1,32}$ (ShareLinkController.php:27).
  assert.match(new URL(link.INVITE_URL).searchParams.get('c'), /^flex_[a-z_]{1,32}$/);
  assert.equal(link.campaignUrl('crew'), 'https://themeparkshark.com/app?c=flex_crew');
  const friends = src('src/screens/FriendsScreen.tsx');
  assert.doesNotMatch(friends, /apps\.apple\.com/, 'no App Store link until 1.7.3 is live');
  assert.match(friends, /import \{ INVITE_URL \} from '\.\.\/share\/link';/);
  // The "Add my shark" story picture with the text and link; text and link alone if the picture fails.
  assert.match(friends, /const message = inviteMessage\(player\?\.screen_name, INVITE_URL\);/);
  assert.match(friends, /await shareExternal\(picture \? \{ url: picture, message \} : \{ message, url: INVITE_URL \}\);/);
  assert.match(friends, /<InviteCard ref=\{inviteRef\} name=\{player\?\.screen_name\} inventory=\{player\?\.inventory\} \/>/);
  const card = src('src/share/InviteCard.tsx');
  assert.match(card, /campaign="invite"/);
});

test('a shared ride card never prints the typed note, and is story size with the link and QR', () => {
  const card = src('src/components/RideTracker/ShareableRideCard.tsx');
  assert.doesNotMatch(card, /ride\.note/, 'the typed note stays in the log');
  assert.match(card, /captureFlex\(storyRef, 'story'\)/, 'captured at story size (1080x1920)');
  assert.match(card, /<StoryShareFrame ref=\{storyRef\} ribbon="MY RIDE!" cta="Track your rides with me!" campaign="ride_log">\s*<CardContent ride=\{ride\} rideCount=\{confirmedCount\} variant="share" \/>/);
  assert.doesNotMatch(card, /react-native-view-shot/);
  const frame = src('src/share/StoryShareFrame.tsx');
  assert.match(frame, /\.\.\.FLEX_SIZE\.story/, '9:16');
  // One share family: the Flex card's background, ribbon and footer (logo, CTA, link, QR).
  assert.match(frame, /<StoryChrome frame=\{FRAME\} \/>/);
  assert.match(frame, /<Ribbon text=\{ribbon\} width=\{256\} \/>/);
  assert.match(frame, /<CardFooter cta=\{cta\} qrArt=\{QR_BY_CAMPAIGN\[campaign\]\}/);
  const flexCard = src('src/share/FlexCard.tsx');
  assert.match(flexCard, /\{SHARE_LINK_DISPLAY\}/);
  assert.match(flexCard, /return <CardFooter cta=\{copy\.cta\} qrArt=\{QR_BY_KIND\[kind\]\}/, 'Flex cards use the same footer');
});

test('Whack and Memory results share a story-size picture with the link and QR, and no ride name', () => {
  const whack = src('src/games/whack/ui/ShareCard.tsx');
  assert.match(whack, /captureFlex\(ref, 'story'\);\s*await openShareSheet\(uri\);/);
  assert.match(whack, /campaign="whack"/);
  assert.doesNotMatch(whack, /\{rideName/, 'the ride name never goes on the picture');
  const { shareText } = loadTs('src/games/whack/ui/ShareCard.tsx', {
    react: { useCallback: f => f, useRef: v => ({ current: v }), useState: v => [v, () => {}] },
    'react/jsx-runtime': { jsx() { return null; }, jsxs() { return null; } },
    'react-native': { StyleSheet: { create: s => s }, Text: 'Text', TouchableOpacity: 'TouchableOpacity', View: 'View' },
    '../../../share/capture': {}, '../../../share/StoryShareFrame': {},
  });
  assert.equal(shareText('Space Mountain', 1200, 2), 'I scored 1,200 in Whack-a-Shark. 2 of 3 stars. Can you beat it?');
  const memory = src('src/games/memory/MemoryExtras.tsx');
  assert.match(memory, /captureFlex\(storyRef, 'story'\);\s*await openShareSheet\(uri\);/);
  assert.match(memory, /campaign="memory"/);
  for (const code of [whack, memory]) assert.doesNotMatch(code, /shareFileExternal|captureRef/, 'one share path: gate, then the share sheet');
});

test('the crew card names sharks by seat, prints no date, and carries the link and QR', () => {
  const card = src('src/screens/LinePlay/group/GroupShareCard.tsx');
  const { crewLabel } = loadTs('src/screens/LinePlay/group/GroupShareCard.tsx', {
    react: { forwardRef: f => f, useCallback: f => f, useEffect() {}, useMemo: f => f(), useState: v => [v, () => {}] },
    'react/jsx-runtime': { jsx() { return null; }, jsxs() { return null; }, Fragment: 'Fragment' },
    'react-native': { StyleSheet: { create: s => s }, Text: 'Text', View: 'View' },
    '../../../components/ShareCardArtwork': 'ShareCardArtwork', '../../../share/formats': { FLEX_SIZE: { story: { width: 360, height: 640 } } },
    '../../../share/link': { SHARE_LINK_DISPLAY: 'themeparkshark.com/app' }, '../../../share/campaignQr': { QR_BY_CAMPAIGN: {} },
    './PlayerBadge': 'PlayerBadge', '../../../ui': { GameIcon: 'GameIcon' },
  });
  assert.equal(crewLabel(0), 'Shark 1');
  assert.equal(crewLabel(3), 'Shark 4');
  assert.doesNotMatch(card, /row\.player\.name|champions\[0\]\.name|recap\.headline/, 'no typed name reaches the picture');
  assert.doesNotMatch(card, /\{dateLabel\}/, 'no date on the picture');
  assert.match(card, /QR_BY_CAMPAIGN\.crew/);
  assert.match(card, /\{SHARE_LINK_DISPLAY\}/);
});

/** Reads the dark modules of a QR PNG written by build-campaign-qr.cjs (10 px modules, 1 module border, RGB). */
function readQrPng(file) {
  const buf = fs.readFileSync(file);
  let offset = 8; const idat = []; let width = 0;
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset); const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') width = data.readUInt32BE(0);
    if (type === 'IDAT') idat.push(data);
    offset += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 3 + 1;
  const n = width / 10 - 2;
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => raw[(r + 1) * 10 * stride + 5 * stride + 1 + ((c + 1) * 10 + 5) * 3] < 128));
}

test('every campaign QR encodes its own counted link', () => {
  const QRCode = require('qrcode-terminal/vendor/QRCode');
  const Level = require('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel');
  const qr = src('src/share/campaignQr.ts');
  const campaigns = [...qr.matchAll(/^ {2}(\w+): require\('\.\.\/\.\.\/assets\/images\/share\/qr\/campaign-(\w+)\.png'\),$/gm)];
  assert.ok(campaigns.length >= 6);
  for (const [, key, fileKey] of campaigns) {
    assert.equal(key, fileKey);
    const expected = new QRCode(-1, Level.M);
    expected.addData(`https://themeparkshark.com/app?c=flex_${key}`);
    expected.make();
    const matrix = readQrPng(path.join(root, `assets/images/share/qr/campaign-${key}.png`));
    assert.equal(matrix.length, expected.getModuleCount(), key);
    for (let r = 0; r < matrix.length; r++) for (let c = 0; c < matrix.length; c++) {
      assert.equal(matrix[r][c], expected.isDark(r, c), `${key} module ${r},${c}`);
    }
  }
});

test('a Share Studio sheet fades out before the grown-up gate, and is a layer while up', () => {
  const host = src('src/share/ShareStudioHost.tsx');
  assert.match(host, /const uri = await captureFlex\(cardRef, format\);[\s\S]{0,400}setStage\('leaving'\);[\s\S]{0,200}const outcome = await openShareSheet\(uri\);/,
    'the picture is made first, then the sheet leaves, then the gate and share sheet');
  assert.match(host, /useModalLayer\(stage !== 'gone', 'show'\)/, 'Root dialogs and the gate wait for the sheet');
  assert.equal((host.match(/visible=\{visible\} onShow=\{onShow\} onDismiss=\{onDismiss\}/g) || []).length, 2, 'sheet and moment both hand off');
  assert.match(host, /finally \{[\s\S]{0,200}finishFlex\(request\.id\);/, 'done or failed, the sheet closes so the retry note can show');
  assert.match(host, /if \(!dimFlash\) flash\.value/, 'the reveal flash respects Dim Flashing Lights');
  assert.doesNotMatch(host, /useState\(\(\) => registerFlexHost/, 'no host registers during render');
});

test('a ride card shared from inside a modal steps out of the modal before the grown-up gate', async () => {
  const card = src('src/components/RideTracker/ShareableRideCard.tsx');
  assert.match(card, /const uri = await captureFlex\(storyRef, 'story'\);[\s\S]{0,200}await beforeShare\?\.\(\);[\s\S]{0,200}await openShareSheet\(uri\);/);
  assert.doesNotMatch(card, /shareFileExternal/, 'one share path for every card (gate, then the iOS share sheet)');
  for (const file of ['src/screens/RideTracker/RideHistoryScreen.tsx', 'src/screens/RideTracker/RideDetailScreen.tsx']) {
    const screen = src(file);
    assert.match(screen, /onDismiss=\{shareHandoff\.onDismiss\}/, `${file}: the modal reports when iOS is done dismissing it`);
    assert.match(screen, /beforeShare=\{shareHandoff\.handoff\}/, `${file}: the card hands off`);
  }
  // The hook: closes the modal, resolves on onDismiss, or after MODAL_HANDOFF_MS at the latest.
  let closed = 0;
  const timers = [];
  const { useModalHandoff, MODAL_HANDOFF_MS } = loadTs('src/share/handoff.ts', { react: { useCallback: f => f, useRef: v => ({ current: v }) } },
    { setTimeout: (fn, ms) => { timers.push({ fn, ms }); return 0; } });
  {
    const { handoff, onDismiss } = useModalHandoff(() => { closed++; });
    let done = false;
    const p = handoff().then(() => { done = true; });
    assert.equal(closed, 1);
    assert.equal(timers[0].ms, MODAL_HANDOFF_MS);
    onDismiss();
    await p;
    assert.ok(done, 'resolves once iOS has dismissed the modal');
    timers[0].fn(); // the guard firing later is harmless
    const q = handoff();
    timers[1].fn(); // Android: no onDismiss, the guard resolves it
    await q;
  }
});

test('a grown-up gate iOS never shows answers "no" and steps aside, so later asks are not stuck', () => {
  const gate = src('src/components/GrownUpGate.tsx');
  assert.match(gate, /export const GATE_SHOW_WATCHDOG_MS = 2500;/);
  assert.match(gate, /onShow=\{\(\) => \{ shownRef\.current = true; \}\}/);
  // Never shown means no (never yes), and never silent: a kid-readable toast, plus a dev warning naming the ask.
  assert.match(gate, /<GateShowWatchdog shown=\{shownRef\} onNeverShown=\{\(\) => \{[\s\S]{0,400}showToast\(GATE_RETRY_TOAST, 'info', 3500\);\s*close\(false\);\s*\}\} \/>/, 'never shown means no, never yes');
  assert.match(gate, /if \(__DEV__\) console\.warn\(`GrownUpGate never showed/);
  assert.match(gate, /export const GATE_RETRY_TOAST = 'That didn’t open\. Try again in a sec\.';/);
  assert.match(gate, /setTimeout\(\(\) => \{ if \(!shown\.current\) onNeverShown\(\); \}, GATE_SHOW_WATCHDOG_MS\)/);
});

/* ------------------------------------------------------------------ round 2 */

test('every brag inside a modal has a Share that closes the modal first, then opens Share Studio from Root', () => {
  const cases = [
    ['src/components/CoinLevelingModal.tsx', /kind="coin_level"[\s\S]{0,200}handoff=\{shareHandoff\.handoff\}/],
    ['src/components/coin/Crowning.tsx', /kind="crowned" payload=\{\{ coinUrl, ownedRef: 10 \}\}[^>]*handoff=\{shareHandoff\}/],
    ['src/components/home/HomeHuntResultsModal.tsx', /kind="standings"[^>]*handoff=\{shareHandoff\.handoff\}/],
    ['src/screens/SharkPassScreen.tsx', /kind="find" surface="sharkpass"[^>]*handoff=\{landedShare\.handoff\}/],
    ['src/components/money/MonthlyGiftCard.tsx', /kind="find" surface="vip_gift"[^>]*handoff=\{landedShare\.handoff\}/],
    ['src/screens/StoreScreen/SetCompleteReveal.tsx', /kind="set_complete" surface="shop_set"[^>]*handoff=\{shareHandoff\}/],
    ['src/screens/pins/BoxReveal.tsx', /kind="find" surface=\{golden \? 'golden_box' : 'pin_box'\}[^>]*handoff=\{shareHandoff\}/],
    ['src/screens/SetCollection/DexItemCard.tsx', /shareFlexAfterHandoff\(shareHandoff\.handoff, 'ride_photo'/],
  ];
  for (const [file, re] of cases) {
    const code = src(file);
    assert.match(code, re, file);
    assert.doesNotMatch(code, /SHARE_IN_MODALS|<ShareStudioHost portal/, `${file}: no hidden flag, no nested host`);
  }
  // The coin level-up line asks the server for "Only N% of players" (coin levels have server data).
  assert.match(src('src/components/CoinLevelingModal.tsx'), /ownedRef: nextLevel/);
  // A chain of rewards: Share only on the last one, so it never skips a reward still waiting to show.
  assert.match(src('src/screens/SharkPassScreen.tsx'), /isWearable\(landed\.reward\) && !landed\.emblem && !landed\.next \?/);
  const box = src('src/screens/pins/BoxReveal.tsx');
  assert.match(box, /const brag = \(p: RevealPull \| undefined\) => !!p && !isCatch && !p\.rare && \(p\.is_chaser \|\| \(golden && !p\.duplicate\)\);/, 'never a park pin (it says where the kid is)');
  assert.match(box, /phase === 'show' && pulls\.length === 1 && brag\(pull\)/);
});

test('shareFlexAfterHandoff closes the modal, waits for iOS, then queues the Share Studio sheet', async () => {
  const queued = [];
  const timers = [];
  const handoffMod = loadTs('src/share/handoff.ts', {
    react: { useCallback: f => f, useRef: v => ({ current: v }) },
    './store': { shareFlex: (kind, payload, options) => queued.push({ kind, payload, options }) },
  }, { setTimeout: (fn, ms) => { timers.push(ms); fn(); return 0; } });
  let closed = false;
  await handoffMod.shareFlexAfterHandoff(async () => { closed = true; }, 'coin_level', { coinUrl: 'x', level: 6 }, { surface: 'coin_sheet' });
  assert.ok(closed);
  assert.deepEqual(timers, [handoffMod.MODAL_SETTLE_MS]);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].kind, 'coin_level');
  const button = src('src/share/FlexShareButton.tsx');
  assert.match(button, /if \(!handoff\) \{ shareFlex\(kind, payload, \{ surface \}\); return; \}/);
  assert.match(button, /if \(leaving\.current\) return;/, 'a second tap while leaving does nothing');
});

test('the Flex moment has release callers: park day (held in the park), streak and level up, once each', async () => {
  const store = new Map();
  const reveals = [];
  const once = loadTs('src/share/revealOnce.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async k => store.get(k) ?? null, setItem: async (k, v) => { store.set(k, v); } } },
    './copy': loadTs('src/share/copy.ts', {}),
    './store': { flexReveal: (kind, payload) => reveals.push(kind) },
  });
  assert.equal(await once.flexRevealOnce('level_up', '23:10', { level: 10 }, { surface: 'profile_level' }), true);
  assert.equal(await once.flexRevealOnce('level_up', '23:10', { level: 10 }, { surface: 'profile_level' }), false, 'once per level');
  assert.equal(await once.flexRevealOnce('level_up', '23:11', { level: 11 }, { surface: 'profile_level' }), false, 'only every 5th level');
  once.__resetRevealOnce();
  assert.equal(await once.flexRevealOnce('level_up', '23:10', { level: 10 }, { surface: 'profile_level' }), false, 'remembered after a relaunch');
  assert.equal(await once.flexRevealOnce('streak', '23:7:2026-10-23', { days: 7 }, { surface: 'profile_streak' }), true);
  assert.equal(await once.flexRevealOnce('park_day', '8:2026-10-23', { coinsCaught: 4, coinUrls: [] }, { surface: 'park_day' }), false, '5+ coins only');
  assert.equal(await once.flexRevealOnce('park_day', '8:2026-10-23', { coinsCaught: 6, coinUrls: [] }, { surface: 'park_day' }), true);
  assert.deepEqual(reveals, ['level_up', 'streak', 'park_day']);
  // Park days stay held while the player is in the park (store.ts HOLD_IN_PARK).
  assert.match(src('src/share/store.ts'), /HOLD_IN_PARK: ReadonlySet<string> = new Set\(\['park_day', 'ride_coin'\]\)/);
  assert.match(src('src/screens/ParkDayRecapCard.tsx'), /flexRevealOnce\('park_day', `\$\{parkId\}:\$\{result\.park_day\}`, parkDayFlexPayload\(result\)/);
  assert.match(src('src/screens/ProfileScreen.tsx'), /flexRevealOnce\('streak'/);
  assert.match(src('src/components/Experience.tsx'), /flexRevealOnce\('level_up', `\$\{player\.id\}:\$\{level\}`, \{ level \}/);
});

test('the shared ride card has no date and waits until the player leaves the park', () => {
  const card = src('src/components/RideTracker/ShareableRideCard.tsx');
  const shareVariant = card.slice(card.indexOf('{shared ? ('), card.indexOf(') : (', card.indexOf('{shared ? (')));
  assert.doesNotMatch(shareVariant, /dateStr|wait_time_minutes/, 'no ride date or wait on the shared copy');
  assert.match(card, /\{!shared && \(\s*<View style=\{cardStyles\.topBar\}>/, 'no second brand line on the shared copy');
  assert.match(card, /\{!shared && \(\s*<View style=\{cardStyles\.watermark\}>/, 'one link only (the frame footer)');
  assert.match(card, /export const RIDE_SHARE_HELD_LABEL = 'Share it after you leave the park';/);
  assert.match(card, /if \(busy\.current \|\| loadingCount \|\| inPark\) return;/);
  assert.match(card, /\{!inPark && \(\s*<StoryShareFrame/);
  const { riddenLine } = loadTs('src/components/RideTracker/ShareableRideCard.tsx', {
    react: { default: { memo: f => f, useRef: v => ({ current: v }), useCallback: f => f, useEffect() {}, useState: v => [v, () => {}], useContext: () => ({}) }, memo: f => f },
    'react/jsx-runtime': { jsx() { return null; }, jsxs() { return null; }, Fragment: 'Fragment' },
    'react-native': { StyleSheet: { create: s => s }, View: 'View', Text: 'Text', Pressable: 'Pressable' },
    'expo-image': { Image: 'Image' }, 'expo-linear-gradient': { LinearGradient: 'LG' }, 'expo-sharing': {}, 'expo-haptics': {},
    '../../design-system': { colors: {}, shadows: {}, borderRadius: {} }, '../../api/endpoints/player-rides': {},
    '../../hooks/useReducedGameMotion': { default: () => false }, '../../constants/parkWaitTimes': { PARK_DISPLAY_ORDER: [] },
    './SharkReactionIcon': { default: 'Icon', reactionLabel: () => null }, '../../ui': { gameAlert() {} }, '../../share/capture': {},
    '../../share/StoryShareFrame': {}, '../../context/LocationProvider': { LocationStatusContext: {} },
  });
  assert.equal(riddenLine(1), 'Ridden 1 time');
  assert.equal(riddenLine(12), 'Ridden 12 times');
});

test('Invite and Closet look share story pictures with their own QR; no unused QR ships', () => {
  const invite = loadTs('src/share/InviteCard.tsx', {
    react: { forwardRef: f => f }, 'react/jsx-runtime': { jsx() { return null; }, jsxs() { return null; }, Fragment: 'Fragment' },
    'react-native': { StyleSheet: { create: s => s }, Text: 'Text', View: 'View' },
    './FlexShark': {}, './Outlined': {}, './StoryShareFrame': {},
  });
  assert.equal(invite.inviteMessage(' Finn ', 'https://themeparkshark.com/app?c=flex_invite'),
    'Play Theme Park Shark with me! Add my shark: Finn\nhttps://themeparkshark.com/app?c=flex_invite');
  assert.equal(invite.inviteMessage('', 'u'), 'Play Theme Park Shark with me!\nu');
  const look = src('src/share/LookShareButton.tsx');
  assert.match(look, /campaign="look"/);
  assert.match(look, /await captureFlex\(ref, 'story'\);\s*await openShareSheet\(uri\);/);
  assert.match(src('src/screens/InventoryScreen.tsx'), /<LookShareButton inventory=\{worn\}/);
  const qr = src('src/share/campaignQr.ts');
  for (const used of ['invite', 'crew', 'ride_log', 'whack', 'memory', 'look']) assert.match(qr, new RegExp(`  ${used}: require`));
  assert.doesNotMatch(qr, /game:/);
  assert.ok(!fs.existsSync(path.join(root, 'assets/images/share/qr/campaign-game.png')));
});

test('a tall card shrinks to fit between the ribbon and the footer, never grows', () => {
  const { fitScale } = loadTs('src/share/StoryShareFrame.tsx', {
    react: { forwardRef: f => f, useState: v => [v, () => {}] }, 'react/jsx-runtime': { jsx() { return null; }, jsxs() { return null; } },
    'react-native': { StyleSheet: { create: s => s }, View: 'View' }, './campaignQr': { QR_BY_CAMPAIGN: {} },
    './FlexCard': { STORY_SAFE: { top: 84, bottom: 114 } }, './formats': { FLEX_SIZE: { story: { width: 360, height: 640 } } }, './frames': { FRAMES: { common: { bg: ['#1aa3f0', '#0768b9'] } } },
  });
  assert.equal(fitScale(300, 350), 300 / 350);
  assert.equal(fitScale(300, 200), 1);
  assert.equal(fitScale(0, 200), 1, 'before layout: no scale');
  assert.match(src('src/share/StoryShareFrame.tsx'), /transform: \[\{ scale \}\]/);
});
