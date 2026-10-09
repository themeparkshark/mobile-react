/**
 * PowerProvider: one place that knows how hard the app should work right now.
 *
 * Reads app state (shared listener), touch idleness (useUserIdle, fed by
 * Root's touch handler), standing still (movement.ts, fed by the GPS filter),
 * Battery Saver (Settings) and Reduce Motion, and publishes a PowerBudget.
 * Features read it with usePowerBudget(); nothing here removes a feature.
 * It also drives the shared poll coordinator.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAppActive } from '../hooks/useLivePoll';
import useUserIdle from '../hooks/useUserIdle';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { useBatterySaver } from './batterySaver';
import { lastMovedAt, onMoved } from './movement';
import { FULL_BUDGET, IDLE_AFTER_MS, STATIONARY_AFTER_MS, isStationary, powerBudget, type PowerBudget } from './powerPolicy';
import { pollCoordinator } from './pollCoordinator';

const PowerContext = createContext<PowerBudget>(FULL_BUDGET);

function useStationary(): boolean {
  const [still, setStill] = useState(() => isStationary(lastMovedAt(), Date.now()));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const arm = () => {
      if (timer) clearTimeout(timer);
      const last = lastMovedAt();
      if (last === null) { setStill(false); timer = null; return; }
      const wait = last + STATIONARY_AFTER_MS - Date.now();
      if (wait <= 0) { setStill(true); timer = null; return; }
      setStill(false);
      timer = setTimeout(arm, wait);
    };
    arm();
    const off = onMoved(arm);
    return () => { off(); if (timer) clearTimeout(timer); };
  }, []);
  return still;
}

export function PowerProvider({ children }: { readonly children: React.ReactNode }) {
  const appActive = useAppActive();
  const idle = useUserIdle(IDLE_AFTER_MS);
  const stationary = useStationary();
  const lowPower = useBatterySaver();
  const reduceMotion = useReducedGameMotion();
  const budget = useMemo(
    () => powerBudget({ appActive, idle, stationary, lowPower, reduceMotion }),
    [appActive, idle, stationary, lowPower, reduceMotion],
  );
  useEffect(() => {
    pollCoordinator.setAppActive(appActive);
    pollCoordinator.setMultiplier(budget.pollMultiplier);
  }, [appActive, budget.pollMultiplier]);
  return <PowerContext.Provider value={budget}>{children}</PowerContext.Provider>;
}

/** The current power budget. Outside a provider: full power (tests, previews). */
export function usePowerBudget(): PowerBudget {
  return useContext(PowerContext);
}
