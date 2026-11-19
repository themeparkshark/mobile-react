/**
 * Spot: the printed place where a sticker goes (kit.png "spots"). Empty and ghost are dark navy
 * discs with a dashed white ring on blue (pale sky with a dashed blue ring on paper); a ghost
 * holds a blue-tinted silhouette of the art that goes there. Next up has a 3 pt gold ring with a
 * gold-light ring inside. Yours is the sticker itself, full colour, a little proud, with its drop.
 * On blue and on paper, read from where it is mounted. A spot never looks locked.
 *
 * A ghost is ONE colour: the art's silhouette in sky on blue, in navy soft on paper, whatever the
 * art's own colours (a gold coin's ghost reads exactly like a blue one's; nothing goes gray).
 * `stickAt` (ms): the spot is shown empty (or next up) and the sticker is stuck into it then, the
 * spot fading under it: the sticker book doing its job (the win card's prizes).
 */
import { memo, useEffect, type ReactNode } from 'react';
import { Image, View, type ImageSourcePropType, type StyleProp } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Arrive from './Arrive';
import Lift from './Lift';
import { useStickerPlace } from './StickerContext';
import StickerText from './StickerText';
import { TEXT } from './textRoles';
import type { LayoutStyle } from './style';
import { DROP, INK, LINE, SHADE, SPOT, STICK } from './tokens';

export type SpotState = 'empty' | 'ghost' | 'next' | 'yours';

export type SpotProps = {
  readonly state: SpotState;
  readonly art?: ImageSourcePropType;
  readonly size?: number;
  /** VoiceOver: what goes here ("Walt Statue coin, not yet"). Without it the spot is silent (a parent speaks). */
  readonly label?: string;
  /** The spot as a text field (the gate's answer): a typed digit is stuck on as a white sticker. */
  readonly glyph?: string;
  /** The sticker (art) is stuck into this spot after this many ms; until then the spot shows empty (or next up). */
  readonly stickAt?: number;
  /** With `stickAt`: the waiting spot's state (default empty). */
  readonly waiting?: 'empty' | 'next';
  /** Fit the stuck sticker into the spot by its longer side (width / height of the art). */
  readonly artRatio?: number;
  readonly style?: StyleProp<LayoutStyle>;
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
    ghostTint: paper ? INK.navySoft : INK.sky,
    ghostOpacity: paper ? SPOT.ghostPaperOpacity : SPOT.ghostOpacity,
    /** No layer of the art's own colour: the ghost is the silhouette alone. */
    ghostTrace: 0,
  } as const;
}

/** A box `size` square, with art of `ratio` (width / height) fitted into it by its longer side. Pure, tested. */
export function fitArt(size: number, ratio: number): { readonly width: number; readonly height: number } {
  return ratio >= 1 ? { width: size, height: Math.round(size / ratio) } : { width: Math.round(size * ratio), height: size };
}

/** The spot under a sticker being stuck on: it fades as the sticker lands (Reduce Motion: the same 150 ms fade). */
function Fading({ at, children }: { readonly at: number; readonly children: ReactNode }) {
  const o = useSharedValue(1);
  useEffect(() => { o.value = withDelay(at + STICK.fadeInMs, withTiming(0, { duration: STICK.reducedFadeMs, easing: Easing.out(Easing.quad) })); }, [at, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }, style]}>{children}</Animated.View>;
}

const DIGIT = { ...TEXT.name, maxScale: 1 };

function SpotImpl(props: SpotProps) {
  const { stickAt, art, size = SPOT.size, label, style, waiting = 'empty', artRatio = 1 } = props;
  if (stickAt !== undefined && art) {
    const fit = fitArt(size, artRatio);
    const a11y = label ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label } : { accessible: false };
    return (
      <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]} {...a11y}>
        <Fading at={stickAt}><SpotBody state={waiting} size={size} /></Fading>
        <Arrive delay={stickAt}>{() => <Lift source={art} width={fit.width} height={fit.height} />}</Arrive>
      </View>
    );
  }
  return <SpotBody {...props} />;
}

function SpotBody({ state, art, size = SPOT.size, label, glyph, style }: SpotProps) {
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
        // The ghost: the art's silhouette in one colour (tintColor replaces every pixel's colour), never the art itself faded.
        <View style={{ width: ghost, height: ghost }} accessible={false}>
          <Image source={art} resizeMode="contain" fadeDuration={0} style={{ width: ghost, height: ghost, tintColor: look.ghostTint, opacity: look.ghostOpacity }} />
        </View>
      ) : null}
    </View>
  );
}

const Spot = memo(SpotImpl);
export default Spot;
