/**
 * RideDetectionEmitter
 * 
 * Lightweight event emitter for ride detection events.
 * Used to communicate between the detection service (background)
 * and the UI overlay (foreground) without tight coupling.
 * 
 * Events:
 *   'rideDetected' — a single ride was detected while app is in foreground
 *   'pendingCleared' — pending detections were cleared (after batch confirm)
 */
import { DetectedRide } from './RideDetectionService';

type RideDetectedHandler = (detection: DetectedRide) => void;
type VoidHandler = () => void;

interface EventMap {
  rideDetected: RideDetectedHandler;
  pendingCleared: VoidHandler;
}

class RideDetectionEventEmitter {
  private listeners: { [K in keyof EventMap]?: EventMap[K][] } = {};

  on<K extends keyof EventMap>(event: K, handler: EventMap[K]): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    (this.listeners[event] as EventMap[K][]).push(handler);

    // Return unsubscribe function
    return () => {
      const arr = this.listeners[event] as EventMap[K][];
      const idx = arr.indexOf(handler);
      if (idx >= 0) arr.splice(idx, 1);
    };
  }

  emit<K extends keyof EventMap>(event: K, ...args: Parameters<EventMap[K]>): void {
    const handlers = this.listeners[event] as EventMap[K][] | undefined;
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        (handler as (...a: any[]) => void)(...args);
      } catch (e) {
        console.warn(`RideDetectionEmitter handler error for "${event}":`, e);
      }
    }
  }
}

export const rideDetectionEmitter = new RideDetectionEventEmitter();
