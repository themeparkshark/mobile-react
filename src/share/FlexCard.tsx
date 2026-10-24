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
import { FlexHero, HERO_ART, Panel } from './FlexHero';
import { FlexShark, SHARK_ASPECT } from './FlexShark';
import { FLEX_SIZE } from './formats';
import { SHARE_LINK_DISPLAY } from './link';
import { Outlined } from './Outlined';
import { QR_BY_CAMPAIGN } from './campaignQr';
import { prizeCampaign } from './link';
import { QR_BY_KIND } from './qr';
import type { FlexCopy, FlexFormat, FlexKind, FlexPayload, FlexPayloads, FlexRarity } from './types';

export { FLEX_EXPORT, FLEX_SIZE } from './formats';

export const CARD_CHROME = {
  pattern: require('../../assets/images/shark_background.png'),
  logo: require('../../assets/images/screens/login/logo.png'),
  ribbon: require('../../assets/images/ribbon.png'),
};

/** Instagram/TikTok Story chrome covers the top ~250 px and bottom ~340 px of 1920 (pt at 3x). */
export const STORY_SAFE = { top: 84, bottom: 114 } as const;
/**
 * The footer (wordmark, CTA, link, QR) is the one part that sits in the bottom band, this far from
 * the bottom edge: the brag (ribbon, hero, name, plate) stays in the safe zone and gets the room, and
 * the card reads full instead of ending in a quarter of empty rays. The link also goes on the
 * clipboard, and a QR is for a saved or shown picture, where no app chrome covers it.
 */
export const STORY_FOOTER_BOTTOM = 34;

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
  const props: LayoutProps = { kind, payload, copy, frame, showShark: !copy.hideShark, inventory: shark, motion: motion ?? {},
    look: isLookSet(kind, payload) && !!shark?.skin_item,
    // A worn prize pin (Shark Pass, member pin) shows on the shark's chest: the picture proves it is on.
    chestPin: kind === 'find' && !!payload.inventory?.pin_item };
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
  /** A finished shop set worn by the shark: the dressed shark is the hero, the pieces sit beside it. */
  readonly look: boolean;
  readonly chestPin?: boolean;
}

/** A shop set ("My Complete Look"): the card is about the shark wearing it. Exported for tests. */
export function isLookSet(kind: FlexKind, payload: FlexPayload): boolean {
  return kind === 'set_complete' && (payload as FlexPayloads['set_complete']).source === 'shop';
}

/**
 * The look card's shark: about half the card's width, the biggest thing on the card. The paper
 * canvas has empty space above and below the shark, so LOOK_BLEED of it may hang into the margins.
 */
export const LOOK_SHARK_H = 274;
const LOOK_BLEED = 0.13;
const LOOK_SIDE = 0.04;

/**
 * "My Complete Look": the dressed shark big in the middle, the set's pieces as a small column of
 * tiles beside it, and the giant "3/3" as a sticker. No medallion, no prop: the look is the brag.
 */
function LookHero({ payload, copy, frame, inventory, motion, sharkH, tile, maxTiles = 4 }: {
  readonly payload: FlexPayload; readonly copy: FlexCopy; readonly frame: FlexFrame; readonly inventory: InventoryType | null | undefined;
  readonly motion: FlexCardMotion; readonly sharkH: number; readonly tile: number; readonly maxTiles?: number;
}) {
  const arts = ((payload as FlexPayloads['set_complete']).artUrls ?? []).slice(0, maxTiles);
  return (
    <View style={styles.lookRow}>
      <View style={[styles.lookTiles, { width: tile, gap: Math.round(tile * 0.15) }]}>
        {arts.map((art, i) => (
          <Panel key={i} size={tile} colors={['#ffffff', '#fff6dc']} lip="#d9b25a" rim={frame.rim === '#ffffff' ? '#ffcf3b' : frame.rim} radius={tile * 0.22}>
            <FlexArtwork id={`look${i}`} art={art} fallback={HERO_ART.gift} style={{ width: tile * 0.74, height: tile * 0.74 }} />
          </Panel>
        ))}
      </View>
      {/* The paper has clear space at its sides too, so the tiles and the sticker may tuck into it. */}
      <Animated.View style={[{ width: sharkH * SHARK_ASPECT, height: sharkH, marginVertical: -sharkH * LOOK_BLEED / 2, marginHorizontal: -sharkH * LOOK_SIDE }, motion.sharkStyle]}>
        <FlexShark inventory={inventory} height={sharkH} prop={null} />
      </Animated.View>
      {!!copy.big && (
        <View style={[styles.lookBigCol, { width: tile + 18 }]}>
          <BigNumber copy={copy} frame={frame} size={44} width={tile + 40} text={motion.bigText} labelSide="bottom" inline style={[styles.lookBig, motion.bigStyle]} />
        </View>
      )}
    </View>
  );
}

/** Story: hero box, giant number and shark sizes (pt). The shark is ~47% of the card's width. */
export const STORY_HERO = 160;
export const STORY_SHARK_H = 190;

function StoryLayout({ kind, payload, copy, frame, showShark, inventory, motion, look, chestPin }: LayoutProps) {
  return (
    <>
      <StoryBands frame={frame} />
      <View style={styles.storyBody}>
        <Ribbon text={copy.ribbon} width={256} />
        <View style={[styles.storyHero, look && styles.storyHeroLook]}>
          {look ? <LookHero payload={payload} copy={copy} frame={frame} inventory={inventory} motion={motion} sharkH={LOOK_SHARK_H} tile={44} /> : (
          <View style={[styles.storyHeroRow, !showShark && { justifyContent: 'center' }]}>
            <Animated.View style={[{ width: STORY_HERO, height: STORY_HERO }, motion.heroStyle]}>
              <FlexHero kind={kind} payload={payload} frame={frame} size={STORY_HERO} inventory={inventory} />
              {!!copy.big && <BigNumber copy={copy} frame={frame} size={62} width={210} text={motion.bigText}
                labelSide={LABEL_BESIDE.has(kind) ? 'right' : 'top'} style={[styles.storyBig, motion.bigStyle]} />}
            </Animated.View>
            {showShark && (
              <Animated.View style={[styles.storyShark, motion.sharkStyle]}>
                <FlexShark inventory={inventory} height={STORY_SHARK_H} prop={copy.prop} pin={chestPin} />
              </Animated.View>
            )}
          </View>
          )}
        </View>
        <View style={styles.words}>
          <Text style={[styles.kicker, { color: frame.ink }]} numberOfLines={1}>{copy.kicker}</Text>
          <Outlined text={copy.title} style={[styles.storyTitle, titleSize(copy.title, 'story')]} outline={frame.outline} lines={1} />
          {copy.rarity && <RarityChip rarity={copy.rarity} />}
        </View>
        {/* The look: the 3/3 sticker already says "the whole set", so the plate's room goes to the shark. */}
        {!look && <StatPlate copy={copy} frame={frame} compact={false} />}
      </View>
      <View style={styles.storyFooter}>
        <Footer kind={kind} payload={payload} copy={copy} frame={frame} logoWidth={120} qr={56} />
      </View>
    </>
  );
}

/** Heroes that are grids of art: the number's caption sits beside it, never across the grid. */
const LABEL_BESIDE: ReadonlySet<FlexKind> = new Set<FlexKind>(['fright_night', 'park_day']);

/**
 * Story chrome bands (y 0..252 and 1578..1920 px) sit under Instagram's UI, so
 * they carry only decoration: the rays run the full card from the hero, and a
 * few of Alex's stars and bubbles float in each band, so a saved or iMessage
 * copy never looks empty.
 */
const StoryBands = memo(function StoryBands({ frame }: { readonly frame: FlexFrame }) {
  const stars = [
    { x: 30, y: 22, s: 22 }, { x: 300, y: 36, s: 18 }, { x: 196, y: 12, s: 12 }, { x: 96, y: 60, s: 12 },
    // Bottom band: a thin row under the footer (it sits STORY_FOOTER_BOTTOM from the edge), never over it.
    { x: 34, y: 614, s: 16 }, { x: 300, y: 616, s: 16 }, { x: 172, y: 620, s: 12 }, { x: 236, y: 614, s: 12 },
  ];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', left: 180, top: 236 }}>
        <Rays frame={frame} size={1180} />
      </View>
      {stars.map((star, i) => (
        <FlexArtwork key={i} id={`band-star${i}`} art={BAND_STAR} fallback={BAND_STAR}
          style={{ position: 'absolute', left: star.x, top: star.y, width: star.s, height: star.s, opacity: 0.85, transform: [{ rotate: `${i % 2 ? 14 : -12}deg` }] }} />
      ))}
      {[{ x: 250, y: 70, r: 7 }, { x: 128, y: 30, r: 4 }, { x: 104, y: 616, r: 5 }, { x: 330, y: 618, r: 4 }].map((b, i) => (
        <View key={`b${i}`} style={{ position: 'absolute', left: b.x, top: b.y, width: b.r * 2, height: b.r * 2, borderRadius: b.r,
          borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)', backgroundColor: 'rgba(255,255,255,0.15)' }} />
      ))}
    </View>
  );
});

const BAND_STAR = require('../../assets/images/screens/pin-collections/star.png');

function SquareLayout({ kind, payload, copy, frame, showShark, inventory, motion, look, chestPin }: LayoutProps) {
  // Square (Instagram feed): ribbon / the hero and the player's shark side by side (the shark is a
  // co-star holding its prop, ~37% of the width) / the giant number beside the words / wordmark,
  // CTA, link and QR. Nothing overlaps and nothing leaves the canvas.
  // 112: the panel's lip and shadow hang below its box, so 124 touched the kicker under it.
  const heroSize = 112;
  const big = !!copy.big;
  // No giant number (a prize, a look): the words center under the stage like the look card, and the
  // stage takes the spare room, so no dead band sits above the footer.
  const centered = look || !big;
  return (
    <View style={styles.squareBody}>
      <Ribbon text={copy.ribbon} width={226} />
      <View style={[styles.squareStage, centered && styles.squareStageLook]}>
        <Rays frame={frame} size={360} />
        {look ? <LookHero payload={payload} copy={copy} frame={frame} inventory={inventory} motion={motion} sharkH={SQUARE_LOOK_SHARK_H} tile={30} maxTiles={3} /> : (
        <View style={[styles.squareStageRow, !showShark && { justifyContent: 'center' }]}>
          <Animated.View style={[{ width: heroSize, height: heroSize }, motion.heroStyle]}>
            <FlexHero kind={kind} payload={payload} frame={frame} size={heroSize} inventory={inventory} />
          </Animated.View>
          {showShark && (
            <Animated.View style={[styles.squareShark, motion.sharkStyle]}>
              <FlexShark inventory={inventory} height={SQUARE_SHARK_H} prop={copy.prop} pin={chestPin} />
            </Animated.View>
          )}
        </View>
        )}
      </View>
      {/* The look: words centered under the dressed shark like Story; the 3/3 sticker already says "the
          whole set", so the stat plate stays off and the shark gets that room. */}
      <View style={[styles.squareWordsRow, centered && styles.squareWordsLook]}>
        {big && !look && (
          <View style={styles.squareBigCol}>
            <BigNumber copy={copy} frame={frame} size={52} width={128} text={motion.bigText} labelSide="bottom" inline style={motion.bigStyle} />
          </View>
        )}
        <View style={centered ? styles.squareWordsLookCol : { flex: 1 }}>
          <Text style={[styles.kickerSmall, { color: frame.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{copy.kicker}</Text>
          <Outlined text={copy.title} style={[styles.squareTitle, titleSize(copy.title, 'square')]} outline={frame.outline} lines={1} />
          {!look && <StatPlate copy={copy} frame={frame} compact center={centered} />}
        </View>
      </View>
      <Footer kind={kind} payload={payload} copy={copy} frame={frame} logoWidth={104} qr={42} compact />
    </View>
  );
}

/** The square card's shark: a co-star beside the hero (~37% of the width), holding its prop. */
export const SQUARE_SHARK_H = 150;
/** The square look card's dressed shark: the biggest thing on the card (about 42% of its width). */
export const SQUARE_LOOK_SHARK_H = 196;

/** The giant brag number: a tilted outlined sticker (over the hero on Story), caption above, beside or under it. */
function BigNumber({ copy, frame, size, width, text, style, labelSide = 'top', inline = false }: {
  readonly copy: FlexCopy; readonly frame: FlexFrame; readonly size: number; readonly width: number;
  readonly text?: string; readonly style?: StyleProp<ViewStyle>;
  readonly labelSide?: 'top' | 'right' | 'bottom';
  /** In the layout flow (Square) instead of an absolute sticker. */
  readonly inline?: boolean;
}) {
  const label = copy.bigLabel ? (
    <View style={[styles.bigLabel, labelSide === 'right' && styles.bigLabelRight, labelSide === 'bottom' && styles.bigLabelBottom, { backgroundColor: frame.outline }]}>
      <Text style={[styles.bigLabelText, { fontSize: size >= 50 ? 11 : 9 }]} numberOfLines={labelSide === 'bottom' ? 2 : 1}>{copy.bigLabel}</Text>
    </View>
  ) : null;
  const number = (
    <Outlined text={text ?? copy.big ?? ''} outline={frame.outline} weight={Math.max(2.5, size * 0.075)}
      style={{ fontFamily: 'Shark', fontSize: size, lineHeight: Math.round(size * 1.08), color: frame.bigFill, textAlign: 'left' }} />
  );
  return (
    <Animated.View pointerEvents="none" style={[inline ? styles.bigInline : styles.bigWrap, { width }, style]}>
      {labelSide === 'top' && label}
      {labelSide === 'right'
        ? <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}><View>{number}</View>{label}</View>
        : number}
      {labelSide === 'bottom' && label}
    </Animated.View>
  );
}

/** Wordmark + CTA + the readable short link, and the per-kind QR. */
const Footer = memo(function Footer({ kind, payload, copy, frame, logoWidth, qr, compact = false }: {
  readonly kind: FlexKind; readonly payload: FlexPayload; readonly copy: FlexCopy; readonly frame: FlexFrame; readonly logoWidth: number; readonly qr: number; readonly compact?: boolean;
}) {
  return <CardFooter cta={copy.cta} qrArt={flexQr(kind, payload)} frame={frame} logoWidth={logoWidth} qr={qr} compact={compact} />;
});

/** The QR for a card: its kind's, or a prize's own campaign (Shark Pass, member pin), like flexShareUrl. */
export function flexQr(kind: FlexKind, payload: FlexPayload): number {
  const campaign = prizeCampaign(kind, payload);
  return campaign ? QR_BY_CAMPAIGN[campaign] : QR_BY_KIND[kind];
}

/**
 * The one share footer every picture uses (Flex cards and the story frame): the TPS wordmark,
 * the CTA, the readable link, and a QR that scans to that link.
 */
export const CardFooter = memo(function CardFooter({ cta, qrArt, frame, logoWidth, qr, compact = false }: {
  readonly cta: string; readonly qrArt: number; readonly frame: FlexFrame; readonly logoWidth: number; readonly qr: number; readonly compact?: boolean;
}) {
  return (
    <View style={[styles.footer, compact && styles.footerCompact]}>
      <View style={{ flex: 1, alignItems: compact ? 'center' : 'flex-start' }}>
        <FlexArtwork art={CARD_CHROME.logo} fallback={CARD_CHROME.logo} style={{ width: logoWidth, height: Math.round(logoWidth / 4) }} />
        <Outlined text={cta} style={[compact ? styles.ctaSmall : styles.cta, { color: frame.cta }]} outline={frame.outline} lines={1} />
        <Text style={[compact ? styles.linkSmall : styles.link, { color: frame.small }]} numberOfLines={1}>{SHARE_LINK_DISPLAY}</Text>
      </View>
      <View style={[styles.qrTile, { width: qr + 8, height: qr + 8 }]}>
        <FlexArtwork id="qr" art={qrArt} fallback={qrArt} style={{ width: qr, height: qr }} />
      </View>
    </View>
  );
});

/** The story background every share picture uses: gradient, Alex's shark water, rays, stars and bubbles. */
export const StoryChrome = memo(function StoryChrome({ frame }: { readonly frame: FlexFrame }) {
  return <><Backdrop frame={frame} format="story" /><StoryBands frame={frame} /></>;
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
export const Ribbon = memo(function Ribbon({ text, width }: { readonly text: string; readonly width: number }) {
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
const StatPlate = memo(function StatPlate({ copy, frame, compact, center = false }: { readonly copy: FlexCopy; readonly frame: FlexFrame; readonly compact: boolean; readonly center?: boolean }) {
  return (
    <View style={[styles.plate, compact && styles.plateCompact, { backgroundColor: frame.plate, borderColor: frame.outline }]}>
      <Text style={[styles.statLine, compact && styles.statLineCompact, center && { textAlign: 'center' }, { color: frame.plateInk }]} numberOfLines={2}>{copy.stat}</Text>
      {/* Square (compact) keeps one line: a second line squeezed the hero into the words. */}
      {!!copy.sub && !compact && <Text style={[styles.subLine, { color: frame.plateInk }]}
        numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{copy.sub}</Text>}
    </View>
  );
});


const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  rays: { position: 'absolute', left: '50%', top: '50%', alignItems: 'center', justifyContent: 'center' },

  lookRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', gap: 8 },
  lookTiles: { alignItems: 'center' },
  lookBigCol: { alignItems: 'center', justifyContent: 'center' },
  lookBig: { transform: [{ rotate: '-8deg' }] },
  storyBody: { flex: 1, alignItems: 'center', paddingTop: STORY_SAFE.top, paddingBottom: STORY_SAFE.bottom, paddingHorizontal: 20 },
  storyHero: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  // The hat clears the ribbon: the dressed shark sits a little lower than the centre.
  storyHeroLook: { paddingTop: 22 },
  storyHeroRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', width: '100%', paddingLeft: 8 },
  storyFooter: { position: 'absolute', left: 20, right: 20, bottom: STORY_FOOTER_BOTTOM },
  storyShark: { marginRight: -18, marginBottom: -20 },
  storyBig: { left: -24, bottom: -8, transform: [{ rotate: '-8deg' }] },
  words: { alignItems: 'center', width: '100%', marginTop: 12 },
  kicker: { fontFamily: 'Shark', fontSize: 18, textShadowColor: 'rgba(3,20,48,0.35)', textShadowOffset: { width: 0, height: 1.5 }, textShadowRadius: 0 },
  storyTitle: { fontFamily: 'Shark', fontSize: 32, lineHeight: 36, color: '#ffffff', textAlign: 'center' },

  bigWrap: { position: 'absolute', alignItems: 'flex-start' },
  bigLabel: { marginBottom: -4, marginLeft: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, zIndex: 1 },
  bigLabelRight: { marginBottom: 10, marginLeft: 6 },
  bigLabelBottom: { marginBottom: 0, marginTop: -2, marginLeft: 2, alignSelf: 'flex-start', maxWidth: 124 },
  bigInline: { alignItems: 'flex-start', transform: [{ rotate: '-6deg' }] },
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

  squareBody: { flex: 1, alignItems: 'center', paddingTop: 6, paddingBottom: 8, paddingHorizontal: 14 },
  squareStage: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', paddingTop: 14 },
  squareStageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingHorizontal: 10 },
  squareShark: { marginRight: -14, marginTop: 6, marginBottom: -14 },
  squareWordsRow: { flexDirection: 'row', alignItems: 'center', width: '100%', gap: 8, marginTop: 8 },
  squareWordsLook: { justifyContent: 'center', marginTop: 12 },
  // The look's stage takes most of the spare room (the footer shares it otherwise).
  squareStageLook: { flex: 2.6 },
  squareWordsLookCol: { flex: 1, alignItems: 'center' },
  squareBigCol: { width: 128, alignItems: 'flex-start' },
  kickerSmall: { fontFamily: 'Shark', fontSize: 14, textShadowColor: 'rgba(3,20,48,0.35)', textShadowOffset: { width: 0, height: 1.5 }, textShadowRadius: 0 },
  squareTitle: { fontFamily: 'Shark', fontSize: 20, lineHeight: 23, color: '#ffffff' },
});
