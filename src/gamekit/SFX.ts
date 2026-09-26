/**
 * SFX.ts — expo-av pooled sound manager for GameKit.
 *
 * Design goals:
 *   - Preload every sound in the manifest once, reuse the loaded Sound objects
 *     (a small pool per name for overlapping plays), never create-per-play.
 *   - Silent no-op when a requested sound is absent from the manifest, so games
 *     work before audio assets land.
 *   - Master volume + enable flag (wire to SoundEffectProvider / player setting).
 *   - Duck background music around a play via an injectable ducking hook, so
 *     this module stays decoupled from MusicProvider.
 *
 * Everything is defensive: a failing audio subsystem must never crash a game.
 */

import { Audio } from 'expo-av';
import { SFX_MANIFEST, type SfxName, type SfxAsset } from '../assets/games/sfx/manifest';

/** Number of overlapping voices per sound (rapid combos need >1). */
const POOL_PER_SOUND = 3;

interface Voice {
  sound: Audio.Sound;
  busy: boolean;
}

type DuckHook = (active: boolean) => void;

class SfxManager {
  private pools = new Map<SfxName, Voice[]>();
  private loaded = false;
  private loading: Promise<void> | null = null;
  private enabled = true;
  private masterVolume = 1;
  private duck: DuckHook | null = null;
  private activePlays = 0;

  /** Enable/disable all SFX (respect player's sound-effects preference). */
  setEnabled(value: boolean): void {
    this.enabled = value;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** 0..1 master volume applied to every voice. */
  setMasterVolume(v: number): void {
    this.masterVolume = Math.max(0, Math.min(1, v));
  }

  /** Provide a callback that ducks music while SFX are playing. */
  setDuckHook(hook: DuckHook | null): void {
    this.duck = hook;
  }

  /**
   * Preload the whole manifest into pools. Idempotent and safe to call from
   * multiple mounts — concurrent calls share one in-flight promise.
   */
  async preload(): Promise<void> {
    if (this.loaded) return;
    if (this.loading) return this.loading;
    this.loading = this.doPreload();
    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
  }

  private async doPreload(): Promise<void> {
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    } catch {
      // Non-fatal — playback may still work with default mode.
    }
    const names = Object.keys(SFX_MANIFEST) as SfxName[];
    await Promise.all(
      names.map(async (name) => {
        const asset = SFX_MANIFEST[name] as SfxAsset | undefined;
        if (asset === undefined) return;
        const voices: Voice[] = [];
        for (let i = 0; i < POOL_PER_SOUND; i++) {
          try {
            const { sound } = await Audio.Sound.createAsync(asset, {
              shouldPlay: false,
              volume: this.masterVolume,
            });
            voices.push({ sound, busy: false });
          } catch {
            // Skip this voice; the pool can still work with fewer voices.
          }
        }
        if (voices.length > 0) this.pools.set(name, voices);
      }),
    );
    this.loaded = true;
  }

  /** Drop an excess cue rather than interrupting a playing voice. */
  private acquire(name: SfxName): Voice | null {
    const pool = this.pools.get(name);
    if (!pool || pool.length === 0) return null;
    return pool.find((v) => !v.busy) ?? null;
  }

  private beginDuck(): void {
    this.activePlays += 1;
    if (this.activePlays === 1) this.duck?.(true);
  }

  private endDuck(): void {
    this.activePlays = Math.max(0, this.activePlays - 1);
    if (this.activePlays === 0) this.duck?.(false);
  }

  /**
   * Play a sound by semantic name. No-ops (returns immediately) when disabled
   * or when the name is not in the manifest. `volumeScale` (0..1) attenuates
   * this one play relative to master volume.
   */
  async play(name: SfxName, volumeScale = 1): Promise<void> {
    if (!this.enabled) return;
    // Lazy preload so callers don't have to remember to preload first.
    if (!this.loaded) await this.preload();

    const voice = this.acquire(name);
    if (!voice) return; // Not in manifest → silent no-op.

    const volume = Math.max(0, Math.min(1, this.masterVolume * volumeScale));
    voice.busy = true;
    this.beginDuck();
    try {
      voice.sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          voice.busy = false;
          voice.sound.setOnPlaybackStatusUpdate(null);
          this.endDuck();
        }
      });
      await voice.sound.setStatusAsync({
        shouldPlay: true,
        positionMillis: 0,
        volume,
      });
    } catch {
      voice.busy = false;
      voice.sound.setOnPlaybackStatusUpdate(null);
      this.endDuck();
    }
  }

  /** Unload every voice. Call on app teardown if needed. */
  async unloadAll(): Promise<void> {
    const all: Promise<unknown>[] = [];
    this.pools.forEach((pool) => {
      pool.forEach((v) => {
        all.push(v.sound.unloadAsync().catch(() => undefined));
      });
    });
    this.pools.clear();
    this.loaded = false;
    this.activePlays = 0;
    await Promise.all(all);
  }
}

/** App-wide singleton. */
export const SFX = new SfxManager();

/** Ergonomic alias. */
export function playSfx(name: SfxName, volumeScale = 1): void {
  void SFX.play(name, volumeScale);
}

export type { SfxName };
