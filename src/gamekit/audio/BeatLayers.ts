/**
 * BeatLayers.ts: the look-ahead scheduler that plays core/beatLayers kits on
 * top of the current music bed ("A Tale of Two Clocks": a 25 ms JS tick
 * schedules every hit in the next 150 ms on the audio clock).
 *
 *   const layers = useBeatLayers('whack');                 // or a custom BeatLayerDef[]
 *   layers.setLevel(whackLayerLevel(mult, fever));         // add layers as the combo climbs
 *   layers.setLevel(0);                                    // combo break: layers drop out
 *
 * On audio-api each hit is a sample-accurate start(when) relative to the tick;
 * on expo-av it is a JS timer (about +/-15 ms), still on the grid by ear.
 * The scheduler follows the bed's real position (unwrapped across loops) and
 * re-reads it every tick, so it re-syncs every bar by construction. It stops
 * itself while the bed is paused (holds, backgrounding) and never schedules
 * into a hold.
 */

import { useEffect, useMemo, useRef } from 'react';
import {
  BEAT_LAYER_KITS,
  activeLayers,
  createUnwrap,
  layerHitsBetween,
  unwrapPosition,
  type BeatGrid,
  type BeatLayerDef,
  type BeatLayerKit,
  type UnwrapState,
} from '../core/beatLayers';
import { dbToGain } from '../core/audioMix';
import { GameAudio } from './GameAudio';

export interface BeatLayerOptions {
  /** Schedule this far ahead (ms). Parade Beat: 150. */
  aheadMs?: number;
  /** Tick period (ms). Parade Beat: 25. */
  tickMs?: number;
  /** Extra gain for the whole kit (dB): Whack percussion sits at -24 LUFS short-term. */
  trimDb?: number;
}

export class BeatLayerPlayer {
  private layers: readonly BeatLayerDef[];
  private level = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private scheduledUntil = -1;
  private unwrap: UnwrapState | null = null;
  private bed: string | null = null;
  private busy = false;
  private pending: number[] = [];
  readonly aheadMs: number;
  readonly tickMs: number;
  trimDb: number;
  /** Hits scheduled since start (tests, dev overlay). */
  scheduled = 0;

  constructor(layers: readonly BeatLayerDef[], opts: BeatLayerOptions = {}) {
    this.layers = layers;
    this.aheadMs = opts.aheadMs ?? 150;
    this.tickMs = opts.tickMs ?? 25;
    this.trimDb = opts.trimDb ?? 0;
  }

  get currentLevel(): number {
    return this.level;
  }

  active(): string[] {
    return activeLayers(this.layers, this.level);
  }

  /** Change the level. Dropping a level cancels hits already queued for removed layers. */
  setLevel(level: number): void {
    if (level === this.level) return;
    const dropped = level < this.level;
    this.level = level;
    if (dropped) this.cancelPending();
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.tickMs);
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.cancelPending();
    this.scheduledUntil = -1;
    this.unwrap = null;
    this.bed = null;
  }

  private cancelPending(): void {
    for (const id of this.pending) GameAudio.stop(id);
    this.pending = [];
    // Re-plan from now so a level drop is heard within one tick.
    this.scheduledUntil = -1;
  }

  private grid(): BeatGrid | null {
    const c = GameAudio.music.clock();
    return c ? { bpm: c.bpm, beatsPerBar: c.beatsPerBar, offsetMs: c.offsetMs } : null;
  }

  private async tick(): Promise<void> {
    if (this.busy) return;
    const music = GameAudio.music;
    const bed = music.currentBed;
    if (!bed || !music.playing || this.level <= 0) {
      this.scheduledUntil = -1;
      return;
    }
    const g = this.grid();
    if (!g) return;
    this.busy = true;
    try {
      const pos = await music.positionMs();
      if (bed !== this.bed || !this.unwrap) {
        const def = GameAudio.bed(bed);
        const loop = (def?.loopEndMs ?? 0) - (def?.loopStartMs ?? 0);
        this.unwrap = createUnwrap(loop > 0 ? loop : 0);
        this.bed = bed;
        this.scheduledUntil = -1;
      }
      const now = unwrapPosition(this.unwrap, pos);
      // Never schedule into the past or re-schedule a planned window.
      const from = this.scheduledUntil < 0 || this.scheduledUntil < now - this.tickMs * 4 ? now : this.scheduledUntil;
      const to = now + this.aheadMs;
      if (to <= from) return;
      // Song time is the unwrapped bed position: the studio's loop edits are
      // bar-exact (loop length = whole bars), so the grid continues across a wrap.
      const hits = layerHitsBetween(g, this.layers, this.level, from, to);
      this.pending = this.pending.slice(-32);
      for (const h of hits) {
        const delayMs = Math.max(0, h.atMs - now);
        const id = GameAudio.play(h.cue, { delayMs, volume: dbToGain(h.gainDb + this.trimDb), pitch: h.pitch });
        if (id) this.pending.push(id);
        this.scheduled += 1;
      }
      this.scheduledUntil = to;
    } catch {
      // Decoration only.
    } finally {
      this.busy = false;
    }
  }
}

/**
 * React hook: a BeatLayerPlayer for a kit (or custom layers), started while
 * `active` and stopped on unmount. Call setLevel from your combo events.
 */
export function useBeatLayers(kit: BeatLayerKit | readonly BeatLayerDef[], active = true, opts: BeatLayerOptions = {}): BeatLayerPlayer {
  const layers = typeof kit === 'string' ? BEAT_LAYER_KITS[kit] : kit;
  const player = useMemo(() => new BeatLayerPlayer(layers, opts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layers]);
  const ref = useRef(player);
  ref.current = player;
  useEffect(() => {
    if (active) player.start();
    else player.stop();
    return () => player.stop();
  }, [player, active]);
  return player;
}
