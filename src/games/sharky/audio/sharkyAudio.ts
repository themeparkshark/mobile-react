/**
 * Sharky audio (design v7.1 section 8): the extra studio cues that live in
 * subfolders (in-key coin ladders and their octave-up Frenzy sets, the graze
 * loop steps, the Doppler pass bands, the Gate Bonus tiers) and the
 * muffled / open / lift music states, plus the music-state director.
 *
 * Every studio cue is a candidate until Dustin approves it by ear, so they are
 * registered in __DEV__ only; release builds play Chris's sounds through the
 * fallback chain in sharkyFeel (cue(...) picks the first registered name).
 */

import { useContext, useEffect, useRef } from 'react';
import { AuthContext } from '../../../context/AuthProvider';
import { MusicContext } from '../../../context/MusicProvider';
import { GameAudio } from '../../../gamekit/audio/GameAudio';
import type { BedDef, CueDef } from '../../../gamekit/audio/chrisBank';
import { fallbackFor } from '../../../gamekit/audio/studioLibrary';

let registered = false;

export function registerSharkyAudio(): void {
  if (registered) return;
  registered = true;
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const gen = require('./sharkyAudio.dev.generated') as { SHARKY_EXTRA_CUES: Record<string, CueDef>; SHARKY_EXTRA_BEDS: Record<string, BedDef> };
  const cues: Record<string, CueDef> = {};
  Object.keys(gen.SHARKY_EXTRA_CUES).forEach((id) => {
    const def = gen.SHARKY_EXTRA_CUES[id];
    cues[id] = { ...def, fallback: def.fallback ?? fallbackFor(id) };
  });
  GameAudio.registerCues(cues);
  GameAudio.registerBeds(gen.SHARKY_EXTRA_BEDS);
}

/** Music state (design 8.5): muffled when deep or resting, open, lift in Frenzy and Overdrive. */
export type SharkyMusicState = 'muffled' | 'open' | 'lift';

/** The bed for a key variant ('', '_p2', '_p4') and state, falling back to what exists. */
export function sharkyBed(key: string, state: SharkyMusicState, frenzy: boolean): string {
  const want = state === 'open' ? (frenzy ? `sharky_frenzy_loop${key}` : `sharky_loop${key}`) : `sharky_loop${key}_${state}`;
  const chain = [want, `sharky_loop${key}`, 'sharky_loop', 'chris.track3'];
  for (const b of chain) if (GameAudio.bed?.(b)) return b;
  return 'chris.track3';
}

/**
 * Music director: plays the run's bed through the MusicDirector, keeps the
 * position when only the state changes (the state files are sample-aligned
 * edits of one loop), and snaps key changes and Frenzy to the bar.
 */
export function useSharkyMusic(bed: string | null, stateChange: boolean): void {
  const app = useContext(MusicContext);
  const { player } = useContext(AuthContext);
  const musicOn = player?.enabled_music !== false;
  const started = useRef(false);
  useEffect(() => {
    GameAudio.setMusicEnabled(musicOn);
    GameAudio.music.setAppMusicBridge({
      suspend: () => { try { void app?.stopMusic?.(); } catch { /* app music optional */ } },
      restore: () => { try { void app?.restoreMusic?.(); } catch { /* app music optional */ } },
    });
  }, [app, musicOn]);
  useEffect(() => {
    if (!bed || !musicOn) return;
    void GameAudio.init().then(() => {
      if (!started.current) {
        started.current = true;
        return GameAudio.music.play(bed, 250);
      }
      // State changes keep the absolute position (150-250ms equal-power crossfade);
      // key and Frenzy edits land on the next bar.
      return stateChange ? GameAudio.music.switchTo(bed, 'beat', 180, true) : GameAudio.music.switchTo(bed, 'bar', 250);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bed, musicOn]);
  useEffect(() => () => {
    started.current = false;
    GameAudio.music.stop(400);
  }, []);
}
