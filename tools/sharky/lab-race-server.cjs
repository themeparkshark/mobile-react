#!/usr/bin/env node
'use strict';
/**
 * Sharky Sprint Race lab server (DEV ONLY; never deployed).
 *
 * Mirrors the Line Party server semantics for the 'sharky_race' game so two
 * simulators can race for real before WS1/WS7 wire the Laravel side:
 *   - one room per ride queue, 4 seats, empty seats are house-crew bots whose
 *     input logs are planned from (seed, seat, profile) by the SAME verifier
 *     bundle the server will run (so every phone replays them identically);
 *   - server seed per round, start_at = now + 3.5s, clock sync by ping;
 *   - 10 Hz display whispers relayed to the room (never trusted);
 *   - results only from server replays of each submitted swim proof;
 *     a player who drops or never submits is ghost-filled by a bot plan;
 *   - nobody ever pauses the room; results autostart the next lobby.
 *
 *   node tools/sharky/lab-race-server.cjs [port=8413]
 */
const path = require('node:path');
const crypto = require('node:crypto');
const WebSocket = require(path.resolve(__dirname, '../../node_modules/ws'));
const { build } = require('./build-verifier.cjs');

const PORT = Number(process.argv[2] || process.env.SHARKY_LAB_PORT || 8413);
const api = require(build(path.join(require('node:os').tmpdir(), `sharky-lab-verify-${process.pid}.cjs`)));
const LOBBY_MS = Number(process.env.SHARKY_LAB_LOBBY_MS || 9000);
const RESULTS_MS = 14000;
const START_LEAD_MS = 3500;
const DEADLINE_MS = 60000;

const now = () => Date.now();
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);

/** rideId -> room */
const rooms = new Map();
let nextUser = 1;

function room(rideId) {
  if (!rooms.has(rideId)) {
    rooms.set(rideId, { rideId, members: new Map(), phase: 'lobby', autostartAt: 0, round: null, roundNo: 0, timers: [] });
  }
  return rooms.get(rideId);
}

function send(ws, msg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
function broadcast(r, msg, except) {
  for (const m of r.members.values()) if (m.ws !== except) send(m.ws, msg);
}
function roomMsg(r) {
  return {
    t: 'room',
    phase: r.phase,
    autostartAtMs: r.autostartAt,
    serverMs: now(),
    members: [...r.members.values()].map((m) => ({ id: m.id, name: m.name, ready: m.ready, state: m.state })),
  };
}
function clearTimers(r) {
  r.timers.forEach(clearTimeout);
  r.timers = [];
}

function scheduleLobby(r) {
  clearTimers(r);
  r.phase = 'lobby';
  r.round = null;
  r.autostartAt = now() + LOBBY_MS;
  r.timers.push(setTimeout(() => startRound(r), LOBBY_MS));
  broadcast(r, roomMsg(r));
}

function startRound(r) {
  clearTimers(r);
  const humans = [...r.members.values()].filter((m) => m.state === 'active').slice(0, 4);
  if (humans.length === 0) {
    r.phase = 'lobby';
    return;
  }
  r.roundNo += 1;
  const seed = crypto.createHmac('sha256', 'sharky-lab').update(`${r.rideId}:${r.roundNo}:${now()}`).digest().readInt32LE(0);
  const seats = [];
  humans.forEach((m, i) => seats.push({ seat: i, kind: 'human', userId: m.id, name: m.name }));
  let crew = 0;
  while (seats.length < 4) {
    const c = api.RACE_HOUSE_CREW[crew++ % api.RACE_HOUSE_CREW.length];
    const seat = seats.length;
    const plan = api.raceBot(seed, seat, c.profile);
    seats.push({ seat, kind: 'bot', name: c.name, profile: c.profile, inputs: plan.inputs, finishStep: plan.finishStep, score: plan.score, finished: plan.finished });
  }
  const roundId = `r${r.rideId}-${r.roundNo}`;
  const startAtMs = now() + START_LEAD_MS;
  r.round = { roundId, seed, startAtMs, seats, entries: new Map(), finalized: false };
  r.phase = 'countdown';
  for (const m of r.members.values()) {
    const mySeat = seats.find((s) => s.userId === m.id);
    send(m.ws, { t: 'round', roundId, roundNo: r.roundNo, seed, startAtMs, serverMs: now(), you: mySeat ? mySeat.seat : -1,
      seats: seats.map((s) => ({ seat: s.seat, kind: s.kind, name: s.name, profile: s.profile, userId: s.userId, inputs: s.inputs })) });
  }
  log('round', roundId, 'seed', seed, 'humans', humans.map((h) => h.name).join(','));
  r.timers.push(setTimeout(() => { r.phase = 'racing'; broadcast(r, roomMsg(r)); }, START_LEAD_MS));
  r.timers.push(setTimeout(() => finalize(r), START_LEAD_MS + DEADLINE_MS));
}

function maybeFinalize(r) {
  const rd = r.round;
  if (!rd || rd.finalized) return;
  const humans = rd.seats.filter((s) => s.kind === 'human');
  const pending = humans.filter((s) => !rd.entries.has(s.seat) && (r.members.get(s.userId)?.state === 'active'));
  if (pending.length === 0) finalize(r);
}

function finalize(r) {
  const rd = r.round;
  if (!rd || rd.finalized) return;
  rd.finalized = true;
  clearTimers(r);
  const results = rd.seats.map((s) => {
    if (s.kind === 'bot') {
      return { seat: s.seat, kind: 'bot', name: s.name, finished: s.finished, finishStep: s.finishStep, score: s.score, distance: 7500, verified: true, reason: 'ok', filledBy: null };
    }
    const e = rd.entries.get(s.seat);
    if (e && e.verdict.ok) {
      return { seat: s.seat, kind: 'human', name: s.name, userId: s.userId, finished: e.proof.reached_gate, finishStep: e.proof.finish_step,
        score: e.verdict.score, distance: e.proof.distance, verified: true, reason: 'ok', filledBy: null, flagged: e.verdict.plausibility.flagged };
    }
    // Dropped / never submitted / failed replay: the ghost finishes the race.
    const g = api.raceBot(rd.seed, s.seat, 'rookie');
    return { seat: s.seat, kind: 'human', name: s.name, userId: s.userId, finished: g.finished, finishStep: g.finishStep, score: g.score,
      distance: 7500, verified: true, reason: e ? e.verdict.reason : 'ghost_fill', filledBy: 'ghost' };
  });
  results.sort((a, b) => api.raceRankKey(b.finished, b.finishStep, b.score, b.distance) - api.raceRankKey(a.finished, a.finishStep, a.score, a.distance));
  results.forEach((x, i) => { x.placement = i + 1; x.points = [4, 2, 1, 0][i]; });
  r.phase = 'results';
  broadcast(r, { t: 'results', roundId: rd.roundId, results, nextLobbyAtMs: now() + RESULTS_MS });
  log('results', rd.roundId, results.map((x) => `${x.placement}.${x.name}(${x.finishStep}${x.filledBy ? ' ghost' : ''}${x.reason !== 'ok' ? ' ' + x.reason : ''})`).join(' '));
  r.timers.push(setTimeout(() => scheduleLobby(r), RESULTS_MS));
}

const wss = new WebSocket.Server({ port: PORT });
wss.on('connection', (ws) => {
  let me = null;
  let r = null;
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.t === 'ping') return send(ws, { t: 'pong', c: msg.c, s: now() });
    if (msg.t === 'hello') {
      r = room(Number(msg.rideId) || 1);
      me = { id: msg.userId || nextUser++, name: String(msg.name || 'Shark').slice(0, 16), ws, ready: false, state: 'active' };
      r.members.set(me.id, me);
      send(ws, { t: 'welcome', you: me.id, serverMs: now() });
      log('join', me.name, 'ride', r.rideId, 'members', r.members.size);
      if (r.phase === 'lobby' && !r.autostartAt) scheduleLobby(r);
      else broadcast(r, roomMsg(r));
      if (r.phase === 'lobby' && r.autostartAt < now()) scheduleLobby(r);
      return;
    }
    if (!me || !r) return;
    if (msg.t === 'ready') {
      me.ready = true;
      broadcast(r, roomMsg(r));
      const act = [...r.members.values()].filter((m) => m.state === 'active');
      if (r.phase === 'lobby' && act.every((m) => m.ready)) {
        clearTimers(r);
        r.timers.push(setTimeout(() => startRound(r), 600));
      }
      return;
    }
    if (msg.t === 'w' && r.round) {
      const seat = r.round.seats.find((s) => s.userId === me.id);
      if (seat) broadcast(r, { t: 'w', seat: seat.seat, step: msg.step | 0, d: msg.d | 0, y: msg.y | 0, f: msg.f | 0 }, ws);
      return;
    }
    if (msg.t === 'bg') {
      // Backgrounded: the ghost takes over from here; they rejoin next round.
      me.state = msg.on ? 'away' : 'active';
      broadcast(r, roomMsg(r));
      if (msg.on) maybeFinalize(r);
      return;
    }
    if (msg.t === 'submit' && r.round && msg.roundId === r.round.roundId) {
      const seat = r.round.seats.find((s) => s.userId === me.id);
      if (!seat || r.round.entries.has(seat.seat)) return;
      const proof = msg.proof || {};
      const verdict = proof.seed === r.round.seed && proof.mode === 'race' ? api.verifySwimProof(proof) : { ok: false, reason: 'foreign_round', score: 0, plausibility: { flagged: false } };
      r.round.entries.set(seat.seat, { proof, verdict });
      send(ws, { t: 'entry', roundId: r.round.roundId, verdict: verdict.reason, score: verdict.score });
      log('submit', me.name, verdict.reason, 'score', verdict.score, 'finish', proof.finish_step);
      maybeFinalize(r);
      return;
    }
    if (msg.t === 'emote') broadcast(r, { t: 'emote', from: me.id, id: String(msg.id).slice(0, 24) });
  });
  ws.on('close', () => {
    if (!me || !r) return;
    r.members.delete(me.id);
    broadcast(r, roomMsg(r));
    maybeFinalize(r);
    log('leave', me.name);
  });
});
log(`sharky lab race server on ws://localhost:${PORT}`);
