import { memo } from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BRAND } from '../../ui';
import { ticketLine } from './homeFindCopy';

const HIT = { top: 8, bottom: 8, left: 4, right: 4 };
const TICKET = require('../../../assets/images/ticket-icon.png');
/** Alex's paper-and-pencil (ui_home slice47): a story, not a currency. */
const STORY = require('../../../assets/images/home/story-chip.webp');

export interface ParkStoryChip {
  readonly title: string;
  readonly points: number;
  readonly goal: number;
  readonly onPress: () => void;
}

/**
 * The home map's top HUD row: small chips only, never a card. The free-Ticket countdown (a ticket and
 * three pips; tap for the line) and the park story (a paper-and-pencil and n/goal; tap opens the story).
 */
function HomeHudChips({ top, onWidth, findsUntilTicket, ticketsCapped = false, onTicketPress, parkStory = null }: {
  readonly top: number;
  /** The row's width, so the map can keep finds out from under it. */
  readonly onWidth?: (width: number) => void;
  readonly findsUntilTicket: number | null | undefined;
  readonly ticketsCapped?: boolean;
  readonly onTicketPress: (line: string) => void;
  readonly parkStory?: ParkStoryChip | null;
}) {
  const line = ticketLine(findsUntilTicket, ticketsCapped);
  const remaining = findsUntilTicket == null ? 3 : Math.max(1, Math.min(3, Math.round(findsUntilTicket)));
  if (!line && !parkStory) return null;
  return (
    <View style={[styles.row, { top }]} pointerEvents="box-none" onLayout={event => onWidth?.(Math.round(event.nativeEvent.layout.width))}>
      {line && (
        <Pressable accessibilityRole="button" accessibilityLabel={line} onPress={() => onTicketPress(line)} hitSlop={HIT}
          style={styles.chip}>
          <Image source={TICKET} style={styles.ticket} contentFit="contain" />
          <View style={styles.pips}>
            {[0, 1, 2].map(i => <View key={i} style={[styles.pip, i < 3 - remaining && styles.pipOn]} />)}
          </View>
        </Pressable>
      )}
      {parkStory && (
        <Pressable accessibilityRole="button" hitSlop={HIT} onPress={parkStory.onPress} style={styles.chip}
          accessibilityLabel={`Park story: ${parkStory.title}. ${parkStory.points} of ${parkStory.goal} signals. Open story.`}>
          <Image source={STORY} style={styles.story} contentFit="contain" />
          <Text style={styles.text}>{parkStory.points}/{parkStory.goal}</Text>
        </Pressable>
      )}
    </View>
  );
}

export default memo(HomeHudChips);

const styles = StyleSheet.create({
  // 10 pt apart so the two chips' hit slops (8 pt each) never overlap.
  row: { position: 'absolute', left: 12, zIndex: 20, flexDirection: 'row', gap: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingLeft: 5, paddingRight: 9, borderRadius: 15,
    backgroundColor: 'rgba(5,52,110,0.9)', borderWidth: 2, borderColor: BRAND.white },
  ticket: { width: 24, height: 20 },
  story: { width: 22, height: 20 },
  pips: { flexDirection: 'row', gap: 3 },
  pip: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)' },
  pipOn: { backgroundColor: BRAND.gold },
  text: { color: BRAND.white, fontFamily: 'Knockout', fontSize: 14 },
});
