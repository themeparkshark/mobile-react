import { createContext } from 'react';
import type { WrapUpReason } from './core/session';

/**
 * Only LinePlay supplies this. QUEUE REALITY: "The line will always be
 * moving." Movement NEVER pauses a game; GameShellV2 shows a gentle heads-up
 * when the line advances a lot, and only a real queue event (boarding or
 * leaving the queue geofence) ends a run via `queueEnded`.
 */
export interface LinePlayMovement {
  /** The line is shuffling forward right now (informational only). */
  readonly moving: boolean;
  /** Legacy hook: LinePlay's resume bookkeeping. Called when play resumes. */
  readonly onResume: () => void;
  /** Optional: the most recent queue advance (drives the heads-up). */
  readonly lastAdvance?: { readonly at: number; readonly metres?: number } | null;
  /** Optional: a real queue event ended the session ("Your ride's up!"). */
  readonly queueEnded?: WrapUpReason | null;
}

export const LinePlayMovementContext = createContext<LinePlayMovement | null>(null);
