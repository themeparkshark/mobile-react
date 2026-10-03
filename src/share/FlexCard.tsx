/**
 * The flex card: one layout system, two formats.
 *
 *   Story 9:16 (360x640 pt, exported 1080x1920). Everything that matters sits
 *   inside Instagram/TikTok's safe zone, y 84..526 pt (252..1578 px): the top
 *   and bottom bands carry only background, so Story chrome never covers it.
 *     ribbon / hero with the giant brag number + the player's shark holding
 *     its category prop / "My ..." + name / brag plate / wordmark, CTA, link, QR.
 *   Square 1:1 (360x360 pt, exported 1080x1080)
 *     ribbon / hero + giant number, words and plate / shark, wordmark + CTA + link, QR.
 *
 * Everything printed comes from flexCopy(). No username, date, place or ride
 * name can reach the card (CONTRACT.md section 4).
 */
import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef, memo, useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import type { InventoryType } from '../models/inventory-type';
import { flexCopy } from './copy';
import { ArtReadinessProvider, FlexArtwork } from './FlexArtwork';
import { FRAMES, RARITY_RAMP, type FlexFrame } from './frames';
import { FlexHero } from './FlexHero';
import { FlexShark, SHARK_ASPECT } from './FlexShark';
import { FLEX_SIZE } from './formats';
import { SHARE_LINK_DISPLAY } from './link';
import { Outlined } from './Outlined';
import { QR_BY_KIND } from './qr';
import type { FlexCopy, FlexFormat, FlexKind, FlexPayload, FlexRarity } from './types';

export { FLEX_EXPORT, FLEX_SIZE } from './formats';

export const CARD_CHROME = {
  pattern: require('../../assets/images/shark_background.png'),
  logo: require('../../assets/images/screens/login/logo.png'),
  ribbon: require('../../assets/images/ribbon.png'),
};

/** Instagram/TikTok Story chrome covers the top ~250 px and bottom ~340 px of 1920 (pt at 3x). */
export const STORY_SAFE = { top: 84, bottom: 114 } as const;

/** Live-only hooks for the in-app Flex moment (never used for the exported image). */
export interface FlexCardMotion {
  /** Replaces the giant number's text (the count-up). */
  readonly bigText?: string;
  readonly bigStyle?: StyleProp<ViewStyle>;
  readonly sharkStyle?: StyleProp<ViewStyle>;
  readonly heroStyle?: StyleProp<ViewStyle>;
}

export interface FlexCardProps<K extends FlexKind = FlexKind> {
  readonly kind: K;
  readonly payload: FlexPayload<K>;
  readonly format: FlexFormat;
  /** The signed-in player's live look (payload.inventory wins). */
  readonly inventory: InventoryType | null | undefined;
  readonly onReadyChange?: (ready: boolean) => void;
  readonly motion?: FlexCardMotion;
}

export const FlexCard = forwardRef<View, FlexCardProps>(function FlexCard({ kind, payload, format, inventory, onReadyChange, motion }, ref) {
  const copy = useMemo(() => flexCopy(kind, payload), [kind, payload]);
  const frame = FRAMES[copy.frame];
  const shark = payload.inventory ?? inventory;
  const size = FLEX_SIZE[format];
  const props: LayoutProps = { kind, payload, copy, frame, showShark: !copy.hideShark, inventory: shark, motion: motion ?? {} };
  return (
    <ArtReadinessProvider onReadyChange={onReadyChange}>
      <View ref={ref} collapsable={false} accessible accessibilityRole="image" accessibilityLabel={copy.a11y}
        style={[styles.card, size, { backgroundColor: frame.bg[1] }]}>
        <Backdrop frame={frame} format={format} />
        {format === 'story' ? <StoryLayout {...props} /> : <SquareLayout {...props} />}
      </View>
    </ArtReadinessProvider>
  );
});

interface LayoutProps {
  readonly kind: FlexKind;
  readonly payload: FlexPayload;
  readonly copy: FlexCopy;
  readonly frame: FlexFrame;
  /** Draw the shark beside the hero (off when the hero already shows one). */
  readonly showShark: boolean;
  /** The player's look. */
  readonly inventory: InventoryType | null | undefined;
  readonly motion: FlexCardMotion;
}

/** Story: hero box, giant number and shark sizes (pt). The shark is ~38% of the card's width. */
export const STORY_HERO = 146;
export const STORY_SHARK_H = 170;

function StoryLayout({ kind, payload, copy, frame, showShark, inventory, motion }: LayoutProps) {
  return (
    <View style={styles.storyBody}>
      <Ribbon text={copy.ribbon} width={256} />
      <View style={styles.storyHero}>
        <Rays frame={frame} size={420} />
        <View style={[styles.storyHeroRow, !showShark && { justifyContent: 'center' }]}>
          <Animated.View style={[{ width: STORY_HERO, height: STORY_HERO }, motion.heroStyle]}>
            <FlexHero kind={kind} payload={payload} frame={frame} size={STORY_HERO} inventory={inventory} />
            {!!copy.big && <BigNumber copy={copy} frame={frame} size={62} width={200} text={motion.bigText} style={[styles.storyBig, motion.bigStyle]} />}
          </Animated.View>
          {showShark && (
            <Animated.View style={[styles.storyShark, motion.sharkStyle]}>
              <FlexShark inventory={inventory} height={STORY_SHARK_H} prop={copy.prop} />
            </Animated.View>
          )}
        </View>
      </View>
      <View style={styles.words}>
        <Text style={[styles.kicker, { color: frame.ink }]} numberOfLines={1}>{copy.kicker}</Text>
        <Outlined text={copy.title} style={[styles.storyTitle, titleSize(copy.title, 'story')]} outline={frame.outline} lines={1} />
        {copy.rarity && <RarityChip rarity={copy.rarity} />}
      </View>
      <StatPlate copy={copy} frame={frame} compact={false} />
      <Footer kind={kind} copy={copy} frame={frame} logoWidth={120} qr={56} />
    </View>
  );
}

function SquareLayout({ kind, payload, copy, frame, showShark, inventory, motion }: LayoutProps) {
  // Three bands, nothing overlapping and nothing off the canvas:
  // ribbon / hero (with the giant number) + words / the player's shark, CTA and QR along the bottom.
  const heroSize = 140;
  return (
    <View style={styles.squareBody}>
      <Ribbon text={copy.ribbon} width={244} />
      <View style={styles.squareMid}>
        <View style={styles.squareHeroCol}>
          <Rays frame={frame} size={280} />
          <Animated.View style={[{ width: heroSize, height: heroSize }, motion.heroStyle]}>
            <FlexHero kind={kind} payload={payload} frame={frame} size={heroSize} inventory={inventory} />
            {!!copy.big && <BigNumber copy={copy} frame={frame} size={40} width={150} text={motion.bigText} style={[styles.squareBig, motion.bigStyle]} />}
          </Animated.View>
        </View>
        <View style={styles.squareWords}>
          <Text style={[styles.kickerSmall, { color: frame.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{copy.kicker}</Text>
          <Outlined text={copy.title} style={[styles.squareTitle, titleSize(copy.title, 'square')]} outline={frame.outline} lines={3} />
          {copy.rarity && <RarityChip rarity={copy.rarity} small />}
          <StatPlate copy={copy} frame={frame} compact />
        </View>
      </View>
      <View style={styles.squareFooter}>
        {showShark
          ? <Animated.View style={[styles.squareShark, motion.sharkStyle]}>
              <FlexShark inventory={inventory} height={SQUARE_SHARK_H} flip />
            </Animated.View>
          : <View style={{ width: Math.round(SQUARE_SHARK_H * SHARK_ASPECT) }} />}
        <Footer kind={kind} copy={copy} frame={frame} logoWidth={128} qr={50} compact />
      </View>
    </View>
  );
}

/** The square card's shark: its whole paper box sits inside the footer band. */
export const SQUARE_SHARK_H = 104;

/** The giant brag number: a tilted outlined sticker over the hero's lower-left corner, caption under it. */
function BigNumber({ copy, frame, size, width, text, style }: {
  readonly copy: FlexCopy; readonly frame: FlexFrame; readonly size: number; readonly width: number;
  readonly text?: string; readonly style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View pointerEvents="none" style={[styles.bigWrap, { width }, style]}>
      {!!copy.bigLabel && (
        <View style={[styles.bigLabel, { backgroundColor: frame.outline }]}>
          <Text style={[styles.bigLabelText, { fontSize: size >= 50 ? 11 : 9 }]} numberOfLines={1}>{copy.bigLabel}</Text>
        </View>
      )}
      <Outlined text={text ?? copy.big ?? ''} outline={frame.outline} weight={Math.max(2.5, size * 0.075)}
        style={{ fontFamily: 'Shark', fontSize: size, lineHeight: Math.round(size * 1.08), color: frame.bigFill, textAlign: 'left' }} />
    </Animated.View>
  );
}

/** Wordmark + CTA + the readable short link, and the per-kind QR. */
const Footer = memo(function Footer({ kind, copy, frame, logoWidth, qr, compact = false }: {
  readonly kind: FlexKind; readonly copy: FlexCopy; readonly frame: FlexFrame; readonly logoWidth: number; readonly qr: number; readonly compact?: boolean;
}) {
  return (
    <View style={[styles.footer, compact && styles.footerCompact]}>
      <View style={{ flex: 1, alignItems: compact ? 'center' : 'flex-start' }}>
        <FlexArtwork art={CARD_CHROME.logo} fallback={CARD_CHROME.logo} style={{ width: logoWidth, height: Math.round(logoWidth / 4) }} />
        <Outlined text={copy.cta} style={[compact ? styles.ctaSmall : styles.cta, { color: frame.cta }]} outline={frame.outline} lines={1} />
        <Text style={[compact ? styles.linkSmall : styles.link, { color: frame.small }]} numberOfLines={1}>{SHARE_LINK_DISPLAY}</Text>
      </View>
      <View style={[styles.qrTile, { width: qr + 8, height: qr + 8 }]}>
        <FlexArtwork id="qr" art={QR_BY_KIND[kind]} fallback={QR_BY_KIND[kind]} style={{ width: qr, height: qr }} />
      </View>
    </View>
  );
});

/** Title size by length, so long names wrap the same way in every outline copy. */
export function titleSize(title: string, format: FlexFormat): { fontSize: number; lineHeight: number } {
  const n = title.length;
  const size = format === 'story' ? (n <= 20 ? 32 : n <= 28 ? 28 : 24) : (n <= 14 ? 23 : n <= 24 ? 20 : 17);
  return { fontSize: size, lineHeight: Math.round(size * 1.12) };
}

/** Background: gradient, Alex's shark-pattern water, a soft vignette. */
const Backdrop = memo(function Backdrop({ frame, format }: { readonly frame: FlexFrame; readonly format: FlexFormat }) {
  return (
    <>
      <LinearGradient colors={[frame.bg[0], frame.bg[1]]} style={StyleSheet.absoluteFill} />
      <FlexArtwork art={CARD_CHROME.pattern} fallback={CARD_CHROME.pattern} contentFit="cover"
        style={[StyleSheet.absoluteFill, { opacity: frame.pattern }]} />
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(3,20,48,0.32)']} start={{ x: 0.5, y: format === 'story' ? 0.6 : 0.5 }} end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill} />
    </>
  );
});

/** Flat Alex-style sunburst: 18 alternating wedges, no blur. */
const Rays = memo(function Rays({ frame, size }: { readonly frame: FlexFrame; readonly size: number }) {
  const wedges = 18;
  const r = size / 2;
  const d = Array.from({ length: wedges }, (_, i) => {
    const a0 = (i / wedges) * Math.PI * 2;
    const a1 = a0 + Math.PI / wedges;
    return `M${r},${r} L${r + r * Math.cos(a0)},${r + r * Math.sin(a0)} L${r + r * Math.cos(a1)},${r + r * Math.sin(a1)} Z`;
  }).join(' ');
  return (
    <View pointerEvents="none" style={[styles.rays, { width: size, height: size, marginLeft: -r, marginTop: -r }]}>
      <Svg width={size} height={size}>
        <Path d={d} fill={frame.rays} opacity={frame.rayOpacity} />
      </Svg>
    </View>
  );
});

/** Alex's gold ribbon with a white, navy-outlined headline. */
const Ribbon = memo(function Ribbon({ text, width }: { readonly text: string; readonly width: number }) {
  const height = Math.round(width * (222 / 872));
  return (
    <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
      <FlexArtwork art={CARD_CHROME.ribbon} fallback={CARD_CHROME.ribbon} style={StyleSheet.absoluteFill} />
      <View style={{ width: width * 0.8, marginTop: -height * 0.1, alignItems: 'center' }}>
        <Outlined text={text} outline="#7a3d00" lines={1}
          style={{ fontFamily: 'Shark', fontSize: Math.round(height * 0.42), color: '#ffffff', textAlign: 'center' }} />
      </View>
    </View>
  );
});

/** Rarity chip: light chip, navy ink, 1-5 gems in the ramp color. */
const RarityChip = memo(function RarityChip({ rarity, small = false }: { readonly rarity: FlexRarity; readonly small?: boolean }) {
  const look = RARITY_RAMP[rarity];
  const gem = small ? 7 : 9;
  return (
    <View style={[styles.chip, small && styles.chipSmall, { backgroundColor: look.chip, borderColor: look.frame }]}>
      <View style={{ flexDirection: 'row' }}>
        {Array.from({ length: rarity }, (_, i) => (
          <View key={i} style={{ width: Math.ceil(gem * 1.5), height: Math.ceil(gem * 1.5), alignItems: 'center', justifyContent: 'center' }}>
            <View style={[styles.gem, { width: gem, height: gem, backgroundColor: look.frame }]} />
          </View>
        ))}
      </View>
      <Text style={[styles.chipText, small && { fontSize: 13 }]}>{look.label}</Text>
    </View>
  );
});

/** Cream plate with an outline and lip: the brag line and one supporting line. */
const StatPlate = memo(function StatPlate({ copy, frame, compact }: { readonly copy: FlexCopy; readonly frame: FlexFrame; readonly compact: boolean }) {
  return (
    <View style={[styles.plate, compact && styles.plateCompact, { backgroundColor: frame.plate, borderColor: frame.outline }]}>
      <Text style={[styles.statLine, compact && styles.statLineCompact, { color: frame.plateInk }]} numberOfLines={2}>{copy.stat}</Text>
      {!!copy.sub && <Text style={[styles.subLine, compact && styles.subLineCompact, { color: frame.plateInk }]}
        numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{copy.sub}</Text>}
    </View>
  );
});


const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  rays: { position: 'absolute', left: '50%', top: '50%', alignItems: 'center', justifyContent: 'center' },

  storyBody: { flex: 1, alignItems: 'center', paddingTop: STORY_SAFE.top, paddingBottom: STORY_SAFE.bottom, paddingHorizontal: 20 },
  storyHero: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  storyHeroRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', width: '100%', paddingLeft: 14 },
  storyShark: { marginRight: -18, marginBottom: -20 },
  storyBig: { left: -24, bottom: -8, transform: [{ rotate: '-8deg' }] },
  words: { alignItems: 'center', width: '100%', marginTop: 12 },
  kicker: { fontFamily: 'Shark', fontSize: 18, textShadowColor: 'rgba(3,20,48,0.35)', textShadowOffset: { width: 0, height: 1.5 }, textShadowRadius: 0 },
  storyTitle: { fontFamily: 'Shark', fontSize: 32, lineHeight: 36, color: '#ffffff', textAlign: 'center' },

  bigWrap: { position: 'absolute', alignItems: 'flex-start' },
  bigLabel: { marginBottom: -4, marginLeft: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, zIndex: 1 },
  bigLabelText: { fontFamily: 'Shark', color: '#ffffff', letterSpacing: 0.5 },

  footer: { flexDirection: 'row', alignItems: 'center', width: '100%', marginTop: 8, gap: 10 },
  footerCompact: { flex: 1, marginTop: 0, gap: 6, alignItems: 'flex-end' },
  cta: { fontFamily: 'Shark', fontSize: 18, marginTop: 2 },
  ctaSmall: { fontFamily: 'Shark', fontSize: 15, textAlign: 'center' },
  link: { fontFamily: 'Knockout', fontSize: 13, marginTop: 1 },
  linkSmall: { fontFamily: 'Knockout', fontSize: 11, textAlign: 'center' },
  qrTile: { backgroundColor: '#ffffff', borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#05346e' },

  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4, paddingHorizontal: 12, height: 28, borderRadius: 14, borderWidth: 3 },
  chipSmall: { height: 24, paddingHorizontal: 9, gap: 5, marginTop: 4, alignSelf: 'flex-start' },
  chipText: { fontFamily: 'Shark', fontSize: 15, color: '#05346e' },
  gem: { transform: [{ rotate: '45deg' }], borderWidth: 1.5, borderColor: '#05346e' },

  plate: { width: '100%', marginTop: 8, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16, borderWidth: 3, borderBottomWidth: 6 },
  plateCompact: { marginTop: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14, borderBottomWidth: 5 },
  statLine: { fontFamily: 'Shark', fontSize: 18, lineHeight: 22 },
  statLineCompact: { fontSize: 14, lineHeight: 17 },
  subLine: { fontFamily: 'Knockout', fontSize: 14, marginTop: 1, opacity: 0.85 },
  subLineCompact: { fontSize: 11 },

  squareBody: { flex: 1, alignItems: 'center', paddingTop: 8, paddingBottom: 10, paddingHorizontal: 14 },
  squareMid: { flex: 1, flexDirection: 'row', width: '100%', alignItems: 'center' },
  squareHeroCol: { width: 160, height: '100%', alignItems: 'center', justifyContent: 'center' },
  squareBig: { left: -14, bottom: -6, transform: [{ rotate: '-8deg' }] },
  squareShark: { marginLeft: -6, marginBottom: -8 },
  squareWords: { flex: 1, paddingLeft: 12, justifyContent: 'center' },
  kickerSmall: { fontFamily: 'Shark', fontSize: 15, textShadowColor: 'rgba(3,20,48,0.35)', textShadowOffset: { width: 0, height: 1.5 }, textShadowRadius: 0 },
  squareTitle: { fontFamily: 'Shark', fontSize: 23, lineHeight: 26, color: '#ffffff' },
  squareFooter: { flexDirection: 'row', alignItems: 'flex-end', width: '100%', gap: 6, height: 96 },
});
