/**
 * Shared, UI-thread state for every tile in the book, passed by context so a
 * tile never re-renders when the card opens, the page scrolls or the shine runs.
 *
 * - `shine`: ONE clock for the whole book (0 -> 1 sweep in 1.1 s, then a real
 *   2.5 s rest where the value does not change, so mappers skip those frames).
 * - `paused`: true while the stamp card is open or the screen is blurred.
 * - `scrollY` / `viewportH`: tiles gate their own shine and bob to what is on screen.
 * - `pulse`: one slow 0..1 loop for claim tags, "Almost!" glows and NEW sparkles.
 */
import { createContext, useContext, useEffect, useMemo } from 'react';
import {
  cancelAnimation,
  Easing,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

export interface BookFx {
  readonly shine: SharedValue<number>;
  readonly pulse: SharedValue<number>;
  readonly paused: SharedValue<boolean>;
  readonly scrollY: SharedValue<number>;
  readonly viewportH: SharedValue<number>;
  readonly reducedMotion: boolean;
}

const Ctx = createContext<BookFx | null>(null);

export function useBookFx(): BookFx {
  const fx = useContext(Ctx);
  if (!fx) throw new Error('useBookFx outside <BookFxProvider>');
  return fx;
}

export const BookFxProvider = Ctx.Provider;

/** Owns the clocks. `running` = screen focused and no card open. */
export function useBookClocks(running: boolean, reducedMotion: boolean): BookFx {
  const shine = useSharedValue(0);
  const pulse = useSharedValue(0);
  const paused = useSharedValue(!running);
  const scrollY = useSharedValue(0);
  const viewportH = useSharedValue(800);

  useEffect(() => {
    paused.value = !running;
    if (!running || reducedMotion) {
      cancelAnimation(shine);
      cancelAnimation(pulse);
      shine.value = 0;
      pulse.value = 0;
      return;
    }
    shine.value = 0;
    shine.value = withRepeat(withSequence(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      withDelay(2500, withTiming(0, { duration: 0 })),
    ), -1, false);
    pulse.value = withRepeat(withSequence(
      withTiming(1, { duration: 400, easing: Easing.inOut(Easing.quad) }),
      withTiming(0, { duration: 400, easing: Easing.inOut(Easing.quad) }),
      withDelay(1200, withTiming(0, { duration: 0 })),
    ), -1, false);
    return () => { cancelAnimation(shine); cancelAnimation(pulse); };
  }, [running, reducedMotion, shine, pulse, paused]);

  return useMemo(() => ({ shine, pulse, paused, scrollY, viewportH, reducedMotion }),
    [shine, pulse, paused, scrollY, viewportH, reducedMotion]);
}

/** Worklet: is a band [top, top+h] (content coordinates) on screen right now? */
export function onScreen(top: number, h: number, scrollY: number, viewportH: number): boolean {
  'worklet';
  return top + h > scrollY - 40 && top < scrollY + viewportH + 40;
}
