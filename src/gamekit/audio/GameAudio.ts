/**
 * GameAudio.ts: the studio's layered audio engine.
 *
 *   await GameAudio.init();                       // picks audio-api or expo-av
 *   GameAudio.registerCues(WHACK_CUES);           // or useStudioLibrary('whack')
 *   await GameAudio.preload(['fx.coin', 'whack.bonk']);
 *   GameAudio.play('whack.bonk', { pan: -0.6, pitch: 4 });
 *   GameAudio.playLadder('memory.match', chain);  // pre-rendered pitch files
 *   GameAudio.duck(6, 60, 400, 300);              // music under a stinger
 *   GameAudio.music.play('chris.track1');         // bed, bar-synced switches
 *
 * Layers: cues (one-shots with variants, pitch ladders, polyphony caps,
 * cooldown merges, priority stealing, random pitch variance), buses (sfx, ui,
 * tell, stinger, music), ducking envelopes, and a MusicDirector (beds,
 * equal-power crossfades on the next beat/bar, low-pass "muffled" states for
 * breathers and look-ups, interruption pause/resume).
 *
 * Sound on/off follows the player's setting via SFX.setEnabled (the provider
 * already calls it). Unapproved studio cues only play in __DEV__.
 */

import {
  allocateVoice,
  barMs,
  dbToGain,
  duckGainAt,
  nextGridMs,
  pitchVariance,
  quantizeDelayMs,
  semitonesToRate,
  type BeatClock,
  type Bus,
  type VoiceInfo,
} from '../core/audioMix';
import { beatMapFromBpm, type BeatMap } from '../core/beatMap';
import { AudioApiBackend, ExpoAvBackend, HybridBackend, audioApiAvailable, type AudioBackend } from './backends';
import { CHRIS_BEDS, CHRIS_CUES, type BedDef, type CueDef } from './chrisBank';
import { routePan, type AudioRoute } from '../core/audioRoute';

export interface PlayOptions {
  /** 0..1 multiplier on the cue gain. */
  volume?: number;
  /** Semitones (runtime rate shift; prefer ladder files for melodic cues). */
  pitch?: number;
  /** -1 (left) .. 1 (right). audio-api only. */
  pan?: number;
  /** Delay (ms), e.g. quantized to the beat. */
  delayMs?: number;
  /** Force a variant index. */
  variant?: number;
}

export type BackendChoice = 'auto' | 'audio-api' | 'expo-av';

interface ActiveVoice extends VoiceInfo {
  token: number;
}

interface Duck {
  start: number;
  db: number;
  a: number;
  h: number;
  r: number;
}

const DEFAULT_GLOBAL_VOICES = 12;
const BUS_DEFAULT: Record<Bus, number> = { sfx: 1, ui: 0.9, tell: 0.75, stinger: 1, music: 0.8, voice: 1 };

class GameAudioEngine {
  backend: AudioBackend | null = null;
  private initPromise: Promise<void> | null = null;
  private cues = new Map<string, CueDef>();
  private beds = new Map<string, BedDef>();
  private loaded = new Set<string>();
  private loading = new Map<string, Promise<boolean>>();
  private active: ActiveVoice[] = [];
  private lastPlayed = new Map<string, number>();
  private lastVariant = new Map<string, number>();
  private nextId = 1;
  private sfxEnabled = true;
  private musicEnabled = true;
  /** Dev only: EXPO_PUBLIC_STUDIO_MUTE=1 keeps studio simulators silent (master gain pinned to 0). */
  private readonly studioMute = typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_STUDIO_MUTE === '1';
  private masterVolume = this.studioMute ? 0 : 1;
  private busGain: Record<Bus, number> = { ...BUS_DEFAULT };
  private ducks: Duck[] = [];
  private duckTimer: ReturnType<typeof setInterval> | null = null;
  globalVoices = DEFAULT_GLOBAL_VOICES;
  private groupCaps = new Map<string, number>();
  /** Output route (useAudioRoute keeps it live). Pan only plays on a private route (Whack v5). */
  route: AudioRoute = 'unknown';
  /** Force panning on regardless of route (dev tester only). */
  panOverride: boolean | null = null;
  private routeListeners = new Set<(r: AudioRoute) => void>();
  /** Dev overlay / tests: every accepted play. */
  onPlay: ((name: string, info: { voices: number; backend: string }) => void) | null = null;
  readonly music: MusicDirector;

  constructor() {
    this.registerCues(CHRIS_CUES);
    this.registerBeds(CHRIS_BEDS);
    this.music = new MusicDirector(this);
  }

  /** Pick and start a backend. Safe to call many times. */
  init(choice: BackendChoice = 'auto'): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      let backend: AudioBackend | null = null;
      if (choice !== 'expo-av' && audioApiAvailable()) {
        try {
          // audio-api for WAV/MP3 one-shots, expo-av for AAC beds/stingers.
          backend = new HybridBackend(new AudioApiBackend(), new ExpoAvBackend());
          await backend.init();
        } catch {
          backend = null;
        }
      }
      if (!backend) {
        backend = new ExpoAvBackend();
        await backend.init();
      }
      backend.setMasterGain(this.masterVolume);
      this.backend = backend;
    })();
    return this.initPromise;
  }

  get backendName(): string {
    return this.backend?.name ?? 'none';
  }

  /** Typical output latency of the active backend (ms). */
  get latencyMs(): number {
    return this.backend?.latencyMs ?? 80;
  }

  registerCues(defs: Record<string, CueDef>): void {
    Object.keys(defs).forEach((name) => this.cues.set(name, defs[name]));
  }

  registerBeds(defs: Record<string, BedDef>): void {
    Object.keys(defs).forEach((name) => this.beds.set(name, defs[name]));
  }

  hasCue(name: string): boolean {
    return this.cues.has(name);
  }

  cue(name: string): CueDef | undefined {
    return this.cues.get(name);
  }

  bed(name: string): BedDef | undefined {
    return this.beds.get(name);
  }

  cueNames(prefix = ''): string[] {
    return Array.from(this.cues.keys()).filter((n) => n.startsWith(prefix));
  }

  private playable(def: CueDef | BedDef | undefined): boolean {
    if (!def) return false;
    if (def.approved === false && !(typeof __DEV__ !== 'undefined' && __DEV__)) return false;
    return true;
  }

  private files(name: string, def: CueDef): { key: string; src: number }[] {
    const out: { key: string; src: number }[] = [];
    if (def.src !== undefined) out.push({ key: `${name}#0`, src: def.src });
    def.variants?.forEach((src, i) => out.push({ key: `${name}#v${i}`, src }));
    def.ladder?.forEach((src, i) => out.push({ key: `${name}#l${i}`, src }));
    return out;
  }

  private loadKey(key: string, src: number, voices: number): Promise<boolean> {
    if (this.loaded.has(key)) return Promise.resolve(true);
    const pending = this.loading.get(key);
    if (pending) return pending;
    const p = (async () => {
      await this.init();
      const ok = await this.backend!.load(key, src, voices);
      if (ok) this.loaded.add(key);
      else if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn(`[GameAudio] ${this.backend!.name} could not load ${key}`);
      this.loading.delete(key);
      return ok;
    })();
    this.loading.set(key, p);
    return p;
  }

  /** Decode/prepare cues (all registered cues when names is omitted). */
  async preload(names?: string[]): Promise<void> {
    await this.init();
    const list = names ?? Array.from(this.cues.keys());
    await Promise.all(list.map(async (name) => {
      const def = this.cues.get(name);
      if (!def || !this.playable(def)) return;
      await Promise.all(this.files(name, def).map((f) => this.loadKey(f.key, f.src, def.maxVoices ?? 3)));
    }));
  }

  async preloadBeds(names: string[]): Promise<void> {
    await this.init();
    await Promise.all(names.map(async (name) => {
      const def = this.beds.get(name);
      if (!def) return;
      await this.loadKey(`bed:${name}`, def.src, 0);
      if (def.lowpassSrc !== undefined) await this.loadKey(`bed:${name}:lp`, def.lowpassSrc, 0);
    }));
  }

  setSfxEnabled(v: boolean): void {
    this.sfxEnabled = v;
    if (!v) this.backend?.stopAll();
  }

  isSfxEnabled(): boolean {
    return this.sfxEnabled;
  }

  setMusicEnabled(v: boolean): void {
    this.musicEnabled = v;
    if (!v) this.music.stop(200);
  }

  isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  setMasterVolume(v: number): void {
    this.masterVolume = this.studioMute ? 0 : Math.max(0, Math.min(1, v));
    this.backend?.setMasterGain(this.masterVolume);
  }

  setBusVolume(bus: Bus, v: number): void {
    this.busGain[bus] = Math.max(0, Math.min(1, v));
    if (bus === 'music') this.music.refreshGain();
  }

  busVolume(bus: Bus): number {
    return this.busGain[bus];
  }

  private pickVariant(name: string, def: CueDef, forced?: number): string {
    const n = def.variants?.length ?? 0;
    if (n === 0) return `${name}#0`;
    const pool = n + (def.src !== undefined ? 1 : 0);
    let idx = forced ?? Math.floor(Math.random() * pool);
    const last = this.lastVariant.get(name);
    if (forced === undefined && pool > 1 && idx === last) idx = (idx + 1) % pool;
    this.lastVariant.set(name, idx);
    if (def.src !== undefined) return idx === 0 ? `${name}#0` : `${name}#v${idx - 1}`;
    return `${name}#v${idx}`;
  }

  /**
   * Play a cue. Returns a voice id (>0), or 0 when muted, unknown, merged by
   * cooldown or dropped by the voice budget. Never throws.
   */
  play(name: string, opts: PlayOptions = {}): number {
    const def = this.cues.get(name);
    if (!def || !this.sfxEnabled) return 0;
    if (!this.playable(def)) return def.fallback && def.fallback !== name ? this.play(def.fallback, opts) : 0;
    return this.start(name, def, this.pickVariant(name, def, opts.variant), opts);
  }

  /** Play step N of a pre-rendered pitch ladder (clamped to the top). */
  playLadder(name: string, step: number, opts: PlayOptions = {}): number {
    const def = this.cues.get(name);
    if (!def || !this.sfxEnabled) return 0;
    if (!this.playable(def)) return def.fallback && def.fallback !== name ? this.play(def.fallback, opts) : 0;
    const n = def.ladder?.length ?? 0;
    if (n === 0) return this.play(name, opts);
    const i = Math.max(0, Math.min(n - 1, Math.floor(step)));
    return this.start(name, def, `${name}#l${i}`, opts);
  }

  private start(name: string, def: CueDef, key: string, opts: PlayOptions): number {
    const now = Date.now();
    const decision = allocateVoice(this.active, {
      cue: name,
      priority: def.priority ?? 1,
      now,
      maxVoicesForCue: def.maxVoices ?? 3,
      cooldownMs: def.cooldownMs ?? 0,
      lastPlayedAt: this.lastPlayed.get(name) ?? -1e9,
      group: def.group,
      groupCap: def.group ? this.groupCaps.get(def.group) ?? 0 : 0,
    }, this.globalVoices);
    if (decision.action === 'drop') return 0;
    if (decision.action === 'steal') this.stop(decision.victimId);

    if (!this.loaded.has(key)) {
      // Lazy: load now, play when ready (first play of an unpreloaded cue).
      const file = this.files(name, def).find((f) => f.key === key);
      if (file) void this.loadKey(file.key, file.src, def.maxVoices ?? 3).then((ok) => { if (ok) this.start(name, def, key, opts); });
      return 0;
    }
    const backend = this.backend;
    if (!backend) return 0;

    const semis = (opts.pitch ?? 0) + (def.pitchJitter ? pitchVariance(def.pitchJitter, Math.random()) : 0);
    const bus = def.bus ?? 'sfx';
    const gain = dbToGain(def.gainDb ?? 0) * (opts.volume ?? 1) * this.busGain[bus];
    const durationMs = def.endMs !== undefined ? def.endMs - (def.startMs ?? 0) : 0;
    const token = backend.play(key, {
      gain,
      rate: semitonesToRate(semis),
      pan: backend.supportsPan ? this.effectivePan(opts.pan ?? 0) : 0,
      delayMs: opts.delayMs ?? 0,
      startMs: def.startMs ?? 0,
      durationMs,
    });
    if (!token) return 0;
    const id = this.nextId++;
    const len = def.durationMs ?? (durationMs || 1200);
    this.active.push({ id, token, cue: name, group: def.group, priority: def.priority ?? 1, startedAt: now, endsAt: now + (opts.delayMs ?? 0) + len });
    this.lastPlayed.set(name, now);
    this.prune(now);
    if (def.duck) this.duck(def.duck.db, def.duck.attackMs ?? 60, def.duck.holdMs ?? len, def.duck.releaseMs ?? 300);
    this.onPlay?.(name, { voices: this.active.length, backend: backend.name });
    return id;
  }

  /**
   * Voice caps per group, shared by every cue in the group (Trivia: tick 3,
   * babble 1, crowd 1; Banana buses: ladder 2, body 4, ball 2, hazard 2,
   * crowd 1, ui 2). A new voice steals the group's oldest.
   */
  setGroupCaps(caps: Record<string, number>): void {
    for (const [g, n] of Object.entries(caps)) this.groupCaps.set(g, n);
  }

  /** Put a cue in a group at runtime (studio cues come from the library without one). */
  setCueGroup(name: string, group: string): void {
    const def = this.cues.get(name);
    if (def) this.cues.set(name, { ...def, group });
  }

  /**
   * Rez quantization: delay this sound to the next grid point of the bed
   * (16ths by default) when that is at most `maxSnapMs` away. Audio only:
   * never use it for scoring. Core hits stay unquantized.
   */
  playQuantized(name: string, opts: PlayOptions & { subdivision?: number; maxSnapMs?: number; step?: number } = {}): number {
    const clock = this.music.clock();
    const delay = clock ? quantizeDelayMs(clock, this.music.elapsedMs(), opts.subdivision ?? 0.25, opts.maxSnapMs ?? 50) : 0;
    const o = { ...opts, delayMs: (opts.delayMs ?? 0) + delay };
    return opts.step !== undefined ? this.playLadder(name, opts.step, o) : this.play(name, o);
  }

  stop(id: number): void {
    const i = this.active.findIndex((v) => v.id === id);
    if (i < 0) return;
    this.backend?.stop(this.active[i].token);
    this.active.splice(i, 1);
  }

  stopAll(): void {
    this.backend?.stopAll();
    this.active = [];
  }

  private prune(now: number): void {
    this.active = this.active.filter((v) => v.endsAt > now);
  }

  activeVoices(): number {
    this.prune(Date.now());
    return this.active.length;
  }

  setRoute(route: AudioRoute): void {
    if (route === this.route) return;
    this.route = route;
    this.routeListeners.forEach((f) => f(route));
  }

  onRouteChange(f: (r: AudioRoute) => void): () => void {
    this.routeListeners.add(f);
    return () => this.routeListeners.delete(f);
  }

  /** The pan that will actually play (0 on the speaker unless the tester overrides). */
  effectivePan(pan: number): number {
    if (this.panOverride === true) return Math.max(-1, Math.min(1, pan));
    if (this.panOverride === false) return 0;
    return routePan(this.route, pan);
  }

  /** Duck the music bus: attack to -db, hold, release. Deepest duck wins. */
  duck(db: number, attackMs = 60, holdMs = 300, releaseMs = 300): void {
    this.ducks.push({ start: Date.now(), db, a: attackMs, h: holdMs, r: releaseMs });
    if (this.duckTimer) return;
    this.duckTimer = setInterval(() => {
      const now = Date.now();
      this.ducks = this.ducks.filter((d) => now - d.start < d.a + d.h + d.r);
      let g = 1;
      for (const d of this.ducks) g = Math.min(g, duckGainAt(now - d.start, d.db, d.a, d.h, d.r));
      this.music.setDuckGain(g);
      if (this.ducks.length === 0 && this.duckTimer) {
        clearInterval(this.duckTimer);
        this.duckTimer = null;
        this.music.setDuckGain(1);
      }
    }, 30);
  }

  async unloadAll(): Promise<void> {
    this.music.stop(0);
    await this.backend?.unloadAll();
    this.loaded.clear();
    this.active = [];
  }

  // -- Stems: several music decks on one clock (Parade Beat 7.4) ------------
  // Each stem is a music-bus deck; startStems starts them in the same JS
  // tick, so on audio-api they begin on the same render quantum. Decks are
  // independent of the MusicDirector's A/B decks.

  /** Load a stem file (MP3 or WAV decodes on audio-api; AAC falls back to expo-av). */
  async loadStem(key: string, src: number): Promise<boolean> {
    await this.init();
    if (!this.backend) return false;
    if (this.backend.isLoaded(key)) return true;
    return this.backend.load(key, src, 1);
  }

  /** True when every stem decodes on the sample-accurate backend (audio-api). */
  stemsLocked(keys: string[]): boolean {
    const b = this.backend as unknown as { routeOf?: (k: string) => string } | null;
    if (!b || this.backend?.name !== 'audio-api') return false;
    return keys.every((k) => (b.routeOf ? b.routeOf(k) === 'audio-api' : true));
  }

  startStems(decks: { deck: string; key: string; gain: number }[], fromMs: number): void {
    const b = this.backend;
    if (!b) return;
    for (const d of decks) b.musicStart(d.deck, d.key, { gain: d.gain, loop: false, fadeMs: 0, fromMs: Math.max(0, fromMs) });
  }

  stemGain(deck: string, gain: number, rampMs: number): void {
    this.backend?.musicGain(deck, Math.max(0, gain), Math.max(0, rampMs));
  }

  async stemPosition(deck: string): Promise<number> {
    return this.backend ? this.backend.musicPosition(deck) : 0;
  }

  stopStems(decks: string[], fadeMs: number): void {
    for (const d of decks) this.backend?.musicStop(d, fadeMs);
  }
}

// =============================================================================
// MusicDirector
// =============================================================================

export type MusicState = 'open' | 'muffled';

export interface AppMusicBridge {
  /** Pause/fade the app's own background music while a game bed plays. */
  suspend: () => void;
  restore: () => void;
}

export class MusicDirector {
  private current: string | null = null;
  private deck: 'A' | 'B' = 'A';
  private baseGain = 1;
  private duckGain = 1;
  private trimGain = 1;
  private state: MusicState = 'open';
  private paused = false;
  private pausedAt = 0;
  private switchTimer: ReturnType<typeof setTimeout> | null = null;
  private bridge: AppMusicBridge | null = null;
  private suspended = false;
  private startedAt = 0;

  constructor(private engine: GameAudioEngine) {}

  setAppMusicBridge(bridge: AppMusicBridge | null): void {
    this.bridge = bridge;
  }

  get currentBed(): string | null {
    return this.current;
  }

  /** Beat clock of the current bed (for FX sync and quantized cues). */
  clock(): BeatClock | null {
    const def = this.current ? this.engine.bed(this.current) : undefined;
    if (!def || !def.bpm) return null;
    return { bpm: def.bpm, beatsPerBar: def.beatsPerBar ?? 4, offsetMs: def.offsetMs ?? 0 };
  }

  /**
   * Beat map of the current bed: measured beats when the bed carries them,
   * otherwise a constant grid from bpm and offset. Drives FX sync on the UI
   * thread (see useMusicBeat) and beat-quantized cues.
   */
  beatMap(): BeatMap | null {
    const def = this.current ? this.engine.bed(this.current) : undefined;
    if (!def) return null;
    const bpb = def.beatsPerBar ?? 4;
    if (def.beats && def.beats.length >= 2) {
      return { beats: def.beats, beatsPerBar: bpb, downbeat: def.downbeat ?? 0, loopMs: 0 };
    }
    if (!def.bpm) return null;
    const span = def.loopEndMs ?? 120000;
    const count = Math.ceil((span / 60000) * def.bpm) + 2;
    return beatMapFromBpm(def.bpm, def.offsetMs ?? 0, count, bpb, 0);
  }

  /** Is a bed audibly playing (not paused or stopped)? */
  get playing(): boolean {
    return !!this.current && !this.paused;
  }

  /** Playback position in the current bed (ms, file time). */
  async positionMs(): Promise<number> {
    const b = this.engine.backend;
    if (!b || !this.current) return 0;
    if (b.positionIsCheap?.(this.deck)) {
      try {
        return await b.musicPosition(this.deck);
      } catch {
        return this.elapsedMs();
      }
    }
    // expo-av position reads are cached for 2 s and extrapolated in between:
    // each one is a main-thread AVPlayer status call, and a burst of them
    // during a reveal is the pattern that deadlocked AVFoundation (Trivia).
    const now = Date.now();
    const c = this.posCache;
    if (c && c.bed === this.current && now - c.wall < 2000) {
      const def = this.engine.bed(this.current);
      const p = c.pos + (now - c.wall);
      const end = def?.loopEndMs ?? 0;
      const start = def?.loopStartMs ?? 0;
      return end > start && p >= end ? start + ((p - start) % (end - start)) : p;
    }
    try {
      const pos = await b.musicPosition(this.deck);
      this.posCache = { bed: this.current, pos, wall: Date.now() };
      return pos;
    } catch {
      return this.elapsedMs();
    }
  }

  private posCache: { bed: string; pos: number; wall: number } | null = null;

  private gainFor(name: string): number {
    const def = this.engine.bed(name);
    return dbToGain(def?.gainDb ?? 0) * this.engine.busVolume('music');
  }

  refreshGain(rampMs = 120): void {
    if (!this.current) return;
    const b = this.engine.backend;
    if (!b) return;
    const muffle = this.state === 'muffled' && !b.supportsFilter ? dbToGain(-6) : 1;
    b.musicGain(this.deck, this.gainFor(this.current) * this.baseGain * this.duckGain * this.trimGain * muffle, rampMs);
  }

  setDuckGain(g: number): void {
    this.duckGain = g;
    this.refreshGain(30);
  }

  /** A gentle trim (e.g. -3 dB while the line moves). Never stops music. */
  setTrimDb(db: number, rampMs = 300): void {
    this.trimGain = dbToGain(db);
    this.refreshGain(rampMs);
  }

  /** Start a bed now (crossfading from the current one). */
  async play(name: string, fadeMs = 300, fromMs = 0): Promise<void> {
    if (!this.engine.isMusicEnabled()) return;
    const def = this.engine.bed(name);
    if (!def) return;
    await this.engine.preloadBeds([name]);
    const b = this.engine.backend;
    if (!b) return;
    if (!this.suspended) {
      this.bridge?.suspend();
      this.suspended = true;
    }
    const old = this.deck;
    const next = this.current ? (old === 'A' ? 'B' : 'A') : old;
    if (this.current) b.musicStop(old, fadeMs);
    this.deck = next;
    this.current = name;
    this.posCache = null;
    this.paused = false;
    this.startedAt = Date.now() - fromMs;
    const lp = this.state === 'muffled' && !b.supportsFilter && def.lowpassSrc !== undefined;
    b.musicStart(next, lp ? `bed:${name}:lp` : `bed:${name}`, {
      gain: this.gainFor(name) * this.baseGain * this.duckGain * this.trimGain,
      loop: true,
      fadeMs,
      fromMs,
      loopStartMs: def.loopStartMs,
      loopEndMs: def.loopEndMs,
    });
  }

  /**
   * Switch beds on the next beat or bar of the current bed (musical
   * transitions: main -> intense at a level up, -> boss).
   */
  async switchTo(name: string, at: 'now' | 'beat' | 'bar' = 'bar', fadeMs = 300, keepPosition = false): Promise<void> {
    if (this.switchTimer) clearTimeout(this.switchTimer);
    const clock = this.clock();
    const b = this.engine.backend;
    if (at === 'now' || !clock || !b || !this.current) {
      await this.play(name, fadeMs);
      return;
    }
    const pos = await b.musicPosition(this.deck);
    const target = nextGridMs(clock, pos, at === 'bar' ? clock.beatsPerBar : 1, 40);
    const wait = Math.max(0, target - pos - fadeMs / 2);
    // Keep phase: the new bed starts at the same bar position. Stem layers of
    // one mix (same length, sample-aligned) keep the absolute position (Current Quest).
    const loopEnd = this.engine.bed(name)?.loopEndMs ?? 0;
    const from = keepPosition && loopEnd > 0 ? target % loopEnd : barMs(clock) > 0 ? target % barMs(clock) : 0;
    this.switchTimer = setTimeout(() => void this.play(name, fadeMs, from), wait);
  }

  /** Low-pass "muffled" state for breathers, look-ups and pause sheets. */
  setState(state: MusicState, rampMs = 250): void {
    this.state = state;
    const b = this.engine.backend;
    if (!b) return;
    if (b.supportsFilter) b.musicFilter(state === 'muffled' ? 800 : null, rampMs);
    this.refreshGain(rampMs);
  }

  /** Interruption: fade out and remember the position. */
  async pause(fadeMs = 300): Promise<void> {
    const b = this.engine.backend;
    if (!b || !this.current || this.paused) return;
    this.pausedAt = await b.musicPosition(this.deck);
    this.paused = true;
    b.musicStop(this.deck, fadeMs);
  }

  /** Resume from the saved position with a short fade-in. */
  async resume(fadeMs = 200): Promise<void> {
    if (!this.current || !this.paused) return;
    const name = this.current;
    this.current = null;
    await this.play(name, fadeMs, this.pausedAt);
  }

  stop(fadeMs = 400): void {
    if (this.switchTimer) clearTimeout(this.switchTimer);
    const b = this.engine.backend;
    if (b && this.current) b.musicStop(this.deck, fadeMs);
    this.current = null;
    this.paused = false;
    if (this.suspended) {
      this.suspended = false;
      this.bridge?.restore();
    }
  }

  /** ms since the bed started (approximate on expo-av). */
  elapsedMs(): number {
    return this.current ? Date.now() - this.startedAt : 0;
  }
}

/** App-wide singleton. */
export const GameAudio = new GameAudioEngine();
export type { GameAudioEngine };
