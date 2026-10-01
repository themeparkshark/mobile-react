'use strict';
// Play together (L3): "Who's in line?", pass-and-play turns, family mode,
// crew recap and share card. Pure rules run from real source in a VM.
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs, read } = require('./helpers/load-ts.cjs');

const plain = value => JSON.parse(JSON.stringify(value));
const G = loadTs('src/services/lineplay/lineGroup.ts');

function play(group, results) {
  for (const result of results) {
    group = result === 'skip' ? G.skipGroupTurn(group) : G.recordGroupTurn(group, result[0], result[1]);
  }
  return group;
}
const launch = (gameId, extra = {}) => ({ activityId: `mg-${gameId}`, gameId, seed: 4242, difficulty: 2, ...extra });

test('who is in line: kinds, sizes, local names and kid flags', () => {
  const solo = G.createLineGroup('solo', [{ name: 'Dustin' }, { name: 'extra' }]);
  assert.equal(solo.players.length, 1);
  assert.equal(G.isPassAndPlay(solo), false);

  const couple = G.createLineGroup('couple', [{ name: 'Ana' }, { name: 'Ben' }, { name: 'Cal' }]);
  assert.deepEqual(plain(couple.players.map(p => p.name)), ['Ana', 'Ben']);
  assert.equal(G.isPassAndPlay(couple), true);
  assert.equal(couple.players.some(p => p.kid), false, 'only family mode has kid rounds');

  const family = G.createLineGroup('family', [{ name: '  Mom ' }, { name: 'Maya', kid: true }, { name: '', kid: true }]);
  assert.deepEqual(plain(family.players.map(p => p.name)), ['Mom', 'Maya', 'Player 3']);
  assert.deepEqual(plain(family.players.map(p => p.kid)), [false, true, true]);
  assert.equal(G.hasKids(family), true);
  assert.deepEqual(plain([0, 1, 2].map(i => G.defaultKidFlag(i, 'family'))), [false, true, true]);
  assert.equal(G.defaultKidFlag(1, 'friends'), false);

  const friends = G.createLineGroup('friends', Array.from({ length: 9 }, (_, i) => ({ name: `F${i}` })));
  assert.equal(friends.players.length, G.MAX_GROUP_PLAYERS);
  assert.deepEqual(plain(G.groupSizeRange('couple')), { min: 2, max: 2 });
  assert.equal(G.defaultGroupSize('family'), 4);
});

test('names are cleaned, capped and never collide on the hand-off screen', () => {
  assert.equal(G.cleanPlayerName('  Maya\n\tRose  ', 'x'), 'Maya Rose');
  assert.equal(G.cleanPlayerName('A'.repeat(40), 'x').length, G.MAX_NAME_LENGTH);
  assert.equal(G.cleanPlayerName('   ', 'Player 2'), 'Player 2');
  assert.equal(G.cleanPlayerName(42, 'Player 2'), 'Player 2');
  const group = G.createLineGroup('friends', [{ name: 'Sam' }, { name: 'sam' }, { name: 'Jo' }]);
  assert.deepEqual(plain(group.players.map(p => p.name)), ['Sam', 'sam 2', 'Jo']);
  assert.equal(new Set(group.players.map(p => p.id)).size, 3);
});

test('a round passes the phone once per player and the first seat rotates', () => {
  let group = G.createLineGroup('friends', [{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
  group = G.startGroupRound(group, launch('tap'));
  assert.equal(G.currentTurn(group).player.name, 'A');
  assert.equal(G.currentTurn(group).total, 3);
  assert.equal(G.startGroupRound(group, launch('memory')), group, 'one round at a time');
  group = G.recordGroupTurn(group, 2, 900);
  assert.equal(G.currentTurn(group).player.name, 'B');
  assert.equal(G.currentTurn(group).number, 2);
  group = play(group, [[3, 1500], [1, 300]]);
  assert.equal(group.active, null);
  assert.equal(group.rounds.length, 1);
  assert.equal(G.currentTurn(group), null);
  group = G.startGroupRound(group, launch('shark'));
  assert.equal(G.currentTurn(group).player.name, 'B', 'round two starts with the next seat');
  assert.equal(group.active.seed, 4242, 'every arcade turn plays the same board');
});

test('bonus-proof games stay with the phone owner; solo never starts a round', () => {
  assert.equal(G.isPassAndPlayGame('current'), false);
  assert.equal(G.isPassAndPlayGame('showdown'), false);
  for (const id of ['tap', 'timing', 'memory', 'trivia', 'shark', 'banana']) assert.equal(G.isPassAndPlayGame(id), true);
  const duo = G.createLineGroup('couple', [{ name: 'A' }, { name: 'B' }]);
  assert.equal(G.startGroupRound(duo, launch('current')).active, null);
  const solo = G.createLineGroup('solo', [{ name: 'A' }]);
  assert.equal(G.startGroupRound(solo, launch('tap')).active, null);
});

test('family mode: kid turns play simpler rounds, grown-ups keep the real one', () => {
  const round = { gameId: 'trivia', difficulty: 3 };
  assert.deepEqual(plain(G.turnGame(round, false)), { gameId: 'trivia', difficulty: 3, kidRound: false });
  assert.deepEqual(plain(G.turnGame(round, true)), { gameId: 'memory', difficulty: 0, kidRound: true });
  assert.deepEqual(plain(G.turnGame({ gameId: 'timing', difficulty: 2 }, true)), { gameId: 'memory', difficulty: 0, kidRound: true });
  assert.deepEqual(plain(G.turnGame({ gameId: 'tap', difficulty: 3 }, true)), { gameId: 'tap', difficulty: 1, kidRound: true });
  assert.deepEqual(plain(G.turnGame({ gameId: 'banana', difficulty: 3 }, true)), { gameId: 'banana', difficulty: 1, kidRound: true });
  assert.equal(G.kidRoundNote({ gameId: 'trivia', difficulty: 2 }), 'Kid round: 4 quick picture pairs');
  assert.equal(G.kidRoundNote({ gameId: 'shark', difficulty: 2 }), 'Kid round: easy Sharky Swim');

  let group = G.createLineGroup('family', [{ name: 'Mom' }, { name: 'Leo', kid: true }]);
  group = G.startGroupRound(group, launch('trivia'));
  assert.equal(G.currentTurn(group).kidRound, false);
  group = G.recordGroupTurn(group, 1, 200);
  const kid = G.currentTurn(group);
  assert.equal(kid.player.name, 'Leo');
  assert.equal(kid.gameId, 'memory');
  group = G.recordGroupTurn(group, 3, 800);
  const podium = G.roundPodium(group, G.lastRound(group));
  assert.equal(podium[0].player.name, 'Leo', 'stars are fair across kid and grown-up rounds');
  assert.equal(podium[0].kidRound, true);
  assert.equal(group.rounds[0].results[1].gameId, 'memory');
});

test('a player who steps away is skipped without counting against them', () => {
  let group = G.createLineGroup('friends', [{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
  group = G.startGroupRound(group, launch('memory'));
  group = play(group, [[2, 500], 'skip', [2, 700]]);
  const podium = G.roundPodium(group, G.lastRound(group));
  assert.deepEqual(plain(podium.map(e => [e.player.name, e.place, e.skipped])), [['C', 1, false], ['A', 2, false], ['B', 3, true]]);
  const standings = G.groupStandings(group);
  const b = standings.find(row => row.player.name === 'B');
  assert.equal(b.turns, 0);
  assert.equal(b.award, 'Line Cheerleader');

  // Everyone skipped: nothing to recap, nothing stored.
  let empty = G.startGroupRound(G.createLineGroup('couple', [{ name: 'A' }, { name: 'B' }]), launch('tap'));
  empty = play(empty, ['skip', 'skip']);
  assert.equal(empty.rounds.length, 0);
  assert.equal(G.groupRecap(empty), null);
});

test('ending a round early keeps the turns already played', () => {
  let group = G.createLineGroup('friends', [{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
  group = G.startGroupRound(group, launch('tap'));
  group = G.recordGroupTurn(group, 3, 1200);
  group = G.endGroupRound(group);
  assert.equal(group.active, null);
  assert.equal(group.rounds[0].results.length, 1);
  assert.equal(G.endGroupRound(group), group);
});

test('podium ties share a place; score breaks ties only on the same game', () => {
  let group = G.createLineGroup('friends', [{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
  group = G.startGroupRound(group, launch('tap'));
  group = play(group, [[2, 900], [2, 900], [2, 950]]);
  assert.deepEqual(plain(G.roundPodium(group, G.lastRound(group)).map(e => [e.player.name, e.place])), [['C', 1], ['A', 2], ['B', 2]]);

  let family = G.createLineGroup('family', [{ name: 'Mom' }, { name: 'Leo', kid: true }]);
  family = G.startGroupRound(family, launch('trivia'));
  family = play(family, [[2, 50], [2, 9000]]);
  assert.deepEqual(plain(G.roundPodium(family, G.lastRound(family)).map(e => e.place)), [1, 1],
    'a kid Memory score never outranks a grown-up trivia score');
});

test('standings, awards and the crew recap headline', () => {
  let group = G.createLineGroup('family', [{ name: 'Mom' }, { name: 'Maya', kid: true }, { name: 'Dad' }]);
  group = G.startGroupRound(group, launch('tap'));
  group = play(group, [[3, 1500], [2, 400], [1, 300]]);
  group = G.startGroupRound(group, launch('memory'));
  // Round two starts with the next seat: Maya (kid Memory sprint), Dad, Mom.
  group = play(group, [[3, 900], [3, 950], [1, 500]]);
  const standings = G.groupStandings(group);
  assert.deepEqual(plain(standings.map(row => [row.player.name, row.stars, row.place])),
    [['Maya', 5, 1], ['Mom', 4, 2], ['Dad', 4, 2]]);
  assert.equal(standings[0].award, 'Line Champ');
  assert.equal(standings.find(r => r.player.name === 'Mom').roundWins, 1);
  assert.equal(standings.find(r => r.player.name === 'Dad').roundWins, 1, 'same game: the higher score wins the tie');
  assert.equal(standings.find(r => r.player.name === 'Dad').award, 'Memory Ace');
  assert.equal(standings.find(r => r.player.name === 'Mom').award, 'Whack Ace');
  const recap = G.groupRecap(group);
  assert.equal(recap.headline, 'Maya is the Line Champ');
  assert.equal(recap.roundsPlayed, 2);
  assert.equal(recap.turnsPlayed, 6);
  assert.deepEqual(plain(recap.champions.map(p => p.name)), ['Maya']);

  let tie = G.createLineGroup('couple', [{ name: 'Ana' }, { name: 'Ben' }]);
  tie = play(G.startGroupRound(tie, launch('tap')), [[2, 1], [2, 1]]);
  assert.equal(G.groupRecap(tie).headline, 'A perfect tie. Everyone shares the crown');
  let three = G.createLineGroup('friends', [{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
  three = play(G.startGroupRound(three, launch('tap')), [[3, 1], [3, 1], [1, 1]]);
  assert.equal(G.groupRecap(three).headline, 'A and B share the crown');
  assert.equal(G.groupRecap(G.createLineGroup('solo', [{ name: 'A' }])), null);
});

test('honest wait line: the sign vs the real wait', () => {
  assert.equal(G.waitLine(38.4, 60), 'Sign said 60. Real wait 38 min.');
  assert.equal(G.waitLine(0.2, 45), 'Sign said 45. Real wait 1 min.');
  assert.equal(G.waitLine(22, null), 'Real wait 22 min');
  assert.equal(G.waitLine(22, 0), 'Real wait 22 min');
});

test('persisted crews are validated, and the next ride keeps names but not results', () => {
  let group = G.createLineGroup('family', [{ name: 'Mom' }, { name: 'Leo', kid: true }]);
  group = G.startGroupRound(group, launch('tap'));
  group = G.recordGroupTurn(group, 2, 10);
  assert.equal(G.isLineGroup(plain(group)), true);
  const next = G.crewForNextRide(group);
  assert.deepEqual(plain(next.players), plain(group.players));
  assert.equal(next.rounds.length, 0);
  assert.equal(next.active, null);
  for (const bad of [null, {}, { ...plain(group), version: 2 }, { ...plain(group), kind: 'party' },
    { ...plain(group), players: [] },
    { ...plain(group), players: [group.players[0], group.players[0]] },
    { ...plain(group), active: { ...plain(group.active), order: ['p9'] } },
    { ...plain(group), active: { ...plain(group.active), results: [{ playerId: 'p1', stars: 7, gameId: 'tap', skipped: false, kidRound: false }] } }]) {
    assert.equal(G.isLineGroup(bad), false);
  }
});

test('the crew store is per wait, local only, and offers today\'s crew again', async () => {
  const data = new Map();
  const storage = {
    getItem: async key => data.has(key) ? data.get(key) : null,
    setItem: async (key, value) => { data.set(key, value); },
  };
  const store = loadTs('src/services/lineplay/lineGroupStore.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: storage },
    './lineGroup': G,
  });
  const key = store.lineGroupWaitKey(77, 1700000000123.4);
  assert.equal(key, '77:1700000000123');
  assert.deepEqual(plain(await store.loadWaitGroup(5, key)), { chosen: false, group: null });

  const solo = G.createLineGroup('solo', [{ name: 'Me' }]);
  await store.saveWaitGroup(5, key, solo);
  assert.equal((await store.loadWaitGroup(5, key)).chosen, true);
  assert.equal(await store.loadLastCrew(5), null, 'solo never becomes the offered crew');
  assert.equal((await store.loadWaitGroup(5, '77:1')).chosen, false, 'a new wait asks again');

  const crew = G.recordGroupTurn(G.startGroupRound(G.createLineGroup('couple', [{ name: 'Ana' }, { name: 'Ben' }]), launch('tap')), 3, 5);
  await store.saveWaitGroup(5, key, crew);
  const restored = await store.loadWaitGroup(5, key);
  assert.equal(restored.group.active.results.length, 1, 'a restart mid-round comes back to the same hand-off');
  const last = await store.loadLastCrew(5);
  assert.deepEqual(plain(last.players.map(p => p.name)), ['Ana', 'Ben']);
  assert.equal(last.active, null);
  assert.equal(await store.loadLastCrew(5, Date.now() + store.LAST_CREW_TTL_MS + 1000), null, 'yesterday\'s crew expires');
  assert.equal(await store.loadLastCrew(6), null, 'per account');

  data.set('lineplay_group_session_v1:5', '{broken');
  assert.deepEqual(plain(await store.loadWaitGroup(5, key)), { chosen: false, group: null });
  const failing = loadTs('src/services/lineplay/lineGroupStore.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => { throw new Error('x'); }, setItem: async () => { throw new Error('x'); } } },
    './lineGroup': G,
  });
  await failing.saveWaitGroup(5, key, crew);
  assert.equal(await failing.loadLastCrew(5), null);
});

test('controller helpers: next game wraps the playlist and the leader line', () => {
  const stub = new Proxy({}, { get: () => () => null });
  const ctrl = loadTs('src/screens/LinePlay/group/useGroupPlay.tsx', {
    react: { useCallback: f => f, useEffect: () => undefined, useMemo: f => f(), useState: v => [v, () => undefined] },
    'expo-haptics': stub,
    '../../../services/lineplay/lineGroup': G,
    '../../../services/lineplay/lineGroupStore': { lineGroupWaitKey: () => 'k' },
    '../../../services/lineplay/useLineGroup': { useLineGroup: () => ({}) },
    './WhosInLineSheet': { __esModule: true, default: 'WhosInLineSheet' },
    './PassPhoneOverlay': { __esModule: true, default: 'PassPhoneOverlay' },
    './GroupStrip': { __esModule: true, default: 'GroupStrip' },
    './GroupRecapCard': { __esModule: true, default: 'GroupRecapCard', seatMap: () => ({}) },
  });
  const pages = [
    { kind: 'chapter_intro', id: 'intro' },
    { kind: 'minigame', id: 'm1', gameId: 'tap', seed: 1 },
    { kind: 'minigame', id: 'm2', gameId: 'current', seed: 2 },
    { kind: 'lore', id: 'l1', seed: 3 },
    { kind: 'minigame', id: 'm3', gameId: 'memory', seed: 4 },
  ];
  assert.equal(ctrl.nextGroupGame(pages, 'm1').id, 'm3', 'skips owner-only bonus games');
  assert.equal(ctrl.nextGroupGame(pages, 'm3').id, 'm1', 'wraps around');
  assert.equal(ctrl.nextGroupGame(pages, 'gone').id, 'm1');
  assert.equal(ctrl.nextGroupGame(pages.slice(0, 1), 'm1'), null);

  let group = G.createLineGroup('couple', [{ name: 'Ana' }, { name: 'Ben' }]);
  assert.equal(ctrl.leaderLine(group), null);
  group = play(G.startGroupRound(group, launch('tap')), [[3, 1], [1, 1]]);
  assert.equal(ctrl.leaderLine(group), 'Ana leads with 3 stars');
  group = play(G.startGroupRound(group, launch('tap')), [[3, 1], [1, 1]]);
  assert.equal(ctrl.leaderLine(group), 'Tied at the top with 4 stars');
});

test('LinePlay routes crew games through pass-and-play without a new reward path', () => {
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(screen, /groupPlayRef\.current\?\.wantsRound\(item\)\) \{ groupPlayRef\.current\.startRound\(item\); return; \}/);
  assert.match(screen, /onClose: groupTurn \? \(\) => finishTurn\(0\) : handleGameDone/);
  assert.match(screen, /difficulty=\{activeGame\.kidRound \? 0 : undefined\}/);
  assert.match(screen, /\{groupPlay\.overlays\}/);
  const controller = read('src/screens/LinePlay/group/useGroupPlay.tsx');
  // Same launch and the same star report as solo; no client grant of any kind.
  assert.match(controller, /session\.beginGame\(item\)/);
  assert.match(controller, /if \(!turn\.kidRound\) session\.recordGameResult\(round\.gameId, stars\)/);
  for (const file of ['src/services/lineplay/lineGroup.ts', 'src/services/lineplay/lineGroupStore.ts',
    'src/screens/LinePlay/group/useGroupPlay.tsx', 'src/screens/LinePlay/group/GroupRecapCard.tsx']) {
    const source = read(file);
    assert.doesNotMatch(source, /redeem|claimBonus|addParts|apiClient|axios|fetch\(/i, `${file} stays local and grants nothing`);
  }
});

test('play-together copy has no em dashes or emoji, and the share card carries no ride name', () => {
  const files = ['src/services/lineplay/lineGroup.ts', 'src/screens/LinePlay/group/WhosInLineSheet.tsx',
    'src/screens/LinePlay/group/PassPhoneOverlay.tsx', 'src/screens/LinePlay/group/GroupStrip.tsx',
    'src/screens/LinePlay/group/GroupRecapCard.tsx', 'src/screens/LinePlay/group/GroupShareCard.tsx',
    'src/screens/LinePlay/group/useGroupPlay.tsx', 'src/screens/LinePlay/group/PlayerBadge.tsx'];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /—/, `${file} em dash`);
    assert.doesNotMatch(source, /[\u{1F300}-\u{1FAFF}☀-➿]/u, `${file} emoji`);
  }
  const card = read('src/screens/LinePlay/group/GroupShareCard.tsx');
  assert.doesNotMatch(card, /ride_?name|rideName/i);
});
