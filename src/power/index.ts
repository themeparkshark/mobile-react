export { PowerProvider, usePowerBudget } from './PowerProvider';
export { default as useBudgetedPoll } from './useBudgetedPoll';
export { default as useAmbientLoop } from './useAmbientLoop';
export { useBatterySaver, setBatterySaver, isBatterySaverOn } from './batterySaver';
export { markMoved } from './movement';
export { pollCoordinator } from './pollCoordinator';
export {
  powerBudget, budgetedInterval, budgetedParticles, FULL_BUDGET, IDLE_AFTER_MS, STATIONARY_AFTER_MS,
  type PowerBudget, type PowerLevel, type PowerInputs,
} from './powerPolicy';
