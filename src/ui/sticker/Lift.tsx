/**
 * Alex's art with its hard drop: a navy silhouette of the same file, straight down, no blur
 * (kit.css .lift / .lift-map). Server art (coins, pins) gets no white edge at run time.
 */
import { memo } from 'react';
import { Image, View, type ImageSourcePropType, type StyleProp } from 'react-native';
import type { LayoutStyle } from './style';
import { useStickerPlace } from './StickerContext';
import { DROP } from './tokens';

export type LiftProps = {
  readonly source: ImageSourcePropType;
  readonly width: number;
  readonly height: number;
  /** Mirror left to right (Alex's right arrow used as back). */
  readonly mirror?: boolean;
  /** No drop (a ghost in a spot). */
  readonly flat?: boolean;
  readonly opacity?: number;
  readonly style?: StyleProp<LayoutStyle>;
};

function LiftImpl({ source, width, height, mirror = false, flat = false, opacity = 1, style }: LiftProps) {
  const { level } = useStickerPlace();
  const onMap = level === 'map';
  const flip = mirror ? [{ scaleX: -1 }] : [];
  return (
    <View style={[{ width, height }, style]} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
      {!flat && (
        <Image source={source} resizeMode="contain" fadeDuration={0}
          style={{ position: 'absolute', width, height, tintColor: onMap ? DROP.map : DROP.color,
            transform: [{ translateY: onMap ? DROP.artOnMap : DROP.art }, ...flip] }} />
      )}
      <Image source={source} resizeMode="contain" fadeDuration={0} style={{ width, height, opacity, transform: flip }} />
    </View>
  );
}

const Lift = memo(LiftImpl);
export default Lift;
