/**
 * Spot: the printed place where a sticker goes. Empty, ghost (the art that goes there, faint),
 * next up (the gold ring) and yours (the sticker itself, with its drop). On blue and on paper,
 * read from where it is mounted. A spot never looks locked.
 */
import { memo } from 'react';
import { View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import Lift from './Lift';
import { useStickerPlace } from './StickerContext';
import { INK, SHADE, SPOT } from './tokens';

export type SpotState = 'empty' | 'ghost' | 'next' | 'yours';

export type SpotProps = {
  readonly state: SpotState;
  readonly art?: ImageSourcePropType;
  readonly size?: number;
  /** VoiceOver: what goes here ("Walt Statue coin, not yet"). */
  readonly label?: string;
  readonly style?: StyleProp<ViewStyle>;
};

function SpotImpl({ state, art, size = SPOT.size, label, style }: SpotProps) {
  const { surface } = useStickerPlace();
  const paper = surface === 'paper';
  const a11y = label ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label } : { accessible: false };
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
