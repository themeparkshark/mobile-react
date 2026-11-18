/**
 * Leaving the LinePlay recap (T076). Only GO sets the next coin; DONE closes to the map and keeps the coin the
 * map held when LinePlay opened. Pure, so the rule is tested without the screen.
 */
export interface HeldTargetLike { readonly taskId: number; readonly parkId: number }

/** The task to put back on DONE, or null when nothing moved (or nothing was held). */
export function doneKeepsTarget(atOpen: HeldTargetLike | null | undefined, now: HeldTargetLike | null | undefined): number | null {
  if (!atOpen) return null;
  if (now && now.taskId === atOpen.taskId) return null;
  if (now && now.parkId !== atOpen.parkId) return null;
  return atOpen.taskId;
}
