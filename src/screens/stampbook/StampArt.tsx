/**
 * Stamp art with a graceful fallback chain: server art, then the bundled
 * passport stamp, never a hole. A locked stamp with no server ghost dims the
 * full-colour art instead.
 */
import { memo, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { FALLBACK_ART, stampArt, type ArtSize } from './art';
import type { BookStamp } from './model';

interface Props {
  readonly stamp: Pick<BookStamp, 'iconUrl' | 'thumbUrl' | 'lockedUrl' | 'lockedThumbUrl' | 'slug' | 'earned' | 'id'>;
  readonly size: ArtSize;
  /** Force the locked (ghost) look, e.g. the colour-bleed base layer. */
  readonly locked?: boolean;
  /** White-tinted copy, used as the alpha-shaped foil sweep. */
  readonly tint?: string;
  readonly placeholder?: string;
  readonly priority?: 'low' | 'normal' | 'high';
  readonly style?: StyleProp<ViewStyle>;
}

function StampArt({ stamp, size, locked = !stamp.earned, tint, placeholder, priority = 'normal', style }: Props) {
  const [failed, setFailed] = useState(false);
  const { source, ghostIsReal } = stampArt(stamp, size, locked);
  const dim = locked && !ghostIsReal && !tint;
  return (
    <View style={[styles.box, style]}>
      {!!placeholder && !tint && <View style={[styles.placeholder, { backgroundColor: placeholder }]} />}
      <Image
        source={failed ? FALLBACK_ART : source}
        style={[StyleSheet.absoluteFill, dim && styles.dim]}
        contentFit="contain"
        tintColor={tint}
        transition={tint ? 0 : 140}
        priority={priority}
        recyclingKey={`${stamp.id}-${size}-${locked ? 'g' : 'c'}${tint ? '-t' : ''}`}
        onError={() => setFailed(true)}
        accessible={false}
      />
    </View>
  );
}

export default memo(StampArt);

const styles = StyleSheet.create({
  box: { width: '100%', height: '100%' },
  placeholder: { position: 'absolute', left: '14%', top: '14%', right: '14%', bottom: '14%', borderRadius: 999, opacity: 0.18 },
  dim: { opacity: 0.38 },
});
