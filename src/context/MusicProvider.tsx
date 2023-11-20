import { Audio } from 'expo-av';
import { shuffle } from 'lodash';
import React, { createContext, useState } from 'react';
import { useAsyncEffect } from 'rooks';

type Track = string;

interface MusicContextType {
  initializeTracks: (newTracks: Track[]) => void;
}

export const MusicContext = createContext<MusicContextType>(
  {} as MusicContextType
);

export const MusicProvider: React.FC = ({ children }) => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [soundObject, setSoundObject] = useState<Audio.Sound | null>(null);

  const playTrack = async (track: Track) => {
    if (soundObject) {
      await soundObject.unloadAsync();
    }

    const { sound } = await Audio.Sound.createAsync(
      { uri: track },
      {},
      async (status: Audio.AVPlaybackStatus) => {
        if (!status.didJustFinish) {
          return;
        }

        await selectNewTrack();
      }
    );
    setSoundObject(sound);
    await sound.playAsync();
  };

  const selectNewTrack = async () => {
    if (!tracks.length) {
      return;
    }

    const newTrack = shuffle(tracks)[0];

    await playTrack(newTrack);
    setCurrentTrack(currentTrack);
  };

  useAsyncEffect(async () => {
    if (!tracks.length) {
      return;
    }

    //await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    await selectNewTrack();
  }, [tracks]);

  return (
    <MusicContext.Provider
      value={{
        initializeTracks: (newTracks) => {
          setTracks(newTracks);
        },
      }}
    >
      {children}
    </MusicContext.Provider>
  );
};
