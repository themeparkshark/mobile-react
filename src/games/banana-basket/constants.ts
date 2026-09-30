/**
 * Banana Basket v2 tuning (design rev 4, "earn every catch").
 *
 * Integer only: field units (fu) with 256 sub-units, 60 Hz steps, q8
 * timescales. The deterministic sim, the bots, the proof and the server
 * replay port all read these. Baked physics tables live in tables.ts.
 */

export const VERSION = 'bb2r4';
export const SUB = 256;

// Field (portrait, logical). The renderer scales by screenW / 400.
export const FIELD_W = 400;
export const FIELD_H = 720;
export const RIVAL_STRIP_H = 56;
export const CART_Y = 86;
export const SPAWN_Y = 112;
export const LANE_Y = 490;
export const PLAZA_Y = 605;

// Basket and catch rule.
export const BASKET_MIN = 62;
export const BASKET_MAX = 338;
export const HALF_ZONE = 62;
export const ASSIST_ZONE = 6;
export const RIM_ROLL_BAND = 10;
export const RIM_ROLL_STEPS = 8;
export const PERFECT_D = 12;
export const GREAT_D = 26;
export const CLOSE_CALL_BAND = 12;
/** Must-catch pair reachability: react steps and the share of the half-width. */
export const REACT_STEPS = 15;
export const REACH_SLACK = 40;
/** A puffer landing near a must-catch item keeps this much x clearance. */
export const PUFFER_CLEAR = 112;

// Movement (sub-units per step). Mirrors tools/banana/gen-tables.cjs.
export const CAP_SUB = 24 * SUB;
export const ACC_SUB = 6 * SUB;
export const FREE_SUB = 14 * SUB;
/** Relative drag gain (q8): 1.15. */
export const DRAG_GAIN_Q8 = 294;

// Beat grid: 900/7 BPM, one beat = 28 steps, one bar = 112 steps.
export const STEPS_BEAT = 28;
export const STEPS_HALF = 14;
export const STEPS_BAR = 112;

// Rounds.
export const RIDE_STEPS = 2700;
export const SET_STEPS = 1200;
export const QUEUE_SETS = 3;

// Item kinds.
export const K_BANANA = 1;
export const K_BUNCH = 2;
export const K_LUCKY = 3;
export const K_COIN = 4;
export const K_PUFFER = 5;
export const K_GIFT = 6;
export const K_FINGER = 7;
export const K_WATCH = 8;

/** Sprite size (fu) per kind, index = kind. */
export const ITEM_SIZE = [0, 56, 70, 74, 60, 64, 58, 56, 52];
/** Base points per kind. */
export const ITEM_BASE = [0, 10, 30, 30, 50, 0, 20, 20, 20];
/** Gravity factor per kind (q8). */
export const ITEM_G_Q8 = [0, 256, 320, 282, 218, 192, 205, 205, 205];

// Item states.
export const S_FREE = 0;
export const S_FALL = 1;
export const S_RIM = 2;
export const S_MISS = 3;
export const S_DUNK = 4;
export const S_POP = 5;
export const S_BONKED = 6;
export const S_PASS = 7;

// Fall profiles by phase (fu/s, fu/s^2 converted to sub-units per step).
// vy0 160 / g 480 (warm), 190 / 540 (build, pressure), 240 / 640 (rush).
export const PHASE_WARM = 0;
export const PHASE_BUILD = 1;
export const PHASE_PRESSURE = 2;
export const PHASE_BREATHER = 3;
export const PHASE_RUSH = 4;
export const PHASE_TIPOVER = 5;
export const PHASE_VY0 = [683, 811, 811, 683, 1024, 811];
export const PHASE_G = [34, 38, 38, 34, 46, 38];
/** Phrase budget per 5 s (300 steps) by phase. */
export const PHASE_BUDGET = [5, 9, 12, 5, 15, 16];

/** Difficulty tables, index = difficulty 1..3. */
export const DIFF_G_Q8 = [256, 230, 256, 287];
export const DIFF_BUDGET_Q8 = [256, 233, 256, 284];
export const DIFF_PUFFER_Q8 = [256, 205, 256, 320];

// Puffer tells and minimum fall times (steps).
export const PUFFER_TELL_RIDE = 36;
export const PUFFER_TELL_QUEUE = 48;
export const PUFFER_MIN_FALL_RIDE = 42;
export const PUFFER_MIN_FALL_QUEUE = 54;

// Hearts, hit-stop, slow-mo.
export const HEARTS = 3;
export const INVULN_STEPS = 54;
export const HITSTOP_PUFFER = 6;
export const HITSTOP_GOLDEN = 3;
export const HITSTOP_TIME = 4;
export const CLOSE_TS = 90;
export const CLOSE_HOLD = 7;
export const CLOSE_EASE = 9;
export const FINALE_TS = 64;
export const FINALE_NEAR = 150;
export const GRAZE_WINDOW = 300;

// Juggle ball.
export const BALL_R = 26;
export const BALL_SURFACE = 10;
export const BALL_WALL_Q8 = 230;
export const BALL_RESPAWN = 360;
export const BALL_RESPAWN_BEACH = 180;
export const BALL_GOLD_AT = 10;
export const BALL_ARC_BOUNCES = 3;

// Coin meter and Golden Hour.
export const METER_PIPS = 3;
export const GOLDEN_STEPS = 360;
export const GOLDEN_COIN_EXT = 30;
export const GOLDEN_EXT_MAX = 180;
export const GOLDEN_WARN = 90;
export const GOLDEN_ZONE_Q8 = 333;
export const GOLDEN_BANK = 250;

// Chain.
export const TIER_AT = [0, 5, 12, 20];
export const CHAIN_FREEZE_STEPS = 96;

// Scoring (quarters): B = 4 + grade + event, mQ = min(32, T * B).
export const G_GOOD = 0;
export const G_GREAT = 1;
export const G_PERFECT = 2;
export const G_POP = 4;
export const G_GOLD_POP = 6;
export const EVENT_GOLDEN = 4;
export const EVENT_RUSH = 2;
export const MQ_CAP = 32;
export const CLOSE_PTS = 25;
export const GRAZE_PTS = 100;
export const SAVE_PTS = 25;
export const GOLD_BOUNCE_PTS = 50;
export const BONK_BASE = 20;
export const SPARE_POWER_PTS = 50;
export const CLEAN_SWEEP = 200;
export const PERFECT_STREAK_PTS = 20;
export const HEART_PTS = 50;

// Queue: power-ups, twists, gulls, splash.
export const FINGER_STEPS = 360;
export const FINGER_RANGE = 120;
export const WATCH_STEPS = 180;
export const WATCH_MAX = 2;
export const TWIST_NONE = 0;
export const TWIST_GULLS = 1;
export const TWIST_BREEZY = 2;
export const TWIST_BEACH = 3;
export const TWIST_SPLASH = 4;
export const BREEZE_SUB = 171; // 40 fu/s
export const GULL_TELL_FIRST = 66;
export const GULL_TELL = 54;
export const GULL_REACH = 70;
export const GULL_SEND_DELAY = 90;
export const SPLASH_TELL = 54;
export const SPLASH_HALF = 55;

// Teaching cards (bitmask of cards already seen, part of the proof).
export const CARD_BALL = 1;
export const CARD_PUFFER = 2;
export const CARD_GOLDEN = 4;
export const CARD_RIM = 8;
export const CARD_FINGER = 16;
export const CARD_GULLS = 32;
export const CARD_BREEZY = 64;
export const CARD_BEACH = 128;
export const CARD_SPLASH = 256;
/** Set cards are 1000 + the set that just ended. */
export const CARD_SET_BASE = 1000;

// Stars (Ride table; queue x1.35). Index = difficulty 1..3. Calibrated on the
// bots (120 seeds each, 2026-09-30): 1 star sits near the Kid bot's 5-15th
// percentile (the Ride Challenge win must stay kind to first-timers), 3 stars
// near the Expert bot's median and above the Human bot's 90th percentile.
// Humans have the final say (design A7b P2 gate).
export const STARS_RIDE: readonly (readonly [number, number, number])[] = [
  [5500, 8500, 11200],
  [5500, 8500, 11200],
  [6000, 9000, 11700],
  [6300, 9300, 12000],
];
export const QUEUE_STAR_Q8 = 346;

/** Ride decks (deckIdForRideName). Water decks force Splashdown in the queue. */
export const DECKS = ['park', 'space', 'pirates', 'mansion', 'backlot', 'jungle', 'ocean'] as const;
export type DeckId = (typeof DECKS)[number];
export const WATER_DECKS: readonly string[] = ['ocean', 'pirates'];

export const BEST_KEY = 'tps.banana.best.v2';
export const PROGRESS_KEY = 'tps.banana.progress.v2';
