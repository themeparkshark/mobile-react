/**
 * studioSwitch.ts: the one switch for studio sound (wow-sound lane, Oct 24 2026).
 *
 * Off until Dustin approves the listening pack by ear. While it is off the app
 * plays exactly what it plays today: playMoment() plays each moment's Chris
 * fallback and studioMoment() returns false so legacy call sites run untouched.
 *
 * On needs every key:
 *   1. STUDIO_SOUND_DEFAULT (this file) flipped to true in an OTA, after his yes;
 *   2. the server flag `studio_sound` (GET /feature-flags), so the rollout can
 *      be paused without a release;
 *   3. not a muted studio run (EXPO_PUBLIC_STUDIO_MUTE=1 on lane simulators).
 * A cue also has to be approved (studio.generated.ts) to play in a release
 * build; an unapproved cue falls back to Chris even with the switch on.
 *
 * Dev builds can audition with setStudioSoundOverride(true) (dev tester only;
 * ignored in release).
 *
 * Trace mode (studioTrace.ts, dev + EXPO_PUBLIC_STUDIO_TRACE=1) turns the
 * studio path on while muted: GameAudio then plays into TraceBackend, which
 * never touches the audio hardware, so lane simulators can prove timing
 * without making a sound.
 *
 * Approval path: Dustin says yes to a moment (or the whole pack) ->
 * `node tools/audio/approve-moments.mjs --all` (or moment names) adds the
 * moment cues to <studio>/APPROVED.json -> `node tools/audio/sync-studio-audio.mjs`
 * moves them into studio.generated.ts -> flip STUDIO_SOUND_DEFAULT -> turn on
 * the `studio_sound` flag.
 */

import { studioTraceOn } from './studioTrace';

/** The feature-flags read (api/endpoints/platform/feature-flags), injected so the engine never imports the API client. */
export type FlagReader = () => Promise<{ flags?: Record<string, boolean> } | null | undefined>;

/** Key 1: flipped to true only after Dustin's yes. */
export const STUDIO_SOUND_DEFAULT = false;

const TTL_MS = 5 * 60_000;
let flag: { on: boolean; at: number } | null = null;
let pending: Promise<boolean> | null = null;
let override: boolean | null = null;

function isDev(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

/** Key 3: lane simulators run muted and must never switch studio sound on. */
export function studioMuted(): boolean {
  return process.env.EXPO_PUBLIC_STUDIO_MUTE === '1';
}

/** True only when every key is turned. Cheap: safe to call on every play. */
export function isStudioSoundOn(): boolean {
  // Dev trace only (the engine is on the silent TraceBackend): on, unless a capture flips it off
  // to trace what today's app plays (globalThis.__studioTrace.setSwitch(false)).
  if (studioTraceOn()) return override ?? true;
  if (studioMuted()) return false;
  if (override !== null && isDev()) return override;
  return STUDIO_SOUND_DEFAULT && (flag?.on ?? false);
}

/**
 * Key 2: read the server flag (cached 5 minutes; only a real answer is cached,
 * so a network hiccup reads as off for this call and asks again next time).
 * Never throws.
 */
export function loadStudioSoundFlag(read: FlagReader, now: () => number = Date.now): Promise<boolean> {
  if (!STUDIO_SOUND_DEFAULT) return Promise.resolve(false); // key 1 off: never even ask
  if (flag && now() - flag.at < TTL_MS) return Promise.resolve(flag.on);
  pending ??= read()
    .then((payload) => {
      const on = payload?.flags?.studio_sound === true;
      flag = { on, at: now() };
      return on;
    })
    .catch(() => false)
    .finally(() => { pending = null; });
  return pending;
}

/** Dev tester / tests only: force the switch (release builds ignore it). */
export function setStudioSoundOverride(on: boolean | null): void {
  override = on;
}

/** Tests only. */
export function resetStudioSwitchForTests(): void {
  flag = null;
  pending = null;
  override = null;
}

if (studioTraceOn()) {
  // CDP for lane captures: trace today's sound (false) or the studio sound (true) on the same catch.
  const g = globalThis as unknown as { __studioTrace?: Record<string, unknown> };
  g.__studioTrace = { ...(g.__studioTrace ?? {}), setSwitch: (on: boolean | null) => { override = on; return isStudioSoundOn(); } };
}
