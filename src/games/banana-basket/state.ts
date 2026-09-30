/**
 * Banana Basket sim state: types, creation, the per-step event queue and the
 * small helpers the director (patterns.ts) and the sim (sim.ts) share.
 * Pure, integer-only and worklet-safe.
 */

import {
  HEARTS, QUEUE_SETS, RIDE_STEPS, S_FREE, SET_STEPS, SUB, TIER_AT, TWIST_NONE, TWIST_SPLASH, WATER_DECKS,
} from './constants';
import { clampInt, mixSeed, type BRng } from './fixed';


export const MODE_RIDE = 0;
export const MODE_QUEUE = 1;

export const END_NONE = 0;
export const END_TIME = 1;
export const END_HEARTS = 2;

export const MAX_ITEMS = 28;
export const MAX_PENDING = 64;
export const WINDOW = 24;
export const MAX_EVENTS = 64;

// -- Events (kind, a, b, c) -----------------------------------------------------
// Field positions are fu. Packed fields are documented per event.
export const EV_SPAWN = 1; // a x, b kind, c slot
export const EV_CATCH = 2; // a x, b kind | grade << 4 | tier << 8 | boosted << 12, c points | chain << 16
export const EV_RIM = 3; // a x, b kind, c side (+1/-1)
export const EV_SAVE = 4; // a x, b kind, c points
export const EV_MISS = 5; // a x, b kind, c 1 if it broke the chain
export const EV_SPLAT = 6; // a x, b kind
export const EV_PUFF = 7; // a x, b stage (1 half, 2 full)
export const EV_TELL = 8; // a x, b kind of threat (K_PUFFER, 100 gull, 101 splash)
export const EV_HIT = 9; // a x, b hearts left
export const EV_CLOSE = 10; // a x, b points
export const EV_GRAZE = 11; // a x, b points
export const EV_BOUNCE = 12; // a x, b bounce n, c gold | points << 1
export const EV_BALL_POP = 13; // a x, b kind, c points
export const EV_BONK = 14; // a x, b points
export const EV_BALL_LOST = 15; // a x
export const EV_BALL_TOSS = 16; // a x
export const EV_GOLD_BALL = 17; // a x
export const EV_COIN = 18; // a x, b pips, c points
export const EV_GOLDEN = 19; // a 1 start, 2 warn, 3 end
export const EV_BANK = 20; // a banked count
export const EV_TIER = 21; // a tier (1..4), b chain
export const EV_BREAK = 22; // a chain lost
export const EV_RUSH = 23; // a 1 tell (one beat early), 2 start
export const EV_TICK = 24; // a seconds left
export const EV_FINALE = 25; // a x (slow-mo starts)
export const EV_TIME = 26; // a end reason
export const EV_CARD = 27; // a card id
export const EV_SET = 28; // a set index that just started
export const EV_GULL = 29; // a phase (1 tell, 2 dive, 3 steal, 4 whiff, 5 blocked), b x, c sent
export const EV_SPLASH = 30; // a phase (1 tell, 2 erupt hit, 3 erupt miss), b x
export const EV_POWER = 31; // a kind (K_FINGER, K_WATCH, K_GIFT), b detail
export const EV_TIPOVER = 32; // -
export const EV_DOWNWELL = 33; // a x, b pips
export const EV_GRADE = 34; // a grade (render stamp for early catches), b perfect streak
export const EV_HEARTS_OUT = 35;

export interface SimConfig {
  seed: number;
  difficulty: number;
  mode: number;
  deck: string;
  /** Queue progression gate (1..5). Ride always uses the Ride ruleset. */
  unlock: number;
  /** Bitmask of teaching cards already seen. */
  cards: number;
  /** Easy Basket (queue only, never in Ride proofs or boards). */
  assist: boolean;
  /** Today's Park Twist (queue): TWIST_* (splash is forced on water decks). */
  twist: number;
  /** Multiplayer Gull Send, flat pairs [receivedAtStep, applyAtStep] (applyAt >= sender step + 90). */
  gulls?: number[];
}

export interface SimState {
  // config
  seed: number;
  mode: number;
  diff: number;
  unlock: number;
  twist: number;
  assist: number;
  hasBall: number;
  hasGift: number;
  hasFinger: number;
  hasWatch: number;
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
  // sets (queue) / round (ride)
  set: number;
  setStart: number;
  setLen: number;
  rushAt: number;
  rushOn: number;
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
  iOpt: number[];
  iPuff: number[];
  iTold: number[];
  iT: number[];
  iId: number[];
  iSide: number[];
  iFlag: number[];
  // ball
  bOn: number;
  bX: number;
  bY: number;
  bVx: number;
  bVy: number;
  bG: number;
  bN: number;
  bGold: number;
  bRespawnQ: number;
  bRun: number;
  bPip: number;
  bPredStep: number;
  bPredX: number;
  // score and systems
  score: number;
  bonus: number;
  chain: number;
  maxChain: number;
  tier: number;
  catches: number;
  perfects: number;
  greats: number;
  saves: number;
  misses: number;
  perfStreak: number;
  bestPerfStreak: number;
  hearts: number;
  invulnQ: number;
  meter: number;
  ghQ: number;
  ghExt: number;
  fevers: number;
  banked: number;
  bounces: number;
  goldBalls: number;
  grazes: number;
  closeA: number;
  closeB: number;
  chainFreezeQ: number;
  fingerQ: number;
  watchUsed: number;
  luckyN: number;
  pops: number;
  bonks: number;
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
  wind: number;
  // gull and splash
  gSt: number;
  gX: number;
  gQ: number;
  gLen: number;
  gNext: number;
  gSeen: number;
  gSent: number;
  gullIn: number[];
  gullLog: number[];
  sSt: number;
  sX: number;
  sQ: number;
  sNext: number;
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

export function isWaterDeck(deck: string): boolean {
  'worklet';
  for (let i = 0; i < WATER_DECKS.length; i++) if (WATER_DECKS[i] === deck) return true;
  return false;
}

export function createSim(cfg: SimConfig): SimState {
  'worklet';
  const queue = cfg.mode === MODE_QUEUE;
  const unlock = queue ? clampInt(cfg.unlock | 0, 1, 5) : 5;
  let twist = TWIST_NONE;
  if (queue && unlock >= 3) twist = cfg.twist | 0;
  if (queue && isWaterDeck(cfg.deck)) twist = TWIST_SPLASH;
  const diff = clampInt(cfg.difficulty | 0, 1, 3);
  const s: SimState = {
    seed: cfg.seed >>> 0,
    mode: queue ? MODE_QUEUE : MODE_RIDE,
    diff,
    unlock,
    twist,
    assist: queue && cfg.assist ? 1 : 0,
    hasBall: !queue || unlock >= 2 ? 1 : 0,
    hasGift: queue && unlock >= 2 ? 1 : 0,
    hasFinger: queue && unlock >= 2 ? 1 : 0,
    hasWatch: queue && unlock >= 4 ? 1 : 0,
    rng: { s: mixSeed(cfg.seed >>> 0, 0x62616e61) },
    steps: 0,
    holdTs: 0,
    fxTs: 256,
    clockQ: 0,
    clock: 0,
    total: queue ? SET_STEPS * QUEUE_SETS : RIDE_STEPS,
    hitStopQ: 0,
    slowQ: -1,
    finale: 0,
    finaleSlot: -1,
    done: 0,
    endReason: END_NONE,
    cardPending: 0,
    cardsSeen: cfg.cards | 0,
    set: 0,
    setStart: 0,
    setLen: queue ? SET_STEPS : RIDE_STEPS,
    rushAt: queue ? 1 << 30 : 2100,
    rushOn: 0,
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
    iOpt: zeros(MAX_ITEMS),
    iPuff: zeros(MAX_ITEMS),
    iTold: zeros(MAX_ITEMS),
    iT: zeros(MAX_ITEMS),
    iId: zeros(MAX_ITEMS),
    iSide: zeros(MAX_ITEMS),
    iFlag: zeros(MAX_ITEMS),
    bOn: 0,
    bX: 0,
    bY: 0,
    bVx: 0,
    bVy: 0,
    bG: 0,
    bN: 0,
    bGold: 0,
    bRespawnQ: -1,
    bRun: 0,
    bPip: 0,
    bPredStep: -1,
    bPredX: 0,
    score: 0,
    bonus: 0,
    chain: 0,
    maxChain: 0,
    tier: 1,
    catches: 0,
    perfects: 0,
    greats: 0,
    saves: 0,
    misses: 0,
    perfStreak: 0,
    bestPerfStreak: 0,
    hearts: HEARTS,
    invulnQ: 0,
    meter: 0,
    ghQ: 0,
    ghExt: 0,
    fevers: 0,
    banked: 0,
    bounces: 0,
    goldBalls: 0,
    grazes: 0,
    closeA: -100000,
    closeB: -100000,
    chainFreezeQ: 0,
    fingerQ: 0,
    watchUsed: 0,
    luckyN: 0,
    pops: 0,
    bonks: 0,
    dNext: 28,
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
    wind: 1,
    gSt: 0,
    gX: 0,
    gQ: 0,
    gLen: 0,
    gNext: 1 << 30,
    gSeen: 0,
    gSent: 0,
    gullIn: [],
    gullLog: [],
    sSt: 0,
    sX: 0,
    sQ: 0,
    sNext: 1 << 30,
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
  const g = cfg.gulls;
  if (g) for (let i = 0; i < g.length; i++) s.gullIn.push(g[i] | 0);
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

export function tierOf(chain: number): number {
  'worklet';
  if (chain >= TIER_AT[3]) return 4;
  if (chain >= TIER_AT[2]) return 3;
  if (chain >= TIER_AT[1]) return 2;
  return 1;
}

export function maybeCard(s: SimState, card: number): void {
  'worklet';
  if ((s.cardsSeen & card) !== 0) return;
  s.cardsSeen |= card;
  s.cardPending = card;
  s.holdTs = 0;
  emit(s, EV_CARD, card, 0, 0);
}

export function freeSlot(s: SimState): number {
  'worklet';
  for (let i = 0; i < MAX_ITEMS; i++) if (s.iSt[i] === S_FREE) return i;
  return -1;
}

/** Queue a pending spawn without reachability (gift showers). */
export function queueRaw(s: SimState, at: number, kind: number, xSub: number, vx: number, vy: number, g: number, must: number, flag: number): void {
  'worklet';
  if (s.pN >= MAX_PENDING) return;
  const i = s.pN;
  s.pSpawn[i] = at;
  s.pKind[i] = kind;
  s.pX[i] = xSub;
  s.pVx[i] = vx;
  s.pVy[i] = vy;
  s.pG[i] = g;
  s.pLandStep[i] = at + 60;
  s.pLand[i] = 60;
  s.pMust[i] = must;
  s.pFlag[i] = flag;
  s.pN = i + 1;
}

