/**
 * Pin Trading sound + haptic beats, on the GameKit audio engine (preloaded
 * voices, so a beat plays on its frame instead of after a decode). Chris's
 * original sounds only; the player's sound setting is honoured by the engine.
 * Every haptic fires HAPTIC_AFTER_AUDIO_MS after its sound starts, so the buzz
 * never leads the audio.
 */
import { GameAudio } from '../../gamekit/audio/GameAudio';
import { queueHaptic, type HapticIntent } from '../../gamekit/Haptics';
import { HAPTIC_AFTER_AUDIO_MS } from './pinTradeModel';

export const TRADE_CUES = [
  'ui.select', 'ui.confirm', 'ui.complete', 'ui.modalClose',
  'fx.whooshRev', 'fx.firework', 'fx.hit', 'fx.coinTick', 'fx.nope', 'fx.purchaseCancel',
] as const;

export type TradeCue = typeof TRADE_CUES[number];

let preloaded: Promise<void> | null = null;

/** Decode the trading cues once (call when the screen opens). */
export function preloadTradeAudio(): void {
  preloaded ??= GameAudio.preload([...TRADE_CUES]).catch(() => undefined);
}

/** One beat: a sound, then (optionally) its haptic a moment later. Never throws. */
export function beat(cue: TradeCue, opts: { volume?: number; pitch?: number } = {}, haptic?: HapticIntent, priority = 1): number {
  let voice = 0;
  try { voice = GameAudio.play(cue, opts); } catch { /* audio is decoration */ }
  if (haptic) setTimeout(() => queueHaptic(haptic, priority), HAPTIC_AFTER_AUDIO_MS);
  return voice;
}

/** Cut a playing voice (skip stops the riser). */
export function stopBeat(voice: number): void {
  try { if (voice) GameAudio.stop(voice); } catch { /* ignore */ }
}
