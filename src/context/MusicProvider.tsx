import { Audio } from 'expo-av';
import React, { createContext, useCallback, useContext, useRef } from 'react';
import { useAsyncEffect } from 'rooks';
import { AuthContext } from './AuthProvider';

const TRACKS = [
  require('../../assets/music/track-1.mp3'), // Login
  require('../../assets/music/track-2.mp3'), // Theme Park Waiting Room FINAL
  require('../../assets/music/track-3.mp3'), // Shark Shop v2 Longer
];

const LOGIN_TRACK = require('../../assets/music/login.m4a');
const CROSSFADE_MS = 500;
const CROSSFADE_STEPS = 10;

interface MusicContextType {
  initializeTracks: (newTracks: string[]) => void;
  overrideTrack: (track: any) => void;
  restoreMusic: () => void;
  stopMusic: () => void;
}

export const MusicContext = createContext<MusicContextType>(
  {} as MusicContextType
);

function pickRandom(lastIndex: number): number {
  if (TRACKS.length <= 1) return 0;
  let next: number;
  do {
    next = Math.floor(Math.random() * TRACKS.length);
  } while (next === lastIndex);
  return next;
}

export const MusicProvider: React.FC = ({ children }) => {
  const { player } = useContext(AuthContext);
  const soundRef = useRef<Audio.Sound | null>(null);
  const isPlayingRef = useRef(false);
  const initializedRef = useRef(false);
  const lastTrackRef = useRef(-1);
  const overrideRef = useRef(false);
  const loginMusicRef = useRef(false); // true when login music is playing
  // Mutex: serializes all music operations so two concurrent calls
  // can never both create Sound objects (the double-music bug).
  const lockRef = useRef<Promise<void>>(Promise.resolve());

  /** Run `fn` exclusively — if another operation is in progress, wait for it first. */
  const withLock = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    let resolve: () => void;
    const prev = lockRef.current;
    lockRef.current = new Promise<void>((r) => { resolve = r; });
    return prev.then(fn).finally(() => resolve!());
  }, []);

  const fadeOut = async (sound: Audio.Sound): Promise<void> => {
    const stepMs = CROSSFADE_MS / CROSSFADE_STEPS;
    for (let i = CROSSFADE_STEPS; i >= 0; i--) {
      try {
        await sound.setVolumeAsync(i / CROSSFADE_STEPS);
        await new Promise((r) => setTimeout(r, stepMs));
      } catch {
        break;
      }
    }
    try {
      await sound.stopAsync();
      await sound.unloadAsync();
    } catch {}
  };

  const fadeIn = async (sound: Audio.Sound): Promise<void> => {
    await sound.setVolumeAsync(0);
    await sound.playAsync();
    const stepMs = CROSSFADE_MS / CROSSFADE_STEPS;
    for (let i = 1; i <= CROSSFADE_STEPS; i++) {
      try {
        await sound.setVolumeAsync(i / CROSSFADE_STEPS);
        await new Promise((r) => setTimeout(r, stepMs));
      } catch {
        break;
      }
    }
  };

  /** Stop + unload whatever is currently in soundRef. Must be called inside withLock. */
  const cleanup = async (fade = false) => {
    const s = soundRef.current;
    soundRef.current = null;
    if (!s) return;
    if (fade) {
      await fadeOut(s);
    } else {
      try { await s.stopAsync(); } catch {}
      try { await s.unloadAsync(); } catch {}
    }
  };

  const playNext = useCallback(() => withLock(async () => {
    if (!player || !player.enabled_music) return;
    if (overrideRef.current) return;
    if (loginMusicRef.current) return;

    await cleanup(false);

    const index = pickRandom(lastTrackRef.current);
    lastTrackRef.current = index;
    isPlayingRef.current = true;

    try {
      const { sound } = await Audio.Sound.createAsync(
        TRACKS[index],
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded && status.didJustFinish) {
            playNext();
          }
        }
      );
      // Double-check nothing else took over while we were loading
      if (soundRef.current !== null) {
        // Another operation won the race — discard this sound
        try { await sound.stopAsync(); } catch {}
        try { await sound.unloadAsync(); } catch {}
        return;
      }
      soundRef.current = sound;
    } catch (e) {
      console.warn('Music playback error:', e);
      isPlayingRef.current = false;
    }
  }), [player, withLock]);

  const startMusic = useCallback(async () => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    // Crossfade from login music (if playing) to game rotation
    await withLock(async () => {
      await cleanup(true);
      isPlayingRef.current = false;
    });
    await playNext();
  }, [playNext, withLock]);

  // Override: crossfade to a specific track on loop
  const overrideTrack = useCallback((track: any) => withLock(async () => {
    if (player && !player.enabled_music) return;

    overrideRef.current = true;
    await cleanup(true);
    isPlayingRef.current = true;

    try {
      const { sound } = await Audio.Sound.createAsync(
        track,
        { isLooping: true }
      );
      soundRef.current = sound;
      await fadeIn(sound);
    } catch (e) {
      console.warn('Music override error:', e);
      isPlayingRef.current = false;
    }
  }), [player, withLock]);

  // Restore: crossfade back to normal rotation
  const restoreMusic = useCallback(() => withLock(async () => {
    overrideRef.current = false;
    await cleanup(true);
    isPlayingRef.current = false;

    if (player?.enabled_music) {
      const index = pickRandom(lastTrackRef.current);
      lastTrackRef.current = index;
      isPlayingRef.current = true;

      try {
        const { sound } = await Audio.Sound.createAsync(
          TRACKS[index],
          {},
          (status) => {
            if (status.isLoaded && status.didJustFinish) {
              playNext();
            }
          }
        );
        soundRef.current = sound;
        await fadeIn(sound);
      } catch (e) {
        console.warn('Music restore error:', e);
        isPlayingRef.current = false;
      }
    }
  }), [player, playNext, withLock]);

  // Play login music when no player, crossfade to rotation when player logs in
  // Entire body wrapped in try/catch to prevent Hermes Error.stack crash
  useAsyncEffect(async () => {
    try {
      if (!player) {
        // Guard: if already playing/starting login music, don't double-start
        if (loginMusicRef.current) return;
        loginMusicRef.current = true; // Claim immediately before any await
        overrideRef.current = false;
        initializedRef.current = false;

        // Fade out current game music if any
        const s = soundRef.current;
        soundRef.current = null;
        if (s) {
          const stepMs = CROSSFADE_MS / CROSSFADE_STEPS;
          for (let i = CROSSFADE_STEPS; i >= 0; i--) {
            try { await s.setVolumeAsync(i / CROSSFADE_STEPS); } catch { break; }
            await new Promise(r => setTimeout(r, stepMs));
          }
          try { await s.stopAsync(); } catch {}
          try { await s.unloadAsync(); } catch {}
        }

        // Start login music
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync(LOGIN_TRACK, {
          isLooping: true,
          volume: 0,
          shouldPlay: true,
        });
        soundRef.current = sound;
        isPlayingRef.current = true;
        const stepMs = CROSSFADE_MS / CROSSFADE_STEPS;
        for (let i = 1; i <= CROSSFADE_STEPS; i++) {
          try { await sound.setVolumeAsync(i / CROSSFADE_STEPS); } catch { break; }
          await new Promise(r => setTimeout(r, stepMs));
        }
        return;
      }

      if (!player.enabled_music) {
        loginMusicRef.current = false;
        await withLock(async () => {
          await cleanup(false);
          isPlayingRef.current = false;
        });
      } else if (loginMusicRef.current || !isPlayingRef.current) {
        loginMusicRef.current = false;
        if (!initializedRef.current) {
          await startMusic();
        } else if (!overrideRef.current) {
          await playNext();
        }
      }
    } catch (e) {
      console.warn('Music state error (suppressed):', e);
    }
  }, [player, player?.enabled_music]);

  // Full stop: fade out and reset so music can re-initialize later
  const stopMusic = useCallback(() => withLock(async () => {
    overrideRef.current = false;
    await cleanup(true);
    isPlayingRef.current = false;
    initializedRef.current = false;
  }), [withLock]);

  const initializeTracks = useCallback((_: string[]) => {
    if (!initializedRef.current && player?.enabled_music) {
      startMusic();
    }
  }, [player, startMusic]);

  return (
    <MusicContext.Provider value={{ initializeTracks, overrideTrack, restoreMusic, stopMusic }}>
      {children}
    </MusicContext.Provider>
  );
};
