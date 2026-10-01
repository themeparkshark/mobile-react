/**
 * One voice limiter for app SFX outside games (economy review K16; dressing
 * room 7.9, Duels, queue bonus).
 *
 * - At most 2 voices at once.
 * - Over the limit, a new sound steals the lowest-priority, oldest voice, but
 *   only one of equal or lower priority; otherwise the new sound is dropped.
 * - `dropIfActive` skips a sound while another of the same name still plays
 *   (a whoosh while a flight is airborne).
 *
 * Pure apart from the injected clock; the caller does the actual playback and
 * gives a stop function so a stolen voice can be cut.
 */

/** Higher wins. land > tap > whoosh. */
export const SFX_PRIORITY = { whoosh: 1, tap: 2, land: 3 } as const;

export const SFX_MAX_VOICES = 2;
/** How long a voice holds its slot when the caller does not know the sound length. */
export const SFX_DEFAULT_MS = 600;

export interface SfxVoice {
  readonly id: number;
  readonly name: string;
  readonly priority: number;
  readonly startedAt: number;
  readonly endsAt: number;
  readonly stop?: () => void;
}

export interface SfxRequest {
  readonly priority: number;
  readonly durationMs?: number;
  readonly dropIfActive?: boolean;
  readonly stop?: () => void;
}

export interface SfxLimiter {
  /** A voice id when the sound may play now, or null when it is dropped. */
  request(name: string, request: SfxRequest): number | null;
  /** The sound finished early (or was stopped); free its slot. */
  release(id: number): void;
  active(): readonly SfxVoice[];
}

export function createSfxLimiter(options: { maxVoices?: number; now?: () => number } = {}): SfxLimiter {
  const maxVoices = options.maxVoices ?? SFX_MAX_VOICES;
  const now = options.now ?? (() => Date.now());
  let voices: SfxVoice[] = [];
  let nextId = 1;

  const prune = () => {
    const at = now();
    voices = voices.filter(voice => voice.endsAt > at);
  };

  return {
    request(name, request) {
      prune();
      if (request.dropIfActive && voices.some(voice => voice.name === name)) return null;
      if (voices.length >= maxVoices) {
        const victim = [...voices].sort((a, b) => a.priority - b.priority || a.startedAt - b.startedAt)[0];
        if (!victim || victim.priority > request.priority) return null;
        voices = voices.filter(voice => voice.id !== victim.id);
        try {
          victim.stop?.();
        } catch {
          // A failing audio voice must never break the caller.
        }
      }
      const at = now();
      const voice: SfxVoice = {
        id: nextId++, name, priority: request.priority, startedAt: at,
        endsAt: at + (request.durationMs ?? SFX_DEFAULT_MS), stop: request.stop,
      };
      voices.push(voice);
      return voice.id;
    },
    release(id) {
      voices = voices.filter(voice => voice.id !== id);
    },
    active() {
      prune();
      return voices;
    },
  };
}

/** The app-wide limiter. */
export const sfxLimiter = createSfxLimiter();

/**
 * Play through the app-wide limiter. `play` runs only when a voice is free
 * (or stolen); it may return a stop function for when it is stolen later.
 */
export function playLimited(name: string, request: Omit<SfxRequest, 'stop'>, play: () => (() => void) | void): boolean {
  let stop: (() => void) | undefined;
  const id = sfxLimiter.request(name, { ...request, stop: () => stop?.() });
  if (id === null) return false;
  try {
    stop = play() ?? undefined;
  } catch {
    sfxLimiter.release(id);
    return false;
  }
  return true;
}
