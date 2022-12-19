import { createNavigationContainerRef } from '@react-navigation/native';
import { ParamListBase } from '@react-navigation/routers';

export const navigationRef = createNavigationContainerRef();

export function navigate(name: string, params?: ParamListBase) {
  if (navigationRef.isReady()) {
    // @ts-ignore
    navigationRef.navigate(name, params);
  }
}

export function goBack() {
  if (navigationRef.isReady()) {
    navigationRef.goBack();
  }
}
