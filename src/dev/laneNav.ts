/**
 * Polish-lane QA only. A release-like JS bundle served by a lane Metro started with
 * EXPO_PUBLIC_LANE_NAV=1 exposes the navigator to the lane's debugger, so a share or gate
 * flow can be reached and checked with __DEV__ off. App.tsx requires this file only under
 * that env check, which inlines to false for every app build and update, so this module
 * is folded out and never ships.
 */
import { navigationRef } from '../RootNavigation';

(globalThis as { __laneNav?: typeof navigationRef }).__laneNav = navigationRef;
