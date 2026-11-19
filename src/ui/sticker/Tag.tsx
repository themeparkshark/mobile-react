/**
 * Tag: a small white, cream or gold pill with a navy line and a small hard drop. Never a white
 * edge. On the map its drop is the 50 percent map drop. Small tags may tilt 2 degrees.
 * Also the what-you-get tag (an icon and a count, cream, `large`). Text scales to 1.15x at most and
 * shrinks to fit a fixed width rather than clip.
 */
import { memo, type ReactNode } from 'react';
import { Image, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useStickerPlace } from './StickerContext';
import StickerText from './StickerText';
import { TEXT } from './textRoles';
import { DROP, INK, LINE, SHADE, TAG } from './tokens';

export type TagProps = {
  readonly children: string;
  readonly paper?: 'white' | 'cream' | 'gold';
  /** Knockout words instead of Shark. */
  readonly plain?: boolean;
  readonly icon?: ImageSourcePropType;
  readonly iconRatio?: number;
  /** A kit mark before the words instead of an icon (the real-money Glyph). */
  readonly leading?: ReactNode;
  /** Art and words after the words (PLAY!'s tag: the coin's name, then his ticket and the cost). */
  readonly after?: { readonly icon: ImageSourcePropType; readonly iconRatio?: number; readonly text: string };
  /** A what-you-get tag: 32 tall, 18 pt count. */
  readonly large?: boolean;
  readonly tilt?: boolean;
  /** What VoiceOver says (default: the words). */
  readonly label?: string;
  readonly style?: StyleProp<ViewStyle>;
};

const FACES = {
  white: [INK.white, INK.white] as const,
  cream: [SHADE.creamTop, INK.cream] as const,
  gold: [INK.goldLight, INK.gold] as const,
};

function TagImpl({ children, paper = 'white', plain = false, icon, iconRatio = 1.46, leading, after, large = false, tilt = false, label, style }: TagProps) {
  const { level } = useStickerPlace();
  const onMap = level === 'map';
  const height = large ? TAG.heightLarge : TAG.height;
  const size = large ? 18 : plain ? TAG.fontKo : TAG.font;
  const spec = { ...(plain ? TEXT.bodySmall : TEXT.tag), size, spacing: plain ? 0.04 : 0.03, maxScale: TAG.maxScale };
  const drop = onMap ? DROP.tagOnMap : DROP.tag;
  // A what-you-get tag shows the thing big (the board: the art nearly fills the pill), a small tag a 14 pt mark.
  const iconH = large ? 24 : 14;
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={label ?? children}
      style={[{ alignSelf: 'flex-start', maxWidth: '100%', height: height + drop, transform: tilt ? [{ rotate: `${-TAG.tilt}deg` }] : undefined }, style]}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: drop, height, borderRadius: height / 2, backgroundColor: onMap ? DROP.map : (large ? DROP.inPage : DROP.color) }} />
      <View style={{ height, borderRadius: height / 2, borderWidth: LINE.tag, borderColor: INK.navy, overflow: 'hidden',
        flexDirection: 'row', alignItems: 'center', paddingLeft: large ? 6 : TAG.padX, paddingRight: large ? 8 : TAG.padX, gap: large ? 6 : 5 }}>
        <LinearGradient colors={FACES[paper]} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
        {leading ?? (icon ? <Image source={icon} style={{ height: iconH, width: iconH * iconRatio, marginTop: -2 }} resizeMode="contain" fadeDuration={0} /> : null)}
        <View style={{ paddingTop: plain ? 0 : 2, flexShrink: 1 }}>
          <StickerText spec={spec} tone="navy" lineHeight={size + 3} role="none" fit>{children}</StickerText>
        </View>
        {after ? <Image source={after.icon} style={{ height: iconH, width: iconH * (after.iconRatio ?? 1.46), marginLeft: 3, marginTop: -2 }} resizeMode="contain" fadeDuration={0} /> : null}
        {after ? <View style={{ paddingTop: plain ? 0 : 2 }}><StickerText spec={spec} tone="navy" lineHeight={size + 3} role="none">{after.text}</StickerText></View> : null}
      </View>
    </View>
  );
}

const Tag = memo(TagImpl);
export default Tag;
