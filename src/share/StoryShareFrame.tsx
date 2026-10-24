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
import { FlexShark } from './FlexShark';
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
 * The peeking shark (pt): its paper height, how much room the frame keeps above the card for it,
 * and how far its painted feet come down over the card's top edge (the card's corner padding).
 */
export const PEEK = { h: 176, above: 88, over: 40, right: -24 } as const;

const FRAME = FRAMES.common;

/** Shrink the card to fit the space between the ribbon and the footer (never grow it). Exported for tests. */
export function fitScale(available: number, content: number): number {
  if (!(available > 0) || !(content > 0)) return 1;
  return Math.min(1, available / content);
}

export const StoryShareFrame = forwardRef<View, StoryShareFrameProps>(function StoryShareFrame({ ribbon, cta, campaign, children, withShark = false }, ref) {
  const { player } = useContext(AuthContext);
  const [room, setRoom] = useState(0);
  const [tall, setTall] = useState(0);
  const scale = fitScale(room - 20, tall); // the slot pads 10 pt top and bottom
  return (
    <View ref={ref} collapsable={false} style={[styles.frame, { backgroundColor: FRAME.bg[1] }]}>
      <StoryChrome frame={FRAME} />
      <View style={styles.body}>
        <Ribbon text={ribbon} width={STORY_RIBBON_W} />
        <View style={styles.slot} onLayout={e => setRoom(e.nativeEvent.layout.height)}>
          <View onLayout={e => setTall(e.nativeEvent.layout.height)} style={[withShark && { paddingTop: PEEK.above }, scale < 1 && { transform: [{ scale }] }]}>
            <View>
              {children}
              {/* The kid's shark leans over the card's corner (no prop): the result is theirs. */}
              {withShark && (
                <View pointerEvents="none" style={[styles.peek, { top: Math.round(PEEK.over - PEEK.h * 0.82), right: PEEK.right }]}>
                  <FlexShark inventory={player?.inventory} height={PEEK.h} prop={null} />
                </View>
              )}
            </View>
          </View>
        </View>
      </View>
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
  slot: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, overflow: 'visible' },
});
