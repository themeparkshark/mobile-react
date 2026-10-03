/**
 * Holds the solver's last result and tells each marker only about its own
 * change, so a region change re-renders just the markers whose placement moved
 * (never the screen). Pure, unit tested.
 */
import { samePlacement, type Placement } from './solver';

type Listener = () => void;

export class DeclutterStore {
  private placements = new Map<string, Placement>();
  private listeners = new Map<string, Set<Listener>>();

  get(id: string): Placement | undefined {
    return this.placements.get(id);
  }

  /** The whole last result (the solver's hysteresis input). */
  snapshot(): ReadonlyMap<string, Placement> {
    return this.placements;
  }

  subscribe(id: string, listener: Listener): () => void {
    let set = this.listeners.get(id);
    if (!set) { set = new Set(); this.listeners.set(id, set); }
    set.add(listener);
    return () => {
      set!.delete(listener);
      if (!set!.size) this.listeners.delete(id);
    };
  }

  /** Swap in a new result; returns the ids whose placement changed (and were told). */
  publish(next: ReadonlyMap<string, Placement>): string[] {
    const changed: string[] = [];
    for (const [id, placement] of next) {
      if (!samePlacement(this.placements.get(id), placement)) changed.push(id);
    }
    for (const id of this.placements.keys()) if (!next.has(id)) changed.push(id);
    const merged = new Map<string, Placement>();
    for (const [id, placement] of next) {
      const prev = this.placements.get(id);
      // Keep the old object when nothing moved, so subscribers see a stable value.
      merged.set(id, prev && samePlacement(prev, placement) ? prev : placement);
    }
    this.placements = merged;
    for (const id of changed) this.listeners.get(id)?.forEach(listener => listener());
    return changed;
  }
}

export function createDeclutterStore(): DeclutterStore {
  return new DeclutterStore();
}
