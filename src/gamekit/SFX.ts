/**
 * SFX.ts — expo-av pooled sound manager for GameKit.
 *
 * Design goals:
 *   - Load each sound once, the first time it plays, and reuse the loaded
 *     Sound objects (a pool per name that grows to 3 for overlapping plays),
 *     never create-per-play.
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
  private pending = new Map<SfxName, Promise<Voice[] | null>>();
  private audioModeSet = false;
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
   * Warm one voice for every sound in the manifest. Optional: play() loads a
   * sound the first time it is used. Idempotent and safe to call repeatedly.
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
    const names = Object.keys(SFX_MANIFEST) as SfxName[];
    await Promise.all(names.map(name => this.ensurePool(name)));
    this.loaded = true;
  }

  private async ensureAudioMode(): Promise<void> {
    if (this.audioModeSet) return;
    this.audioModeSet = true;
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    } catch {
      // Non-fatal — playback may still work with default mode.
    }
  }

  private async createVoice(name: SfxName): Promise<Voice | null> {
    const asset = SFX_MANIFEST[name] as SfxAsset | undefined;
    if (asset === undefined) return null;
    try {
      const { sound } = await Audio.Sound.createAsync(asset, {
        shouldPlay: false,
        volume: this.masterVolume,
      });
      return { sound, busy: false };
    } catch {
      return null;
    }
  }

  /**
   * One loaded voice per sound the first time it is needed. The old manager
   * loaded all 16 sounds x 3 voices (48 native players) before the first cue
   * could play; most games use a handful of sounds and rarely overlap.
   */
  private ensurePool(name: SfxName): Promise<Voice[] | null> {
    const ready = this.pools.get(name);
    if (ready) return Promise.resolve(ready);
    const pending = this.pending.get(name);
    if (pending) return pending;
    const load = (async () => {
      await this.ensureAudioMode();
      const voice = await this.createVoice(name);
      if (!voice) return null;
      const pool = [voice];
      this.pools.set(name, pool);
      return pool;
    })();
    this.pending.set(name, load);
    void load.finally(() => this.pending.delete(name));
    return load;
  }

  /** A free voice, adding one (up to POOL_PER_SOUND) when every voice is busy. */
  private async acquire(name: SfxName): Promise<Voice | null> {
    const pool = await this.ensurePool(name);
    if (!pool || pool.length === 0) return null;
    const free = pool.find((v) => !v.busy);
    if (free) return free;
    if (pool.length >= POOL_PER_SOUND) return null; // Drop an excess cue rather than interrupting a voice.
    const extra = await this.createVoice(name);
    if (!extra) return null;
    if (pool.length >= POOL_PER_SOUND) {
      void extra.sound.unloadAsync().catch(() => undefined);
      return pool.find((v) => !v.busy) ?? null;
    }
    pool.push(extra);
    return extra;
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
    // Loads this sound on first use; absent from the manifest → silent no-op.
    const voice = await this.acquire(name);
    if (!voice) return;

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
