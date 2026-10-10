import { usePowerBudget } from '../../power';

/** Decorative event loops follow the app's power budget (src/power): foreground, no Reduce Motion, not idle, not Saver. */
export function useEventAmbient(): { readonly ambient: boolean } {
  return { ambient: usePowerBudget().ambient };
}
