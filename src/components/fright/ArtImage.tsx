/**
 * Server-hosted Fin-ister art with a drawn fallback: when the URL is null or
 * the image fails to load, the fallback renders instead. Cached memory-disk.
 */
import { Image, type ImageContentFit } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
import type { StyleProp, ImageStyle } from 'react-native';

export default function ArtImage({ uri, style, fit = 'contain', fallback = null, label }: {
  readonly uri: string | null | undefined;
  readonly style?: StyleProp<ImageStyle>;
  readonly fit?: ImageContentFit;
  readonly fallback?: ReactNode;
  readonly label?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [uri]);
  if (!uri || failed) return <>{fallback}</>;
  return (
    <Image source={{ uri }} style={style} contentFit={fit} cachePolicy="memory-disk" transition={150}
      onError={() => setFailed(true)} accessibilityLabel={label} accessible={!!label} />
  );
}
