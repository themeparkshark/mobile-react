/**
 * Glyph: the only code-drawn marks the look keeps (DIRECTION.md, icons): the delete key, the
 * small chevron, the done check and the real-money mark, plus today's red locate pointer on the
 * follow disc (drawn on the board's map, 1-map.png, so the two shark discs each say one job).
 * Everything else is Alex's art.
 * Fixed-size SVG paths, never measured.
 */
import { memo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import StickerText from './StickerText';
import { INK } from './tokens';

export type GlyphKind = 'delete' | 'chevron' | 'check' | 'money' | 'pointer';

/** The chevron's three ways (drawn, never turned). */
const CHEVRON = { right: 'M4.2 2.4L8 6l-3.8 3.6', down: 'M2.4 4.2L6 8l3.6-3.8', up: 'M2.4 7.8L6 4l3.6 3.8' } as const;

function GlyphImpl({ kind, size = 24, point = 'right' }: { readonly kind: GlyphKind; readonly size?: number; readonly point?: keyof typeof CHEVRON }) {
  if (kind === 'money') {
    // A navy disc with a white Shark "$": the real-money mark (gate, Supplies).
    return (
      <View accessible={false} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: INK.navy, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ paddingTop: 2 }}>
          <StickerText size={Math.round(size * 0.66)} fill={INK.white} stroke={0} drop={0} lineHeight={Math.round(size * 0.8)} role="none" maxScale={1}>$</StickerText>
        </View>
      </View>
    );
  }
  if (kind === 'check') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={10.8} fill={INK.green} stroke={INK.navy} strokeWidth={2.2} />
        <Path d="M7 12.4l3.3 3.3L17.2 8.6" fill="none" stroke={INK.white} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  if (kind === 'pointer') {
    // Today's follow button pointer (src/components/map/FollowButton.tsx): a red triangle with a navy line, pointing up.
    return (
      <Svg width={size} height={size * 0.8} viewBox="0 0 10 8">
        <Path d="M5 0.8L9.2 7.2H0.8Z" fill={INK.red} stroke={INK.navy} strokeWidth={1.2} strokeLinejoin="round" />
      </Svg>
    );
  }
  if (kind === 'chevron') {
    return (
      <Svg width={size} height={size} viewBox="0 0 12 12">
        <Path d={CHEVRON[point]} fill="none" stroke={INK.navy} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  // The delete key (board 6-gate): a navy tag outline with an x.
  return (
    <Svg width={size * (30 / 22)} height={size} viewBox="0 0 30 22">
      <Path d="M10 2.5h15a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H10L2.5 11z" fill="none" stroke={INK.navy} strokeWidth={2.6} strokeLinejoin="round" />
      <Path d="M14 7.5l7 7M21 7.5l-7 7" stroke={INK.navy} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}

const Glyph = memo(GlyphImpl);
export default Glyph;
