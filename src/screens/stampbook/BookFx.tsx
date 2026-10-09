/**
 * Shared, UI-thread state for every tile in the book, passed by context so a
 * tile never re-renders when the card opens, the page scrolls or the shine runs.
 *
 * Clocks truly rest: a JS timer starts each sweep (`shine` 0 -> 1 in 1.1 s
 * every 3.6 s; `pulse` 0 -> 1 -> 0 in 0.8 s every 2 s). Between sweeps no
 * animation is running and the values do not change, so no mapper runs and
 * nothing is committed. Tiles copy a clock into their own value only while
 * they are on screen (`useTileClock`), so off-screen tiles do no work at all.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  cancelAnimation,
  Easing,
  useAnimatedReaction,
  useSharedValue,
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

export const SHINE_EVERY_MS = 3600;
export const PULSE_EVERY_MS = 2000;
export const PULSE_IDLE_MS = 6000;

/** Pause the idle clocks after this long with no touch or scroll; the next touch wakes them. */
export const IDLE_MS = 30_000;

/**
 * Owns the clocks. `running` = screen focused and no card open. `pulseOn`
 * (a reward is waiting) and `shineOn` (a rare-or-better stamp is owned) let a
 * clock rest when nothing on the page uses it. The app going to the
 * background, or 30 s with no touch, also rests both; `poke()` wakes them.
 */
export function useBookClocks(running: boolean, reducedMotion: boolean, needs: { pulseOn: boolean; shineOn: boolean; pulseWhenIdle?: boolean } = { pulseOn: true, shineOn: true }): BookFx & { poke: () => void } {
  const shine = useSharedValue(1);
  const pulse = useSharedValue(0);
  const paused = useSharedValue(!running);
  const scrollY = useSharedValue(0);
  const viewportH = useSharedValue(800);
  const [awake, setAwake] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poke = useCallback(() => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => setAwake(false), IDLE_MS);
    setAwake(true);
  }, []);
  useEffect(() => { poke(); return () => { if (idle.current) clearTimeout(idle.current); }; }, [poke]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => sub.remove();
  }, []);

  // Idle rests the shine; a waiting gift keeps its slow bounce (a few small tags, cheap) so it never looks dead.
  const { pulseOn, shineOn, pulseWhenIdle = false } = needs;
  const live = running && foreground && (awake || (pulseOn && pulseWhenIdle));
  useEffect(() => {
    paused.value = !live;
    if (!live || reducedMotion) return;
    const sweep = () => {
      shine.value = 0;
      shine.value = withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) });
    };
    const beat = () => {
      pulse.value = withSequence(
        withTiming(1, { duration: 400, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 400, easing: Easing.inOut(Easing.quad) }),
      );
    };
    const timers: ReturnType<typeof setInterval>[] = [];
    if (shineOn && awake) { sweep(); timers.push(setInterval(sweep, SHINE_EVERY_MS)); }
    // Idle (30 s no touch): the gift keeps a slow beat, one every 6 s instead of every 2 s.
    if (pulseOn) { beat(); timers.push(setInterval(beat, awake ? PULSE_EVERY_MS : PULSE_IDLE_MS)); }
    return () => {
      timers.forEach(clearInterval);
      cancelAnimation(shine); cancelAnimation(pulse);
      shine.value = 1; pulse.value = 0;
    };
  }, [live, awake, reducedMotion, shineOn, pulseOn, shine, pulse, paused]);

  const fx = useMemo(() => ({ shine, pulse, paused, scrollY, viewportH, reducedMotion }),
    [shine, pulse, paused, scrollY, viewportH, reducedMotion]);
  return useMemo(() => ({ ...fx, poke }), [fx, poke]);
}

/** Worklet: is a band [top, top+h] (content coordinates) on screen right now? */
export function onScreen(top: number, h: number, scrollY: number, viewportH: number): boolean {
  'worklet';
  return top + h > scrollY - 40 && top < scrollY + viewportH + 40;
}

/**
 * A tile's private copy of a book clock, updated only while the tile is on
 * screen and the book is running. Off-screen it holds `rest`, so the tile's
 * animated styles never re-evaluate.
 */
export function useTileClock(clock: SharedValue<number>, top: SharedValue<number>, height: number, rest: number): SharedValue<number> {
  const fx = useBookFx();
  const local = useSharedValue(rest);
  useAnimatedReaction(
    () => (!fx.paused.value && onScreen(top.value, height, fx.scrollY.value, fx.viewportH.value) ? clock.value : rest),
    (next, prev) => { if (next !== prev) local.value = next; },
  );
  return local;
}
