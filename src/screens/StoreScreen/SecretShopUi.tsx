import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import * as RootNavigation from '../../RootNavigation';
import { SECRET_THEME } from '../../fx/secretTheme';
import { BRAND, FONT, GameIcon } from '../../ui';
import { MAX_FONT } from './shopUi';

/**
 * Secret Shop chrome (secret-shop/DESIGN.md 4.2 and 6).
 */

/** Non-members: one calm line and a door to VIP. No countdown, no pressure. */
export const SecretPreviewBanner = memo(function SecretPreviewBanner() {
  return (
    <View style={styles.banner} accessible accessibilityRole="summary"
      accessibilityLabel={`${SECRET_PREVIEW_COPY.title}. ${SECRET_PREVIEW_COPY.body}`}>
      <View style={styles.bannerIcon}><GameIcon name="member" size={30} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text maxFontSizeMultiplier={MAX_FONT} style={styles.bannerTitle}>{SECRET_PREVIEW_COPY.title}</Text>
        <Text maxFontSizeMultiplier={MAX_FONT} style={styles.bannerBody}>{SECRET_PREVIEW_COPY.body}</Text>
      </View>
      <Pressable onPress={() => RootNavigation.navigate('Membership')} style={styles.bannerCta} hitSlop={6}
        accessibilityRole="button" accessibilityLabel="Join VIP">
        <Text maxFontSizeMultiplier={MAX_FONT} style={styles.bannerCtaText}>JOIN VIP</Text>
      </Pressable>
    </View>
  );
});

export const SECRET_PREVIEW_COPY = {
  title: 'Try anything on',
  body: 'VIP members can buy these. Every piece you buy is yours to keep.',
} as const;

/** Fixed star spots (fractions of the box) so every render and capture match. */
const MOTES = [
  [0.06, 0.12, 3], [0.18, 0.32, 2], [0.31, 0.08, 2.5], [0.44, 0.22, 2], [0.57, 0.06, 3], [0.68, 0.3, 2],
  [0.79, 0.14, 2.5], [0.91, 0.26, 2], [0.12, 0.6, 2], [0.88, 0.62, 2.5], [0.38, 0.5, 1.5], [0.72, 0.52, 1.5],
] as const;

function Mote({ i, still }: { i: number; still: boolean }) {
  const [x, y, r] = MOTES[i];
  const glow = useSharedValue(0.5);
  useEffect(() => {
    if (still) { glow.value = 0.6; return; }
    glow.value = withDelay(i * 230, withRepeat(withTiming(1, { duration: 1400 + (i % 4) * 300, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(glow);
  }, [still]);
  const style = useAnimatedStyle(() => ({ opacity: 0.25 + 0.75 * glow.value, transform: [{ scale: 0.7 + 0.5 * glow.value }] }));
  return <Animated.View style={[styles.mote, { left: `${x * 100}%`, top: `${y * 100}%`, width: r * 2, height: r * 2, borderRadius: r }, style]} />;
}

/** Twinkling star motes over the midnight sky. */
export const StarMotes = memo(function StarMotes({ still }: { still: boolean }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {MOTES.map((_, i) => <Mote key={i} i={i} still={still} />)}
    </View>
  );
});

const styles = StyleSheet.create({
  banner: { marginHorizontal: 10, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 20,
    backgroundColor: SECRET_THEME.card, borderWidth: 3, borderColor: SECRET_THEME.gold },
  bannerIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: SECRET_THEME.well },
  bannerTitle: { fontFamily: FONT.display, fontSize: 18, color: SECRET_THEME.ink },
  bannerBody: { fontFamily: FONT.body, fontSize: 14, lineHeight: 18, color: SECRET_THEME.inkSoft },
  bannerCta: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, backgroundColor: SECRET_THEME.gold,
    borderBottomWidth: 4, borderBottomColor: BRAND.goldLip },
  bannerCtaText: { fontFamily: FONT.display, fontSize: 15, color: BRAND.navy },
  mote: { position: 'absolute', backgroundColor: '#fff6d8' },
});
