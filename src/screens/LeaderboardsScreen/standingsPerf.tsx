/**
 * Standings perf probe (EXPO_PUBLIC_STANDINGS_PERF=1, inlined at bundle time,
 * so it also works in a Release build and is a constant for the hooks rule).
 * Once a second it logs UI-thread and JS-thread frame stats; the board adds
 * marks for each infinite-scroll page (asked, landed, rows left before the
 * grey rows). Off by default: nothing mounts and nothing logs.
 *
 *   [standings-perf] 1791100000000 ui frames=60 avg=16.7ms worst=18.1ms over17=1 over33=0 | js frames=59 worst=21.0ms
 *   [standings-perf] 1791100000000 mark page-arrived week 182ms rows=150 rowsToEndAtArrival=14
 */
import { useEffect } from 'react';
import { useFrameCallback, useSharedValue, runOnJS } from 'react-native-reanimated';

export const STANDINGS_PERF_ON = process.env.EXPO_PUBLIC_STANDINGS_PERF === '1';

export function perfMark(text: string): void {
  if (STANDINGS_PERF_ON) console.log(`[standings-perf] ${Date.now()} mark ${text}`);
}

function report(board: string, ui: { frames: number; sum: number; worst: number; over17: number; over33: number }, js: { frames: number; worst: number }) {
  console.log(`[standings-perf] ${Date.now()} ${board} ui frames=${ui.frames} avg=${ui.frames ? (ui.sum / ui.frames).toFixed(1) : 0}ms `
    + `worst=${ui.worst.toFixed(1)}ms over17=${ui.over17} over33=${ui.over33} | js frames=${js.frames} worst=${js.worst.toFixed(1)}ms`);
}

/** Mounted only while the flag is on and the board is the active tab. */
export function StandingsPerfLog({ board }: { readonly board: string }) {
  const frames = useSharedValue(0);
  const sum = useSharedValue(0);
  const worst = useSharedValue(0);
  const over17 = useSharedValue(0);
  const over33 = useSharedValue(0);
  const since = useSharedValue(0);
  const jsFrames = useSharedValue(0);
  const jsWorst = useSharedValue(0);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      if (last) {
        const dt = t - last;
        jsFrames.value += 1;
        if (dt > jsWorst.value) jsWorst.value = dt;
      }
      last = t;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [jsFrames, jsWorst]);

  useFrameCallback(info => {
    'worklet';
    const dt = info.timeSincePreviousFrame;
    if (dt == null) return;
    frames.value += 1;
    sum.value += dt;
    if (dt > worst.value) worst.value = dt;
    if (dt > 17.5) over17.value += 1;
    if (dt > 33.5) over33.value += 1;
    since.value += dt;
    if (since.value >= 1000) {
      runOnJS(report)(board, { frames: frames.value, sum: sum.value, worst: worst.value, over17: over17.value, over33: over33.value },
        { frames: jsFrames.value, worst: jsWorst.value });
      frames.value = 0; sum.value = 0; worst.value = 0; over17.value = 0; over33.value = 0; since.value = 0;
      jsFrames.value = 0; jsWorst.value = 0;
    }
  });
  return null;
}
