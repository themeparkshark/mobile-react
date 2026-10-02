#!/usr/bin/env node
'use strict';
/**
 * Sharky Rally lab server (DEV ONLY; never deployed). Design v7.1 section 11.
 *
 * Mirrors the Line Party server semantics for the 'sharky_rally' game so two
 * simulators can rally for real before WS1/WS7 wire the Laravel side:
 *   - one room per ride queue, 4 seats, empty seats are house-crew bots whose
 *     input logs are planned from (seed, seat, profile) by the SAME verifier
 *     bundle the server will run (so every phone replays them identically);
 *   - server seed per round, start_at = now + 3.5s, clock sync by ping;
 *   - 10 Hz display whispers {step, d, y, score, crowd} relayed (never trusted);
 *   - Bubble Gift: a sender's Overdrive start puffs a gift to the rival
 *     directly behind it in live score (last place gifts the one ahead); the
 *     server stamps {eventId} and the receiver logs ext bubble_gift(eventId);
 *     a proof carrying a gift the server never issued is dq:gift;
 *   - results only from server replays of each submitted swim proof, ranked
 *     by verified score (within 1%, more Close Skims wins);
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
    const c = api.RALLY_HOUSE_CREW[crew++ % api.RALLY_HOUSE_CREW.length];
    const seat = seats.length;
    const plan = api.rallyBot(seed, seat, c.profile);
    seats.push({ seat, kind: 'bot', name: c.name, profile: c.profile, inputs: plan.inputs, finishStep: plan.finishStep, score: plan.score, closeSkims: plan.closeSkims, finished: plan.finished });
  }
  const roundId = `r${r.rideId}-${r.roundNo}`;
  const startAtMs = now() + START_LEAD_MS;
  r.round = { roundId, seed, startAtMs, seats, entries: new Map(), finalized: false, live: new Map(), gifts: new Map(), giftSeq: 0, lastGiftTo: new Map() };
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
      return { seat: s.seat, kind: 'bot', name: s.name, finished: s.finished, finishStep: s.finishStep, score: s.score, closeSkims: s.closeSkims, verified: true, reason: 'ok', filledBy: null };
    }
    const e = rd.entries.get(s.seat);
    if (e && e.verdict.ok) {
      return { seat: s.seat, kind: 'human', name: s.name, userId: s.userId, finished: e.proof.reached_gate, finishStep: e.proof.finish_step,
        score: e.verdict.score, closeSkims: e.proof.close_skims, verified: true, reason: 'ok', filledBy: null, flagged: e.verdict.plausibility.flagged };
    }
    // Dropped / never submitted / failed replay: the ghost finishes the rally.
    const g = api.rallyBot(rd.seed, s.seat, 'rookie');
    return { seat: s.seat, kind: 'human', name: s.name, userId: s.userId, finished: g.finished, finishStep: g.finishStep, score: g.score,
      closeSkims: g.closeSkims, verified: true, reason: e ? e.verdict.reason : 'ghost_fill', filledBy: 'ghost' };
  });
  results.sort(api.rallyCompare);
  results.forEach((x, i) => { x.placement = i + 1; x.points = [4, 2, 1, 0][i]; });
  r.phase = 'results';
  broadcast(r, { t: 'results', roundId: rd.roundId, results, nextLobbyAtMs: now() + RESULTS_MS });
  log('results', rd.roundId, results.map((x) => `${x.placement}.${x.name}(${x.score}${x.filledBy ? ' ghost' : ''}${x.reason !== 'ok' ? ' ' + x.reason : ''})`).join(' '));
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
      if (seat) {
        r.round.live.set(seat.seat, { score: msg.score | 0, step: msg.step | 0 });
        broadcast(r, { t: 'w', seat: seat.seat, step: msg.step | 0, d: msg.d | 0, y: msg.y | 0, f: msg.f | 0, score: msg.score | 0, crowd: msg.crowd | 0 }, ws);
      }
      return;
    }
    if (msg.t === 'gift' && r.round && !r.round.finalized) {
      // Bubble Gift: to the rival directly behind the sender in live score
      // (last place gifts the one just ahead). Humans only; one per 5s each.
      const rd = r.round;
      const seat = rd.seats.find((s) => s.userId === me.id);
      if (!seat) return;
      const scoreOf = (s) => (s.kind === 'human' ? (rd.live.get(s.seat)?.score ?? 0) : 0);
      const others = rd.seats.filter((s) => s.seat !== seat.seat);
      const mine = scoreOf(seat);
      const behind = others.filter((s) => scoreOf(s) <= mine).sort((a, b) => scoreOf(b) - scoreOf(a));
      const ahead = others.filter((s) => scoreOf(s) > mine).sort((a, b) => scoreOf(a) - scoreOf(b));
      const target = behind[0] || ahead[0];
      if (!target || target.kind !== 'human') return; // ghosts never receive gifts
      const t = now();
      if (t - (rd.lastGiftTo.get(target.seat) || 0) < 5000) return;
      rd.lastGiftTo.set(target.seat, t);
      const eventId = ++rd.giftSeq;
      rd.gifts.set(eventId, { from: seat.seat, to: target.seat });
      const tm = [...r.members.values()].find((m) => m.id === target.userId);
      if (tm) send(tm.ws, { t: 'gift', eventId, from: seat.seat, fromName: seat.name, serverMs: t });
      send(ws, { t: 'gift_sent', eventId, to: target.seat, toName: target.name });
      log('gift', seat.name, '->', target.name, eventId);
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
      let verdict = proof.seed === r.round.seed && proof.mode === 'rally' ? api.verifySwimProof(proof) : { ok: false, reason: 'foreign_round', score: 0, plausibility: { flagged: false } };
      // Every logged gift must be one the server issued to this seat.
      if (verdict.ok) {
        const gifts = api.core.decodeInputs(String(proof.inputs || '')).filter((x) => x.kind === api.core.IN_EXT && x.sub === api.core.EXT_BUBBLE_GIFT);
        const bad = gifts.some((x) => { const g = r.round.gifts.get(x.arg); return !g || g.to !== seat.seat; });
        if (bad) verdict = { ok: false, reason: 'dq:gift', score: 0, plausibility: { flagged: true } };
      }
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
log(`sharky lab rally server on ws://localhost:${PORT}`);
