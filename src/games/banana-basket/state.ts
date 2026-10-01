/**
 * Banana Basket sim state (design rev 8): types, creation, the per-step event
 * queue and the small helpers the director (patterns.ts) and the sim (sim.ts)
 * share. Pure, integer-only and worklet-safe.
 */

import {
  HEARTS, LUCKY_MAX, LUCKY_MAX_PARTY, MAX_PRIZES, QUEUE_SETS, R_HEAT, R_INTRO, R_QUEUE, R_RIDE, RIDE_STEPS, RUSH_QUEUE,
  RUSH_RIDE, S_FREE, SET_STEPS, SUB, TIER_AT, TWIST_NONE, TWIST_PRIZES,
} from './constants';
import { clampInt, mixSeed, type BRng } from './fixed';

export const MODE_RIDE = 0;
export const MODE_QUEUE = 1;
/** Line Party micro-round (Snack Dash, v2.1 adapter): one 20 s set. */
export const MODE_PARTY = 2;
/** Line Heat (11.2): the Ride timeline with queue leads, twist, ranked. */
export const MODE_HEAT = 3;
export const PARTY_STEPS = 1232;

export const END_NONE = 0;
export const END_TIME = 1;
export const END_HEARTS = 2;

export const MAX_ITEMS = 28;
export const MAX_PENDING = 64;
export const WINDOW = 24;
export const MAX_EVENTS = 64;
export const MAX_REMIX = 24;

// -- Events (kind, a, b, c) -----------------------------------------------------
// Field positions are fu. Packed fields are documented per event.
export const EV_SPAWN = 1; // a x, b kind, c slot
export const EV_CATCH = 2; // a x, b kind | grade << 4 | tier << 8 | held << 12 | onBeat << 13 | edge << 14, c points | chain << 16
export const EV_EDGE = 3; // a x, b kind, c side (+1/-1): caught on the edge band (roll-in)
export const EV_SHIELD = 4; // a x, b 1 puffer / 2 gull
export const EV_MISS = 5; // a x, b kind, c 1 if it broke the chain
export const EV_SPLAT = 6; // a x, b kind
export const EV_PUFF = 7; // a x, b stage (1 half, 2 full), c slot
export const EV_TELL = 8; // a x, b kind of threat (K_PUFFER, 100 gull, 102 re-serve), c slot
export const EV_HIT = 9; // a x, b hearts left, c slot
export const EV_CLOSE = 10; // a x, b points
export const EV_ZONE = 11; // a x, b zone 0..4, c bounce n
export const EV_BOUNCE = 12; // a x, b bounce n, c gold | zone << 1
export const EV_BALL_POP = 13; // a x, b kind, c points (falling item popped by the ball)
export const EV_BONK = 14; // a x, b points, c 1 puffer / 2 gull
export const EV_BALL_LOST = 15; // a x
export const EV_BALL_TOSS = 16; // a x, b 1 = after a pail save
export const EV_GOLD_BALL = 17; // a x
export const EV_COIN = 18; // a x, b pips after, c points
export const EV_GOLDEN = 19; // a 1 start, 2 warn (3 beats left), 3 end, 4 armed (3rd pip, starts on the beat)
export const EV_COIN_SET = 20; // a x, b points (ride_intro full ring)
export const EV_TIER = 21; // a tier (1..4), b chain, c 1 when the ball unlocked it
export const EV_BREAK = 22; // a chain lost
export const EV_RUSH = 23; // a 1 tell (bell, one beat early), 2 start
export const EV_TICK = 24; // a seconds left
export const EV_FINALE = 25; // a x (slow-mo starts)
export const EV_TIME = 26; // a end reason
export const EV_CARD = 27; // a card id
export const EV_SET = 28; // a set index that just started
export const EV_GULL = 29; // a phase (1 tell, 2 dive, 3 steal, 4 whiff, 6 bonked back, 7 veered by shield), b x
export const EV_PRIZE = 30; // a phase (1 drop, 2 pop, 3 reel up), b slot, c kind | x << 4
export const EV_PAIL = 31; // a x, b 1 save, 2 used lid cleared
export const EV_TIPOVER = 32; // -
export const EV_REMIX = 33; // -
export const EV_PARK = 34; // a 1 parked (lift inside the lock), 2 lock done (freeze starts), 3 cancelled (thumb back)
export const EV_HEARTS_OUT = 35;
export const EV_FORK = 36; // a x of the bunch, b predicted ball x
export const EV_GATE = 37; // a 1 locked (ball lost at chain 12+), 2 unlocked (first bounce), b effective tier
export const EV_SERVE = 38; // bananas start (the serve is done)
export const EV_VICTORY = 39; // a items knocked in, b points (TIME! victory lap)

export interface SimConfig {
  seed: number;
  difficulty: number;
  /** MODE_RIDE, MODE_QUEUE, MODE_HEAT or MODE_PARTY. */
  mode: number;
  deck: string;
  /** Ride ruleset: R_INTRO until the ball is learned, else R_RIDE (server-picked). */
  rules?: number;
  /** Queue progression gate (1..3). */
  unlock: number;
  /** Bitmask of teaching cards already seen. */
  cards: number;
  /** Wide Basket (unranked queue runs only). */
  assist: boolean;
  /** Today's Park Twist (queue unlock 3+ and heats). */
  twist: number;
  /** Line Heat id (proof only). */
  heatId?: number | null;
}

export interface SimState {
  // config
  seed: number;
  mode: number;
  rules: number;
  diff: number;
  unlock: number;
  twist: number;
  assist: number;
  /** Ranked: Freeze Lock, queued freeze and parked shield (Ride, heats, queue unlock 3+). */
  ranked: number;
  /** Full rules: tier gate, forks, Lucky Bunch, Golden Hour, Gold Ball in Rush. */
  full: number;
  hasPail: number;
  hasGulls: number;
  rng: BRng;
  // time
  steps: number;
  holdTs: number;
  fxTs: number;
  clockQ: number;
  clock: number;
  total: number;
  hitStopQ: number;
  slowQ: number;
  finale: number;
  finaleSlot: number;
  done: number;
  endReason: number;
  cardPending: number;
  cardsSeen: number;
  // freeze lock
  fullRun: number;
  parked: number;
  queued: number;
  // sets (queue) / round (ride)
  set: number;
  setStart: number;
  setLen: number;
  rushAt: number;
  rushOn: number;
  wind: number;
  // basket
  bx: number;
  bv: number;
  btx: number;
  touch: number;
  // items (struct of arrays)
  iSt: number[];
  iKind: number[];
  iX: number[];
  iY: number[];
  iVx: number[];
  iVy: number[];
  iG: number[];
  iAge: number[];
  iLand: number[];
  iLandStep: number[];
  iMust: number[];
  iPuff: number[];
  iTold: number[];
  iT: number[];
  iId: number[];
  iSide: number[];
  iFlag: number[];
  iClose: number[];
  // hanging prizes
  hSt: number[];
  hKind: number[];
  hX: number[];
  hY: number[];
  hT: number[];
  hEnd: number[];
  hId: number[];
  prizeNext: number;
  luckyN: number;
  luckyMax: number;
  // ball
  bOn: number;
  bX: number;
  bY: number;
  bVx: number;
  bVy: number;
  bG: number;
  bN: number;
  bGold: number;
  bKeep: number;
  bServeAt: number;
  bServeX: number;
  bServeTold: number;
  bPip: number;
  bZone: number;
  bPredStep: number;
  bPredX: number;
  pailUsed: number;
  // score and systems
  score: number;
  bonus: number;
  chain: number;
  maxChain: number;
  tier: number;
  gTier: number;
  catches: number;
  perfects: number;
  misses: number;
  pops: number;
  bonks: number;
  closeCalls: number;
  shields: number;
  hearts: number;
  invulnQ: number;
  meter: number;
  ghArmAt: number;
  ghQ: number;
  ghEnd: number;
  fevers: number;
  bounces: number;
  bestLife: number;
  goldBalls: number;
  pailSaves: number;
  ballLive: number;
  /** BALL SHARE accumulators: POP + BONK points, and the x3/x4 uplift. */
  popPts: number;
  uplift: number;
  forksBall: number;
  forksBunch: number;
  forksBoth: number;
  fkOn: number;
  fkStep: number;
  fkBunch: number;
  fkBall: number;
  fkLast: number;
  fkWin: number;
  fkWinN: number;
  served: number;
  lastStop: number;
  // director
  dNext: number;
  dLastX: number;
  pN: number;
  pSpawn: number[];
  pKind: number[];
  pX: number[];
  pVx: number[];
  pVy: number[];
  pG: number[];
  pLandStep: number[];
  pLand: number[];
  pMust: number[];
  pFlag: number[];
  mStep: number[];
  mX: number[];
  mHead: number;
  fStep: number[];
  fX: number[];
  fHead: number;
  tl: number;
  /** Director request: toss the ball from this x + 1 (0 = none). */
  tossReq: number;
  pufferOn: number;
  /** Remix log (queue sets 1-2): phrase id | anchor x << 8. */
  remix: number[];
  remixAt: number;
  // gull
  gSt: number;
  gX: number;
  gQ: number;
  gLen: number;
  gNext: number;
  gSeen: number;
  gEdge: number;
  // bookkeeping
  idc: number;
  evK: number[];
  evA: number[];
  evB: number[];
  evC: number[];
  evN: number;
  log: number[];
}

function zeros(n: number): number[] {
  'worklet';
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(0);
  return out;
}

export function rulesFor(cfg: SimConfig): number {
  'worklet';
  if (cfg.mode === MODE_QUEUE) return R_QUEUE;
  if (cfg.mode === MODE_HEAT) return R_HEAT;
  if (cfg.mode === MODE_PARTY) return R_RIDE;
  return cfg.rules === R_INTRO ? R_INTRO : R_RIDE;
}

export function createSim(cfg: SimConfig): SimState {
  'worklet';
  const mode = cfg.mode === MODE_QUEUE ? MODE_QUEUE : cfg.mode === MODE_HEAT ? MODE_HEAT : cfg.mode === MODE_PARTY ? MODE_PARTY : MODE_RIDE;
  const queue = mode === MODE_QUEUE;
  const rules = rulesFor(cfg);
  const unlock = queue ? clampInt(cfg.unlock | 0, 1, 3) : 3;
  // Twists: queue unlock 3+ and heats only, never Ride.
  const twistOk = (queue && unlock >= 3) || mode === MODE_HEAT;
  const twist = twistOk ? clampInt(cfg.twist | 0, 0, 4) : TWIST_NONE;
  const diff = clampInt(cfg.difficulty | 0, 1, 3);
  const ranked = mode === MODE_RIDE || mode === MODE_HEAT || (queue && unlock >= 3) ? 1 : 0;
  const full = rules === R_INTRO ? 0 : 1;
  const total = queue ? SET_STEPS * QUEUE_SETS : mode === MODE_PARTY ? PARTY_STEPS : RIDE_STEPS;
  const s: SimState = {
    seed: cfg.seed >>> 0,
    mode,
    rules,
    diff,
    unlock,
    twist,
    // Wide Basket: unranked queue runs only (unlock 1-2).
    assist: queue && unlock <= 2 && cfg.assist ? 1 : 0,
    ranked,
    full,
    hasPail: rules === R_RIDE && mode !== MODE_PARTY ? 1 : rules === R_HEAT ? 1 : queue && unlock >= 2 ? 1 : 0,
    hasGulls: queue && unlock >= 2 ? 1 : 0,
    rng: { s: mixSeed(cfg.seed >>> 0, 0x62616e61) },
    steps: 0,
    holdTs: 0,
    fxTs: 256,
    clockQ: 0,
    clock: 0,
    total,
    hitStopQ: 0,
    slowQ: -1,
    finale: 0,
    finaleSlot: -1,
    done: 0,
    endReason: END_NONE,
    cardPending: 0,
    cardsSeen: cfg.cards | 0,
    fullRun: 0,
    parked: 0,
    queued: 0,
    set: 0,
    setStart: 0,
    setLen: queue ? SET_STEPS : total,
    rushAt: queue ? RUSH_QUEUE : mode === MODE_PARTY ? 896 : RUSH_RIDE,
    rushOn: 0,
    wind: 1,
    bx: 200 * SUB,
    bv: 0,
    btx: 200 * SUB,
    touch: 0,
    iSt: zeros(MAX_ITEMS),
    iKind: zeros(MAX_ITEMS),
    iX: zeros(MAX_ITEMS),
    iY: zeros(MAX_ITEMS),
    iVx: zeros(MAX_ITEMS),
    iVy: zeros(MAX_ITEMS),
    iG: zeros(MAX_ITEMS),
    iAge: zeros(MAX_ITEMS),
    iLand: zeros(MAX_ITEMS),
    iLandStep: zeros(MAX_ITEMS),
    iMust: zeros(MAX_ITEMS),
    iPuff: zeros(MAX_ITEMS),
    iTold: zeros(MAX_ITEMS),
    iT: zeros(MAX_ITEMS),
    iId: zeros(MAX_ITEMS),
    iSide: zeros(MAX_ITEMS),
    iFlag: zeros(MAX_ITEMS),
    iClose: zeros(MAX_ITEMS),
    hSt: zeros(MAX_PRIZES),
    hKind: zeros(MAX_PRIZES),
    hX: zeros(MAX_PRIZES),
    hY: zeros(MAX_PRIZES),
    hT: zeros(MAX_PRIZES),
    hEnd: zeros(MAX_PRIZES),
    hId: zeros(MAX_PRIZES),
    prizeNext: 1 << 30,
    luckyN: 0,
    luckyMax: twist === TWIST_PRIZES ? LUCKY_MAX_PARTY : LUCKY_MAX,
    bOn: 0,
    bX: 0,
    bY: 0,
    bVx: 0,
    bVy: 0,
    bG: 0,
    bN: 0,
    bGold: 0,
    bKeep: 0,
    bServeAt: -1,
    bServeX: 200,
    bServeTold: 0,
    bPip: 0,
    bZone: 2,
    bPredStep: -1,
    bPredX: 0,
    pailUsed: 0,
    score: 0,
    bonus: 0,
    chain: 0,
    maxChain: 0,
    tier: 1,
    gTier: 1,
    catches: 0,
    perfects: 0,
    misses: 0,
    pops: 0,
    bonks: 0,
    closeCalls: 0,
    shields: 0,
    hearts: HEARTS,
    invulnQ: 0,
    meter: 0,
    ghArmAt: -1,
    ghQ: 0,
    ghEnd: 0,
    fevers: 0,
    bounces: 0,
    bestLife: 0,
    goldBalls: 0,
    pailSaves: 0,
    ballLive: 0,
    popPts: 0,
    uplift: 0,
    forksBall: 0,
    forksBunch: 0,
    forksBoth: 0,
    fkOn: 0,
    fkStep: 0,
    fkBunch: -1,
    fkBall: -1,
    fkLast: -100000,
    fkWin: 0,
    fkWinN: 0,
    served: 0,
    lastStop: -100000,
    dNext: 1 << 30,
    dLastX: 200,
    pN: 0,
    pSpawn: zeros(MAX_PENDING),
    pKind: zeros(MAX_PENDING),
    pX: zeros(MAX_PENDING),
    pVx: zeros(MAX_PENDING),
    pVy: zeros(MAX_PENDING),
    pG: zeros(MAX_PENDING),
    pLandStep: zeros(MAX_PENDING),
    pLand: zeros(MAX_PENDING),
    pMust: zeros(MAX_PENDING),
    pFlag: zeros(MAX_PENDING),
    mStep: zeros(WINDOW),
    mX: zeros(WINDOW),
    mHead: 0,
    fStep: zeros(WINDOW),
    fX: zeros(WINDOW),
    fHead: 0,
    tl: 0,
    tossReq: 0,
    pufferOn: 0,
    remix: [],
    remixAt: 0,
    gSt: 0,
    gX: 0,
    gQ: 0,
    gLen: 0,
    gNext: 1 << 30,
    gSeen: 0,
    gEdge: 0,
    idc: 0,
    evK: zeros(MAX_EVENTS),
    evA: zeros(MAX_EVENTS),
    evB: zeros(MAX_EVENTS),
    evC: zeros(MAX_EVENTS),
    evN: 0,
    log: [],
  };
  for (let i = 0; i < WINDOW; i++) {
    s.mStep[i] = -100000;
    s.fStep[i] = -100000;
  }
  return s;
}

export function emit(s: SimState, k: number, a: number, b: number, c: number): void {
  'worklet';
  if (s.evN >= MAX_EVENTS) return;
  const i = s.evN;
  s.evK[i] = k;
  s.evA[i] = a;
  s.evB[i] = b;
  s.evC[i] = c;
  s.evN = i + 1;
}

/** Live = in play with at least one bounce this life, or re-serving after a pail save. */
export function ballIsLive(s: SimState): boolean {
  'worklet';
  return (s.bOn === 1 && s.bN > 0) || s.bKeep === 1;
}

export function tierOf(chain: number): number {
  'worklet';
  if (chain >= TIER_AT[3]) return 4;
  if (chain >= TIER_AT[2]) return 3;
  if (chain >= TIER_AT[1]) return 2;
  return 1;
}

/** The scoring tier: in full rules x3 and x4 need a live ball, else it is held at x2. */
export function gatedTier(s: SimState): number {
  'worklet';
  const t = tierOf(s.chain);
  if (s.full === 1 && t > 2 && !ballIsLive(s)) return 2;
  return t;
}

export function maybeCard(s: SimState, card: number): void {
  'worklet';
  if ((s.cardsSeen & card) !== 0) return;
  s.cardsSeen |= card;
  s.cardPending = card;
  s.holdTs = 0;
  s.fullRun = 0;
  s.parked = 0;
  s.queued = 0;
  emit(s, EV_CARD, card, 0, 0);
}

export function freeSlot(s: SimState): number {
  'worklet';
  for (let i = 0; i < MAX_ITEMS; i++) if (s.iSt[i] === S_FREE) return i;
  return -1;
}

export function isRushStep(s: SimState): boolean {
  'worklet';
  return s.rushOn === 1;
}

export { R_HEAT, R_INTRO, R_QUEUE, R_RIDE };
