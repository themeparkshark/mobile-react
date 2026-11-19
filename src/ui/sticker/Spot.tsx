/**
 * Spot: the printed place where a sticker goes. Empty, ghost (the art that goes there, faint),
 * next up (the gold ring) and yours (the sticker itself, with its drop). On blue and on paper,
 * read from where it is mounted. A spot never looks locked.
 */
import { memo } from 'react';
import { View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import Lift from './Lift';
import { useStickerPlace } from './StickerContext';
import StickerText from './StickerText';
import { DROP, INK, LINE, SHADE, SPOT } from './tokens';

export type SpotState = 'empty' | 'ghost' | 'next' | 'yours';

export type SpotProps = {
  readonly state: SpotState;
  readonly art?: ImageSourcePropType;
  readonly size?: number;
  /** VoiceOver: what goes here ("Walt Statue coin, not yet"). */
  readonly label?: string;
  /** The spot as a text field (the gate's answer): a typed digit is stuck on as a white sticker. */
  readonly glyph?: string;
  readonly style?: StyleProp<ViewStyle>;
};

function SpotImpl({ state, art, size = SPOT.size, label, glyph, style }: SpotProps) {
  const { surface } = useStickerPlace();
  const paper = surface === 'paper';
  const a11y = label ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label } : { accessible: false };
  if (state === 'yours' && glyph !== undefined) {
    // A typed digit: a white paper sticker with a navy line and a hard drop (level 2: no white edge).
    return (
      <View style={[{ width: size, height: size }, style]} {...a11y}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: DROP.tag, bottom: -DROP.tag, borderRadius: size / 2, backgroundColor: DROP.inPage }} />
        <View style={{ flex: 1, borderRadius: size / 2, backgroundColor: INK.white, borderWidth: LINE.card, borderColor: INK.navy, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ paddingTop: 3 }}>
            <StickerText size={Math.round(size * 0.55)} tone="navy" stroke={0} lineHeight={Math.round(size * 0.7)} role="none" maxScale={1}>{glyph}</StickerText>
          </View>
        </View>
      </View>
    );
  }
  if (state === 'yours' && art) {
    // The sticker itself sits a little proud of its spot (the board: 50 on a 46 spot).
    const big = Math.round(size * 1.087);
    return (
      <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]} {...a11y}>
        <Lift source={art} width={big} height={big} />
      </View>
    );
  }
  const next = state === 'next';
  const fill = paper ? (next ? SHADE.spotPaperNext : SHADE.spotPaper) : (next ? SHADE.spotNextFill : SHADE.spotBlue);
  const line = next ? (paper ? SHADE.spotPaperNextLine : INK.gold) : (paper ? SHADE.spotPaperLine : SHADE.spotBlueLine);
  const ghost = Math.round(size * 0.826);
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: fill, borderWidth: SPOT.line, borderColor: line,
      borderStyle: next ? 'solid' : 'dashed', alignItems: 'center', justifyContent: 'center' }, style]} {...a11y}>
      {art && state !== 'empty' ? <Lift source={art} width={ghost} height={ghost} flat opacity={SPOT.ghostOpacity} /> : null}
    </View>
  );
}

const Spot = memo(SpotImpl);
export default Spot;
