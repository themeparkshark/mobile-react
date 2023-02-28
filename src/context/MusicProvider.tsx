import { Audio } from 'expo-av';
import { createContext, FC, ReactNode, useContext, useState } from 'react';
import { useAsyncEffect } from 'rooks';
import { AuthContext } from './AuthProvider';

export interface MusicContextType {
  readonly currentSound: any;
  readonly playMusic: (pendingSound: any) => void;
}

export const MusicContext = createContext<MusicContextType>(
  {} as MusicContextType
);

export const MusicProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [currentSound, setCurrentSound] = useState<any>();
  const [playingSound, setPlayingSound] = useState<any>();
  const { user, isReady } = useContext(AuthContext);

  useAsyncEffect(async () => {
    if (!currentSound) {
      return;
    }

    if (playingSound) {
      await playingSound.stopAsync();
    }

    const { sound } = await Audio.Sound.createAsync(currentSound);
    await sound.playAsync();
    setPlayingSound(sound);

    return sound
      ? () => {
          sound.unloadAsync();
        }
      : undefined;
  }, [currentSound]);

  return (
    <MusicContext.Provider
      value={{
        currentSound,
        playMusic: async (pendingMusic: any, name: string) => {
          if (isReady && !user?.enabled_music) {
            return;
          }

          setCurrentSound(pendingMusic);
        },
      }}
    >
      {children}
    </MusicContext.Provider>
  );
};
