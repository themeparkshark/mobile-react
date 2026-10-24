/**
 * useGameMusic: play a game bed through the MusicDirector while the game is
 * on screen, handing the app's own music rotation off and back cleanly.
 *
 *   useGameMusic(fever ? 'mus_whack_fever' : 'mus_whack_main', { at: 'bar' });
 *   useGameMusic('chris.track1');
 *
 * Respects the player's music setting. Changing `bed` switches on the next
 * bar (or beat / now). Unmount fades out and restores the app rotation.
 */

import { useContext, useEffect, useRef } from 'react';
import { AuthContext } from '../../context/AuthProvider';
import { MusicContext } from '../../context/MusicProvider';
import { GameAudio } from './GameAudio';
import { usePowerBudget } from '../../power/PowerProvider';

export interface GameMusicOptions {
  at?: 'now' | 'beat' | 'bar';
  fadeMs?: number;
  /** Master switch (e.g. false in Reduced Audio / muted rooms). */
  enabled?: boolean;
}

export function useGameMusic(bed: string | null, { at = 'bar', fadeMs = 300, enabled = true }: GameMusicOptions = {}): void {
  const app = useContext(MusicContext);
  const { player } = useContext(AuthContext);
  const musicOn = enabled && player?.enabled_music !== false;
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
        return GameAudio.music.play(bed, fadeMs);
      }
      return GameAudio.music.switchTo(bed, at, fadeMs);
    });
  }, [bed, musicOn, at, fadeMs]);

  // Battery Saver and no touch for 2 minutes: the bed fades out (it is decoration) and comes back
  // from the same spot on the next touch. Only a bed this hook paused is resumed, so a game's own
  // pause sheet or hold is never undone. Walking (-3 dB) and the background fade live in GameShellV2.
  const power = usePowerBudget();
  const rest = power.lowPower && power.idle;
  const restPaused = useRef(false);
  useEffect(() => {
    if (rest) {
      if (GameAudio.music.playing) {
        restPaused.current = true;
        void GameAudio.music.pause(400);
      }
    } else if (restPaused.current) {
      restPaused.current = false;
      void GameAudio.music.resume(300);
    }
  }, [rest]);

  useEffect(() => () => {
    started.current = false;
    GameAudio.music.stop(400);
  }, []);
}
