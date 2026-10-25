import { Audio } from 'expo-av';
import {
  createContext,
  FC,
  ReactNode,
  useContext,
  useEffect,
  useRef,
} from 'react';
import { AuthContext } from './AuthProvider';
import { SFX } from '../gamekit/SFX';
import { loadStudioSoundFlag } from '../gamekit/audio/studioSwitch';
import { studioTraceOn, traceEvent } from '../gamekit/audio/studioTrace';
import getFeatureFlags from '../api/endpoints/platform/feature-flags';
import { QUIET_CAPTURE, sfxAllowed } from './sfxPolicy';

export interface SoundEffectContextType {
  readonly playSound: (pendingSound: any, options?: { volume?: number; rate?: number }) => void;
}

// Nothing starts the audio engine before the player's sound settings load: a muted player
// never gets an audio session, even in the moment before sign-in finishes.
SFX.holdUntilSettings();

export const SoundEffectContext = createContext<SoundEffectContextType>(
  {} as SoundEffectContextType
);

export const SoundEffectProvider: FC<{ children: ReactNode }> = ({
  children,
}) => {
  const activeSounds = useRef<Set<Audio.Sound>>(new Set());
  const mounted = useRef(true);
  const { player, isReady } = useContext(AuthContext);
  // Guests hear the game too; signed-in players follow their setting (sfxPolicy).
  const allowed = sfxAllowed({ isReady, signedIn: !!player, playerSetting: player?.enabled_sound_effects, quietCapture: QUIET_CAPTURE });

  useEffect(() => {
    SFX.setEnabled(allowed);
  }, [allowed]);
  // Game music follows the player's Music setting too, by the same rule as sound effects
  // (a guest hears it; dev captures stay quiet), so a player with both off never starts the
  // audio engine (GameAudio.wantsAudio). This provider is the only writer of the Music
  // setting into the engine; each game's useGameMusic gates only its own bed.
  const musicAllowed = sfxAllowed({ isReady, signedIn: !!player, playerSetting: player?.enabled_music, quietCapture: QUIET_CAPTURE });
  useEffect(() => {
    SFX.setMusicEnabled(musicAllowed);
  }, [musicAllowed]);
  useEffect(() => {
    if (isReady) SFX.settingsKnown();
  }, [isReady]);

  // Studio sound switch (wow-sound): reads the `studio_sound` flag once the player's settings are in
  // (STUDIO_SOUND_DEFAULT is on since Dustin's yes, Oct 24).
  useEffect(() => {
    if (isReady) void loadStudioSoundFlag(getFeatureFlags);
  }, [isReady]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const sound of activeSounds.current) {
        sound.setOnPlaybackStatusUpdate(null);
        void sound.unloadAsync().catch(() => undefined);
      }
      activeSounds.current.clear();
    };
  }, []);

  const releaseSound = (sound: Audio.Sound) => {
    if (!activeSounds.current.delete(sound)) return;
    sound.setOnPlaybackStatusUpdate(null);
    void sound.unloadAsync().catch(() => undefined);
  };

  return (
    <SoundEffectContext.Provider
      value={{
        playSound: async (pendingSound: any, options?: { volume?: number; rate?: number }) => {
          if (studioTraceOn()) {
            // Silent trace (dev lanes): log the legacy sound, never open an expo-av player.
            // Lazy: the trace backend (and expo-asset) loads only in a dev trace build.
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { assetPath } = require('../gamekit/audio/traceBackend') as typeof import('../gamekit/audio/traceBackend');
            traceEvent('legacy', 'playSound', `asset ${assetPath(pendingSound)}${options?.volume !== undefined ? ` vol ${options.volume}` : ''}`);
            return;
          }
          if (!allowed) {
            return;
          }
          let sound: Audio.Sound | undefined;
          try {
            ({ sound } = await Audio.Sound.createAsync(pendingSound, options));
            if (!mounted.current) {
              void sound.unloadAsync().catch(() => undefined);
              return;
            }
            activeSounds.current.add(sound);
            // Keep a few simultaneous cues so a quick tap does not cut off a
            // reward jingle, but never retain an unbounded pile of sounds.
            if (activeSounds.current.size > 4) {
              const oldest = activeSounds.current.values().next().value;
              if (oldest && oldest !== sound) releaseSound(oldest);
            }
            sound.setOnPlaybackStatusUpdate(status => {
              if (status.isLoaded && status.didJustFinish && sound) releaseSound(sound);
            });
            await sound.playAsync();
          } catch (error) {
            if (sound) releaseSound(sound);
            console.warn('Sound effect could not play:', error);
          }
        },
      }}
    >
      {children}
    </SoundEffectContext.Provider>
  );
};
