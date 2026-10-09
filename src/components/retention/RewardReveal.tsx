import { Image, type ImageSource } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import type { PaidRewards } from '../../api/endpoints/retention';
import { haptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import { rewardRows, type RewardRow } from '../../services/retention/logic';
import { BRAND, GameIcon } from '../../ui';
import RewardBurst from '../RewardBurst';

const BOX = require('../../../assets/images/retention/mystery-box.png');
const FREEZE = require('../../../assets/images/retention/freeze.png');

/** Rows land this far apart: one beat each, so a kid sees every prize. */
export const ROW_BEAT_MS = 380;

/**
 * A chest you open yourself. Tap: the chest shakes (anticipation, haptic),
 * the server pays, the lid pops with a burst, then each prize drops in on
 * its own beat with a tick and a buzz; a wearable or a Mystery Box gets a
 * bigger card and a heavier hit. Shows only what the server paid.
 */
export default function RewardReveal({ title, subtitle, closedArt, openArt, rewards, opening, onOpen, onDone, reducedMotion, doneLabel }: {
  readonly title: string;
  readonly subtitle: string;
  readonly closedArt: ImageSource | number;
  readonly openArt: ImageSource | number;
  /** Null until the server answers. */
  readonly rewards: PaidRewards | null;
  readonly opening: boolean;
  readonly onOpen: () => void;
  readonly onDone: () => void;
  readonly reducedMotion: boolean;
  readonly doneLabel?: string;
}) {
  const { width, height } = useWindowDimensions();
  const size = Math.min(width * 0.5, 210);
  const bob = useSharedValue(0);
  const shake = useSharedValue(0);
  const pop = useSharedValue(1);
  const glow = useSharedValue(0);
  const burst = useSharedValue(0);
  const [shownRows, setShownRows] = useState(0);
  const rows = rewards ? rewardRows(rewards) : [];
  const revealed = !!rewards;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  useEffect(() => {
    cancelAnimation(bob); cancelAnimation(glow);
    bob.value = 0; glow.value = revealed ? 1 : 0;
    if (reducedMotion) return;
    if (!revealed && !opening) {
      bob.value = withRepeat(withSequence(
        withTiming(-8, { duration: 850, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 850, easing: Easing.inOut(Easing.sin) }),
      ), -1);
      glow.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.sin) }), -1, true);
    }
    return () => { cancelAnimation(bob); cancelAnimation(glow); };
  }, [revealed, opening, reducedMotion, bob, glow]);

  // Anticipation while the server answers.
  useEffect(() => {
    if (!opening || reducedMotion) return;
    shake.value = withRepeat(withSequence(...[9, -11, 13, -13, 0].map(v => withTiming(v, { duration: 55 }))), -1);
    haptic('hitMedium');
    playSfx('fx.redeemOpen', 0.8);
    return () => { cancelAnimation(shake); shake.value = 0; };
  }, [opening, reducedMotion, shake]);

  // The pop, then one row per beat.
  useEffect(() => {
    if (!revealed) { setShownRows(0); return; }
    cancelAnimation(shake); shake.value = 0;
    haptic('success');
    playSfx('fx.reward');
    if (reducedMotion) { setShownRows(rows.length); return; }
    pop.value = withSequence(withTiming(1.22, { duration: 110 }), withSpring(1, { damping: 7, stiffness: 180 }));
    burst.value = 0;
    burst.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) });
    timers.current.forEach(clearTimeout);
    timers.current = rows.map((row, i) => setTimeout(() => {
      setShownRows(n => Math.max(n, i + 1));
      const big = row.kind === 'item' || row.kind === 'mystery_boxes';
      haptic(big ? 'comboHeavy' : 'tickSelection');
      playSfx(big ? 'fx.firework' : row.kind === 'coins' ? 'fx.coin' : 'fx.coinTick', big ? 1 : 0.8);
    }, 380 + i * ROW_BEAT_MS));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, reducedMotion]);

  const chestStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }, { rotate: `${shake.value}deg` }, { scale: pop.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.3 + glow.value * 0.45, transform: [{ scale: 0.9 + glow.value * 0.15 }] }));
  const allIn = shownRows >= rows.length;

  return (
    <View style={styles.card}>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <Pressable onPress={!revealed && !opening ? onOpen : undefined} disabled={revealed || opening} accessibilityRole="button"
        accessibilityLabel={revealed ? `${title} opened` : `Open: ${title}`} style={[styles.stage, { height: size + 8 }]}>
        <Animated.View style={[styles.glow, { width: size * 1.25, height: size * 1.25, borderRadius: size }, glowStyle]} />
        <Animated.View style={chestStyle}>
          <Image source={revealed ? openArt : closedArt} style={{ width: size, height: size }} contentFit="contain" />
        </Animated.View>
      </Pressable>
      <View style={styles.rows}>
        {!revealed ? (
          <Text style={styles.hint}>{opening ? 'Opening...' : 'Tap to open!'}</Text>
        ) : rows.slice(0, shownRows).map(row => <Row key={row.kind} row={row} reducedMotion={reducedMotion} />)}
      </View>
      {revealed && (
        <Pressable onPress={allIn ? onDone : () => { timers.current.forEach(clearTimeout); setShownRows(rows.length); }}
          accessibilityRole="button" style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={styles.buttonText}>{allIn ? (doneLabel ?? 'AWESOME!') : 'SHOW ALL'}</Text>
        </Pressable>
      )}
      <RewardBurst progress={burst} x={width * 0.47} y={height * 0.3} />
    </View>
  );
}

function rowIcon(row: RewardRow) {
  switch (row.kind) {
    case 'coins': return <GameIcon name="coins" size={40} />;
    case 'tickets': return <GameIcon name="ticket" size={40} />;
    case 'energy': return <GameIcon name="energy" size={40} />;
    case 'xp': return <GameIcon name="xp" size={40} />;
    case 'freezes': return <Image source={FREEZE} style={{ width: 40, height: 40 }} contentFit="contain" />;
    case 'mystery_boxes': return <Image source={BOX} style={{ width: 54, height: 54 }} contentFit="contain" />;
    case 'item': return row.image
      ? <Image source={{ uri: row.image }} style={{ width: 58, height: 58 }} contentFit="contain" />
      : <GameIcon name="gift" size={44} />;
  }
}

function Row({ row, reducedMotion }: { readonly row: RewardRow; readonly reducedMotion: boolean }) {
  const t = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => { if (!reducedMotion) t.value = withSpring(1, { damping: 9, stiffness: 200 }); }, [reducedMotion, t]);
  const style = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ translateY: (1 - t.value) * -24 }, { scale: 0.6 + t.value * 0.4 }] }));
  const big = row.kind === 'item' || row.kind === 'mystery_boxes';
  return (
    <Animated.View style={[styles.row, big && styles.rowBig, style]}>
      <View style={styles.rowIcon}>{rowIcon(row)}</View>
      {big ? (
        <View style={{ flex: 1 }}>
          <Text style={styles.bigKicker}>{row.kind === 'item' ? 'NEW GEAR' : 'MYSTERY BOX'}</Text>
          <Text style={styles.bigName} numberOfLines={2}>{row.kind === 'item' ? row.label : 'Open it in your Pins!'}</Text>
        </View>
      ) : (
        <Text style={styles.rowText} numberOfLines={1}>
          <Text style={styles.rowAmount}>{`+${row.amount} `}</Text>{row.label}
        </Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { width: '94%', marginTop: -14, backgroundColor: BRAND.blue, borderRadius: 24, borderWidth: 4, borderColor: BRAND.white,
    paddingTop: 20, paddingBottom: 14, paddingHorizontal: 12, alignItems: 'center' },
  subtitle: { fontFamily: 'Knockout', fontSize: 16, color: '#e4f7ff', textAlign: 'center' },
  stage: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', backgroundColor: 'rgba(255, 226, 92, 0.38)' },
  rows: { alignSelf: 'stretch', gap: 6, minHeight: 60, justifyContent: 'center' },
  hint: { fontFamily: 'Shark', fontSize: 22, color: BRAND.gold, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 4 },
  rowBig: { backgroundColor: BRAND.white, borderWidth: 3, borderColor: BRAND.gold, paddingVertical: 6 },
  rowIcon: { width: 58, alignItems: 'center' },
  rowText: { flex: 1, fontFamily: 'Shark', fontSize: 18, color: BRAND.white },
  rowAmount: { color: BRAND.gold, fontSize: 22 },
  bigKicker: { fontFamily: 'Shark', fontSize: 13, color: BRAND.goldLip },
  bigName: { fontFamily: 'Shark', fontSize: 19, color: BRAND.navy },
  button: { marginTop: 12, alignSelf: 'stretch', backgroundColor: BRAND.gold, borderRadius: 16, paddingVertical: 12,
    alignItems: 'center', borderBottomWidth: 4, borderBottomColor: BRAND.goldLip },
  buttonPressed: { transform: [{ translateY: 2 }], borderBottomWidth: 2 },
  buttonText: { fontFamily: 'Shark', fontSize: 20, color: '#075083' },
});
