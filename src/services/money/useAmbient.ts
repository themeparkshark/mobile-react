import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { useAppActive } from '../../hooks/useLivePoll';

/**
 * Decorative loops in money screens run only while it makes sense (battery FIXES rows 15, 17):
 * not under Reduce Motion, not in the background. When claude/fb-battery merges, this becomes
 * `usePowerBudget().ambient` (which also rests after 2 min with no touch). Normal power: no change.
 */
export function useAmbient(): boolean {
  const reduced = useUiReducedMotion();
  const active = useAppActive();
  return !reduced && active;
}
