import { usePowerBudget } from '../../power';

/** Retention loops follow the app's power budget (src/power): Saver, idle, pocket and background rest them. */
export function useAmbient(): boolean {
  return usePowerBudget().ambient;
}
