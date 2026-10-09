import { memo, useContext, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { openMembership } from '../../components/GrownUpGate';
import { FxPauseContext } from '../../fx/FxStage';
import { SECRET_THEME } from '../../fx/secretTheme';
import { BRAND, FONT, GameIcon } from '../../ui';
import { MAX_FONT } from './shopUi';
import { VaultPanel, VaultSecondaryButton } from './SecretVault';

/**
 * Secret Shop chrome (secret-shop/DESIGN.md 4.2 and 6).
 */

/** The grown-up gate lives in components/GrownUpGate (one app-wide gate, mounted at the root). */
export { askGrownUp, grownUpQuestion, judgeGate, GATE_REST_MS } from '../../components/GrownUpGate';

/** Non-members: one calm line and a door to VIP, behind the grown-up gate. No countdown, no pressure. */
export const SecretPreviewBanner = memo(function SecretPreviewBanner() {
  return (
    <VaultPanel style={{ marginBottom: 14 }}>
      <View style={styles.banner} accessible accessibilityRole="summary"
        accessibilityLabel={`${SECRET_PREVIEW_COPY.title}. ${SECRET_PREVIEW_COPY.body}`}>
        <View style={styles.bannerIcon}><GameIcon name="member" size={34} /></View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.bannerTitle}>{SECRET_PREVIEW_COPY.title}</Text>
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.bannerBody}>{SECRET_PREVIEW_COPY.body}</Text>
        </View>
      </View>
      {/* The door to VIP: the vault's navy secondary (gold stays for things a kid can do), behind the grown-up gate. */}
      <VaultSecondaryButton label="Ask a grown-up" icon="lock" onPress={() => { void openMembership(); }}
        accessibilityLabel="Ask a grown-up about VIP" />
    </VaultPanel>
  );
});

export const SECRET_PREVIEW_COPY = {
  title: 'Try anything on!',
  body: 'VIP members buy them, and they’re yours forever.',
} as const;

const STAR = require('../../../assets/fx/spark.webp');

/**
 * The Secret unlock beat after a buy (game feel round 3): the stage dims for a
 * breath, then the gold-and-violet frame flares while the piece plays its
 * moment twice (Playercard fxPlay). Its own beat, unlike any tap.
 */
export function UnlockBeat({ trigger, still }: { trigger: number; still: boolean }) {
  const dim = useSharedValue(0);
  const flare = useSharedValue(0);
  useEffect(() => {
    if (!trigger || still) return;
    dim.value = withSequence(withTiming(0.55, { duration: 140 }), withDelay(160, withTiming(0, { duration: 260 })));
    flare.value = withDelay(300, withSequence(withTiming(1, { duration: 160 }), withDelay(260, withTiming(0, { duration: 520 }))));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
  const burst = useSharedValue(0);
  useEffect(() => {
    if (!trigger || still) return;
    burst.value = 0;
    burst.value = withDelay(300, withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));
  const flareStyle = useAnimatedStyle(() => ({ opacity: flare.value, transform: [{ scale: 1 + 0.02 * flare.value }] }));
  // The drawn gold starburst (pipeline art, charcoal outline) frames the head and upper body: it pops
  // at full strength from 0.6, peaks at 1.25 and is fully gone by 1.1 on the way out, so it never
  // passes the stage width or turns into a soft haze (art panel round 5).
  const burstStyle = useAnimatedStyle(() => {
    const k = burst.value;
    const s = 0.6 + 0.65 * k;
    return {
      // Any partial alpha on the dim reads brown or grey (art panel rounds 5 and 6), so the burst
      // stays solid gold to its 1.1 peak and pops out in one frame while the sparks fly on.
      opacity: k <= 0 || s >= 1.1 ? 0 : 1,
      transform: [{ scale: s }, { rotate: `${k * 24}deg` }],
    };
  });
  return (
    <>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#0d0830' }, dimStyle]} />
      <View pointerEvents="none" style={styles.burstAnchor}>
        <Animated.Image source={BURST} style={[{ width: 240, height: 236 }, burstStyle]} />
        {UNLOCK_SPARKS.map(i => <UnlockSpark key={i} i={i} burst={burst} />)}
      </View>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flare, flareStyle]} />
    </>
  );
}

// One 768 px gold burst serves the unlock (crisp at 240 pt on 3x) and the fireworks (perf panel round 5).
const BURST = require('../../../assets/fx/burst-gold.webp');
const UNLOCK_SPARKS = [0, 1, 2, 3, 4, 5, 6];

/** Drawn spark stars thrown outward with the unlock burst. */
function UnlockSpark({ i, burst }: { i: number; burst: { value: number } }) {
  const a = (i / UNLOCK_SPARKS.length) * Math.PI * 2 + 0.3;
  const style = useAnimatedStyle(() => {
    const k = burst.value;
    return {
      opacity: k <= 0 ? 0 : k < 0.7 ? 1 : (1 - k) / 0.3,
      transform: [{ translateX: Math.cos(a) * 150 * k }, { translateY: Math.sin(a) * 120 * k }, { scale: 0.6 + 0.6 * (1 - k) }, { rotate: `${k * 200}deg` }],
    };
  });
  return <Animated.Image source={STAR} style={[{ position: 'absolute', width: 26, height: 26 }, style]} />;
}

/** Fixed star spots (fractions of the box) so every render and capture match. */
/** Stars stay out of the title and button column (the left half), and off the pills (top right). */
const MOTES = [
  [0.6, 0.2, 3], [0.7, 0.33, 2], [0.95, 0.3, 2.5], [0.56, 0.42, 2], [0.86, 0.46, 3], [0.64, 0.58, 2],
  [0.93, 0.6, 2.5], [0.58, 0.72, 2], [0.7, 0.88, 2], [0.95, 0.8, 2.5], [0.76, 0.24, 1.5], [0.82, 0.66, 1.5],
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
  // Drawn twinkle stars (the pipeline's spark star), never flat dots (art panel round 2).
  return <Animated.Image source={STAR} style={[styles.mote, { left: `${x * 100}%`, top: `${y * 100}%`, width: r * 4, height: r * 4 }, style]} />;
}

/** Twinkling star motes over the midnight sky. */
export const StarMotes = memo(function StarMotes({ still }: { still: boolean }) {
  // Paused with the shelves (try-on open, scrolled away).
  const paused = useContext(FxPauseContext);
  still = still || paused;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {MOTES.map((_, i) => <Mote key={i} i={i} still={still} />)}
    </View>
  );
});

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10 },
  bannerIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: SECRET_THEME.well },
  bannerTitle: { fontFamily: FONT.display, fontSize: 20, color: SECRET_THEME.ink,
    textShadowColor: SECRET_THEME.lip, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
  bannerBody: { fontFamily: FONT.body, fontSize: 14, lineHeight: 18, color: SECRET_THEME.inkSoft },
  // Violet, not the gold BUY face: this door leads to grown-ups, not to buying.
  bannerCta: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, borderRadius: 999,
    backgroundColor: SECRET_THEME.accent, borderWidth: 2, borderColor: SECRET_THEME.border },
  bannerCtaText: { fontFamily: FONT.display, fontSize: 14, color: '#ffffff' },
  mote: { position: 'absolute' },
  flare: { borderRadius: 19, borderWidth: 6, borderColor: SECRET_THEME.gold },
  // A zero-height row at 35% of the stage: the burst and sparks centre on the head, not the belly.
  burstAnchor: { position: 'absolute', left: 0, right: 0, top: '35%', height: 0, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
});
