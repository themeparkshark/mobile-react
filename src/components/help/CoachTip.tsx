import { Image } from 'expo-image';
import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { BRAND, RADIUS, SHADOW } from '../../ui';

const FINN = require('../../../assets/images/tutorial/teacher-shark.png');

/**
 * A one-time Finn tip. Never a modal: it floats where the caller puts it, the
 * rest of the screen keeps working, a tap closes it, and it leaves on its own.
 */
export default function CoachTip({ title, body, onDismiss, style, autoHideMs = 9000, compact = false }: {
  readonly title: string;
  readonly body: string;
  readonly onDismiss: () => void;
  readonly style?: StyleProp<ViewStyle>;
  readonly autoHideMs?: number;
  /** No Finn art, for tips inside cards and sheets. */
  readonly compact?: boolean;
}) {
  const reduced = useReducedGameMotion();
  useEffect(() => {
    void AccessibilityInfo.announceForAccessibility(`${title}. ${body}`);
    if (autoHideMs <= 0) return;
    const timer = setTimeout(onDismiss, autoHideMs);
    return () => clearTimeout(timer);
    // Announce and time once per tip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View pointerEvents="box-none" entering={reduced ? undefined : FadeIn.duration(220)}
      exiting={reduced ? undefined : FadeOut.duration(150)} style={style}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${body}`} accessibilityHint="Closes the tip"
        onPress={onDismiss} style={[styles.card, compact && styles.compactCard]}>
        {!compact && <Image source={FINN} style={styles.finn} contentFit="contain" />}
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
        </View>
        <Text style={styles.ok}>OK</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: BRAND.cream, borderRadius: RADIUS.lg,
    borderWidth: 3, borderColor: BRAND.white, paddingVertical: 10, paddingLeft: 6, paddingRight: 12, ...SHADOW.card,
  },
  compactCard: { paddingLeft: 12, borderColor: BRAND.gold },
  finn: { width: 58, height: 58, marginRight: 6 },
  copy: { flex: 1 },
  title: { fontFamily: 'Shark', fontSize: 17, color: BRAND.navy, marginBottom: 2 },
  body: { fontFamily: 'Knockout', fontSize: 15, lineHeight: 19, color: BRAND.navySoft },
  ok: { fontFamily: 'Shark', fontSize: 15, color: BRAND.blue, marginLeft: 8 },
});
