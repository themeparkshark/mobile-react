/**
 * Spike candidate C (gallery only, not part of the kit): one SVG text node with a round-joined
 * navy stroke, a drop copy and the fill. It needs a fixed box (no measuring), so it cannot
 * shrink a title to fit or wrap it; kept here only so the gallery can compare it.
 */
import { memo } from 'react';
import { View } from 'react-native';
import Svg, { Text as SvgText } from 'react-native-svg';
import { FONT, INK } from '../tokens';

function SvgTitleImpl({ children, size, width, stroke, drop, spacing = 0.04 }: {
  readonly children: string;
  readonly size: number;
  readonly width: number;
  readonly stroke: number;
  readonly drop: number;
  readonly spacing?: number;
}) {
  const height = Math.round(size * 1.3) + Math.ceil(stroke * 2 + drop);
  const y = Math.round(size * 1.0) + Math.ceil(stroke);
  const common = { x: width / 2, y, fontFamily: FONT.shark, fontSize: size, letterSpacing: size * spacing, textAnchor: 'middle' as const };
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={children} style={{ width, height }}>
      <Svg width={width} height={height}>
        <SvgText {...common} y={y + drop} fill={INK.navy} stroke={INK.navy} strokeWidth={stroke * 2} strokeLinejoin="round">{children}</SvgText>
        <SvgText {...common} fill={INK.navy} stroke={INK.navy} strokeWidth={stroke * 2} strokeLinejoin="round">{children}</SvgText>
        <SvgText {...common} fill={INK.white}>{children}</SvgText>
      </Svg>
    </View>
  );
}

const SvgTitle = memo(SvgTitleImpl);
export default SvgTitle;
