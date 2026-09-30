/**
 * <GameIcon name="ticket" size={24} /> (WS0 UI kit)
 *
 * One icon set for the whole game, so no screen needs an emoji, a dingbat or a
 * bracket code. Raster icons reuse the existing repo art players already know;
 * vector icons are hand-drawn in src/ui/gameIconArt.ts in the same style
 * (thick navy outline, brand fills).
 *
 * Icons are decorative by default (hidden from VoiceOver). Pass
 * accessibilityLabel when the icon carries meaning on its own.
 * Pass `mono` to paint a vector icon as a single-colour silhouette, for
 * example a white glyph on a gold button. Raster icons are tinted instead.
 */
import { memo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { BRAND, FONT } from './tokens';
import { ICON_GRID, VECTOR_ICONS, outlineWidth, type IconShape, type VectorIcon, type VectorIconName } from './gameIconArt';
import { GAME_ICON_NAMES, isGameIconName, isRasterIconName, type GameIconName, type RasterIconName } from './iconNames';

export const RASTER_ICONS: Record<RasterIconName, number> = {
  energy: require('../../assets/images/energy.png'),
  ticket: require('../../assets/images/ticket-icon.png'),
  coin: require('../../assets/images/coingold.png'),
  crown: require('../../assets/images/screens/leaderboard/crown-gold.png'),
  swords: require('../../assets/images/sword-icon.png'),
  star: require('../../assets/images/screens/pin-collections/star.png'),
};

export { GAME_ICON_NAMES, isGameIconName };
export type { GameIconName, RasterIconName };

export type GameIconProps = {
  readonly name: GameIconName;
  readonly size?: number;
  readonly mono?: string;
  readonly accessibilityLabel?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
};

type Override = { fill?: string; stroke?: string; width?: number; opacity?: number; dash?: readonly number[] | null };

function paint(shape: IconShape, override: Override = {}) {
  const fill = override.fill ?? shape.fill;
  const stroke = override.stroke ?? shape.stroke;
  const dash = override.dash === null ? undefined : override.dash ?? shape.dash;
  return {
    fill: fill ?? 'none',
    stroke,
    strokeWidth: stroke ? override.width ?? shape.width ?? 2 : undefined,
    strokeLinecap: stroke ? shape.cap ?? 'round' : undefined,
    strokeLinejoin: stroke ? 'round' as const : undefined,
    strokeDasharray: dash ? [...dash] : undefined,
    opacity: override.opacity ?? shape.opacity,
  };
}

function renderShape(shape: IconShape, key: string, override?: Override) {
  const props = paint(shape, override);
  let node;
  switch (shape.kind) {
    case 'path': node = <Path key={key} d={shape.d} {...props} />; break;
    case 'circle': node = <Circle key={key} cx={shape.cx} cy={shape.cy} r={shape.r} {...props} />; break;
    case 'rect': node = <Rect key={key} x={shape.x} y={shape.y} width={shape.w} height={shape.h}
      rx={shape.rx ?? 0} ry={shape.rx ?? 0} {...props} />; break;
    case 'text': node = <SvgText key={key} x={shape.x} y={shape.y} fontSize={shape.size} fontFamily={FONT.display}
      textAnchor="middle" {...props}>{shape.text}</SvgText>; break;
  }
  return shape.transform ? <G key={key} transform={shape.transform}>{node}</G> : node;
}

/** Layers for a vector icon: navy outline pass, fill pass, then details. */
export function vectorLayers(name: VectorIconName, mono?: string) {
  const icon: VectorIcon = VECTOR_ICONS[name];
  const outline = mono ?? BRAND.navy;
  const layers = icon.silhouette.map((shape, i) => renderShape(shape, `o${i}`, shape.fill
    ? { fill: outline, stroke: outline, width: outlineWidth(shape), opacity: 1, dash: null }
    : { stroke: outline, width: outlineWidth(shape), opacity: 1, dash: null }));
  if (mono) return layers;
  return [
    ...layers,
    ...icon.silhouette.map((shape, i) => renderShape(shape, `f${i}`)),
    ...(icon.detail ?? []).map((shape, i) => renderShape(shape, `d${i}`)),
  ];
}

function GameIcon({ name, size = 24, mono, accessibilityLabel, style, testID }: GameIconProps) {
  const a11y = accessibilityLabel
    ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel }
    : { accessible: false, importantForAccessibility: 'no-hide-descendants' as const };
  const box = [{ width: size, height: size }, style];
  if (isRasterIconName(name)) {
    return <View {...a11y} testID={testID} pointerEvents="none" style={box}>
      <Image source={RASTER_ICONS[name]} contentFit="contain"
        tintColor={mono} style={{ width: size, height: size }} />
    </View>;
  }
  if (!isGameIconName(name)) return <View style={box} />;
  return <View {...a11y} testID={testID} pointerEvents="none" style={box}>
    <Svg width={size} height={size} viewBox={`0 0 ${ICON_GRID} ${ICON_GRID}`}>
      {vectorLayers(name as VectorIconName, mono)}
    </Svg>
  </View>;
}

export default memo(GameIcon);
