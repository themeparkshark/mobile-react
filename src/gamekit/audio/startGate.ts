/**
 * startGate.ts: when the low-latency audio graph (react-native-audio-api) may start.
 *
 * Making the AudioContext wakes the phone's audio hardware (AURemoteIO) on the main thread. When
 * the audio server is slow to answer (a call, a Bluetooth route change, a busy simulator), iOS
 * aborts the app with "Start: RPC timeout. Apparently deadlocked". That must never happen during
 * launch, and never for a player who has both sounds off. So the graph starts only:
 *   1. after the launch cover has lifted and the map has settled (or a safety deadline passes, for
 *      a first screen that is not the map), and
 *   2. while the player can hear something (sound effects or music on).
 * Until then every cue loads on expo-av instead (it plays fine, a little later), so a game never
 * waits on the gate. Pure JS, no timers until someone asks.
 */

/** The longest the gate stays shut after the app starts, in case the map cover never shows. */
export const AUDIO_START_SAFETY_MS = 7000;
/** After the launch cover lifts: let the map, header and pins settle before waking the hardware. */
export const AUDIO_START_AFTER_LIFT_MS = 1200;

const bootAt = Date.now();
let open = false;
let waiters: (() => void)[] = [];
let safety: ReturnType<typeof setTimeout> | null = null;
let soon: ReturnType<typeof setTimeout> | null = null;
let sfxOn = true;
let musicOn = true;

function release() {
  if (open) return;
  open = true;
  if (safety) clearTimeout(safety);
  if (soon) clearTimeout(soon);
  safety = null;
  soon = null;
  const list = waiters;
  waiters = [];
  list.forEach((w) => w());
}

/** Open the gate now (tests, or a screen that knows launch is over). */
export function openAudioStart(): void {
  release();
}

/** The launch cover lifted: open the gate once the map has had a moment to settle. */
export function openAudioStartAfterLaunch(delayMs = AUDIO_START_AFTER_LIFT_MS): void {
  if (open || soon) return;
  soon = setTimeout(release, Math.max(0, delayMs));
}

/** Resolves once the audio graph may start (never later than the safety deadline). */
export function whenAudioMayStart(now = Date.now()): Promise<void> {
  if (open) return Promise.resolve();
  if (!safety) safety = setTimeout(release, Math.max(0, bootAt + AUDIO_START_SAFETY_MS - now));
  return new Promise((resolve) => waiters.push(resolve));
}

export function audioStartOpen(): boolean {
  return open;
}

/** The player's sound settings (SoundEffectProvider keeps them live). */
export function setAudioWanted(sfx: boolean, music: boolean): void {
  sfxOn = sfx;
  musicOn = music;
}

/** True when the player could hear something, so waking the audio hardware is worth it. */
export function audioWanted(): boolean {
  return sfxOn || musicOn;
}
