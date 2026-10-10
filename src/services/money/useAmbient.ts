import { usePowerBudget } from '../../power';

/** Decorative loops in money screens follow the app's power budget (src/power): off under Reduce Motion, in the background, idle or Saver. */
export function useAmbient(): boolean {
  return usePowerBudget().ambient;
}
