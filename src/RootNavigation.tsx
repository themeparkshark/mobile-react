import { createNavigationContainerRef } from '@react-navigation/native';
import { ParamListBase } from '@react-navigation/routers';

export const navigationRef = createNavigationContainerRef<ParamListBase>();
let pendingNavigation: { name: string; params?: object } | null = null;

export function navigate(name: string, params?: object) {
  if (navigationRef.isReady()) {
    pendingNavigation = null;
    navigationRef.navigate(name, params);
  } else {
    pendingNavigation = { name, params };
  }
}

export function flushPendingNavigation() {
  if (!navigationRef.isReady() || !pendingNavigation) return;
  const { name, params } = pendingNavigation;
  pendingNavigation = null;
  navigationRef.navigate(name, params);
}

export function goBack() {
  if (navigationRef.isReady()) {
    navigationRef.goBack();
  }
}

// Polish-lane QA only: a release-like JS bundle served by a lane Metro started with
// EXPO_PUBLIC_LANE_NAV=1 exposes the navigator to the lane's debugger, so a share or gate
// flow can be reached and checked with __DEV__ off. Never set for an app build or update,
// where this inlines to a constant false and nothing is exposed.
if (process.env.EXPO_PUBLIC_LANE_NAV === '1') (globalThis as { __laneNav?: typeof navigationRef }).__laneNav = navigationRef;
