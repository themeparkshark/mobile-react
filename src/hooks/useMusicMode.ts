import { useContext, useEffect } from 'react';
import { MusicContext, MusicMode } from '../context/MusicProvider';

/**
 * Switches music mode when a screen mounts, and reverts to 'home' on unmount.
 */
export default function useMusicMode(mode: MusicMode) {
  const { switchMode } = useContext(MusicContext);

  useEffect(() => {
    switchMode(mode);
    return () => {
      switchMode('home');
    };
  }, [mode]);
}
