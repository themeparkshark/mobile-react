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
  // The typed shark name goes only in the private text, never on the public picture.
  assert.match(friends, /<InviteCard ref=\{inviteRef\} inventory=\{player\?\.inventory\} \/>/);
  const card = src('src/share/InviteCard.tsx');
  assert.match(card, /campaign="invite"/);
  const art = card.slice(card.indexOf('export const InviteCard'));
  assert.doesNotMatch(art, /name|screen_name/, 'no name of any kind in the invite picture');
});

test('a shared ride card never prints the typed note, and is story size with the link and QR', () => {
  const card = src('src/components/RideTracker/ShareableRideCard.tsx');
  assert.doesNotMatch(card, /ride\.note/, 'the typed note stays in the log');
  assert.match(card, /captureFlex\(storyRef, 'story'\)/, 'captured at story size (1080x1920)');
  assert.match(card, /<StoryShareFrame ref=\{storyRef\} ribbon="MY RIDE!" cta="Track your rides with me!" campaign="ride_log">\s*<View style=\{cardStyles\.sharedWidth\}><CardContent ride=\{ride\} rideCount=\{confirmedCount\} \/><\/View>/);
  assert.doesNotMatch(card, /react-native-view-shot/);
  const frame = src('src/share/StoryShareFrame.tsx');
  assert.match(frame, /\.\.\.FLEX_SIZE\.story/, '9:16');
  // One share family: the Flex card's background, ribbon and footer (logo, CTA, link, QR).
  assert.match(frame, /<StoryChrome frame=\{FRAME\} \/>/);
  assert.match(frame, /<Ribbon text=\{ribbon\} width=\{STORY_RIBBON_W\} \/>/);
  assert.match(frame, /<CardFooter cta=\{cta\} qrArt=\{QR_BY_CAMPAIGN\[campaign\]\}/);
  const flexCard = src('src/share/FlexCard.tsx');
  assert.match(flexCard, /\{SHARE_LINK_DISPLAY\}/);
  assert.match(flexCard, /return <CardFooter cta=\{copy\.cta\} qrArt=\{flexQr\(kind, payload\)\}/, 'Flex cards use the same footer');
});

test('Whack and Memory results share a story-size picture with the link and QR, and no ride name', () => {
  const whack = src('src/games/whack/ui/ShareCard.tsx');
  assert.match(whack, /captureFlex\(ref, 'story'\);\s*await openShareSheet\(uri, shareMessage\(campaignUrl\('whack'\)\), `Whack-a-Shark \$\{score\}`\);/);
  assert.match(whack, /campaign="whack"/);
  assert.doesNotMatch(whack, /\{rideName/, 'the ride name never goes on the picture');
  const { shareText } = loadTs('src/games/whack/ui/ShareCard.tsx', {
    react: { useCallback: f => f, useRef: v => ({ current: v }), useState: v => [v, () => {}] },
    'react/jsx-runtime': { jsx() { return null; }, jsxs() { return null; } },
    'react-native': { StyleSheet: { create: s => s }, Text: 'Text', TouchableOpacity: 'TouchableOpacity', View: 'View' },
    '../../../share/capture': {}, '../../../share/StoryShareFrame': {}, '../../../share/FlexShareButton': {},
  });
  assert.equal(shareText('Space Mountain', 1200, 2), 'I scored 1,200 in Whack-a-Shark. 2 of 3 stars. Can you beat it?');
  const memory = src('src/games/memory/MemoryExtras.tsx');
  assert.match(memory, /captureFlex\(storyRef, 'story'\);\s*await openShareSheet\(uri, shareMessage\(campaignUrl\('memory'\)\), `Memory Daily \$\{daily\.day\}`\);/);
  assert.match(memory, /campaign="memory"/);
  for (const code of [whack, memory]) assert.doesNotMatch(code, /shareFileExternal|captureRef/, 'one share path: gate, then the share sheet');
  // One share look everywhere: the gold-rimmed pill, and Memory previews the picture that ships.
  assert.match(whack, /<ShareFace size="reveal" dim=\{busy\} \/>/);
  assert.match(memory, /<ShareFace size="reveal" dim=\{busy\} \/>/);
  assert.doesNotMatch(memory, /SHARE NOW/);
  const back = memory.slice(memory.indexOf('export function ShareBack('), memory.indexOf('// Album'));
  assert.match(back, /<View style=\{styles\.storyPreviewInner\} pointerEvents="none">\s*<StoryShareFrame ribbon="MEMORY MATCH!"[^>]*>\s*<ShareStoryCard daily=\{daily\} \/>/);
  assert.doesNotMatch(back, /<ShareCard daily/, 'the sheet never previews a different card');
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
  assert.match(host, /const uri = await captureFlex\(cardRef, format\);[\s\S]{0,400}setStage\('leaving'\);[\s\S]{0,700}const outcome = await openShareSheet\(uri, shareMessage\(link\), flexCopy\(request\.kind, request\.payload\)\.title, copyLink\);/,
    'the picture is made first, then the sheet leaves, then the gate and share sheet');
  assert.match(host, /useModalLayer\(stage !== 'gone', 'show'\)/, 'Root dialogs and the gate wait for the sheet');
  assert.equal((host.match(/visible=\{visible\} onShow=\{onShow\} onDismiss=\{onDismiss\}/g) || []).length, 2, 'sheet and moment both hand off');
  assert.match(host, /finally \{[\s\S]{0,400}else finishFlex\(request\.id\);/, 'done or failed, the sheet closes so the retry note can show');
  // A grown-up "Not now" (the share sheet never opened) brings the Studio back instead of closing it.
  assert.match(host, /if \(!outcome\.opened\) \{ reopen = true; event\('dismissed'\); \}/);
  assert.match(host, /if \(reopen\) setTimeout\(\(\) => setStage\('shown'\), REOPEN_MS\);/);
  assert.match(host, /if \(!dimFlash\) flash\.value/, 'the reveal flash respects Dim Flashing Lights');
  assert.doesNotMatch(host, /useState\(\(\) => registerFlexHost/, 'no host registers during render');
});

test('a ride card shares from inside its sheet: the gate slot shows above it, a no keeps the card open', async () => {
  const card = src('src/components/RideTracker/ShareableRideCard.tsx');
  assert.match(card, /const uri = await captureFlex\(storyRef, 'story'\);[\s\S]{0,700}const \{ ended: outcome \} = await openShareSheet\(uri, shareMessage\(campaignUrl\('ride_log'\)\), `\$\{ride\.ride_name\} Ride Card`\);\s*if \(outcome === 'shared'\) setShared\(true\);/);
  assert.doesNotMatch(card, /shareFileExternal|beforeShare/, 'one share path for every card (gate, then the iOS share sheet)');
  for (const file of ['src/screens/RideTracker/RideHistoryScreen.tsx', 'src/screens/RideTracker/RideDetailScreen.tsx']) {
    const screen = src(file);
    assert.match(screen, /<GrownUpGateSlot \/>\s*<\/Modal>/, `${file}: the gate shows inside the sheet (hotfix design)`);
    assert.doesNotMatch(screen, /useModalHandoff|beforeShare/, `${file}: no step-out before the gate`);
  }
  // The hook still used by the reveals: closes the modal, resolves on onDismiss, or after MODAL_HANDOFF_MS at the latest.
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
  // The hotfix gate (slots, answer after the fade, 5 s watchdog from round 4) is the base; this lane adds the money wait.
  assert.match(gate, /export const GATE_SHOW_WATCHDOG_MS = 5000;/);
  assert.match(gate, /onShow=\{\(\) => \{ shownRef\.current = true; \}\}/);
  // Never shown means no (never yes), and never silent: a kid-readable toast, plus a dev warning naming the ask.
  // The hotfix's round 3 watchdog (a no at once with the retry hint), with this lane's longer real-money wait.
  assert.match(gate, /if \(shownRef\.current \|\| !reqRef\.current \|\| answerRef\.current !== null\) return;[\s\S]{0,300}answerRef\.current = false;\s*finish\(\);\s*\}, gateWatchdogMs\(req\?\.reason\)\);/, 'never shown means no, never yes');
});

test('the gate watchdog re-arms for every ask and gives real-money gates longer', () => {
  const gate = src('src/components/GrownUpGate.tsx');
  // Every ask resets shown and re-runs the watch (the effect depends on req).
  assert.match(gate, /reqRef\.current = r; answerRef\.current = null; shownRef\.current = false;/);
  assert.match(gate, /\}, \[presenting, req, finish\]\);/);
  const body = gate.slice(gate.indexOf('export const GATE_SHOW_WATCHDOG_MS'), gate.indexOf('/** How long the kind'));
  const js = body.replace(/export /g, '').replace('(reason: GateReason | null | undefined): number', '(reason)');
  const ms = new Function(`${js}\nreturn { gateWatchdogMs };`)();
  assert.equal(ms.gateWatchdogMs({ kind: 'share' }), 5000);
  assert.equal(ms.gateWatchdogMs({ kind: 'leave', where: 'x' }), 5000);
  assert.equal(ms.gateWatchdogMs(null), 5000);
  assert.equal(ms.gateWatchdogMs({ kind: 'money', price: '$1', gets: 'x' }), 8000);
  assert.equal(ms.gateWatchdogMs({ kind: 'renews', what: 'x', price: '$1', period: 'month', trial: null }), 8000);
  assert.equal(ms.gateWatchdogMs({ kind: 'vip' }), 8000);
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
  assert.match(src('src/screens/SharkPassScreen.tsx'), /const landedCanShare = !!landed && !landed\.twin && isWearable\(landed\.reward\) && !landed\.emblem && !landed\.next;/);
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
    './store': { flexReveal: (kind, payload, options) => reveals.push([kind, options.onceKey, payload]) },
  });
  const key = once.revealKey('level_up', '23:10');
  assert.equal(await once.flexRevealOnce('level_up', '23:10', { level: 10 }, { surface: 'profile_level' }), true);
  assert.equal(store.has(key), false, 'queued is not shown: nothing is saved yet');
  // A second call before it shows goes to the store with the same key (the store updates the waiting one).
  assert.equal(await once.flexRevealOnce('level_up', '23:10', { level: 10 }, { surface: 'profile_level' }), true);
  assert.deepEqual(reveals.map(r => r[1]), [key, key]);
  // A relaunch before it ever showed keeps the moment.
  once.__resetRevealOnce();
  assert.equal(await once.flexRevealOnce('level_up', '23:10', { level: 10 }, { surface: 'profile_level' }), true, 'not lost by a relaunch');
  once.markRevealShown(key);
  await new Promise(r => setImmediate(r));
  assert.equal(store.get(key), '1', 'saved when it is really on screen');
  assert.equal(await once.flexRevealOnce('level_up', '23:10', { level: 10 }, { surface: 'profile_level' }), false, 'once per level');
  once.__resetRevealOnce();
  assert.equal(await once.flexRevealOnce('level_up', '23:10', { level: 10 }, { surface: 'profile_level' }), false, 'remembered after a relaunch');
  assert.equal(await once.flexRevealOnce('level_up', '23:11', { level: 11 }, { surface: 'profile_level' }), false, 'only every 5th level');
  assert.equal(await once.flexRevealOnce('streak', '23:7:2026-10-23', { days: 7 }, { surface: 'profile_streak' }), true);
  assert.equal(await once.flexRevealOnce('park_day', '8:2026-10-23', { coinsCaught: 4, coinUrls: [] }, { surface: 'park_day' }), false, '5+ coins only');
  assert.equal(await once.flexRevealOnce('park_day', '8:2026-10-23', { coinsCaught: 6, coinUrls: [] }, { surface: 'park_day' }), true);
  assert.deepEqual(reveals.map(r => r[0]), ['level_up', 'level_up', 'level_up', 'streak', 'park_day']);
  // Park days stay held while the player is in the park (store.ts HOLD_IN_PARK).
  assert.match(src('src/share/store.ts'), /HOLD_IN_PARK: ReadonlySet<string> = new Set\(\['park_day', 'ride_coin'\]\)/);
  const recap = src('src/screens/ParkDayRecapCard.tsx');
  assert.match(recap, /flexRevealOnce\('park_day', `\$\{parkId\}:\$\{day\}`, parkDayFlexPayload\(result\), \{ surface: 'park_day',\s*refresh: \(\) => loadRecap\(parkId, day\)/);
  assert.match(src('src/screens/ProfileScreen.tsx'), /flexRevealOnce\('streak'/);
  assert.match(src('src/components/Experience.tsx'), /flexRevealOnce\('level_up', `\$\{player\.id\}:\$\{level\}`, \{ level, xp: Number\(player\.total_experience\) \|\| undefined \}/);
  // The host saves the key only from the moment's onShow.
  const host = src('src/share/ShareStudioHost.tsx');
  assert.match(host, /const onShow = \(\) => \{ onShowWatch\(\); markRevealShown\(request\.options\.onceKey\); \};/);
  assert.match(host, /request\.options\.refresh\(\)/);
});

test('a park day held in the park is one moment that keeps the newest count', () => {
  const store = loadTs('src/share/store.ts', {});
  store.__resetFlexQueue();
  const host = store.registerFlexHost();
  const opts = n => ({ surface: 'park_day', onceKey: 'flex-reveal:park_day:8:2026-10-23', n });
  store.flexReveal('park_day', { coinsCaught: 5, newCoins: 0, coinUrls: [] }, opts(1));
  store.holdFlex(store.currentFlex().id); // the player is in the park
  store.flexReveal('park_day', { coinsCaught: 9, newCoins: 2, coinUrls: [] }, opts(2));
  assert.equal(store.currentFlex(), null, 'nothing shows in the park');
  assert.equal(store.__heldFlex().length, 1, 'one moment, not two');
  assert.equal(store.__heldFlex()[0].payload.coinsCaught, 9, 'the newest count');
  store.releaseHeldFlex(); // left the park
  assert.equal(store.currentFlex().payload.coinsCaught, 9);
  // Without a key (a re-share), a second request still queues behind the first.
  store.shareFlex('park_day', { coinsCaught: 1, newCoins: 0, coinUrls: [] }, { surface: 'park_day' });
  store.unregisterFlexHost(host);
  store.__resetFlexQueue();
});

test('the level-up moment says something real and sits on house blue', () => {
  const { flexCopy } = loadTs('src/share/copy.ts', {});
  assert.equal(flexCopy('level_up', { level: 10, xp: 12400 }).stat, '12,400 XP earned');
  assert.equal(flexCopy('level_up', { level: 10, unlockName: 'Boss fights' }).stat, 'Unlocked: Boss fights');
  assert.notEqual(flexCopy('level_up', { level: 10 }).stat, 'Leveled up!', 'never repeats the ribbon');
  const host = src('src/share/ShareStudioHost.tsx');
  assert.match(host, /momentScrim: \{ backgroundColor: BRAND\.blue \}/);
});

test('the shared ride card has no date and waits until the player leaves the park', () => {
  const card = src('src/components/RideTracker/ShareableRideCard.tsx');
  // One card only (the shared one): no 'app' variant left that could carry a date, a wait or a typed note.
  assert.doesNotMatch(card, /variant[=?:]|'app'|rode_at|dateStr|wait_time_minutes|ride\.note/, 'no date, wait or note anywhere in the card');
  assert.doesNotMatch(card, /THEME PARK SHARK|RIDE MEMORY|themeparkshark\.com/, 'one brand line and link only (the frame footer)');
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
    './SharkReactionIcon': { default: 'Icon', reactionLabel: () => null }, '../../ui': { gameAlert() {}, GameIcon: 'GameIcon' }, '../../share/capture': {},
    '../../share/StoryShareFrame': {}, '../../context/LocationProvider': { LocationStatusContext: {} }, '../../share/FlexShareButton': { ShareFace: 'ShareFace' },
  });
  assert.equal(riddenLine(1), 'Ridden 1 time');
  assert.equal(riddenLine(12), 'Ridden 12 times');
});

test('Invite and Closet look share story pictures with their own QR; no unused QR ships', () => {
  const invite = loadTs('src/share/InviteCard.tsx', {
    react: { forwardRef: f => f }, 'react/jsx-runtime': { jsx() { return null; }, jsxs() { return null; }, Fragment: 'Fragment' },
    'react-native': { StyleSheet: { create: s => s }, Text: 'Text', View: 'View' },
    './FlexShark': {}, './StoryShareFrame': {},
  });
  assert.equal(invite.inviteMessage(' Finn ', 'https://themeparkshark.com/app?c=flex_invite'),
    'Play Theme Park Shark with me! Add my shark: Finn\nhttps://themeparkshark.com/app?c=flex_invite');
  assert.equal(invite.inviteMessage('', 'u'), 'Play Theme Park Shark with me!\nu');
  const look = src('src/share/LookShareButton.tsx');
  assert.match(look, /campaign="look"/);
  assert.match(look, /await captureFlex\(ref, 'story'\);\s*await openShareSheet\(uri, shareMessage\(campaignUrl\('look'\)\)\);/);
  assert.match(src('src/screens/InventoryScreen.tsx'), /<LookShareButton inventory=\{worn\}/);
  const qr = src('src/share/campaignQr.ts');
  for (const used of ['invite', 'crew', 'ride_log', 'whack', 'memory', 'look']) assert.match(qr, new RegExp(`  ${used}: require`));
  assert.doesNotMatch(qr, /game:/);
  assert.ok(!fs.existsSync(path.join(root, 'assets/images/share/qr/campaign-game.png')));
});

test('a tall card shrinks to fit between the ribbon and the footer, never grows', () => {
  const { fitScale } = loadTs('src/share/StoryShareFrame.tsx', {
    react: { forwardRef: f => f, useState: v => [v, () => {}], useContext: () => ({}) }, 'react/jsx-runtime': { jsx() { return null; }, jsxs() { return null; } },
    'react-native': { StyleSheet: { create: s => s }, View: 'View' }, './campaignQr': { QR_BY_CAMPAIGN: {} },
    '../context/AuthProvider': { AuthContext: {} }, './FlexShark': { FlexShark: 'FlexShark' },
    './FlexCard': { STORY_SAFE: { top: 84, bottom: 114 }, STORY_FOOTER_BOTTOM: 34 }, './formats': { FLEX_SIZE: { story: { width: 360, height: 640 } } }, './frames': { FRAMES: { common: { bg: ['#1aa3f0', '#0768b9'] } } },
  });
  assert.equal(fitScale(300, 350), 300 / 350);
  assert.equal(fitScale(300, 200), 1);
  assert.equal(fitScale(0, 200), 1, 'before layout: no scale');
  assert.match(src('src/share/StoryShareFrame.tsx'), /transform: \[\{ scale: peek\.scale \}\]/);
});

/* ------------------------------------------------------------------ round 3 */

test('Set Complete and the box reveal offer Share only after the wear choice, and wait for iOS to let go', () => {
  const set = src('src/screens/StoreScreen/SetCompleteReveal.tsx');
  // Share is the gold-rimmed pill right under WEAR IT ALL, once it is on, and waits while that save runs.
  // Once it is all on: the All on! chip, the yellow Done, then Share right under it (waits while the save runs).
  assert.match(set, /\{all === 'done' && \(\s*<>\s*<Animated\.View[^>]*style=\{styles\.allOnChip\}/);
  assert.match(set, /<GameButton label=\{waiting \? 'Saving\.\.\.' : 'Done'\} icon="check" onPress=\{\(\) => leave\(true\)\}[^\n]*\n[^\n]*\/>\s*\{\/\*[^*]*\*\/\}\s*<FlexShareButton kind="set_complete" surface="shop_set" size="reveal" handoff=\{shareHandoff\} disabled=\{savingNow > 0\}/);
  // The handoff hides the Modal and resolves on its onDismiss (not a bare timer), then leaves.
  assert.match(set, /<Modal visible=\{!hidden\}[\s\S]{0,200}onDismiss=\{modal\.onDismiss\}/);
  assert.match(set, /const modal = useModalHandoff\(useCallback\(\(\) => setHidden\(true\), \[\]\)\);/);
  assert.match(set, /await modal\.handoff\(\);\s*doneRef\.current\(\);/);
  assert.doesNotMatch(set, /MODAL_HANDOFF_MS/);
  const box = src('src/screens/pins/BoxReveal.tsx');
  assert.match(box, /brag\(pull\) && \(!wearable \|\| kept\.has\(pull\.item_id\) \|\| wearFailed\) && !wearing \? pull : null;/, 'a wearable pin waits for Wear it or Not now');
  assert.match(box, /setChoosing\(false\); setKept\(k => new Set\(k\)\.add\(pull\.item_id\)\);/);
  assert.match(box, /<Modal transparent visible=\{!hidden\} animationType="fade" statusBarTranslucent onDismiss=\{modal\.onDismiss\}/);
  assert.match(box, /const shareHandoff = async \(\) => \{ leaving\.current = true; await modal\.handoff\(\); onDone\(pulls\); \};/);
  // One placement: directly under the main button.
  assert.match(box, /icon=\{index < pulls\.length - 1 \? 'gift' : 'check'\} onPress=\{next\} \/>\s*\)\}\s*\{sharePull && !choosing && \(\s*<FlexShareButton kind="find"[^>]*size="reveal"/);
});

test('every full-screen reveal uses the one share pill, under its main button', () => {
  const button = src('src/share/FlexShareButton.tsx');
  assert.match(button, /export function ShareFace\(/);
  assert.match(button, /export type ShareSize = 'sm' \| 'md' \| 'reveal';/);
  for (const [file, re] of [
    ['src/components/home/HomeHuntResultsModal.tsx', /kind="standings"[^>]*size="reveal"/],
    ['src/components/coin/Crowning.tsx', /kind="crowned"[^>]*size="reveal"/],
    ['src/screens/SharkPassScreen.tsx', /const landedShareButton = [\s\S]{0,200}<FlexShareButton kind="find" surface="sharkpass" size="reveal"/],
    ['src/components/money/MonthlyGiftCard.tsx', /share=\{[\s\S]{0,80}<FlexShareButton kind="find" surface="vip_gift" size="reveal"/],
  ]) assert.match(src(file), re, file);
  const gotIt = src('src/components/money/moneyUi.tsx');
  assert.match(gotIt, /\{action && <GameButton label=\{action\.label\}[^\n]*\n\s*\{action && share && /);
  assert.match(gotIt, /onPress=\{onDone\}\s*icon=\{wide && !action \? 'check' : undefined\} \/>\n\s*\{!action && share && /);
  // The Closet look and the ride card use the same face, not a copy of its styles.
  assert.match(src('src/share/LookShareButton.tsx'), /<ShareFace size="sm" caption/);
  assert.doesNotMatch(src('src/share/LookShareButton.tsx'), /round: \{/);
  const ride = src('src/components/RideTracker/ShareableRideCard.tsx');
  assert.match(ride, /<ShareFace size="reveal"/);
  assert.doesNotMatch(ride, /shareBtn/);
  for (const file of ['src/screens/RideTracker/RideHistoryScreen.tsx', 'src/screens/RideTracker/RideDetailScreen.tsx']) {
    // The hotfix Close button (its own accessible element), saying the one close word.
    assert.match(src(file), /accessibilityLabel="Close">\s*<Text style=\{\w+\.modalCloseText\}>\{CLOSE_WORD\}<\/Text>/, file);
  }
  assert.match(src('src/share/closeWord.ts'), /export const CLOSE_WORD = 'Nice!';/);
});

test('a bare shark has no look to share; the ride story is one hero stat; the held ride card shows a park icon', () => {
  const look = loadTs('src/share/LookShareButton.tsx', {
    react: { useRef: v => ({ current: v }), useState: v => [v, () => {}] }, 'react/jsx-runtime': { jsx() { return null; }, jsxs() { return null; } },
    'react-native': { StyleSheet: { create: s => s }, Pressable: 'Pressable', View: 'View' }, '../helpers/haptics': {},
    '../helpers/wardrobe': loadTs('src/helpers/wardrobe.ts', {}), './capture': {}, './FlexShareButton': {}, './FlexShark': {}, './StoryShareFrame': {},
  });
  assert.equal(look.hasLookToShare(null), false);
  assert.equal(look.hasLookToShare({ skin_item: { paper_url: 'skin.png' } }), false, 'nothing worn yet');
  assert.equal(look.hasLookToShare({ head_item: { paper_url: 'hat.png' } }), true);
  const ride = src('src/components/RideTracker/ShareableRideCard.tsx');
  assert.match(ride, /cardStyles\.heroStat\b/);
  assert.match(ride, /<SharkReactionIcon reaction=\{ride\.reaction\} size=\{46\} \/>/);
  assert.match(ride, /alignSelf: 'center', flexDirection: 'row'/, 'sized to its content');
  assert.match(ride, /<GameIcon name="map" size=\{28\} \/>\s*<Text style=\{cardStyles\.heldText\}>\{RIDE_SHARE_HELD_LABEL\}<\/Text>/);
  assert.match(ride, /<CardContent ride=\{ride\} rideCount=\{confirmedCount\} \/>\s*<\/View>\s*\{inPark/, 'the preview is the shared card');
});

test('on a short phone (iPhone SE) the reveals keep Wear, Done and Share on screen', () => {
  const box = src('src/screens/pins/BoxReveal.tsx');
  assert.match(box, /const short = height < 740;\s*const centerY = height \* \(short \? 0\.41 : 0\.45\);/);
  assert.match(box, /paddingBottom: insets\.bottom \+ \(short \? 14 : 18\) \}, short && \{ gap: 6 \}/);
  const set = src('src/screens/StoreScreen/SetCompleteReveal.tsx');
  assert.match(set, /const SHORT = H < 740;\s*const STAGE = Math\.min\(W - 40, H \* \(SHORT \? 0\.3 : 0\.4\)\);/);
  // The Whack picture leads with the run: the ribbon already names the game.
  const whack = src('src/games/whack/ui/ShareCard.tsx');
  assert.match(whack, /<Text style=\{styles\.title\}>MY RUN<\/Text>/);
  assert.match(whack, /ribbon="WHACK-A-SHARK!"/);
});

/* ------------------------------------------------------------------ round 4 */

test('Shark Pass: Share shows only after the wear choice, and wearing waits for the fresh look', () => {
  const pass = src('src/screens/SharkPassScreen.tsx');
  assert.match(pass, /const landedChoice = landedCanShare && !!landedWear;/);
  // The wearable, shareable card is the wear-first card; the choice lives in WearFirstReward.
  assert.match(pass, /\{landed && landedChoice \? \(\s*(?:\/\/[^\n]*\n\s*)*<WearFirstReward resetOn=\{landed\}/);
  assert.match(pass, /wear=\{landedWear!\} frame=\{landed\.reward\.type === 'frame'\}\s*share=\{landedShareButton\} onDone=\{\(\) => setLanded\(landed\.next \?\? null\)\} \/>/);
  // The plain card only shares a piece with nothing to wear.
  assert.match(pass, /share=\{landedCanShare && !landedWear \? landedShareButton\(false\) : undefined\}/);
  // The save alone is timed out; the refresh is separate (raced in wearThenRefresh).
  assert.match(pass, /run: \(\) => wearItem\(\{ id: landed\.itemId! \}\), refresh: \(\) => refreshPlayer\?\.\(\)/);
  assert.match(pass, /run: \(\) => wearFrame\(landed\.frameKey!\), refresh: \(\) => load\(\)/);
  const card = src('src/components/money/WearFirstReward.tsx');
  assert.match(card, /void wearThenRefresh\(wear\.run, wear\.refresh, undefined, undefined, late\)/, 'a hung save turns into Try again, and a late save turns it to worn');
  assert.match(card, /setChosen\(c => \(c === 'failed' \? 'worn' : c\)\)/);
  assert.match(card, /onDone=\{b\.doneKeeps \? \(\) => setChosen\('kept'\) : onDone\}/, '"Not now" is a choice, not a close');
  assert.match(card, /share=\{b\.share \? pill : undefined\}/);
});

test('wear-first buttons: Wear it now is yellow, Not now is quiet, Share comes only after the choice', () => {
  const model = loadTs('src/services/money/sharkPassModel.ts', {});
  const ask = model.wearFirstButtons(null);
  assert.deepEqual({ ...ask }, { action: 'wear', busy: false, share: false, doneLabel: 'Not now', doneKeeps: true });
  const saving = model.wearFirstButtons('saving');
  assert.equal(saving.busy, true);
  assert.equal(saving.share, false);
  for (const done of ['worn', 'kept']) {
    const b = model.wearFirstButtons(done);
    assert.equal(b.share, true, `${done}: Share shows`);
    assert.equal(b.action, null);
    assert.equal(b.doneLabel, 'Done');
    assert.equal(b.doneKeeps, false);
  }
  const failed = model.wearFirstButtons('failed');
  assert.equal(failed.action, 'retry', 'a failed save offers Try again');
  assert.equal(failed.share, true);
  assert.equal(model.wearFirstCaption('saving', 'Snowflake Beanie', false), 'Snowflake Beanie', 'the busy button says Putting it on, not the line too');
  assert.equal(model.wearFirstCaption('worn', 'x', true), 'Your frame shows on your profile now.');
  assert.equal(model.wearFirstCaption('failed', 'x', false), 'That didn’t work. Tap Try again.');
  assert.equal(model.wearFirstCaption(null, 'Snowflake Beanie', false), 'Snowflake Beanie');
  // GotIt: busy means one busy button, no close, and a tap outside does nothing.
  const got = src('src/components/money/moneyUi.tsx');
  assert.match(got, /const close = busyLabel \? \(\) => undefined : onDone;/);
  assert.match(got, /<Modal visible transparent animationType="fade" onRequestClose=\{close\}/);
  assert.match(got, /<Pressable style=\{s\.gotScrim\} onPress=\{close\}/);
  assert.match(got, /<GameButton label=\{busyLabel\} icon=\{busyIcon \?\? 'pin'\} loading/);
  // The quiet button's slot stays (invisible) while it saves, so the busy button never jumps.
  assert.match(got, /<View style=\{\{ opacity: 0 \}\} pointerEvents="none"[^>]*>\s*<GameButton label=\{doneLabel \?\? 'Later'\} variant="ghost"/);
  // With a yellow action the close word is always the quiet ghost under Share.
  assert.match(got, /variant=\{action \? 'ghost' : 'primary'\}/);
});

test('a hung wear call fails after the timeout instead of spinning forever', async () => {
  const model = loadTs('src/services/money/sharkPassModel.ts', {});
  await assert.rejects(model.withWearTimeout(new Promise(() => {}), 20), /timed out/);
  assert.equal(await model.withWearTimeout(Promise.resolve(7), 20), 7);
  assert.equal(model.WEAR_TIMEOUT_MS, 8000);
});

test('share stat for a piece that is not in a set: the line as given, no " set", never an ellipsis', () => {
  const { flexCopy } = loadTs('src/share/copy.ts', {});
  const pass = flexCopy('find', { itemName: 'Snowflake Beanie', artUrl: 'x', prize: 'pass', sourceLine: 'Earned at Step 12', sourceSub: 'Frosty Fun Winter Wonderland' });
  assert.equal(pass.stat, 'Earned at Step 12');
  assert.equal(pass.sub, 'Frosty Fun Winter Wonderland');
  const longSeason = flexCopy('find', { itemName: 'Snowflake Beanie', artUrl: 'x', prize: 'pass', sourceLine: 'Earned at Step 4', sourceSub: 'The Super Spooky Halloween Season Spectacular' });
  assert.equal(longSeason.stat, 'Earned at Step 4');
  assert.equal(longSeason.sub, null, 'a season name too long for the line is dropped, not cut off');
  const vip = flexCopy('find', { itemName: 'Pumpkin Patch Pin', artUrl: 'x', prize: 'member', sourceLine: 'October member gift' });
  assert.equal(vip.stat, 'October member gift');
  assert.equal(vip.sub, null);
  // A plain find with a sourceLine (no prize) keeps the line as given too.
  const plain = flexCopy('find', { itemName: 'Snowflake Beanie', artUrl: 'x', rarity: 4, sourceLine: 'From the Trail' });
  assert.equal(plain.stat, 'From the Trail');
  // An old-style long set name never reaches the stat with an ellipsis or a stray " set".
  const oldStyle = flexCopy('find', { itemName: 'Snowflake Beanie', artUrl: 'x', rarity: 4, setName: 'Spooky Season · Step 4 of the pass' });
  assert.equal(oldStyle.stat, 'Added to my collection');
  for (const c of [pass, longSeason, vip, plain, oldStyle]) {
    assert.doesNotMatch([c.stat, c.sub].filter(Boolean).join(' '), /…/);
  }
  assert.match(src('src/components/money/MonthlyGiftCard.tsx'), /prize: 'member', sourceLine: `\$\{monthName\(gift\.month, false\)\} member gift`/);
  const shark = src('src/screens/SharkPassScreen.tsx');
  assert.match(shark, /prize: 'pass', sourceLine: landed\.step \? `Earned at \$\{stepLabel\(landed\.step\)\}` : undefined, sourceSub: season\?\.title/);
  assert.match(shark, /itemId, frameKey, step: tier\.tier,/, 'the step is the claimed one, not the current one');
  assert.doesNotMatch(shark + src('src/components/money/MonthlyGiftCard.tsx'), /setName: `/);
});

/* ------------------------------------------------------------- wave 2 round 2 */

test('an earned prize card says how it was earned: no FIND, no rarity, a CTA that fits', () => {
  const { flexCopy } = loadTs('src/share/copy.ts', {});
  const pass = flexCopy('find', { itemName: 'Snowflake Beanie', artUrl: 'x', prize: 'pass', sourceLine: 'Earned at Step 12', sourceSub: 'Frosty Fun Winter Wonderland' });
  assert.equal(pass.ribbon, 'NEW PRIZE!');
  assert.equal(pass.kicker, 'My Shark Pass Prize');
  assert.equal(pass.cta, 'Come play with me!');
  assert.equal(pass.rarity, null, 'Shark Pass pieces have no rarity: no Epic pill');
  const vip = flexCopy('find', { itemName: 'Pumpkin Patch Pin', artUrl: 'x', prize: 'member', sourceLine: 'October member gift' });
  assert.equal(vip.ribbon, 'MEMBER GIFT!');
  assert.equal(vip.kicker, 'My Member Pin');
  assert.equal(vip.cta, 'Come play with me!', 'never "Can you find one?" for a members-only pin');
  assert.equal(vip.rarity, null);
  for (const c of [pass, vip]) {
    assert.doesNotMatch([c.ribbon, c.kicker, c.stat, c.sub, c.cta].filter(Boolean).join(' '), /FIND|Find|find/);
    assert.doesNotMatch(c.a11y ?? '', /Epic|Legendary/);
  }
  // A found pin is unchanged.
  const found = flexCopy('find', { itemName: 'Magic Hat Pin', artUrl: 'x', rarity: 5, serial: 12 });
  assert.equal(found.cta, 'Can you find one?');
  assert.equal(found.rarity, 5);
  // No hardcoded rarity on the earned cards.
  assert.doesNotMatch(src('src/screens/SharkPassScreen.tsx'), /rarity: 4/);
  assert.doesNotMatch(src('src/components/money/MonthlyGiftCard.tsx'), /rarity: 4/);
  const hero = src('src/share/FlexHero.tsx');
  assert.match(hero, /\{!prize && \(rarity >= 4 \|\| p\.goldenHour\) && <Stars/, 'no rarity stars on a prize');
});

test('a wear that saved never says "That didn\'t work" because the refresh is slow', async () => {
  const model = loadTs('src/services/money/sharkPassModel.ts', {});
  assert.equal(model.WEAR_REFRESH_MS, 4000);
  let refreshed = 0;
  assert.equal(await model.wearThenRefresh(() => Promise.resolve(), () => { refreshed += 1; return new Promise(() => {}); }, 50, 20), 'worn', 'a hanging refresh still ends worn');
  assert.equal(refreshed, 1);
  assert.equal(await model.wearThenRefresh(() => Promise.resolve(), () => Promise.reject(new Error('net')), 50, 20), 'worn', 'a failed refresh still ends worn');
  assert.equal(await model.wearThenRefresh(() => new Promise(() => {}), () => Promise.resolve(), 20, 20), 'failed', 'a hung save is a failure');
  assert.equal(await model.wearThenRefresh(() => Promise.reject(new Error('x')), null, 20, 20), 'failed');
  assert.equal(await model.wearThenRefresh(() => { throw new Error('sync'); }, null, 20, 20), 'failed', 'a save that throws right away is a failure');
});

test('Shark Pass worn: the kid\'s shark wears the piece on the card and on the share picture', () => {
  const card = src('src/components/money/WearFirstReward.tsx');
  assert.match(card, /chosen === 'worn' && wornPicture \? <Animated\.View entering=\{ZoomIn/);
  assert.match(card, /typeof share === 'function' \? share\(chosen === 'worn'\) : share/);
  const pass = src('src/screens/SharkPassScreen.tsx');
  assert.match(pass, /<WearFirstReward resetOn=\{landed\} title=\{landed\.title\} picture=\{landedPicture\} wornPicture=\{landedWornPicture\}/);
  assert.match(pass, /withSeasonPin\(player\?\.inventory as InventoryType \| undefined, landed\.reward\)/);
  assert.match(pass, /inventory: worn && wornLook\?\.skin_item \? wornLook : undefined/, 'kept: the live look, worn: the look with the piece');
});

test('box reveal: a gold chaser or Golden Box pin asks Wear it or Not now, then Done and Share', () => {
  const box = src('src/screens/pins/BoxReveal.tsx');
  assert.match(box, /const wearFirst = phase === 'show' && pulls\.length === 1 && brag\(pull\) && wearable && !kept\.has\(pull\.item_id\);/);
  // Choice: the yellow Wear it, then the quiet Not now (always there, not only on a full lanyard).
  const wear = box.indexOf("label={wearing ? 'Putting it on...' : wearFailed ? 'Try again' : 'Wear it'}");
  const share = box.indexOf('{sharePull && !choosing && (');
  const keep = box.indexOf("label={wearFailed ? 'Done' : 'Not now'} variant=\"ghost\" tone=\"onBlue\"");
  assert.ok(wear > 0 && wear < share && share < keep, 'yellow, then Share, then the quiet choice');
  assert.match(box, /\{!wearFirst && \(\s*<GameButton label=\{index < pulls\.length - 1/, 'no yellow Done while the choice is open');
  // A hung save becomes Try again; a stray tap or back never closes while saving.
  assert.match(box, /void withWearTimeout\(onWear\(pull, removeId\), undefined, late\)/);
  assert.match(box, /!isGold && !wearing && Date\.now\(\)/);
  assert.match(box, /\(phase === 'show' \|\| phase === 'summary'\) && !wearing && next\(\)/);
  // The lanyard-full chooser uses the same quiet ghost, with the same words.
  assert.match(box, /<GameButton label="Not now" variant="ghost" tone="onBlue"/);
  assert.doesNotMatch(box, /Keep my lanyard'|"Keep my lanyard"/);
  assert.doesNotMatch(box, /offPickKeep/);
});

test('every wear choice uses one look: yellow primary, quiet ghost secondary', () => {
  const set = src('src/screens/StoreScreen/SetCompleteReveal.tsx');
  assert.match(set, /leaveLabel\(false, titleOnly === 'done'\)\} variant="ghost" tone="onBlue"/);
  assert.doesNotMatch(set, /styles\.leaveText/);
  const got = src('src/components/money/moneyUi.tsx');
  assert.match(got, /variant=\{action \? 'ghost' : 'primary'\} tone="onBlue"/);
});

test('square look card: the dressed shark is the hero, at most 3 tiles, words centered', () => {
  const card = src('src/share/FlexCard.tsx');
  assert.match(card, /export const SQUARE_LOOK_SHARK_H = 196;/);
  assert.match(card, /sharkH=\{SQUARE_LOOK_SHARK_H\} tile=\{44\} maxTiles=\{3\} room=\{box\.h\} width=\{box\.w\}/);
  assert.match(card, /\.slice\(0, maxTiles\)/);
  assert.match(card, /<View style=\{\[styles\.squareWordsRow, centered && styles\.squareWordsLook\]\}>/);
  assert.match(card, /const centered = look \|\| !big;/);
  assert.match(card, /squareWordsLook: \{ justifyContent: 'center' \}/);
  assert.match(card, /\{!look && <StatPlate copy=\{copy\} frame=\{frame\} compact center=\{centered\} \/>\}/);
  assert.match(card, /squareStageLook: \{ flex: 2\.6, paddingTop: 14 \}/);
  // Story: the hat clears the ribbon, and the plate's room goes to the shark.
  assert.match(card, /\{!look && <StatPlate copy=\{copy\} frame=\{frame\} compact=\{false\} \/>\}/);
  assert.match(card, /storyHeroLook: \{ paddingTop: 6 \}/);
  // Square plate keeps one line, and the hero leaves room for the kicker (squareStage, wave 3 round 3).
  assert.match(card, /\{!!copy\.sub && !compact && <Text/);
  assert.match(src('src/share/stage.ts'), /export const SQUARE_HERO = 112;/);
});

test('a worn prize pin shows on the share shark\'s chest', () => {
  const card = src('src/share/FlexCard.tsx');
  assert.match(card, /chestPin: kind === 'find' && !!payload\.inventory\?\.pin_item/);
  assert.match(card, /<FlexShark inventory=\{inventory\} height=\{stage\.shark\} prop=\{null\} pin=\{chestPin\} \/>/);
  assert.match(card, /<FlexShark inventory=\{inventory\} height=\{place\.shark\} prop=\{null\} pin=\{chestPin\} \/>/, 'the square sharks wear it too');
  const shark = src('src/share/FlexShark.tsx');
  assert.match(shark, /\{pin && !!inventory\?\.pin_item\?\.icon_url && \(/);
  const reward = src('src/components/money/WearFirstReward.tsx');
  assert.match(reward, /export function WornLook\(/);
  assert.match(src('src/screens/SharkPassScreen.tsx'), /<WornLook inventory=\{wornLook\} art=\{null\} still=\{reduced\} \/>/);
});

test('the Memory share sheet hint matches the picture', () => {
  const memory = src('src/games/memory/MemoryExtras.tsx');
  assert.match(memory, /The picture shows your score, not where the cards are\./);
  assert.doesNotMatch(memory, /It never shows the cards/);
});

test('Set Complete shares the shark wearing the set, after the fresh look is back', () => {
  const set = src('src/screens/StoreScreen/SetCompleteReveal.tsx');
  assert.match(set, /const shareLook = useMemo\(\(\) => previewLook\(player\?\.inventory, pieces\.map\(asWearable\), 'player'\)\?\.look \?\? null/);
  assert.match(set, /inventory: shareLook \?\? undefined \}\} \/>/);
  assert.match(set, /await Promise\.race\(\[Promise\.resolve\(refreshPlayer\(\)\)\.catch\(\(\) => undefined\), new Promise\(r => setTimeout\(r, REFRESH_WAIT_MS\)\)\]\);\s*settle\(true\);/,
    'a hung refresh never keeps Share off');
  assert.match(set, /export const REFRESH_WAIT_MS = 4000;/);
  // No level numbers from the server: the XP only, never an empty "LV" ring.
  assert.match(set, /\{reward\.xp > 0 && !xp && \(/);
  assert.match(set, /\{reward\.xp > 0 && !!xp && \(/);
});

test('a find card says its rarity once on the ribbon and pill; the kicker and stat say something new', () => {
  const copySrc = src('src/share/copy.ts');
  const find = copySrc.slice(copySrc.indexOf('  find: (p, owned) => {'), copySrc.indexOf('  ride_photo: p => {'));
  assert.match(find, /kicker: rarity >= 3 \|\| p\.goldenHour \? 'My New Find' : `My \$\{label\} Find`/);
  assert.doesNotMatch(find, /`A \$\{label\} find`/, 'no "A Legendary find" stat');
  assert.match(find, /serial \? `Limited edition #\$\{serial\}`/);
  assert.match(find, /stat: special \?\? source \?\? setLine \?\? 'Added to my collection'/);
  assert.match(src('src/screens/pins/BoxReveal.tsx'), /serial: sharePull\.is_chaser \? sharePull\.serial : null/);
  const { flexCopy } = loadTs('src/share/copy.ts', {});
  const chaser = flexCopy('find', { itemName: 'Magic Hat Pin', artUrl: 'x', rarity: 5, serial: 12 });
  assert.equal(chaser.ribbon, 'LEGENDARY FIND!');
  assert.equal(chaser.kicker, 'My New Find');
  assert.equal(chaser.stat, 'Limited edition #12');
  assert.doesNotMatch([chaser.kicker, chaser.stat, chaser.sub].filter(Boolean).join(' '), /Legendary/);
  const plain = flexCopy('find', { itemName: 'Banana Pin', artUrl: 'x', rarity: 4 });
  assert.equal(plain.stat, 'Added to my collection');
  const inSet = flexCopy('find', { itemName: 'Banana Pin', artUrl: 'x', rarity: 4, setName: 'Snacks', setFound: 3, setTotal: 6 });
  assert.equal(inSet.big, '3/6');
  assert.equal(inSet.stat, 'Snacks set');
});

test('the ride story leads a first ride with FIRST RIDE!, and the Memory story has no date and big type', () => {
  const ride = src('src/components/RideTracker/ShareableRideCard.tsx');
  assert.match(ride, /\{count === 1 \? 'FIRST RIDE!' : count\.toLocaleString\('en-US'\)\}/);
  assert.match(ride, /\{count > 1 && <Text style=\{cardStyles\.heroStatLabel\}>TIMES RIDDEN<\/Text>\}/);
  const mem = src('src/games/memory/MemoryExtras.tsx');
  const cards = mem.slice(mem.indexOf('export function ShareCard('), mem.indexOf('export function ShareBack('));
  assert.doesNotMatch(cards, /daily\.day/, 'no date on any Memory share card');
  assert.match(mem, /<StoryShareFrame ref=\{storyRef\} ribbon="MEMORY MATCH!"[^>]*>\s*<ShareStoryCard daily=\{daily\} \/>/);
  assert.match(mem, /storyBig: \{ fontFamily: 'Shark', fontSize: 58/);
});

test('the coin level-up uses the same labeled Share pill, under its main button', () => {
  const coin = src('src/components/CoinLevelingModal.tsx');
  assert.match(coin, /<YellowButton text="Awesome!" onPress=\{handleClose\} \/>\s*\{\/\*[\s\S]*?\*\/\}\s*\{nextLevel >= 5 && nextLevel < 10 && \(\s*<FlexShareButton kind="coin_level" surface="coin_sheet" size="md"/);
  assert.doesNotMatch(coin, /size="sm" caption style=\{\{ position: 'absolute'/);
  // On a short phone (iPhone SE) the sheet slides down after the level-up so Awesome and Share both show.
  assert.match(coin, /if \(state !== 'success' \|\| SCREEN_H >= 740 \|\| scrolledForSuccess\.current\) return;\s*scrolledForSuccess\.current = true;/, 'slides once per level-up');
  assert.doesNotMatch(coin, /scrollToEnd/, 'never yanks a kid who scrolled up back down');
  // Every line says something new: the ribbon names the level; the card says what changed.
  assert.doesNotMatch(coin, /Your coin evolved to Level/);
  assert.match(coin, /\{state !== 'success' && <View style=\{\{/);
});

test('every reveal line says something new: the box says the serial twice, not three times', () => {
  const box = src('src/screens/pins/BoxReveal.tsx');
  assert.doesNotMatch(box, /LIMITED \\u00b7 #/);
  assert.match(box, /style=\{styles\.backerFoilText\}>LIMITED<\/Text>/);
  assert.match(box, /GOLD CHASER \{serialLabel\(pull\.serial\)\}/);
});

test('one share order on every reveal: the yellow button, Share right under it, the quiet close last', () => {
  // Box: the one yellow button (Next box / Done), then Share.
  const box = src('src/screens/pins/BoxReveal.tsx');
  assert.match(box, /icon=\{index < pulls\.length - 1 \? 'gift' : 'check'\} onPress=\{next\} \/>\s*\)\}\s*\{sharePull && !choosing && \(\s*<FlexShareButton/);
  // Set Complete, once it is all on: the yellow Done, then Share (WEAR IT ALL and Not now are gone).
  const set = src('src/screens/StoreScreen/SetCompleteReveal.tsx');
  const done = set.indexOf("<GameButton label={waiting ? 'Saving...' : 'Done'} icon=\"check\"");
  const share = set.indexOf('<FlexShareButton kind="set_complete"');
  assert.ok(done > 0 && done < share, 'Set Complete order');
  // Coin: Awesome!, then Share.
  const coin = src('src/components/CoinLevelingModal.tsx');
  assert.ok(coin.indexOf('<YellowButton text="Awesome!"') < coin.indexOf('<FlexShareButton kind="coin_level"'));
  // GotIt (Shark Pass, VIP gift): the action, Share, the close; or the close, then Share.
  const got = src('src/components/money/moneyUi.tsx');
  assert.match(got, /\{action && <GameButton[^\n]*\/>\}\s*\{action && share && <View style=\{\{ alignItems: 'center' \}\}>\{share\}<\/View>\}\s*<GameButton label=\{doneLabel/);
  assert.match(got, /onPress=\{onDone\}\s*icon=\{wide && !action \? 'check' : undefined\} \/>\s*\{!action && share && <View/);
});

test('the shop set picture is the dressed shark, no prop and no medallion', () => {
  const card = src('src/share/FlexCard.tsx');
  assert.match(card, /look: isLookSet\(kind, payload\) && !!shark\?\.skin_item/);
  assert.match(card, /export const LOOK_SHARK_H = 232;/);
  assert.match(card, /<FlexShark inventory=\{inventory\} height=\{place\.shark\} prop=\{null\} \/>/);
  assert.match(card, /\{look \? <LookHero[^\n]*sharkH=\{size\.look\}/);
  const { flexCopy } = loadTs('src/share/copy.ts', {});
  const set = flexCopy('set_complete', { setName: 'Spooky Squad', badgeUrl: 'x', found: 3, total: 3, source: 'shop' });
  assert.equal(set.prop, null, 'no treasure chest beside the look');
  assert.equal(set.kicker, 'My Complete Look');
});

/* ------------------------------------------------------------------ wave 2 round 3 */

test('a wear that saves after the timeout turns Try again into worn', async () => {
  const model = loadTs('src/services/money/sharkPassModel.ts', {});
  let late = null;
  const slow = new Promise(r => setTimeout(() => r('ok'), 40));
  await assert.rejects(model.withWearTimeout(slow, 10, v => { late = v; }), /timed out/);
  await new Promise(r => setTimeout(r, 60));
  assert.equal(late, 'ok', 'the late value still arrives');
  let lateWorn = 0;
  let refreshed = 0;
  const result = await model.wearThenRefresh(() => new Promise(r => setTimeout(r, 40)), () => { refreshed += 1; }, 10, 20, () => { lateWorn += 1; });
  assert.equal(result, 'failed', 'the card first says Try again');
  await new Promise(r => setTimeout(r, 80));
  assert.equal(lateWorn, 1, 'then the late save flips it to worn');
  assert.equal(refreshed, 1, 'and fetches the fresh look');
  let never = 0;
  await model.wearThenRefresh(() => new Promise((_, no) => setTimeout(() => no(new Error('x')), 40)), null, 10, 20, () => { never += 1; });
  await new Promise(r => setTimeout(r, 80));
  assert.equal(never, 0, 'a late failure stays failed');
  const box = src('src/screens/pins/BoxReveal.tsx');
  assert.match(box, /if \(!live\.current \|\| !r\.ok\) return;[\s\S]{0,200}if \(wearingRef\.current\) \{ lateOn\.current = \{ id, removed: r\.removed \?\? null \}; return; \}\s*putOn\(r\.removed\);/);
  // A late first save while a retry is saving: a failed retry shows worn, never Try again.
  assert.match(box, /if \(!ok && landed\) \{ putOn\(landed\.removed\); return; \}/);
  // After Done or Share, a late save is silent (no whoosh, hit or haptic for a closed screen).
  assert.match(box, /setWorn\(w => new Set\(w\)\.add\(id\)\);\s*\/\/[^\n]*\n\s*if \(leaving\.current \|\| phaseRef\.current !== 'show'\) return;\s*queueHaptic\('success', 1\);/);
  assert.match(box, /leaving\.current = true;\s*onDone\(pulls\);/);
});

test('Shark Pass and member prize cards have their own campaign link and QR', () => {
  const link = loadTs('src/share/link.ts', {});
  assert.equal(link.flexShareUrl('find', { itemName: 'x', artUrl: 'x', prize: 'pass' }), 'https://themeparkshark.com/app?c=flex_sharkpass');
  assert.equal(link.flexShareUrl('find', { itemName: 'x', artUrl: 'x', prize: 'member' }), 'https://themeparkshark.com/app?c=flex_member');
  assert.equal(link.flexShareUrl('find', { itemName: 'x', artUrl: 'x', rarity: 3 }), 'https://themeparkshark.com/app?c=flex_find');
  assert.equal(link.prizeCampaign('stamp', { prize: 'pass' }), null, 'only a find card can be a prize');
  const qr = src('src/share/campaignQr.ts');
  for (const c of ['sharkpass', 'member']) {
    assert.match(qr, new RegExp(`  ${c}: require\\('../../assets/images/share/qr/campaign-${c}.png'\\)`));
    assert.ok(fs.existsSync(path.join(root, `assets/images/share/qr/campaign-${c}.png`)));
  }
  assert.match(src('src/share/ShareStudioHost.tsx'), /const link = flexShareUrl\(request\.kind, request\.payload\);\n\s*const copyLink = \(\) => Clipboard\.setStringAsync\(link\)/);
  assert.match(src('src/share/FlexCard.tsx'), /return campaign \? QR_BY_CAMPAIGN\[campaign\] : QR_BY_KIND\[kind\];/);
});

test('the worn prize pin is a big badge drawn over every layer and prop', () => {
  const shark = src('src/share/FlexShark.tsx');
  assert.match(shark, /export const CHEST_PIN = \{ x: 0\.47, y: 0\.56, w: 0\.26 \} as const;/);
  // After the prop, so no hose or prop covers it.
  assert.ok(shark.indexOf('{!spot?.behind && propView}') < shark.indexOf('{pin && !!inventory?.pin_item?.icon_url && ('));
  assert.match(shark, /badge: \{[^}]*borderColor: '#ffcf3b'/);
});

test('story cards: nothing readable above y 230 px or below y 1440 px; the shark stands in front of the tile', () => {
  const card = src('src/share/FlexCard.tsx');
  const geo = card + src('src/share/stage.ts');
  const num = name => Number((geo.match(new RegExp(`export const ${name} = (\\d+);`)) || [])[1]);
  const safe = card.match(/export const STORY_SAFE = \{ top: (\d+), bottom: (\d+) \} as const;/);
  assert.ok(safe, 'STORY_SAFE');
  const [top, bottom] = [Number(safe[1]), Number(safe[2])];
  // 3x export: 1080x1920 px from 360x640 pt.
  assert.ok(top * 3 >= 230, `top band ${top * 3} px`);
  assert.ok((640 - bottom) * 3 <= 1440, `bottom line ${(640 - bottom) * 3} px`);
  assert.match(card, /export const STORY_FOOTER_LIFT = 4;/, 'the footer sits 4 pt (12 px) above the safe line');
  assert.match(card, /export const STORY_FOOTER_BOTTOM = STORY_SAFE\.bottom \+ STORY_FOOTER_LIFT;/, 'the footer ends above the safe line');
  assert.match(card, /storyFooter: \{ position: 'absolute', left: 20, right: 20, bottom: STORY_FOOTER_BOTTOM \}/);
  assert.match(card, /export const STORY_BODY_BOTTOM = STORY_FOOTER_BOTTOM \+ STORY_FOOTER_H \+ 8 - STORY_FOOTER_LIFT;/, 'the body keeps its room (236 pt)');
  assert.match(card, /storyBody: \{[^}]*paddingBottom: STORY_BODY_BOTTOM/);
  // The QR stays left of TikTok's right rail.
  assert.match(card, /footerStory: \{ marginTop: 0, paddingRight: STORY_RAIL_W \}/);
  const frame = src('src/share/StoryShareFrame.tsx');
  assert.match(frame, /body: \{[^}]*paddingBottom: STORY_BODY_BOTTOM/);
  assert.match(frame, /footer: \{ position: 'absolute', left: 20, right: 20, bottom: STORY_FOOTER_BOTTOM \}/);
  assert.match(frame, /logoWidth=\{108\} qr=\{56\} story \/>/);
  // Band decoration only: every band star sits in y 0..STORY_SAFE.top or below the safe line.
  const bands = card.slice(card.indexOf('const StoryBands'), card.indexOf('const BAND_STAR'));
  for (const m of bands.matchAll(/\{ x: \d+, y: (\d+), s: \d+ \}/g)) {
    const y = Number(m[1]);
    assert.ok(y < top || y >= 640 - bottom, `band star at y ${y}`);
  }
  // The shark is the star: the biggest thing on the card, in front of the tile (zIndex, overlap of its
  // painted body), its feet behind the words, and the tile fully above the words.
  assert.ok(num('STORY_SHARK_H') > num('STORY_HERO') * 2);
  assert.match(card, /storyShark: \{ zIndex: 2 \}/);
  assert.match(card, /storyBigOver: \{ zIndex: 3 \}/, 'the giant number reads over the shark');
  assert.match(card, /words: \{[^}]*zIndex: 4 \}/, 'the words ride over the shark feet');
  const stage = loadTs('src/share/stage.ts', { './lookBounds': loadTs('src/share/lookBounds.ts', {}) }).storyStage;
  const lift = num('STORY_WORDS_LIFT');
  for (const room of [150, 180, 200, 230]) {
    const z = stage(room, 320, lift);
    const w = z.shark * 1353 / 1530;
    assert.ok(z.shark * 0.64 > z.tile * 1.15, `room ${room}: painted shark ${Math.round(z.shark * 0.64)} beats the tile ${z.tile}`);
    assert.ok(z.tileTop + z.tile + 8 <= room - lift, `room ${room}: the tile and its lip sit above the words`);
    assert.ok(z.sharkTop + z.shark * 0.1 >= -1, `room ${room}: the hat stays below the hero top (ribbon clear edge)`);
    assert.ok(Math.abs(z.sharkTop + z.shark * 0.82 - (room - 4)) <= 1, `room ${room}: feet tuck 4 pt above the bottom, behind the words`);
    const over = z.tileLeft + z.tile - (z.sharkLeft + w * 0.18);
    assert.ok(over >= Math.min(30, Math.round(z.tile * 0.27)) - 1 && over <= z.tile * 0.27 + 1, `room ${room}: the painted shark overlaps the tile's edge (${over.toFixed(1)} pt)`);
    assert.ok(z.sharkLeft + w * 0.82 <= 320, `room ${room}: the painted shark stays inside the card`);
  }
  // A worn pin (low on the belly) is never under the words.
  assert.ok(num('STORY_WORDS_LIFT_PIN') <= 18);
});

test('one wear choice on every reveal: same words, same icons that say "put it on", no #12 twice', () => {
  const box = src('src/screens/pins/BoxReveal.tsx');
  assert.match(box, /icon=\{wearFailed \? 'retry' : 'sparkle'\}/, 'the box Wear it shows a sparkle, not the map pin');
  assert.match(box, /Saved in My Pins/);
  assert.match(box, /<View style=\{wearing && styles\.slotHold\} pointerEvents=\{wearing \? 'none' : 'auto'\}/, 'Not now keeps its slot while saving');
  assert.doesNotMatch(box, /serialStamp/, 'the number is on the GOLD CHASER ribbon only');
  const card = src('src/components/money/WearFirstReward.tsx');
  assert.match(card, /export const WEAR_ICON = 'shark' as const;/);
  assert.match(card, /busyIcon=\{WEAR_ICON\} wide/);
  const set = src('src/screens/StoreScreen/SetCompleteReveal.tsx');
  assert.match(set, /\{all !== 'done' && \(\s*<Pressable onPress=\{\(\) => leave\(false\)\}[^>]*accessibilityLabel="Close"/, 'no X once it is all on');
  assert.match(set, /All on!/);
  assert.doesNotMatch(set, /done=\{all === 'done'\}/, 'no green ALL ON! slab button');
  for (const f of ['src/screens/pins/BoxReveal.tsx', 'src/components/money/WearFirstReward.tsx', 'src/screens/StoreScreen/SetCompleteReveal.tsx', 'src/share/FlexCard.tsx', 'src/share/FlexShark.tsx']) {
    assert.doesNotMatch(src(f), new RegExp(String.fromCharCode(0x2014)), `${f}: no em dashes`);
  }
});

/* ------------------------------------------------------------- wave 3 round 2 */

test('a standings card prints one percentage: a tier name with its own number never reaches the ribbon', () => {
  const { flexCopy } = loadTs('src/share/copy.ts', {});
  const c = flexCopy('standings', { tierLabel: 'Top 25%', percentile: 18, points: 960 });
  const pcts = new Set([c.ribbon, c.title, c.big, c.bigLabel, c.stat].filter(Boolean).join(' ').match(/\d+%/g));
  assert.deepEqual([...pcts], ['18%']);
  assert.equal(c.ribbon, 'TOP HUNTER!');
  // A plain tier name still leads the ribbon, and the podium is unchanged.
  assert.equal(flexCopy('standings', { tierLabel: 'Hunter', percentile: 30, points: 10 }).ribbon, 'HUNTER!');
  assert.equal(flexCopy('standings', { tierLabel: 'Top 25%', percentile: 80, points: 10 }).ribbon, 'TOP 25%!');
  assert.equal(flexCopy('standings', { tierLabel: 'Podium', rank: 2, percentile: 1, points: 1840 }).ribbon, 'PODIUM!');
});

test('the story bottom band is a sea floor of shipped art and flat shapes, with no words or QR', () => {
  const card = src('src/share/FlexCard.tsx');
  const sea = card.slice(card.indexOf('export const SEA ='), card.indexOf('function Bubble'));
  assert.match(card, /export const SEA = \{ back: (\d+), front: (\d+), sand: (\d+) \} as const;/);
  const [, back] = card.match(/export const SEA = \{ back: (\d+)/);
  assert.ok(Number(back) * 3 > 1440, 'the water starts below the safe line');
  assert.doesNotMatch(sea, /<Text|Outlined|qr/i);
  assert.match(sea, /share\/props\/coin-pile\.webp/);
  assert.match(sea, /share\/props\/treasure\.webp/);
  for (const m of sea.matchAll(/top: (\d+)/g)) assert.ok(Number(m[1]) * 3 >= 1440, `sea piece at y ${m[1]} pt`);
});

test('the square prize card uses two columns: the dressed shark on the stage, the tile with its label beside the words', () => {
  const card = src('src/share/FlexCard.tsx');
  assert.match(card, /return prize \? <PrizeSquare \{\.\.\.props\} prize=\{prize\} \/> : <PlainSquare \{\.\.\.props\} \/>;/);
  assert.match(card, /\{prize === 'member' \? 'MEMBER GIFT' : 'SHARK PASS'\}/);
  assert.match(src('src/share/stage.ts'), /export const SQUARE_PRIZE_SHARK_H = 250;/);
});

test('Whack and Memory story pictures show the player\'s own shark peeking over the card', () => {
  const frame = src('src/share/StoryShareFrame.tsx');
  assert.match(frame, /<FlexShark inventory=\{player\?\.inventory\} height=\{peek\.shark\} prop=\{null\} \/>/);
  assert.match(frame, /paddingTop: SLOT_PAD \+ peek\.reserve/, 'the card gives up only the headroom the shark lacks');
  assert.match(src('src/games/whack/ui/ShareCard.tsx'), /campaign="whack" withShark>/);
  assert.equal(src('src/games/memory/MemoryExtras.tsx').match(/campaign="memory" withShark>/g).length, 2, 'preview and capture match');
});

test('Android shares put the line with the link on the clipboard and say so on the sheet', () => {
  const cap = src('src/share/capture.ts');
  assert.match(cap, /const androidAfterYes = async \(\) => \{\n\s*if \(message\) await Clipboard\.setStringAsync\(message\)\.catch\(\(\) => undefined\);/);
  assert.match(cap, /dialogTitle: androidShareTitle\(message\) \}, name, androidAfterYes\)/, 'the copy waits for the grown-up');
  assert.match(cap, /dialogTitle: androidShareTitle\(message\)/);
  assert.match(cap, /return message \? 'Share \(the link is copied too\)' : 'Share';/);
});

test('the release share walk routes exist only behind EXPO_PUBLIC_SHARE_WALK, and the box preview closes', () => {
  const routes = src('src/devRoutes.tsx');
  assert.match(routes, /: process\.env\.EXPO_PUBLIC_SHARE_WALK === '1'\n\s*\? \[/);
  assert.match(routes, /process\.env\.EXPO_PUBLIC_SHARE_WALK === '1' \? 'SharePicturesPreview' : null;/);
  assert.match(src('src/screens/SharePicturesPreviewScreen.tsx'), /onDone=\{\(\) => navigation\.goBack\(\)\}/);
});

/* ------------------------------------------------------------- wave 3 round 3 */

const lookBounds = loadTs('src/share/lookBounds.ts', {});
const stageMod = loadTs('src/share/stage.ts', { './lookBounds': lookBounds });
const PROD = 'https://assets.themeparkshark.com/mobile/production/assets';
const GHOST = {
  head_item: { paper_url: `${PROD}/oQi4oC4uE8tVRBP97LkCag19XCDCt4O6BLg04bwf.png` },
  body_item: { paper_url: `${PROD}/sOubrLKHE8xVFwmWtG7xiHsd2IayiuZpzgnb3TQO.png` },
  hand_item: { paper_url: `${PROD}/2IPHn8UVfl5hHN2wdayZWq8ZiqZTEmKwnMv5pkIn.png` },
};
const TEE = { body_item: { paper_url: `${PROD}/WwCOXJ7rMpwaUGjQwvG0TDNEW2EC4sdQwQZskaVC.png` } };

test('no contact shadow pill on any share shark (it floated beside the words as a grey bar)', () => {
  const shark = src('src/share/FlexShark.tsx');
  assert.doesNotMatch(shark, /rgba\(5,52,110,0\.22\)/);
  assert.doesNotMatch(shark, /styles\.shadow\b/);
  assert.doesNotMatch(shark, /^\s*shadow: \{/m);
});

test('a dressed look knows how wide its paint reaches: the ghost costume and blaster are wide, a tee is not', () => {
  const { lookExtent, BODY_EXTENT, paperKey, WIDE_PAPERS } = lookBounds;
  assert.equal(paperKey(`${PROD}/sOubrLKHE8xVFwmWtG7xiHsd2IayiuZpzgnb3TQO.png?v=2`), 'sOubrLKHE8xVFwmWtG7xiHsd2IayiuZpzgnb3TQO');
  const ghost = lookExtent(GHOST);
  assert.equal(ghost.left, 0, 'the ghost sheet reaches the paper edge');
  assert.ok(ghost.right >= 0.89, 'the blaster reaches past the tail');
  assert.equal(lookExtent(TEE), BODY_EXTENT);
  assert.equal(lookExtent(null), BODY_EXTENT);
  // A paper new to the catalog counts as wide until it is measured (round 4 fix 4).
  assert.deepEqual(lookExtent({ body_item: { paper_url: `${PROD}/not-in-the-table.png` } }), lookBounds.UNKNOWN_EXTENT);
  for (const [key, [l, r]] of Object.entries(WIDE_PAPERS)) {
    assert.match(key, /^[A-Za-z0-9]{40}$/);
    assert.ok(l >= 0 && r <= 1 && l < r && (l < 0.17 || r > 0.83), `${key} is really wider than the body`);
  }
});

test('the prize stays readable under any costume: the paint covers only the tile\'s edge band on Story', () => {
  const { storyStage, PRIZE_EDGE } = stageMod;
  assert.equal(PRIZE_EDGE, 0.27);
  for (const look of [lookBounds.BODY_EXTENT, lookBounds.lookExtent(GHOST), { left: 0, right: 1 }]) {
    for (const room of [150, 190, 230]) {
      for (const lift of [18, 36]) {
        const z = storyStage(room, 320, lift, look);
        const w = z.shark * 1353 / 1530;
        const paintL = z.sharkLeft + w * look.left;
        const paintR = z.sharkLeft + w * look.right;
        // The tile's art box is its middle 0.76: at least 80% of it stays clear of the paint.
        const artL = z.tileLeft + z.tile * 0.12;
        const artR = z.tileLeft + z.tile * 0.88;
        const covered = Math.max(0, artR - Math.max(artL, paintL)) / (artR - artL);
        assert.ok(covered <= 0.2 + 0.01, `look ${look.left}-${look.right} room ${room}: ${Math.round(covered * 100)}% of the prize art covered`);
        assert.ok(paintL < z.tileLeft + z.tile, 'the shark still stands in front of the tile frame');
        assert.ok(paintR <= 320 + 1, 'the whole look stays on the card');
      }
    }
  }
  assert.match(src('src/share/FlexCard.tsx'), /storyStage\(box\.h, box\.w, lift, lookExtent\(inventory\), stickerW\)/);
});

test('square cards: the kicker sits 8 pt or more below the tile on every square, and the shark is a third of the card', () => {
  const { squareStage, prizeSquareShark, SQUARE_PRIZE_COL } = stageMod;
  for (const h of [96, 110, 124, 140, 170]) {
    for (const showShark of [true, false]) {
      const z = squareStage(h, 320, showShark);
      const lip = Math.ceil(z.tile * 0.04) + 1;
      // The words row starts at the stage bottom plus its 8 pt margin.
      assert.ok(h + 8 >= z.tileTop + z.tile + lip + 8, `h ${h}: kicker top ${h + 8} vs tile bottom ${z.tileTop + z.tile + lip}`);
      assert.ok(z.tileTop >= 6, 'the tile clears the ribbon tails');
    }
  }
  const z = squareStage(124, 320, true);
  const painted = z.shark * 1353 / 1530 * 0.64;
  assert.ok(painted / 360 >= 0.3, `the square shark's paint is ${Math.round(painted / 3.6)}% of the card`);
  for (const look of [lookBounds.BODY_EXTENT, lookBounds.lookExtent(GHOST)]) {
    const g = squareStage(124, 320, true, look);
    const w = g.shark * 1353 / 1530;
    assert.ok(g.sharkLeft + w * look.right <= 320 + 16, 'the tail stays inside the frame');
    assert.ok(g.sharkLeft + w * look.left >= g.tileLeft + g.tile * (1 - 0.27) - 1, 'the square shark never covers the prize art');
    // Prize square: the paint stays in its column (4 pt in from the card edge, 4 pt past the column).
    const p = prizeSquareShark(180, look);
    const pw = p.shark * 1353 / 1530;
    assert.ok(p.left + pw * look.left >= -16 - 1, 'never off the card');
    assert.ok(p.left + pw * look.right <= SQUARE_PRIZE_COL + 4 + 1, 'never over the prize tile');
  }
  // Every square kicker is outlined like the story kicker (red on beige read badly).
  const card = src('src/share/FlexCard.tsx');
  assert.equal((card.match(/<Outlined text=\{copy\.kicker\}[^>]*outline=\{kickerOutline\(frame\)\}/g) || []).length, 3, 'story, plain square and prize square');
  assert.doesNotMatch(card, /<Text style=\{\[styles\.kickerSmall/);
  assert.match(card, /prop=\{null\} pin=\{chestPin\} \/>\s*<\/Animated\.View>\s*\)\}\s*<\/>/, 'no prop on the square: the dressed shark is the co-star');
});

test('the Memory story card stays big: the peeking shark is drawn outside its scale and the hat stays below the safe line', () => {
  const frameMod = loadTs('src/share/StoryShareFrame.tsx', {
    react: { forwardRef: f => f, useState: v => [v, () => {}], useContext: () => ({}) }, 'react/jsx-runtime': { jsx() { return null; }, jsxs() { return null; } },
    'react-native': { StyleSheet: { create: s => s }, View: 'View' }, './campaignQr': { QR_BY_CAMPAIGN: {} },
    '../context/AuthProvider': { AuthContext: {} }, './FlexShark': { FlexShark: 'FlexShark', SHARK_ASPECT: 1353 / 1530 },
    './FlexCard': { STORY_SAFE: { top: 80, bottom: 160 }, STORY_FOOTER_BOTTOM: 164, STORY_BODY_BOTTOM: 236, STORY_RIBBON_W: 188 },
    './formats': { FLEX_SIZE: { story: { width: 360, height: 640 } } }, './frames': { FRAMES: { common: { bg: ['#1aa3f0', '#0768b9'] } } },
  });
  const { peekLayout, PEEK } = frameMod;
  // The slot: below the ribbon (80 + 48 pt) down to the footer (640 - 236 pt).
  const slotY = 128, slotH = 640 - 236 - 128;
  const ASPECT = 1353 / 1530;
  for (const look of [lookBounds.BODY_EXTENT, lookBounds.lookExtent(GHOST)]) {
    const mem = peekLayout(slotY, slotH, 300, 268, true, look);
    assert.ok(mem.scale >= 0.85, `Memory card scale ${mem.scale.toFixed(2)}`);
    const whack = peekLayout(slotY, slotH, 205, 196, true, look);
    assert.equal(whack.scale, 1);
    for (const p of [mem, whack]) {
      const w = p.shark * ASPECT;
      assert.ok(p.sharkTop + p.shark * 0.1 >= 80 - 0.5, 'the hat stays below the safe line (y 240 px)');
      assert.ok(p.sharkLeft + w * look.left >= 20 + 188 + 6 - 0.5, 'the paint starts right of the ribbon (never over its words)');
      assert.ok(p.sharkLeft + w * look.right <= 336 + 0.5, 'the shark stays on the card');
      assert.ok(p.sharkLeft + w * look.right <= p.cardRight + 20 + 0.5, 'its paint ends just past the card corner, so its feet land on it');
      assert.ok(p.sharkTop + p.shark * 0.82 > p.cardTop, 'its feet come over the card edge');
      assert.ok(p.shark <= PEEK.h && p.shark >= 100, `shark ${p.shark}`);
    }
  }
  assert.equal(peekLayout(slotY, slotH, 300, 268, false).reserve, 0);
  const frameSrc = src('src/share/StoryShareFrame.tsx');
  assert.match(frameSrc, /<View style=\{withShark && styles\.ribbonLeft\}><Ribbon/, 'with a shark the ribbon sits left');
  assert.match(frameSrc, /peekLayout\(slot\.y, slot\.h, card\.w, card\.h, withShark, lookExtent\(player\?\.inventory\)\)/);
  const memSrc = src('src/games/memory/MemoryExtras.tsx');
  assert.match(memSrc, /storySide: \{ alignItems: 'center', paddingTop: 30, gap: 6 \}/, 'the card keeps its top-right corner clear for the shark');
});

test('the Shark Pass proof sample uses the real Snowflake Beanie art, and the ghost look renders on demand', () => {
  const samples = src('src/share/samples.ts');
  assert.match(samples, /const SNOWFLAKE_BEANIE = require\('\.\.\/\.\.\/assets\/images\/sharkpass\/snowflake-beanie\.webp'\)/);
  assert.match(samples, /s\('find-sharkpass', 'find', \{ itemName: 'Snowflake Beanie', artUrl: SNOWFLAKE_BEANIE,[\s\S]{0,160}inventory: wearingPin\(SNOWFLAKE_BEANIE\)/);
  assert.match(src('src/screens/ShareStudioPreviewScreen.tsx'), /process\.env\.EXPO_PUBLIC_SHARE_STUDIO_LOOK === 'ghost' \? GHOST_INVENTORY : SAMPLE_INVENTORY/);
  for (const f of ['src/share/stage.ts', 'src/share/lookBounds.ts', 'src/share/StoryShareFrame.tsx', 'src/games/memory/MemoryExtras.tsx', 'src/share/samples.ts']) {
    assert.doesNotMatch(src(f), new RegExp(String.fromCharCode(0x2014)), `${f}: no em dashes`);
  }
});

/* ------------------------------------------------------------- wave 3 round 4 */

const { flexCopy: copyOf } = loadTs('src/share/copy.ts', {});
const ASPECT4 = 1353 / 1530;
/** Every sample's big number and label, plus the longest numbers and labels any card prints. */
const STICKERS = [
  ['7', 'RIDE COINS'], ['6', 'HAUNTS SURVIVED'], ['7/10', 'IN THE SET'], ['3%', 'OF PLAYERS HAVE ONE'], ['4%', 'OF PLAYERS HAVE IT'],
  ['LV 10', null], ['TOP 18%', 'OF ALL PLAYERS'], ['#2', 'THIS WEEK'], ['37', 'HAUNTS SURVIVED'], ['x4', 'TIMES THROUGH'],
  ['75%', "OF THIS PARK'S COINS"], ['14', 'DAYS IN A ROW'], ['12/12', 'COLLECTED'], ['KO!', null], ['100/100', 'IN THE SET'],
];
/** Every wide outfit in the catalog, the body, the ghost look and an outfit the tables do not know yet. */
const LOOKS = () => [lookBounds.BODY_EXTENT, lookBounds.lookExtent(GHOST), lookBounds.UNKNOWN_EXTENT,
  ...Object.values(lookBounds.WIDE_PAPERS).map(([l, r]) => ({ left: Math.min(0.18, l), right: Math.max(0.82, r) }))];

test('story stat sticker: on every look, room and number it sits 4 pt or more inside the card (never cut off)', () => {
  const { storyStage, stickerWidth, STICKER_TILT, CARD_INSET, STICKER_MAX_W } = stageMod;
  assert.equal(CARD_INSET, 16, 'the hero box sits 20 pt in from the card: 16 of it, and 4 pt stay clear');
  let checked = 0;
  for (const [big, label] of STICKERS) {
    const sw = stickerWidth(big, label);
    assert.ok(sw >= 44 && sw <= STICKER_MAX_W, `${big}: box ${sw}`);
    for (const look of LOOKS()) {
      for (const room of [130, 150, 190, 230]) {
        for (const lift of [18, 36]) {
          const z = storyStage(room, 320, lift, look, sw);
          const paintL = z.stickerLeft - STICKER_TILT;
          assert.ok(paintL >= -CARD_INSET - 0.5, `${big} look ${look.left}-${look.right} room ${room}: sticker paint at ${paintL} (card edge -20)`);
          const w = z.shark * ASPECT4;
          assert.ok(z.sharkLeft + w * look.right <= 320 + 1, `${big}: the whole look stays on the card`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 1000);
  // The ghost park day and fright night stories that clipped in round 3.
  for (const [big, label] of [['7', 'RIDE COINS'], ['6', 'HAUNTS SURVIVED']]) {
    const z = storyStage(150, 320, 36, lookBounds.lookExtent(GHOST), stickerWidth(big, label));
    assert.ok(z.stickerLeft - STICKER_TILT >= -16, `${big}: on the card`);
  }
});

test('story prize: the stat sticker plus the shark paint cover 20% or less of the prize art, on every look', () => {
  const { storyStage, stickerWidth, STICKER_TILT, PRIZE_EDGE, TILE_BAND } = stageMod;
  assert.equal(TILE_BAND, 0.12);
  // The prize kinds' real numbers (Golden Hour 7/10, Golden Churro 3%, Rocket 3/8), plus the longest.
  for (const [big, label] of [['7/10', 'IN THE SET'], ['3%', 'OF PLAYERS HAVE ONE'], ['3/8', 'IN THE SET'], ['100/100', 'IN THE SET']]) {
    const sw = stickerWidth(big, label);
    for (const look of LOOKS()) {
      for (const room of [130, 150, 190, 230]) {
        for (const lift of [18, 36]) {
          const z = storyStage(room, 320, lift, look, sw);
          const w = z.shark * ASPECT4;
          const artL = z.tileLeft + z.tile * TILE_BAND;
          const artR = z.tileLeft + z.tile * (1 - TILE_BAND);
          const art = artR - artL;
          // The sticker's painted right edge (its -6deg tilt adds STICKER_TILT) and the shark's front.
          const stickerR = z.stickerLeft + sw + STICKER_TILT;
          const paintL = z.sharkLeft + w * look.left;
          const bySticker = Math.max(0, Math.min(artR, stickerR) - artL) / art;
          const byShark = Math.max(0, artR - Math.max(artL, paintL)) / art;
          assert.ok(bySticker <= 0.01, `${big}: sticker covers ${Math.round(bySticker * 100)}% of the art`);
          assert.ok(bySticker + byShark <= 0.2 + 0.01, `${big} look ${look.left}-${look.right} room ${room}: ${Math.round((bySticker + byShark) * 100)}% of the prize art covered`);
          assert.ok(stickerR > z.tileLeft, 'the sticker still overlaps the tile frame (it belongs to the tile)');
          assert.ok(paintL < z.tileLeft + z.tile && z.tileLeft + z.tile - paintL <= z.tile * PRIZE_EDGE + 1);
        }
      }
    }
  }
  // The card copy really prints these numbers.
  assert.equal(copyOf('find', { itemName: 'Giant Dragon Plush', artUrl: 'x', rarity: 5, goldenHour: true, setName: 'Souvenirs', setFound: 7, setTotal: 10 }).big, '7/10');
  const card = src('src/share/FlexCard.tsx');
  assert.match(card, /const stickerW = look \? 0 : stickerWidth\(copy\.big, copy\.bigLabel\);/);
  assert.match(card, /left: stage\.stickerLeft, top: stage\.tileTop, width: stickerW, height: stage\.tile/);
  assert.match(card, /marginRight: STICKER_TILT - Math\.floor\(size\.tile \* TILE_BAND\)/, 'no shark: the sticker stands beside the tile the same way');
  assert.doesNotMatch(card, /storyBig: \{ left: -22/);
});

test('the look card: 3 pieces are 64 pt or more on a sky blue fill, and the paint keeps clear of the tiles and the 3/3 sticker', () => {
  const { lookStage, LOOK_BIG_COL, LOOK_ROW_GAP } = stageMod;
  const card = src('src/share/FlexCard.tsx');
  assert.match(card, /sharkH=\{size\.look\} tile=\{72\} room=\{box\.h\} width=\{box\.w\}/);
  assert.match(card, /export const LOOK_TILE_FILL = \['#e3f4ff', '#b5ddff'\] as const;/);
  for (const look of LOOKS()) {
    // The story look hero measures about 220 pt (the w3r4 render: 66 pt tiles at a 76 pt pitch).
    for (const room of [218, 230, 250]) {
      const z = lookStage(room, 320, 3, 232, 72, look);
      assert.ok(z.tile >= 64, `room ${room}: piece tile ${z.tile}`);
      assert.ok(3 * z.tile + 2 * z.gap <= room, 'the three tiles fit the hero');
      const w = z.shark * ASPECT4;
      // Row: tiles, gap, paper (margins tuck its clear sides), gap, sticker column.
      const paint = w * (look.right - look.left);
      assert.ok(Math.abs((w + z.marginLeft + z.marginRight) - paint) <= 1, 'only the clear sides tuck away');
      assert.ok(z.tile + LOOK_ROW_GAP + paint + LOOK_ROW_GAP + LOOK_BIG_COL <= 320 + 1, `look ${look.left}-${look.right}: the row fits, the paint never meets the 3/3`);
    }
  }
  // Square keeps its smaller pieces, still bigger than before.
  assert.ok(lookStage(150, 320, 3, 196, 44).tile >= 40);
});

test('lookBounds knows every catalog paper: wide ones by extent, the rest by name, and the measuring tool is in the repo', () => {
  const { NARROW_PAPERS, WIDE_PAPERS, lookExtent, BODY_EXTENT, UNKNOWN_EXTENT } = lookBounds;
  const narrow = NARROW_PAPERS.split(' ');
  assert.equal(narrow.length, 298);
  assert.equal(Object.keys(WIDE_PAPERS).length, 47);
  for (const k of narrow) assert.match(k, /^[A-Za-z0-9]{10}$/);
  assert.equal(new Set(narrow).size, narrow.length);
  for (const k of Object.keys(WIDE_PAPERS)) assert.ok(!narrow.includes(k.slice(0, 10)), `${k} is in one list only`);
  // The sample look (tee, shades, camera) is narrow; the witch hat is too; an unknown paper is wide.
  for (const key of ['WwCOXJ7rMpwaUGjQwvG0TDNEW2EC4sdQwQZskaVC', '63Z80KzmnLJLLZOO3xolJ0IMkd0tnYirHzOjiCPe', 'EIbKxOUH3iQftK6iTkGzXaQtir5hOz94AqVqdaBp', 'oQi4oC4uE8tVRBP97LkCag19XCDCt4O6BLg04bwf']) {
    assert.equal(lookExtent({ head_item: { paper_url: `${PROD}/${key}.png` } }), BODY_EXTENT, key);
  }
  assert.deepEqual(lookExtent({ hand_item: { paper_url: `${PROD}/BrandNewCostume0000000000000000000000000.png` } }), UNKNOWN_EXTENT);
  assert.ok(UNKNOWN_EXTENT.left <= 0.01 && UNKNOWN_EXTENT.right >= 0.94);
  const tool = src('tools/share-studio/measure-look-bounds.py');
  assert.match(tool, /--check/);
  assert.match(tool, /NARROW_PAPERS = '/);
  assert.match(tool, /ALPHA = 24/);
});

test('the link goes on the clipboard only after the grown-up says yes (a Not now changes nothing)', async () => {
  const studio = src('src/share/ShareStudioHost.tsx');
  const shareBody = studio.slice(studio.indexOf('const share = useCallback'), studio.indexOf('const offscreen ='));
  assert.equal((shareBody.match(/Clipboard\.setStringAsync/g) || []).length, 1);
  assert.ok(shareBody.indexOf('Clipboard.setStringAsync') > shareBody.indexOf('captureFlex('), 'no copy before the picture and the gate');
  assert.match(shareBody, /openShareSheet\(uri, shareMessage\(link\), flexCopy\(request\.kind, request\.payload\)\.title, copyLink\)/);
  for (const os of ['ios', 'android']) {
    for (const yes of [false, true]) {
      const order = [];
      const external = loadTs('src/services/external.ts', {
        'expo-file-system': { cacheDirectory: 'file:///cache/', readDirectoryAsync: async () => [], deleteAsync: async () => undefined,
          makeDirectoryAsync: async () => undefined, copyAsync: async () => undefined },
        'expo-sharing': { isAvailableAsync: async () => true, shareAsync: async () => { order.push('sheet'); } },
        'expo-web-browser': { openBrowserAsync: async () => undefined },
        'react-native': { Platform: { OS: os }, Linking: {}, Share: { sharedAction: 'sharedAction', dismissedAction: 'dismissedAction',
          share: async () => { order.push('sheet'); return { action: 'sharedAction' }; } } },
        '../components/GrownUpGate': { askGrownUp: async () => { order.push('gate'); return yes; } },
      });
      const afterYes = async () => { order.push('copy'); };
      if (os === 'ios') await external.shareExternal({ url: 'file:///tmp/a.jpg', message: 'm' }, undefined, 'Golden Churro', afterYes);
      else await external.shareFileExternal('file:///tmp/a.jpg', undefined, 'Golden Churro', afterYes);
      assert.deepEqual(order, yes ? ['gate', 'copy', 'sheet'] : ['gate'], `${os} yes=${yes}`);
    }
  }
  // A failing copy never blocks the sheet.
  const order = [];
  const external = loadTs('src/services/external.ts', {
    'expo-file-system': { cacheDirectory: 'file:///cache/', readDirectoryAsync: async () => [], deleteAsync: async () => undefined,
      makeDirectoryAsync: async () => undefined, copyAsync: async () => undefined },
    'expo-sharing': { isAvailableAsync: async () => true, shareAsync: async () => undefined },
    'expo-web-browser': { openBrowserAsync: async () => undefined },
    'react-native': { Platform: { OS: 'ios' }, Linking: {}, Share: { sharedAction: 'sharedAction', dismissedAction: 'dismissedAction',
      share: async () => { order.push('sheet'); return { action: 'dismissedAction' }; } } },
    '../components/GrownUpGate': { askGrownUp: async () => true },
  });
  await external.shareExternal({ url: 'file:///tmp/a.jpg' }, undefined, 'X', async () => { throw new Error('clipboard'); });
  assert.deepEqual(order, ['sheet']);
});
