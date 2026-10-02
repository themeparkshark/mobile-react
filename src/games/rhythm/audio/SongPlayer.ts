/**
 * SongPlayer: the Parade Beat song is the clock (design 7.4, 10.2).
 *
 * Two expo-av Sounds of the same stage window are started together: the song
 * and its Fever mix (song + claps, tambourine, crashes, rendered offline on
 * the same beat map, so the two files are sample-identical outside the added
 * layer). Fever crossfades between them in one beat; nothing is ever started
 * mid-song, so there is no seek flam. Playback position anchors
 * (position, wall time) are published every status tick; the UI thread
 * slews its own clock toward them (see useSongClock).
 *
 * The same class serves a Band Mode guest (song muted, clock still running)
 * and Pocket Parade (song at 0.35 gain).
 *
 * expo-av is the backend today: AAC beds cannot be decoded by
 * react-native-audio-api 0.6 (see gamekit ENGINE.md), which is also why hit
 * sounds (WAV) go through GameAudio's audio-api voices instead.
 */

import { Audio, type AVPlaybackStatus } from 'expo-av';

export interface SongAnchor {
  /** Song position (ms). */
  pos: number;
  /** Date.now() when that position was sampled. */
  wall: number;
  playing: boolean;
}

type AnchorListener = (a: SongAnchor) => void;

const STATUS_MS = 33;

export class SongPlayer {
  private song: Audio.Sound | null = null;
  private fever: Audio.Sound | null = null;
  private feverMix = 0;
  private gain = 1;
  private listener: AnchorListener | null = null;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private tapeTimer: ReturnType<typeof setInterval> | null = null;
  private loaded = false;
  private disposed = false;
  playing = false;
  lastAnchor: SongAnchor = { pos: 0, wall: 0, playing: false };

  constructor(private songSrc: number, private feverSrc: number | null) {}

  onAnchor(fn: AnchorListener | null): void {
    this.listener = fn;
  }

  async load(): Promise<void> {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    }).catch(() => undefined);
    const onStatus = (st: AVPlaybackStatus) => this.onStatus(st);
    const [a, b] = await Promise.all([
      Audio.Sound.createAsync(this.songSrc, { shouldPlay: false, progressUpdateIntervalMillis: STATUS_MS, volume: this.gain }, onStatus),
      this.feverSrc != null
        ? Audio.Sound.createAsync(this.feverSrc, { shouldPlay: false, progressUpdateIntervalMillis: 1000, volume: 0 })
        : Promise.resolve(null),
    ]);
    if (this.disposed) {
      void a.sound.unloadAsync();
      void b?.sound.unloadAsync();
      return;
    }
    this.song = a.sound;
    this.fever = b?.sound ?? null;
    this.loaded = true;
  }

  private onStatus(st: AVPlaybackStatus): void {
    if (!st.isLoaded) return;
    const a: SongAnchor = { pos: st.positionMillis, wall: Date.now(), playing: st.isPlaying };
    this.lastAnchor = a;
    this.listener?.(a);
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  /** Start (or restart) both decks together at `fromMs`. */
  async play(fromMs = 0): Promise<void> {
    if (!this.song) return;
    const jobs: Promise<unknown>[] = [
      this.song.setStatusAsync({ positionMillis: Math.max(0, Math.round(fromMs)), shouldPlay: true, volume: this.gain * (1 - this.feverMix) }),
    ];
    if (this.fever) {
      jobs.push(this.fever.setStatusAsync({ positionMillis: Math.max(0, Math.round(fromMs)), shouldPlay: true, volume: this.gain * this.feverMix }));
    }
    await Promise.all(jobs).catch(() => undefined);
    this.playing = true;
  }

  async pause(): Promise<number> {
    this.playing = false;
    this.stopTimers();
    const jobs: Promise<unknown>[] = [];
    if (this.song) jobs.push(this.song.pauseAsync());
    if (this.fever) jobs.push(this.fever.pauseAsync());
    await Promise.all(jobs).catch(() => undefined);
    const st = await this.song?.getStatusAsync().catch(() => null);
    return st && st.isLoaded ? st.positionMillis : this.lastAnchor.pos;
  }

  async positionMs(): Promise<number> {
    const st = await this.song?.getStatusAsync().catch(() => null);
    return st && st.isLoaded ? st.positionMillis : this.lastAnchor.pos;
  }

  /** Overall song gain (Pocket Parade 0.35, Band Mode guest 0). */
  setGain(g: number): void {
    this.gain = Math.max(0, Math.min(1, g));
    this.applyVolumes();
  }

  private applyVolumes(): void {
    void this.song?.setVolumeAsync(this.gain * (1 - this.feverMix)).catch(() => undefined);
    void this.fever?.setVolumeAsync(this.gain * this.feverMix).catch(() => undefined);
  }

  /** Crossfade to (1) or from (0) the Fever mix over `ms`. */
  setFever(on: boolean, ms: number): void {
    if (!this.fever) return;
    const target = on ? 1 : 0;
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    const start = this.feverMix;
    const t0 = Date.now();
    const dur = Math.max(30, ms);
    this.fadeTimer = setInterval(() => {
      const k = Math.min(1, (Date.now() - t0) / dur);
      // equal-power
      this.feverMix = start + (target - start) * Math.sin((k * Math.PI) / 2);
      this.applyVolumes();
      if (k >= 1 && this.fadeTimer) {
        clearInterval(this.fadeTimer);
        this.fadeTimer = null;
      }
    }, 16);
  }

  /**
   * The stall gag: a tape-stop. expo-av has no filter, so this steps the
   * rate from 1.0 down to 0.3 with pitch following (no correction) while the
   * volume falls, over ~600 ms, then stops.
   */
  tapeStop(ms = 620): Promise<void> {
    return new Promise((resolve) => {
      const decks = [this.song, this.fever].filter(Boolean) as Audio.Sound[];
      if (!decks.length) return resolve();
      const t0 = Date.now();
      const v0 = this.gain;
      this.tapeTimer = setInterval(() => {
        const k = Math.min(1, (Date.now() - t0) / ms);
        const rate = 1 - 0.7 * k * k;
        decks.forEach((d, i) => {
          void d.setRateAsync(rate, false).catch(() => undefined);
          const mix = i === 0 ? 1 - this.feverMix : this.feverMix;
          void d.setVolumeAsync(v0 * mix * (1 - k)).catch(() => undefined);
        });
        if (k >= 1) {
          if (this.tapeTimer) clearInterval(this.tapeTimer);
          this.tapeTimer = null;
          decks.forEach((d) => void d.pauseAsync().catch(() => undefined));
          this.playing = false;
          resolve();
        }
      }, 40);
    });
  }

  /** Outro: fade the song out over `ms` (the stage file also fades itself). */
  fadeOut(ms = 900): void {
    const t0 = Date.now();
    const v0 = this.gain;
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    this.fadeTimer = setInterval(() => {
      const k = Math.min(1, (Date.now() - t0) / ms);
      this.gain = v0 * (1 - k);
      this.applyVolumes();
      if (k >= 1 && this.fadeTimer) {
        clearInterval(this.fadeTimer);
        this.fadeTimer = null;
      }
    }, 30);
  }

  private stopTimers(): void {
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    if (this.tapeTimer) clearInterval(this.tapeTimer);
    this.fadeTimer = null;
    this.tapeTimer = null;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.stopTimers();
    this.listener = null;
    const s = this.song;
    const f = this.fever;
    this.song = null;
    this.fever = null;
    this.loaded = false;
    await Promise.all([s?.unloadAsync(), f?.unloadAsync()]).catch(() => undefined);
  }
}
