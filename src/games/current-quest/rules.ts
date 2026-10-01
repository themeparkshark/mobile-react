/**
 * Current Quest rules engine (design v7.1, section 3; built on v5). Pure TypeScript with no
 * React Native imports: the same file runs in the app, in `node --test`, in the
 * library generator, and is the reference the PHP verifier ports line by line.
 *
 * A run is two or three voyages on portrait lagoon boards that are always 5
 * columns wide and 5 (Warm-up), 6 (Standard) or 7 (Treasure) rows tall. One
 * stroke = one swim (or a tread). Currents carry the shark tile by tile, the
 * tide flips every P moves and dries the sandbars, the chest opens once every
 * required pearl is taken. Shells (Clear, Par, Golden) are the only thing a
 * player chases.
 *
 * Action codes (proof `a[]`):
 *   0 up, 1 right, 2 down, 3 left, 4 tread, 5 undo, 6 restart voyage,
 *   7 continue (Trial), 8 splash received (Showdown), 9 tide tip.
 *
 * v5 changes: boards grow taller (H 5/6/7), the first undo within 1.5 s of
 * the stroke it undoes is a free "slip" (keeps Par), Restart is free in both
 * profiles (Trial keeps the spent budget), and a Riptide is one elegant stroke
 * (2+ chained current runs or 5+ carried tiles) instead of a streak.
 *
 * v7.1 changes (design 0.A):
 *   - Trial in one sentence (0.A.4): undo rewinds the board and the stroke
 *     stays spent, except the silent first-undo refund within 1.5 s (the slip,
 *     now in both profiles). A ring (action 7) buys +2 strokes at ANY time
 *     while a ring is left; a Tip (action 9) costs 1 ring and no strokes.
 *   - Haul (0.A.1): the v5 "treasure" tiebreak, renamed, never shown.
 *   - Splash is a voyage-start parameter from the board's phase table (R1):
 *     action 8 is gone, `setRemainingParSolver` is gone. A splashed voyage
 *     starts at `splashPhase` with that row's par, parGold and limit.
 *   - goldenAt (0.A.7): the stroke number that banked the golden pearl, per
 *     voyage, for the 5th rank key (golden reach).
 *   - Trick Shot slot (R7): 5x5 openers in the `C-trick` cell.
 */

/** Board width: always 5 columns, so cell = row * 5 + col for every height. */
export const W = 5;
export const GRID = W;
/** Cells on a 5x5 board (kept for callers that only handle warm-up boards). */
export const CELLS = W * W;
export const MAX_H = 7;
export const MAX_CELLS = W * MAX_H;
/** A slip undo (walking misfire) must land within this many ms of its stroke. */
export const SLIP_MS = 1500;

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

/**
 * Board slots. `treasure` is the code id of the 5x7 Deep slot (cells keep the
 * `C-treasure` / `CT-treasure` ids so library hashes do not churn; design 0.2).
 * `trick` is the v7 R7 Trick Shot opener (5x5); `warmup` is the retired v5 opener.
 */
export type Slot = 'trick' | 'warmup' | 'standard' | 'treasure';
/** Player-facing slot names (design 0.2: "Treasure" now means only the chest). */
export const SLOT_LABEL: Record<Slot, string> = { trick: 'Trick Shot', warmup: 'Warm-up', standard: 'Standard', treasure: 'Deep' };
/** Curator aha tags (R7): the verb a Deep board's par route turns on, and its Trick Shot opener teaches. */
export type AhaTag = 'chain' | 'long-ride' | 'bank-shot' | 'backdoor' | 'wait' | 'low-road';
export const AHA_TAGS: readonly AhaTag[] = ['chain', 'long-ride', 'bank-shot', 'backdoor', 'wait', 'low-road'];
export type MechanicSet = 'C' | 'CT';
export type Profile = 'puzzle' | 'trial';

/**
 * A board as stored in the library. `tiles` is 5*H chars, row-major:
 *   `.` open water, `#` coral rock, `^ > v <` currents, `s` sandbar.
 * Start, chest, pearls and golden pearl are positions on top of the tiles.
 */
export interface Board {
  readonly id: string;
  readonly name: string;
  readonly slot: Slot;
  readonly set: MechanicSet;
  readonly ruleset: number;
  /** Rows (5, 6 or 7). Width is always 5. Missing = 5. */
  readonly H?: number;
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
  /** The par route contains a Riptide stroke (design `parHasRiptide`): only these boards celebrate a Riptide (0.A.1). */
  readonly parIsRiptide?: boolean;
  /** R7 aha tag (every Deep, map, sealed and Trick Shot board). */
  readonly ahaTag?: AhaTag;
  /** R10 curator title on sealed boards ("Wait For It"). */
  readonly title?: string;
  /**
   * R1 phase table (tide boards): par and parGold when the voyage starts at
   * tide phase k (k = 0..2P-1; row 0 equals par / parGold). -1 = unsolvable.
   */
  readonly parByPhase?: readonly number[];
  readonly parGoldByPhase?: readonly number[];
  /** R1: the row a Splash starts this board at (-1 or missing = cannot be splashed). */
  readonly splashPhase?: number;
  /** The curation receipt ("Tread once so the sandbar sinks, then ride home"). */
  readonly aha?: string;
  /** Teach board: the one optional line of copy (shown for 2 s, never a gate). */
  readonly teach?: string;
  /** Eligible for the Ride Challenge coin pool (Rookie band that passed the Trial sim, 4.4). */
  readonly coin?: boolean;
  readonly grade?: number;
  /** Difficulty tercile within its cell (5.1). */
  readonly band?: 'rookie' | 'adept' | 'master';
  /** Noisy-player Trial sim: clear rate with at most one ring, and with none (15.2). */
  readonly trialClearRate?: number;
  readonly trialFirstRate?: number;
  /** Struck from every pool (kept in the file for history; R10, 5.2). */
  readonly retired?: boolean;
}

export interface Knobs {
  readonly profile: Profile;
  /** Life rings at run start (Trial only; 0 in Puzzle). */
  readonly rings: number;
  /** Strokes added by a Continue (Trial). */
  readonly continueSize: number;
  /** Slack per slot: limit = max(par + slack, parGold + 2). */
  readonly slack: Readonly<Record<Slot, number>>;
  /** Same-Board Showdown run (presentation and bots only; the engine treats it as Puzzle). */
  readonly showdown?: boolean;
}

/** Puzzle slack: Trick Shot 3, Standard 3, Deep 3 (3.5); the retired Warm-up keeps 4. */
export const PUZZLE_KNOBS: Knobs = { profile: 'puzzle', rings: 0, continueSize: 2, slack: { trick: 3, warmup: 4, standard: 3, treasure: 3 } };
/**
 * Ride Challenge coin trial: Rookie boards, 2 rings (15.1, 0.A.4). Trial slack
 * Trick Shot 3, Standard 4, Deep 5: the v7.1 coin sim measured 93.6% first try
 * with the Trick Shot at +4, over the 93% line, so 0.A.4 drops it to +3.
 */
export const RIDE_KNOBS: Knobs = { profile: 'trial', rings: 2, continueSize: 2, slack: { trick: 3, warmup: 5, standard: 4, treasure: 5 } };
export const LINE_BONUS_KNOBS: Knobs = { profile: 'trial', rings: 3, continueSize: 2, slack: { trick: 3, warmup: 5, standard: 4, treasure: 5 } };

// ---------------------------------------------------------------------------
// Geometry and tiles

export function rowOf(i: number): number { return (i / W) | 0; }
export function colOf(i: number): number { return i % W; }

/** Rows of a board (5 when unset). */
export function heightOf(board: Pick<Board, 'H'>): number { return board.H ?? W; }
export function cellsOf(board: Pick<Board, 'H'>): number { return W * heightOf(board); }

/** Neighbour of `i` in direction `d` on a 5-wide board with `H` rows, or -1 off the board (or when i is -1). */
export function stepCell(i: number, d: number, H = W): number {
  if (i < 0 || i >= W * H) return -1;
  const r = ((i / W) | 0) + DIR_DR[d];
  const c = (i % W) + DIR_DC[d];
  return r < 0 || r >= H || c < 0 || c >= W ? -1 : r * W + c;
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

/** The phase-0 limit of a board (an unsplashed voyage). */
export function limitFor(board: Board, knobs: Knobs): number {
  return limitOf(board.par, board.parGold, board.slot, knobs);
}

export function limitOf(par: number, parGold: number, slot: Slot, knobs: Knobs): number {
  const slack = knobs.slack[slot] ?? 3;
  return Math.max(par + slack, parGold + 2);
}

// ---------------------------------------------------------------------------
// Splash (R1): a voyage-start parameter, never a mid-voyage action.

/** Proof `sp` (0.A.6): which Splash this voyage started with, and whether it was blocked. */
export interface SplashStart {
  readonly id: string;
  readonly blocked: 0 | 1;
  /** What blocked it: the Shield (First Find / async golden) or a counter-splash (a Par clear). */
  readonly by: 'shield' | 'counter' | null;
}

/** Can a Splash land on this board (tide board with a valid phase-table row)? */
export function splashable(board: Board): boolean {
  const k = board.splashPhase ?? -1;
  return board.P > 0 && k >= 1 && !!board.parByPhase && !!board.parGoldByPhase
    && (board.parByPhase[k] ?? -1) > 0 && (board.parGoldByPhase[k] ?? -1) > 0;
}

export interface VoyageStart {
  readonly phase: number;
  readonly par: number;
  readonly parGold: number;
  readonly limit: number;
  /** A Splash actually shifted this voyage (not blocked). */
  readonly splashed: boolean;
}

/** Starting tide phase, par row and limit of a voyage (3.4 step 0). */
export function voyageStart(board: Board, knobs: Knobs, sp: SplashStart | null | undefined): VoyageStart {
  if (sp && !sp.blocked && splashable(board)) {
    const k = board.splashPhase as number;
    const par = (board.parByPhase as readonly number[])[k];
    const parGold = (board.parGoldByPhase as readonly number[])[k];
    return { phase: k, par, parGold, limit: limitOf(par, parGold, board.slot, knobs), splashed: true };
  }
  return { phase: 0, par: board.par, parGold: board.parGold, limit: limitFor(board, knobs), splashed: false };
}

// ---------------------------------------------------------------------------
// Dihedral transforms. Boards are stored canonical and issued under one: all 8
// on square 5x5 boards, and only the 4 that keep a portrait board portrait on
// 5x6 and 5x7 (identity 0, rotate 180 = 2, mirror left-right = 5, mirror
// top-bottom = 7). A 90-degree id on a tall board is rejected.

export function allowedTransforms(H = W): readonly number[] {
  return H === W ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 2, 5, 7];
}

export function transformAllowed(t: number, H = W): boolean {
  return Number.isInteger(t) && allowedTransforms(H).includes(t);
}

/** Map a cell under transform t: t&4 transposes, then t&3 rotates 90 deg clockwise t times. -1 when not allowed. */
export function transformCell(i: number, t: number, H = W): number {
  let r = rowOf(i);
  let c = colOf(i);
  if (H !== W) {
    if (t === 0) return i;
    if (t === 2) return (H - 1 - r) * W + (W - 1 - c);
    if (t === 5) return r * W + (W - 1 - c);
    if (t === 7) return (H - 1 - r) * W + c;
    return -1;
  }
  if (t & 4) { const x = r; r = c; c = x; }
  for (let k = 0; k < (t & 3); k++) { const nr = c; const nc = W - 1 - r; r = nr; c = nc; }
  return r * W + c;
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
  const H = heightOf(board);
  if (!transformAllowed(t, H)) throw new Error(`transform ${t} not allowed on a 5x${H} board`);
  const n = W * H;
  const out: string[] = new Array(n).fill('.');
  for (let i = 0; i < n; i++) {
    const ch = board.tiles[i];
    const cd = currentDir(ch);
    out[transformCell(i, t, H)] = cd >= 0 ? CURRENT_CHARS[transformDir(cd, t)] : ch;
  }
  return {
    ...board,
    id: `${board.id}~${t}`,
    tiles: out.join(''),
    start: transformCell(board.start, t, H),
    chest: transformCell(board.chest, t, H),
    pearls: board.pearls.map((p) => transformCell(p, t, H)),
    golden: board.golden >= 0 ? transformCell(board.golden, t, H) : -1,
  };
}

// ---------------------------------------------------------------------------
// Voyage state

/** Undo snapshot (the state before a swim/tread), exported for the wrong-turn marker. */
export interface Snap {
  pos: number;
  mask: number;
  golden: boolean;
  strokes: number;
  spent: number;
  moves: number;
  ripStrokes: number;
  beached: boolean;
  goldenAt: number;
  /** ms (run clock) the undone action was applied; NaN when unknown (never a slip). */
  t: number;
}

export interface Voyage {
  pos: number;
  /** Bit k = required pearl k collected. */
  mask: number;
  golden: boolean;
  /** Cost of the surviving action stack (undo restores it). */
  strokes: number;
  /** Budget used: equals strokes in Puzzle; in Trial undo never refunds it (except the slip). */
  spent: number;
  /** Committed swims and treads on the surviving stack (drives the tide). */
  moves: number;
  /** Starting tide offset (0, or the board's splashPhase when splashed; fixed for the voyage). */
  phase: number;
  /** Non-slip undos this voyage (never undone; forfeits Par; rank tiebreak). */
  undos: number;
  /** The free slip undo (within 1.5 s of its stroke) is spent this voyage. */
  slipUsed: boolean;
  /** Slip undos taken (presentation only; never scored). */
  slips: number;
  tips: number;
  continues: number;
  restarts: number;
  limitBonus: number;
  /** Riptide strokes on the surviving stack (Author medal, rank key 4). */
  ripStrokes: number;
  /** Stroke number that banked the golden pearl on the surviving stack (0 = not banked). */
  goldenAt: number;
  beached: boolean;
  cleared: boolean;
  stalled: boolean;
  /** This voyage's par targets and base limit (from the phase-table row it started on). */
  parT: number;
  parGoldT: number;
  limit: number;
  /** The Splash this voyage started with (proof `sp`), or null. */
  sp: SplashStart | null;
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
  readonly ripStrokes: number;
  readonly requiredPearls: number;
  /** Tiebreak number (3.6), never shown to players. */
  readonly haul: number;
  /** Stroke number that banked the golden pearl (0 = not banked). */
  readonly goldenAt: number;
  /** The par target this voyage was judged against (golden-aware, from its phase row). */
  readonly parTarget: number;
  /** The phase-table par row this voyage started on (par, parGold). */
  readonly par: number;
  readonly parGold: number;
  readonly splashed: boolean;
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
  /** Per-voyage starting Splash (proof `sp`), queued before that voyage starts. */
  splashes: (SplashStart | null)[];
}

export function newVoyage(board: Board, knobs: Knobs = PUZZLE_KNOBS, sp: SplashStart | null = null): Voyage {
  const st = voyageStart(board, knobs, sp);
  return {
    pos: board.start, mask: 0, golden: false, strokes: 0, spent: 0, moves: 0, phase: st.phase,
    undos: 0, slipUsed: false, slips: 0, tips: 0, continues: 0, restarts: 0, limitBonus: 0, ripStrokes: 0, goldenAt: 0,
    beached: board.tiles[board.start] === 's' && tideAt(board.P, 0, st.phase) === TIDE_LOW,
    cleared: false, stalled: false,
    parT: st.par, parGoldT: st.parGold, limit: st.limit, sp: sp ?? null, stack: [],
  };
}

export function createRun(boards: readonly Board[], knobs: Knobs, splashes?: readonly (SplashStart | null | undefined)[]): RunState {
  const sps = boards.map((_, i) => splashes?.[i] ?? null);
  return {
    boards, knobs, index: 0, voyage: newVoyage(boards[0], knobs, sps[0]),
    rings: knobs.profile === 'trial' ? knobs.rings : 0,
    failed: false, complete: false, results: [], actions: boards.map(() => []), splashes: sps,
  };
}

/**
 * Queue the Splash a voyage starts with (Showdown inbox, async challenge). Only
 * a voyage that has not started yet can take one: a later voyage, or the
 * current voyage while it has no recorded action. One per voyage.
 */
export function queueSplash(runIn: RunState, index: number, sp: SplashStart): { run: RunState; ok: boolean } {
  if (runIn.failed || runIn.complete || index < runIn.index || index >= runIn.boards.length) return { run: runIn, ok: false };
  if (runIn.splashes[index]) return { run: runIn, ok: false };
  if (index === runIn.index && runIn.actions[index].length > 0) return { run: runIn, ok: false };
  const run = cloneRun(runIn);
  run.splashes[index] = sp;
  if (index === run.index) run.voyage = newVoyage(run.boards[index], run.knobs, sp);
  return { run, ok: true };
}

export function cloneVoyage(v: Voyage): Voyage {
  return { ...v, stack: v.stack.slice() };
}

export function cloneRun(run: RunState): RunState {
  return { ...run, voyage: cloneVoyage(run.voyage), results: run.results.slice(), actions: run.actions.map((a) => a.slice()), splashes: run.splashes.slice() };
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

/** The current voyage's base limit (from its phase row; continues add limitBonus on top). */
export function voyageLimit(run: RunState): number {
  return run.voyage.limit;
}

export function strokesLeft(run: RunState): number {
  return run.voyage.limit + run.voyage.limitBonus - run.voyage.spent;
}

/** Can a Tide Tip be taken right now? Puzzle: free (forfeits Par). Trial: costs 1 ring (0.A.4). */
export function tipAllowed(run: RunState): boolean {
  const v = run.voyage;
  if (run.failed || run.complete || v.cleared || v.stalled) return false;
  return run.knobs.profile !== 'trial' || run.rings > 0;
}

/** Can a ring be used for +2 strokes right now (Trial, any time while a ring is left; 0.A.4)? */
export function ringAllowed(run: RunState): boolean {
  const v = run.voyage;
  return run.knobs.profile === 'trial' && !run.failed && !run.complete && !v.cleared && run.rings > 0;
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
    /** Distinct current runs the stroke rode (a hand-off between runs counts a new one). */
    runs: number;
    /** Path indexes where one current run handed the shark to the next. */
    handoffs: number[];
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
    /** A Riptide stroke (3.6): 2+ chained current runs or 5+ carried tiles. */
    riptide: boolean;
    left: number;
  }
  | { type: 'clear'; result: VoyageResult; index: number; runComplete: boolean }
  | { type: 'stall'; nearMiss: boolean }
  | { type: 'undo'; from: number; to: number; tideBefore: number; tideAfter: number; refunded: boolean; slip: boolean }
  | { type: 'restart'; spentKept: boolean }
  /** A ring bought +2 strokes (Trial; `fromStall` when it lifted a stall). */
  | { type: 'continue'; bonus: number; fromStall: boolean }
  /** A Tide Tip: Puzzle forfeits Par; Trial also spends a ring (`ring`). */
  | { type: 'tip'; ring: boolean }
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
  runs: number;
  handoffs: number[];
  bump: BumpReason | null;
  bumpTarget: number;
}

/** Riptide (3.6): one stroke that chains 2+ distinct current runs or carries 5+ tiles. */
export const RIPTIDE_RUNS = 2;
export const RIPTIDE_TILES = 5;
export function isRiptide(runs: number, carried: number): boolean {
  return runs >= RIPTIDE_RUNS || carried >= RIPTIDE_TILES;
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

/** Track current runs along the path (a new run starts whenever the current direction changes). */
function noteRun(sim: StrokeSim, dir: number, last: number): number {
  if (dir >= 0 && dir !== last) {
    sim.runs += 1;
    if (sim.runs >= 2) sim.handoffs.push(sim.path.length - 1);
  }
  return dir;
}

/**
 * Resolve one swim (dir 0..3) or tread (dir -1) from a position, pure. Used by
 * the engine, the preview table and the solver. The whole carry uses `tide`
 * (the tide at stroke start), so a sandbar never dries under a moving shark.
 */
export function simulateStroke(board: Board, pos: number, mask: number, golden: boolean, tide: number, dir: number): StrokeSim {
  const sim: StrokeSim = {
    pos, mask, golden, path: [pos], pearls: [], goldenTaken: false, goldenAt: -1,
    unlocked: false, unlockedAt: -1, cleared: false, runs: 0, handoffs: [], bump: null, bumpTarget: -1,
  };
  if (dir < 0) return sim;
  const H = heightOf(board);
  const target = stepCell(pos, dir, H);
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
  let last = noteRun(sim, c, -1);
  while (c >= 0 && guard < 24) {
    guard++;
    const next = stepCell(sim.pos, c, H);
    if (blockReason(board, next, tide, sim.mask)) break;
    sim.pos = next;
    sim.path.push(next);
    collect(board, sim);
    if (next === board.chest) { sim.cleared = true; break; }
    c = currentDir(board.tiles[sim.pos]);
    last = c >= 0 ? noteRun(sim, c, last) : -1;
  }
  return sim;
}

function snapOf(v: Voyage, t: number): Snap {
  return { pos: v.pos, mask: v.mask, golden: v.golden, strokes: v.strokes, spent: v.spent, moves: v.moves, ripStrokes: v.ripStrokes, beached: v.beached, goldenAt: v.goldenAt, t };
}

/** Haul (3.6): 50 per required pearl, +200 golden, +40 per unused base stroke. Never shown. */
export function haulFor(cleared: boolean, requiredPearls: number, golden: boolean, limit: number, spent: number): number {
  return cleared ? 50 * requiredPearls + (golden ? 200 : 0) + 40 * Math.max(0, limit - spent) : 0;
}

export function voyageResult(board: Board, v: Voyage, knobs: Knobs): VoyageResult {
  void knobs;
  const limit = v.limit;
  const cleared = v.cleared;
  const target = v.golden ? v.parGoldT : v.parT;
  const shellPar = cleared && v.undos === 0 && v.tips === 0 && v.continues === 0 && v.strokes <= target;
  const shellGolden = cleared && v.golden;
  const shells = (cleared ? 1 : 0) + (shellPar ? 1 : 0) + (shellGolden ? 1 : 0);
  const required = board.pearls.length;
  const gold = shellPar && shellGolden;
  const medal = !cleared ? 0 : gold ? (v.ripStrokes >= board.authorRiptide ? 4 : 3) : shellPar ? 2 : 1;
  return {
    boardId: board.id, cleared, shellClear: cleared, shellPar, shellGolden, shells,
    strokes: v.strokes, spent: v.spent, limit, undos: v.undos, tips: v.tips, continues: v.continues,
    ripStrokes: v.ripStrokes, requiredPearls: required, haul: haulFor(cleared, required, v.golden, limit, v.spent),
    goldenAt: v.golden ? v.goldenAt : 0, parTarget: target, par: v.parT, parGold: v.parGoldT, splashed: v.phase !== 0, medal,
  };
}

/**
 * Apply one action to the run (mutates a clone and returns it). Illegal
 * actions return ok=false and leave the run unchanged. Bumps return ok=true
 * with a bump event but are NOT recorded (design 3.3: bumps are not proof).
 *
 * `t` is the run-clock ms the engine applies the action at (the proof `t[]`).
 * It only matters for the slip undo; without it no undo is ever a slip.
 * Action 8 (the v6 mid-voyage Splash) is always illegal (R1).
 */
export function applyAction(runIn: RunState, action: number, t: number = NaN): { run: RunState; ok: boolean; events: CqEvent[]; recorded: boolean } {
  if (runIn.failed || runIn.complete) return { run: runIn, ok: false, events: [], recorded: false };
  const run = cloneRun(runIn);
  const board = currentBoard(run);
  const v = run.voyage;
  const trial = run.knobs.profile === 'trial';
  const events: CqEvent[] = [];
  const fail = () => ({ run: runIn, ok: false, events: [] as CqEvent[], recorded: false });
  const stallCheck = () => {
    if (v.spent >= v.limit + v.limitBonus) {
      v.stalled = true;
      events.push({ type: 'stall', nearMiss: false });
      if (trial && run.rings <= 0) { run.failed = true; events.push({ type: 'fail' }); }
    }
  };

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
    v.stack.push(snapOf(v, t));
    const wasBeached = v.beached;
    v.pos = sim.pos;
    v.mask = sim.mask;
    v.golden = sim.golden;
    v.strokes += 1;
    v.spent += 1;
    v.moves += 1;
    if (sim.goldenTaken) v.goldenAt = v.strokes;
    const carried = dir < 0 ? 0 : Math.max(0, sim.path.length - 2);
    const riptide = dir >= 0 && isRiptide(sim.runs, carried);
    if (riptide) v.ripStrokes += 1;
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
      type: 'stroke', dir, path: sim.path, carried, runs: sim.runs, handoffs: sim.handoffs, pearls: sim.pearls,
      golden: sim.goldenTaken, goldenAt: sim.goldenAt, unlocked: sim.unlocked, unlockedAt: sim.unlockedAt,
      cleared: sim.cleared, tideBefore, tideAfter, beached: v.beached, wasBeached, riptide,
      left: v.limit + v.limitBonus - v.spent,
    });
    if (sim.cleared) finishVoyage(run, events);
    else stallCheck();
    return { run, ok: true, events, recorded: true };
  }

  if (action === A_UNDO) {
    if (!v.stack.length) return fail();
    if (trial && v.stalled) return fail();
    const s = v.stack.pop() as Snap;
    const tideBefore = tideAt(board.P, v.moves, v.phase);
    const from = v.pos;
    const keepSpent = v.spent;
    const slip = !v.slipUsed && t - s.t <= SLIP_MS && t >= s.t;
    v.pos = s.pos; v.mask = s.mask; v.golden = s.golden; v.strokes = s.strokes; v.moves = s.moves;
    v.ripStrokes = s.ripStrokes; v.goldenAt = s.goldenAt;
    // Trial: the stroke stays spent, except the silent first-undo refund (the slip; 0.A.4).
    const refunded = !trial || slip;
    v.spent = refunded ? s.spent : keepSpent;
    if (slip) { v.slipUsed = true; v.slips += 1; } else v.undos += 1;
    const tideAfter = tideAt(board.P, v.moves, v.phase);
    v.beached = board.tiles[v.pos] === 's' && tideAfter === TIDE_LOW;
    v.stalled = false;
    run.actions[run.index].push(action);
    events.push({ type: 'undo', from, to: v.pos, tideBefore, tideAfter, refunded, slip });
    // A Puzzle undo refunds the stroke, so it always leaves the stall. A Trial
    // undo is refused while stalled, so it cannot re-stall here.
    return { run, ok: true, events, recorded: true };
  }

  if (action === A_RESTART) {
    if (!v.stack.length) return fail();
    if (trial && v.stalled) return fail();
    const fresh = newVoyage(board, run.knobs, v.sp);
    // Counts as one (non-slip) undo for Par. Free in both profiles; Trial keeps the budget.
    fresh.undos = v.undos + 1;
    fresh.slipUsed = v.slipUsed;
    fresh.slips = v.slips;
    fresh.tips = v.tips;
    fresh.continues = v.continues;
    fresh.restarts = v.restarts + 1;
    fresh.limitBonus = v.limitBonus;
    fresh.spent = trial ? v.spent : 0;
    run.voyage = fresh;
    run.actions[run.index].push(action);
    events.push({ type: 'restart', spentKept: trial });
    return { run, ok: true, events, recorded: true };
  }

  if (action === A_CONTINUE) {
    // A ring: +2 strokes, any time in Trial while a ring is left (0.A.4).
    if (!ringAllowed(run)) return fail();
    const fromStall = v.stalled;
    run.rings -= 1;
    v.limitBonus += run.knobs.continueSize;
    v.continues += 1;
    v.stalled = false;
    run.actions[run.index].push(action);
    events.push({ type: 'continue', bonus: run.knobs.continueSize, fromStall });
    return { run, ok: true, events, recorded: true };
  }

  if (action === A_TIP) {
    if (!tipAllowed(run)) return fail();
    v.tips += 1;
    if (trial) run.rings -= 1;
    run.actions[run.index].push(action);
    events.push({ type: 'tip', ring: trial });
    return { run, ok: true, events, recorded: true };
  }

  // A_SPLASH (8) and anything unknown.
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
    run.index += 1;
    run.voyage = newVoyage(run.boards[run.index], run.knobs, run.splashes[run.index]);
  }
}

// ---------------------------------------------------------------------------
// Scoring

export function totalShells(results: readonly VoyageResult[]): number {
  return results.reduce((s, r) => s + r.shells, 0);
}

/** Run Haul (3.6): the sum over cleared voyages. Server-only; never on screen (0.A.1). */
export function haulOf(results: readonly VoyageResult[]): number {
  return results.reduce((s, r) => s + r.haul, 0);
}

/**
 * Golden reach (0.A.7, rank key 5, lower is better): the sum over voyages of
 * the stroke number that banked the golden pearl. A voyage that never banked
 * it counts its base limit + 1 (a stroke past any possible bank), so missing
 * the pearl never ranks above reaching it late. Deterministic, no time.
 */
export function goldenReach(results: readonly VoyageResult[]): number {
  return results.reduce((s, r) => s + (r.shellGolden ? r.goldenAt : r.limit + 1), 0);
}

/** Riptide strokes over a run (rank key 4, higher is better). */
export function riptidesOf(results: readonly VoyageResult[]): number {
  return results.reduce((s, r) => s + r.ripStrokes, 0);
}

/** Star cut-offs per run length (3.5): 2-voyage Quick Run 2/4/6 of 6, 3-voyage runs 3/6/8 of 9. */
export function starThresholds(voyages: number): { one: number; two: number; three: number } {
  return voyages <= 2 ? { one: 2, two: 4, three: 6 } : { one: 3, two: 6, three: 8 };
}

/** Run stars: failed = 0; otherwise by the run length's shell thresholds. */
export function starsFor(shells: number, complete: boolean, voyages = 3): number {
  if (!complete) return 0;
  const th = starThresholds(voyages);
  if (shells >= th.three) return 3;
  if (shells >= th.two) return 2;
  if (shells >= th.one) return 1;
  return 0;
}

/** Shells still needed for the next star (results NEXT STAR line), or 0. */
export function shellsToNextStar(shells: number, voyages = 3): number {
  const th = starThresholds(voyages);
  if (shells < th.two) return th.two - shells;
  if (shells < th.three) return th.three - shells;
  return 0;
}

// ---------------------------------------------------------------------------
// Proof v3 and replay (design 15.3)

export interface VoyageProof {
  readonly id: string;
  readonly tf: number;
  /** The Splash this voyage started with (null for most voyages, always null in a Ride Challenge). */
  readonly sp: SplashStart | null;
  readonly a: readonly number[];
  /** ms since run start, one per action. */
  readonly t: readonly number[];
  /** ms since run start when the board finished landing (think floor anchor). */
  readonly ready: number;
}

export interface CurrentQuestProofV3 {
  readonly game: 'current';
  readonly v: 3;
  readonly context: string;
  readonly profile: Profile;
  readonly rings: number;
  /** The board seed (attempt 0: the issued seed; retries: deriveSeed(seed, attempt)). */
  readonly seed: number;
  readonly attempt?: number;
  readonly haul: number;
  readonly stars: number;
  readonly shells: number;
  readonly elapsed_ms: number;
  /** R8 keep-your-progress retry (null unless WS7 enables it). */
  readonly banked: { attempt_id: string; voyages: number[] } | null;
  /** A failed Trial posts its partial proof too (R8). */
  readonly failed?: boolean;
  readonly voyages: readonly VoyageProof[];
}

export interface ReplayVerdict {
  readonly ok: boolean;
  readonly reason?: string;
  readonly run?: RunState;
  readonly shells?: number;
  readonly haul?: number;
  readonly stars?: number;
}

/** Interval floors (design 16), stamped at engine apply. */
export const PROOF_FLOORS = {
  minIntervalMs: 150,
  medianIntervalMs: 350,
  thinkFloorMs: { trick: 600, warmup: 600, standard: 1200, treasure: 1800 } as Record<Slot, number>,
  maxActionsPerVoyage: 160,
};

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = values.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface VerifyOptions {
  /**
   * Server check that a Splash id was issued to this player for this voyage
   * (and, for `by: 'shield'`, that the Shield was really armed). Defaults to
   * accepting any id: the client self-check cannot know the server's log.
   */
  readonly issued?: (voyage: number, sp: SplashStart) => boolean;
}

/**
 * Server-side style verification of a proof against the issued boards. The
 * boards must come from the issuer (seed -> ids + transforms), never from the
 * proof itself.
 */
export function verifyProof(boards: readonly Board[], knobs: Knobs, proof: CurrentQuestProofV3, opts: VerifyOptions = {}): ReplayVerdict {
  if (proof.game !== 'current' || proof.v !== 3) return { ok: false, reason: 'version' };
  if (proof.profile !== knobs.profile) return { ok: false, reason: 'profile' };
  if (proof.voyages.length !== boards.length) return { ok: false, reason: 'voyages' };
  const sps: (SplashStart | null)[] = [];
  for (let vi = 0; vi < proof.voyages.length; vi++) {
    const sp = proof.voyages[vi].sp ?? null;
    if (sp) {
      if (knobs.profile === 'trial') return { ok: false, reason: 'splash-trial' };
      if (typeof sp.id !== 'string' || !sp.id || (sp.blocked !== 0 && sp.blocked !== 1)) return { ok: false, reason: 'splash' };
      if (sp.blocked ? sp.by !== 'shield' && sp.by !== 'counter' : sp.by !== null) return { ok: false, reason: 'splash' };
      if (!sp.blocked && !splashable(boards[vi])) return { ok: false, reason: 'splash-board' };
      if (opts.issued && !opts.issued(vi, sp)) return { ok: false, reason: 'splash-issue' };
    }
    sps.push(sp);
  }
  let run = createRun(boards, knobs, sps);
  let last = -1;
  for (let vi = 0; vi < proof.voyages.length; vi++) {
    const vp = proof.voyages[vi];
    const board = boards[vi];
    if (vp.id !== board.id.split('~')[0] || (vp.tf | 0) !== transformOf(board.id)) return { ok: false, reason: 'board' };
    if (!transformAllowed(vp.tf | 0, heightOf(board))) return { ok: false, reason: 'transform' };
    if (vp.a.length !== vp.t.length) return { ok: false, reason: 'times' };
    if (vp.a.length > PROOF_FLOORS.maxActionsPerVoyage) return { ok: false, reason: 'too-many-actions' };
    if (vp.a.some((a) => a === A_SPLASH)) return { ok: false, reason: 'splash-action' };
    if (run.index !== vi) return { ok: false, reason: 'order' };
    // A counter-splash needs a verified Par on the previous voyage (0.A.6).
    if (vp.sp?.by === 'counter' && !(vi > 0 && run.results[vi - 1]?.shellPar)) return { ok: false, reason: 'counter' };
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
      const res = applyAction(run, vp.a[k], t);
      if (!res.ok || !res.recorded) return { ok: false, reason: `illegal@${vi}:${k}` };
      run = res.run;
    }
    if (gaps.length >= 3 && median(gaps) < PROOF_FLOORS.medianIntervalMs) return { ok: false, reason: 'median' };
    if (run.failed) break;
  }
  const shells = totalShells(run.results);
  const haul = haulOf(run.results);
  if (proof.failed) {
    // R8 partial proof: the replay must end failed, with exactly the claimed shells.
    if (!run.failed) return { ok: false, reason: 'not-failed', run };
    if (shells !== proof.shells || proof.stars !== 0) return { ok: false, reason: 'claim', run, shells, haul, stars: 0 };
    return { ok: true, run, shells, haul, stars: 0 };
  }
  if (!run.complete) return { ok: false, reason: 'incomplete', run };
  const stars = starsFor(shells, true, boards.length);
  if (shells !== proof.shells || haul !== proof.haul || stars !== proof.stars) return { ok: false, reason: 'claim', run, shells, haul, stars };
  if (last > proof.elapsed_ms) return { ok: false, reason: 'elapsed' };
  return { ok: true, run, shells, haul, stars };
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
  /** Path indexes where a pearl (required or golden) would be taken. */
  readonly pearlAt: number[];
  /** Path index where the chest unlocks, or -1. */
  readonly unlockAt: number;
  readonly golden: boolean;
  readonly tideTurns: boolean;
  readonly beached: boolean;
  /** This stroke would be a Riptide stroke ("RIPTIDE!" before you commit). */
  readonly riptide: boolean;
  /** The tide after this stroke (the post-stroke world the preview ghosts; 0.A.2). */
  readonly tideAfter: number;
  /** Landing state (for the solver's "No way home" check, 0.A.3). */
  readonly mask: number;
  readonly goldenHeld: boolean;
  /** Filled by the game with the solver: this stroke can no longer reach the chest in budget. */
  deadEnd: boolean;
}

const INVALID: Omit<Preview, 'dir' | 'bump' | 'path'> = {
  valid: false, carried: 0, clears: false, pearls: 0, pearlAt: [], unlockAt: -1, golden: false, tideTurns: false,
  beached: false, riptide: false, deadEnd: false, tideAfter: 0, mask: 0, goldenHeld: false,
};

export function previewFor(run: RunState, action: number): Preview {
  const board = currentBoard(run);
  const v = run.voyage;
  const dir = action === A_TREAD ? -1 : action;
  const tide = tideAt(board.P, v.moves, v.phase);
  const blocked = v.cleared || v.stalled || run.failed || (action === A_TREAD && !board.P);
  if (blocked) return { ...INVALID, dir, bump: null, path: [v.pos], pearlAt: [], tideAfter: tide, mask: v.mask, goldenHeld: v.golden };
  const sim = simulateStroke(board, v.pos, v.mask, v.golden, tide, dir);
  if (sim.bump) return { ...INVALID, dir, bump: sim.bump, path: [v.pos], pearlAt: [], tideAfter: tide, mask: v.mask, goldenHeld: v.golden };
  const carried = dir < 0 ? 0 : Math.max(0, sim.path.length - 2);
  const nextTide = sim.cleared ? tide : tideAt(board.P, v.moves + 1, v.phase);
  const pearlAt = sim.pearls.map((p) => p.at);
  if (sim.goldenTaken) pearlAt.push(sim.goldenAt);
  return {
    dir, valid: true, bump: null, path: sim.path, carried, clears: sim.cleared, pearls: sim.pearls.length,
    pearlAt, unlockAt: sim.unlocked ? sim.unlockedAt : -1,
    golden: sim.goldenTaken, tideTurns: !sim.cleared && nextTide !== tide,
    beached: !sim.cleared && board.tiles[sim.pos] === 's' && nextTide === TIDE_LOW,
    riptide: dir >= 0 && isRiptide(sim.runs, carried), deadEnd: false,
    tideAfter: nextTide, mask: sim.mask, goldenHeld: sim.golden,
  };
}
