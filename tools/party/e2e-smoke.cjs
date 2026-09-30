'use strict';
/**
 * Line Party end-to-end smoke test against a running local stack (Laravel on
 * 8479, Reverb on 8480). Uses the same pusher-js worker build and the same
 * Bonk Race sim the app ships. N scripted players:
 *   start a LinePlay session at the ride (real geofence), join the queue
 *   presence channel, PLAY, join the room presence channel, READY, receive
 *   round.scheduled over the socket, whisper live scores, play the round with
 *   a human-like autoplayer, submit, and receive round.finalized.
 *
 *   PARTY_TOKENS=/path/tokens.json node tools/party/e2e-smoke.cjs [ride_id] [lat] [lng] [players]
 * tokens.json maps name -> {id, token}. Tokens are never printed.
 */
const fs = require('node:fs');
const path = require('node:path');
globalThis.self = globalThis;
const Pusher = require(path.resolve(__dirname, '../../node_modules/pusher-js/dist/worker/pusher.worker.js'));
const { loadTs } = require('../tests/helpers/ts-module.cjs');
const sim = loadTs('src/games/party/bonkRace.ts');

const API = process.env.PARTY_API || 'http://127.0.0.1:8479/api';
const WS_HOST = process.env.PARTY_WS_HOST || '127.0.0.1';
const WS_PORT = Number(process.env.PARTY_WS_PORT || 8480);
const KEY = process.env.PARTY_WS_KEY || 'tps-mg-local-key';
const [rideId, lat, lng, count] = [Number(process.argv[2] || 194), Number(process.argv[3] || 34.139487), Number(process.argv[4] || -118.353919), Number(process.argv[5] || 2)];
const tokens = Object.entries(JSON.parse(fs.readFileSync(process.env.PARTY_TOKENS, 'utf8'))).slice(0, count);

const log = (who, ...args) => console.log(`[${((Date.now() % 100000) / 1000).toFixed(3)}] ${who}:`, ...args);

async function api(token, method, url, body) {
  const res = await fetch(API + url, {
    method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'App-Version': '1.6.0' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`${method} ${url} -> ${res.status} ${json.code || json.message}`), { status: res.status, json });
  return json;
}

async function clockOffset(token) {
  let best = null;
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    const { server_ms } = await api(token, 'GET', '/party/time');
    const t1 = Date.now();
    const sample = { rtt: t1 - t0, offset: server_ms - (t0 + t1) / 2 };
    if (!best || sample.rtt < best.rtt) best = sample;
  }
  return best;
}

async function player(name, token, index) {
  const clock = await clockOffset(token);
  log(name, `clock offset ${clock.offset.toFixed(1)}ms rtt ${clock.rtt}ms`);
  const session = await api(token, 'POST', '/me/line-sessions', { client_request_id: `party-e2e-${name.replace(/[^A-Za-z0-9]/g, "")}-${Date.now()}-abcdef`, ride_id: rideId, latitude: lat, longitude: lng });
  log(name, `line session ${session.status}`);

  const pusher = new Pusher(KEY, {
    wsHost: WS_HOST, wsPort: WS_PORT, forceTLS: false, enabledTransports: ['ws'], cluster: '',
    channelAuthorization: { endpoint: `${API}/broadcasting/auth`, transport: 'ajax', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'App-Version': '1.6.0' } },
  });
  await new Promise((resolve, reject) => { pusher.connection.bind('connected', resolve); pusher.connection.bind('error', reject); });
  log(name, `socket ${pusher.connection.socket_id}`);

  const queue = pusher.subscribe(`presence-queue.${rideId}`);
  await new Promise((resolve, reject) => { queue.bind('pusher:subscription_succeeded', resolve); queue.bind('pusher:subscription_error', reject); });
  log(name, `in line with ${queue.members.count} player(s)`);

  const { room } = await api(token, 'POST', '/party/play', { ride_id: rideId });
  log(name, `room ${room.id.slice(0, 8)} members=${room.members.length} status=${room.status}`);
  const channel = pusher.subscribe(`presence-party.${room.id}`);
  await new Promise((resolve, reject) => { channel.bind('pusher:subscription_succeeded', resolve); channel.bind('pusher:subscription_error', reject); });

  const state = { name, token, pusher, channel, room, clock, rivals: {}, finalized: null };
  channel.bind('room.updated', (e) => { if (e.room.version > state.room.version) state.room = e.room; });
  channel.bind('client-progress', (e) => { state.rivals[e.u] = e.s; });
  channel.bind('emote', (e) => log(name, `emote ${e.emote} from ${e.user_id}`));
  state.scheduled = new Promise((resolve) => channel.bind('round.scheduled', (e) => resolve(e.round)));
  state.final = new Promise((resolve) => channel.bind('round.finalized', (e) => resolve(e.round)));
  return state;
}

(async () => {
  const players = [];
  for (let i = 0; i < tokens.length; i++) players.push(await player(tokens[i][0], tokens[i][1].token, i));
  const roomId = players[0].room.id;
  if (!players.every((p) => p.room.id === roomId)) throw new Error('players landed in different rooms');
  await new Promise((r) => setTimeout(r, 300));
  await api(players[0].token, 'POST', `/party/rooms/${roomId}/emote`, { emote: 'fin' });
  for (const p of players) await api(p.token, 'POST', `/party/rooms/${roomId}/ready`, { ready: true });

  const rounds = await Promise.all(players.map((p) => p.scheduled));
  const round = rounds[0];
  const serverNow = Date.now() + players[0].clock.offset;
  log('room', `round ${round.round_no} seed ${round.seed} seats ${round.seats.map((s) => s.kind === 'bot' ? `bot:${s.name}` : s.name).join(', ')}; GO in ${round.start_at_ms - serverNow}ms`);

  const spawns = sim.buildTimeline(round.seed);
  await Promise.all(players.map(async (p, i) => {
    const seat = round.seats.find((s) => s.user_id === undefined ? false : s.name && p.room.you && s.user_id === p.room.you.user_id) || round.seats[i];
    const taps = sim.botTaps(spawns, round.seed, 20 + i, i === 0 ? 'ace' : 'regular');
    const goLocal = round.start_at_ms - p.clock.offset;
    await new Promise((r) => setTimeout(r, Math.max(0, goLocal - Date.now())));
    const timer = setInterval(() => {
      const t = Date.now() - goLocal;
      const score = sim.resolve(spawns, taps.filter(([at]) => at <= t)).score;
      p.channel.trigger('client-progress', { u: seat.user_id, s: score, t });
    }, 250);
    await new Promise((r) => setTimeout(r, round.duration_ms + 150));
    clearInterval(timer);
    const clientScore = sim.resolve(spawns, taps).score;
    const res = await api(p.token, 'POST', `/party/rounds/${round.id}/submit`, { taps, client_score: clientScore, sim_version: 1 });
    log(p.name, `submitted: client ${clientScore} verified ${res.entry.verified_score} verdict ${res.entry.verdict}; saw rivals ${JSON.stringify(p.rivals)}`);
  }));

  const finals = await Promise.all(players.map((p) => Promise.race([p.final, new Promise((_, rej) => setTimeout(() => rej(new Error('no round.finalized push')), 8000))])));
  for (const r of finals[0].results) log('result', `#${r.placement} ${r.kind === 'bot' ? 'bot ' : ''}${r.name} ${r.score} (+${r.points})${r.filled_by ? ' ghost' : ''}`);
  for (const p of players) { await api(p.token, 'POST', `/party/rooms/${roomId}/leave`); p.pusher.disconnect(); }
  console.log('E2E OK');
  process.exit(0);
})().catch((e) => { console.error('E2E FAILED', e.message, e.json || ''); process.exit(1); });
