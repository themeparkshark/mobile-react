/**
 * QueueMotion: a gentle "heads up" when the line really advances.
 *
 * The line is always moving (Dustin: "The line will always be moving"), so
 * nothing here ever pauses, parks or slows a game, and no haptic or sound is
 * tied to movement. When the pedometer sees a real advance (about a dozen
 * steps in a few seconds, more than a shuffle) we show a small chip for a
 * moment so the player glances up, then it gets out of the way. At most once
 * every 45 s so it never nags. No pedometer (simulator, permission off) means
 * no chip, never an error.
 */
import { useEffect, useRef, useState } from 'react';

export const ADVANCE_STEPS = 12;
export const ADVANCE_WINDOW_MS = 10000;
export const CHIP_MS = 2600;
export const COOLDOWN_MS = 45000;

/** Pure detector (unit-tested): feed cumulative step counts, get true on a real advance. */
export class AdvanceDetector {
  private samples: Array<[number, number]> = [];
  private lastFired = -Infinity;

  push(atMs: number, totalSteps: number): boolean {
    this.samples.push([atMs, totalSteps]);
    while (this.samples.length > 1 && atMs - this.samples[0][0] > ADVANCE_WINDOW_MS) this.samples.shift();
    const steps = totalSteps - this.samples[0][1];
    if (steps >= ADVANCE_STEPS && atMs - this.lastFired >= COOLDOWN_MS) {
      this.lastFired = atMs;
      this.samples = [[atMs, totalSteps]];
      return true;
    }
    return false;
  }
}

export function useLineHeadsUp(enabled: boolean): boolean {
  const [show, setShow] = useState(false);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let sub: { remove(): void } | null = null;
    let cancelled = false;
    const detector = new AdvanceDetector();
    (async () => {
      try {
        // Lazy require: the sensor module is optional at runtime (tests, web).
        const { Pedometer } = require('expo-sensors');
        if (!(await Pedometer.isAvailableAsync()) || cancelled) return;
        sub = Pedometer.watchStepCount(({ steps }: { steps: number }) => {
          if (detector.push(Date.now(), steps)) {
            setShow(true);
            if (hide.current) clearTimeout(hide.current);
            hide.current = setTimeout(() => setShow(false), CHIP_MS);
          }
        });
      } catch {
        // No pedometer: no chip.
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
      if (hide.current) clearTimeout(hide.current);
    };
  }, [enabled]);
  return show;
}
