/**
 * Shim for the battery stream's power budget (claude/fb-battery src/power, usePowerBudget().ambient). Same API:
 * when this branch is merged with src/power, replace this file's body with `export { usePowerBudget } from '../../power';`.
 * Until then the page always runs at full power (ambient on), so nothing changes visibly.
 */
export function usePowerBudget(): { readonly ambient: boolean } {
  return FULL;
}
const FULL = { ambient: true } as const;
