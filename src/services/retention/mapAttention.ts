/**
 * The map's attention rules, asked from outside the map (core loop BLUEPRINT 4.3).
 *
 * guide-map owns the rules and publishes them as `attentionGate` in
 * src/screens/ExploreScreen/mapPresentationQueue.ts (never in the first 30 s at
 * a park, never while walking to the target, during play or within 10 s of a win
 * card, one automatic open per app open). This lane only asks. The gate is read
 * through the module namespace, so a build without it (before guide-map merges)
 * answers "no gate" and the callers keep their own calm rules.
 */
import * as mapQueue from '../../screens/ExploreScreen/mapPresentationQueue';

export type AttentionKind = 'reward' | 'membership';

interface Gate {
  allowed(kind: AttentionKind, now?: number): boolean;
  request(kind: AttentionKind, now?: number): boolean;
}

function gate(): Gate | null {
  const g = (mapQueue as unknown as { attentionGate?: Partial<Gate> }).attentionGate;
  return g && typeof g.allowed === 'function' && typeof g.request === 'function' ? (g as Gate) : null;
}

/** Whether the map's rules let `kind` open by itself now. null: no gate in this build (use your own rules). */
export function mapAllows(kind: AttentionKind): boolean | null {
  const g = gate();
  if (!g) return null;
  try { return g.allowed(kind); } catch { return null; }
}

/**
 * Take this app open's one automatic open from the map's queue. True when it may open now
 * (or when this build has no gate); false means wait on its button.
 */
export function mapTake(kind: AttentionKind): boolean {
  const g = gate();
  if (!g) return true;
  try { return g.request(kind); } catch { return true; }
}

/**
 * Both counters must agree before anything opens by itself (BLUEPRINT 4.3 rule 1). The map's gate exempts a kind
 * that already took the app open's one automatic open (a second 'reward' would pass it), so this lane's own rule,
 * with its own one-per-app-open counter, is always ANDed with the gate and never swapped for it.
 * `own` is this lane's answer (rewardMayAutoOpen with the real autoOpenUsed()).
 */
export function calmForAutoOpen(kind: AttentionKind, own: boolean): boolean {
  return own && mapAllows(kind) !== false;
}

/**
 * Take the one automatic open: true only when this lane's rule still agrees and the map's queue grants it.
 * The caller then calls noteAutoOpen(), so the next ask in the same app open is refused here even when the
 * map's queue would let the same kind through again.
 */
export function takeAutoOpen(kind: AttentionKind, own: boolean): boolean {
  return own && mapTake(kind);
}
