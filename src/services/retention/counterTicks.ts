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
}

type Listener = (plan: CounterPlan) => void;
const listeners = new Map<string, Set<Listener>>();

export const counterTicks = {
  plan(target: string, plan: CounterPlan): void {
    if (!(plan.amount > 0) || !plan.landings.length) return;
    listeners.get(target)?.forEach(l => l(plan));
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

/** A flight steps a HUD number at most this many times (each step is a render; the icon still hops on every landing). */
export const COUNTER_STEPS = 3;

/** Which of n landings step the number: evenly spread, always including the last. */
export function counterStepIndexes(n: number): Set<number> {
  const out = new Set<number>();
  const k = Math.min(n, COUNTER_STEPS);
  for (let j = 1; j <= k; j++) out.add(Math.ceil((j * n) / k) - 1);
  return out;
}
