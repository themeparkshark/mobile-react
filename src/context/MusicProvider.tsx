import {createContext, FC, ReactNode, useContext, useState} from 'react';
import { Audio } from 'expo-av';
import {AuthContext} from './AuthProvider';

export interface MusicContextType {
  readonly currentSound: any;
  readonly playMusic: (pendingSound: any) => void;
}

export const MusicContext = createContext<MusicContextType>(
  {} as MusicContextType
);

export const MusicProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [currentSound, setCurrentSound] = useState<any>();
  const { user, isReady } = useContext(AuthContext);

  return (
    <MusicContext.Provider
      value={{
        currentSound,
        playMusic: async (pendingMusic: any) => {
          if (isReady && !user?.enabled_music) {
            return;
          }

          if (currentSound) {
            await currentSound.stopAsync();
            await currentSound.unloadAsync();
            await setCurrentSound(null);
          }

          const { sound } = await Audio.Sound.createAsync(pendingMusic);
          await sound.setIsLoopingAsync(true);
          await sound.playAsync();
          await setCurrentSound(sound);
        },
      }}
    >
      {children}
    </MusicContext.Provider>
  );
};
