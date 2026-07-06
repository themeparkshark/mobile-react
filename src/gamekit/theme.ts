/**
 * GameKit theme — TPS palette + game-feel constants.
 *
 * This is the single source of truth for every minigame's look and feel.
 * Values here mirror the app design system (src/design-system.ts) but are
 * scoped to the gamekit so games never reach into unrelated UI tokens.
 *
 * Quality bar reference: Alto's Odyssey menus + Pokémon GO catch screen.
 */

// =============================================================================
// PALETTE — TPS brand
// =============================================================================

export const GAME_COLORS = {
  // Brand
  navy: '#09268f',
  blue: '#00a5f5',
  gold: '#fec90e',
  coral: '#ff6b5c',

  // Surfaces (dark, game-native)
  bgDeep: '#050a1e',
  bgDark: '#0a1628',
  bgPanel: '#142040',
  bgElevated: '#1a2a50',

  // Text
  text: '#ffffff',
  textDim: 'rgba(255,255,255,0.72)',
  textFaint: 'rgba(255,255,255,0.45)',

  // Feedback
  success: '#4ade80',
  warn: '#ffc107',
  danger: '#f44336',

  // Star / result tiers
  star: '#fec90e',
  starEmpty: 'rgba(255,255,255,0.18)',
} as const;

export type GameColorKey = keyof typeof GAME_COLORS;

// Combo tier colors — escalate warmth as the streak climbs.
export const COMBO_TIER_COLORS = {
  1: GAME_COLORS.blue,
  2: '#7c4dff',
  3: GAME_COLORS.gold,
  5: GAME_COLORS.coral,
} as const;

// =============================================================================
// TIMING / GAME-FEEL CONSTANTS
// =============================================================================

/** Fixed simulation step for GameLoop (ms). 60Hz. */
export const FIXED_STEP_MS = 1000 / 60;

/** Max accumulated catch-up per frame to avoid the "spiral of death". */
export const MAX_FRAME_MS = 250;

/** Screen-shake ceiling — big hits must never exceed this (quality bar). */
export const MAX_SHAKE_MS = 120;

/** Standard interruption toast copy when the line moves. */
export const LINE_MOVING_TOAST = "Line's moving! 🚶";

export const JUICE = {
  /** Squash/stretch spring on tap. */
  popSpring: { damping: 9, stiffness: 320, mass: 0.6 },
  /** Softer settle for score/badges. */
  settleSpring: { damping: 14, stiffness: 180, mass: 0.9 },
  /** Snappy micro-scale for button presses. */
  pressSpring: { damping: 12, stiffness: 400, mass: 0.5 },
  /** Squash target on a press-in (scale). */
  squashTo: 0.9,
  /** Overshoot target on a pop-in (scale). */
  popTo: 1.18,
  /** Flash overlay fade duration (ms). */
  flashMs: 140,
} as const;

export const COUNTDOWN = {
  /** Per-number dwell in the 3-2-1 (ms). */
  stepMs: 700,
  /** "GO!" dwell before the game starts (ms). */
  goMs: 450,
} as const;

/** Standard score count-up tween duration (ms). */
export const SCORE_TWEEN_MS = 550;

/** Particle system hard cap (quality bar: pooled, max 200). */
export const MAX_PARTICLES = 200;
