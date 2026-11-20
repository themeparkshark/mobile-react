/**
 * What a HUD counter is showing right now (fix pass w5, W4-SMOKE-3b): one source of truth for a count that
 * shows in two places. The header chip (Currency with a flyTarget) owns the number: it holds while Tickets fly
 * in, then rolls on the frame they land. It publishes each number it shows here, and a mirror (the coin card's
 * Ticket line) draws that same number with the same roll, so the two never disagree, however busy the JS thread
 * is. Pure, no React: a tiny value per target and a listener set (useSyncExternalStore reads it).
 */

/** The number a counter shows and the one it rolls from (the same shape the chip renders). */
export interface HudShownState {
  readonly value: number;
  readonly prev: number;
  /** The coin stream it rolls on (hudPulse's shared clock), or null for a plain roll. */
  readonly stream: { readonly id: number; readonly startAt: number } | null;
  /** Bumped once per new number, so a mirror mounts fresh columns exactly when the chip does. */
  readonly key: number;
}

const shown = new Map<string, HudShownState>();
const owners = new Map<string, number>();
const listeners = new Map<string, Set<() => void>>();
let ownerSeq = 0;

function notify(target: string): void {
  listeners.get(target)?.forEach(listener => listener());
}

/** A chip that owns `target` mounted: its id, for publishing and for letting go. */
export function claimHudShown(target: string): number {
  ownerSeq += 1;
  owners.set(target, ownerSeq);
  return ownerSeq;
}

/** The owning chip shows a new number. A chip that is no longer the owner is ignored. */
export function publishHudShown(target: string, owner: number, state: HudShownState): void {
  if (owners.get(target) !== owner) return;
  const cur = shown.get(target);
  if (cur && cur.value === state.value && cur.prev === state.prev && cur.key === state.key && cur.stream === state.stream) return;
  shown.set(target, state);
  notify(target);
}

/** The owning chip unmounted: mirrors fall back to their own number. */
export function releaseHudShown(target: string, owner: number): void {
  if (owners.get(target) !== owner) return;
  owners.delete(target);
  shown.delete(target);
  notify(target);
}

/** What the owning chip shows now, or null when no chip owns `target`. */
export function hudShownNow(target: string): HudShownState | null {
  return shown.get(target) ?? null;
}

export function subscribeHudShown(target: string, listener: () => void): () => void {
  let set = listeners.get(target);
  if (!set) { set = new Set(); listeners.set(target, set); }
  set.add(listener);
  return () => { set?.delete(listener); };
}

/**
 * The number a mirror draws: the chip's, once the chip has caught up with the wallet the mirror knows (or is
 * holding below it while Tickets fly in, which is the chip's own landing rule). A chip that reads a different,
 * older wallet (or no chip at all) leaves the mirror on its own number.
 */
export function mirrorShown(chip: HudShownState | null, own: HudShownState, wallet: number): HudShownState {
  if (!chip) return own;
  // The chip shows the wallet, or holds below it until the flying Tickets land: draw exactly what it draws.
  return chip.value <= wallet ? chip : own;
}
