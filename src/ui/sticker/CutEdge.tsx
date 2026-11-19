/**
 * CutEdge: Alex's art with a sharp white cut edge made from his own file (DIRECTION.md fix 8,
 * the yes for the ribbon and the lock). His file is never changed: white tinted copies of the
 * same image sit on a ring under it, and one navy tinted copy below draws the hard drop.
 * Plain images, no blur, no measuring. For one hero piece per screen (a ribbon, the lock),
 * never in list cells.
 */
import { memo } from 'react';
import { Image, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { useStickerPlace } from './StickerContext';
import { ring } from './outline';
import { DROP, INK, RIBBON } from './tokens';

export type CutEdgeProps = {
  readonly source: ImageSourcePropType;
  readonly width: number;
  readonly height: number;
  /** Width of the white edge in pt. */
  readonly edge?: number;
  /** Hard drop under the edge in pt. */
  readonly drop?: number;
  readonly copies?: number;
  readonly style?: StyleProp<ViewStyle>;
};

function CutEdgeImpl({ source, width, height, edge = RIBBON.edge, drop = DROP.label, copies = RIBBON.copies, style }: CutEdgeProps) {
  const { level } = useStickerPlace();
  const offsets = ring(edge, copies);
  const box = { position: 'absolute' as const, width, height };
  return (
    <View style={[{ width, height }, style]} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
      <Image source={source} resizeMode="contain" fadeDuration={0}
        style={[box, { left: 0, top: drop + edge * 0.5, tintColor: level === 'map' ? DROP.map : DROP.color }]} />
      {offsets.map((o, i) => (
        <Image key={i} source={source} resizeMode="contain" fadeDuration={0} style={[box, { left: o.x, top: o.y, tintColor: INK.white }]} />
      ))}
      <Image source={source} resizeMode="contain" fadeDuration={0} style={{ width, height }} />
    </View>
  );
}

const CutEdge = memo(CutEdgeImpl);
export default CutEdge;
