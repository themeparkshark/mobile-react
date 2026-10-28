/**
 * The Next Coin guide card (core loop blueprint 4.1, October 2026): one card in the top-left slot
 * of the map that answers "what do I do?" with one coin, how far it is and one button.
 *
 * It replaces the Adventure Ticket chip, the Next Up rail, the ride goal card, the in-line card and
 * the queue games card. The Adventure Ticket becomes its frame on today's Adventure ride: three
 * stamp dots under the name (win its coin, play its line story, celebrate the ride); tapping the
 * card there opens the ticket's sheet for its stamps and souvenir.
 * Hand-drawn look: the house blue card with the white border, gold kicker, the coin art.
 * Springs in once; the words change in place. Reduced Motion holds still.
 */
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { haptic } from '../../gamekit/Haptics';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { BRAND, GameIcon, SHADOW } from '../../ui';
import type { GuideAction, GuideButton, GuideCardCopy } from '../../services/guide/guideCopy';
import type { GuideState } from '../../services/guide/nextCoin';

const COIN_FALLBACK = require('../../../assets/images/coingold.png');
const TICKET = require('../../../assets/images/ticket-icon.png');

/** Room the card leaves on the right for the compass and the Rewards button column. */
export const GUIDE_CARD_RIGHT = 78;
/** The card's resting height (two lines of copy and a button), for the map's declutter inset. */
export const GUIDE_CARD_HEIGHT = 92;

function Dots({ dots }: { dots: readonly [boolean, boolean, boolean] }) {
  return <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {dots.map((on, index) => <View key={index} style={[styles.dot, on && styles.dotOn]} />)}
  </View>;
}

function CardButton({ button, onPress, quiet = false }: { button: GuideButton; onPress: (action: GuideAction) => void; quiet?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={button.label} hitSlop={6}
    onPress={() => { haptic('tapLight'); onPress(button.action); }}
    style={({ pressed }) => [quiet ? styles.quiet : styles.button, pressed && styles.pressed]}>
    {button.badge === 'gift' && <GameIcon name="gift" size={18} />}
    {button.badge === 'ticket' && <GameIcon name="ticket" size={18} />}
    <Text style={quiet ? styles.quietText : styles.buttonText} numberOfLines={1}>{button.label}</Text>
  </Pressable>;
}

export default function NextCoinCard({ copy, state, coinUrl, parkName, top, onAction, onCardPress, testID = 'next-coin-card' }: {
  readonly copy: GuideCardCopy;
  readonly state: GuideState;
  /** The target coin's art, or null (wallet and resting states draw the Ticket). */
  readonly coinUrl: string | null;
  /** The park name chip on park maps ("Disneyland"); null at home. */
  readonly parkName: string | null;
  readonly top: number;
  readonly onAction: (action: GuideAction) => void;
  /** A tap on the card itself (not its button): the Adventure sheet on its ride, else the path. */
  readonly onCardPress?: () => void;
  readonly testID?: string;
}) {
  const reduced = useReducedGameMotion();
  const enter = useSharedValue(reduced ? 1 : 0);
  useEffect(() => { enter.value = reduced ? 1 : withSpring(1, { damping: 13, stiffness: 190 }); }, [enter, reduced]);
  const animated = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateX: (1 - enter.value) * -24 }, { scale: 0.94 + enter.value * 0.06 }],
  }));
  const wallet = state === 'claim' || state === 'free_try' || state === 'extra_try' || state === 'need_ticket';
  const art = wallet || !coinUrl ? (wallet ? TICKET : COIN_FALLBACK) : { uri: coinUrl };
  return <Animated.View testID={testID} style={[styles.slot, { top }, animated]}>
    <Pressable accessible accessibilityRole="button" accessibilityLabel={copy.a11y} onPress={onCardPress}
      disabled={!onCardPress} style={styles.card}>
      <View style={styles.artCol}>
        <Image source={art} style={styles.coin} contentFit="contain" />
        {copy.pointsAtPlay && <View style={styles.pointer} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <GameIcon name="ticket" size={16} />
          <GameIcon name="arrow" size={14} />
        </View>}
      </View>
      <View style={styles.copy}>
        <View style={styles.kickerRow}>
          <Text style={styles.kicker} numberOfLines={1}>{copy.kicker}</Text>
          {parkName && state !== 'arrive' && <View style={styles.parkChip}><Text style={styles.parkChipText} numberOfLines={1}>{parkName}</Text></View>}
        </View>
        <Text style={styles.title} numberOfLines={2}>{copy.title}</Text>
        {copy.dots && <Dots dots={copy.dots} />}
        {!!copy.line && <Text style={styles.line} numberOfLines={2}>{copy.line}</Text>}
        {(copy.button || copy.secondary) && <View style={styles.actions}>
          {copy.button && <CardButton button={copy.button} onPress={onAction} />}
          {copy.secondary && <CardButton button={copy.secondary} onPress={onAction} quiet />}
        </View>}
      </View>
      {state === 'walk' && <View style={styles.walkArrow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <GameIcon name="arrow" size={22} />
      </View>}
    </Pressable>
  </Animated.View>;
}

const styles = StyleSheet.create({
  slot: { position: 'absolute', left: 12, right: GUIDE_CARD_RIGHT, zIndex: 21 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BRAND.blueBright, borderColor: BRAND.white,
    borderWidth: 3, borderRadius: 16, paddingVertical: 7, paddingHorizontal: 8, ...SHADOW.card },
  artCol: { alignItems: 'center', gap: 2 },
  coin: { width: 46, height: 46 },
  pointer: { flexDirection: 'row', alignItems: 'center', transform: [{ rotate: '90deg' }] },
  copy: { flex: 1, minWidth: 0 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kicker: { flexShrink: 1, color: '#ffdc61', fontFamily: 'Knockout', fontSize: 11, letterSpacing: 0.6 },
  parkChip: { backgroundColor: BRAND.white, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, maxWidth: 110 },
  parkChipText: { color: BRAND.navy, fontFamily: 'Knockout', fontSize: 10 },
  title: { color: BRAND.white, fontFamily: 'Shark', fontSize: 15, marginTop: 1 },
  line: { color: '#dff4ff', fontFamily: 'Knockout', fontSize: 12, marginTop: 1 },
  dots: { flexDirection: 'row', gap: 5, marginTop: 3 },
  dot: { width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: BRAND.white, backgroundColor: 'transparent' },
  dotOn: { backgroundColor: BRAND.gold },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 5 },
  button: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BRAND.gold, borderRadius: 12,
    borderBottomWidth: 3, borderBottomColor: BRAND.goldLip, paddingHorizontal: 12, paddingVertical: 4, minHeight: 30 },
  buttonText: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 14 },
  pressed: { transform: [{ scale: 0.95 }], opacity: 0.9 },
  quiet: { paddingVertical: 4, minHeight: 30, justifyContent: 'center' },
  quietText: { color: BRAND.white, fontFamily: 'Knockout', fontSize: 12, textDecorationLine: 'underline' },
  walkArrow: { alignSelf: 'center' },
});
