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
import { forwardRef, memo, useMemo, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import type { InventoryType } from '../models/inventory-type';
import { flexCopy } from './copy';
import { ArtReadinessProvider, FlexArtwork } from './FlexArtwork';
import { FRAMES, RARITY_RAMP, type FlexFrame } from './frames';
import { FlexHero, HERO_ART, Panel } from './FlexHero';
import { FlexShark, SHARK_ASPECT } from './FlexShark';
import { lookExtent } from './lookBounds';
import {
  SQUARE_PRIZE_COL, SQUARE_PRIZE_TILE, STORY_HERO, STORY_HERO_SOLO, STORY_ROW_PAD,
  STORY_WORDS_LIFT, STORY_WORDS_LIFT_PIN, LOOK_BIG_COL, LOOK_ROW_GAP, STICKER_SIZE, STICKER_TILT, TILE_BAND, lookStage, prizeSquareShark, squareStage, stickerWidth, storyStage,
} from './stage';

import { FLEX_SIZE } from './formats';
import { SHARE_LINK_DISPLAY } from './link';
import { Outlined } from './Outlined';
import { QR_BY_CAMPAIGN } from './campaignQr';
import { prizeCampaign } from './link';
import { QR_BY_KIND } from './qr';
import type { FlexCopy, FlexFormat, FlexKind, FlexPayload, FlexPayloads, FlexRarity } from './types';

export { FLEX_EXPORT, FLEX_SIZE } from './formats';
export * from './stage';

export const CARD_CHROME = {
  pattern: require('../../assets/images/shark_background.png'),
  logo: require('../../assets/images/screens/login/logo.png'),
  ribbon: require('../../assets/images/ribbon.png'),
};

/**
 * The story safe zone (pt at 3x): nothing readable above y 230 px or below y 1440 px of 1920,
 * where Instagram's and TikTok's top bar, reply bar and right rail sit. Ribbon, hero, words, plate
 * and the whole footer (wordmark, CTA, link, QR) live between them; the bands carry only
 * decoration (rays, stars, bubbles).
 */
export const STORY_SAFE = { top: 80, bottom: 160 } as const;
/** The footer's bottom edge sits on the safe line (y 1440 px), never in the band. */
export const STORY_FOOTER_BOTTOM = STORY_SAFE.bottom;
/** The story footer's height (wordmark, CTA, link beside a 56 pt QR); the body pads above it. */
export const STORY_FOOTER_H = 68;
/** The body's bottom padding: the safe line, the footer and a small gap above it. */
export const STORY_BODY_BOTTOM = STORY_FOOTER_BOTTOM + STORY_FOOTER_H + 8;
/** The story ribbon: a touch smaller than the square's room allows, so the hero gets the space. */
export const STORY_RIBBON_W = 188;
/** TikTok's right rail (like, comment, share buttons) over the story's right edge, in pt. */
export const STORY_RAIL_W = 40;

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
export const LOOK_SHARK_H = 232;
const LOOK_BLEED = 0.13;

/**
 * "My Complete Look": the dressed shark big in the middle, the set's pieces as a small column of
 * tiles beside it, and the giant "3/3" as a sticker. No medallion, no prop: the look is the brag.
 */
function LookHero({ payload, copy, frame, inventory, motion, sharkH, tile, maxTiles = 4, room, width }: {
  readonly payload: FlexPayload; readonly copy: FlexCopy; readonly frame: FlexFrame; readonly inventory: InventoryType | null | undefined;
  /** The biggest the shark may be (by height) and the biggest a piece tile may be. */
  readonly motion: FlexCardMotion; readonly sharkH: number; readonly tile: number; readonly maxTiles?: number;
  /** The measured hero box. */
  readonly room: number; readonly width: number;
}) {
  const arts = ((payload as FlexPayloads['set_complete']).artUrls ?? []).slice(0, maxTiles);
  const place = lookStage(room, width, arts.length, sharkH, tile, lookExtent(inventory), !!copy.big);
  return (
    <View style={[styles.lookRow, { gap: LOOK_ROW_GAP }]}>
      <View style={[styles.lookTiles, { width: place.tile, gap: place.gap }]}>
        {/* Sky blue, not white or cream: a white piece (a ghost sheet) and a gold one both read on it. */}
        {arts.map((art, i) => (
          <Panel key={i} size={place.tile} colors={LOOK_TILE_FILL} lip="#5d9fd6" rim={frame.rim === '#ffffff' ? '#ffcf3b' : frame.rim} radius={place.tile * 0.22}>
            <FlexArtwork id={`look${i}`} art={art} fallback={HERO_ART.gift} style={{ width: place.tile * 0.78, height: place.tile * 0.78 }} />
          </Panel>
        ))}
      </View>
      {/* Only the paper's clear sides tuck away, so the paint keeps LOOK_ROW_GAP from the tiles and the sticker. */}
      <Animated.View style={[{ width: place.shark * SHARK_ASPECT, height: place.shark, marginVertical: -place.shark * LOOK_BLEED / 2, marginLeft: place.marginLeft, marginRight: place.marginRight }, motion.sharkStyle]}>
        <FlexShark inventory={inventory} height={place.shark} prop={null} />
      </Animated.View>
      {!!copy.big && (
        <View style={[styles.lookBigCol, { width: LOOK_BIG_COL }]}>
          <BigNumber copy={copy} frame={frame} size={44} width={LOOK_BIG_COL - 6} text={motion.bigText} labelSide="bottom" inline style={[styles.lookBig, motion.bigStyle]} />
        </View>
      )}
    </View>
  );
}

/** The look card's piece tiles: light sky blue with a blue lip (Alex's blue/white/gold). */
export const LOOK_TILE_FILL = ['#e3f4ff', '#b5ddff'] as const;

/**
 * Sizes for a story hero without the tile-and-shark stage (a look card, or no shark). Never bigger
 * than the design sizes. Exported for tests.
 */
export function storyHeroSizes(room: number, showShark: boolean, look: boolean): { tile: number; look: number } {
  if (!(room > 0)) return { tile: showShark ? STORY_HERO : STORY_HERO_SOLO, look: LOOK_SHARK_H };
  const fit = room - STORY_ROW_PAD;
  return {
    tile: Math.max(80, Math.min(showShark ? STORY_HERO : STORY_HERO_SOLO, Math.round(fit - 8))),
    // The look shark's paper bleeds LOOK_BLEED into the margins (LookHero), plus the hat room on top.
    look: look ? Math.max(140, Math.min(LOOK_SHARK_H, Math.floor((room - 6) / (1 - LOOK_BLEED)))) : LOOK_SHARK_H,
  };
}

function StoryLayout({ kind, payload, copy, frame, showShark, inventory, motion, look, chestPin }: LayoutProps) {
  const [box, setBox] = useState({ h: 0, w: 0 });
  const size = storyHeroSizes(box.h, showShark, look);
  const staged = showShark && !look;
  const lift = staged ? (chestPin ? STORY_WORDS_LIFT_PIN : STORY_WORDS_LIFT) : 0;
  // The stat sticker stands beside the tile's lower left corner, over its frame band only (never the prize).
  const stickerW = look ? 0 : stickerWidth(copy.big, copy.bigLabel);
  const stage = staged ? storyStage(box.h, box.w, lift, lookExtent(inventory), stickerW) : null;
  const big = !!copy.big && <BigNumber copy={copy} frame={frame} size={STICKER_SIZE} width={stickerW} text={motion.bigText}
    labelLines={2} inline style={motion.bigStyle} />;
  return (
    <>
      <StoryBands frame={frame} />
      <View style={styles.storyBody}>
        <Ribbon text={copy.ribbon} width={STORY_RIBBON_W} />
        <View style={[styles.storyHero, look && styles.storyHeroLook]}
          onLayout={e => setBox({ h: Math.round(e.nativeEvent.layout.height), w: Math.round(e.nativeEvent.layout.width) })}>
          {look ? <LookHero payload={payload} copy={copy} frame={frame} inventory={inventory} motion={motion} sharkH={size.look} tile={72} room={box.h} width={box.w} /> : stage ? (
            <>
              <Animated.View style={[styles.stagePiece, { left: stage.tileLeft, top: stage.tileTop, width: stage.tile, height: stage.tile }, motion.heroStyle]}>
                <FlexHero kind={kind} payload={payload} frame={frame} size={stage.tile} inventory={inventory} />
              </Animated.View>
              {/* In front of the tile and the biggest thing on the card: the kid's shark wearing the prize is
                  the star. No prop here: it would sit on the tile it overlaps (and a worn pin is the brag). */}
              <Animated.View style={[styles.stagePiece, styles.storyShark, { left: stage.sharkLeft, top: stage.sharkTop }, motion.sharkStyle]}>
                <FlexShark inventory={inventory} height={stage.shark} prop={null} pin={chestPin} />
              </Animated.View>
              {/* The giant number stays on top, beside the tile's lower left corner: it overlaps only the frame band. */}
              {big && (
                <View pointerEvents="none" style={[styles.stagePiece, styles.storyBigOver, styles.stickerSlot, { left: stage.stickerLeft, top: stage.tileTop, width: stickerW, height: stage.tile }]}>
                  {big}
                </View>
              )}
            </>
          ) : (
            <View style={styles.storyHeroRow}>
              {big && (
                <View pointerEvents="none" style={[styles.storyBigOver, styles.stickerSlot, { width: stickerW, height: size.tile, marginRight: STICKER_TILT - Math.floor(size.tile * TILE_BAND) }]}>
                  {big}
                </View>
              )}
              <Animated.View style={[{ width: size.tile, height: size.tile }, motion.heroStyle]}>
                <FlexHero kind={kind} payload={payload} frame={frame} size={size.tile} inventory={inventory} />
              </Animated.View>
            </View>
          )}
        </View>
        {/* On a shark card the words ride over the hero's lower edge (the shark's feet tuck behind them). */}
        <View style={[styles.words, staged && { marginTop: -lift }]}>
          <Outlined text={copy.kicker} style={[styles.kicker, { color: frame.ink }]} outline={kickerOutline(frame)} weight={2} lines={1} />
          <Outlined text={copy.title} style={[styles.storyTitle, titleSize(copy.title, 'story')]} outline={frame.outline} lines={1} />
          {copy.rarity && <RarityChip rarity={copy.rarity} />}
        </View>
        {/* The look: the 3/3 sticker already says "the whole set", so the plate's room goes to the shark. */}
        {!look && <StatPlate copy={copy} frame={frame} compact={false} />}
      </View>
      <View style={styles.storyFooter}>
        <Footer kind={kind} payload={payload} copy={copy} frame={frame} logoWidth={108} qr={56} story />
      </View>
    </>
  );
}

/**
 * The story kicker's outline: it rides over the shark's feet, so it needs one. A dark ink (navy, deep
 * red) gets a white outline; a light ink gets the frame's dark outline. Exported for tests.
 */
export function kickerOutline(frame: Pick<FlexFrame, 'ink' | 'outline'>): string {
  const hex = frame.ink.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45 ? '#ffffff' : frame.outline;
}

/** Heroes that are grids of art: the number's caption sits beside it, never across the grid. */

/**
 * Story chrome bands (y 0..240 and 1440..1920 px, STORY_SAFE) sit under Instagram's and
 * TikTok's UI, so they carry only decoration, never words or a QR. The top band has Alex's stars
 * and bubbles; the bottom band is a little sea floor (two flat waves with a foam line, sand, a coin
 * pile and a treasure chest, bubbles rising), so a saved or iMessage copy reads as a finished poster.
 */
const StoryBands = memo(function StoryBands({ frame }: { readonly frame: FlexFrame }) {
  const stars = [{ x: 30, y: 22, s: 22 }, { x: 300, y: 36, s: 18 }, { x: 196, y: 12, s: 12 }, { x: 96, y: 60, s: 12 }];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', left: 180, top: 236 }}>
        <Rays frame={frame} size={1180} />
      </View>
      {stars.map((star, i) => (
        <FlexArtwork key={i} id={`band-star${i}`} art={BAND_STAR} fallback={BAND_STAR}
          style={{ position: 'absolute', left: star.x, top: star.y, width: star.s, height: star.s, opacity: 0.85, transform: [{ rotate: `${i % 2 ? 14 : -12}deg` }] }} />
      ))}
      {[{ x: 250, y: 70, r: 7 }, { x: 128, y: 30, r: 4 }].map((b, i) => <Bubble key={`t${i}`} {...b} />)}
      <SeaFloor />
    </View>
  );
});

/** Story sea floor (pt): the back wave's crest, the front wave's crest, and the sand line. */
export const SEA = { back: 494, front: 512, sand: 590 } as const;

function wavePath(crest: number, amp: number, length: number, phase: number, bottom: number): string {
  let d = `M0,${bottom} L0,${crest}`;
  for (let x = 0; x <= 360; x += 6) d += ` L${x},${(crest + amp * Math.sin(((x + phase) / length) * Math.PI * 2)).toFixed(1)}`;
  return `${d} L360,${bottom} Z`;
}

const SEA_PATHS = {
  back: wavePath(SEA.back, 5, 90, 20, 640),
  front: wavePath(SEA.front, 6, 70, 0, 640),
  sand: wavePath(SEA.sand, 4, 120, 40, 640),
};

/** Flat Alex-style water, sand and treasure under the footer (bottom band only, no words). */
const SeaFloor = memo(function SeaFloor() {
  return (
    <>
      <Svg width={360} height={640} style={StyleSheet.absoluteFill}>
        <Path d={SEA_PATHS.back} fill="#7fd3f7" stroke="#05346e" strokeWidth={3} strokeLinejoin="round" />
        <Path d={SEA_PATHS.front} fill="#2f9be0" stroke="#05346e" strokeWidth={3} strokeLinejoin="round" />
        <Path d={wavePath(SEA.front + 9, 4, 70, 18, SEA.front + 9).replace(/ L360,\S+ Z$/, '')} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={3} strokeLinecap="round" />
        <Path d={SEA_PATHS.sand} fill="#f6d58e" stroke="#05346e" strokeWidth={3} strokeLinejoin="round" />
      </Svg>
      {SEA_BUBBLES.map((b, i) => <Bubble key={`s${i}`} {...b} />)}
      <FlexArtwork id="sea-coins" art={SEA_ART.coins} fallback={SEA_ART.coins} style={{ position: 'absolute', left: 10, top: 548, width: 96, height: 86 }} />
      <FlexArtwork id="sea-chest" art={SEA_ART.chest} fallback={SEA_ART.chest} style={{ position: 'absolute', left: 250, top: 538, width: 100, height: 88, transform: [{ rotate: '6deg' }] }} />
    </>
  );
});

/** Shipped art only (the share props): no new art on the sea floor. */
const SEA_ART = {
  coins: require('../../assets/images/share/props/coin-pile.webp'),
  chest: require('../../assets/images/share/props/treasure.webp'),
};

const SEA_BUBBLES = [{ x: 150, y: 530, r: 7 }, { x: 166, y: 552, r: 4 }, { x: 140, y: 570, r: 5 }, { x: 214, y: 528, r: 5 },
  { x: 226, y: 560, r: 8 }, { x: 118, y: 540, r: 4 }, { x: 196, y: 584, r: 4 }];

function Bubble({ x, y, r }: { readonly x: number; readonly y: number; readonly r: number }) {
  return <View style={{ position: 'absolute', left: x, top: y, width: r * 2, height: r * 2, borderRadius: r,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)', backgroundColor: 'rgba(255,255,255,0.18)' }} />;
}

const BAND_STAR = require('../../assets/images/screens/pin-collections/star.png');

/** An earned prize (Shark Pass step, member pin): no giant number, so the square uses PrizeSquare. */
function prizeOf(kind: FlexKind, payload: FlexPayload): 'pass' | 'member' | null {
  return kind === 'find' ? (payload as FlexPayloads['find']).prize ?? null : null;
}

/**
 * Square prize card, in two columns like the other squares: the kid's dressed shark wearing the prize
 * is the star of the left column (its hat may rise over the ribbon's clear edge); the right column
 * holds the prize tile with its label, then the kicker, title and plate.
 */
function PrizeSquare({ kind, payload, copy, frame, inventory, motion, chestPin, prize }: LayoutProps & { readonly prize: 'pass' | 'member' }) {
  const [room, setRoom] = useState(0);
  const place = prizeSquareShark(room, lookExtent(inventory));
  return (
    <View style={styles.squareBody}>
      <Ribbon text={copy.ribbon} width={226} />
      <View style={styles.prizeRow}>
        <View style={styles.prizeRays}><Rays frame={frame} size={360} /></View>
        <View style={styles.prizeSharkCol} onLayout={e => setRoom(Math.round(e.nativeEvent.layout.height))}>
          <Animated.View style={[styles.prizeShark, { top: place.top, left: place.left }, motion.sharkStyle]}>
            <FlexShark inventory={inventory} height={place.shark} prop={null} pin={chestPin} />
          </Animated.View>
        </View>
        <View style={styles.prizeWords}>
          <View style={styles.prizeTileRow}>
            <Animated.View style={[styles.prizeTile, motion.heroStyle]}>
              <FlexHero kind={kind} payload={payload} frame={frame} size={SQUARE_PRIZE_TILE} inventory={inventory} />
            </Animated.View>
            <View style={[styles.bigLabel, styles.prizeLabel, { backgroundColor: frame.outline }]}>
              <Text style={[styles.bigLabelText, { fontSize: 11 }]} numberOfLines={1}>{prize === 'member' ? 'MEMBER GIFT' : 'SHARK PASS'}</Text>
            </View>
          </View>
          <Outlined text={copy.kicker} style={[styles.kickerSmall, { color: frame.ink }]} outline={kickerOutline(frame)} weight={2} lines={1} />
          <Outlined text={copy.title} style={[styles.squareTitle, titleSize(copy.title, 'square')]} outline={frame.outline} lines={1} />
          <StatPlate copy={copy} frame={frame} compact />
        </View>
      </View>
      <Footer kind={kind} payload={payload} copy={copy} frame={frame} logoWidth={104} qr={42} compact />
    </View>
  );
}

function SquareLayout(props: LayoutProps) {
  const prize = props.look ? null : prizeOf(props.kind, props.payload);
  return prize ? <PrizeSquare {...props} prize={prize} /> : <PlainSquare {...props} />;
}

function PlainSquare({ kind, payload, copy, frame, showShark, inventory, motion, look, chestPin }: LayoutProps) {
  // Square (Instagram feed): ribbon / the hero tile with the player's dressed shark standing in front
  // of its edge (about a third of the card wide, the second thing you see after the big number) /
  // the giant number beside the words / wordmark, CTA, link and QR. Sizes come from the measured
  // stage (squareStage), so no tile, lip or shark ever touches the words.
  const big = !!copy.big;
  // No giant number (a prize, a look): the words center under the stage like the look card.
  const centered = look || !big;
  const [box, setBox] = useState({ h: 0, w: 0 });
  const place = squareStage(box.h, box.w, showShark, lookExtent(inventory));
  return (
    <View style={styles.squareBody}>
      <Ribbon text={copy.ribbon} width={226} />
      <View style={[styles.squareStage, look && styles.squareStageLook]}
        onLayout={e => setBox({ h: Math.round(e.nativeEvent.layout.height), w: Math.round(e.nativeEvent.layout.width) })}>
        <Rays frame={frame} size={360} />
        {look ? <LookHero payload={payload} copy={copy} frame={frame} inventory={inventory} motion={motion} sharkH={SQUARE_LOOK_SHARK_H} tile={44} maxTiles={3} room={box.h} width={box.w} /> : box.h > 0 && (
          <>
            <Animated.View style={[styles.stagePiece, { left: place.tileLeft, top: place.tileTop, width: place.tile, height: place.tile }, motion.heroStyle]}>
              <FlexHero kind={kind} payload={payload} frame={frame} size={place.tile} inventory={inventory} />
            </Animated.View>
            {/* No prop on the square: the dressed shark is the co-star, big enough to read on a feed thumbnail. */}
            {showShark && (
              <Animated.View style={[styles.stagePiece, styles.storyShark, { left: place.sharkLeft, top: place.sharkTop }, motion.sharkStyle]}>
                <FlexShark inventory={inventory} height={place.shark} prop={null} pin={chestPin} />
              </Animated.View>
            )}
          </>
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
          {/* Outlined like every other kicker, so a red or navy kicker reads on any frame. */}
          <Outlined text={copy.kicker} style={[styles.kickerSmall, { color: frame.ink }, centered && { textAlign: 'center' }]} outline={kickerOutline(frame)} weight={2} lines={1} />
          <Outlined text={copy.title} style={[styles.squareTitle, titleSize(copy.title, 'square')]} outline={frame.outline} lines={1} />
          {!look && <StatPlate copy={copy} frame={frame} compact center={centered} />}
        </View>
      </View>
      <Footer kind={kind} payload={payload} copy={copy} frame={frame} logoWidth={104} qr={42} compact tight={!look} />
    </View>
  );
}

/** The square look card's dressed shark: the biggest thing on the card (about 42% of its width). */
export const SQUARE_LOOK_SHARK_H = 196;

/** The giant brag number: a tilted outlined sticker (over the hero on Story), caption above, beside or under it. */
function BigNumber({ copy, frame, size, width, text, style, labelSide = 'top', inline = false, labelLines = 1 }: {
  readonly copy: FlexCopy; readonly frame: FlexFrame; readonly size: number; readonly width: number;
  /** A top label may wrap to this many lines (the story sticker's box is narrow). */
  readonly labelLines?: number;
  readonly text?: string; readonly style?: StyleProp<ViewStyle>;
  readonly labelSide?: 'top' | 'right' | 'bottom';
  /** In the layout flow (Square) instead of an absolute sticker. */
  readonly inline?: boolean;
}) {
  const label = copy.bigLabel ? (
    <View style={[styles.bigLabel, labelSide === 'right' && styles.bigLabelRight, labelSide === 'bottom' && styles.bigLabelBottom, { backgroundColor: frame.outline }]}>
      <Text style={[styles.bigLabelText, { fontSize: size >= 50 ? 11 : 9 }]} numberOfLines={labelSide === 'bottom' ? 2 : labelLines}>{copy.bigLabel}</Text>
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
const Footer = memo(function Footer({ kind, payload, copy, frame, logoWidth, qr, compact = false, story = false, tight = false }: {
  readonly kind: FlexKind; readonly payload: FlexPayload; readonly copy: FlexCopy; readonly frame: FlexFrame; readonly logoWidth: number; readonly qr: number; readonly compact?: boolean; readonly story?: boolean;
  /** Square: the footer takes only its own height, so the stage above gets all the spare room. */
  readonly tight?: boolean;
}) {
  return <CardFooter cta={copy.cta} qrArt={flexQr(kind, payload)} frame={frame} logoWidth={logoWidth} qr={qr} compact={compact} story={story} tight={tight} />;
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
export const CardFooter = memo(function CardFooter({ cta, qrArt, frame, logoWidth, qr, compact = false, story = false, tight = false }: {
  readonly cta: string; readonly qrArt: number; readonly frame: FlexFrame; readonly logoWidth: number; readonly qr: number; readonly compact?: boolean;
  readonly tight?: boolean;
  /** Story: no top margin (the body pads STORY_FOOTER_H above it) and the QR clear of TikTok's right rail. */
  readonly story?: boolean;
}) {
  return (
    <View style={[styles.footer, compact && styles.footerCompact, tight && styles.footerTight, story && styles.footerStory]}>
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
  const size = format === 'story' ? (n <= 20 ? 30 : n <= 28 ? 26 : 22) : (n <= 14 ? 23 : n <= 24 ? 20 : 17);
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
  storyBody: { flex: 1, alignItems: 'center', paddingTop: STORY_SAFE.top, paddingBottom: STORY_BODY_BOTTOM, paddingHorizontal: 20 },
  storyHero: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  // The hat clears the ribbon: the dressed shark sits a little lower than the centre.
  storyHeroLook: { paddingTop: 6 },
  // paddingBottom: the tile's lip and shadow hang below its box, clear of the words.
  storyHeroRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', width: '100%', paddingBottom: STORY_ROW_PAD },
  stagePiece: { position: 'absolute' },
  storyFooter: { position: 'absolute', left: 20, right: 20, bottom: STORY_FOOTER_BOTTOM },
  storyShark: { zIndex: 2 },
  storyBigOver: { zIndex: 3 },
  // The sticker sits at the bottom of a slot the tile's height (its box never passes the tile's bottom).
  stickerSlot: { justifyContent: 'flex-end', alignItems: 'flex-start' },
  // zIndex: the words ride over the shark's feet.
  words: { alignItems: 'center', width: '100%', marginTop: 4, zIndex: 4 },
  kicker: { fontFamily: 'Shark', fontSize: 17, textAlign: 'center' },
  storyTitle: { fontFamily: 'Shark', fontSize: 32, lineHeight: 36, color: '#ffffff', textAlign: 'center' },

  bigWrap: { position: 'absolute', alignItems: 'flex-start' },
  bigLabel: { marginBottom: -4, marginLeft: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, zIndex: 1 },
  bigLabelRight: { marginBottom: 10, marginLeft: 6 },
  bigLabelBottom: { marginBottom: 0, marginTop: -2, marginLeft: 2, alignSelf: 'flex-start', maxWidth: 124 },
  bigInline: { alignItems: 'flex-start', transform: [{ rotate: '-6deg' }] },
  bigLabelText: { fontFamily: 'Shark', color: '#ffffff', letterSpacing: 0.5 },

  footer: { flexDirection: 'row', alignItems: 'center', width: '100%', marginTop: 8, gap: 10 },
  // TikTok's right rail covers about the right 50 pt of a story from y 300 pt down: the QR stays left of it.
  footerStory: { marginTop: 0, paddingRight: STORY_RAIL_W },
  footerCompact: { flex: 1, marginTop: 0, gap: 6, alignItems: 'flex-end' },
  footerTight: { flex: 0 },
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

  // 20 pt sides and 14 pt bottom: the QR sits 20 pt from the edge (never touching the frame).
  squareBody: { flex: 1, alignItems: 'center', paddingTop: 6, paddingBottom: 14, paddingHorizontal: 20 },
  squareStage: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  // flex 3: the compact footer is flex 1 too, so the shark's row takes most of the spare room.
  prizeRow: { flex: 3, flexDirection: 'row', width: '100%', marginBottom: 10 },
  prizeRays: { position: 'absolute', left: SQUARE_PRIZE_COL / 2, top: '50%', width: 0, height: 0 },
  prizeSharkCol: { width: SQUARE_PRIZE_COL },
  prizeShark: { position: 'absolute' },
  prizeWords: { flex: 1, justifyContent: 'center', paddingLeft: 6 },
  prizeTileRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4 },
  prizeTile: { width: SQUARE_PRIZE_TILE, height: SQUARE_PRIZE_TILE, transform: [{ rotate: '-5deg' }] },
  prizeLabel: { marginLeft: -6, marginBottom: 8, marginTop: 0 },
  // marginBottom: at least 10 pt between the plate and the footer.
  squareWordsRow: { flexDirection: 'row', alignItems: 'center', width: '100%', gap: 8, marginTop: 8, marginBottom: 10 },
  squareWordsLook: { justifyContent: 'center' },
  // The look's stage takes most of the spare room (the footer shares it otherwise).
  squareStageLook: { flex: 2.6, paddingTop: 14 },
  squareWordsLookCol: { flex: 1, alignItems: 'center' },
  squareBigCol: { width: 128, alignItems: 'flex-start' },
  kickerSmall: { fontFamily: 'Shark', fontSize: 15 },
  squareTitle: { fontFamily: 'Shark', fontSize: 20, lineHeight: 23, color: '#ffffff' },
});
