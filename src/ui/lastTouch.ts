/**
 * Where the last touch in the app landed (window points), recorded once by the root view.
 * The game dive grows out of it, and coin flights start or end at it (the thing you tapped).
 */
export interface TouchPoint { readonly x: number; readonly y: number; readonly at: number }

let last: TouchPoint | null = null;

export function recordLastTouch(x: number, y: number): void {
  last = { x, y, at: Date.now() };
}

export function lastTouch(): TouchPoint | null {
  return last;
}

/** The last touch if it happened within `freshMs`, else null. Pure over its inputs (unit tested). */
export function freshTouch(touch: TouchPoint | null, now: number, freshMs: number): { x: number; y: number } | null {
  return touch && now - touch.at <= freshMs ? { x: touch.x, y: touch.y } : null;
}
