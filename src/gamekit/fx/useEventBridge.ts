/**
 * useEventBridge: one runOnJS per frame from the UI-thread event ring.
 *
 *   const bridge = useEventBridge((batch) => forEachEvent(batch, (kind, a, b) => {
 *     if (kind === EV_BONK) { GameAudio.play('wh_bonk', { pan: a }); playHaptic('quickHit'); }
 *   }));
 *   // inside your useFrameCallback / clock onFrame worklet:
 *   pushEvent(bridge.ring.value, EV_BONK, pan, hole, 0, c.simMs);
 *   bridge.flush();   // at the end of the frame
 *
 * The ring lives in a SharedValue that only the UI thread mutates; flush()
 * drains it into a plain array (the fix for in-place typed-array mutation not
 * crossing threads) and sends it in one call, so sound, haptic and visual land
 * on the same frame.
 */

import { useCallback, useMemo, useRef } from 'react';
import { runOnJS, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { createEventRing, drainEvents, type EventRing } from '../core/eventRing';

export interface EventBridge {
  ring: SharedValue<EventRing>;
  /** Worklet: drain and deliver this frame's events (no-op when empty). */
  flush: () => void;
}

export function useEventBridge(onEvents: (batch: number[]) => void, capacity = 256): EventBridge {
  const ring = useSharedValue<EventRing>(createEventRing(capacity));
  const handler = useRef(onEvents);
  handler.current = onEvents;
  const deliver = useCallback((batch: number[]) => handler.current(batch), []);
  const flush = useCallback(() => {
    'worklet';
    const r = ring.value;
    if (r.size === 0) return;
    const batch = drainEvents(r);
    runOnJS(deliver)(batch);
  }, [ring, deliver]);
  // Stable handle: gestures and runtimes memoize on it (a new object per render rebuilt them every frame).
  return useMemo(() => ({ ring, flush }), [ring, flush]);
}
