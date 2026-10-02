/**
 * Current Quest haptic density (design 12, v7 P13, v7.1 J15): at most one
 * haptic per 100 ms across the whole game, at most 3 in any carry, and the
 * heavy primitive only on the golden pearl. Every Current Quest haptic goes
 * through this file: scheduled steps are spaced before they are queued, and
 * one global gate drops anything that would land within 100 ms of the last
 * fired haptic (a stronger one replaces a weaker one still waiting).
 *
 * Pure planning functions are exported for the Node tests; the firing side
 * calls the gamekit primitive directly so the game owns its own cap.
 */

import { firePrimitive } from '../../gamekit/Haptics';
import { PRIMITIVE_STRENGTH, type HapticPrimitive, type HapticStep } from '../../gamekit/core/hapticGrammar';

export const CQ_HAPTIC_GAP_MS = 100;
/** A carry gets at most 3 haptics: the grab, a midpoint on 4+ tiles and the spit-out. */
export const CARRY_HAPTICS_MAX = 3;

/**
 * Space a step list so no two land within `gap` ms. When two collide the
 * stronger primitive wins and keeps its own time; equal strength keeps the
 * earlier one. Pure.
 */
export function spaceSteps(steps: readonly HapticStep[], gap = CQ_HAPTIC_GAP_MS): HapticStep[] {
  const sorted = steps.slice().sort((a, b) => a.at - b.at);
  const out: HapticStep[] = [];
  for (const st of sorted) {
    const last = out[out.length - 1];
    if (!last || st.at - last.at >= gap) { out.push({ ...st }); continue; }
    if (PRIMITIVE_STRENGTH[st.p] > PRIMITIVE_STRENGTH[last.p]) {
      out.pop();
      const prev = out[out.length - 1];
      if (!prev || st.at - prev.at >= gap) out.push({ ...st });
      else out.push(last);
    }
  }
  return out;
}

/**
 * The haptic plan of one carry (P13, J6): grab at 0, a selection tick at the
 * midpoint of carries of 4+ tiles, and the spit-out (medium). A Riptide doubles
 * the spit-out 100 ms apart and gives up the midpoint tick, so every carry
 * stays at 3 haptics or fewer. Times follow the J6 carry curve.
 */
export function carryPlan(carried: number, grabAt: number, midAt: number, spitAt: number, riptide: boolean): HapticStep[] {
  const steps: HapticStep[] = [{ at: grabAt, p: 'light' }];
  if (carried >= 4 && !riptide) steps.push({ at: midAt, p: 'selection' });
  steps.push({ at: spitAt, p: 'medium' });
  if (riptide) steps.push({ at: spitAt + CQ_HAPTIC_GAP_MS, p: 'medium' });
  return spaceSteps(steps).slice(0, CARRY_HAPTICS_MAX);
}

let lastFired = -1e9;
let lastStrength = 0;
const pending = new Set<ReturnType<typeof setTimeout>>();

/** Fire now unless a haptic fired within 100 ms (a stronger one may replace a weaker one at the same instant). */
export function cqFire(p: HapticPrimitive, now = Date.now()): boolean {
  const dt = now - lastFired;
  if (dt < CQ_HAPTIC_GAP_MS && !(dt <= 4 && PRIMITIVE_STRENGTH[p] > lastStrength)) return false;
  lastFired = now;
  lastStrength = PRIMITIVE_STRENGTH[p];
  try { firePrimitive(p); } catch { /* simulator */ }
  return true;
}

/** Queue a spaced step list from now; returns a cancel function. */
export function cqSchedule(steps: readonly HapticStep[]): () => void {
  const mine: ReturnType<typeof setTimeout>[] = [];
  for (const st of spaceSteps(steps)) {
    if (st.at <= 0) { cqFire(st.p); continue; }
    const id = setTimeout(() => { pending.delete(id); cqFire(st.p); }, st.at);
    pending.add(id);
    mine.push(id);
  }
  return () => { for (const id of mine) { clearTimeout(id); pending.delete(id); } };
}

/** Named intents the game uses (one place, so every call goes through the gate). */
export const CQH = {
  tick: () => cqFire('selection'),
  light: () => cqFire('light'),
  medium: () => cqFire('medium'),
  rigid: () => cqFire('rigid'),
  soft: () => cqFire('soft'),
  success: () => cqFire('success'),
  warning: () => cqFire('warning'),
  fail: () => cqFire('error'),
  /** The golden pearl: heavy now, success 110 ms later (J15). Heavy fires nowhere else. */
  golden: () => { cqFire('heavy'); return cqSchedule([{ at: 110, p: 'success' }]); },
  /** Unlock: a medium pair 100 ms apart. */
  unlock: () => { cqFire('medium'); return cqSchedule([{ at: 100, p: 'medium' }]); },
};

/** Test hook: reset the global gate. */
export function resetCqHaptics(): void {
  lastFired = -1e9;
  lastStrength = 0;
  pending.forEach((id) => clearTimeout(id));
  pending.clear();
}
