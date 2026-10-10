/**
 * Battery shim for retention loops. At integration with claude/fb-battery,
 * replace the body with `return usePowerBudget().ambient;` from '../../power'
 * (Saver, idle and pocket then rest every loop here). Until then: always on.
 */
export function useAmbient(): boolean {
  return true;
}
