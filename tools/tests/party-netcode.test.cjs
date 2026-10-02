'use strict';
/**
 * Line Party netcode: clock sync, version-gated room mirror, and the PartyClient
 * round lifecycle on a virtual clock with fake HTTP and a fake Pusher socket.
 * The line is always moving: nothing here pauses a round; a backgrounded phone
 * hands its seat to its ghost and everyone else plays on.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const clock = loadTs('src/gamekit/net/ClockSync.ts');
const rs = loadTs('src/gamekit/net/roomState.ts');
const net = loadTs('src/gamekit/net/PartyClient.ts');
const sim = loadTs('src/games/party/bonkRace.ts');

// ------------------------------------------------------------ virtual world

function world({ offset = 2500 } = {}) {
  let now = 1_000_000;
  const timers = [];
  const w = {
    offset,
    now: () => now,
    serverNow: () => now + offset,
    setTimer: (fn, ms) => { const h = { at: now + Math.max(0, ms), fn, dead: false }; timers.push(h); return h; },
    clearTimer: (h) => { if (h) h.dead = true; },
    async flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); },
    async advance(ms, step = 10) {
      const end = now + ms;
      while (now < end) {
        now = Math.min(end, now + step);
        let ran = true;
        while (ran) {
          ran = false;
          timers.sort((a, b) => a.at - b.at);
          for (const t of timers) {
            if (!t.dead && t.at <= now) { t.dead = true; ran = true; t.fn(); await w.flush(); break; }
          }
        }
        await w.flush();
      }
    },
  };
  return w;
}

function snapshot(over = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111', ride_id: 194, kind: 'quick', status: 'lobby', game: 'bonk_race', capacity: 4,
    version: 1, round_no: 0, host_user_id: 7, autostart_at_ms: null, server_ms: 0,
    members: [{ id: 7, name: 'sam', avatar_url: null, team: 'blue', state: 'active', ready: false, live_score: null }],
    round: null, you: { user_id: 7, state: 'active', seat: null, submitted: false, verified_score: null, verdict: null },
    ...over,
  };
}

function roundAt(startServerMs, over = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222', round_no: 1, game: 'bonk_race', sim_version: 1, seed: 424242,
    start_at_ms: startServerMs, end_at_ms: startServerMs + 20000, duration_ms: 20000, status: 'scheduled',
    seats: [
      { seat: 0, kind: 'human', user_id: 7, name: 'sam', avatar_url: null, team: 'blue' },
      { seat: 1, kind: 'human', user_id: 9, name: 'rae', avatar_url: null, team: 'gold' },
      { seat: 2, kind: 'bot', name: 'Chomps', avatar_url: 'bot:chomps', team: null, profile: 'ace' },
      { seat: 3, kind: 'bot', name: 'Bubbles', avatar_url: 'bot:bubbles', team: null, profile: 'rookie' },
    ],
    results: null,
    ...over,
  };
}

function fakeHttp(w, handlers = {}) {
  const calls = [];
  let room = snapshot();
  const http = {
    calls,
    setRoom(r) { room = r; },
    get room() { return room; },
    async get(url) {
      calls.push(['GET', url]);
      if (url === '/party/time') return { data: { server_ms: w.serverNow() } };
      if (handlers.get) { const r = await handlers.get(url); if (r) return r; }
      return { data: { room } };
    },
    async post(url, body) {
      calls.push(['POST', url, body]);
      if (handlers.post) { const r = await handlers.post(url, body); if (r) return r; }
      if (url === '/party/play') return { data: { room } };
      if (url === '/broadcasting/auth') return { data: { auth: 'k:sig' } };
      if (url.endsWith('/submit')) {
        const score = body.partial ? 0 : body.client_score;
        return { data: { entry: { seat: 0, partial: !!body.partial, verified_score: score, verdict: 'ok', stats: {} }, room: { ...room, version: room.version + 1 } } };
      }
      return { data: { room } };
    },
  };
  return http;
}

function fakeSocket() {
  const channels = {};
  const connBinds = {};
  const socket = {
    connection: { state: 'initialized', bind: (ev, cb) => { (connBinds[ev] ||= []).push(cb); }, unbind() {} },
    subscribe(name) {
      const binds = {};
      const ch = { name, binds, whispers: [], bind: (ev, cb) => { (binds[ev] ||= []).push(cb); }, unbind() {}, trigger: (ev, d) => { ch.whispers.push([ev, d]); return true; } };
      channels[name] = ch;
      return ch;
    },
    unsubscribe(name) { delete channels[name]; },
    connect() {},
    disconnect() { socket.disconnected = true; },
    channels,
    emit(name, ev, data) { (channels[name].binds[ev] || []).forEach((cb) => cb(data)); },
    setState(current) { socket.connection.state = current; (connBinds.state_change || []).forEach((cb) => cb({ current })); },
  };
  return socket;
}

function client(w, http, socket, extra = {}) {
  const appListeners = [];
  const c = new net.PartyClient({
    http, userId: 7, now: w.now, perfNow: w.now, setTimer: w.setTimer, clearTimer: w.clearTimer,
    createSocket: socket ? () => socket : undefined,
    appState: { addEventListener: (_e, cb) => { appListeners.push(cb); return { remove() {} }; } },
    ...extra,
  });
  c.goBackground = () => appListeners.forEach((cb) => cb('background'));
  c.goInactive = () => appListeners.forEach((cb) => cb('inactive'));
  c.goActive = () => appListeners.forEach((cb) => cb('active'));
  return c;
}

async function joined(w, http, socket) {
  const c = client(w, http, socket);
  const p = c.join(194);
  await w.advance(700);
  await p;
  if (socket) socket.setState('connected');
  return c;
}

// ------------------------------------------------------------ ClockSync

test('clock sync keeps the lowest round-trip sample', () => {
  const est = clock.estimate([
    { t0: 0, server: 5100, t1: 200 }, // rtt 200, offset 5000
    { t0: 1000, server: 6010, t1: 1020 }, // rtt 20, offset 5000
    { t0: 2000, server: 7300, t1: 2400 }, // rtt 400, offset 5100 (skewed by a slow uplink)
  ]);
  assert.equal(est.rttMs, 20);
  assert.equal(est.offsetMs, 5000);
  assert.equal(clock.estimate([]), null);
  // A much worse later sample does not replace a good one until it is stale.
  const good = { offsetMs: 10, rttMs: 30, samples: 5 };
  assert.equal(clock.merge(good, { offsetMs: 200, rttMs: 400, samples: 5 }, 5000), good);
  assert.equal(clock.merge(good, { offsetMs: 200, rttMs: 400, samples: 5 }, 70000).offsetMs, 200);
});

test('ClockSync converts between device and server time', async () => {
  const w = world({ offset: -1234 });
  const c = new clock.ClockSync(async () => w.serverNow(), w.now, async () => {});
  await c.sync(3, 0);
  assert.equal(Math.round(c.offsetMs), -1234);
  assert.equal(Math.round(c.toLocal(w.serverNow() + 500)), w.now() + 500);
});

// ------------------------------------------------------------ roomState

test('snapshots are version gated and a new round clears rival telemetry', () => {
  let s = rs.initialPartyState(7);
  s = rs.applySnapshot(s, snapshot({ version: 5 }));
  assert.equal(s.room.version, 5);
  s = rs.applySnapshot(s, snapshot({ version: 3, status: 'closed' }));
  assert.equal(s.room.status, 'lobby', 'an older snapshot never moves the room backwards');
  s = rs.applyRound(s, roundAt(10));
  s = rs.applySnapshot(s, snapshot({ version: 5 }));
  assert.equal(s.room.status, 'countdown', 'a poll that was in flight does not undo a pushed round');
  s = rs.applySnapshot(s, snapshot({ version: 6 }));
  assert.equal(s.room.status, 'lobby');
  s = rs.applyRound(s, roundAt(10));
  assert.equal(s.room.status, 'countdown');
  s = rs.applyProgress(s, { u: 9, s: 300, k: 2, t: 900, r: 1 }, 1);
  s = rs.applyProgress(s, { u: 9, s: 100, k: 1, t: 400, r: 1 }, 2);
  assert.equal(s.rivals[9].score, 300, 'late whispers are dropped');
  s = rs.applyProgress(s, { u: 7, s: 999, k: 9, t: 950, r: 1 }, 3);
  assert.equal(s.rivals[7], undefined, 'own echoes are ignored');
  s = rs.applyRound(s, roundAt(10, { id: '33333333-3333-4333-8333-333333333333', round_no: 2 }));
  assert.deepEqual(plain(s.rivals), {});
  s = rs.applyRound(s, roundAt(10, { round_no: 1, status: 'finalized' }));
  assert.equal(s.room.round.round_no, 2, 'a finalize for an old round is ignored');
});

test('pushes without a private block keep the one from HTTP', () => {
  let s = rs.applySnapshot(rs.initialPartyState(7), snapshot({ version: 2, you: { user_id: 7, seat: 0 } }));
  s = rs.applySnapshot(s, { ...snapshot({ version: 3 }), you: undefined });
  assert.equal(s.room.you.seat, 0);
});

test('one sticker per player on screen, duplicates dropped', () => {
  let s = rs.initialPartyState(7);
  s = rs.applyEmote(s, { user_id: 9, emote: 'fin', at_ms: 1 }, 100);
  s = rs.applyEmote(s, { user_id: 9, emote: 'fin', at_ms: 1 }, 110);
  s = rs.applyEmote(s, { user_id: 9, emote: 'gift', at_ms: 2 }, 200);
  s = rs.applyEmote(s, { user_id: 4, emote: 'coin', at_ms: 3 }, 300);
  assert.deepEqual(plain(s.emotes.map((e) => `${e.user_id}:${e.emote}`)), ['9:gift', '4:coin']);
  s = rs.applyEmote(s, { user_id: 5, emote: 'fin', at_ms: 4 }, 300 + rs.EMOTE_TTL_MS + 10);
  assert.deepEqual(plain(s.emotes.map((e) => e.user_id)), [5]);
  assert.equal(rs.ordinal(1), '1ST');
  assert.equal(rs.placementOf(300, [500, 300, 300, 100]), 2);
});

// ------------------------------------------------------------ PartyClient

test('join syncs the clock, plays, and subscribes to the room over the socket', async () => {
  const w = world();
  const http = fakeHttp(w);
  const socket = fakeSocket();
  const c = await joined(w, http, socket);
  assert.equal(http.calls.filter(([m, u]) => u === '/party/time').length, 5);
  assert.ok(Math.abs(c.getState().clockOffsetMs - 2500) < 1);
  assert.equal(c.getState().phase, 'lobby');
  assert.equal(c.getState().connection, 'live');
  assert.ok(socket.channels['presence-party.11111111-1111-4111-8111-111111111111']);
  c.destroy();
});

test('a full round: server-timed GO, taps relative to GO, submit with the replayed score, results', async () => {
  const w = world();
  const http = fakeHttp(w);
  const socket = fakeSocket();
  const c = await joined(w, http, socket);
  const ch = 'presence-party.11111111-1111-4111-8111-111111111111';
  const start = w.serverNow() + 3500;
  const round = roundAt(start);
  http.setRoom(snapshot({ version: 3, status: 'countdown', round_no: 1, round, you: { user_id: 7, seat: 0, submitted: false } }));
  socket.emit(ch, 'round.scheduled', { round });
  assert.equal(c.getState().phase, 'countdown');
  assert.equal(Math.round(c.round.goAt), w.now() + 3500, 'GO lands on the server start time via the clock offset');

  await w.advance(3500);
  assert.equal(c.getState().phase, 'playing');
  const spawns = sim.buildTimeline(round.seed);
  const target = spawns[0];
  await w.advance(target.at + 300);
  assert.equal(c.recordTap(target.hole), target.at + 300);
  c.reportProgress(150, 1);
  assert.equal(socket.channels[ch].whispers[0][0], 'client-progress');
  assert.deepEqual(plain(socket.channels[ch].whispers[0][1]), { u: 7, s: 150, k: 1, t: target.at + 300, r: 1 });

  await w.advance(20000 - target.at);
  const submit = http.calls.find(([, u]) => u.endsWith('/submit'));
  assert.ok(submit, 'submitted at the end of the board');
  assert.deepEqual(plain(submit[2].taps), [[target.at + 300, target.hole]]);
  assert.equal(submit[2].client_score, sim.resolve(spawns, [[target.at + 300, target.hole]]).score);
  assert.equal(submit[2].partial, false);
  assert.equal(c.getState().phase, 'waiting');
  assert.equal(c.recordTap(3), null, 'no taps after the board ends');

  socket.emit(ch, 'round.finalized', { round: { ...round, status: 'finalized', results: [] } });
  assert.equal(c.getState().phase, 'results');
  c.destroy();
});

test('a Whack Rush round: sim-stamped taps (recordTapAt), clamped to the board clock, submitted with the replayed claim', async () => {
  const rush = loadTs('src/games/whack/party/whackRush.ts');
  const w = world();
  const http = fakeHttp(w);
  const socket = fakeSocket();
  const c = await joined(w, http, socket);
  const ch = 'presence-party.11111111-1111-4111-8111-111111111111';
  const round = roundAt(w.serverNow() + 3500, { game: 'whack_rush', duration_ms: 20000 });
  http.setRoom(snapshot({ version: 3, status: 'countdown', round_no: 1, round, you: { user_id: 7, seat: 0, submitted: false } }));
  socket.emit(ch, 'round.scheduled', { round });
  await w.advance(3500);
  assert.equal(c.getState().phase, 'playing');
  const board = c.round.board;
  assert.equal(board.lengthMs, 20000);
  const e = board.events.find((x) => x.kind === 0);
  await w.advance(e.emergeAt + 260);
  // The UI-thread sim stamped the bonk 20 ms ago (the event reached JS a frame later).
  assert.equal(c.recordTapAt(e.emergeAt + 240, e.hole), e.emergeAt + 240);
  // A stamp from the future is clamped to this phone's board clock (+50 ms).
  assert.equal(c.recordTapAt(e.emergeAt + 5000, 4), e.emergeAt + 310);
  await w.advance(20000);
  const submit = http.calls.find(([, u]) => u.endsWith('/submit'));
  assert.ok(submit);
  const taps = plain(submit[2].taps);
  assert.deepEqual(taps, [[e.emergeAt + 240, e.hole], [e.emergeAt + 310, 4]]);
  const claim = rush.resolve(rush.buildBoard(round.seed), taps);
  assert.equal(submit[2].client_score, claim.score);
  assert.equal(submit[2].client_hash, rush.resultHash(claim));
  assert.ok(claim.hits >= 1);
  c.destroy();
});

test('a round that arrives late still plays its full length (latency-tolerant start)', async () => {
  const w = world();
  const http = fakeHttp(w);
  const socket = fakeSocket();
  const c = await joined(w, http, socket);
  const round = roundAt(w.serverNow() - 3000); // GO was 3 s ago on the server
  socket.emit('presence-party.11111111-1111-4111-8111-111111111111', 'round.scheduled', { round });
  assert.equal(c.getState().phase, 'countdown');
  assert.equal(c.round.lateStart, true);
  assert.equal(Math.round(c.round.goAt - w.now()), net.LATE_COUNT_IN_MS);
  await w.advance(net.LATE_COUNT_IN_MS + 19000);
  assert.equal(c.getState().phase, 'playing', 'the late board gets all 20 seconds');
  await w.advance(1200);
  assert.ok(http.calls.find(([, u]) => u.endsWith('/submit')));
  c.destroy();
});

test('a round that is long gone on arrival goes straight to the ghost without holding up the room', async () => {
  const w = world();
  const http = fakeHttp(w);
  const c = await joined(w, http, fakeSocket());
  const round = roundAt(w.serverNow() - 15000);
  http.setRoom(snapshot({ version: 4, status: 'playing', round_no: 1, round }));
  c.refresh();
  await w.flush();
  await w.advance(20);
  const submit = http.calls.find(([, u]) => u.endsWith('/submit'));
  assert.deepEqual(plain(submit[2]).partial, true);
  assert.equal(submit[2].until_ms, 0);
  assert.equal(c.getState().phase, 'ghosting');
  c.destroy();
});

test('a short background is a personal HOLD: my board freezes, resumes after a quick 3-2-1, and the span is logged', async () => {
  const w = world();
  const http = fakeHttp(w);
  const socket = fakeSocket();
  const c = await joined(w, http, socket);
  const round = roundAt(w.serverNow() + 1000);
  http.setRoom(snapshot({ version: 3, status: 'countdown', round_no: 1, round }));
  socket.emit('presence-party.11111111-1111-4111-8111-111111111111', 'round.scheduled', { round });
  socket.emit('private-player.7', 'round.token', { round_id: round.id, round_token: 'tok-7' });
  await w.advance(1000 + 6000);
  c.recordTap(2);
  c.goInactive();
  await w.advance(50);
  assert.equal(c.getState().phase, 'playing', 'a Control Center peek keeps the board');
  assert.equal(c.getState().hold, null);
  c.goBackground();
  const frozenAt = c.boardTime();
  assert.equal(c.getState().hold.reason, 'background');
  await w.advance(3000);
  assert.equal(c.boardTime(), frozenAt, 'my board clock is frozen while held');
  assert.equal(c.recordTap(4), null, 'taps while held do not count');
  assert.equal(http.calls.filter(([, u]) => u.endsWith('/submit')).length, 0, 'nothing handed to the ghost inside the budget');
  c.goActive();
  await w.advance(400);
  assert.ok(c.getState().hold.resumeAt, 'the quick 3-2-1 is running');
  assert.equal(c.boardTime(), frozenAt);
  await w.advance(600);
  assert.equal(c.getState().hold, null);
  assert.ok(c.boardTime() > frozenAt && c.boardTime() < frozenAt + 200, 'the board picks up exactly where it was');
  // The round runs its full 20 s of board time, finishing later by the held time.
  await w.advance(20000 - 6100 - 200);
  assert.equal(http.calls.filter(([, u]) => u.endsWith('/submit')).length, 0);
  await w.advance(600);
  const submit = http.calls.find(([, u]) => u.endsWith('/submit'))[2];
  assert.equal(submit.partial, false);
  assert.equal(submit.round_token, 'tok-7');
  assert.equal(submit.holds.length, 1);
  assert.ok(Math.abs(submit.holds[0][0] - 6000) <= 60 && submit.holds[0][2] === 'h');
  assert.ok(submit.holds[0][1] >= 3800 && submit.holds[0][1] <= 4100, `held ${submit.holds[0][1]}`);
  const board = sim.buildTimeline(round.seed);
  assert.equal(submit.client_score, sim.resolve(board, submit.taps).score);
  assert.equal(submit.client_hash, sim.resultHash(sim.resolve(board, submit.taps)));
  assert.equal(typeof c.pause, 'undefined', 'there is no room pause in multiplayer');
  c.destroy();
});

test('over the 6 s HOLD budget my ghost takes the seat (a no contest), and nobody else ever waited', async () => {
  const w = world();
  const http = fakeHttp(w);
  const socket = fakeSocket();
  const c = await joined(w, http, socket);
  const round = roundAt(w.serverNow() + 1000);
  http.setRoom(snapshot({ version: 3, status: 'countdown', round_no: 1, round, you: { user_id: 7, round_id: round.id, round_token: 'tok-snap', submitted: false } }));
  socket.emit('presence-party.11111111-1111-4111-8111-111111111111', 'round.scheduled', { round });
  await w.advance(1000 + 5000);
  c.recordTap(1);
  c.goBackground();
  await w.advance(7000);
  const submit = http.calls.find(([, u]) => u.endsWith('/submit'));
  assert.ok(submit, 'handed to the ghost once the budget ran out');
  assert.equal(submit[2].partial, true);
  assert.equal(submit[2].stop, 'hold');
  assert.ok(Math.abs(submit[2].until_ms - 5000) <= 60);
  assert.ok(submit[2].holds[0][1] >= 6000);
  assert.equal(submit[2].round_token, 'tok-snap', 'token fetched from my own snapshot');
  assert.equal(c.getState().phase, 'ghosting');
  assert.ok(!http.calls.some(([m, u]) => m === 'POST' && /pause|hold/.test(u)), 'the room is never asked to pause');
  c.goActive();
  await w.advance(700);
  assert.equal(c.getState().phase, 'ghosting', 'back for the next round, not this one');
  c.destroy();
});

test('a manual HOLD past the budget hands over by itself; inside it, release resumes', async () => {
  const w = world();
  const http = fakeHttp(w);
  const socket = fakeSocket();
  const c = await joined(w, http, socket);
  const round = roundAt(w.serverNow() + 1000);
  http.setRoom(snapshot({ version: 3, status: 'countdown', round_no: 1, round }));
  socket.emit('presence-party.11111111-1111-4111-8111-111111111111', 'round.scheduled', { round });
  await w.advance(1000 + 2000);
  assert.equal(c.hold('manual'), true);
  assert.equal(c.hold('manual'), false, 'one hold at a time');
  await w.advance(2000);
  assert.ok(c.holdBudgetLeft() <= 4000 && c.holdBudgetLeft() >= 3900);
  c.release();
  await w.advance(1000);
  assert.equal(c.getState().hold, null);
  assert.equal(c.hold('manual'), true);
  await w.advance(4000);
  const submit = http.calls.find(([, u]) => u.endsWith('/submit'));
  assert.ok(submit && submit[2].stop === 'hold', 'budget spent: the ghost has the seat');
  const total = submit[2].holds.reduce((a, h) => a + h[1], 0);
  assert.ok(total >= 6000 && total <= 6200, `held ${total}`);
  c.destroy();
});

test('a round in a game this build cannot draw goes straight to the ghost', async () => {
  const w = world();
  const http = fakeHttp(w);
  const socket = fakeSocket();
  const c = await joined(w, http, socket);
  const round = roundAt(w.serverNow() + 3000, { game: 'mystery_game' });
  http.setRoom(snapshot({ version: 3, status: 'countdown', round_no: 1, round }));
  socket.emit('presence-party.11111111-1111-4111-8111-111111111111', 'round.scheduled', { round });
  await w.advance(100);
  assert.equal(c.getState().phase, 'ghosting');
  const submit = http.calls.find(([, u]) => u.endsWith('/submit'));
  assert.equal(submit[2].partial, true);
  assert.equal(submit[2].until_ms, 0);
  const play = http.calls.find(([, u]) => u === '/party/play');
  assert.deepEqual(plain(play[2].games), ['bonk_race', 'trivia_sprint', 'whack_rush', 'lagoon_dash', 'parade_sprint'], 'the server only rotates in games this build can play');
  c.destroy();
});

test('friends keep their screen names across broadcasts; strangers stay park aliases', () => {
  let s = rs.initialPartyState(7);
  s = rs.applySnapshot(s, snapshot({ version: 2, you: { user_id: 7, known: { 7: 'sam_real', 9: 'rae_friend' } } }));
  // A broadcast snapshot (no private block) must not erase what this phone may show.
  s = rs.applySnapshot(s, snapshot({ version: 3, you: undefined }));
  assert.equal(rs.displayName(s, 9, 'Coral Fin 42'), 'rae_friend');
  assert.equal(rs.displayName(s, 11, 'Sunny Wave 17'), 'Sunny Wave 17');
});

test('socket down: HTTP polling keeps the room moving, and a reconnect resyncs', async () => {
  const w = world();
  const http = fakeHttp(w);
  const socket = fakeSocket();
  const c = await joined(w, http, socket);
  socket.setState('unavailable');
  assert.equal(c.getState().connection, 'polling');
  const before = http.calls.filter(([m, u]) => m === 'GET' && u.startsWith('/party/rooms/')).length;
  await w.advance(5200);
  const polls = http.calls.filter(([m, u]) => m === 'GET' && u.startsWith('/party/rooms/')).length - before;
  assert.ok(polls >= 4, `polled ${polls} times in 5 s`);
  http.setRoom(snapshot({ version: 9, status: 'lobby' }));
  socket.setState('connected');
  await w.flush();
  assert.equal(c.getState().connection, 'live');
  assert.equal(c.getState().room.version, 9);
  c.destroy();
});

test('leaving the line (geofence or boarding) wraps up cleanly', async () => {
  const w = world();
  const http = fakeHttp(w, {
    post: async (url) => {
      if (url.endsWith('/heartbeat')) {
        throw { response: { status: 409, data: { code: 'LEFT_QUEUE', message: 'Have a great ride!', room: snapshot({ version: 12 }) } } };
      }
      return null;
    },
  });
  const socket = fakeSocket();
  const c = await joined(w, http, socket);
  await w.advance(10100);
  assert.equal(c.getState().phase, 'left');
  assert.equal(c.getState().leftReason, 'left_queue');
  assert.equal(socket.disconnected, true);
  c.destroy();
});

test('a refused join surfaces the server code', async () => {
  const w = world();
  const http = fakeHttp(w, { post: async (url) => { if (url === '/party/play') throw { response: { status: 403, data: { code: 'NOT_IN_QUEUE', message: 'Line Party opens once you are in this ride\'s line.' } } }; return null; } });
  const c = client(w, http, null);
  const p = c.join(194);
  await w.advance(700);
  await p;
  assert.equal(c.getState().phase, 'error');
  assert.equal(c.getState().error.code, 'NOT_IN_QUEUE');
  c.destroy();
});

test('submits survive a flaky network with backoff and are idempotent on the server', async () => {
  const w = world();
  let failures = 2;
  const http = fakeHttp(w, { post: async (url) => { if (url.endsWith('/submit') && failures-- > 0) throw { message: 'Network Error' }; return null; } });
  const socket = fakeSocket();
  const c = await joined(w, http, socket);
  const round = roundAt(w.serverNow() + 500);
  http.setRoom(snapshot({ version: 3, status: 'countdown', round_no: 1, round }));
  socket.emit('presence-party.11111111-1111-4111-8111-111111111111', 'round.scheduled', { round });
  await w.advance(500 + 20000 + 100);
  await w.advance(2000);
  const submits = http.calls.filter(([, u]) => u.endsWith('/submit'));
  assert.equal(submits.length, 3);
  assert.equal(c.getState().phase, 'waiting');
  assert.equal(c.getState().entry.verdict, 'ok');
  c.destroy();
});

test('a rematch round is played, not ghosted, after the last round was submitted', async () => {
  const w = world();
  const http = fakeHttp(w);
  const socket = fakeSocket();
  const c = await joined(w, http, socket);
  const ch = 'presence-party.11111111-1111-4111-8111-111111111111';
  const r1 = roundAt(w.serverNow() + 500);
  http.setRoom(snapshot({ version: 3, status: 'countdown', round_no: 1, round: r1, you: { user_id: 7, round_id: r1.id, seat: 0, submitted: false } }));
  socket.emit(ch, 'round.scheduled', { round: r1 });
  await w.advance(500 + 20200);
  // The HTTP snapshot now says round 1 is submitted.
  http.setRoom(snapshot({ version: 6, status: 'results', round_no: 1, round: { ...r1, status: 'finalized', results: [] }, you: { user_id: 7, round_id: r1.id, seat: 0, submitted: true } }));
  c.refresh();
  await w.flush();
  const r2 = roundAt(w.serverNow() + 3000, { id: '44444444-4444-4444-8444-444444444444', round_no: 2, seed: 99 });
  socket.emit(ch, 'round.scheduled', { round: r2 });
  assert.equal(c.getState().phase, 'countdown');
  await w.advance(3100);
  assert.equal(c.getState().phase, 'playing');
  assert.equal(c.getState().ghostedRoundId, null);
  c.destroy();
});

test('the line heads-up fires on a real advance only, and never more than once in 45 s', () => {
  const qm = loadTs('src/gamekit/motion/QueueMotion.ts', { react: { useEffect() {}, useRef() { return {}; }, useState(v) { return [v, () => {}]; } } });
  const d = new qm.AdvanceDetector();
  let fired = 0;
  // Shuffling: a step or two every few seconds is the queue, not an advance.
  for (let t = 0, steps = 0; t < 60000; t += 3000) { steps += 2; if (d.push(t, steps)) fired++; }
  assert.equal(fired, 0);
  // A real advance: about 2 steps a second for 8 s.
  let steps = 40;
  for (let t = 60000; t < 68000; t += 500) { steps += 1; if (d.push(t, steps)) fired++; }
  assert.equal(fired, 1);
  // Walking on right away does not nag again inside the cool-down.
  for (let t = 68000; t < 100000; t += 500) { steps += 1; if (d.push(t, steps)) fired++; }
  assert.equal(fired, 1);
  for (let t = 113000; t < 125000; t += 500) { steps += 1; if (d.push(t, steps)) fired++; }
  assert.equal(fired, 2);
});

// ------------------------------------------------------------ rev 7: version gate, Splash, self-replay

test('join states this build\'s sim versions and bundle hash; UPDATE_READY surfaces as an error', async () => {
  const w = world();
  const http = fakeHttp(w);
  const c = await joined(w, http, null);
  const play = http.calls.find(([, u]) => u === '/party/play');
  assert.equal(play[2].sims.bonk_race, sim.BONK_RACE_VERSION);
  assert.match(play[2].sim_bundle, /^[0-9a-f]{12}$/);
  c.destroy();

  const w2 = world();
  const refusing = fakeHttp(w2, { post: async (url) => { if (url === '/party/play') throw { response: { status: 409, data: { code: 'UPDATE_READY', message: 'A quick update is ready.' } } }; } });
  const c2 = await joined(w2, refusing, null);
  assert.equal(c2.getState().phase, 'error');
  assert.equal(c2.getState().error.code, 'UPDATE_READY');
  c2.destroy();
});

test('a 10-streak Splash is POSTed at once; AttackIncoming for me lands in my log as 1000 + n; the submit carries the self-replay', async () => {
  const w = world();
  const attacks = [];
  const http = fakeHttp(w, {
    post: async (url, body) => {
      if (url.endsWith('/splash')) {
        const a = { attack_id: 41, round_id: '22222222-2222-4222-8222-222222222222', from_seat: 0, to_seat: 1, to_user_id: 9, n: 1, land_ms: 6176, status: 'sent' };
        attacks.push(body);
        return { data: { attack: a } };
      }
    },
  });
  const socket = fakeSocket();
  const c = await joined(w, http, socket);
  const ch = 'presence-party.11111111-1111-4111-8111-111111111111';
  const start = w.serverNow() + 3500;
  const round = roundAt(start, { sim_version: sim.BONK_RACE_VERSION, duration_ms: sim.ROUND_MS, end_at_ms: start + sim.ROUND_MS });
  http.setRoom(snapshot({ version: 3, status: 'countdown', round_no: 1, round, you: { user_id: 7, seat: 0, submitted: false } }));
  socket.emit(ch, 'round.scheduled', { round });
  await w.advance(3500);
  assert.equal(c.getState().phase, 'playing');
  assert.equal(c.mySeat(), 0);

  // My Splash: posted with the streak hit's board-ms, aimed by the server.
  await w.advance(5000);
  const sent = await c.splash(4410);
  assert.equal(sent.to_seat, 1);
  assert.deepEqual(plain(attacks), [{ streak_hit_ms: 4410 }]);
  assert.equal(c.getState().attacks.length, 1);

  // A rival's Splash aimed at me arrives over the socket, and my board logs its landing.
  socket.emit(ch, 'attack.incoming', { attack_id: 42, round_id: round.id, from_seat: 2, to_seat: 0, to_user_id: 7, n: 1, land_ms: 7058, status: 'sent' });
  assert.deepEqual(plain(rs.incomingFor(c.getState(), 0)), [[7058, 1]]);
  socket.emit(ch, 'attack.incoming', { attack_id: 42, round_id: round.id, from_seat: 2, to_seat: 0, to_user_id: 7, n: 1, land_ms: 7058, status: 'sent' });
  assert.equal(c.getState().attacks.length, 2, 'a duplicate push is merged');
  await w.advance(7058 - 5000);
  const at = c.recordLanding(1);
  assert.ok(at >= 7058 && at < 7058 + 3529);
  assert.equal(c.recordLanding(1), null, 'a landing is logged once');
  c.reportProgress(sim.resolve(sim.buildTimeline(round.seed), c.round.taps).score, 0);

  await w.advance(sim.ROUND_MS);
  const submit = http.calls.find(([, u]) => u.endsWith('/submit'));
  assert.deepEqual(plain(submit[2].taps), [[at, 1001]]);
  assert.match(submit[2].self_replay_hash, /^[0-9a-f]{8}$/);
  assert.equal(submit[2].self_replay_hash, submit[2].client_hash, 'the fresh-board replay matches the live claim');
  assert.match(submit[2].sim_bundle, /^[0-9a-f]{12}$/);
  c.destroy();
});

test('during a round the heartbeat carries my live score every 3 s, and the whole client stays under 60 calls a minute', async () => {
  const w = world();
  const http = fakeHttp(w);
  const socket = fakeSocket();
  const c = await joined(w, http, socket);
  const ch = 'presence-party.11111111-1111-4111-8111-111111111111';
  const start = w.serverNow() + 3500;
  const round = roundAt(start, { sim_version: sim.BONK_RACE_VERSION, duration_ms: sim.ROUND_MS, end_at_ms: start + sim.ROUND_MS });
  http.setRoom(snapshot({ version: 3, status: 'countdown', round_no: 1, round, you: { user_id: 7, seat: 0, submitted: false } }));
  socket.emit(ch, 'round.scheduled', { round });
  await w.advance(3500);
  const before = http.calls.filter(([, u]) => u.endsWith('/heartbeat')).length;
  await w.advance(5000);
  const beats = http.calls.filter(([, u]) => u.endsWith('/heartbeat')).slice(before);
  assert.ok(beats.length >= 1 && beats.length <= 2, `${beats.length} heartbeats in 5 s`);
  assert.ok(beats.every(([, , body]) => typeof body.live_score === 'number'));
  // API budget: the general limit is 60 a minute per player, LinePlay's own calls included.
  const t0 = http.calls.length;
  await w.advance(10000);
  assert.ok(http.calls.length - t0 <= 6, `${http.calls.length - t0} calls in 10 s with the socket live`);
  // Outside a round it drops back to every 10 s.
  await w.advance(sim.ROUND_MS);
  http.setRoom(snapshot({ version: 9, status: 'results', round_no: 1, round: { ...round, status: 'finalized', results: [] } }));
  socket.emit(ch, 'round.finalized', { round: { ...round, status: 'finalized', results: [] } });
  const idle = http.calls.filter(([, u]) => u.endsWith('/heartbeat')).length;
  await w.advance(9000);
  assert.ok(http.calls.filter(([, u]) => u.endsWith('/heartbeat')).length - idle <= 1);
  c.destroy();
});
