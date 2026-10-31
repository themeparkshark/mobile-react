/**
 * A native sheet that was asked to show but never did comes back (core loop
 * 4.3 rule 10, the PLAY RIDE freeze).
 *
 * On iOS (Fabric), a <Modal> presents from the root view controller. If a
 * sheet that is not on the modal layer list (one another lane has not moved
 * over yet, or any sheet still being dismissed by UIKit) is still on screen,
 * UIKit refuses the second presentation: React thinks the card is up, nothing
 * shows, and the half-presented card swallows every tap. The modal layers stop
 * that for every registered sheet; this watchdog covers the rest. If the
 * native onShow has not arrived shortly after the card wanted to show, the
 * card's <Modal> is mounted again (a new key), which drops the refused one and
 * presents a fresh one now that the screen is free. A few tries at most.
 *
 *   const watch = usePresentWatchdog(layer.present);
 *   <Modal key={watch.key} isVisible={layer.present} onShow={watch.onShow} ...>
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** How long a native sheet may take to report it is on screen before it is presented again. */
export const PRESENT_WATCHDOG_MS = 1400;
/** Fresh presentations tried at most, so a device that never reports onShow is not remounted forever. */
export const PRESENT_WATCHDOG_TRIES = 3;

export function presentWatchdogNext(state: { shown: boolean; tries: number }, wanted: boolean):
  'wait' | 'retry' | 'give_up' {
  if (!wanted || state.shown) return 'wait';
  return state.tries >= PRESENT_WATCHDOG_TRIES ? 'give_up' : 'retry';
}

export function usePresentWatchdog(wanted: boolean, ms: number = PRESENT_WATCHDOG_MS): {
  readonly key: number;
  readonly onShow: () => void;
} {
  const [key, setKey] = useState(0);
  const state = useRef({ shown: false, tries: 0 });
  useEffect(() => {
    if (!wanted) {
      state.current = { shown: false, tries: 0 };
      return undefined;
    }
    if (state.current.shown) return undefined;
    const timer = setTimeout(() => {
      if (presentWatchdogNext(state.current, true) !== 'retry') return;
      state.current = { ...state.current, tries: state.current.tries + 1 };
      if (__DEV__) console.log(`[present-watchdog] no native onShow after ${ms} ms: presenting again (try ${state.current.tries})`);
      setKey(k => k + 1);
    }, ms);
    return () => clearTimeout(timer);
  }, [wanted, key, ms]);
  const onShow = useCallback(() => { state.current = { ...state.current, shown: true }; }, []);
  return { key, onShow };
}
