/**
 * useLiveCountdown: a seconds-left number that ticks only while someone can
 * see it (T190).
 *
 * Replaces the `setInterval(() => setX(prev => prev - 1), 1000)` cooldowns.
 * Those ran behind other screens and in the background, and a paused one
 * would have drifted. This one keeps a deadline instead: while `live` is
 * false nothing runs, and on return it reads the clock once, so the number is
 * right without ever having ticked in between.
 *
 * `seconds` is the server's seconds-left; a new value (or a new `stamp`, for a
 * refetch that repeats the same number) restarts from it. `onDone` runs once
 * when a running countdown reaches zero, also when that happened while hidden.
 */
import { useEffect, useRef, useState } from 'react';

/** Whole seconds left until `deadline` at `now` (never below zero). */
export function secondsUntil(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** The deadline a server seconds-left value means at `now` (0 = nothing running). */
export function deadlineFrom(seconds: number | null | undefined, now: number): number {
  return seconds != null && seconds > 0 ? now + seconds * 1000 : 0;
}

export default function useLiveCountdown(
  seconds: number | null | undefined,
  live: boolean,
  onDone?: () => void,
  stamp?: unknown,
): number {
  const deadline = useRef(deadlineFrom(seconds, Date.now()));
  const [left, setLeft] = useState(() => secondsUntil(deadline.current, Date.now()));
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  // A running countdown that has not called onDone yet.
  const pending = useRef(deadline.current > 0);

  useEffect(() => {
    deadline.current = deadlineFrom(seconds, Date.now());
    pending.current = deadline.current > 0;
    setLeft(secondsUntil(deadline.current, Date.now()));
  }, [seconds, stamp]);

  useEffect(() => {
    if (!live || !pending.current) return undefined;
    let timer: ReturnType<typeof setInterval> | null = null;
    const read = () => {
      const next = secondsUntil(deadline.current, Date.now());
      setLeft(next);
      if (next === 0 && pending.current) {
        pending.current = false;
        if (timer) clearInterval(timer);
        timer = null;
        doneRef.current?.();
      }
    };
    read();
    if (pending.current) timer = setInterval(read, 1000);
    return () => { if (timer) clearInterval(timer); };
  }, [live, seconds, stamp]);

  return left;
}
