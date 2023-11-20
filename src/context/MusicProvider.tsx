import { Audio } from 'expo-av';
import { shuffle } from 'lodash';
import React, { createContext, useCallback, useState } from 'react';

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

  const playTrack = useCallback(
    async (track: Track) => {
      if (soundObject) {
        await soundObject.unloadAsync();
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: track },
        {},
        onPlaybackStatusUpdate
      );
      setSoundObject(sound);
      await sound.playAsync();
    },
    [soundObject]
  );

  const onPlaybackStatusUpdate = useCallback(
    async (status: Audio.AVPlaybackStatus) => {
      if (!status.didJustFinish) {
        return;
      }

      await selectNewTrack();
    },
    []
  );

  const selectNewTrack = useCallback(async () => {
    if (!tracks.length) {
      return;
    }

    let shuffledTracks = shuffle(tracks);
    let newTrack = shuffledTracks[0];
    setCurrentTrack(newTrack);
    await playTrack(newTrack);
  }, [tracks, playTrack]);

  const initializeTracks = useCallback((newTracks: Track[]) => {
    setTracks(newTracks);
  }, []);

  return (
    <MusicContext.Provider
      value={{
        initializeTracks,
      }}
    >
      {children}
    </MusicContext.Provider>
  );
};
