'use strict';
/** Social v2: the bell and Friends (model, store, and the regressions found in the audit). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const model = loadTs('src/screens/social/socialModel.ts');

test('status: server value first, then the legacy flags, then none', () => {
  assert.equal(model.statusOf({ id: 1, friend_status: 'outgoing', is_friend: true }), 'outgoing');
  assert.equal(model.statusOf({ id: 1, is_friend: true }), 'friends');
  assert.equal(model.statusOf({ id: 1, has_friend_request_from: true }), 'incoming');
  assert.equal(model.statusOf({ id: 1, friend_status: 'weird' }), 'none');
  assert.equal(model.statusOf({ id: 1 }, 'friends'), 'friends', 'a list can say what its rows are');
  const overrides = new Map([[1, 'friends']]);
  assert.equal(model.effectiveStatus({ id: 1, friend_status: 'incoming' }, overrides), 'friends', 'a fresh answer wins');
});

test('one button per relationship, short words, spoken sentences', () => {
  const kinds = ['friends', 'incoming', 'outgoing', 'blocked', 'none'].map(s => model.friendButton(s));
  assert.deepEqual(kinds.map(k => k.kind), ['friends', 'answer', 'asked', 'blocked', 'add']);
  for (const k of kinds) assert.ok(k.label.length <= 8, `${k.label} is short enough to read at a glance`);
  assert.equal(model.friendButton('outgoing').a11y('Finn'), 'You asked Finn. Tap to take it back');
});

test('answers move the status the way the server does', () => {
  assert.equal(model.nextStatus('none', 'add'), 'outgoing');
  assert.equal(model.nextStatus('incoming', 'add'), 'friends', 'adding someone who asked you is a yes');
  assert.equal(model.nextStatus('outgoing', 'add'), 'outgoing', 'a second tap never changes anything');
  assert.equal(model.nextStatus('incoming', 'accept'), 'friends');
  assert.equal(model.nextStatus('incoming', 'decline'), 'none');
  assert.equal(model.nextStatus('outgoing', 'cancel'), 'none');
  assert.equal(model.nextStatus('friends', 'remove'), 'none');
  assert.equal(model.nextStatus('friends', 'block'), 'blocked');
  assert.equal(model.nextStatus('blocked', 'unblock'), 'none');
});

const row = (over = {}) => ({ id: 'n1', created_at: '2026-10-02T20:00:00Z', read_at: null, content: { message: 'x', image: null, route: null }, ...over });

test('kind comes from the server, or from the stored row on older servers', () => {
  assert.equal(model.kindOf(row({ kind: 'prize' })), 'prize');
  const legacy = msg => model.kindOf(row({ content: { message: msg, image: null } }));
  assert.equal(legacy('BubbleBuddy has sent you a friend request.'), 'friend_request');
  assert.equal(legacy('Finn has accepted your friend request.'), 'friend_accepted');
  assert.equal(legacy('Finn complimented your outfit and sent you 5 Coins!'), 'compliment');
  assert.equal(legacy('Finn replied to your thread.'), 'reply');
  assert.equal(legacy('Kraken is attacking!'), 'news');
  assert.equal(model.kindOf(row({ content: { message: 'You have reached 4 park coins', image: 'https://x/images/park_coin_milestone_reached.png' } })), 'park_coins');
  for (const kind of Object.keys(model.KIND_LOOK)) assert.ok(model.KIND_LOOK[kind].tint && model.KIND_LOOK[kind].color, kind);
});

test('friend rows speak kid: short, warm, the name first', () => {
  const ask = row({ kind: 'friend_request' });
  assert.equal(model.kidMessage(ask, 'BubbleBuddy has sent you a friend request.'), 'BubbleBuddy wants to be your friend!');
  assert.equal(model.kidMessage(row({ kind: 'friend_accepted' }), 'Finn has accepted your friend request.'), "Finn said yes! You're friends now.");
  assert.equal(model.kidMessage(row({ kind: 'news' }), 'Kraken is attacking!'), 'Kraken is attacking!');
  assert.equal(model.kidMessage(ask, 'Something new from the server'), 'Something new from the server', 'unknown copy is shown as stored');
  assert.equal(model.kidMessage(ask, 'BubbleBuddy has sent you a friend request.', 'friends'), 'You and BubbleBuddy are friends now!', 'answered Yes: one true line');
});

test('a friend request can be answered in the bell only while it is still waiting', () => {
  const ask = over => row({ kind: 'friend_request', actor_id: 34, ...over });
  const none = new Map();
  assert.equal(model.canAnswerInline(ask({ friend_status: 'incoming' }), none), true);
  assert.equal(model.canAnswerInline(ask({ friend_status: 'friends' }), none), false, 'already friends: no buttons');
  assert.equal(model.canAnswerInline(ask({ friend_status: 'incoming' }), new Map([[34, 'friends']])), false, 'answered here');
  assert.equal(model.canAnswerInline(ask({ friend_status: null, read_at: '2026-10-01' }), none), false, 'older server, read row');
  assert.equal(model.canAnswerInline(row({ kind: 'compliment', actor_id: 34 }), none), false);
  assert.equal(model.actorOf(row({ kind: 'compliment', content: { message: 'm', route: { screen: 'User', params: { user: '12' } } } })), 12);
  assert.equal(model.actorOf(row({ kind: 'news', content: { message: 'm', route: { screen: 'User', params: { user: 12 } } } })), null);
});

test('Today, This week, Earlier: strictly newest first, and unread counts on the header', () => {
  const now = Date.parse('2026-10-03T18:00:00');
  const at = h => new Date(now - h * 3600_000).toISOString();
  const items = [row({ id: 'old', created_at: at(24 * 20), read_at: null }), row({ id: 'a', created_at: at(1) }),
    row({ id: 'wk', created_at: at(24 * 3), read_at: '2026-10-01' }), row({ id: 'b', created_at: at(0.2), read_at: '2026-10-03' })];
  const shape = rows => rows.map(r => (r.type === 'header' ? `[${r.label} ${r.count}]` : r.item.id)).join(' ');
  assert.equal(shape(model.sectionize(items, new Set(), now)), '[Today 1] b a [This week 0] wk [Earlier 1] old');
  assert.equal(shape(model.sectionize(items, new Set(['a']), now)), '[Today 0] b a [This week 0] wk [Earlier 1] old', 'a row read here stays in place');
  assert.equal(shape(model.sectionize([], new Set(), now)), '');
});

test('older years get their own header, so the list always reads newest first (Dustin: Mar 27, Feb 13 ... Jun 1, Apr 25)', () => {
  const now = Date.parse('2026-10-04T12:00:00');
  // Server order is created_at desc already; the client re-sorts anyway (paged merges).
  const items = [
    row({ id: 'jun25', created_at: '2025-06-01T20:50:57Z' }), row({ id: 'mar26', created_at: '2026-03-27T22:54:22Z' }),
    row({ id: 'feb26', created_at: '2026-02-13T10:02:25Z' }), row({ id: 'apr25', created_at: '2025-04-25T13:43:32Z' }),
    row({ id: 'dec24', created_at: '2024-12-27T22:07:23Z' }),
  ];
  const shape = rows => rows.map(r => (r.type === 'header' ? `[${r.label}]` : r.item.id)).join(' ');
  assert.equal(shape(model.sectionize(items, new Set(), now)), '[Earlier] mar26 feb26 [2025] jun25 apr25 [2024] dec24');
  assert.equal(shape(model.sectionize([row({ id: 'bad', created_at: 'not a date' })], new Set(), now)), '[Earlier] bad', 'a bad date never makes a 1970 section');
  assert.equal(shape(model.sectionize([row({ id: 'bad', created_at: '' }), row({ id: 'y24', created_at: '2024-05-01T10:00:00Z' })], new Set(), now)), '[Earlier] bad [2024] y24', 'Earlier always sits above the years');
  assert.equal(model.rewardCoins('finn complimented your outfit and sent you 5 Coins!'), 5);
  assert.equal(model.rewardCoins('You have reached 50 park coins for Epic Universe!'), 0, 'a milestone is not a gift');
  assert.equal(model.shortAgo('2025-06-01T20:50:57Z', now), 'Jun 1, 2025', 'another year names the year');
  assert.match(model.shortAgo('2026-03-27T22:54:22Z', now), /^Mar 2[78]$/, 'this year stays short');
});

test('the player name leads a row in bold, system rows stay whole', () => {
  assert.deepEqual(plain(model.leadName('finn replied to your thread.', 'reply')), { lead: 'finn', rest: ' replied to your thread.' });
  assert.deepEqual(plain(model.leadName('You and finn are friends now!', 'friend_request')), { lead: '', rest: 'You and finn are friends now!' });
  assert.deepEqual(plain(model.leadName('You have reached 50 park coins!', 'park_coins')), { lead: '', rest: 'You have reached 50 park coins!' });
  assert.deepEqual(plain(model.leadName('[icon:coin] bonus', 'compliment')), { lead: '', rest: '[icon:coin] bonus' });
});

test('every notification badge is bundled, centred art on an even ring (no server tile, no lip crescent)', () => {
  const src = read('src/components/Notification.tsx') + read('src/components/notificationBadgeArt.ts');
  assert.match(read('src/context/NotificationProvider.tsx'), /warmBadgeArt\(\)/, 'the bell art is decoded before the bell opens');
  for (const kind of Object.keys(model.KIND_LOOK)) {
    assert.match(src, new RegExp(`\\b${kind}: (require|ICON_SOURCES)`), `${kind} has bundled badge art`);
    assert.ok(model.KIND_LOOK[kind].tint, `${kind} has a soft badge fill`);
  }
  const badge = /\n  badge: \{([^}]*)\}/.exec(src)[1];
  assert.doesNotMatch(badge, /borderBottomWidth/, 'one even ring: a thicker bottom border showed as a coloured crescent');
  assert.doesNotMatch(src, /content\?\.image/, 'the off-centre server tiles are never drawn');
  for (const kind of ['compliment', 'park_coins', 'reply', 'friend_request', 'friend_accepted']) {
    assert.ok(fs.existsSync(path.join(root, `assets/images/screens/notifications/badges/${kind}.png`)), kind);
  }
});

test('Notifications and Friends sit on the shared clean background, not the water art', () => {
  for (const file of ['src/screens/NotificationsScreen.tsx', 'src/screens/FriendsScreen.tsx']) {
    const src = read(file);
    assert.match(src, /<CleanScreenBackground>/, file);
    assert.doesNotMatch(src, /shark_background|SocialBackdrop|tone="onBlue"/, file);
  }
  assert.match(read('src/components/CleanScreenBackground.tsx'), /CLEAN_SCREEN_BG = '#EAF3FB'/);
});

test('paging never duplicates a row that shifted pages', () => {
  const merged = model.mergePage([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]);
  assert.deepEqual(plain(merged).map(r => r.id), ['a', 'b', 'c']);
});

test('ages are short and spoken in words', () => {
  const now = Date.parse('2026-10-02T20:00:00Z');
  const ago = s => new Date(now - s * 1000).toISOString();
  assert.equal(model.shortAgo(ago(20), now), 'now');
  assert.equal(model.shortAgo(ago(5 * 60), now), '5m');
  assert.equal(model.shortAgo(ago(3 * 3600), now), '3h');
  assert.equal(model.shortAgo(ago(2 * 86400), now), '2d');
  assert.equal(model.shortAgo(ago(15 * 86400), now), '2w');
  assert.match(model.shortAgo(ago(60 * 86400), now), /^[A-Z][a-z]{2} \d+$/);
  assert.equal(model.spokenAgo(ago(3600), now), '1 hour ago');
  assert.equal(model.spokenAgo(ago(7200), now), '2 hours ago');
  assert.equal(model.shortAgo(null, now), '');
});

test('stored routes reach the right screen', () => {
  assert.deepEqual(plain(model.resolveRoute({ screen: 'User', params: { user: 9 } })), { screen: 'Player', params: { user: 9, player: 9 } });
  assert.deepEqual(plain(model.resolveRoute({ screen: 'Park', params: { park: 2, user: 9 } })), { screen: 'Park', params: { park: 2, user: 9, player: 9 } });
  assert.deepEqual(plain(model.resolveRoute({ screen: 'Inventory' })), { screen: 'Inventory', params: {} });
  assert.equal(model.resolveRoute(null), null);
});

test('Friends opens on Requests when someone is waiting; search says how many letters are left', () => {
  assert.equal(model.initialTab(undefined, 3), 'requests');
  assert.equal(model.initialTab(undefined, 0), 'friends');
  assert.equal(model.initialTab('find', 3), 'find');
  assert.equal(model.searchHint('co'), 'Type 1 more letter');
  assert.equal(model.searchHint('c'), 'Type 2 more letters');
  assert.equal(model.searchHint('coa'), null);
  assert.equal(model.searchHint(''), null);
});

test('the social store shares answers and the waiting count, and only emits on change', () => {
  const store = loadTs('src/screens/social/socialStore.ts', { react: { useSyncExternalStore: () => null, createContext: value => ({ value }) } });
  let emits = 0;
  const off = store.subscribe(() => { emits += 1; });
  store.setStatus(5, 'friends');
  store.setStatus(5, 'friends');
  assert.equal(emits, 1);
  const snapshot = store.getOverrides();
  store.setStatus(6, 'none');
  assert.notEqual(store.getOverrides(), snapshot, 'a new snapshot, so React re-renders');
  store.adjustPendingIncoming(-1);
  assert.equal(store.getPendingIncoming(), null, 'unknown stays unknown');
  store.setPendingIncoming(2);
  store.adjustPendingIncoming(-1);
  store.adjustPendingIncoming(-5);
  assert.equal(store.getPendingIncoming(), 0, 'never below zero');
  // A new-friend moment plays once, only on the surface that made it, and only briefly.
  store.markJustFriended(9, 'tab-requests', 1000);
  assert.equal(store.takeJustFriended(9, 'tab-friends', 1100), false, 'a hidden tab never steals it');
  assert.equal(store.takeJustFriended(9, 'tab-requests', 1200), true);
  assert.equal(store.takeJustFriended(9, 'tab-requests', 1300), false, 'once');
  store.markJustFriended(9, 'bell', 1000);
  assert.equal(store.takeJustFriended(9, 'bell', 5000), false, 'too late: a recycled row does not replay it');
  // Hearts are per signed-in player and per local day.
  store.setHearted(5, 34, true, new Date(2026, 9, 3, 10));
  assert.equal(store.wasHearted(5, 34, new Date(2026, 9, 3, 20)), true);
  assert.equal(store.wasHearted(5, 34, new Date(2026, 9, 4, 8)), false, 'a new day');
  store.setHearted(5, 34, true, new Date(2026, 9, 4, 8));
  assert.equal(store.wasHearted(6, 34, new Date(2026, 9, 4, 9)), false, 'another account on this device');
  store.resetSocialStore();
  assert.equal(store.getOverrides().size, 0);
  off();
});

test('audit regressions stay fixed in the screens', () => {
  const rowSrc = read('src/components/Notification.tsx');
  assert.doesNotMatch(rowSrc, /useState<boolean>\(!!notification\.read_at\)/, 'B3: a recycled row kept the last item\'s read flag');
  assert.match(rowSrc, /readonly unread: boolean/);
  assert.doesNotMatch(rowSrc, /Swipeable/, 'B14: no swipe that deletes with no undo');
  assert.match(rowSrc, /actor_avatar_url/, 'the actor\'s own shark with a kind sticker');
  const screen = read('src/screens/NotificationsScreen.tsx');
  assert.match(screen, /if \(!hasMore \|\| paging === 'busy'\) return;/, 'B13: paging stops at the last page');
  assert.match(screen, /action: \{ label: 'Undo', onPress: restore \}/, 'press and hold clears with Undo');
  assert.match(screen, /isUnread\(item, readRef\.current\)/, 'stable callbacks read through refs');
  assert.match(screen, /markRead\(item\);\n\s*const target = resolveRoute/, 'B14: navigate without waiting on the network');
  const friends = read('src/screens/FriendsScreen.tsx');
  assert.match(friends, /getSentFriendRequests/, 'B10: a sent request can be taken back');
  assert.match(friends, /useTutorialWhenReady\('friends', listReady\)/);
  const rows = read('src/screens/social/PlayerRow.tsx');
  assert.match(rows, /actions\.decline\(me\)/, 'B10: requests can be answered No');
  assert.doesNotMatch(rows, /actions\.remove/, 'remove lives on the profile, not one mis-tap away');
  const profile = read('src/screens/PlayerScreen.tsx');
  // RC: the profile page keeps profile-v2's layout (Loading state="error"), with Social v2's behaviour.
  assert.match(profile, /state="error"[^>]*onRetry/, 'B18: a failed profile can retry');
  assert.match(profile, /loadSeq/, '#22: a reused screen loads the new player and ignores an older answer');
  assert.match(profile, /\}, \[player\]\);/, '#22: the load reruns when the player changes');
  assert.match(profile, /Block \$\{currentPlayer\.screen_name\} too\?/, 'report offers Block too');
  assert.doesNotMatch(profile, /Alert\.alert|explore\/base\.png/, 'B18: game dialogs and real art');
  assert.match(profile, /actions\.block/);
});

test('round 3: Find tells the truth, asks a grown-up, and never nudges discovery', () => {
  const friends = read('src/screens/FriendsScreen.tsx');
  assert.match(friends, /Sharks can't search for you\./);
  assert.match(friends, /Sharks can find you by part of your name\./);
  assert.match(friends, /else setGate\(true\);/, 'turning it on needs the grown-up gate');
  assert.match(friends, /if \(saving\.current\) return;/, 'no racing toggles');
  assert.doesNotMatch(friends, /Turn on Let sharks find me/, 'never suggest turning discovery on');
  assert.match(friends, /Share your shark name!/);
});

test('round 3: strangers see Friends only, Block and Unblock have their own art, a No collapses', () => {
  const profile = read('src/screens/PlayerScreen.tsx');
  assert.match(profile, /Friends only/);
  assert.match(profile, /friends\/block\.png/);
  assert.match(profile, /ICON_SOURCES\.retry/);
  assert.match(profile, /equalChoices: true/);
  const bell = read('src/screens/NotificationsScreen.tsx');
  const row = read('src/components/Notification.tsx');
  assert.match(row, /request_sticker\.png/);
  assert.match(row, /useHop\(burst\)/);
});

test('round 4: a real grown-up gate, honest Off copy, rows leave inside the cell', () => {
  const { numberWords, makeProblem, recordMiss, recordPass, gateLockedFor, resetGate, MAX_MISSES, LOCK_MS } = loadTs('src/screens/social/GrownUpGate.tsx', {
    react: { useEffect() {}, useMemo: f => f(), useRef: v => ({ current: v }), useState: v => [v, () => {}] },
    'react/jsx-runtime': { jsx() {}, jsxs() {}, Fragment: 'F' },
    'react-native': { StyleSheet: { create: v => v } }, 'react-native-reanimated': {}, '../../gamekit/Haptics': {}, '../../gamekit/SFX': {},
    '../../ui/GameIcon': {}, '../../ui/tokens': { BRAND: {}, FONT: {} }, '../../ui/useUiReducedMotion': {}, './SocialKit': {},
  });
  assert.equal(numberWords(7), 'seven');
  assert.equal(numberWords(40), 'forty');
  assert.equal(numberWords(47), 'forty-seven');
  // Every sum carries (ones digits add to 10+) and stays two-digit plus two-digit.
  let seed = 1;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 2000; i++) {
    const p = makeProblem(rand);
    const m = /^([a-z-]+) plus ([a-z-]+)$/.exec(p.text);
    assert.ok(m, p.text);
    const toN = w => { const W = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
      const T = ['', '', 'twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
      const [t, o] = w.split('-'); return T.includes(t) && T.indexOf(t) > 1 ? T.indexOf(t) * 10 + (o ? W.indexOf(o) : 0) : W.indexOf(t); };
    const a = toN(m[1]), b = toN(m[2]);
    assert.equal(a + b, p.answer, p.text);
    assert.ok((a % 10) + (b % 10) >= 10, `no carry in ${p.text}`);
    assert.ok(a >= 10 && b >= 10, p.text);
  }
  // Three wrong answers lock the gate for 60 s; a pass resets the count.
  resetGate();
  assert.equal(MAX_MISSES, 3); assert.equal(LOCK_MS, 60000);
  assert.equal(recordMiss(1000), false); assert.equal(recordMiss(1000), false);
  assert.equal(gateLockedFor(1000), 0);
  assert.equal(recordMiss(1000), true);
  assert.equal(gateLockedFor(1000), 60);
  assert.equal(gateLockedFor(61000), 0);
  recordMiss(70000); recordPass(); recordMiss(70000); recordMiss(70000);
  assert.equal(gateLockedFor(70000), 0, 'a pass resets the miss count');
  const gate = read('src/screens/social/GrownUpGate.tsx');
  assert.match(gate, /setRound\(r => r \+ 1\)/, 'a new sum after every miss');
  assert.match(gate, /const HOLD_MS = 3000/);
  assert.match(gate, /label="Keep it off" tone="gold"/, 'Keep it off is the primary button');
  const friends = read('src/screens/FriendsScreen.tsx');
  assert.match(friends, /grown_up_confirmed: true/);
  assert.match(friends, /or taps you on a leaderboard or post, can still ask/);
  assert.doesNotMatch(friends, /LayoutAnimation/, 'LayoutAnimation does not animate FlashList cells on the new architecture');
  assert.match(friends, /leaving: leavingAs\(p, 'incoming'\)/, 'a refused row is drawn frozen, never as Add');
  const bell = read('src/screens/NotificationsScreen.tsx');
  assert.doesNotMatch(bell, /LayoutAnimation/);
  assert.match(bell, /<LeavingRow leaving=\{declined\}/);
  assert.match(bell, /const extraData = useMemo/);
  const kit = read('src/screens/social/SocialKit.tsx');
  assert.match(kit, /export function LeavingRow/);
});

test('round 4b: one offline mark, report reasons with pictures', () => {
  const kit = read('src/screens/social/SocialKit.tsx');
  assert.match(kit, /useEffect\(\(\) => claimOfflineMark\(\), \[\]\)/);
  const banner = read('src/components/OfflineBanner.tsx');
  assert.match(banner, /if \(!mounted( \|\| catchOpen)? \|\| markOwned\) return null;/, 'the global banner hides while a screen owns the mark');
  const conn = loadTs('src/services/connectivity.ts');
  const seen = [];
  const off = conn.onOfflineMarkOwner(v => seen.push(v));
  const a = conn.claimOfflineMark(); const b = conn.claimOfflineMark();
  assert.equal(conn.isOfflineMarkOwned(), true);
  a(); assert.equal(conn.isOfflineMarkOwned(), true, 'still owned by the second screen');
  b(); assert.equal(conn.isOfflineMarkOwned(), false);
  assert.deepEqual(seen, [true, false]);
  off();
  const profile = read('src/screens/PlayerScreen.tsx');
  assert.ok(profile.includes("{ text: 'Mean name', icon: 'edit' }, { text: 'Mean to me', image: require('../../assets/images/screens/player/report_mean.png') }, { text: 'Something else', icon: 'info' }"), 'a picture per reason; Mean to me is a storm cloud');
  assert.match(read('src/ui/GameDialog.tsx'), /icon=\{action\.icon\} image=\{action\.image\}/);
});

test('round 5: the burst stays on the left of the face and the ring stops before the words', () => {
  const src = read('src/screens/social/SocialFx.tsx');
  const fn = src.slice(src.indexOf('export function awayAngle'), src.indexOf('const PIECES'));
  const js = require(path.join(root, 'node_modules/typescript')).transpileModule(fn, { compilerOptions: { module: 1 } }).outputText;
  const mod = { exports: {} }; new Function('module', 'exports', js)(mod, mod.exports);
  for (let a = -20; a <= 20; a += 0.01) {
    const t = mod.exports.awayAngle(a);
    assert.ok(t >= Math.PI * 0.6 - 1e-9 && t <= Math.PI * 1.4 + 1e-9, `angle ${a} -> ${t}`);
    assert.ok(Math.cos(t) < 0, 'every piece moves left, away from the text column');
  }
  assert.match(src, /export const RING_MAX_SCALE = 0\.9/);
  const row = read('src/components/Notification.tsx');
  assert.doesNotMatch(row, /useLayoutEffect\(\(\) => \{\s*if \(answeredYes/, 'the burst starts in the same render as the green card');
  assert.match(row, /takeJustFriended\(actor, surface\)\) \{\s*burstFor\.current = notification\.id;/);
});
