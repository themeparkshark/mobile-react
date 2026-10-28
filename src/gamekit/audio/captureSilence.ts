/**
 * Capture screens only (dev routes and release-JS frame captures, never a
 * store build): keep the app off the native audio stack. The capture is
 * silent anyway, and a loaded simulator host can time that stack out, freeze
 * the main thread or abort the app. Game cues still reach GameAudio.play, so
 * a capture log still names every finish cue, and the music clock keeps time.
 */
import { Audio } from 'expo-av';
import { GameAudio } from './GameAudio';
import type { AudioBackend } from './backends';

function silentBackend(): AudioBackend {
  const decks = new Map<string, number>();
  const now = () => Date.now();
  return {
    name: 'expo-av', supportsPan: false, supportsFilter: false, latencyMs: 0,
    init: async () => undefined,
    load: async () => true,
    isLoaded: () => true,
    play: () => 1,
    stop: () => undefined,
    stopAll: () => undefined,
    musicStart: (deck) => { decks.set(deck, now()); },
    musicGain: () => undefined,
    musicStop: (deck) => { decks.delete(deck); },
    musicPosition: async (deck) => (decks.has(deck) ? now() - (decks.get(deck) ?? 0) : 0),
    musicFilter: () => undefined,
    setMasterGain: () => undefined,
    unloadAll: async () => undefined,
    clockMs: now,
    positionIsCheap: () => true,
  };
}

/** Silence the app for a capture. Returns the undo for when the capture screen closes. */
export function silenceForCapture(): () => void {
  GameAudio.useCaptureBackend(silentBackend());
  // The app's own expo-av sounds (menu music, tap sounds) stay off too.
  void Audio.setIsEnabledAsync(false).catch(() => undefined);
  return () => { void Audio.setIsEnabledAsync(true).catch(() => undefined); };
}
