import { useEffect, useState } from 'react';
import { Audio } from 'expo-av';

export default function usePlayAudio() {
  const [sound, setSound] = useState<any>();

  async function playSound(audio: string) {
    console.log('Loading Sound');
    const { sound } = await Audio.Sound.createAsync({
      uri: audio,
    });
    setSound(sound);

    console.log('Playing Sound');
    await sound.playAsync();
  }

  useEffect(() => {
    return sound
      ? () => {
          console.log('Unloading Sound');
          sound.unloadAsync();
          setSound(null);
        }
      : undefined;
  }, [sound]);

  return [playSound];
}
