/**
 * useMusicBeat: the music's beat position on the UI thread, every frame.
 *
 *   const beat = useMusicBeat(visible);
 *   // worklet: bulbs chase on 8ths, rim pulses on the beat
 *   const lit = useDerivedValue(() => Math.floor(beat.beat.value * 2) % 8);
 *   const pulse = useDerivedValue(() => 1 + 0.08 * Math.max(0, 1 - beat.phase.value * 4));
 *
 * JS re-anchors to the audio backend's reported position every `resyncMs`
 * (the music is master); between anchors the UI thread extrapolates with the
 * wall clock, so FX stay locked without a React render. A small correction
 * slews instead of jumping (<= 2 ms per frame); a big one (seek, bed switch)
 * snaps.
 */

import { useEffect } from 'react';
import { useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { beatIndexAt, type BeatMap } from '../core/beatMap';
import { GameAudio } from './GameAudio';

interface Anchor {
  map: BeatMap | null;
  pos: number;
  wall: number;
  playing: boolean;
}

export interface MusicBeat {
  /** Fractional beat index (0 at the file's first beat). */
  beat: SharedValue<number>;
  /** 0-1 phase inside the current beat. */
  phase: SharedValue<number>;
  /** Extrapolated playback position (ms). */
  positionMs: SharedValue<number>;
}

export function useMusicBeat(active = true, resyncMs = 500): MusicBeat {
  const anchor = useSharedValue<Anchor>({ map: null, pos: 0, wall: 0, playing: false });
  const beat = useSharedValue(0);
  const phase = useSharedValue(0);
  const positionMs = useSharedValue(0);
  const lastWall = useSharedValue(0);

  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    const sync = async () => {
      const m = GameAudio.music;
      const map = m.beatMap();
      const playing = m.playing && !!map;
      const pos = playing ? await m.positionMs() : 0;
      if (!alive) return;
      anchor.value = { map, pos, wall: Date.now(), playing };
    };
    void sync();
    const iv = setInterval(() => void sync(), resyncMs);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [active, resyncMs, anchor]);

  useFrameCallback(() => {
    'worklet';
    const a = anchor.value;
    const now = Date.now();
    if (!a.playing || !a.map) {
      lastWall.value = now;
      return;
    }
    const target = a.pos + (now - a.wall);
    const predicted = positionMs.value + (now - lastWall.value);
    lastWall.value = now;
    const err = target - predicted;
    // Snap on a seek or bed switch; otherwise slew at most 2 ms per frame.
    positionMs.value = Math.abs(err) > 80 ? target : predicted + Math.max(-2, Math.min(2, err));
    const f = beatIndexAt(a.map, positionMs.value);
    beat.value = f;
    phase.value = f - Math.floor(f);
  }, active);

  return { beat, phase, positionMs };
}
