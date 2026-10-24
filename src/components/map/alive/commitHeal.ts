/**
 * Round 5: heal the stale frames a React commit causes mid-moment.
 *
 * On Fabric with Reanimated 3.16.7, every re-render of an Animated component sends its FIRST-render style
 * again (PropsFilter caches `_initialStyle`). Reanimated only re-sends a style when its worklet runs again,
 * so a style whose inputs hold still (a dimmed control, a burst at full strength) keeps the stale first-render
 * look until something moves: the r4 clips showed the map controls undimming mid-catch, the badge ghosting
 * back after it left and the burst blinking out during its hold.
 *
 * The cure: every commit bumps a shared value for a short window, and every style that must survive a
 * commit names that value (so its worklet re-runs every frame of the window) and carries a transform
 * (a fresh array, so Reanimated always treats the output as changed and re-sends the whole style).
 * Cost: a few cheap worklet runs for about 300 ms after a commit, nothing at rest.
 */
import { useLayoutEffect } from 'react';
import { Easing, makeMutable, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

/** How long styles keep re-sending after a commit (covers a late Fabric mount on a busy UI thread). */
export const HEAL_MS = 320;

/** One rising sequence for every heal value (two components sharing chromeHeal never fight over it). */
let healSeq = 0;

/**
 * Run after every commit of the calling component: bumps `heal` for HEAL_MS. `when` (wave 4) limits it to the
 * commits that matter: the app-wide Wrapper heals only while a catch has the chrome dimmed or hidden, so a
 * screen that never catches pays nothing.
 */
export function useCommitHeal(shared?: SharedValue<number>, when?: () => boolean): SharedValue<number> {
  const own = useSharedValue(0);
  const heal = shared ?? own;
  useLayoutEffect(() => {
    if (when && !when()) return;
    healSeq += 1;
    heal.value = withTiming(healSeq, { duration: HEAL_MS, easing: Easing.linear });
  });
  return heal;
}

/**
 * One heal value for the map's chrome (the control rail, chips, menus and edge arrows), bumped by every commit
 * of HomeExplore and Map, read by useChromeBack and the Map's rail style.
 */
export const chromeHeal = makeMutable(0);

/** Names `heal` inside a worklet so the style re-runs while it moves (the value itself is not used). */
export function touchHeal(heal: SharedValue<number>): number {
  'worklet';
  return heal.value * 0;
}
