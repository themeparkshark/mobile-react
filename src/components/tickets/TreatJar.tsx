/**
 * The treat meter and the jar on a treat catch (T8, arcade plan Nov 20 2026): 3 pips fill, and on the third a
 * Ticket drops into the jar. A full jar shows full with "Jar full! Save them for your park day" and the treat's
 * Shark Coins; at the day's cap "That's today's treat Tickets. More tomorrow!". Existing art only (the Ticket,
 * the prize jar, the coin). UI-thread motion; Reduce Motion lands it still.
 */
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import GameIcon from '../../ui/GameIcon';
import { BRAND, FONT } from '../../ui/tokens';
import { DURATION } from '../../ui/motion';
import { withNumberFont } from '../../ui/numberText';
import type { TreatJarModel } from './treatJarModel';

const TICKET = require('../../../assets/images/ticket-icon.png');
const JAR = require('../../../assets/images/help/prize-jar.webp');

export default function TreatJar({ model, reduced }: { readonly model: TreatJarModel; readonly reduced: boolean }) {
  const drop = useSharedValue(reduced || !model.dropped ? 1 : 0);
  useEffect(() => {
    if (reduced || !model.dropped) { drop.value = 1; return; }
    drop.value = 0;
    drop.value = withDelay(DURATION.bloom, withTiming(1, { duration: DURATION.bloom, easing: Easing.in(Easing.quad) }));
  }, [model.dropped, reduced, drop]);
  const ticket = useAnimatedStyle(() => ({ opacity: drop.value >= 1 ? 0 : 1,
    transform: [{ translateX: -54 * (1 - drop.value) }, { translateY: -28 * Math.sin((1 - drop.value) * Math.PI) }, { scale: 1 - drop.value * 0.5 }] }));
  return <View style={styles.wrap} accessible accessibilityRole="text" accessibilityLabel={model.a11y} testID="treat-jar">
    <View style={styles.row}>
      <View style={styles.pips}>
        {Array.from({ length: model.of }, (_, i) => <View key={i} style={[styles.pip, i < model.pips && styles.pipOn]} />)}
      </View>
      <GameIcon name="arrow" size={16} />
      <View style={[styles.jar, model.full && styles.jarFull]}>
        <Image source={JAR} style={styles.jarArt} contentFit="contain" />
        <Text style={styles.jarCount}>{withNumberFont(`${model.held}`)}</Text>
        {model.dropped && !model.full && <Animated.View pointerEvents="none" style={[styles.flying, ticket]}>
          <Image source={TICKET} style={styles.ticket} contentFit="contain" />
        </Animated.View>}
      </View>
      {model.full && model.overflowCoins > 0 && <View style={styles.coins}>
        <GameIcon name="coins" size={20} /><Text style={styles.coinText}>{withNumberFont(`+${model.overflowCoins}`)}</Text>
      </View>}
    </View>
    {model.line && <Text style={styles.line} numberOfLines={2}>{model.line}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center', alignItems: 'center', gap: 4, backgroundColor: BRAND.cream, borderRadius: 16, borderWidth: 3,
    borderColor: BRAND.navy, paddingHorizontal: 12, paddingVertical: 6, maxWidth: 340 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pips: { flexDirection: 'row', gap: 4 },
  pip: { width: 16, height: 16, borderRadius: 8, borderWidth: 2.5, borderColor: BRAND.navy, backgroundColor: BRAND.white },
  pipOn: { backgroundColor: BRAND.gold },
  jar: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  jarFull: { backgroundColor: BRAND.goldLight },
  jarArt: { width: 42, height: 42 },
  jarCount: { position: 'absolute', bottom: -4, right: -6, fontFamily: FONT.display, fontSize: 14, color: BRAND.navy,
    backgroundColor: BRAND.white, borderRadius: 8, borderWidth: 2, borderColor: BRAND.navy, paddingHorizontal: 4, overflow: 'hidden' },
  flying: { position: 'absolute' },
  ticket: { width: 28, height: 19 },
  coins: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  coinText: { fontFamily: FONT.display, fontSize: 16, color: BRAND.navy },
  line: { fontFamily: FONT.display, fontSize: 15, color: BRAND.navy, textAlign: 'center' },
});
