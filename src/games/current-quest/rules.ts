/**
 * Current Quest rules engine (design v4, section 3). Pure TypeScript with no
 * React Native imports: the same file runs in the app, in `node --test`, in the
 * library generator, and is the reference the PHP verifier ports line by line.
 *
 * A run is three voyages on 5x5 lagoon boards. One stroke = one swim (or a
 * tread). Currents carry the shark tile by tile, the tide flips every P moves
 * and dries the sandbars, the chest opens once every required pearl is taken.
 * Shells (Clear, Par, Golden) are the only thing a player chases.
 *
 * Action codes (proof `a[]`):
 *   0 up, 1 right, 2 down, 3 left, 4 tread, 5 undo, 6 restart voyage,
 *   7 continue (Trial), 8 splash received (Showdown), 9 tide tip.
 */

export const GRID = 5;
export const CELLS = GRID * GRID;

export const A_UP = 0;
export const A_RIGHT = 1;
export const A_DOWN = 2;
export const A_LEFT = 3;
export const A_TREAD = 4;
export const A_UNDO = 5;
export const A_RESTART = 6;
export const A_CONTINUE = 7;
export const A_SPLASH = 8;
export const A_TIP = 9;

export type Dir = 0 | 1 | 2 | 3;
export const DIR_DR = [-1, 0, 1, 0] as const;
export const DIR_DC = [0, 1, 0, -1] as const;
export const DIR_NAMES = ['up', 'right', 'down', 'left'] as const;
const CURRENT_CHARS = '^>v<';

export const TIDE_HIGH = 0;
export const TIDE_LOW = 1;

export type Slot = 'warmup' | 'standard' | 'treasure';
export type MechanicSet = 'C' | 'CT';
export type Profile = 'puzzle' | 'trial';

/**
 * A board as stored in the library. `tiles` is 25 chars, row-major:
 *   `.` open water, `#` coral rock, `^ > v <` currents, `s` sandbar.
 * Start, chest, pearls and golden pearl are positions on top of the tiles.
 */
export interface Board {
  readonly id: string;
  readonly name: string;
  readonly slot: Slot;
  readonly set: MechanicSet;
  readonly ruleset: number;
  readonly tiles: string;
  readonly start: number;
  readonly chest: number;
  readonly pearls: readonly number[];
  /** -1 when the board has no golden pearl. */
  readonly golden: number;
  /** Tide period in moves; 0 = no tide. */
  readonly P: number;
  readonly par: number;
  readonly parGold: number;
  readonly authorRiptide: number;
  readonly decisionPoints?: number;
  readonly parIsRiptide?: boolean;
  /** The curation receipt ("Tread once so the sandbar sinks, then ride home"). */
  readonly aha?: string;
  /** Teach board: the one optional line of copy (shown for 2 s, never a gate). */
  readonly teach?: string;
  /** Eligible for the Ride Challenge coin pool (fixed difficulty window). */
  readonly coin?: boolean;
  readonly grade?: number;
}

export interface Knobs {
  readonly profile: Profile;
  /** Life rings at run start (Trial only; 0 in Puzzle). */
  readonly rings: number;
  /** Strokes added by a Continue (Trial). */
  readonly continueSize: number;
  /** Slack per slot: limit = max(par + slack, parGold + 2). */
  readonly slack: Readonly<Record<Slot, number>>;
  /** Same-Board Showdown: golden pearls arm a Shield against one Splash. */
  readonly showdown?: boolean;
}

export const PUZZLE_KNOBS: Knobs = { profile: 'puzzle', rings: 0, continueSize: 2, slack: { warmup: 4, standard: 3, treasure: 3 } };
export const RIDE_KNOBS: Knobs = { profile: 'trial', rings: 2, continueSize: 2, slack: { warmup: 4, standard: 3, treasure: 3 } };
export const LINE_BONUS_KNOBS: Knobs = { profile: 'trial', rings: 3, continueSize: 2, slack: { warmup: 4, standard: 3, treasure: 3 } };

// ---------------------------------------------------------------------------
// Geometry and tiles

export function rowOf(i: number): number { return (i / GRID) | 0; }
export function colOf(i: number): number { return i % GRID; }

/** NEIGHBOR[i * 4 + d]: neighbour of cell i in direction d, or -1 off the board. */
const NEIGHBOR: number[] = (() => {
  const out: number[] = [];
  for (let i = 0; i < CELLS; i++) {
    for (let d = 0; d < 4; d++) {
      const r = ((i / GRID) | 0) + DIR_DR[d];
      const c = (i % GRID) + DIR_DC[d];
      out.push(r < 0 || r >= GRID || c < 0 || c >= GRID ? -1 : r * GRID + c);
    }
  }
  return out;
})();

/** Neighbour of `i` in direction `d`, or -1 off the board (or when i is -1). */
export function stepCell(i: number, d: number): number {
  if (i < 0 || i >= CELLS) return -1;
  return NEIGHBOR[i * 4 + d];
}

export function opposite(d: number): number { return (d + 2) % 4; }

/** Current direction of a tile char, or -1. */
export function currentDir(ch: string): number {
  return CURRENT_CHARS.indexOf(ch);
}

export function tideAt(P: number, moves: number, phase: number): number {
  if (!P) return TIDE_HIGH;
  return (((moves + phase) / P) | 0) % 2;
}

/** Moves until the tide flips (0 when the board has no tide). */
export function movesToTurn(P: number, moves: number, phase: number): number {
  if (!P) return 0;
  const k = moves + phase;
  return P - (k % P);
}

export function limitFor(board: Board, knobs: Knobs): number {
  const slack = knobs.slack[board.slot] ?? 3;
  return Math.max(board.par + slack, board.parGold + 2);
}

// ---------------------------------------------------------------------------
// Dihedral transforms (8). Boards are stored canonical and issued under one.

/** Map a cell under transform t (0..7): t&4 transposes, then t&3 rotates 90 deg clockwise t times. */
export function transformCell(i: number, t: number): number {
  let r = rowOf(i);
  let c = colOf(i);
  if (t & 4) { const x = r; r = c; c = x; }
  for (let k = 0; k < (t & 3); k++) { const nr = c; const nc = GRID - 1 - r; r = nr; c = nc; }
  return r * GRID + c;
}

export function transformDir(d: number, t: number): number {
  // Transform a unit vector the same way as a cell offset.
  let dr: number = DIR_DR[d];
  let dc: number = DIR_DC[d];
  if (t & 4) { const x = dr; dr = dc; dc = x; }
  for (let k = 0; k < (t & 3); k++) { const ndr = dc; const ndc = -dr; dr = ndr; dc = ndc; }
  for (let n = 0; n < 4; n++) if (DIR_DR[n] === dr && DIR_DC[n] === dc) return n;
  return d;
}

export function transformBoard(board: Board, t: number): Board {
  if (!t) return board;
  const out: string[] = new Array(CELLS).fill('.');
  for (let i = 0; i < CELLS; i++) {
    const ch = board.tiles[i];
    const cd = currentDir(ch);
    out[transformCell(i, t)] = cd >= 0 ? CURRENT_CHARS[transformDir(cd, t)] : ch;
  }
  return {
    ...board,
    id: `${board.id}~${t}`,
    tiles: out.join(''),
    start: transformCell(board.start, t),
    chest: transformCell(board.chest, t),
    pearls: board.pearls.map((p) => transformCell(p, t)),
    golden: board.golden >= 0 ? transformCell(board.golden, t) : -1,
  };
}

// ---------------------------------------------------------------------------
// Voyage state

interface Snap {
  pos: number;
  mask: number;
  golden: boolean;
  strokes: number;
  spent: number;
  moves: number;
  flow: number;
  ripTiles: number;
  beached: boolean;
  shield: boolean;
}

export interface Voyage {
  pos: number;
  /** Bit k = required pearl k collected. */
  mask: number;
  golden: boolean;
  strokes: number;
  spent: number;
  moves: number;
  /** Splash offset (never undone). */
  phase: number;
  undos: number;
  tips: number;
  continues: number;
  restarts: number;
  limitBonus: number;
  flow: number;
  /** Tiles carried while Riptide was lit (Author medal only). */
  ripTiles: number;
  beached: boolean;
  cleared: boolean;
  stalled: boolean;
  shield: boolean;
  /** Splash-adjusted par targets. */
  parT: number;
  parGoldT: number;
  stack: Snap[];
}

export interface VoyageResult {
  readonly boardId: string;
  readonly cleared: boolean;
  readonly shellClear: boolean;
  readonly shellPar: boolean;
  readonly shellGolden: boolean;
  readonly shells: number;
  readonly strokes: number;
  readonly spent: number;
  readonly limit: number;
  readonly undos: number;
  readonly tips: number;
  readonly continues: number;
  readonly ripTiles: number;
  readonly requiredPearls: number;
  readonly treasure: number;
  /** 0 none, 1 bronze, 2 silver, 3 gold, 4 author. */
  readonly medal: number;
}

export interface RunState {
  readonly boards: readonly Board[];
  readonly knobs: Knobs;
  index: number;
  voyage: Voyage;
  rings: number;
  failed: boolean;
  complete: boolean;
  results: VoyageResult[];
  /** Actions applied per voyage (proof). */
  actions: number[][];
}

export function newVoyage(board: Board, phase = 0): Voyage {
  return {
    pos: board.start, mask: 0, golden: false, strokes: 0, spent: 0, moves: 0, phase,
    undos: 0, tips: 0, continues: 0, restarts: 0, limitBonus: 0, flow: 0, ripTiles: 0,
    beached: false, cleared: false, stalled: false, shield: false,
    parT: board.par, parGoldT: board.parGold, stack: [],
  };
}

export function createRun(boards: readonly Board[], knobs: Knobs): RunState {
  return {
    boards, knobs, index: 0, voyage: newVoyage(boards[0]),
    rings: knobs.profile === 'trial' ? knobs.rings : 0,
    failed: false, complete: false, results: [], actions: boards.map(() => []),
  };
}

export function cloneVoyage(v: Voyage): Voyage {
  return { ...v, stack: v.stack.slice() };
}

export function cloneRun(run: RunState): RunState {
  return { ...run, voyage: cloneVoyage(run.voyage), results: run.results.slice(), actions: run.actions.map((a) => a.slice()) };
}

export function fullMask(board: Board): number {
  return (1 << board.pearls.length) - 1;
}

export function chestLocked(board: Board, mask: number): boolean {
  return mask !== fullMask(board);
}

export function currentBoard(run: RunState): Board {
  return run.boards[Math.min(run.index, run.boards.length - 1)];
}

export function voyageLimit(run: RunState): number {
  return limitFor(currentBoard(run), run.knobs);
}

export function strokesLeft(run: RunState): number {
  return voyageLimit(run) + run.voyage.limitBonus - run.voyage.spent;
}

// ---------------------------------------------------------------------------
// Events (the presentation layer turns these into FX, audio and haptics)

export type BumpReason = 'edge' | 'rock' | 'dry' | 'locked' | 'upstream';

export type CqEvent =
  | { type: 'bump'; dir: number; reason: BumpReason; target: number }
  | {
    type: 'stroke';
    dir: number; // -1 tread
    /** Cells visited: [from, swimTarget, ...carried] (tread: [from]). */
    path: number[];
    carried: number;
    /** Required pearls collected, as board pearl indices, with the path step they were taken at. */
    pearls: { k: number; cell: number; at: number }[];
    golden: boolean;
    goldenAt: number;
    unlocked: boolean;
    unlockedAt: number;
    cleared: boolean;
    tideBefore: number;
    tideAfter: number;
    beached: boolean;
    wasBeached: boolean;
    flow: number;
    riptide: boolean;
    riptideIgnite: boolean;
    left: number;
  }
  | { type: 'clear'; result: VoyageResult; index: number; runComplete: boolean }
  | { type: 'stall'; nearMiss: boolean }
  | { type: 'undo'; from: number; to: number; tideBefore: number; tideAfter: number; refunded: boolean }
  | { type: 'restart'; ringUsed: boolean }
  | { type: 'continue'; bonus: number }
  | { type: 'tip' ; ringUsed: boolean }
  | { type: 'splash'; blocked: boolean; tideBefore: number; tideAfter: number; beached: boolean }
  | { type: 'fail' };

export interface ApplyOutcome {
  ok: boolean;
  events: CqEvent[];
}

interface StrokeSim {
  pos: number;
  mask: number;
  golden: boolean;
  path: number[];
  pearls: { k: number; cell: number; at: number }[];
  goldenTaken: boolean;
  goldenAt: number;
  unlocked: boolean;
  unlockedAt: number;
  cleared: boolean;
  bump: BumpReason | null;
  bumpTarget: number;
}

function collect(board: Board, sim: StrokeSim): void {
  const cell = sim.pos;
  const k = board.pearls.indexOf(cell);
  if (k >= 0 && !(sim.mask & (1 << k))) {
    sim.mask |= 1 << k;
    sim.pearls.push({ k, cell, at: sim.path.length - 1 });
    if (sim.mask === fullMask(board)) { sim.unlocked = true; sim.unlockedAt = sim.path.length - 1; }
  }
  if (cell === board.golden && !sim.golden) {
    sim.golden = true;
    sim.goldenTaken = true;
    sim.goldenAt = sim.path.length - 1;
  }
}

/** Is `cell` enterable right now (ignores currents; used for the swim target and carry steps)? */
function blockReason(board: Board, cell: number, tide: number, mask: number): BumpReason | null {
  if (cell < 0) return 'edge';
  const ch = board.tiles[cell];
  if (ch === '#') return 'rock';
  if (ch === 's' && tide === TIDE_LOW) return 'dry';
  if (cell === board.chest && chestLocked(board, mask)) return 'locked';
  return null;
}

/**
 * Resolve one swim (dir 0..3) or tread (dir -1) from a position, pure. Used by
 * the engine, the preview table and the solver.
 */
export function simulateStroke(board: Board, pos: number, mask: number, golden: boolean, tide: number, dir: number): StrokeSim {
  const sim: StrokeSim = {
    pos, mask, golden, path: [pos], pearls: [], goldenTaken: false, goldenAt: -1,
    unlocked: false, unlockedAt: -1, cleared: false, bump: null, bumpTarget: -1,
  };
  if (dir < 0) return sim;
  const target = stepCell(pos, dir);
  const reason = blockReason(board, target, tide, mask);
  if (reason) { sim.bump = reason; sim.bumpTarget = target; return sim; }
  const back = opposite(dir);
  if (currentDir(board.tiles[target]) === back || currentDir(board.tiles[pos]) === back) {
    sim.bump = 'upstream'; sim.bumpTarget = target; return sim;
  }
  sim.pos = target;
  sim.path.push(target);
  collect(board, sim);
  if (target === board.chest) { sim.cleared = true; return sim; }
  let guard = 0;
  let c = currentDir(board.tiles[sim.pos]);
  while (c >= 0 && guard < 24) {
    guard++;
    const next = stepCell(sim.pos, c);
    if (blockReason(board, next, tide, sim.mask)) break;
    sim.pos = next;
    sim.path.push(next);
    collect(board, sim);
    if (next === board.chest) { sim.cleared = true; break; }
    c = currentDir(board.tiles[sim.pos]);
  }
  return sim;
}

function snapOf(v: Voyage): Snap {
  return { pos: v.pos, mask: v.mask, golden: v.golden, strokes: v.strokes, spent: v.spent, moves: v.moves, flow: v.flow, ripTiles: v.ripTiles, beached: v.beached, shield: v.shield };
}

export function voyageResult(board: Board, v: Voyage, knobs: Knobs): VoyageResult {
  const limit = limitFor(board, knobs);
  const cleared = v.cleared;
  const target = v.golden ? v.parGoldT : v.parT;
  const shellPar = cleared && v.undos === 0 && v.tips === 0 && v.continues === 0 && v.strokes <= target;
  const shellGolden = cleared && v.golden;
  const shells = (cleared ? 1 : 0) + (shellPar ? 1 : 0) + (shellGolden ? 1 : 0);
  const required = board.pearls.length;
  const treasure = cleared ? 50 * required + (v.golden ? 200 : 0) + 40 * Math.max(0, limit - v.spent) : 0;
  const gold = shellPar && shellGolden;
  const medal = !cleared ? 0 : gold ? (v.ripTiles >= board.authorRiptide ? 4 : 3) : shellPar ? 2 : 1;
  return {
    boardId: board.id, cleared, shellClear: cleared, shellPar, shellGolden, shells,
    strokes: v.strokes, spent: v.spent, limit, undos: v.undos, tips: v.tips, continues: v.continues,
    ripTiles: v.ripTiles, requiredPearls: required, treasure, medal,
  };
}

/** Optional hook so a Splash can raise the par target (the solver lives in solver.ts). */
export type RemainingParFn = (board: Board, v: Voyage, withGolden: boolean) => number;
let remainingPar: RemainingParFn | null = null;
export function setRemainingParSolver(fn: RemainingParFn | null): void { remainingPar = fn; }

/**
 * Apply one action to the run (mutates a clone and returns it). Illegal
 * actions return ok=false and leave the run unchanged. Bumps return ok=true
 * with a bump event but are NOT recorded (design 3.3: bumps are not proof).
 */
export function applyAction(runIn: RunState, action: number): { run: RunState; ok: boolean; events: CqEvent[]; recorded: boolean } {
  if (runIn.failed || runIn.complete) return { run: runIn, ok: false, events: [], recorded: false };
  const run = cloneRun(runIn);
  const board = currentBoard(run);
  const v = run.voyage;
  const trial = run.knobs.profile === 'trial';
  const limit = limitFor(board, run.knobs);
  const events: CqEvent[] = [];
  const fail = () => ({ run: runIn, ok: false, events: [] as CqEvent[], recorded: false });

  if (v.cleared) return fail();

  if (action >= A_UP && action <= A_TREAD) {
    if (v.stalled) return fail();
    if (action === A_TREAD && !board.P) return fail();
    const tideBefore = tideAt(board.P, v.moves, v.phase);
    const dir = action === A_TREAD ? -1 : action;
    const sim = simulateStroke(board, v.pos, v.mask, v.golden, tideBefore, dir);
    if (sim.bump) {
      events.push({ type: 'bump', dir, reason: sim.bump, target: sim.bumpTarget });
      return { run: runIn, ok: true, events, recorded: false };
    }
    v.stack.push(snapOf(v));
    const wasBeached = v.beached;
    v.pos = sim.pos;
    v.mask = sim.mask;
    v.golden = sim.golden;
    if (sim.goldenTaken && run.knobs.showdown) v.shield = true;
    v.strokes += 1;
    v.spent += 1;
    v.moves += 1;
    const carried = dir < 0 ? 0 : Math.max(0, sim.path.length - 2);
    if (carried >= 1) v.flow += 1; else v.flow = 0;
    const riptide = v.flow >= 3;
    if (riptide) v.ripTiles += carried;
    let tideAfter = tideBefore;
    if (sim.cleared) {
      v.cleared = true;
      v.beached = false;
    } else {
      tideAfter = tideAt(board.P, v.moves, v.phase);
      v.beached = board.tiles[v.pos] === 's' && tideAfter === TIDE_LOW;
    }
    run.actions[run.index].push(action);
    events.push({
      type: 'stroke', dir, path: sim.path, carried, pearls: sim.pearls, golden: sim.goldenTaken, goldenAt: sim.goldenAt,
      unlocked: sim.unlocked, unlockedAt: sim.unlockedAt, cleared: sim.cleared, tideBefore, tideAfter,
      beached: v.beached, wasBeached, flow: v.flow, riptide, riptideIgnite: v.flow === 3,
      left: limit + v.limitBonus - v.spent,
    });
    if (sim.cleared) {
      finishVoyage(run, events);
    } else if (v.spent >= limit + v.limitBonus) {
      v.stalled = true;
      events.push({ type: 'stall', nearMiss: false });
      if (trial && run.rings <= 0) { run.failed = true; events.push({ type: 'fail' }); }
    }
    return { run, ok: true, events, recorded: true };
  }

  if (action === A_UNDO) {
    if (!v.stack.length) return fail();
    if (trial && v.stalled) return fail();
    const s = v.stack.pop() as Snap;
    const tideBefore = tideAt(board.P, v.moves, v.phase);
    const from = v.pos;
    const keepSpent = v.spent;
    v.pos = s.pos; v.mask = s.mask; v.golden = s.golden; v.strokes = s.strokes; v.moves = s.moves;
    v.flow = s.flow; v.ripTiles = s.ripTiles; v.shield = s.shield;
    v.spent = trial ? keepSpent : s.spent;
    v.undos += 1;
    const tideAfter = tideAt(board.P, v.moves, v.phase);
    v.beached = board.tiles[v.pos] === 's' && tideAfter === TIDE_LOW;
    v.stalled = v.spent >= limit + v.limitBonus;
    run.actions[run.index].push(action);
    events.push({ type: 'undo', from, to: v.pos, tideBefore, tideAfter, refunded: !trial });
    if (v.stalled) {
      // Trial: undo never refunds, so an undo that lands on the limit stalls again.
      events.push({ type: 'stall', nearMiss: false });
      if (trial && run.rings <= 0) { run.failed = true; events.push({ type: 'fail' }); }
    }
    return { run, ok: true, events, recorded: true };
  }

  if (action === A_RESTART) {
    if (trial && run.rings <= 0) return fail();
    if (!v.stack.length && !v.stalled && v.spent === 0) return fail();
    if (trial) run.rings -= 1;
    const fresh = newVoyage(board, v.phase);
    fresh.undos = v.undos;
    fresh.tips = v.tips;
    fresh.continues = v.continues;
    fresh.restarts = v.restarts + 1;
    // Puzzle: limitBonus only ever comes from Splashes (world state), so it survives a restart.
    fresh.limitBonus = trial ? 0 : v.limitBonus;
    fresh.shield = v.stack.length ? v.stack[0].shield : v.shield;
    fresh.parT = v.parT;
    fresh.parGoldT = v.parGoldT;
    fresh.beached = board.tiles[fresh.pos] === 's' && tideAt(board.P, 0, fresh.phase) === TIDE_LOW;
    run.voyage = fresh;
    run.actions[run.index].push(action);
    events.push({ type: 'restart', ringUsed: trial });
    return { run, ok: true, events, recorded: true };
  }

  if (action === A_CONTINUE) {
    if (!trial || !v.stalled || run.rings <= 0) return fail();
    run.rings -= 1;
    v.limitBonus += run.knobs.continueSize;
    v.continues += 1;
    v.stalled = false;
    run.actions[run.index].push(action);
    events.push({ type: 'continue', bonus: run.knobs.continueSize });
    return { run, ok: true, events, recorded: true };
  }

  if (action === A_SPLASH) {
    if (v.stalled) return fail();
    const tideBefore = tideAt(board.P, v.moves, v.phase);
    let blocked = false;
    if (v.shield) { v.shield = false; blocked = true; } else {
      v.phase += 1;
      // A Splash forces replanning, never a dead end: it brings 2 spare strokes.
      if (board.P) v.limitBonus += 2;
      if (remainingPar) {
        v.parT = Math.max(v.parT, v.strokes + remainingPar(board, v, false));
        v.parGoldT = Math.max(v.parGoldT, v.strokes + remainingPar(board, v, true));
      }
    }
    const tideAfter = tideAt(board.P, v.moves, v.phase);
    v.beached = board.tiles[v.pos] === 's' && tideAfter === TIDE_LOW;
    run.actions[run.index].push(action);
    events.push({ type: 'splash', blocked, tideBefore, tideAfter, beached: v.beached });
    return { run, ok: true, events, recorded: true };
  }

  if (action === A_TIP) {
    if (v.stalled) return fail();
    if (trial && run.rings <= 0) return fail();
    if (trial) run.rings -= 1;
    v.tips += 1;
    run.actions[run.index].push(action);
    events.push({ type: 'tip', ringUsed: trial });
    return { run, ok: true, events, recorded: true };
  }

  return fail();
}

function finishVoyage(run: RunState, events: CqEvent[]): void {
  const board = currentBoard(run);
  const result = voyageResult(board, run.voyage, run.knobs);
  run.results.push(result);
  const index = run.index;
  const runComplete = index >= run.boards.length - 1;
  events.push({ type: 'clear', result, index, runComplete });
  if (runComplete) {
    run.complete = true;
  } else {
    // A Shield armed by a golden pearl carries into the next Showdown voyage.
    const shield = run.voyage.shield;
    run.index += 1;
    run.voyage = newVoyage(run.boards[run.index]);
    run.voyage.shield = shield;
  }
}

// ---------------------------------------------------------------------------
// Scoring

export function totalShells(results: readonly VoyageResult[]): number {
  return results.reduce((s, r) => s + r.shells, 0);
}

export function treasureOf(results: readonly VoyageResult[]): number {
  return results.reduce((s, r) => s + r.treasure, 0);
}

/** Run stars (3.5): failed = 0; 3 to 5 shells = 1; 6 to 7 = 2; 8 to 9 = 3. */
export function starsFor(shells: number, complete: boolean): number {
  if (!complete) return 0;
  if (shells >= 8) return 3;
  if (shells >= 6) return 2;
  if (shells >= 3) return 1;
  return 0;
}

/** Shells still needed for the next star (results NEXT STAR line), or 0. */
export function shellsToNextStar(shells: number): number {
  if (shells < 6) return 6 - shells;
  if (shells < 8) return 8 - shells;
  return 0;
}

// ---------------------------------------------------------------------------
// Proof v2 and replay

export interface VoyageProof {
  readonly id: string;
  readonly tf: number;
  readonly a: readonly number[];
  /** ms since run start, one per action. */
  readonly t: readonly number[];
  /** ms since run start when the board finished landing (think floor anchor). */
  readonly ready: number;
}

export interface CurrentQuestProofV2 {
  readonly game: 'current';
  readonly v: 2;
  readonly context: string;
  readonly profile: Profile;
  readonly rings: number;
  /** The board seed (attempt 0: the issued seed; retries: deriveSeed(seed, attempt)). */
  readonly seed: number;
  readonly attempt?: number;
  readonly treasure: number;
  readonly stars: number;
  readonly shells: number;
  readonly elapsed_ms: number;
  readonly voyages: readonly VoyageProof[];
}

export interface ReplayVerdict {
  readonly ok: boolean;
  readonly reason?: string;
  readonly run?: RunState;
  readonly shells?: number;
  readonly treasure?: number;
  readonly stars?: number;
}

/** Interval floors (design 16), stamped at engine apply. */
export const PROOF_FLOORS = {
  minIntervalMs: 150,
  medianIntervalMs: 350,
  thinkFloorMs: { warmup: 600, standard: 1200, treasure: 1800 } as Record<Slot, number>,
  maxActionsPerVoyage: 160,
};

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = values.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Server-side style verification of a proof against the issued boards. The
 * boards must come from the issuer (seed -> ids + transforms), never from the
 * proof itself.
 */
export function verifyProof(boards: readonly Board[], knobs: Knobs, proof: CurrentQuestProofV2): ReplayVerdict {
  if (proof.game !== 'current' || proof.v !== 2) return { ok: false, reason: 'version' };
  if (proof.profile !== knobs.profile) return { ok: false, reason: 'profile' };
  if (proof.voyages.length !== boards.length) return { ok: false, reason: 'voyages' };
  let run = createRun(boards, knobs);
  let last = -1;
  for (let vi = 0; vi < proof.voyages.length; vi++) {
    const vp = proof.voyages[vi];
    const board = boards[vi];
    if (vp.id !== board.id.split('~')[0] || (vp.tf | 0) !== transformOf(board.id)) return { ok: false, reason: 'board' };
    if (vp.a.length !== vp.t.length) return { ok: false, reason: 'times' };
    if (vp.a.length > PROOF_FLOORS.maxActionsPerVoyage) return { ok: false, reason: 'too-many-actions' };
    if (run.index !== vi) return { ok: false, reason: 'order' };
    if (vp.t.length && vp.t[0] - vp.ready < (PROOF_FLOORS.thinkFloorMs[board.slot] ?? 600)) return { ok: false, reason: 'think-floor' };
    if (vp.ready < last) return { ok: false, reason: 'monotonic' };
    const gaps: number[] = [];
    let prev = vp.ready;
    for (let k = 0; k < vp.a.length; k++) {
      const t = vp.t[k];
      if (t < prev || t < last) return { ok: false, reason: 'monotonic' };
      if (k > 0) {
        const gap = t - vp.t[k - 1];
        if (gap < PROOF_FLOORS.minIntervalMs) return { ok: false, reason: 'interval' };
        gaps.push(gap);
      }
      prev = t;
      last = t;
      const res = applyAction(run, vp.a[k]);
      if (!res.ok || !res.recorded) return { ok: false, reason: `illegal@${vi}:${k}` };
      run = res.run;
    }
    if (gaps.length >= 3 && median(gaps) < PROOF_FLOORS.medianIntervalMs) return { ok: false, reason: 'median' };
    if (run.failed) break;
  }
  if (!run.complete) return { ok: false, reason: 'incomplete', run };
  const shells = totalShells(run.results);
  const treasure = treasureOf(run.results);
  const stars = starsFor(shells, true);
  if (shells !== proof.shells || treasure !== proof.treasure || stars !== proof.stars) return { ok: false, reason: 'claim', run, shells, treasure, stars };
  if (last > proof.elapsed_ms) return { ok: false, reason: 'elapsed' };
  return { ok: true, run, shells, treasure, stars };
}

export function transformOf(id: string): number {
  const at = id.indexOf('~');
  return at < 0 ? 0 : Number(id.slice(at + 1)) | 0;
}

// ---------------------------------------------------------------------------
// Preview (7.2): resolve every direction on a copy after each stroke.

export interface Preview {
  readonly dir: number;
  readonly valid: boolean;
  readonly bump: BumpReason | null;
  readonly path: number[];
  readonly carried: number;
  readonly clears: boolean;
  readonly pearls: number;
  readonly golden: boolean;
  readonly tideTurns: boolean;
  readonly beached: boolean;
  readonly ignitesRiptide: boolean;
  readonly fillsPip: boolean;
  /** Filled by the game with the solver: this stroke can no longer reach the chest in budget. */
  deadEnd: boolean;
}

export function previewFor(run: RunState, action: number): Preview {
  const board = currentBoard(run);
  const v = run.voyage;
  const dir = action === A_TREAD ? -1 : action;
  const tide = tideAt(board.P, v.moves, v.phase);
  const blocked = v.cleared || v.stalled || run.failed || (action === A_TREAD && !board.P);
  if (blocked) return { dir, valid: false, bump: null, path: [v.pos], carried: 0, clears: false, pearls: 0, golden: false, tideTurns: false, beached: false, ignitesRiptide: false, fillsPip: false, deadEnd: false };
  const sim = simulateStroke(board, v.pos, v.mask, v.golden, tide, dir);
  if (sim.bump) return { dir, valid: false, bump: sim.bump, path: [v.pos], carried: 0, clears: false, pearls: 0, golden: false, tideTurns: false, beached: false, ignitesRiptide: false, fillsPip: false, deadEnd: false };
  const carried = dir < 0 ? 0 : Math.max(0, sim.path.length - 2);
  const nextTide = sim.cleared ? tide : tideAt(board.P, v.moves + 1, v.phase);
  const flow = carried >= 1 ? v.flow + 1 : 0;
  return {
    dir, valid: true, bump: null, path: sim.path, carried, clears: sim.cleared, pearls: sim.pearls.length,
    golden: sim.goldenTaken, tideTurns: !sim.cleared && nextTide !== tide,
    beached: !sim.cleared && board.tiles[sim.pos] === 's' && nextTide === TIDE_LOW,
    ignitesRiptide: flow === 3, fillsPip: carried >= 1 && v.flow < 3, deadEnd: false,
  };
}
