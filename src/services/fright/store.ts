/**
 * A tiny module-level snapshot of tonight's Fin-ister state, published by
 * useFrightNight, so other agents' code (Ride Photo, LinePlay) can ask "is
 * the mode on?" without props or a context. Pure, no React.
 */
import type { FrightPhase } from '../../api/endpoints/fright/types';

export interface FrightSnapshot {
  readonly modeOn: boolean;
  readonly phase: FrightPhase;
  readonly parkId: number | null;
  readonly eventSlug: string | null;
  readonly nightOn: string | null;
  readonly nightIndex: number | null;
  /** Spooky effects off (calm mode). */
  readonly calm: boolean;
  readonly title: string | null;
}

export const FRIGHT_OFF: FrightSnapshot = {
  modeOn: false, phase: 'off', parkId: null, eventSlug: null, nightOn: null, nightIndex: null, calm: false, title: null,
};

let snapshot: FrightSnapshot = FRIGHT_OFF;
const listeners = new Set<(next: FrightSnapshot) => void>();

export function getFrightSnapshot(): FrightSnapshot {
  return snapshot;
}

export function publishFrightSnapshot(next: FrightSnapshot): void {
  const same = (Object.keys(next) as (keyof FrightSnapshot)[]).every(key => next[key] === snapshot[key]);
  if (same) return;
  snapshot = next;
  listeners.forEach(listener => listener(next));
}

export function subscribeFrightSnapshot(listener: (next: FrightSnapshot) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
