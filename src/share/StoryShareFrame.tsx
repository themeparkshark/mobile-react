/**
 * The story-size frame (9:16, saved at 1080x1920) for share pictures outside the Share
 * Studio kinds: a ride log card, a mini-game result, a Closet look. It is built from the Flex
 * card's own pieces (StoryChrome background, Alex's gold ribbon, CardFooter with the one logo,
 * CTA, link and QR), so every share picture looks like the same family.
 * Kid safety: callers pass no player names, typed notes, dates or crew names.
 */
import { forwardRef, useContext, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { AuthContext } from '../context/AuthProvider';
import { QR_BY_CAMPAIGN, type ShareCampaign } from './campaignQr';
import { CardFooter, Ribbon, STORY_BODY_BOTTOM, STORY_FOOTER_BOTTOM, STORY_RIBBON_W, STORY_SAFE, StoryChrome } from './FlexCard';
import { FlexShark, SHARK_ASPECT } from './FlexShark';
import { FLEX_SIZE } from './formats';
import { FRAMES } from './frames';

export interface StoryShareFrameProps {
  /** The gold ribbon headline, short and ALL CAPS ("MY RIDE!"). */
  readonly ribbon: string;
  readonly cta: string;
  readonly campaign: ShareCampaign;
  readonly children: ReactNode;
  /** The player's own dressed shark peeks over the card's top right corner (a game result). */
  readonly withShark?: boolean;
}

/**
 * The peeking shark (pt): its paper height, how far its painted feet come down over the card's top
 * edge, and how far its paint may pass the card's right edge. It is drawn at full size outside the
 * card's scale, so a tall card (Memory) never shrinks to make room for it.
 */
export const PEEK = { h: 150, over: 30, right: 12 } as const;
/** The shark paper: the painted feet sit at 0.82 of its height and a hat reaches up to 0.1. */
const PAPER_FEET = 0.82;
const PAPER_HAT = 0.1;
/** The frame's centre line and the furthest right any paint may reach (the body's 20 pt side pad). */
const MID_X = FLEX_SIZE.story.width / 2;
const MAX_RIGHT = FLEX_SIZE.story.width - 20;
/** The slot pads its card 10 pt top and bottom. */
const SLOT_PAD = 10;

const FRAME = FRAMES.common;

/** Shrink the card to fit the space between the ribbon and the footer (never grow it). Exported for tests. */
export function fitScale(available: number, content: number): number {
  if (!(available > 0) || !(content > 0)) return 1;
  return Math.min(1, available / content);
}

/**
 * Where the card and the peeking shark sit, for a slot at y `slotY` (frame pt) `slotH` tall and a card
 * of `cardW` x `cardH` pt. The shark's hat must stay below the safe line (STORY_SAFE.top), so the card
 * gives up only the headroom the slot lacks for it (`reserve`), never a fixed band. Exported for tests.
 */
export function peekLayout(slotY: number, slotH: number, cardW: number, cardH: number, withShark: boolean) {
  const rise = PEEK.h * (PAPER_FEET - PAPER_HAT) - PEEK.over;
  const reserve = withShark ? Math.max(0, Math.ceil(rise - (slotY + SLOT_PAD - STORY_SAFE.top))) : 0;
  const scale = fitScale(slotH - 2 * SLOT_PAD - reserve, cardH);
  const centre = slotY + SLOT_PAD + reserve + (slotH - 2 * SLOT_PAD - reserve) / 2;
  const cardTop = centre - (cardH * scale) / 2;
  const cardRight = MID_X + (cardW * scale) / 2;
  const sharkW = PEEK.h * SHARK_ASPECT;
  return {
    reserve, scale, cardTop,
    sharkLeft: Math.round(Math.min(MAX_RIGHT, cardRight + PEEK.right) - sharkW * PAPER_FEET),
    sharkTop: Math.round(cardTop + PEEK.over - PEEK.h * PAPER_FEET),
  };
}

export const StoryShareFrame = forwardRef<View, StoryShareFrameProps>(function StoryShareFrame({ ribbon, cta, campaign, children, withShark = false }, ref) {
  const { player } = useContext(AuthContext);
  const [slot, setSlot] = useState({ y: 0, h: 0 });
  const [card, setCard] = useState({ w: 0, h: 0 });
  const peek = peekLayout(slot.y, slot.h, card.w, card.h, withShark);
  return (
    <View ref={ref} collapsable={false} style={[styles.frame, { backgroundColor: FRAME.bg[1] }]}>
      <StoryChrome frame={FRAME} />
      <View style={styles.body}>
        <Ribbon text={ribbon} width={STORY_RIBBON_W} />
        <View style={[styles.slot, { paddingTop: SLOT_PAD + peek.reserve }]} onLayout={e => setSlot({ y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height })}>
          <View onLayout={e => setCard({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
            style={peek.scale < 1 && { transform: [{ scale: peek.scale }] }}>
            {children}
          </View>
        </View>
      </View>
      {/* The kid's own dressed shark (no prop) leans over the card's top right corner: the result is theirs.
          Full size, outside the card's scale, and its hat stays below the safe line. */}
      {withShark && slot.h > 0 && card.h > 0 && (
        <View pointerEvents="none" style={[styles.peek, { left: peek.sharkLeft, top: peek.sharkTop }]}>
          <FlexShark inventory={player?.inventory} height={PEEK.h} prop={null} />
        </View>
      )}
      {/* The footer ends on the safe line (y 1440 px), like every Flex card: the band below is decoration only. */}
      <View style={styles.footer}>
        <CardFooter cta={cta} qrArt={QR_BY_CAMPAIGN[campaign]} frame={FRAME} logoWidth={108} qr={56} story />
      </View>
    </View>
  );
});

/** Wrap a StoryShareFrame in this to keep it off screen (captured on demand). */
export const OFFSCREEN = { position: 'absolute', left: -4000, top: 0 } as const;

const styles = StyleSheet.create({
  frame: { ...FLEX_SIZE.story, overflow: 'hidden' },
  body: { flex: 1, alignItems: 'center', paddingTop: STORY_SAFE.top, paddingBottom: STORY_BODY_BOTTOM, paddingHorizontal: 20 },
  footer: { position: 'absolute', left: 20, right: 20, bottom: STORY_FOOTER_BOTTOM },
  // The card sits centered in the space between the ribbon and the footer.
  peek: { position: 'absolute', zIndex: 2 },
  slot: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', paddingBottom: SLOT_PAD, overflow: 'visible' },
});
