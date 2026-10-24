/**
 * The Shark Pass track's motion rules (pure, unit tested in
 * tools/tests/retention-loop-motion.test.cjs). Opening the pass glides from
 * the step the kid saw last to the step they are on now, then the new points
 * pour along the track one step at a time (at most three animated, the rest
 * fill at once), each reached step's node pops with sparkles, and the next two
 * locked prizes peek ahead. No prices ever animate.
 */
export const PASS_FX = {
  /** The track starts moving this long after the screen has data. */
  openAt: 350,
  /** The glide from the last-seen step to the current one (EASE.inOut). */
  scrollMs: 600,
  /** One step's gold pour. */
  pourMs: 650,
  /** At most this many steps pour one by one; the rest fill together. */
  maxPoured: 3,
  nodePop: 1.3,
  sparkles: 8,
  glintEveryMs: 4000,
  bobPt: 3,
} as const;

/** When each climbed step pours (ms after the screen has data), and when the whole climb has landed. */
export function climbFills(from: number, to: number, fx: Pick<typeof PASS_FX, 'openAt' | 'scrollMs' | 'pourMs' | 'maxPoured'> = PASS_FX):
  { readonly at: Record<number, { readonly at: number; readonly ms: number }>; readonly doneAt: number } {
  const at: Record<number, { at: number; ms: number }> = {};
  // The first pour starts while the glide is still landing (the track never waits on the camera).
  const start = fx.openAt + Math.round(fx.scrollMs * 0.6);
  const a = Math.max(0, Math.floor(from));
  const b = Math.max(a, Math.floor(to));
  let doneAt = start;
  for (let t = a + 1; t <= b; t++) {
    const k = t - a - 1;
    if (k < fx.maxPoured) at[t] = { at: start + k * fx.pourMs, ms: fx.pourMs };
    else at[t] = { at: start + fx.maxPoured * fx.pourMs, ms: 0 };
    doneAt = Math.max(doneAt, at[t].at + at[t].ms);
  }
  return { at, doneAt };
}
