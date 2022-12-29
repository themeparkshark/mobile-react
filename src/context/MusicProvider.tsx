import { createContext, FC, ReactNode, useEffect, useState } from 'react';
import { Audio } from 'expo-av';

export interface MusicContextType {
  readonly playMusic: (pendingSound: any) => void;
}

export const MusicContext = createContext<MusicContextType>(
  {} as MusicContextType
);

export const MusicProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [currentSound, setCurrentSound] = useState<any>();

  const stopMusic = async () => {
    await currentSound.stopAsync();
    setCurrentSound(null);
  };

  useEffect(() => {
    (async () => {
      if (currentSound) {
        currentSound.setOnPlaybackStatusUpdate((status) => {
          // @ts-ignore
          if (status.didJustFinish) {
            currentSound.unloadAsync();
          }
        });
        await currentSound.playAsync();
      }
    })();
  }, [currentSound]);

  return (
    <MusicContext.Provider
      value={{
        playMusic: async (pendingMusic: any) => {
          if (currentSound) {
            await stopMusic();
          }

          const { sound } = await Audio.Sound.createAsync(pendingMusic);
          setCurrentSound(sound);
        },
      }}
    >
      {children}
    </MusicContext.Provider>
  );
};
