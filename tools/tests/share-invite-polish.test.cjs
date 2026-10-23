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
  assert.match(friends, /shareExternal\(\{ message: `Play Theme Park Shark with me!\$\{name \? ` Add my shark: \$\{name\}` : ''\}\\n\$\{INVITE_URL\}` \}\)/);
});

test('a shared ride card never prints the typed note, and is story size with the link and QR', () => {
  const card = src('src/components/RideTracker/ShareableRideCard.tsx');
  assert.doesNotMatch(card, /ride\.note/, 'the typed note stays in the log');
  assert.match(card, /captureFlex\(storyRef, 'story'\)/, 'captured at story size (1080x1920)');
  assert.match(card, /\.\.\.FLEX_SIZE\.story/);
  assert.match(card, /QR_BY_CAMPAIGN\.ride_log/);
  assert.match(card, /\{SHARE_LINK_DISPLAY\}/);
  assert.doesNotMatch(card, /react-native-view-shot/);
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
  assert.ok(campaigns.length >= 7);
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
  assert.match(gate, /<GateShowWatchdog shown=\{shownRef\} onNeverShown=\{\(\) => close\(false\)\} \/>/, 'never shown means no, never yes');
  assert.match(gate, /setTimeout\(\(\) => \{ if \(!shown\.current\) onNeverShown\(\); \}, GATE_SHOW_WATCHDOG_MS\)/);
});
