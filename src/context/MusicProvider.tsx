import { Audio } from 'expo-av';
import { shuffle } from 'lodash';
import React, { createContext, useContext, useState } from 'react';
import { useAsyncEffect } from 'rooks';
import { AuthContext } from './AuthProvider';

type Track = string;

interface MusicContextType {
  initializeTracks: (newTracks: Track[]) => void;
}

export const MusicContext = createContext<MusicContextType>(
  {} as MusicContextType
);

export const MusicProvider: React.FC = ({ children }) => {
  const { player } = useContext(AuthContext);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [soundObject, setSoundObject] = useState<Audio.Sound | null>(null);

  useAsyncEffect(async () => {
    if (!player?.enabled_music) {
      await soundObject?.stopAsync();
    } else if (!currentTrack) {
      await selectNewTrack();
    }
  }, [player?.enabled_music]);

  const playTrack = async (track: Track) => {
    if (player && !player?.enabled_music) {
      return;
    }

    setCurrentTrack(currentTrack);

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
  };

  useAsyncEffect(async () => {
    if (!tracks.length) {
      return;
    }

    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
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
