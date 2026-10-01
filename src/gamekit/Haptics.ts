/**
 * Haptics.ts — semantic haptic map for GameKit.
 *
 * Wraps expo-haptics behind intent-named calls so games never touch raw
 * impact styles. Every call is debounced per-key so rapid-fire game events
 * (e.g. a 20-tap combo) can't machine-gun the taptic engine, which both
 * drains battery and desensitizes the player.
 *
 * Enable/disable is respected via setHapticsEnabled — wire this to the
 * player's setting from wherever the shell mounts.
 */

import * as Haptics from 'expo-haptics';

export type HapticIntent =
  | 'tapLight'
  | 'hitMedium'
  | 'comboHeavy'
  | 'failBuzz'
  | 'tickSelection'
  | 'success'
  | 'warning'
  /** A crisp, short thunk (expo Rigid): the GOOD hit in Line Party. */
  | 'hitRigid'
  /** A soft, dull bump (expo Soft): a gentle error that never reads as failure (a lure, Butterfingers). */
  | 'softBump';

/** Minimum ms between fires of the same intent. Tuned per intent below. */
const DEBOUNCE_MS: Record<HapticIntent, number> = {
  tapLight: 40,
  hitMedium: 55,
  comboHeavy: 90,
  failBuzz: 200,
  tickSelection: 30,
  success: 250,
  warning: 250,
  hitRigid: 40,
  softBump: 60,
};

const lastFiredAt: Record<HapticIntent, number> = {
  tapLight: 0,
  hitMedium: 0,
  comboHeavy: 0,
  failBuzz: 0,
  tickSelection: 0,
  success: 0,
  warning: 0,
  hitRigid: 0,
  softBump: 0,
};

let enabled = true;

/** Toggle all haptics (respect the player's sound/haptics preference). */
export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

export function areHapticsEnabled(): boolean {
  return enabled;
}

function run(intent: HapticIntent): void {
  switch (intent) {
    case 'tapLight':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    case 'hitMedium':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return;
    case 'comboHeavy':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      return;
    case 'tickSelection':
      Haptics.selectionAsync();
      return;
    case 'success':
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    case 'warning':
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    case 'failBuzz':
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    case 'hitRigid':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
      return;
    case 'softBump':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
      return;
  }
}

/**
 * Fire a semantic haptic. No-ops when disabled or inside the per-intent
 * debounce window. Never throws — a failing taptic engine must not crash a game.
 */
export function haptic(intent: HapticIntent): void {
  if (!enabled) return;
  const now = Date.now();
  if (now - lastFiredAt[intent] < DEBOUNCE_MS[intent]) return;
  lastFiredAt[intent] = now;
  try {
    run(intent);
  } catch {
    // Taptic engine unavailable (e.g. simulator) — silently ignore.
  }
}

/** Convenience object form for ergonomic call sites: Haptic.tapLight(). */
export const Haptic: Record<HapticIntent, () => void> = {
  tapLight: () => haptic('tapLight'),
  hitMedium: () => haptic('hitMedium'),
  comboHeavy: () => haptic('comboHeavy'),
  failBuzz: () => haptic('failBuzz'),
  tickSelection: () => haptic('tickSelection'),
  success: () => haptic('success'),
  warning: () => haptic('warning'),
  hitRigid: () => haptic('hitRigid'),
  softBump: () => haptic('softBump'),
};
