/**
 * PowerProvider: one place that knows how hard the app should work right now.
 *
 * Reads app state (shared listener), touch idleness (useUserIdle, fed by
 * Root's touch handler),
 * Battery Saver (Settings) and Reduce Motion, and publishes a PowerBudget.
 * Features read it with usePowerBudget(); nothing here removes a feature.
 * It also drives the shared poll coordinator.
 */
import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useAppActive } from '../hooks/appActive';
import useUserIdle from '../hooks/useUserIdle';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { useBatterySaver } from './batterySaver';
import { FULL_BUDGET, IDLE_AFTER_MS, powerBudget, type PowerBudget } from './powerPolicy';
import { pollCoordinator } from './pollCoordinator';
import PocketDim from './PocketDim';

const PowerContext = createContext<PowerBudget>(FULL_BUDGET);

export function PowerProvider({ children }: { readonly children: React.ReactNode }) {
  const appActive = useAppActive();
  const idle = useUserIdle(IDLE_AFTER_MS);
  const lowPower = useBatterySaver();
  const reduceMotion = useReducedGameMotion();
  const budget = useMemo(
    () => powerBudget({ appActive, idle, lowPower, reduceMotion }),
    [appActive, idle, lowPower, reduceMotion],
  );
  useEffect(() => {
    pollCoordinator.setAppActive(appActive);
    pollCoordinator.setMultiplier(budget.pollMultiplier);
  }, [appActive, budget.pollMultiplier]);
  return (
    <PowerContext.Provider value={budget}>
      {children}
      <PocketDim enabled={lowPower && appActive} />
    </PowerContext.Provider>
  );
}

/** The current power budget. Outside a provider: full power (tests, previews). */
export function usePowerBudget(): PowerBudget {
  return useContext(PowerContext);
}
