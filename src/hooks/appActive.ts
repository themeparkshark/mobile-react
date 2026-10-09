/**
 * useAppActive: one shared AppState listener for every caller. Its own module
 * so the power budget (src/power) and live polls both read it without an
 * import cycle.
 */
import { useSyncExternalStore } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

let appStateNow: AppStateStatus | undefined = AppState.currentState;
const appStateListeners = new Set<() => void>();
let appStateSubscription: { remove: () => void } | null = null;

function subscribeAppState(listener: () => void): () => void {
  appStateListeners.add(listener);
  if (!appStateSubscription) {
    appStateSubscription = AppState.addEventListener('change', state => {
      if (state === appStateNow) return;
      appStateNow = state;
      appStateListeners.forEach(fn => fn());
    });
  }
  return () => {
    appStateListeners.delete(listener);
    if (!appStateListeners.size && appStateSubscription) {
      appStateSubscription.remove();
      appStateSubscription = null;
    }
  };
}

/** 'inactive' (Control Center, an incoming call banner) still counts as on screen. */
const isActive = () => appStateNow !== 'background';

/** True while the app is in the foreground. One shared AppState listener for every caller. */
export function useAppActive(): boolean {
  return useSyncExternalStore(subscribeAppState, isActive, isActive);
}
