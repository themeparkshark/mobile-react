import {
  createContext,
  FC,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import { Audio } from 'expo-av';
import { AuthContext } from './AuthProvider';

export interface SoundEffectContextType {
  readonly playSound: (pendingSound: any) => void;
}

export const SoundEffectContext = createContext<SoundEffectContextType>(
  {} as SoundEffectContextType
);

export const SoundEffectProvider: FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [sound, setSound] = useState<any>();
  const { user, isReady } = useContext(AuthContext);

  useEffect(() => {
    return sound
      ? () => {
          sound.unloadAsync();
        }
      : undefined;
  }, [sound]);

  return (
    <SoundEffectContext.Provider
      value={{
        playSound: async (pendingSound: any) => {
          if (isReady && !user?.enabled_sound_effects) {
            return;
          }

          const { sound } = await Audio.Sound.createAsync(pendingSound);
          setSound(sound);
          await sound.playAsync();
        },
      }}
    >
      {children}
    </SoundEffectContext.Provider>
  );
};
