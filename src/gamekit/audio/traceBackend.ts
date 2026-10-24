/**
 * traceBackend.ts: a backend that never makes a sound (wow-sound lane, Oct 24 2026).
 *
 * Used only in trace mode (studioTrace.ts: dev build + EXPO_PUBLIC_STUDIO_TRACE=1).
 * It never loads a file, never opens an audio session and never touches the
 * audio hardware, so a lane simulator stays silent whatever its output route.
 * Everything above it (GameAudio's voice caps, round-robin, ladders, ducks,
 * MusicDirector bed layers) runs for real, and every start is written to the
 * trace with the time it would be heard: call time + delay + the output
 * latency of the backend the phone would use.
 */

import { Asset } from 'expo-asset';
import { AV_ONLY_TYPES, assetType, type AudioBackend, type MusicArgs, type PlayArgs } from './backends';
import { traceEvent } from './studioTrace';

/**
 * Where an asset lives in the repo (Metro's dev path, for example
 * "src/assets/games/audio/shared/sh_ding.wav"), so a trace can be rendered
 * offline into the soundtrack it describes. Metadata only, never the bytes.
 */
export function assetPath(src: unknown): string {
  try {
    const a = Asset.fromModule(src as number) as { name?: string; type?: string; httpServerLocation?: string };
    if (!a?.name) return String(src);
    const dir = (a.httpServerLocation ?? '').replace(/^\/assets\/?/, '').replace(/\?.*$/, '');
    return `${dir ? `${dir}/` : ''}${a.name}.${a.type ?? ''}`;
  } catch {
    return String(src);
  }
}

export class TraceBackend implements AudioBackend {
  readonly name = 'trace' as const;
  readonly supportsPan = true;
  readonly supportsFilter = true;
  /** The latency the phone's backend would add (audio-api 20 ms, expo-av 80 ms). */
  readonly latencyMs: number;
  /** Per key, like HybridBackend: AAC (stingers, beds) would play on expo-av at 80 ms. */
  private latency = new Map<string, number>();
  private loaded = new Set<string>();
  private nextToken = 1;
  private decks = new Map<string, { key: string; startedAt: number }>();
  private readonly t0 = Date.now();

  /** `hybrid`: the phone has react-native-audio-api, so WAV/MP3 play at 20 ms and AAC on expo-av at 80 ms. */
  constructor(private readonly hybrid = true) {
    this.latencyMs = hybrid ? 20 : 80;
  }

  async init(): Promise<void> {
    traceEvent('music', 'trace-backend', `silent, latency ${this.latencyMs} ms`);
  }

  /** Metadata only (the asset's file type, never its bytes): nothing is downloaded or decoded. */
  async load(key: string, src: number): Promise<boolean> {
    this.loaded.add(key);
    this.latency.set(key, this.hybrid && !AV_ONLY_TYPES.has(assetType(src)) ? 20 : 80);
    traceEvent('legacy', 'file', `${key} ${assetPath(src)}`);
    return true;
  }

  latencyOf(key: string): number {
    return this.latency.get(key) ?? this.latencyMs;
  }

  isLoaded(key: string): boolean {
    return this.loaded.has(key);
  }

  play(key: string, args: PlayArgs): number {
    const at = Date.now() + Math.max(0, args.delayMs) + this.latencyOf(key);
    const db = args.gain > 0 ? (20 * Math.log10(args.gain)).toFixed(1) : '-inf';
    const semis = args.rate > 0 ? (12 * Math.log2(args.rate)).toFixed(1) : '0';
    traceEvent('sound', key, `gain ${db} dB, pitch ${semis}`, at);
    return this.nextToken++;
  }

  stop(): void {}

  stopAll(): void {}

  musicStart(deck: string, key: string, args: MusicArgs): void {
    this.decks.set(deck, { key, startedAt: Date.now() - args.fromMs });
    traceEvent('music', `start ${deck}`, `${key} gain ${args.gain.toFixed(2)} fade ${args.fadeMs} from ${args.fromMs}`);
  }

  musicGain(deck: string, gain: number, rampMs: number): void {
    traceEvent('music', `gain ${deck}`, `${gain.toFixed(3)} over ${rampMs} ms`);
  }

  musicStop(deck: string, fadeMs: number): void {
    this.decks.delete(deck);
    traceEvent('music', `stop ${deck}`, `fade ${fadeMs}`);
  }

  async musicPosition(deck: string): Promise<number> {
    const d = this.decks.get(deck);
    return d ? Date.now() - d.startedAt : 0;
  }

  musicFilter(cutoffHz: number | null, rampMs: number): void {
    traceEvent('music', 'filter', `${cutoffHz ?? 'open'} over ${rampMs} ms`);
  }

  setMasterGain(): void {}

  async unloadAll(): Promise<void> {
    this.loaded.clear();
  }

  clockMs(): number {
    return Date.now() - this.t0;
  }

  positionIsCheap(): boolean {
    return true;
  }
}
