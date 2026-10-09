/**
 * Stand-in for src/power (claude/fb-battery) until that branch lands: same names and shapes.
 * At integration, replace imports of './powerShim' with '../../power' (or '../power') and delete this file.
 * Here: full budget (nothing changes at normal power), and a poll that pauses in the background.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

export type PowerBudget = { readonly ambient: boolean; readonly animate: boolean; readonly particleScale: number; readonly lowPower: boolean; readonly idle: boolean };
const FULL: PowerBudget = { ambient: true, animate: true, particleScale: 1, lowPower: false, idle: false };

export function usePowerBudget(): PowerBudget { return FULL; }

export function budgetedParticles(count: number, budget: Pick<PowerBudget, 'particleScale' | 'animate'>): number {
  if (!budget.animate || count <= 0) return 0;
  return Math.max(1, Math.round(count * budget.particleScale));
}

export default function useBudgetedPoll(run: () => unknown, intervalMs: number, options: { enabled?: boolean; immediate?: boolean } = {}): void {
  const { enabled = true, immediate = true } = options;
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    if (!enabled) return;
    if (immediate) void runRef.current();
    const t = setInterval(() => { if (AppState.currentState === 'active') void runRef.current(); }, intervalMs);
    return () => clearInterval(t);
  }, [enabled, intervalMs, immediate]);
}
export { useBudgetedPoll };
