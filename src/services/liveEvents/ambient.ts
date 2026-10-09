import { useAppActive } from '../../hooks/useLivePoll';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';

/**
 * Shim with the fb-battery API shape (`usePowerBudget().ambient`): decorative
 * loops run only in the foreground without Reduce Motion. At integration swap
 * the body for `return usePowerBudget();` from src/power (it also rests when idle or in Saver).
 */
export function useEventAmbient(): { readonly ambient: boolean } {
  const active = useAppActive();
  const reduced = useReducedGameMotion();
  return { ambient: active && !reduced };
}
