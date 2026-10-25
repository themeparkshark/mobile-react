/**
 * Build a big moment in small invisible steps, so no single frame has to mount
 * all of it (a one-commit mount of a celebration's 20 to 90 views and its
 * Skia canvases froze the screen for one 90 to 500 ms frame right as the
 * moment appeared).
 *
 * A moment makes one step store (useMountSteps), wraps each heavy layer in a
 * StepGate with the step it belongs to, and starts its beat sheet once the
 * store reaches its last step. Only a gate re-renders when its step arrives:
 * the moment's own animated views are never re-rendered by a step (a React
 * commit over live Reanimated styles can flash them back to their first frame
 * on Fabric). Each step waits STEP_GAP_MS and then one animation frame, so it
 * gets its own UI frame.
 */
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';

export type StepStore = {
  readonly get: () => number;
  readonly subscribe: (listener: () => void) => () => void;
  readonly set: (step: number) => void;
};

/** About two frames between steps: one requestAnimationFrame alone let two steps land in one long frame. */
export const STEP_GAP_MS = 34;

export function createStepStore(first = 0): StepStore {
  let step = first;
  const listeners = new Set<() => void>();
  return {
    get: () => step,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    set: next => {
      if (next === step) return;
      step = next;
      listeners.forEach(listener => listener());
    },
  };
}

/** Mounts its children once the moment's build reaches step `at` (only this gate re-renders). */
export function StepGate({ steps, at, children }: { readonly steps: StepStore; readonly at: number; readonly children: ReactNode }) {
  const step = useSyncExternalStore(steps.subscribe, steps.get, steps.get);
  return step >= at ? <>{children}</> : null;
}

/**
 * The moment's step store: step 0 on mount, then one more step every STEP_GAP_MS plus a frame, up to `total`.
 * `onStep` runs after each step lands (step 0 included); the moment starts from the last one.
 */
export function useMountSteps(total: number, onStep?: (step: number) => void, gapMs = STEP_GAP_MS): StepStore {
  const store = useRef<StepStore | null>(null);
  if (store.current === null) store.current = createStepStore(0);
  const stepRef = useRef(onStep); stepRef.current = onStep;
  useEffect(() => {
    const steps = store.current as StepStore;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let raf = 0;
    let live = true;
    const next = () => {
      const now = steps.get();
      stepRef.current?.(now);
      if (now >= total) return;
      timer = setTimeout(() => {
        raf = requestAnimationFrame(() => {
          if (!live) return;
          steps.set(now + 1);
          next();
        });
      }, gapMs);
    };
    next();
    return () => { live = false; if (timer) clearTimeout(timer); cancelAnimationFrame(raf); };
    // One build per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return store.current;
}
