/**
 * The win card's shelf gift bar (T5, arcade plan Nov 20 2026): "10 of 40 · 1 more: +3 Tickets", the bar filling
 * toward the next gift, and on the win that reaches a step the +3 Tickets fly into the header's Ticket pill.
 * No ride named, no countdown. UI-thread fill; Reduce Motion lands it still.
 */
import { useEffect, useRef } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import GameIcon from '../../ui/GameIcon';
import { BRAND, FONT } from '../../ui/tokens';
import { DURATION } from '../../ui/motion';
import { withNumberFont } from '../../ui/numberText';
import { useCurrencyFly } from '../../context/CurrencyFlyProvider';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { shelfGiftLine } from './shelfGift';
import type { ShelfGift } from '../../api/endpoints/me/task-attempts';

const TICKET = require('../../../assets/images/ticket-icon.png');

export default function ShelfGiftBar({ gift, flyKey }: { readonly gift: ShelfGift | null; readonly flyKey: string | number | null }) {
  const line = shelfGiftLine(gift);
  const reduced = useReducedGameMotion();
  const { triggerFly } = useCurrencyFly();
  const fill = useSharedValue(reduced ? line?.fill ?? 0 : 0);
  const flown = useRef<string | number | null>(null);
  useEffect(() => {
    if (!line) return;
    fill.value = reduced ? line.fill : withDelay(DURATION.base, withTiming(line.fill, { duration: DURATION.bloom, easing: Easing.out(Easing.cubic) }));
  }, [line?.fill, reduced, fill]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!line?.paidNow || flown.current === flyKey) return;
    flown.current = flyKey;
    const { width, height } = Dimensions.get('window');
    triggerFly?.({ imageSource: TICKET, amount: Math.min(5, line.paidNow), startX: width / 2, startY: height * 0.55, targetPosition: 'tickets' });
  }, [line?.paidNow, flyKey, triggerFly]); // eslint-disable-line react-hooks/exhaustive-deps
  const bar = useAnimatedStyle(() => ({ width: `${Math.round(fill.value * 100)}%` }));
  if (!line) return null;
  return <View style={styles.wrap} accessible accessibilityRole="text" accessibilityLabel={line.a11y}>
    <View style={styles.row}>
      <GameIcon name="coin" size={22} />
      <Text style={styles.text} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{withNumberFont(line.line)}</Text>
      {line.paidNow > 0 && <View style={styles.paid}><GameIcon name="ticket" size={20} /><Text style={styles.paidText}>{withNumberFont(`+${line.paidNow}`)}</Text></View>}
    </View>
    <View style={styles.track}><Animated.View style={[styles.fill, bar]} /></View>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: 5, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  text: { fontFamily: FONT.display, fontSize: 16, color: BRAND.navy, flexShrink: 1 },
  paid: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: BRAND.gold, borderRadius: 10, borderWidth: 2,
    borderColor: BRAND.navy, paddingHorizontal: 6 },
  paidText: { fontFamily: FONT.display, fontSize: 14, color: BRAND.navy },
  track: { height: 12, borderRadius: 6, backgroundColor: BRAND.sky, borderWidth: 2, borderColor: BRAND.navy, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: BRAND.gold },
});
