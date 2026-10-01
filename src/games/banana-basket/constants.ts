/**
 * Banana Basket v2 tuning (design rev 8, "hero first, live heats").
 *
 * Integer only: field units (fu) with 256 sub-units, 60 Hz steps, q8
 * timescales. The deterministic sim, the bots, the proof and the server
 * replay port all read these. Baked physics tables live in tables.ts.
 * tools/banana/doc-sync.cjs checks every `<!-- sync:... -->` table in
 * studio/design/banana.md against this file (npm test fails on drift).
 */

export const VERSION = 'bb2r8';
export const SUB = 256;

// Field (portrait, logical). The renderer scales by screenW / 400.
export const FIELD_W = 400;
export const FIELD_H = 720;
export const CART_Y = 86;
export const SPAWN_Y = 112;
export const LANE_Y = 490;
export const PLAZA_Y = 605;

// Basket and catch rule (3.1, 3.3).
export const BASKET_MIN = 62;
export const BASKET_MAX = 338;
export const HALF_ZONE = 62;
export const WIDE_ZONE = 78;
export const ASSIST_ZONE = 6;
/** 0-10 fu outside the zone still counts as a CATCH (render-only roll-in). */
export const EDGE_BAND = 10;
export const PERFECT_D = 12;
/** CLOSE CALL: a puffer passing 0-14 fu outside the hit test. */
export const CLOSE_CALL_BAND = 14;
/** Must-catch pair reachability: dtSteps >= REACT + TRAVEL[max(0, dx - SLACK)]. */
export const REACT_STEPS = 15;
export const REACH_SLACK = 40;
/** A puffer landing near a must-catch item keeps this much x clearance. */
export const PUFFER_CLEAR = 112;

// Movement (3.1): within SNAP the basket lands on the target, else it sweeps.
export const SNAP = 80;
export const SWEEP = 40;
/** Relative drag gain (q8): 1.15. */
export const DRAG_GAIN_Q8 = 294;

// Thumb time and the Freeze Lock (3.2).
export const LOCK_STEPS = 30;

// Beat grid: 900/7 BPM, one beat = 28 steps, one bar = 112 steps.
export const STEPS_BEAT = 28;
export const STEPS_HALF = 14;
export const STEPS_BAR = 112;

// Rounds (6.1, 6.3).
export const RIDE_STEPS = 2688;
export const SET_STEPS = 1232;
export const QUEUE_SETS = 3;
export const RUSH_RIDE = 2128;
export const RUSH_QUEUE = 3024;
export const TIPOVER_START = 2464;
export const REMIX_START = 2800;
/** Bananas start at this step or after the serve's 2nd bounce. */
export const SERVE_STEP = 168;
export const SERVE_BOUNCES = 2;
/** ride_intro and queue run 1: the ball arrives here. */
export const INTRO_BALL = 280;
export const INTRO_PRIZE = 560;
export const RIDE_PRIZE = 336;
export const RIDE_PUFFER = 1120;
export const QUEUE1_PUFFER = 896;
export const BREATHER_START = 1904;
export const LUCKY_FROM = 1456;
export const FORK_FROM = 896;

// Rulesets (6.1, 6.4, 11.2).
export const R_INTRO = 0;
export const R_RIDE = 1;
export const R_QUEUE = 2;
export const R_HEAT = 3;
export const RULES_NAMES = ['ride_intro', 'ride', 'queue', 'heat'] as const;

// Item kinds.
export const K_BANANA = 1;
export const K_BUNCH = 2;
export const K_LUCKY = 3;
export const K_COIN = 4;
export const K_PUFFER = 5;

/** Sprite size (fu) per kind, index = kind. */
export const ITEM_SIZE = [0, 56, 70, 74, 60, 64];
/** Base points per kind (Lucky Bunch = 5 x 30). */
export const ITEM_BASE = [0, 10, 30, 150, 50, 0];
/** Gravity factor per kind (q8): bunch 1.25, coin 0.85, puffer 0.75. */
export const ITEM_G_Q8 = [0, 256, 320, 256, 218, 192];
export const GIANT_SIZE = 72;
export const GIANT_BASE = 15;
export const GIANT_G_Q8 = 230;

// Item states.
export const S_FREE = 0;
export const S_FALL = 1;
export const S_EDGE = 2;
export const S_MISS = 3;
export const S_DUNK = 4;
export const S_POP = 5;
export const S_BONKED = 6;
export const S_PASS = 7;
export const S_HANG = 8;
export const S_REEL = 9;

// Fall profiles by phase (sub-units per step and per step^2).
export const PHASE_SERVE = 0;
export const PHASE_WARM = 1;
export const PHASE_BUILD = 2;
export const PHASE_PRESSURE = 3;
export const PHASE_BREATHER = 4;
export const PHASE_RUSH = 5;
export const PHASE_TIPOVER = 6;
export const PHASE_VY0 = [683, 683, 811, 811, 683, 1024, 811];
export const PHASE_G = [32, 34, 38, 38, 34, 46, 38];
/** Phrase budget per 5 s (300 steps) by phase (6.2): +1 per tier above x1. */
export const PHASE_BUDGET = [3, 3, 6, 9, 4, 12, 16];
/** Gold Rush: interval x0.7 (budget / 0.7). */
export const RUSH_INTERVAL_Q8 = 179;

/** Difficulty tables (6.1), index = difficulty 1..3: gravity, interval, puffer budget. */
export const DIFF_G_Q8 = [256, 230, 256, 287];
export const DIFF_INTERVAL_Q8 = [256, 282, 256, 230];
export const DIFF_PUFFER_Q8 = [256, 205, 256, 320];

// Puffer tells and minimum fall times (steps): Ride 600 / 700 ms, queue and heats 800 / 900 ms.
export const PUFFER_TELL_RIDE = 36;
export const PUFFER_TELL_QUEUE = 48;
export const PUFFER_MIN_FALL_RIDE = 42;
export const PUFFER_MIN_FALL_QUEUE = 54;
/** Threat cap: hazards airborne or telegraphing (Ride and heats 2, queue 3). */
export const THREAT_CAP_RIDE = 2;
export const THREAT_CAP_QUEUE = 3;

// Hearts, hit-stop, slow-mo.
export const HEARTS = 3;
export const INVULN_STEPS = 54;
export const HITSTOP_PUFFER = 6;
export const HITSTOP_GOLDEN = 3;
export const HITSTOP_TIME = 4;
export const HITSTOP_GAP = 15;
export const CLOSE_TS = 90;
export const CLOSE_HOLD = 7;
export const CLOSE_EASE = 9;
export const FINALE_TS = 64;
export const FINALE_NEAR = 150;

// The ball (3.4).
export const BALL_R = 26;
export const BALL_SURFACE = 10;
export const BALL_WALL_Q8 = 230;
/** Rim zones: contact offset edges (fu) and exit tangents (q8) for -16, -8, 0, +8, +16 deg. */
export const ZONE_CENTER = 12;
export const ZONE_INNER = 40;
export const ZONE_OUTER = 88;
export const TAN_Q8 = [-73, -36, 0, 36, 73];
export const ZONE_NAMES = ['OUTER-L', 'INNER-L', 'CENTER', 'INNER-R', 'OUTER-R'] as const;
/** Contact offset at each zone's middle (bots, aim): -64, -26, 0, +26, +64. */
export const ZONE_MID = [-64, -26, 0, 26, 64];
export const BALL_GOLD_AT = 10;
export const BALL_ARC_BOUNCES = 3;
/** Re-serve: 2 s before step 560 (tutorial grace) and all of ride_intro, else 6 s; on the next beat. */
export const RESERVE_GRACE = 120;
export const RESERVE_LATE = 360;
export const RESERVE_GRACE_UNTIL = 560;
export const RESERVE_TELL = 24;
/** Crosswind twist: ball vx gains WIND sub-units per step (60 fu/s^2), sign per set. */
export const WIND_SUB = 4;

// Free-ball pail (3.5): ping-pong x 90..310 at 40 fu/s (330 steps per leg) on y 605.
export const PAIL_MIN = 90;
export const PAIL_MAX = 310;
export const PAIL_LEG = 330;
export const PAIL_REACH = 34;
export const PAIL_RESERVE = 60;

// Hanging prizes (4.1).
export const PRIZE_R = 30;
export const PRIZE_LIFE = 336;
export const PRIZE_EVERY = 336;
export const PRIZE_Y_MIN = 200;
export const PRIZE_Y_MAX = 380;
export const PRIZE_RUSH_Y_MIN = 300;
export const LUCKY_MAX = 2;
export const LUCKY_MAX_PARTY = 3;
export const MAX_PRIZES = 4;

// Coin Meter and Golden Hour (5.2).
export const METER_PIPS = 3;
export const GOLDEN_STEPS = 336;
export const GOLDEN_WARN = 84;
export const GOLDEN_ZONE_Q8 = 333;
export const GOLDEN_MAGNET = 60;
export const COIN_SET_PTS = 100;

// Chain (5.1).
export const TIER_AT = [0, 5, 12, 20];

// Scoring (5.3, quarters): B = 4 + grade + event, mQ = min(32, T * B).
export const G_CATCH = 0;
export const G_PERFECT = 2;
export const G_POP = 4;
export const G_GOLD_POP = 6;
export const EVENT_GOLDEN = 4;
export const EVENT_RUSH = 2;
export const MQ_CAP = 32;
export const CLOSE_PTS = 50;
export const BONK_BASE = 20;
export const HEART_PTS = 50;

// Gulls (4.2, queue Set 2).
export const GULL_TELL_FIRST = 66;
export const GULL_TELL = 54;
export const GULL_DIVE = 42;
export const GULL_REACH = 70;
export const GULL_GAP_BARS = 3;

// Park Twists (5.6, queue unlock 3+ and heats).
export const TWIST_NONE = 0;
export const TWIST_CROSSWIND = 1;
export const TWIST_GIANT = 2;
export const TWIST_LOWGRAV = 3;
export const TWIST_PRIZES = 4;
export const TWIST_NAMES = ['', 'CROSSWIND', 'GIANT BANANAS', 'LOW GRAVITY', 'PRIZE PARTY'] as const;
export const LOWGRAV_Q8 = 205;

// Teaching cards (bitmask of cards already seen, part of the proof).
export const CARD_CATCH = 1;
export const CARD_BALL = 2;
export const CARD_AIM = 4;
export const CARD_PUFFER = 8;
export const CARD_GOLDEN = 16;
export const CARD_GATE = 32;
export const CARD_GULL = 64;
export const CARD_PAIL = 128;
export const CARD_HEAT = 256;
/** Set cards are 1000 + the set that just started. */
export const CARD_SET_BASE = 1000;

// Stars (5.4): Ride table; ride_intro 2 stars x0.8, 3 stars x0.75, no crown;
// queue and heats x1.35. Index = difficulty 1..3: [1 star, 2 stars, 3 stars, crown].
// Bot-seeded starting values; P2 human telemetry locks them (G19).
export const STARS_RIDE: readonly (readonly [number, number, number, number])[] = [
  [360, 800, 1350, 2500],
  [360, 800, 1350, 2500],
  [450, 1000, 1650, 2950],
  [550, 1200, 2000, 3500],
];
export const INTRO_TWO_Q8 = 205;
export const INTRO_THREE_Q8 = 192;
export const QUEUE_STAR_Q8 = 346;

/** Ride decks (deckIdForRideName). */
export const DECKS = ['park', 'space', 'pirates', 'mansion', 'backlot', 'jungle', 'ocean'] as const;
export type DeckId = (typeof DECKS)[number];

/** Line Heat (11.2). */
export const HEAT_PERIOD_S = 180;
export const HEAT_CLOSE_S = 150;
export const HEAT_JOIN_S = 10;
export const HEAT_MIN_FIELD = 4;
export const HEAT_MAX_STRIP = 8;

export const BEST_KEY = 'tps.banana.best.v3';
export const PROGRESS_KEY = 'tps.banana.progress.v3';
