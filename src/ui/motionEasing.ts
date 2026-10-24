/**
 * Reanimated curves for the motion language in ./motion.ts. Import these
 * instead of writing a new Easing or spring in a big moment, sheet or modal.
 */
import { Easing } from 'react-native-reanimated';
import { BEZIER } from './motion';

const bezier = ([x1, y1, x2, y2]: readonly [number, number, number, number]) => Easing.bezier(x1, y1, x2, y2);

export const EASE = {
  out: bezier(BEZIER.out),
  in: bezier(BEZIER.in),
  inOut: bezier(BEZIER.inOut),
  charge: bezier(BEZIER.charge),
} as const;

export { DURATION, SPRING, PARTICLES, GOLD_FX, levelUpPayoff, momentBeats, momentParticles, raysMayTurn, chargeFill, flashPeak, FLASH_MAX_OPACITY,
  RAY_TURN_FROM, pieceSnapTimes, chaserRattles, SLOW_SERVER_LABEL_MS } from './motion';
