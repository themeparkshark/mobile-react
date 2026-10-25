import { useEffect, useRef } from 'react';
import { defineAnimation, runOnJS, useAnimatedReaction, type AnimatableValue, type AnimationObject, type SharedValue } from 'react-native-reanimated';

/** A mark that has not happened yet (a card that has not started entering). */
export const NOT_YET = 1e15;

/* eslint-disable @typescript-eslint/no-explicit-any */

// Declared before the helpers below: a worklet captures the functions it calls when the module loads, so this must
// already exist then (a later function declaration is undefined on the UI thread).
function delayed<T extends AnimationObject | AnimatableValue>(when: () => number, next: T): T {
  'worklet';
  return defineAnimation<any, any>(next, () => {
    'worklet';
    const nextAnimation: any = typeof next === 'function' ? (next as any)() : next;

    function frame(animation: any, now: number): boolean {
      const previousAnimation = animation.previousAnimation;
      if (animation.started || Date.now() >= when() || animation.reduceMotion) {
        if (!animation.started) {
          nextAnimation.onStart(nextAnimation, animation.current, now, previousAnimation);
          animation.previousAnimation = null;
          animation.started = true;
        }
        const finished = nextAnimation.onFrame(nextAnimation, now);
        animation.current = nextAnimation.current;
        return finished;
      }
      if (previousAnimation) {
        const finished = previousAnimation.finished || previousAnimation.onFrame(previousAnimation, now);
        animation.current = previousAnimation.current;
        if (finished) animation.previousAnimation = null;
      }
      return false;
    }

    function onStart(animation: any, value: AnimatableValue, now: number, previousAnimation: any): void {
      animation.startTime = now;
      animation.started = false;
      animation.current = value;
      animation.previousAnimation = previousAnimation === animation ? previousAnimation.previousAnimation : previousAnimation;
      if (nextAnimation.reduceMotion === undefined) nextAnimation.reduceMotion = animation.reduceMotion;
    }

    return {
      isHigherOrder: true,
      onFrame: frame,
      onStart,
      current: nextAnimation.current,
      callback: (finished?: boolean) => { if (nextAnimation.callback) nextAnimation.callback(finished); },
      previousAnimation: null,
      startTime: 0,
      started: false,
    };
  }) as unknown as T;
}


/**
 * Like withDelay, but waits for an absolute wall-clock time (epoch ms, Date.now()) read on the UI thread at
 * every frame, instead of a delay counted from when the UI thread happens to start the animation.
 *
 * Why: a busy JS thread or a held main thread (a whole card mounting) can hand animations to the UI thread
 * hundreds of ms apart. With withDelay each one then runs late by its own amount, so a chest's lid could pop
 * before its card had grown in. With an absolute mark, every beat of a moment keeps its place against the
 * others however late each was handed over (a late one simply starts at once).
 */
export function withDelayUntil<T extends AnimationObject | AnimatableValue>(epochMs: number, next: T): T {
  'worklet';
  return delayed(() => { 'worklet'; return epochMs; }, next);
}

/**
 * Waits until `offsetMs` after a mark held in a shared value (epoch ms, NOT_YET until it happens), read on the
 * UI thread every frame. A card's beats are scheduled when it mounts and run from the moment it really starts
 * entering (set on the UI thread), so no JS delay can ever put a beat before its card.
 */
export function withDelayAfter<T extends AnimationObject | AnimatableValue>(mark: SharedValue<number>, offsetMs: number, next: T): T {
  'worklet';
  return delayed(() => { 'worklet'; return mark.value + offsetMs; }, next);
}

/**
 * JS timers (sounds, haptics, small state) on a mark held in a shared value: `after(offset, fn)` runs `fn` `offset` ms
 * after the mark, once the UI thread has set it (at once if it has passed). Without a mark, offsets count from now.
 */
export function useMarkTimers(mark?: SharedValue<number>): (offsetMs: number, fn: () => void) => void {
  const known = useRef<number | null>(null);
  const waiting = useRef<{ off: number; fn: () => void }[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const mountedAt = useRef(Date.now());
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  const learn = (e: number) => {
    if (known.current !== null || e < mountedAt.current - 2000) return;
    known.current = e;
    const q = waiting.current; waiting.current = [];
    q.forEach(w => timers.current.push(setTimeout(w.fn, Math.max(0, e + w.off - Date.now()))));
  };
  useAnimatedReaction(() => (mark ? mark.value : 0), v => { if (mark && v < NOT_YET / 2) runOnJS(learn)(v); });
  return (offsetMs, fn) => {
    if (!mark) { timers.current.push(setTimeout(fn, offsetMs)); return; }
    if (known.current !== null) timers.current.push(setTimeout(fn, Math.max(0, known.current + offsetMs - Date.now())));
    else waiting.current.push({ off: offsetMs, fn });
  };
}
