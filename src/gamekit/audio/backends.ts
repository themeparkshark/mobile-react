/**
 * backends.ts: the two audio backends behind GameAudio.
 *
 *   audio-api  react-native-audio-api (Web Audio on a native graph): decoded
 *              buffers, sample-accurate `when` scheduling, StereoPannerNode,
 *              BiquadFilterNode low-pass for music states, AudioParam ramps.
 *              Tap-to-sound is ~10-25 ms. Needs the dev client rebuilt with
 *              the native module (see studio/engine/DEPENDENCIES.md).
 *   expo-av    preloaded Sound pools. Always available, 50-150 ms latency,
 *              no pan or filter (music "muffled" becomes a volume dip or a
 *              pre-rendered low-pass file).
 *
 * The engine picks audio-api when its native module is present and falls back
 * to expo-av on any failure, so an old binary never breaks a game.
 */

import { Audio } from 'expo-av';
import { Asset } from 'expo-asset';

export interface PlayArgs {
  gain: number;
  rate: number;
  pan: number;
  delayMs: number;
  startMs: number;
  /** 0 = to the end. */
  durationMs: number;
}

export interface MusicArgs {
  gain: number;
  loop: boolean;
  fadeMs: number;
  fromMs: number;
  loopStartMs?: number;
  loopEndMs?: number;
}

export interface AudioBackend {
  readonly name: 'audio-api' | 'expo-av';
  readonly supportsPan: boolean;
  readonly supportsFilter: boolean;
  /** Typical tap-to-sound latency (ms) used for haptic/visual alignment. */
  readonly latencyMs: number;
  init(): Promise<void>;
  load(key: string, src: number, voices: number): Promise<boolean>;
  isLoaded(key: string): boolean;
  /** Start a one-shot. Returns a voice token (>0) or 0 on failure. */
  play(key: string, args: PlayArgs): number;
  stop(token: number): void;
  stopAll(): void;
  musicStart(deck: string, key: string, args: MusicArgs): void;
  musicGain(deck: string, gain: number, rampMs: number): void;
  musicStop(deck: string, fadeMs: number): void;
  musicPosition(deck: string): Promise<number>;
  /** Low-pass cutoff for the music bus (null = open). */
  musicFilter(cutoffHz: number | null, rampMs: number): void;
  setMasterGain(gain: number): void;
  unloadAll(): Promise<void>;
}

// =============================================================================
// expo-av
// =============================================================================

interface AvVoice {
  sound: Audio.Sound;
  busyUntil: number;
  token: number;
  stopTimer: ReturnType<typeof setTimeout> | null;
}

export class ExpoAvBackend implements AudioBackend {
  readonly name = 'expo-av' as const;
  readonly supportsPan = false;
  readonly supportsFilter = false;
  readonly latencyMs = 80;
  private pools = new Map<string, AvVoice[]>();
  private sources = new Map<string, number>();
  private decks = new Map<string, { sound: Audio.Sound; gain: number; ramp: ReturnType<typeof setInterval> | null }>();
  private tokens = new Map<number, AvVoice>();
  private nextToken = 1;
  private master = 1;
  private ready = false;

  async init(): Promise<void> {
    if (this.ready) return;
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false });
    } catch {
      // Non-fatal.
    }
    this.ready = true;
  }

  isLoaded(key: string): boolean {
    return (this.pools.get(key)?.length ?? 0) > 0;
  }

  async load(key: string, src: number, voices: number): Promise<boolean> {
    if (this.isLoaded(key)) return true;
    this.sources.set(key, src);
    // Music beds stream from their own Sound at start time: no voice pool.
    if (voices <= 0) return true;
    const pool: AvVoice[] = [];
    for (let i = 0; i < Math.max(1, voices); i++) {
      try {
        const { sound } = await Audio.Sound.createAsync(src, { shouldPlay: false, volume: 1 });
        pool.push({ sound, busyUntil: 0, token: 0, stopTimer: null });
      } catch {
        // Fewer voices is fine.
      }
    }
    if (pool.length) this.pools.set(key, pool);
    return pool.length > 0;
  }

  play(key: string, a: PlayArgs): number {
    const pool = this.pools.get(key);
    if (!pool || pool.length === 0) return 0;
    const now = Date.now();
    let voice = pool.find((v) => v.busyUntil <= now);
    if (!voice) voice = pool.reduce((x, y) => (y.busyUntil < x.busyUntil ? y : x));
    const token = this.nextToken++;
    if (voice.token) this.tokens.delete(voice.token);
    voice.token = token;
    this.tokens.set(token, voice);
    if (voice.stopTimer) clearTimeout(voice.stopTimer);
    voice.stopTimer = null;
    voice.busyUntil = now + a.delayMs + (a.durationMs > 0 ? a.durationMs : 1500);
    const v = voice;
    const start = () => {
      v.sound
        .setStatusAsync({
          shouldPlay: true,
          positionMillis: a.startMs,
          volume: Math.max(0, Math.min(1, a.gain * this.master)),
          rate: a.rate,
          shouldCorrectPitch: false,
        })
        .catch(() => undefined);
      if (a.durationMs > 0) {
        v.stopTimer = setTimeout(() => {
          v.sound.pauseAsync().catch(() => undefined);
          v.busyUntil = 0;
        }, a.durationMs / Math.max(0.25, a.rate));
      }
    };
    if (a.delayMs > 0) setTimeout(start, a.delayMs);
    else start();
    return token;
  }

  stop(token: number): void {
    const v = this.tokens.get(token);
    if (!v) return;
    v.sound.pauseAsync().catch(() => undefined);
    v.busyUntil = 0;
    this.tokens.delete(token);
  }

  stopAll(): void {
    this.pools.forEach((pool) => pool.forEach((v) => {
      v.sound.pauseAsync().catch(() => undefined);
      v.busyUntil = 0;
    }));
  }

  musicStart(deck: string, key: string, a: MusicArgs): void {
    const src = this.sources.get(key);
    if (src === undefined) return;
    this.musicStop(deck, 0);
    void Audio.Sound.createAsync(src, {
      shouldPlay: true,
      isLooping: a.loop,
      positionMillis: a.fromMs,
      volume: a.fadeMs > 0 ? 0 : a.gain * this.master,
    }).then(({ sound }) => {
      this.decks.set(deck, { sound, gain: a.fadeMs > 0 ? 0 : a.gain, ramp: null });
      if (a.fadeMs > 0) this.musicGain(deck, a.gain, a.fadeMs);
    }).catch(() => undefined);
  }

  musicGain(deck: string, gain: number, rampMs: number): void {
    const d = this.decks.get(deck);
    if (!d) return;
    if (d.ramp) clearInterval(d.ramp);
    d.ramp = null;
    const from = d.gain;
    if (rampMs <= 0) {
      d.gain = gain;
      d.sound.setVolumeAsync(Math.max(0, Math.min(1, gain * this.master))).catch(() => undefined);
      return;
    }
    const started = Date.now();
    d.ramp = setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / rampMs);
      d.gain = from + (gain - from) * t;
      d.sound.setVolumeAsync(Math.max(0, Math.min(1, d.gain * this.master))).catch(() => undefined);
      if (t >= 1 && d.ramp) {
        clearInterval(d.ramp);
        d.ramp = null;
      }
    }, 30);
  }

  musicStop(deck: string, fadeMs: number): void {
    const d = this.decks.get(deck);
    if (!d) return;
    this.decks.delete(deck);
    if (d.ramp) clearInterval(d.ramp);
    const kill = () => {
      d.sound.stopAsync().catch(() => undefined);
      d.sound.unloadAsync().catch(() => undefined);
    };
    if (fadeMs <= 0) {
      kill();
      return;
    }
    const from = d.gain;
    const started = Date.now();
    const iv = setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / fadeMs);
      d.sound.setVolumeAsync(Math.max(0, from * (1 - t) * this.master)).catch(() => undefined);
      if (t >= 1) {
        clearInterval(iv);
        kill();
      }
    }, 30);
  }

  async musicPosition(deck: string): Promise<number> {
    const d = this.decks.get(deck);
    if (!d) return 0;
    try {
      const st = await d.sound.getStatusAsync();
      return st.isLoaded ? st.positionMillis : 0;
    } catch {
      return 0;
    }
  }

  musicFilter(): void {
    // Not supported on expo-av; MusicDirector uses a volume dip or a
    // pre-rendered low-pass file instead.
  }

  setMasterGain(gain: number): void {
    this.master = gain;
  }

  async unloadAll(): Promise<void> {
    const all: Promise<unknown>[] = [];
    this.pools.forEach((pool) => pool.forEach((v) => all.push(v.sound.unloadAsync().catch(() => undefined))));
    this.pools.clear();
    this.tokens.clear();
    this.decks.forEach((_, deck) => this.musicStop(deck, 0));
    await Promise.all(all);
  }
}

// =============================================================================
// react-native-audio-api
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyNode = any;

function loadAudioApi(): AnyNode | null {
  try {
    // Optional native module: absent on binaries built before it was added.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-audio-api');
    if (!mod || typeof mod.AudioContext !== 'function') return null;
    if (typeof (globalThis as any).createAudioContext !== 'function') return null;
    return mod;
  } catch {
    return null;
  }
}

export function audioApiAvailable(): boolean {
  return loadAudioApi() !== null;
}

async function localPath(src: number): Promise<string | null> {
  try {
    const asset = Asset.fromModule(src);
    if (!asset.localUri) await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    if (!uri) return null;
    return uri.startsWith('file://') ? decodeURI(uri.slice(7)) : uri;
  } catch {
    return null;
  }
}

export class AudioApiBackend implements AudioBackend {
  readonly name = 'audio-api' as const;
  readonly supportsPan = true;
  readonly supportsFilter = true;
  readonly latencyMs = 20;
  private mod: AnyNode;
  private ctx: AnyNode = null;
  private master: AnyNode = null;
  private sfxBus: AnyNode = null;
  private musicBus: AnyNode = null;
  private musicLowpass: AnyNode = null;
  private buffers = new Map<string, AnyNode>();
  private voices = new Map<number, { src: AnyNode; gain: AnyNode }>();
  private decks = new Map<string, { src: AnyNode; gain: AnyNode; startedAt: number; offset: number; loopMs: number; queueEnd: number }>();
  private filterQueueEnd = 0;

  /**
   * react-native-audio-api 0.6.5 crashes in AudioParam::cancelScheduledValues
   * (it dereferences rbegin() of an empty deque and advances an iterator it just
   * popped), and ignores any ramp that ends before the queued end time. So we
   * never cancel: every change is appended after the last queued event, which
   * keeps ramps at most one ramp late and never touches freed memory.
   */
  private appendRamp(param: AnyNode, queueEnd: number, value: number, rampMs: number, exponential = false): number {
    const t = this.ctx.currentTime;
    const start = Math.max(t, queueEnd) + 0.001;
    const end = start + Math.max(0.005, rampMs / 1000);
    try {
      if (exponential) param.exponentialRampToValueAtTime(Math.max(0.0001, value), end);
      else param.linearRampToValueAtTime(value, end);
    } catch {
      // Decoration only.
    }
    return end;
  }
  private nextToken = 1;

  constructor() {
    this.mod = loadAudioApi();
    if (!this.mod) throw new Error('react-native-audio-api unavailable');
  }

  async init(): Promise<void> {
    if (this.ctx) return;
    this.ctx = new this.mod.AudioContext();
    try {
      this.mod.AudioManager?.setAudioSessionOptions?.({ iosCategory: 'playback', iosMode: 'default', iosOptions: ['mixWithOthers'], iosAllowHaptics: true });
    } catch {
      // Older API surface: defaults are fine.
    }
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicLowpass = this.ctx.createBiquadFilter();
    this.musicLowpass.type = 'lowpass';
    this.musicLowpass.frequency.value = 20000;
    this.musicLowpass.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.connect(this.musicLowpass);
  }

  isLoaded(key: string): boolean {
    return this.buffers.has(key);
  }

  async load(key: string, src: number): Promise<boolean> {
    if (this.buffers.has(key)) return true;
    const path = await localPath(src);
    if (!path) return false;
    try {
      const buffer = await this.ctx.decodeAudioDataSource(path);
      this.buffers.set(key, buffer);
      return true;
    } catch (e) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[GameAudio] decode failed', path, String(e));
      return false;
    }
  }

  play(key: string, a: PlayArgs): number {
    const buffer = this.buffers.get(key);
    if (!buffer || !this.ctx) return 0;
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = a.rate;
      const gain = this.ctx.createGain();
      gain.gain.value = a.gain;
      if (a.pan !== 0) {
        const pan = this.ctx.createStereoPanner();
        pan.pan.value = Math.max(-1, Math.min(1, a.pan));
        src.connect(gain);
        gain.connect(pan);
        pan.connect(this.sfxBus);
      } else {
        src.connect(gain);
        gain.connect(this.sfxBus);
      }
      const when = this.ctx.currentTime + a.delayMs / 1000;
      const offset = a.startMs / 1000;
      if (a.durationMs > 0) src.start(when, offset, a.durationMs / 1000);
      else src.start(when, offset);
      const token = this.nextToken++;
      this.voices.set(token, { src, gain });
      src.onEnded = () => this.voices.delete(token);
      return token;
    } catch {
      return 0;
    }
  }

  stop(token: number): void {
    const v = this.voices.get(token);
    if (!v) return;
    try {
      const t = this.ctx.currentTime;
      v.gain.gain.setValueAtTime(v.gain.gain.value, t);
      v.gain.gain.linearRampToValueAtTime(0, t + 0.012);
      v.src.stop(t + 0.015);
    } catch {
      // Already stopped.
    }
    this.voices.delete(token);
  }

  stopAll(): void {
    Array.from(this.voices.keys()).forEach((t) => this.stop(t));
  }

  musicStart(deck: string, key: string, a: MusicArgs): void {
    const buffer = this.buffers.get(key);
    if (!buffer || !this.ctx) return;
    this.musicStop(deck, 0);
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = a.loop;
      if (a.loopStartMs !== undefined) src.loopStart = a.loopStartMs / 1000;
      if (a.loopEndMs !== undefined) src.loopEnd = a.loopEndMs / 1000;
      const gain = this.ctx.createGain();
      const t = this.ctx.currentTime;
      gain.gain.setValueAtTime(a.fadeMs > 0 ? 0 : a.gain, t);
      let queueEnd = t;
      if (a.fadeMs > 0) {
        queueEnd = t + a.fadeMs / 1000;
        gain.gain.linearRampToValueAtTime(a.gain, queueEnd);
      }
      src.connect(gain);
      gain.connect(this.musicBus);
      src.start(t, a.fromMs / 1000);
      const loopMs = (a.loopEndMs ?? buffer.duration * 1000) - (a.loopStartMs ?? 0);
      this.decks.set(deck, { src, gain, startedAt: t, offset: a.fromMs, loopMs, queueEnd });
    } catch {
      // Ignore: music is decoration.
    }
  }

  musicGain(deck: string, gain: number, rampMs: number): void {
    const d = this.decks.get(deck);
    if (!d) return;
    d.queueEnd = this.appendRamp(d.gain.gain, d.queueEnd, gain, rampMs);
  }

  musicStop(deck: string, fadeMs: number): void {
    const d = this.decks.get(deck);
    if (!d) return;
    this.decks.delete(deck);
    try {
      const end = this.appendRamp(d.gain.gain, d.queueEnd, 0, Math.max(10, fadeMs));
      d.src.stop(end + 0.01);
    } catch {
      // Already stopped.
    }
  }

  async musicPosition(deck: string): Promise<number> {
    const d = this.decks.get(deck);
    if (!d || !this.ctx) return 0;
    const played = (this.ctx.currentTime - d.startedAt) * 1000 + d.offset;
    return d.loopMs > 0 ? played % d.loopMs : played;
  }

  musicFilter(cutoffHz: number | null, rampMs: number): void {
    if (!this.musicLowpass) return;
    this.filterQueueEnd = this.appendRamp(this.musicLowpass.frequency, this.filterQueueEnd, cutoffHz ?? 20000, Math.max(10, rampMs), true);
  }

  setMasterGain(gain: number): void {
    if (this.master) this.master.gain.value = gain;
  }

  async unloadAll(): Promise<void> {
    this.stopAll();
    Array.from(this.decks.keys()).forEach((d) => this.musicStop(d, 0));
    this.buffers.clear();
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// =============================================================================
// Hybrid: audio-api where it can decode, expo-av for everything else
// =============================================================================

const AV_ONLY_TYPES = new Set(['m4a', 'aac', 'caf', 'mp4']);

function assetType(src: number): string {
  try {
    return (Asset.fromModule(src).type || '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * react-native-audio-api 0.6 decodes WAV and MP3 but not AAC. The hybrid
 * routes each file to the low-latency graph when it can, and to expo-av
 * otherwise (compressed music beds and stingers), per key and per deck.
 */
export class HybridBackend implements AudioBackend {
  readonly name = 'audio-api' as const;
  readonly supportsPan = true;
  readonly latencyMs = 20;
  private routes = new Map<string, AudioBackend>();
  private deckRoutes = new Map<string, AudioBackend>();
  private lastDeck: AudioBackend | null = null;
  private static readonly AV_OFFSET = 1_000_000_000;

  constructor(private api: AudioApiBackend, private av: ExpoAvBackend) {}

  get supportsFilter(): boolean {
    return this.lastDeck === this.api;
  }

  async init(): Promise<void> {
    await Promise.all([this.api.init(), this.av.init()]);
  }

  isLoaded(key: string): boolean {
    return this.routes.get(key)?.isLoaded(key) ?? false;
  }

  async load(key: string, src: number, voices: number): Promise<boolean> {
    if (!AV_ONLY_TYPES.has(assetType(src)) && (await this.api.load(key, src))) {
      this.routes.set(key, this.api);
      return true;
    }
    const ok = await this.av.load(key, src, voices);
    if (ok) this.routes.set(key, this.av);
    return ok;
  }

  play(key: string, args: PlayArgs): number {
    const b = this.routes.get(key);
    if (!b) return 0;
    const t = b.play(key, args);
    return t && b === this.av ? t + HybridBackend.AV_OFFSET : t;
  }

  stop(token: number): void {
    if (token >= HybridBackend.AV_OFFSET) this.av.stop(token - HybridBackend.AV_OFFSET);
    else this.api.stop(token);
  }

  stopAll(): void {
    this.api.stopAll();
    this.av.stopAll();
  }

  musicStart(deck: string, key: string, args: MusicArgs): void {
    const b = this.routes.get(key) ?? this.av;
    const prev = this.deckRoutes.get(deck);
    if (prev && prev !== b) prev.musicStop(deck, 0);
    this.deckRoutes.set(deck, b);
    this.lastDeck = b;
    b.musicStart(deck, key, args);
  }

  musicGain(deck: string, gain: number, rampMs: number): void {
    this.deckRoutes.get(deck)?.musicGain(deck, gain, rampMs);
  }

  musicStop(deck: string, fadeMs: number): void {
    this.deckRoutes.get(deck)?.musicStop(deck, fadeMs);
  }

  musicPosition(deck: string): Promise<number> {
    return this.deckRoutes.get(deck)?.musicPosition(deck) ?? Promise.resolve(0);
  }

  musicFilter(cutoffHz: number | null, rampMs: number): void {
    this.api.musicFilter(cutoffHz, rampMs);
  }

  setMasterGain(gain: number): void {
    this.api.setMasterGain(gain);
    this.av.setMasterGain(gain);
  }

  async unloadAll(): Promise<void> {
    await Promise.all([this.api.unloadAll(), this.av.unloadAll()]);
    this.routes.clear();
    this.deckRoutes.clear();
  }
}
