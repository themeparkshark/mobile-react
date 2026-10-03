/**
 * The flex card: one layout system, two formats.
 *
 *   Story 9:16 (360x640 pt, exported 1080x1920)
 *     wordmark / gold ribbon headline / the hero (big, framed, rays behind,
 *     the player's shark beside it) / "My ..." + name + rarity chip /
 *     the brag plate / CTA + App Store QR.
 *   Square 1:1 (360x360 pt, exported 1080x1080)
 *     ribbon / hero + shark left, words and plate right / wordmark, CTA, QR.
 *
 * Everything printed comes from flexCopy(). No username, date, place or ride
 * name can reach the card (CONTRACT.md section 4).
 */
import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { InventoryType } from '../models/inventory-type';
import { flexCopy } from './copy';
import { ArtReadinessProvider, FlexArtwork } from './FlexArtwork';
import { FRAMES, RARITY_RAMP, type FlexFrame } from './frames';
import { FlexHero } from './FlexHero';
import { FlexShark } from './FlexShark';
import { FLEX_SIZE } from './formats';
import { Outlined } from './Outlined';
import type { FlexCopy, FlexFormat, FlexKind, FlexPayload, FlexRarity } from './types';

export { FLEX_EXPORT, FLEX_SIZE } from './formats';

export const CARD_CHROME = {
  pattern: require('../../assets/images/shark_background.png'),
  logo: require('../../assets/images/screens/login/logo.png'),
  ribbon: require('../../assets/images/ribbon.png'),
  qr: require('../../assets/images/share/qr-app-store.png'),
};

/** Kinds whose hero already shows the shark (it is in the photo). */
const SHARK_IN_HERO: ReadonlySet<FlexKind> = new Set<FlexKind>(['ride_photo']);

export interface FlexCardProps<K extends FlexKind = FlexKind> {
  readonly kind: K;
  readonly payload: FlexPayload<K>;
  readonly format: FlexFormat;
  /** The signed-in player's live look (payload.inventory wins). */
  readonly inventory: InventoryType | null | undefined;
  readonly onReadyChange?: (ready: boolean) => void;
}

export const FlexCard = forwardRef<View, FlexCardProps>(function FlexCard({ kind, payload, format, inventory, onReadyChange }, ref) {
  const copy = flexCopy(kind, payload);
  const frame = FRAMES[copy.frame];
  const shark = payload.inventory ?? inventory;
  const size = FLEX_SIZE[format];
  const showShark = !SHARK_IN_HERO.has(kind);
  return (
    <ArtReadinessProvider onReadyChange={onReadyChange}>
      <View ref={ref} collapsable={false} accessible accessibilityRole="image" accessibilityLabel={copy.a11y}
        style={[styles.card, size, { backgroundColor: frame.bg[1] }]}>
        <Backdrop frame={frame} format={format} />
        {format === 'story'
          ? <StoryLayout kind={kind} payload={payload} copy={copy} frame={frame} showShark={showShark} inventory={shark} />
          : <SquareLayout kind={kind} payload={payload} copy={copy} frame={frame} showShark={showShark} inventory={shark} />}
      </View>
    </ArtReadinessProvider>
  );
});

interface LayoutProps {
  readonly kind: FlexKind;
  readonly payload: FlexPayload;
  readonly copy: FlexCopy;
  readonly frame: FlexFrame;
  /** Draw the shark beside the hero (off when the hero already shows it). */
  readonly showShark: boolean;
  /** The player's look, for heroes that draw the shark themselves. */
  readonly inventory: InventoryType | null | undefined;
}

function StoryLayout({ kind, payload, copy, frame, showShark, inventory }: LayoutProps) {
  const heroSize = 200;
  return (
    <View style={styles.storyBody}>
      <FlexArtwork art={CARD_CHROME.logo} fallback={CARD_CHROME.logo} style={styles.storyLogo} />
      <Ribbon text={copy.ribbon} width={318} />
      <View style={styles.storyHero}>
        <Rays frame={frame} size={420} />
        <View style={{ width: heroSize, height: heroSize, marginLeft: showShark ? -64 : 0 }}>
          <FlexHero kind={kind} payload={payload} frame={frame} size={heroSize} inventory={inventory} />
        </View>
        {showShark && <FlexShark inventory={inventory} height={180} style={styles.storyShark} />}
      </View>
      <View style={styles.words}>
        <Text style={[styles.kicker, { color: frame.accent }]} numberOfLines={1}>{copy.kicker}</Text>
        <Outlined text={copy.title} style={[styles.storyTitle, titleSize(copy.title, 'story')]} outline={frame.outline} lines={2} />
        {copy.rarity && <RarityChip rarity={copy.rarity} />}
      </View>
      <StatPlate copy={copy} frame={frame} compact={false} />
      <View style={styles.storyFooter}>
        <View style={{ flex: 1 }}>
          <Outlined text={copy.cta} style={styles.cta} outline={frame.outline} lines={1} />
          <Text style={styles.store}>Theme Park Shark · free on the App Store</Text>
        </View>
        <Qr size={58} />
      </View>
    </View>
  );
}

function SquareLayout({ kind, payload, copy, frame, showShark, inventory }: LayoutProps) {
  const heroSize = 150;
  return (
    <View style={styles.squareBody}>
      <Ribbon text={copy.ribbon} width={262} />
      <View style={styles.squareMid}>
        <View style={styles.squareHeroCol}>
          <Rays frame={frame} size={300} />
          <View style={{ width: heroSize, height: heroSize, marginTop: 4, marginLeft: showShark ? 22 : 0 }}>
            <FlexHero kind={kind} payload={payload} frame={frame} size={heroSize} inventory={inventory} />
          </View>
          {showShark && <FlexShark inventory={inventory} height={112} flip style={styles.squareShark} />}
        </View>
        <View style={styles.squareWords}>
          <Text style={[styles.kickerSmall, { color: frame.accent }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{copy.kicker}</Text>
          <Outlined text={copy.title} style={[styles.squareTitle, titleSize(copy.title, 'square')]} outline={frame.outline} lines={3} />
          {copy.rarity && <RarityChip rarity={copy.rarity} small />}
          <StatPlate copy={copy} frame={frame} compact />
        </View>
      </View>
      <View style={styles.squareFooter}>
        <FlexArtwork art={CARD_CHROME.logo} fallback={CARD_CHROME.logo} style={styles.squareLogo} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Outlined text={copy.cta} style={styles.ctaSmall} outline={frame.outline} lines={1} />
          <Text style={styles.storeSmall}>free on the App Store</Text>
        </View>
        <Qr size={44} />
      </View>
    </View>
  );
}

/** Title size by length, so long names wrap the same way in every outline copy. */
export function titleSize(title: string, format: FlexFormat): { fontSize: number; lineHeight: number } {
  const n = title.length;
  const size = format === 'story' ? (n <= 20 ? 32 : n <= 28 ? 28 : 24) : (n <= 14 ? 23 : n <= 24 ? 20 : 17);
  return { fontSize: size, lineHeight: Math.round(size * 1.12) };
}

/** Background: gradient, Alex's shark-pattern water, a soft vignette. */
function Backdrop({ frame, format }: { readonly frame: FlexFrame; readonly format: FlexFormat }) {
  return (
    <>
      <LinearGradient colors={[frame.bg[0], frame.bg[1]]} style={StyleSheet.absoluteFill} />
      <FlexArtwork art={CARD_CHROME.pattern} fallback={CARD_CHROME.pattern} contentFit="cover"
        style={[StyleSheet.absoluteFill, { opacity: frame.pattern }]} />
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(3,20,48,0.32)']} start={{ x: 0.5, y: format === 'story' ? 0.6 : 0.5 }} end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill} />
    </>
  );
}

/** Flat Alex-style sunburst: 18 alternating wedges, no blur. */
function Rays({ frame, size }: { readonly frame: FlexFrame; readonly size: number }) {
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
}

/** Alex's gold ribbon with a white, navy-outlined headline. */
function Ribbon({ text, width }: { readonly text: string; readonly width: number }) {
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
}

/** Rarity chip: light chip, navy ink, 1-5 gems in the ramp color. */
function RarityChip({ rarity, small = false }: { readonly rarity: FlexRarity; readonly small?: boolean }) {
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
}

/** Cream plate with a navy outline and lip: big number (if any) + the brag line. */
function StatPlate({ copy, frame, compact }: { readonly copy: FlexCopy; readonly frame: FlexFrame; readonly compact: boolean }) {
  // Story: big number left, lines right. Square: big number on top, lines under (the column is narrow).
  return (
    <View style={[styles.plate, compact && styles.plateCompact, { backgroundColor: frame.plate, borderColor: frame.outline }]}>
      {!!copy.big && <View style={compact ? styles.bigBoxCompact : undefined}>
        <Outlined text={copy.big} outline="#7a3d00" lines={1}
          style={[styles.big, compact && styles.bigCompact, { color: '#ffcf3b' }]} />
      </View>}
      <View style={compact ? styles.bigBoxCompact : { flex: 1 }}>
        <Text style={[styles.statLine, compact && styles.statLineCompact, { color: frame.plateInk }]}
          numberOfLines={compact ? 3 : 2}>{copy.stat}</Text>
        {!!copy.sub && <Text style={[styles.subLine, compact && styles.subLineCompact, { color: frame.plateInk }]}
          numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{copy.sub}</Text>}
      </View>
    </View>
  );
}

function Qr({ size }: { readonly size: number }) {
  return (
    <View style={[styles.qrTile, { width: size + 8, height: size + 8 }]}>
      <FlexArtwork art={CARD_CHROME.qr} fallback={CARD_CHROME.qr} style={{ width: size, height: size }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  rays: { position: 'absolute', left: '50%', top: '50%', alignItems: 'center', justifyContent: 'center' },

  storyBody: { flex: 1, alignItems: 'center', paddingTop: 20, paddingBottom: 18, paddingHorizontal: 20 },
  storyLogo: { width: 268, height: 67 },
  storyHero: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', paddingTop: 22, paddingBottom: 8 },
  storyShark: { position: 'absolute', right: -16, bottom: -10 },
  words: { alignItems: 'center', width: '100%', marginTop: 10 },
  kicker: { fontFamily: 'Shark', fontSize: 20, textShadowColor: 'rgba(3,20,48,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  storyTitle: { fontFamily: 'Shark', fontSize: 32, lineHeight: 36, color: '#ffffff', textAlign: 'center' },
  storyFooter: { flexDirection: 'row', alignItems: 'center', width: '100%', marginTop: 12, gap: 10 },
  cta: { fontFamily: 'Shark', fontSize: 21, color: '#ffcf3b' },
  store: { fontFamily: 'Knockout', fontSize: 13, color: '#ffffff', marginTop: 3 },

  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6, paddingHorizontal: 12, height: 30, borderRadius: 15, borderWidth: 3 },
  chipSmall: { height: 24, paddingHorizontal: 9, gap: 5, marginTop: 4, alignSelf: 'flex-start' },
  chipText: { fontFamily: 'Shark', fontSize: 15, color: '#05346e' },
  gem: { transform: [{ rotate: '45deg' }], borderWidth: 1.5, borderColor: '#05346e' },

  plate: { flexDirection: 'row', alignItems: 'center', width: '100%', gap: 12, marginTop: 12, paddingVertical: 9, paddingHorizontal: 14,
    borderRadius: 18, borderWidth: 3, borderBottomWidth: 6 },
  plateCompact: { flexDirection: 'column', alignItems: 'flex-start', gap: 0, marginTop: 8, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14, borderBottomWidth: 5 },
  big: { fontFamily: 'Shark', fontSize: 36, lineHeight: 42 },
  bigCompact: { fontSize: 24, lineHeight: 28 },
  bigBoxCompact: { alignSelf: 'stretch' },
  statLine: { fontFamily: 'Shark', fontSize: 19, lineHeight: 23 },
  statLineCompact: { fontSize: 14, lineHeight: 17 },
  subLine: { fontFamily: 'Knockout', fontSize: 15, marginTop: 1, opacity: 0.85 },
  subLineCompact: { fontSize: 11 },
  qrTile: { backgroundColor: '#ffffff', borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#05346e' },

  squareBody: { flex: 1, alignItems: 'center', paddingTop: 10, paddingBottom: 10, paddingHorizontal: 14 },
  squareMid: { flex: 1, flexDirection: 'row', width: '100%', alignItems: 'center' },
  squareHeroCol: { width: 172, height: '100%', alignItems: 'center', justifyContent: 'center' },
  squareShark: { position: 'absolute', left: -30, bottom: -4 },
  squareWords: { flex: 1, paddingLeft: 12, justifyContent: 'center' },
  kickerSmall: { fontFamily: 'Shark', fontSize: 15, textShadowColor: 'rgba(3,20,48,0.5)', textShadowOffset: { width: 0, height: 1.5 }, textShadowRadius: 0 },
  squareTitle: { fontFamily: 'Shark', fontSize: 23, lineHeight: 26, color: '#ffffff' },
  squareFooter: { flexDirection: 'row', alignItems: 'center', width: '100%', gap: 8 },
  squareLogo: { width: 140, height: 35 },
  ctaSmall: { fontFamily: 'Shark', fontSize: 15, color: '#ffcf3b', textAlign: 'center' },
  storeSmall: { fontFamily: 'Knockout', fontSize: 11, color: '#ffffff' },
});
