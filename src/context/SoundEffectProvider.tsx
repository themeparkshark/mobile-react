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

export interface SoundEffectContextType {
  readonly playSound: (pendingSound: any, options?: { volume?: number; rate?: number }) => void;
}

export const SoundEffectContext = createContext<SoundEffectContextType>(
  {} as SoundEffectContextType
);

export const SoundEffectProvider: FC<{ children: ReactNode }> = ({
  children,
}) => {
  const activeSounds = useRef<Set<Audio.Sound>>(new Set());
  const mounted = useRef(true);
  const { player, isReady } = useContext(AuthContext);

  useEffect(() => {
    SFX.setEnabled(!(isReady && !player?.enabled_sound_effects));
  }, [isReady, player?.enabled_sound_effects]);

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
          if (isReady && !player?.enabled_sound_effects) {
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
