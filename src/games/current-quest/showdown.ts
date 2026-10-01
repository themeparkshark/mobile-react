/**
 * Same-Board Showdown (design v7.1 14.1) as a pure, seeded room sim.
 *
 * Everyone races the same three tide voyages (Standard, Standard, Deep) inside
 * a 210 s window. Rank (R4 + 0.A.7) = shells desc, strokes asc, undos asc,
 * Riptide strokes desc, golden reach asc, with NO time key at all; remaining
 * ties share a rank (DEAD HEAT). Unfinished racers rank by progress, never zero.
 *
 * Splash (R1, R2, 0.A.6): a Par clear first cancels your own queued incoming
 * Splash (a counter, "BLOCKED!"); only when nothing was incoming does it send
 * one. The sender aims at a splashable racer (one with a voyage still to start
 * and nothing queued on it) within 3 s, else it auto-targets: revenge, then the
 * racer directly ahead, then the racer with the most progress. The Splash waits
 * on the target's rail chip and lands as their next voyage starts, from that
 * board's phase-table row (never mid-voyage, never easier, at most +2 par).
 * First Find (R3): the first racer to bank a voyage's golden pearl gets the
 * Shield, which absorbs the next Splash queued on them.
 *
 * House-crew seats are solver bots with human think times and human mistakes,
 * fully deterministic from (seed, seat, profile). Like the Line Party crew
 * seats they send and take Splashes; recorded queue ghosts (live rooms) never
 * do. Everything here is integer state the server can mirror.
 */

import {
  A_RESTART, A_UNDO, applyAction, createRun, currentBoard, goldenReach, PUZZLE_KNOBS, queueSplash, riptidesOf, strokesLeft,
  totalShells, type Board, type CqEvent, type Knobs, type RunState, type SplashStart,
} from './rules';
import { distanceFrom, hintFrom } from './solver';
import { showdownBoards } from './library';

export const SHOWDOWN_WINDOW_MS = 210000;
export const TEMPO_CAP_MS = 2000;
/** How long the sender may aim a Splash after a Par clear (R2). */
export const AIM_MS = 3000;
export const SHOWDOWN_KNOBS: Knobs = { ...PUZZLE_KNOBS, showdown: true };

export type BotProfile = 'rookie' | 'regular' | 'shark';

export interface CrewSeat {
  seat: number;
  name: string;
  avatar: 'blue' | 'green' | 'orange';
  profile: BotProfile;
}

export const HOUSE_CREW: readonly CrewSeat[] = [
  { seat: 1, name: 'Marina', avatar: 'blue', profile: 'regular' },
  { seat: 2, name: 'Finley', avatar: 'green', profile: 'rookie' },
  { seat: 3, name: 'Coral', avatar: 'orange', profile: 'shark' },
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { showdownBoards };

// ---------------------------------------------------------------------------
// Progress and rank

export interface RacerProgress {
  voyagesCleared: number;
  shells: number;
  strokes: number;
  undos: number;
  riptides: number;
  goldenReach: number;
  tempo: number;
  finished: boolean;
  finishedAt: number;
}

export function progressOf(run: RunState, times: readonly number[]): RacerProgress {
  const doneStrokes = run.results.reduce((s, r) => s + r.strokes, 0);
  const doneUndos = run.results.reduce((s, r) => s + r.undos, 0);
  const cur = run.complete ? 0 : run.voyage.strokes;
  let tempo = 0;
  for (let k = 1; k < times.length; k++) tempo += Math.min(TEMPO_CAP_MS, Math.max(0, times[k] - times[k - 1]));
  return {
    voyagesCleared: run.results.length,
    shells: totalShells(run.results),
    strokes: doneStrokes + cur,
    undos: doneUndos + (run.complete ? 0 : run.voyage.undos),
    riptides: riptidesOf(run.results),
    goldenReach: goldenReach(run.results),
    tempo,
    finished: run.complete,
    finishedAt: run.complete && times.length ? times[times.length - 1] : 0,
  };
}

/** Rank comparator: negative when a ranks above b, 0 for a shared rank. Never uses time. */
export function compareRacers(a: RacerProgress, b: RacerProgress): number {
  if (a.finished !== b.finished) return a.finished ? -1 : 1;
  if (!a.finished) {
    // Out of time: progress (voyages cleared, shells, strokes on the current voyage).
    if (a.voyagesCleared !== b.voyagesCleared) return b.voyagesCleared - a.voyagesCleared;
  }
  if (a.shells !== b.shells) return b.shells - a.shells;
  if (a.strokes !== b.strokes) return a.strokes - b.strokes;
  if (a.undos !== b.undos) return a.undos - b.undos;
  if (!a.finished) return 0;
  if (a.riptides !== b.riptides) return b.riptides - a.riptides;
  return a.goldenReach - b.goldenReach;
}

/** Competition ranks (1, 1, 3, ...): tied racers share a place (DEAD HEAT) and co-winners share the crown. */
export function placesOf<T extends { p: RacerProgress }>(list: readonly T[]): number[] {
  return list.map((x) => 1 + list.filter((y) => compareRacers(y.p, x.p) < 0).length);
}

/** A single integer score the server can store (higher is better), consistent with compareRacers. No time component. */
export function scoreOf(p: RacerProgress): number {
  const base = (p.finished ? 1 : 0) * 1e12 + p.voyagesCleared * 1e11 + p.shells * 1e9 - Math.min(999, p.strokes) * 1e6 - Math.min(99, p.undos) * 1e4;
  return p.finished ? base + Math.min(99, p.riptides) * 100 + (99 - Math.min(99, p.goldenReach)) : base;
}

// ---------------------------------------------------------------------------
// The room

export interface Racer {
  seat: number;
  name: string;
  avatar: 'you' | 'blue' | 'green' | 'orange';
  /** null = a person (the local player); otherwise a house-crew bot. */
  profile: BotProfile | null;
  run: RunState;
  times: number[];
  /** Shield from First Find, until it absorbs a Splash. */
  shield: boolean;
  /** The Splash waiting for this racer's next voyage start (shown as the wave meter). */
  pending: { id: string; from: number; at: number } | null;
  /** Last racer who splashed this one (revenge target, R2). */
  revenge: number;
  /** Voyage indexes this racer won First Find on. */
  firstFinds: number[];
  /** Splashes this racer sent and had blocked by a counter (stats only). */
  sent: number;
}

export type RoomEvent =
  | { type: 'clear'; seat: number; voyage: number; par: boolean; shells: number; strokes: number; finished: boolean }
  | { type: 'aim'; from: number; options: number[]; until: number }
  | { type: 'sent'; from: number; to: number; id: string; chosen: boolean; at: number }
  | { type: 'no-target'; from: number }
  | { type: 'blocked'; seat: number; by: 'shield' | 'counter'; from: number; id: string; voyage: number }
  | { type: 'landed'; seat: number; from: number; id: string; voyage: number; parFrom: number; parTo: number }
  | { type: 'first-find'; seat: number; voyage: number };

export interface Room {
  seed: number;
  boards: Board[];
  racers: Racer[];
  /** Seat that won First Find per voyage (-1 = not found yet). */
  firstFind: number[];
  /** Open aims (a Par clear waiting up to 3 s for its sender to pick a target). */
  aims: { from: number; until: number }[];
  seq: number;
}

export function createRoom(seed: number, crew: readonly CrewSeat[] = HOUSE_CREW, boards: Board[] = showdownBoards(seed)): Room {
  const racers: Racer[] = [
    { seat: 0, name: 'You', avatar: 'you', profile: null, run: createRun(boards, SHOWDOWN_KNOBS), times: [], shield: false, pending: null, revenge: -1, firstFinds: [], sent: 0 },
    ...crew.map((c) => ({ seat: c.seat, name: c.name, avatar: c.avatar, profile: c.profile, run: createRun(boards, SHOWDOWN_KNOBS), times: [], shield: false, pending: null, revenge: -1, firstFinds: [], sent: 0 } as Racer)),
  ];
  return { seed, boards, racers, firstFind: boards.map(() => -1), aims: [], seq: 0 };
}

export function racerOf(room: Room, seat: number): Racer | undefined {
  return room.racers.find((r) => r.seat === seat);
}

/** Splashable (R2): has a voyage still to start and nothing queued on it. */
export function splashableSeats(room: Room, from: number): number[] {
  return room.racers.filter((r) => r.seat !== from && !r.run.complete && !r.run.failed && r.run.index < r.run.boards.length - 1 && !r.pending).map((r) => r.seat);
}

/** Auto target (R2): revenge, else the splashable racer directly ahead, else the one with the most progress. -1 = none. */
export function autoTarget(room: Room, from: number): number {
  const options = splashableSeats(room, from);
  if (!options.length) return -1;
  const me = racerOf(room, from);
  if (me && me.revenge >= 0 && options.includes(me.revenge)) return me.revenge;
  const prog = (r: Racer) => progressOf(r.run, r.times);
  const order = room.racers.filter((r) => options.includes(r.seat)).sort((a, b) => compareRacers(prog(a), prog(b)) || a.seat - b.seat);
  if (me) {
    const mine = prog(me);
    // Directly ahead: the lowest-ranked racer that still ranks above me.
    const ahead = order.filter((r) => compareRacers(prog(r), mine) < 0);
    if (ahead.length) return ahead[ahead.length - 1].seat;
  }
  return order[0].seat;
}

/** Send a Splash from `from` to `to` (chosen by the player, or auto). Returns the event. */
export function sendSplash(room: Room, from: number, to: number, at: number, chosen: boolean): RoomEvent {
  room.aims = room.aims.filter((a) => a.from !== from);
  const target = racerOf(room, to);
  if (!target || !splashableSeats(room, from).includes(to)) {
    const auto = autoTarget(room, from);
    if (auto < 0) return { type: 'no-target', from };
    return sendSplash(room, from, auto, at, false);
  }
  room.seq += 1;
  const id = `${room.seed >>> 0}:${room.seq}:${from}>${to}`;
  target.pending = { id, from, at };
  const sender = racerOf(room, from);
  if (sender) sender.sent += 1;
  return { type: 'sent', from, to, id, chosen, at };
}

/** Close any aim that ran out (auto-target). */
export function closeAims(room: Room, now: number): RoomEvent[] {
  const out: RoomEvent[] = [];
  for (const a of room.aims.slice()) if (now >= a.until) out.push(sendSplash(room, a.from, -1, now, false));
  return out;
}

/**
 * Apply one action for a racer. Handles First Find, the counter, Splash
 * landings at the next voyage start, and the send (an aim for the person,
 * auto for crew). Returns the engine events and the room events.
 */
export function roomApply(room: Room, seat: number, action: number, t: number): { ok: boolean; recorded: boolean; events: CqEvent[]; room: RoomEvent[] } {
  const racer = racerOf(room, seat);
  if (!racer) return { ok: false, recorded: false, events: [], room: [] };
  const voyage = racer.run.index;
  const res = applyAction(racer.run, action, t);
  const out: RoomEvent[] = [];
  if (!res.ok || !res.recorded) return { ok: res.ok, recorded: false, events: res.events, room: out };
  racer.run = res.run;
  racer.times.push(t);
  for (const ev of res.events) {
    if (ev.type === 'stroke' && ev.golden && room.firstFind[voyage] < 0) {
      room.firstFind[voyage] = seat;
      racer.firstFinds.push(voyage);
      racer.shield = true;
      out.push({ type: 'first-find', seat, voyage });
    }
    if (ev.type !== 'clear') continue;
    out.push({ type: 'clear', seat, voyage: ev.index, par: ev.result.shellPar, shells: totalShells(racer.run.results), strokes: ev.result.strokes, finished: ev.runComplete });
    const pend = racer.pending;
    let countered = false;
    if (pend && !ev.runComplete) {
      racer.pending = null;
      racer.revenge = pend.from;
      let sp: SplashStart;
      if (ev.result.shellPar) { sp = { id: pend.id, blocked: 1, by: 'counter' }; countered = true; }
      else if (racer.shield) { sp = { id: pend.id, blocked: 1, by: 'shield' }; racer.shield = false; }
      else sp = { id: pend.id, blocked: 0, by: null };
      const q = queueSplash(racer.run, racer.run.index, sp);
      if (q.ok) racer.run = q.run;
      if (sp.blocked) out.push({ type: 'blocked', seat, by: sp.by as 'shield' | 'counter', from: pend.from, id: pend.id, voyage: racer.run.index });
      else {
        const b = racer.run.boards[racer.run.index];
        out.push({ type: 'landed', seat, from: pend.from, id: pend.id, voyage: racer.run.index, parFrom: b.par, parTo: racer.run.voyage.parT });
      }
    }
    // A Par clear sends one Splash only when nothing was incoming (never both).
    if (ev.result.shellPar && !countered) {
      const options = splashableSeats(room, seat);
      if (!options.length) out.push({ type: 'no-target', from: seat });
      else if (racer.profile === null) {
        room.aims.push({ from: seat, until: t + AIM_MS });
        out.push({ type: 'aim', from: seat, options, until: t + AIM_MS });
      } else out.push(sendSplash(room, seat, autoTarget(room, seat), t, false));
    }
  }
  return { ok: true, recorded: true, events: res.events, room: out };
}

// ---------------------------------------------------------------------------
// House-crew bots

const PROFILE = {
  rookie: { think: [2600, 4200], mistake: 0.22, gold: 0.35 },
  regular: { think: [1900, 3200], mistake: 0.1, gold: 0.7 },
  shark: { think: [1400, 2400], mistake: 0.03, gold: 1 },
} as const;

export interface Bot {
  seat: number;
  profile: BotProfile;
  rand: () => number;
  nextAt: number;
  pendingUndo: boolean;
  goldThisVoyage: boolean;
  voyage: number;
}

export function createBot(seed: number, seat: CrewSeat, startMs = 0): Bot {
  const rand = mulberry32(((seed >>> 0) ^ Math.imul(seat.seat + 1, 0x9e3779b1)) >>> 0);
  const bot: Bot = { seat: seat.seat, profile: seat.profile, rand, nextAt: 0, pendingUndo: false, goldThisVoyage: rand() < PROFILE[seat.profile].gold, voyage: 0 };
  bot.nextAt = startMs + 1200 + thinkMs(bot);
  return bot;
}

function thinkMs(bot: Bot): number {
  const [lo, hi] = PROFILE[bot.profile].think;
  return Math.round(lo + (hi - lo) * bot.rand());
}

/** Advance one crew bot to `nowMs` inside the room, returning the room events it caused. */
export function stepBot(room: Room, bot: Bot, nowMs: number): RoomEvent[] {
  const out: RoomEvent[] = [];
  const racer = racerOf(room, bot.seat);
  if (!racer) return out;
  let guard = 0;
  while (!racer.run.complete && nowMs >= bot.nextAt && guard++ < 8) {
    const at = bot.nextAt;
    const run = racer.run;
    const board = currentBoard(run);
    const v = run.voyage;
    if (run.index !== bot.voyage) {
      bot.voyage = run.index;
      bot.goldThisVoyage = bot.rand() < PROFILE[bot.profile].gold;
    }
    let action: number;
    if (v.stalled || (distanceFrom(board, v, false) > strokesLeft(run) && v.stack.length > 0
      && distanceFrom(board, { pos: board.start, mask: 0, golden: false, moves: 0, phase: v.phase }, false) <= strokesLeft(run) + v.spent)) {
      // Out of budget: start the voyage fresh, like a person would.
      action = A_RESTART;
      bot.pendingUndo = false;
    } else if (bot.pendingUndo) {
      action = A_UNDO;
      bot.pendingUndo = false;
    } else if (bot.rand() < PROFILE[bot.profile].mistake) {
      // A human wrong turn, noticed and undone on the next think.
      const good = hintFrom(board, v, 1, Infinity)[0];
      const dirs = [0, 1, 2, 3].filter((d) => d !== good);
      action = dirs[Math.floor(bot.rand() * dirs.length)];
      bot.pendingUndo = true;
    } else {
      const budget = bot.goldThisVoyage ? strokesLeft(run) : 0;
      action = hintFrom(board, v, 1, budget)[0] ?? 0;
    }
    const res = roomApply(room, bot.seat, action, at);
    if (!res.recorded) bot.pendingUndo = false; // bumped or refused: rethink
    out.push(...res.room);
    bot.nextAt = at + thinkMs(bot);
  }
  return out;
}

/** Deterministic full crew run inside the window, with no human in the room (server ghost fill and tests). */
export function crewOnlyRoom(seed: number, windowMs = SHOWDOWN_WINDOW_MS): Room {
  const room = createRoom(seed);
  const bots = HOUSE_CREW.map((c) => createBot(seed, c, 0));
  for (let t = 0; t <= windowMs; t += 250) {
    for (const b of bots) stepBot(room, b, t);
    closeAims(room, t);
    if (room.racers.slice(1).every((r) => r.run.complete)) break;
  }
  return room;
}
