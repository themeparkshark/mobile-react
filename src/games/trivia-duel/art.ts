/**
 * Trivia Duel art. Alex's originals (resized, never redrawn) and the studio's
 * gate-passed GPT Image 2.5 pieces (Fin's 12-cell sheet, captain hat, desk
 * bell, shared FX). Metro needs literal requires.
 */

export const FIN_POSES = {
  idle: require('../../assets/games/trivia-duel/fin_idle.png'),
  idle_blink: require('../../assets/games/trivia-duel/fin_idle_blink.png'),
  idle_talk: require('../../assets/games/trivia-duel/fin_idle_talk.png'),
  think: require('../../assets/games/trivia-duel/fin_think.png'),
  think_blink: require('../../assets/games/trivia-duel/fin_think_blink.png'),
  think_talk: require('../../assets/games/trivia-duel/fin_think_talk.png'),
  point: require('../../assets/games/trivia-duel/fin_point.png'),
  cheer: require('../../assets/games/trivia-duel/fin_cheer.png'),
  surprised: require('../../assets/games/trivia-duel/fin_surprised.png'),
  sheepish: require('../../assets/games/trivia-duel/fin_sheepish.png'),
  dizzy: require('../../assets/games/trivia-duel/fin_dizzy.png'),
  nervous: require('../../assets/games/trivia-duel/fin_nervous.png'),
} as const;
export type FinPose = keyof typeof FIN_POSES;
export const FIN_POSE_ORDER: readonly FinPose[] = [
  'idle', 'idle_blink', 'idle_talk', 'think', 'think_blink', 'think_talk',
  'point', 'cheer', 'surprised', 'sheepish', 'dizzy', 'nervous',
];
/** All 12 cells share one bottom-centre anchored 206 x 241 canvas. */
export const FIN_CELL = { w: 206, h: 241 } as const;
/** Hat anchor per pose, in cell pixels (centre of the hat band) + rotation (deg). */
export const HAT_ANCHOR: Record<FinPose, { x: number; y: number; rot: number }> = {
  idle: { x: 112, y: 34, rot: -12 },
  idle_blink: { x: 112, y: 34, rot: -12 },
  idle_talk: { x: 112, y: 34, rot: -12 },
  think: { x: 112, y: 34, rot: -12 },
  think_blink: { x: 112, y: 34, rot: -12 },
  think_talk: { x: 112, y: 34, rot: -12 },
  point: { x: 112, y: 34, rot: -12 },
  cheer: { x: 112, y: 34, rot: -10 },
  surprised: { x: 118, y: 36, rot: -8 },
  sheepish: { x: 118, y: 38, rot: -10 },
  dizzy: { x: 86, y: 52, rot: -28 },
  nervous: { x: 116, y: 36, rot: -12 },
};

export const ART = {
  hat: require('../../assets/games/trivia-duel/captain_hat.png'),
  bell: require('../../assets/games/trivia-duel/desk_bell.png'),
  coin: require('../../assets/games/trivia-duel/coin.png'),
  magnifier: require('../../assets/games/trivia-duel/magnifier.png'),
  foamFinger: require('../../assets/games/trivia-duel/foam_finger.png'),
  sunglasses: require('../../assets/games/trivia-duel/sunglasses.png'),
  polaroid: require('../../assets/games/trivia-duel/polaroid.png'),
  xBadge: require('../../assets/games/trivia-duel/x_badge.png'),
  flame: require('../../assets/games/trivia-duel/flame.png'),
  crown: require('../../assets/games/trivia-duel/crown.png'),
  stopwatch: require('../../assets/games/trivia-duel/stopwatch.png'),
  chomp: require('../../assets/games/trivia-duel/shark_dash_chomp.png'),
  ribbon: require('../../assets/games/trivia-duel/ribbon.png'),
  sweat: require('../../assets/games/trivia-duel/fx_small_sweat_drop.png'),
  dizzyStar: require('../../assets/games/trivia-duel/fx_small_dizzy_star.png'),
  bubble: require('../../assets/games/trivia-duel/fx_small_bubble.png'),
  sparkle: require('../../assets/games/trivia-duel/fx_small_sparkle.png'),
  confettiStar: require('../../assets/games/trivia-duel/fx_confetti_star.png'),
  impact: require('../../assets/games/trivia-duel/fx_impact_m.png'),
} as const;

/** Alex's shark colour variants: you (classic), ghosts and the crowd. */
export const SHARKS = {
  classic: require('../../assets/games/trivia-duel/shark_classic.png'),
  blue: require('../../assets/games/trivia-duel/shark_blue.png'),
  green: require('../../assets/games/trivia-duel/shark_green.png'),
  orange: require('../../assets/games/trivia-duel/shark_orange.png'),
  pink: require('../../assets/games/trivia-duel/shark_pink.png'),
  red: require('../../assets/games/trivia-duel/shark_red.png'),
} as const;
export type SharkLook = keyof typeof SHARKS;
export const CROWD_LOOKS: readonly SharkLook[] = ['pink', 'green', 'orange', 'blue', 'red', 'classic', 'orange', 'pink', 'green'];

/** Palette (design 8): bright boardwalk, navy only for text and outlines. */
export const C = {
  blue: '#00a5f5',
  sky: '#8fdcff',
  skyTop: '#46bdf5',
  navy: '#063f73',
  ink: '#2b2b33',
  gold: '#fec90e',
  goldDeep: '#e0a100',
  cream: '#fff9e8',
  creamDeep: '#f3e3b8',
  coral: '#ff6b5c',
  green: '#3fbf5f',
  white: '#ffffff',
  sea: '#1fb7e8',
  seaDeep: '#1497d4',
  wood: '#e7a860',
  woodDeep: '#c07f3e',
  frost: '#dff4ff',
  lightning: '#fff3b0',
} as const;

/** Tile shape + colour badges (3): A blue circle, B coral triangle, C gold star, D green diamond. */
export const BADGES = [
  { shape: 'circle', color: '#1f9bea' },
  { shape: 'triangle', color: '#ff6b5c' },
  { shape: 'star', color: '#fec90e' },
  { shape: 'diamond', color: '#3fbf5f' },
] as const;
