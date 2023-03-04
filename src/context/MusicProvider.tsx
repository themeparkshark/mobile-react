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
    if (isReady && !user?.enabled_music && playingSound) {
      setCurrentSound(null);
      await playingSound.stopAsync();
      setPlayingSound(null);
    }
  }, [isReady, user?.enabled_music, playingSound]);

  useAsyncEffect(async () => {
    if (!currentSound || !user?.enabled_music) {
      return;
    }

    if (playingSound) {
      await playingSound.stopAsync();
    }

    const { sound } = await Audio.Sound.createAsync(currentSound);
    await sound.playAsync();
    await sound.setIsLoopingAsync(true);
    setPlayingSound(sound);

    return sound
      ? () => {
          sound.unloadAsync();
        }
      : undefined;
  }, [currentSound, user?.enabled_music]);

  return (
    <MusicContext.Provider
      value={{
        currentSound,
        playMusic: async (pendingMusic: any) => {
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
