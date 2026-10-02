/**
 * ParadeAudio: Parade Beat rev 7 playback (design rhythm.md 7.3-7.4, 10.2).
 *
 * Four decks rendered offline by tools/rhythm/render_drumline.py start in the
 * same JS tick on the studio engine's audio-api backend (same render quantum):
 *   bed    Chris's song window (the clock)
 *   acc    the Drumline accompaniment (bass drum, snare, fills, count-in
 *          sticks, a crash on every drop line)
 *   guide  a drum voice on every d1 note; gain 1 at d1 and in MARCH
 *          sections, 0 in d2 standing sections (your hits are the drums)
 *   fever  claps and tambourine, faded in for a Fever section
 * Feel (7.3): a MISS mutes the Drumline in 20 ms, holds to the next beat and
 * returns over 1 beat (Guitar Hero); every hit ducks it 3 dB for 120 ms; the
 * Fever inhale ducks bed and Drumline to 0.55 across the rest beat and snaps
 * back on the drop (Thumper).
 *
 * The clock: the bed deck position is a cheap audio-clock read on audio-api;
 * it is sampled every 33 ms and published as an anchor (position, wall time)
 * that the UI thread slews toward, exactly like the old SongPlayer. Without
 * audio-api the decks fall back to expo-av: playable, not locked, so the round
 * counts as practice (7.4) and `locked` is false.
 *
 * Same surface as SongPlayer so RhythmTapGame drives either.
 */

import { GameAudio } from '../../../gamekit';
import type { SongAnchor } from './SongPlayer';

export interface ParadeStems {
  bed: number;
  acc: number;
  guide: number;
  fever: number;
}

type AnchorListener = (a: SongAnchor) => void;

const DECKS = { bed: 'pb_bed', acc: 'pb_acc', guide: 'pb_guide', fever: 'pb_fever' } as const;
const ANCHOR_MS = 33;
const HIT_DUCK = 0.708; // -3 dB
const INHALE = 0.55;

let keyN = 0;

export class ParadeAudio {
  private keys: Record<keyof ParadeStems, string>;
  private listener: AnchorListener | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private loaded = false;
  private disposed = false;
  private gain = 1;
  private guideOn = 1;
  private feverOn = 0;
  private accMuteUntil = 0;
  private duckUntil = 0;
  private inhaling = false;
  private startWall = 0;
  private startPos = 0;
  playing = false;
  locked = false;
  lastAnchor: SongAnchor = { pos: 0, wall: 0, playing: false };

  constructor(private stems: ParadeStems) {
    keyN += 1;
    this.keys = {
      bed: `pb:${keyN}:bed`,
      acc: `pb:${keyN}:acc`,
      guide: `pb:${keyN}:guide`,
      fever: `pb:${keyN}:fever`,
    };
  }

  onAnchor(fn: AnchorListener | null): void {
    this.listener = fn;
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  async load(): Promise<void> {
    const parts = Object.keys(this.keys) as (keyof ParadeStems)[];
    const ok = await Promise.all(parts.map((p) => GameAudio.loadStem(this.keys[p], this.stems[p])));
    if (this.disposed) return;
    this.locked = ok.every(Boolean) && GameAudio.stemsLocked(parts.map((p) => this.keys[p]));
    this.loaded = ok[0];
  }

  // -- gains ------------------------------------------------------------------

  private bedGain(): number {
    return this.gain * (this.inhaling ? INHALE : 1);
  }

  private accGain(now = Date.now()): number {
    if (now < this.accMuteUntil) return 0;
    const duck = now < this.duckUntil ? HIT_DUCK : 1;
    return this.gain * duck * (this.inhaling ? INHALE : 1) * (this.feverOn ? 1.41 : 1);
  }

  private guideGain(now = Date.now()): number {
    if (now < this.accMuteUntil) return 0;
    return this.guideOn * (now < this.duckUntil ? HIT_DUCK : 1);
  }

  private applyAll(rampMs: number): void {
    GameAudio.stemGain(DECKS.bed, this.bedGain(), rampMs);
    GameAudio.stemGain(DECKS.acc, this.accGain(), rampMs);
    GameAudio.stemGain(DECKS.guide, this.guideGain(), rampMs);
    GameAudio.stemGain(DECKS.fever, this.feverOn, rampMs);
  }

  private later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers = this.timers.filter((x) => x !== t);
      if (!this.disposed) fn();
    }, Math.max(0, ms));
    this.timers.push(t);
  }

  // -- transport ----------------------------------------------------------------

  /** Start every deck together at `fromMs` (song time). */
  async play(fromMs = 0): Promise<void> {
    if (!this.loaded) return;
    GameAudio.startStems([
      { deck: DECKS.bed, key: this.keys.bed, gain: this.bedGain() },
      { deck: DECKS.acc, key: this.keys.acc, gain: this.accGain() },
      { deck: DECKS.guide, key: this.keys.guide, gain: this.guideGain() },
      { deck: DECKS.fever, key: this.keys.fever, gain: this.feverOn },
    ], fromMs);
    this.playing = true;
    this.startWall = Date.now();
    this.startPos = Math.max(0, fromMs);
    this.publish(this.startPos);
    if (this.poll) clearInterval(this.poll);
    this.poll = setInterval(() => {
      void GameAudio.stemPosition(DECKS.bed).then((pos) => {
        if (!this.playing) return;
        // expo-av decks report 0 until their first status: fall back to wall time.
        const p = pos > 0 ? pos : this.startPos + (Date.now() - this.startWall);
        this.publish(p);
      });
    }, ANCHOR_MS);
  }

  private publish(pos: number): void {
    const a: SongAnchor = { pos, wall: Date.now(), playing: this.playing };
    this.lastAnchor = a;
    this.listener?.(a);
  }

  async positionMs(): Promise<number> {
    if (!this.playing) return this.lastAnchor.pos;
    const p = await GameAudio.stemPosition(DECKS.bed);
    return p > 0 ? p : this.lastAnchor.pos;
  }

  async pause(): Promise<number> {
    const pos = await this.positionMs();
    this.playing = false;
    this.stopPoll();
    GameAudio.stopStems(Object.values(DECKS), 60);
    this.publish(pos);
    return pos;
  }

  private stopPoll(): void {
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
  }

  // -- feel -------------------------------------------------------------------------

  /** Overall song gain (Pocket Parade 0.35 keeps the clock running quietly). */
  setGain(g: number): void {
    this.gain = Math.max(0, Math.min(1, g));
    this.applyAll(80);
  }

  /** Guide voices on (d1, MARCH sections) or off (d2 standing), on a section line. */
  setGuide(on: boolean, rampMs = 40): void {
    this.guideOn = on ? 1 : 0;
    GameAudio.stemGain(DECKS.guide, this.guideGain(), rampMs);
  }

  /** A MISS: the Drumline drops out for the rest of the beat and comes back over one beat. */
  missMute(msToNextBeat: number, beatMs: number): void {
    const until = Date.now() + Math.max(40, msToNextBeat);
    this.accMuteUntil = Math.max(this.accMuteUntil, until);
    GameAudio.stemGain(DECKS.acc, 0, 20);
    GameAudio.stemGain(DECKS.guide, 0, 20);
    this.later(until - Date.now(), () => {
      if (Date.now() < this.accMuteUntil) return;
      GameAudio.stemGain(DECKS.acc, this.accGain(), beatMs);
      GameAudio.stemGain(DECKS.guide, this.guideGain(), beatMs);
    });
  }

  /** Every player hit: sidechain the Drumline -3 dB for 120 ms. */
  hitDuck(): void {
    const now = Date.now();
    if (now < this.accMuteUntil) return;
    this.duckUntil = now + 120;
    GameAudio.stemGain(DECKS.acc, this.accGain(now), 10);
    GameAudio.stemGain(DECKS.guide, this.guideGain(now), 10);
    this.later(121, () => {
      if (Date.now() < this.duckUntil || Date.now() < this.accMuteUntil) return;
      GameAudio.stemGain(DECKS.acc, this.accGain(), 60);
      GameAudio.stemGain(DECKS.guide, this.guideGain(), 60);
    });
  }

  /**
   * Fever inhale (6.6): bed and Drumline duck to 0.55 over 60 ms at the start
   * of the rest beat (`inMs` from now) and snap back on the drop line.
   */
  inhale(inMs: number, beatMs: number): void {
    this.later(inMs, () => {
      this.inhaling = true;
      this.applyAll(60);
      this.later(beatMs, () => {
        this.inhaling = false;
        this.applyAll(8);
      });
    });
  }

  /** Fever layer and Drumline +3 dB on (drop) or off (section end). */
  setFever(on: boolean, ms: number): void {
    this.feverOn = on ? 1 : 0;
    GameAudio.stemGain(DECKS.fever, this.feverOn, on ? Math.min(ms, 120) : ms);
    GameAudio.stemGain(DECKS.acc, this.accGain(), on ? 8 : ms);
  }

  /** The ride stall: everything falls away fast (decks cannot bend pitch). */
  async tapeStop(ms = 620): Promise<void> {
    GameAudio.stopStems(Object.values(DECKS), ms);
    this.playing = false;
    this.stopPoll();
    await new Promise((r) => setTimeout(r, ms));
  }

  fadeOut(ms = 900): void {
    GameAudio.stopStems(Object.values(DECKS), ms);
    this.later(ms, () => {
      this.playing = false;
      this.stopPoll();
    });
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.listener = null;
    this.stopPoll();
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (this.playing) GameAudio.stopStems(Object.values(DECKS), 0);
    this.playing = false;
    this.loaded = false;
  }
}
