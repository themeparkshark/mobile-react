/**
 * SFX.ts: the legacy GameKit sound API, now a thin facade over GameAudio.
 *
 * Existing games keep calling playSfx('coin') / SFX.play('hit'); every call
 * goes through the studio engine (preloaded voices, polyphony caps, cooldown
 * merges, ducking, and the low-latency audio-api backend when present).
 * Legacy names map to Chris's cues in audio/chrisBank.ts (LEGACY_SFX_TO_CUE);
 * 'coin' now plays Chris's coin.mp3 (WS4 finding). Any engine cue name also
 * works here: playSfx('fx.reward').
 *
 * Everything is defensive: a failing audio subsystem must never crash a game.
 */

import type { SfxName } from '../assets/games/sfx/manifest';
import { GameAudio } from './audio/GameAudio';
import { LEGACY_SFX_TO_CUE } from './audio/chrisBank';
import { LEGACY_SFX_TO_MOMENT } from './audio/momentMap';
import { studioMoment } from './audio/playMoment';

type DuckHook = (active: boolean) => void;

class SfxManager {
  private duck: DuckHook | null = null;
  private ducking = 0;

  /** Enable/disable all SFX (respect player's sound-effects preference). */
  setEnabled(value: boolean): void {
    GameAudio.setSfxEnabled(value);
  }

  isEnabled(): boolean {
    return GameAudio.isSfxEnabled();
  }

  /** 0..1 master volume applied to every voice. */
  setMasterVolume(v: number): void {
    GameAudio.setMasterVolume(v);
  }

  /** Provide a callback that ducks external music while SFX are playing. */
  setDuckHook(hook: DuckHook | null): void {
    this.duck = hook;
  }

  /** Preload the legacy cue set (idempotent, safe from many mounts). */
  async preload(): Promise<void> {
    try {
      await GameAudio.preload(Array.from(new Set(Object.values(LEGACY_SFX_TO_CUE))));
    } catch {
      // Audio is decoration: never block a game on it.
    }
  }

  /**
   * Play by semantic name (legacy SfxName or any engine cue). No-ops when
   * disabled or unknown. `volumeScale` (0..1) attenuates this one play.
   */
  async play(name: SfxName | string, volumeScale = 1): Promise<void> {
    try {
      // Sound effects off: no-op before the engine starts, so a muted player never powers up audio.
      if (!GameAudio.isSfxEnabled()) return;
      const cue = LEGACY_SFX_TO_CUE[name] ?? name;
      if (!GameAudio.backend) await GameAudio.init();
      // Studio sound on (wow-sound switch): legacy names speak the moment vocabulary
      // (hit -> game.hit, win -> game.win, ...). Off (default): exactly the Chris cue below.
      const moment = LEGACY_SFX_TO_MOMENT[name];
      const studio = !!moment && studioMoment(moment, { volume: volumeScale });
      const id = studio ? 1 : GameAudio.play(cue, { volume: volumeScale });
      if (id && this.duck) {
        const ms = GameAudio.cue(studio ? `moment:${moment}:primary` : cue)?.durationMs ?? 600;
        this.ducking += 1;
        if (this.ducking === 1) this.duck(true);
        setTimeout(() => {
          this.ducking = Math.max(0, this.ducking - 1);
          if (this.ducking === 0) this.duck?.(false);
        }, ms);
      }
    } catch {
      // Silent: a failing audio subsystem must never crash a game.
    }
  }

  /** Unload every voice. Call on app teardown if needed. */
  async unloadAll(): Promise<void> {
    await GameAudio.unloadAll();
  }
}

/** App-wide singleton. */
export const SFX = new SfxManager();

/** Ergonomic alias. */
export function playSfx(name: SfxName | string, volumeScale = 1): void {
  void SFX.play(name, volumeScale);
}

export type { SfxName };
