/**
 * Same-Board Showdown (design 14.1) as a pure, seeded sim.
 *
 * Everyone races the same two sealed-style voyages (Standard + Treasure, tide
 * set) inside a 3-minute window. Rank = shells desc, strokes asc, undos asc,
 * then capped tempo (each gap capped at 2 s, so looking up at the line costs
 * nothing). Unfinished racers rank by progress, never zero. A Par clear sends a
 * Splash to the provisional leader (their tide jumps one notch at their next
 * stroke boundary); a golden pearl arms a Shield that absorbs one Splash.
 *
 * House-crew seats are solver bots with human think times and human
 * mistakes, fully deterministic from (seed, seat, profile). This file is the
 * PartyGame contract the server mirrors: timeline(seed) = boards,
 * resolve(actions, times) = score and stats, botActions(...) = crew seats,
 * ghostFill(...) = a dropped player's own actions then their bot.
 */

import {
  A_SPLASH, A_UNDO, applyAction, createRun, currentBoard, PUZZLE_KNOBS, totalShells,
  type Board, type Knobs, type RunState,
} from './rules';
import { hintFrom } from './solver';
import { showdownBoards } from './library';

export const SHOWDOWN_WINDOW_MS = 180000;
export const TEMPO_CAP_MS = 2000;
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

export interface RacerProgress {
  voyagesCleared: number;
  shells: number;
  strokes: number;
  undos: number;
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
    tempo,
    finished: run.complete,
    finishedAt: run.complete && times.length ? times[times.length - 1] : 0,
  };
}

/** Rank comparator: negative when a ranks above b. */
export function compareRacers(a: RacerProgress, b: RacerProgress): number {
  if (a.finished !== b.finished) return a.finished ? -1 : 1;
  if (!a.finished) {
    // Out of time: progress (voyages cleared, shells, strokes on the current voyage).
    if (a.voyagesCleared !== b.voyagesCleared) return b.voyagesCleared - a.voyagesCleared;
  }
  if (a.shells !== b.shells) return b.shells - a.shells;
  if (a.strokes !== b.strokes) return a.strokes - b.strokes;
  if (a.undos !== b.undos) return a.undos - b.undos;
  return a.tempo - b.tempo;
}

/** A single integer score the server can store (higher is better), consistent with compareRacers for finishers. */
export function scoreOf(p: RacerProgress): number {
  const tempoS = Math.min(999, Math.floor(p.tempo / 1000));
  return (p.finished ? 1 : 0) * 1e9 + p.voyagesCleared * 1e8 + p.shells * 1e6 - Math.min(999, p.strokes) * 1e3 - Math.min(9, p.undos) * 100 - Math.min(99, tempoS);
}

// ---------------------------------------------------------------------------
// House-crew bots

const PROFILE = {
  rookie: { think: [2600, 4200], mistake: 0.22, gold: 0.35 },
  regular: { think: [1900, 3200], mistake: 0.1, gold: 0.7 },
  shark: { think: [1400, 2400], mistake: 0.03, gold: 1 },
} as const;

export interface Bot {
  seat: CrewSeat;
  run: RunState;
  times: number[];
  rand: () => number;
  nextAt: number;
  pendingUndo: boolean;
  goldThisVoyage: boolean;
  inbox: number;
  startedVoyageAt: number;
}

export function createBot(seed: number, seat: CrewSeat, boards: Board[], startMs = 0): Bot {
  const rand = mulberry32(((seed >>> 0) ^ Math.imul(seat.seat + 1, 0x9e3779b1)) >>> 0);
  const bot: Bot = {
    seat, run: createRun(boards, SHOWDOWN_KNOBS), times: [], rand, nextAt: 0, pendingUndo: false,
    goldThisVoyage: rand() < PROFILE[seat.profile].gold, inbox: 0, startedVoyageAt: startMs,
  };
  bot.nextAt = startMs + 1200 + thinkMs(bot);
  return bot;
}

function thinkMs(bot: Bot): number {
  const [lo, hi] = PROFILE[bot.seat.profile].think;
  return Math.round(lo + (hi - lo) * bot.rand());
}

export interface BotEvent {
  seat: number;
  type: 'clear' | 'finish' | 'splashed' | 'shield';
  voyage: number;
  par: boolean;
  shells: number;
  strokes: number;
}

/** Advance a bot to `nowMs`, returning what happened (clears, received splashes). */
export function stepBot(bot: Bot, nowMs: number): BotEvent[] {
  const out: BotEvent[] = [];
  let guard = 0;
  while (!bot.run.complete && nowMs >= bot.nextAt && guard++ < 8) {
    const at = bot.nextAt;
    const run = bot.run;
    const board = currentBoard(run);
    const v = run.voyage;
    let action: number;
    if (bot.inbox > 0 && !v.stalled) {
      bot.inbox -= 1;
      action = A_SPLASH;
    } else if (v.stalled || bot.pendingUndo) {
      action = A_UNDO;
      bot.pendingUndo = false;
    } else if (bot.rand() < PROFILE[bot.seat.profile].mistake) {
      // A human wrong turn, noticed and undone on the next think.
      const good = hintFrom(board, v, 1, Infinity)[0];
      const dirs = [0, 1, 2, 3].filter((d) => d !== good);
      action = dirs[Math.floor(bot.rand() * dirs.length)];
      bot.pendingUndo = true;
    } else {
      const budget = bot.goldThisVoyage ? Infinity : 0;
      action = hintFrom(board, v, 1, budget)[0] ?? 0;
    }
    const res = applyAction(run, action);
    if (res.ok && res.recorded) {
      bot.run = res.run;
      bot.times.push(at);
      for (const ev of res.events) {
        if (ev.type === 'clear') {
          out.push({ seat: bot.seat.seat, type: ev.runComplete ? 'finish' : 'clear', voyage: ev.index, par: ev.result.shellPar, shells: totalShells(bot.run.results), strokes: ev.result.strokes });
          bot.goldThisVoyage = bot.rand() < PROFILE[bot.seat.profile].gold;
        } else if (ev.type === 'splash') {
          out.push({ seat: bot.seat.seat, type: ev.blocked ? 'shield' : 'splashed', voyage: bot.run.index, par: false, shells: totalShells(bot.run.results), strokes: 0 });
        }
      }
    } else if (res.ok && !res.recorded) {
      bot.pendingUndo = false; // bumped: no stroke spent, just rethink
    } else {
      bot.pendingUndo = false;
    }
    bot.nextAt = at + (action === A_SPLASH ? 300 : thinkMs(bot));
  }
  return out;
}

/** Deterministic full bot run inside the window (server botTaps / ghost fill). */
export function botActions(seed: number, seat: CrewSeat, boards: Board[], fromMs = 0, windowMs = SHOWDOWN_WINDOW_MS): { actions: number[]; times: number[] } {
  const bot = createBot(seed, seat, boards, fromMs);
  for (let t = fromMs; t <= windowMs && !bot.run.complete; t += 250) stepBot(bot, t);
  return { actions: bot.run.actions.flat(), times: bot.times };
}

/** Who a Par clear splashes: the provisional leader among the other racers (never yourself). */
export function splashTarget(progress: { seat: number; p: RacerProgress }[], fromSeat: number): number {
  const others = progress.filter((x) => x.seat !== fromSeat && !x.p.finished);
  if (!others.length) return -1;
  others.sort((a, b) => compareRacers(a.p, b.p));
  return others[0].seat;
}
