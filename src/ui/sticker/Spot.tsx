/**
 * Spot: the printed place where a sticker goes (kit.png "spots"). Empty and ghost are dark navy
 * discs with a dashed white ring on blue (pale sky with a dashed blue ring on paper); a ghost
 * holds a blue-tinted silhouette of the art that goes there. Next up has a 3 pt gold ring with a
 * gold-light ring inside. Yours is the sticker itself, full colour, a little proud, with its drop.
 * On blue and on paper, read from where it is mounted. A spot never looks locked.
 */
import { memo } from 'react';
import { Image, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import Lift from './Lift';
import { useStickerPlace } from './StickerContext';
import StickerText from './StickerText';
import { TEXT } from './textRoles';
import { DROP, INK, LINE, SHADE, SPOT } from './tokens';

export type SpotState = 'empty' | 'ghost' | 'next' | 'yours';

export type SpotProps = {
  readonly state: SpotState;
  readonly art?: ImageSourcePropType;
  readonly size?: number;
  /** VoiceOver: what goes here ("Walt Statue coin, not yet"). Without it the spot is silent (a parent speaks). */
  readonly label?: string;
  /** The spot as a text field (the gate's answer): a typed digit is stuck on as a white sticker. */
  readonly glyph?: string;
  readonly style?: StyleProp<ViewStyle>;
};

/** How a spot looks at a place: fill, ring, ring style, the inner ring and the ghost's tint. Pure, so it is tested. */
export function spotLook(state: SpotState, paper: boolean) {
  const next = state === 'next';
  return {
    fill: paper ? (next ? SHADE.spotPaperNext : SHADE.spotPaper) : SHADE.spotBlue,
    ring: next ? (paper ? SHADE.spotPaperNextLine : INK.gold) : (paper ? SHADE.spotPaperLine : SHADE.spotBlueLine),
    ringWidth: next ? SPOT.nextLine : SPOT.line,
    dashed: !next,
    inner: next ? INK.goldLight : null,
    ghostTint: paper ? INK.skyLip : INK.sky,
    ghostOpacity: paper ? SPOT.ghostPaperOpacity : SPOT.ghostOpacity,
  } as const;
}

const DIGIT = { ...TEXT.name, maxScale: 1 };

function SpotImpl({ state, art, size = SPOT.size, label, glyph, style }: SpotProps) {
  const { surface } = useStickerPlace();
  // On paper and on the map's tan streets a spot is the pale paper spot (a navy disc on tan reads gray).
  const paper = surface !== 'blue';
  const a11y = label ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label } : { accessible: false };
  if (state === 'yours' && glyph !== undefined) {
    // A typed digit: a white paper sticker with a navy line and a hard drop (level 2: no white edge).
    return (
      <View style={[{ width: size, height: size }, style]} {...a11y}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: DROP.tag, bottom: -DROP.tag, borderRadius: size / 2, backgroundColor: DROP.inPage }} />
        <View style={{ flex: 1, borderRadius: size / 2, backgroundColor: INK.white, borderWidth: LINE.card, borderColor: INK.navy, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ paddingTop: 3 }}>
            <StickerText spec={DIGIT} size={Math.round(size * 0.55)} tone="navy" lineHeight={Math.round(size * 0.7)} role="none">{glyph}</StickerText>
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
  const look = spotLook(state, paper);
  const ghost = Math.round(size * 0.72);
  const innerInset = look.ringWidth;
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: look.fill, borderWidth: look.ringWidth, borderColor: look.ring,
      borderStyle: look.dashed ? 'dashed' : 'solid', alignItems: 'center', justifyContent: 'center' }, style]} {...a11y}>
      {look.inner ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: size / 2 - innerInset, borderWidth: SPOT.nextInner, borderColor: look.inner }} />
      ) : null}
      {art && state !== 'empty' ? (
        // The ghost: a blue-tinted silhouette of the art, with a faint trace of the art itself so its figure reads (never the
        // art alone at low opacity: gold went olive gray).
        <View style={{ width: ghost, height: ghost }} accessible={false}>
          <Image source={art} resizeMode="contain" fadeDuration={0} style={{ position: 'absolute', width: ghost, height: ghost, tintColor: look.ghostTint, opacity: look.ghostOpacity }} />
          <Image source={art} resizeMode="contain" fadeDuration={0} style={{ width: ghost, height: ghost, opacity: SPOT.ghostTrace }} />
        </View>
      ) : null}
    </View>
  );
}

const Spot = memo(SpotImpl);
export default Spot;
