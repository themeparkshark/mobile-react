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
  for (const kind of Object.keys(model.KIND_LOOK)) assert.ok(model.KIND_LOOK[kind].icon, kind);
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
  assert.match(profile, /<SocialError title="This profile didn't load" onRetry/, 'B18: a failed profile can retry');
  assert.match(profile, /\[player, reloadKey\]/, '#22: a reused screen loads the new player');
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
  const { numberWords, makeProblem } = loadTs('src/screens/social/GrownUpGate.tsx', {
    react: { useEffect() {}, useMemo: f => f(), useRef: v => ({ current: v }), useState: v => [v, () => {}] },
    'react/jsx-runtime': { jsx() {}, jsxs() {}, Fragment: 'F' },
    'react-native': { StyleSheet: { create: v => v } }, 'react-native-reanimated': {}, '../../gamekit/Haptics': {}, '../../gamekit/SFX': {},
    '../../ui/GameIcon': {}, '../../ui/tokens': { BRAND: {}, FONT: {} }, '../../ui/useUiReducedMotion': {}, './SocialKit': {},
  });
  assert.equal(numberWords(7), 'seven');
  assert.equal(numberWords(40), 'forty');
  assert.equal(numberWords(47), 'forty-seven');
  const seq = [0.5, 0.5];
  const p = makeProblem(() => seq.shift() ?? 0);
  assert.equal(p.answer, 53 + 19);
  assert.equal(p.text, 'fifty-three plus nineteen');
  const gate = read('src/screens/social/GrownUpGate.tsx');
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
