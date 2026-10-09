/**
 * Pocket dim (Battery Saver only), like Pokemon GO's upside-down saver.
 * Phone face down or upside down in a pocket for POCKET_AFTER_MS: the screen
 * goes black (an OLED black pixel is off) while the game keeps running.
 * Turn it back up and the game is right there. Pure rules, unit tested.
 *
 * expo-sensors Accelerometer (iOS, in g): face up on a table z = -1,
 * face down z = +1, upright in a hand y = -1, upside down in a pocket y = +1.
 */
export const POCKET_AFTER_MS = 3000;
/** Leave the dim at once when the phone comes up past this. */
const FACE_DOWN_Z = 0.75;
const UPSIDE_DOWN_Y = 0.75;

export interface Tilt { readonly x: number; readonly y: number; readonly z: number }

export function isPocketPose(t: Tilt): boolean {
  return t.z > FACE_DOWN_Z || t.y > UPSIDE_DOWN_Y;
}

export interface PocketState { readonly since: number | null; readonly dim: boolean }

export const POCKET_START: PocketState = { since: null, dim: false };

export function nextPocketState(prev: PocketState, t: Tilt, now: number): PocketState {
  if (!isPocketPose(t)) return prev.since === null && !prev.dim ? prev : POCKET_START;
  const since = prev.since ?? now;
  const dim = now - since >= POCKET_AFTER_MS;
  return dim === prev.dim && since === prev.since ? prev : { since, dim };
}
