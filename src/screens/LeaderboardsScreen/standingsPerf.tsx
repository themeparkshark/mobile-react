/**
 * Standings perf probe (EXPO_PUBLIC_STANDINGS_PERF=1, inlined at bundle time,
 * so it also works in a Release build and is a constant for the hooks rule).
 * Once a second it logs UI-thread and JS-thread frame stats; the board adds
 * marks for each infinite-scroll page (asked, landed, rows left before the
 * grey rows). Off by default: nothing mounts and nothing logs. A Release
 * build strips console.log, so the lines are also flushed every 2 s to
 * Documents/standings-perf.log (read it from the simulator's app container).
 *
 *   [standings-perf] 1791100000000 ui frames=60 avg=16.7ms worst=18.1ms over17=1 over33=0 | js frames=59 worst=21.0ms
 *   [standings-perf] 1791100000000 mark page-arrived week 182ms rows=150 rowsToEndAtArrival=14
 */
import * as FileSystem from 'expo-file-system';
import { useEffect } from 'react';
import { useFrameCallback, useSharedValue, runOnJS } from 'react-native-reanimated';

export const STANDINGS_PERF_ON = process.env.EXPO_PUBLIC_STANDINGS_PERF === '1';

const trace: string[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

function line(text: string): void {
  const out = `[standings-perf] ${Date.now()} ${text}`;
  console.log(out);
  trace.push(out);
  if (trace.length > 5000) trace.splice(0, trace.length - 5000);
  flushTimer ??= setInterval(() => {
    void FileSystem.writeAsStringAsync(`${FileSystem.documentDirectory}standings-perf.log`, trace.join('\n')).catch(() => undefined);
  }, 2000);
}

export function perfMark(text: string): void {
  if (STANDINGS_PERF_ON) line(`mark ${text}`);
}

function report(board: string, ui: { frames: number; sum: number; worst: number; over17: number; over33: number }, js: { frames: number; worst: number }) {
  line(`${board} ui frames=${ui.frames} avg=${ui.frames ? (ui.sum / ui.frames).toFixed(1) : 0}ms `
    + `worst=${ui.worst.toFixed(1)}ms over17=${ui.over17} over33=${ui.over33} | js frames=${js.frames} worst=${js.worst.toFixed(1)}ms`);
}

/**
 * Repeatable scroll for perf captures (EXPO_PUBLIC_STANDINGS_PERF=1 with
 * EXPO_PUBLIC_STANDINGS_PERF_SCROLL=1): after 6 s, ten hard flings down
 * (1,600 pt each in a native animated scroll, about a 5,000 pt/s fling), a
 * pause, then a steady 60 Hz drag at 3,840 pt/s, then a fling back to the top.
 * The board passes a scroller; nothing runs unless both flags are set.
 */
export const STANDINGS_PERF_SCROLL_ON = STANDINGS_PERF_ON && process.env.EXPO_PUBLIC_STANDINGS_PERF_SCROLL === '1';

export function startPerfScroll(scrollBy: (dy: number, animated: boolean) => void, toTop: () => void): () => void {
  if (!STANDINGS_PERF_SCROLL_ON) return () => undefined;
  const timers: ReturnType<typeof setTimeout>[] = [];
  let drag: ReturnType<typeof setInterval> | null = null;
  const at = (ms: number, run: () => void) => timers.push(setTimeout(run, ms));
  at(6000, () => perfMark('script fling-start'));
  for (let i = 0; i < 10; i++) at(6000 + i * 700, () => scrollBy(1600, true));
  at(15000, () => {
    perfMark('script drag-start');
    let ticks = 0;
    drag = setInterval(() => {
      scrollBy(64, false);
      if (++ticks >= 300) { if (drag) clearInterval(drag); drag = null; perfMark('script drag-end'); }
    }, 16);
  });
  at(22000, () => { perfMark('script top'); toTop(); });
  return () => { timers.forEach(clearTimeout); if (drag) clearInterval(drag); };
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
