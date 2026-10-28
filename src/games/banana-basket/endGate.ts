/**
 * endGate.ts: what the Banana Basket loop does on each step at the edges of a
 * run (a teaching card is up, the run is over, the finale is still falling).
 * Worklets, pure, shared by BananaBasketGame's onStep and the tests.
 *
 * Two dead ends this closes (results lane, wave 6):
 *   - a teaching card that opened on the run's last step could never close,
 *     because the loop stopped on `done` before it looked at the card gate;
 *   - TIME! with the finale's last bunch still in the air needed the thumb
 *     down to finish (thumb up freezes time), so a kid who let go at the end
 *     saw an empty timer and no card. Once time is up the finale plays out on
 *     its own: the loop holds for the kid. The step is logged as a normal held
 *     step, so the proof replays exactly.
 */

import { QUEUE_SETS } from './constants';
import { MODE_QUEUE, type SimState } from './sim';

/** Step the sim as usual. */
export const GATE_RUN = 0;
/** A card is up and still reading (or waiting for a touch): no step. */
export const GATE_WAIT = 1;
/** The card was read and the thumb is down: close it, then step. */
export const GATE_CLOSE_RUN = 2;
/** The run is over: no step. */
export const GATE_STOP = 3;
/** The run is over with a card still up: close it, no step. */
export const GATE_CLOSE_STOP = 4;

/** cardGate: 0 none, 1 opening (minimum read time), 2 ready to close on a touch. */
export function stepGate(done: boolean, gate: number, touching: boolean): number {
  'worklet';
  if (done) return gate !== 0 ? GATE_CLOSE_STOP : GATE_STOP;
  if (gate === 1) return GATE_WAIT;
  if (gate === 2) return touching ? GATE_CLOSE_RUN : GATE_WAIT;
  return GATE_RUN;
}

/** The last set's time is used up (the HUD timer is empty). */
export function timeIsUp(s: SimState): boolean {
  'worklet';
  const lastSet = s.mode !== MODE_QUEUE || s.set === QUEUE_SETS - 1;
  return lastSet && s.clock - s.setStart >= s.setLen;
}

/** Time is up and the finale's bunch is still falling: the loop holds so it lands by itself. */
export function finaleAutoHold(s: SimState): boolean {
  'worklet';
  return !s.done && s.finale === 1 && timeIsUp(s);
}
