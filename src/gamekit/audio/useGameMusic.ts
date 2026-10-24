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

  // The player's Music setting reaches the engine from SoundEffectProvider only; `enabled`
  // gates this game's own bed and never flips the setting for the whole app.
  useEffect(() => {
    GameAudio.music.setAppMusicBridge({
      suspend: () => { try { void app?.stopMusic?.(); } catch { /* app music optional */ } },
      restore: () => { try { void app?.restoreMusic?.(); } catch { /* app music optional */ } },
    });
  }, [app, musicOn]);

  useEffect(() => {
    if (!musicOn && started.current) {
      started.current = false;
      GameAudio.music.stop(400);
    }
    if (!bed || !musicOn) return;
    void GameAudio.init().then(() => {
      if (!started.current) {
        started.current = true;
        return GameAudio.music.play(bed, fadeMs);
      }
      return GameAudio.music.switchTo(bed, at, fadeMs);
    });
  }, [bed, musicOn, at, fadeMs]);

  useEffect(() => () => {
    started.current = false;
    GameAudio.music.stop(400);
  }, []);
}
