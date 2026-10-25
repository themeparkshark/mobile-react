/**
 * studioTrace.ts: the silent studio trace (wow-sound lane, Oct 24 2026).
 *
 * Lane simulators must never make a sound (Dustin's rule), so nobody can hear
 * whether a cue lands with its burst. Trace mode runs the whole studio path
 * (switch on, moment registration, ladders, round-robin, layers, voice caps,
 * ducks, bed layers) into a backend that never touches the audio hardware
 * (traceBackend.ts), and records every sound start, haptic pulse and visual
 * mark with its time. The dev HUD (StudioTraceHud.tsx) lights a marker on the
 * frame each sound would start, so a screen recording shows sound, haptic and
 * burst side by side.
 *
 * On only in a dev build started with EXPO_PUBLIC_STUDIO_TRACE=1. Release
 * builds compile it out (__DEV__ false), so it can never change what ships.
 */

export type TraceKind = 'moment' | 'sound' | 'haptic' | 'music' | 'duck' | 'legacy' | 'mark';

export interface TraceEvent {
  /** Wall clock (ms) the event happens: for a sound, when it would start (call + delay + latency). */
  readonly t: number;
  readonly kind: TraceKind;
  readonly name: string;
  readonly detail?: string;
}

/** True only in a dev build started with EXPO_PUBLIC_STUDIO_TRACE=1. */
export function studioTraceOn(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_STUDIO_TRACE === '1';
}

/**
 * Wave 5: the release-like catch capture (EXPO_PUBLIC_MOTION_CAPTURE=HomeCatchPreview, set only by the lane tooling,
 * never in a store or OTA bundle) records what the catch would play and buzz, with times, in plain lines that the
 * preview flushes to Documents/catch-trace.log. Release JS has no console, so this is the only way to prove timing there.
 */
export function captureTraceOn(): boolean {
  // Round 2: the hooks' capture too (HookSoundPreview: Daily 3 checks, the flame, both chests).
  return process.env.EXPO_PUBLIC_MOTION_CAPTURE === 'HomeCatchPreview' || process.env.EXPO_PUBLIC_MOTION_CAPTURE === 'HookSoundPreview';
}
export const CAPTURE_LINES: string[] = [];
export function captureLine(line: string): void {
  if (CAPTURE_LINES.length < 12_000) CAPTURE_LINES.push(line);
}

const MAX_EVENTS = 4000;
const events: TraceEvent[] = [];
const listeners = new Set<(e: TraceEvent) => void>();
/** Scheduled sounds taken back before they started (the HUD never lights for them). */
const cancelled = new WeakSet<TraceEvent>();

/**
 * Record one event. `at` defaults to now; a scheduled sound passes its start
 * time and listeners are told on that time (so the HUD lights on its frame).
 */
export function traceEvent(kind: TraceKind, name: string, detail?: string, at?: number): void {
  if (!studioTraceOn()) return;
  const now = Date.now();
  const e: TraceEvent = { t: at ?? now, kind, name, detail };
  if (events.length < MAX_EVENTS) events.push(e);
  console.log(`[studio-trace] ${e.t} ${kind} ${name}${detail ? ` ${detail}` : ''}`);
  const wait = e.t - now;
  if (listeners.size === 0) return;
  const tell = () => { if (!cancelled.has(e)) listeners.forEach((fn) => { try { fn(e); } catch { /* HUD is decoration */ } }); };
  if (wait > 4) setTimeout(tell, wait);
  else tell();
}

/**
 * Take a scheduled sound back out (stopped before it started, so it is never heard). The Metro log
 * gets a `cancel` line so an offline render drops it too; the HUD may already have it queued.
 */
export function cancelTraceEvent(kind: TraceKind, name: string, at: number): void {
  if (!studioTraceOn()) return;
  const i = events.findIndex((e) => e.kind === kind && e.name === name && e.t === at);
  if (i >= 0) { cancelled.add(events[i]); events.splice(i, 1); }
  console.log(`[studio-trace] ${at} cancel ${name}`);
}

/** Subscribe (the dev HUD). Returns an unsubscribe. */
export function onTrace(fn: (e: TraceEvent) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Everything recorded so far (CDP: read it with `lane.sh eval`). */
export function traceEvents(): readonly TraceEvent[] {
  return events;
}

/** One line per event, oldest first, times relative to the first event (for a lane report). */
export function traceText(sinceMs = 0): string {
  const list = events.filter((e) => e.t >= sinceMs).slice().sort((a, b) => a.t - b.t);
  const t0 = list[0]?.t ?? 0;
  return list.map((e) => `${String(e.t - t0).padStart(6)} ${e.kind.padEnd(7)} ${e.name}${e.detail ? ` ${e.detail}` : ''}`).join('\n');
}

export function clearTrace(): void {
  events.length = 0;
}

if (studioTraceOn()) {
  // CDP access for lane captures: globalThis.__studioTrace.text()
  (globalThis as unknown as { __studioTrace?: unknown }).__studioTrace = { events: traceEvents, text: traceText, clear: clearTrace };
}
