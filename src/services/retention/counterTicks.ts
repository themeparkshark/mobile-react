/**
 * HUD counters roll as prizes land. A prize flight tells the counter for its target (coins, tickets...)
 * how much is coming and when each icon lands; the counter steps up on every landing (1,155, 1,158,
 * 1,160 ... 1,175) instead of jumping when the balance is read back. Plain pub/sub, no React state here.
 */
export interface CounterPlan {
  /** The total gain this flight brings. */
  readonly amount: number;
  /** When each icon lands, ms from now. */
  readonly landings: readonly number[];
  /**
   * A whole flight (every counter at once): the number is changed inside `step`, which runs for every counter in ONE
   * timer at `stepAt` ms from now, so the HUD re-renders once per flight (each render costs the main thread a
   * whole-tree pass). The icon still hops on every landing (native driver, no render).
   */
  readonly stepAt?: number;
  readonly step?: (fn: () => void) => void;
}

type Listener = (plan: CounterPlan) => void;
const listeners = new Map<string, Set<Listener>>();

export const counterTicks = {
  plan(target: string, plan: CounterPlan): void {
    if (!(plan.amount > 0) || !plan.landings.length) return;
    listeners.get(target)?.forEach(l => l(plan));
  },
  /** Every leg of one prize flight: counters hop per landing and their numbers change together in one render. */
  flight(legs: readonly { readonly target: string; readonly amount: number; readonly landings: readonly number[] }[]): void {
    const live = legs.filter(l => l.amount > 0 && l.landings.length);
    if (!live.length) return;
    const stepAt = counterStepAt(live);
    const steps: (() => void)[] = [];
    live.forEach(l => listeners.get(l.target)?.forEach(fn => fn({ amount: l.amount, landings: l.landings, stepAt, step: f => steps.push(f) })));
    if (steps.length) setTimeout(() => steps.forEach(f => f()), stepAt);
  },
  subscribe(target: string, listener: Listener): () => void {
    let set = listeners.get(target);
    if (!set) { set = new Set(); listeners.set(target, set); }
    set.add(listener);
    return () => { set?.delete(listener); };
  },
};

/** The counter's value after landing i of n (rounded, the last landing is exact). */
export function counterStep(base: number, amount: number, i: number, n: number): number {
  if (n <= 0) return base + amount;
  return base + Math.round((amount * Math.min(n, i + 1)) / n);
}

/** When a flight's numbers change (ms from now): as soon as every counter has its first prize in. */
export function counterStepAt(legs: readonly { readonly landings: readonly number[] }[]): number {
  return legs.reduce((m, l) => Math.max(m, l.landings.length ? Math.min(...l.landings) : 0), 0);
}
