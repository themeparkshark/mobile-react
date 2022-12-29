import { createContext, FC, ReactNode, useEffect, useState } from 'react';
import { Audio } from 'expo-av';

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
