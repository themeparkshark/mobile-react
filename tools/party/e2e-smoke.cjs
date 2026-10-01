'use strict';
/**
 * Line Party end-to-end smoke test against a running local stack (Laravel on
 * 8479, Reverb on 8480). Uses the same pusher-js worker build and the same
 * Bonk Race sim the app ships. N scripted players:
 *   start a LinePlay session at the ride (real geofence), join the queue
 *   presence channel, PLAY, join the room presence channel, READY, receive
 *   round.scheduled over the socket and the private round token on their own
 *   player channel, whisper live scores, play the round with a human-like
 *   autoplayer, submit with the {score, hash} claim, and receive
 *   round.finalized with the Party Series standings. One player takes a 2 s
 *   HOLD mid-round (only their board stops; the room never waits).
 *   Rev 7: the join states sim versions (bonk_race v3), live scores go up in a
 *   1 Hz heartbeat, player 1's 10-streak throws a Splash the server aims at
 *   the leader, and a Splash aimed at a scripted player lands in its log as
 *   code 1000 + n at land_ms; everyone still verifies ok.
 *   Queue presence must carry no identity (strangers are fin silhouettes).
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
const tokenMap = JSON.parse(fs.readFileSync(process.env.PARTY_TOKENS, 'utf8'));
const tokens = Object.entries(tokenMap).slice(0, count);
const tokensFile = (name) => tokenMap[name];

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
  // The session API returns an open session as-is; a geofenced heartbeat refreshes "in line now".
  const sid = session.session_id ?? session.id;
  if (sid) await api(token, 'POST', `/me/line-sessions/${sid}/heartbeat`, { latitude: lat, longitude: lng }).catch((e) => log(name, `line heartbeat ${e.message}`));

  const pusher = new Pusher(KEY, {
    wsHost: WS_HOST, wsPort: WS_PORT, forceTLS: false, enabledTransports: ['ws'], cluster: '',
    channelAuthorization: { endpoint: `${API}/broadcasting/auth`, transport: 'ajax', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'App-Version': '1.6.0' } },
  });
  await new Promise((resolve, reject) => { pusher.connection.bind('connected', resolve); pusher.connection.bind('error', reject); });
  log(name, `socket ${pusher.connection.socket_id}`);

  const queue = pusher.subscribe(`presence-queue.${rideId}`);
  await new Promise((resolve, reject) => { queue.bind('pusher:subscription_succeeded', resolve); queue.bind('pusher:subscription_error', reject); });
  const infos = [];
  queue.members.each((m) => infos.push(m.info));
  if (infos.some((i) => JSON.stringify(i) !== '{"fin":true}')) throw new Error(`queue presence leaked identity: ${JSON.stringify(infos)}`);
  log(name, `in line with ${queue.members.count} player(s), all fin silhouettes`);

  const tokensByRound = {};
  const me = pusher.subscribe(`private-player.${tokensFile(name).id}`);
  await new Promise((resolve, reject) => { me.bind('pusher:subscription_succeeded', resolve); me.bind('pusher:subscription_error', reject); });
  me.bind('round.token', (e) => { tokensByRound[e.round_id] = e.round_token; });

  const { room } = await api(token, 'POST', '/party/play', { ride_id: rideId, games: ['bonk_race'], sims: { bonk_race: sim.BONK_RACE_VERSION } });
  log(name, `room ${room.id.slice(0, 8)} members=${room.members.length} status=${room.status}`);
  const channel = pusher.subscribe(`presence-party.${room.id}`);
  await new Promise((resolve, reject) => { channel.bind('pusher:subscription_succeeded', resolve); channel.bind('pusher:subscription_error', reject); });

  const state = { name, token, pusher, channel, room, clock, rivals: {}, finalized: null, tokensByRound };
  channel.bind('room.updated', (e) => { if (e.room.version > state.room.version) state.room = e.room; });
  channel.bind('client-progress', (e) => { state.rivals[e.u] = e.s; });
  channel.bind('emote', (e) => log(name, `emote ${e.emote} from ${e.user_id}`));
  state.scheduled = new Promise((resolve) => channel.bind('round.scheduled', (e) => resolve(e.round)));
  state.attacks = [];
  channel.bind('attack.incoming', (e) => { state.attacks.push(e); log(name, `attack.incoming #${e.attack_id} seat ${e.from_seat} -> seat ${e.to_seat} (n ${e.n}) lands at ${e.land_ms} [${e.status}]`); });
  state.final = new Promise((resolve) => channel.bind('round.finalized', (e) => resolve(e)));
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
  let splashes = 0;
  await Promise.all(players.map(async (p, i) => {
    const seat = round.seats.find((s) => s.user_id === undefined ? false : s.name && p.room.you && s.user_id === p.room.you.user_id) || round.seats[i];
    const mySeat = round.seats.find((s) => s.kind === 'human' && s.user_id === tokensFile(p.name).id).seat;
    const thumb = sim.botTaps(spawns, round.seed, 20 + i, i === 0 ? 'ace' : 'regular');
    // Like the real board: a Splash aimed at me is logged at land_ms the moment my board reaches it,
    // and my own Splashes come from my log as played (bubbles included).
    const landings = [];
    const logAt = (t) => [...thumb.filter(([at]) => at <= t), ...landings.filter(([at]) => at <= t)].sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    const goLocal = round.start_at_ms - p.clock.offset;
    // Player 2 pockets the phone for 2 s at board time 8000: a personal HOLD.
    const hold = i === 1 ? [8000, 2000, 'h'] : null;
    const boardAt = () => { const t = Date.now() - goLocal; return hold && t > hold[0] ? (t < hold[0] + hold[1] ? hold[0] : t - hold[1]) : t; };
    await new Promise((r) => setTimeout(r, Math.max(0, goLocal - Date.now())));
    const sent = new Set();
    let beatAt = 0;
    const timer = setInterval(() => {
      const t = boardAt();
      for (const a of p.attacks) {
        if (a.to_seat === mySeat && a.status === 'sent' && t >= a.land_ms && !landings.some(([, c]) => c === 1000 + a.n)) landings.push([a.land_ms, 1000 + a.n]);
      }
      const now = sim.resolve(spawns, logAt(t));
      const score = now.score;
      const earned = sim.splashEarned(now);
      p.channel.trigger('client-progress', { u: seat.user_id, s: score, t });
      // 1 Hz heartbeat with my live score: the server aims Splashes by it.
      if (Date.now() - beatAt >= 1000) { beatAt = Date.now(); api(p.token, 'POST', `/party/rooms/${roomId}/heartbeat`, { live_score: score }).catch(() => {}); }
      // My 10th / 20th streak hit: send the Splash the frame it lands.
      for (const ms of earned) {
        if (t >= ms && !sent.has(ms)) {
          sent.add(ms);
          api(p.token, 'POST', `/party/rounds/${round.id}/splash`, { streak_hit_ms: ms })
            .then((r) => { splashes++; log(p.name, `SPLASH at streak hit ${ms} -> seat ${r.attack.to_seat}, lands ${r.attack.land_ms}`); })
            .catch((e) => log(p.name, `splash refused ${e.message}`));
        }
      }
    }, 100);
    await new Promise((r) => setTimeout(r, round.duration_ms + (hold ? hold[1] : 0) + 150));
    clearInterval(timer);
    const taps = logAt(Infinity);
    if (landings.length) log(p.name, `logged ${landings.length} Splash landing(s) on my board`);
    const result = sim.resolve(spawns, taps);
    const token = p.tokensByRound[round.id];
    if (!token) throw new Error(`${p.name} never got a private round token`);
    const res = await api(p.token, 'POST', `/party/rounds/${round.id}/submit`, {
      taps, client_score: result.score, client_hash: sim.resultHash(result), sim_version: sim.BONK_RACE_VERSION, round_token: token, holds: hold ? [hold] : [],
    });
    log(p.name, `submitted: client ${result.score}/${sim.resultHash(result)} verified ${res.entry.verified_score} verdict ${res.entry.verdict}${hold ? ' (after a 2 s HOLD)' : ''}; saw rivals ${JSON.stringify(p.rivals)}`);
    if (res.entry.verdict !== 'ok') throw new Error(`${p.name} verdict ${res.entry.verdict}`);
  }));

  const finals = await Promise.all(players.map((p) => Promise.race([p.final, new Promise((_, rej) => setTimeout(() => rej(new Error('no round.finalized push')), 8000))])));
  for (const r of finals[0].round.results) log('result', `#${r.placement} ${r.kind === 'bot' ? 'bot ' : ''}${r.name} ${r.score} (+${r.points}) ${r.verdict}${r.filled_by ? ' ghost' : ''}`);
  const series = finals[0].series;
  log('series', `round ${series.rounds_played} of ${series.rounds_total}: ${series.standings.map((s) => `${s.name} ${s.points}`).join(', ')}`);
  for (const p of players) { await api(p.token, 'POST', `/party/rooms/${roomId}/leave`); p.pusher.disconnect(); }
  const attacks = players[0].attacks;
  log('splash', `${attacks.length} Splash(es) this round (${splashes} from the scripted humans, the rest from the crew)`);
  console.log('E2E OK');
  process.exit(0);
})().catch((e) => { console.error('E2E FAILED', e && e.message ? e.message : JSON.stringify(e), (e && e.json) || ''); process.exit(1); });
