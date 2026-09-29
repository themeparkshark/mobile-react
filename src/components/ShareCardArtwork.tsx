import { Image, type ImageProps } from 'expo-image';
import { useEffect, useState } from 'react';

/** A share card waits for rendered artwork; slow remote art gets a themed fallback. */
export default function ShareCardArtwork({ artworkKey, onReady, fallback, ...props }: ImageProps & {
  readonly artworkKey: string;
  readonly onReady: (key: string) => void;
  readonly fallback?: number;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!fallback || failed || loaded) return;
    const timer = setTimeout(() => setFailed(true), 4000);
    return () => clearTimeout(timer);
  }, [artworkKey, fallback, failed, loaded]);
  return <Image {...props} source={failed && fallback ? fallback : props.source}
    onLoad={() => { setLoaded(true); onReady(artworkKey); }} onError={() => setFailed(true)} />;
}
