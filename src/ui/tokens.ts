/**
 * TPS brand tokens (WS0 UI kit).
 *
 * Flat cartoon look: bright blue panels, white and cream cards, gold calls to
 * action, thick navy outlines. No black scrims, no dark or neon surfaces, no
 * purple. Every new surface should read from here instead of hard-coding hex.
 */

export const BRAND = {
  cream: '#fff8e4',
  creamDeep: '#f6e8bf',
  white: '#ffffff',
  /** Panel blue, the house surface colour. */
  blue: '#0768b9',
  /** Brighter blue for raised panels, secondary buttons and headers. */
  blueBright: '#0879ca',
  /** Light water blue for tracks, wells and quiet fills. */
  sky: '#bfe5ff',
  skyDeep: '#7cc6f5',
  /** The thick cartoon outline and the ink colour for text on light cards. */
  navy: '#05346e',
  /** Secondary ink on cream or white. */
  navySoft: '#3d5f8c',
  gold: '#ffcf3b',
  goldLight: '#ffe07a',
  /** The 4px lip under gold buttons. */
  goldLip: '#d99a00',
  /** Lip under blue buttons. */
  blueLip: '#05468f',
  /** Destructive actions and HP only. */
  red: '#ef4a3c',
  redLip: '#b3261b',
  /** Confirmation ticks only, never a surface. */
  green: '#3cb85c',
  greenLip: '#237a3b',
  /** Navy scrim behind dialogs and sheets. Never black. */
  scrim: 'rgba(8,56,128,0.45)',
  /** Soft navy used for drop shadows. */
  shadow: '#05346e',
} as const;

export type BrandColor = keyof typeof BRAND;

export const OUTLINE = {
  /** Icons at 16-24px and chips. */
  thin: 2,
  /** Cards, buttons and dialogs. */
  thick: 3,
  /** Hero cards and the dialog frame. */
  heavy: 4,
} as const;

export const RADIUS = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const SPACE = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const FONT = {
  /** Chunky display face. Titles, buttons, numbers. */
  display: 'Shark',
  /** Condensed body face. Copy, labels, captions. */
  body: 'Knockout',
} as const;

/** Soft navy drop shadow. Never black. */
export const SHADOW = {
  card: {
    shadowColor: BRAND.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
  },
  lifted: {
    shadowColor: BRAND.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 12,
  },
} as const;

/** Motion: purposeful and short. Every animation has a reduced-motion path. */
export const MOTION = {
  pressInMs: 70,
  pressOutMs: 120,
  fadeMs: 180,
  dialogInMs: 220,
  dialogOutMs: 150,
  /** Pop for dialogs and badges. */
  popSpring: { damping: 14, stiffness: 260, mass: 0.8 },
  /** Loader swim cycle. */
  swimMs: 1400,
  bobMs: 900,
} as const;

/**
 * Button geometry. GameButton is Dustin's own image button (yellow_button.png,
 * red_button.png), so these numbers come from YellowButton, not a new design.
 */
export const BUTTON = {
  /** yellow_button.png is drawn at this width:height (contain). */
  aspectRatio: 3.8,
  /** The label area inside the art, as in YellowButton. */
  labelAspectRatio: 4.4,
  /** Regular buttons never grow wider than this. */
  maxWidth: 320,
  /** Secondary (compact) buttons. */
  compactMaxWidth: 240,
  /** Press scale and timings from YellowButton. */
  pressScale: 0.97,
  pressInMs: 65,
  pressOutMs: 95,
  /** Ghost (text) buttons keep a 44pt touch target. */
  ghostMinHeight: 44,
} as const;

export const Z = {
  dialog: 1000,
  toast: 2000,
} as const;

export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;

export type GameButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type GameButtonSize = 'regular' | 'compact';
