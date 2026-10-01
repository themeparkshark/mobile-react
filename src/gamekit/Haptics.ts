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
 *
 * App-wide moments outside a game (dressing room, Duels, queue bonus, reward
 * sheets) use queueHaptic(): one shared gate, at most 1 haptic per 120ms, and
 * a higher-priority haptic replaces a lower one waiting for its turn (a land
 * replaces a queued selection). haptic() keeps its per-intent debounce only,
 * so in-game feel is unchanged (economy review K16).
 */

import * as Haptics from 'expo-haptics';

export type HapticIntent =
  | 'tapLight'
  | 'hitMedium'
  | 'comboHeavy'
  | 'failBuzz'
  | 'tickSelection'
  | 'success'
  | 'warning';

/** Minimum ms between fires of the same intent. Tuned per intent below. */
const DEBOUNCE_MS: Record<HapticIntent, number> = {
  tapLight: 40,
  hitMedium: 55,
  comboHeavy: 90,
  failBuzz: 200,
  tickSelection: 30,
  success: 250,
  warning: 250,
};

const lastFiredAt: Record<HapticIntent, number> = {
  tapLight: 0,
  hitMedium: 0,
  comboHeavy: 0,
  failBuzz: 0,
  tickSelection: 0,
  success: 0,
  warning: 0,
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
};

/** Minimum spacing between two gated haptics, app-wide. */
export const HAPTIC_GATE_MS = 120;

/** Higher wins a contested 120ms window. */
export const HAPTIC_PRIORITY: Record<HapticIntent, number> = {
  tickSelection: 0,
  tapLight: 1,
  hitMedium: 2,
  warning: 2,
  comboHeavy: 3,
  success: 3,
  failBuzz: 3,
};

export interface HapticGate {
  /** Fire now, wait for the window (keeping the higher priority), or drop. */
  request(intent: HapticIntent, priority?: number): 'fired' | 'queued' | 'dropped';
  /** The intent waiting for the window, if any. */
  pending(): HapticIntent | null;
}

/**
 * One haptic per `spacingMs`, priority-aware. Pure apart from the injected
 * clock, timer and fire function, so tools/tests can drive it.
 */
export function createHapticGate(options: {
  fire: (intent: HapticIntent) => void;
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => unknown;
  spacingMs?: number;
}): HapticGate {
  const now = options.now ?? (() => Date.now());
  const schedule = options.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const spacing = options.spacingMs ?? HAPTIC_GATE_MS;
  let lastAt = -Infinity;
  let waiting: { intent: HapticIntent; priority: number } | null = null;

  const fireNow = (intent: HapticIntent) => {
    lastAt = now();
    options.fire(intent);
  };

  const flush = () => {
    const next = waiting;
    waiting = null;
    if (next) fireNow(next.intent);
  };

  return {
    request(intent, priority = HAPTIC_PRIORITY[intent]) {
      const wait = lastAt + spacing - now();
      if (wait <= 0 && !waiting) {
        fireNow(intent);
        return 'fired';
      }
      if (waiting) {
        if (priority < waiting.priority) return 'dropped';
        waiting = { intent, priority };
        return 'queued';
      }
      waiting = { intent, priority };
      schedule(flush, Math.max(0, wait));
      return 'queued';
    },
    pending: () => waiting?.intent ?? null,
  };
}

const appGate = createHapticGate({
  fire: intent => {
    if (!enabled) return;
    try {
      run(intent);
    } catch {
      // Taptic engine unavailable (e.g. simulator): silently ignore.
    }
  },
});

/**
 * App-wide gated haptic: at most 1 per 120ms across every caller, and a
 * stronger haptic replaces a weaker one waiting for its turn.
 */
export function queueHaptic(intent: HapticIntent, priority?: number): void {
  if (!enabled) return;
  appGate.request(intent, priority);
}
