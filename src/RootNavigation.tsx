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
