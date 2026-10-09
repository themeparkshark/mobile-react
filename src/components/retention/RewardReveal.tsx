import { Image, type ImageSource } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import type { PaidRewards } from '../../api/endpoints/retention';
import { haptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import { isBigReward, rewardRows, rowSchedule, type RewardRow } from '../../services/retention/logic';
import { BRAND, GameIcon } from '../../ui';
import RewardBurst from '../RewardBurst';
import { useAmbient } from './power';

const BOX = require('../../../assets/images/retention/mystery-box.png');
const FREEZE = require('../../../assets/images/retention/freeze.png');

/** After this long the shake settles into a calm "Still opening..." (the request has its own 6 s timeout). */
const STALL_MS = 6000;

/**
 * A chest you open yourself.
 * - Tap: the shake builds (three rising ticks), the server pays.
 * - Pop: squash, a white flash hides the art swap, overshoot, a burst from the chest itself.
 * - Prizes: every row is laid out at once (nothing jumps) and fades in on its beat with a
 *   tick and a count-up; gear and Mystery Boxes wait a held beat, then slam in as hero cards.
 * - The button appears only after the last prize lands, under a line that points at what is next.
 * Shows only what the server paid.
 */
export default function RewardReveal({ subtitle, closedArt, openArt, rewards, opening, onOpen, onDone, onWear, onPins,
  reducedMotion, doneLabel, footer, dropIn = false }: {
  readonly subtitle: string;
  readonly closedArt: ImageSource | number;
  readonly openArt: ImageSource | number;
  /** Null until the server answers. */
  readonly rewards: PaidRewards | null;
  readonly opening: boolean;
  readonly onOpen: () => void;
  readonly onDone: () => void;
  readonly onWear?: () => void;
  readonly onPins?: () => void;
  readonly reducedMotion: boolean;
  readonly doneLabel?: string;
  /** The closing beat (what comes next), shown with the button. */
  readonly footer?: React.ReactNode;
  /** The chest drops in when it appears (level-ups). */
  readonly dropIn?: boolean;
}) {
  const ambient = useAmbient();
  const { width, height } = useWindowDimensions();
  // The chest never resizes at the reveal (no jump); the rows area takes the rest of the screen.
  const size = Math.min(width * 0.44, height * 0.21, 190);
  // Rows get a fixed area (scrolls only on small phones), so the card never changes height.
  // Sized so the ribbon always clears the Dynamic Island on a Pro and gear plus four rows fit whole.
  const rowsHeight = Math.max(200, Math.min(330, height - size - 350));
  const bob = useSharedValue(0);
  const shake = useSharedValue(0);
  const pop = useSharedValue(1);
  const squash = useSharedValue(1);
  const flash = useSharedValue(0);
  const glow = useSharedValue(0);
  const burst = useSharedValue(0);
  const drop = useSharedValue(dropIn && !reducedMotion ? 1 : 0);
  const [landed, setLanded] = useState(0);
  const [swapped, setSwapped] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [stage, setStage] = useState<{ x: number; y: number } | null>(null);
  const rows = rewards ? rewardRows(rewards) : [];
  const revealed = !!rewards;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scroll = useRef<ScrollView>(null);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  // Arrival: a level chest drops in with a thump.
  useEffect(() => {
    if (!dropIn || reducedMotion) return;
    drop.value = withSpring(0, { damping: 9, stiffness: 140 });
    later(() => { haptic('hitMedium'); playSfx('fx.hit', 0.8); }, 260);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Idle: a gentle bob and glow, so it asks to be tapped.
  useEffect(() => {
    cancelAnimation(bob); cancelAnimation(glow);
    bob.value = 0; glow.value = revealed ? 1 : 0;
    if (reducedMotion || revealed || opening || !ambient) return;
    bob.value = withRepeat(withSequence(
      withTiming(-7, { duration: 850, easing: Easing.inOut(Easing.sin) }),
      withTiming(0, { duration: 850, easing: Easing.inOut(Easing.sin) }),
    ), -1);
    glow.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => { cancelAnimation(bob); cancelAnimation(glow); };
  }, [revealed, opening, reducedMotion, ambient, bob, glow]);

  // Anticipation: the shake builds over three ticks while the server answers, then settles if it is slow.
  useEffect(() => {
    if (!opening || revealed) return;
    setStalled(false);
    const stall = setTimeout(() => { setStalled(true); cancelAnimation(shake); shake.value = withTiming(0, { duration: 200 }); }, STALL_MS);
    if (!reducedMotion) {
      shake.value = withSequence(
        ...[4, -4, 7, -7, 10, -10].map(v => withTiming(v, { duration: 55 })),
        withRepeat(withSequence(withTiming(13, { duration: 50 }), withTiming(-13, { duration: 50 })), 30, true),
      );
      [0, 200, 400].forEach((ms, i) => later(() => { haptic(i < 2 ? 'tickSelection' : 'hitMedium'); playSfx('ui.button', 0.5 + i * 0.2); }, ms));
    }
    playSfx('fx.redeemOpen', 0.8);
    return () => { clearTimeout(stall); cancelAnimation(shake); shake.value = 0; };
  }, [opening, revealed, reducedMotion, shake]); // eslint-disable-line react-hooks/exhaustive-deps

  // The pop, then one row per beat (held beats before the big ones).
  useEffect(() => {
    if (!revealed) { setLanded(0); setSwapped(false); return; }
    cancelAnimation(shake); shake.value = 0;
    timers.current.forEach(clearTimeout); timers.current = [];
    if (reducedMotion) {
      setSwapped(true);
      haptic('success'); playSfx('fx.reward');
      rows.forEach((row, i) => later(() => { setLanded(n => Math.max(n, i + 1)); if (isBigReward(row.kind)) scroll.current?.scrollToEnd({ animated: false }); }, 120 * (i + 1)));
      return;
    }
    // Squash, flash, swap behind the flash, overshoot.
    squash.value = withSequence(withTiming(0.82, { duration: 90, easing: Easing.in(Easing.quad) }), withSpring(1, { damping: 6, stiffness: 240 }));
    flash.value = withDelay(80, withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: 260 })));
    later(() => setSwapped(true), 120);
    pop.value = withDelay(110, withSequence(withTiming(1.18, { duration: 110 }), withSpring(1, { damping: 7, stiffness: 180 })));
    burst.value = 0;
    burst.value = withDelay(120, withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }));
    later(() => { haptic('success'); playSfx('fx.reward'); }, 120);
    rowSchedule(rows).forEach((ms, i) => later(() => {
      setLanded(n => Math.max(n, i + 1));
      const big = isBigReward(rows[i].kind);
      // On a small phone the rows scroll: the hero cards (always last) slide into view as they land.
      if (big) later(() => scroll.current?.scrollToEnd({ animated: true }), 40);
      haptic(big ? 'comboHeavy' : 'tickSelection');
      playSfx(big ? 'fx.firework' : rows[i].kind === 'coins' || rows[i].kind === 'bonus_coins' ? 'fx.coin' : 'fx.coinTick', big ? 1 : 0.8);
    }, ms));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, reducedMotion]);

  const chestStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bob.value - drop.value * 140 }, { rotate: `${shake.value}deg` }, { scale: pop.value },
      { scaleY: squash.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.35 + glow.value * 0.4, transform: [{ scale: 0.92 + glow.value * 0.08 }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const allIn = revealed && landed >= rows.length;
  const skip = () => { if (!revealed || allIn) return; timers.current.forEach(clearTimeout); timers.current = []; setLanded(rows.length); setSwapped(true); };

  return (
    <View style={styles.card}>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <Pressable onPress={!revealed && !opening ? onOpen : skip} disabled={opening && !revealed} accessibilityRole="button"
        accessibilityLabel={revealed ? 'Opened' : 'Tap to open'} style={[styles.stage, { height: size + 8 }]}
        onLayout={e => setStage({ x: e.nativeEvent.layout.x + e.nativeEvent.layout.width / 2, y: e.nativeEvent.layout.y + e.nativeEvent.layout.height / 2 })}>
        <Animated.View style={[styles.glow, { width: size * 0.98, height: size * 0.98, borderRadius: size }, glowStyle]} />
        <Animated.View style={chestStyle}>
          <Image source={swapped ? openArt : closedArt} style={{ width: size, height: size }} contentFit="contain" />
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, { borderRadius: size / 2 }, flashStyle]} />
        </Animated.View>
      </Pressable>
      <Pressable onPress={skip} disabled={!revealed || allIn} accessible={false} style={{ alignSelf: 'stretch' }}>
        <ScrollView ref={scroll} style={{ height: rowsHeight }} contentContainerStyle={styles.rows} scrollEnabled={revealed}
          showsVerticalScrollIndicator={false}>
          {!revealed ? (
            <View style={[styles.hintBox, { height: rowsHeight - 8 }]}>
              <Text style={styles.hint}>{stalled ? 'Still opening...' : opening ? 'Opening...' : 'Tap to open!'}</Text>
            </View>
          ) : rows.map((row, i) => (
            <Row key={row.kind} row={row} shown={i < landed} reducedMotion={reducedMotion}
              onWear={row.kind === 'item' ? onWear : undefined} onPins={row.kind === 'mystery_boxes' ? onPins : undefined} />
          ))}
        </ScrollView>
      </Pressable>
      <View style={styles.bottom}>
        {allIn ? (
          <>
            {footer}
            <Pressable onPress={onDone} accessibilityRole="button" style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
              <Text style={styles.buttonText}>{doneLabel ?? 'AWESOME!'}</Text>
            </Pressable>
          </>
        ) : null}
      </View>
      {stage && <RewardBurst progress={burst} x={stage.x} y={stage.y} />}
    </View>
  );
}

function rowIcon(row: RewardRow) {
  switch (row.kind) {
    case 'coins': return <GameIcon name="coins" size={40} />;
    case 'bonus_coins': return <GameIcon name="coins" size={40} />;
    case 'tickets': return <GameIcon name="ticket" size={40} />;
    case 'energy': return <GameIcon name="energy" size={40} />;
    case 'xp': return <GameIcon name="xp" size={40} />;
    case 'freezes': return <Image source={FREEZE} style={{ width: 40, height: 40 }} contentFit="contain" />;
    case 'mystery_boxes': return <Image source={BOX} style={{ width: 72, height: 72 }} contentFit="contain" />;
    case 'item': return row.image
      ? <Image source={{ uri: row.image }} style={{ width: 80, height: 80 }} contentFit="contain" />
      : <GameIcon name="shark" size={64} />;
  }
}

/** Counts a number up once it is shown (instant when motion is reduced). */
function useCountUp(target: number, run: boolean, instant: boolean): number {
  const [n, setN] = useState(instant ? target : 0);
  useEffect(() => {
    if (!run) return;
    if (instant || target <= 1) { setN(target); return; }
    const frames = 14;
    let f = 0;
    const id = setInterval(() => {
      f += 1;
      const t = 1 - Math.pow(1 - f / frames, 3);
      setN(f >= frames ? target : Math.max(1, Math.round(target * t)));
      if (f >= frames) clearInterval(id);
    }, 32);
    return () => clearInterval(id);
  }, [run, target, instant]);
  return n;
}

function Row({ row, shown, reducedMotion, onWear, onPins }: {
  readonly row: RewardRow; readonly shown: boolean; readonly reducedMotion: boolean;
  readonly onWear?: () => void; readonly onPins?: () => void;
}) {
  const big = isBigReward(row.kind);
  const t = useSharedValue(0);
  const beam = useSharedValue(0);
  useEffect(() => {
    if (!shown) { t.value = 0; return; }
    if (reducedMotion) { t.value = withTiming(1, { duration: 150 }); return; }
    t.value = big ? withSequence(withTiming(1, { duration: 120 }), withSpring(1, { damping: 7, stiffness: 260 }))
      : withSpring(1, { damping: 10, stiffness: 220 });
    if (big) beam.value = withSequence(withTiming(1, { duration: 140 }), withTiming(0, { duration: 900 }));
  }, [shown, reducedMotion, big, t, beam]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: big
      ? [{ scale: 1.35 - t.value * 0.35 }]
      : [{ translateY: (1 - t.value) * -18 }, { scale: 0.7 + t.value * 0.3 }],
  }));
  const beamStyle = useAnimatedStyle(() => ({ opacity: beam.value }));
  const amount = useCountUp(row.amount, shown, reducedMotion);
  return (
    // Laid out from the start (no jump); the face is a plain View (iOS clips a scaled bordered background).
    <Animated.View style={style}>
      {big && <Animated.View pointerEvents="none" style={[styles.beam, beamStyle]} />}
      <View style={[styles.row, big && styles.rowBig]}>
        <View style={[styles.rowIcon, big && styles.rowIconBig]}>{rowIcon(row)}</View>
        {big ? (
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.bigKicker}>{row.kind === 'item' ? 'NEW GEAR' : 'FREE MYSTERY BOX'}</Text>
            <Text style={styles.bigName} numberOfLines={2}>{row.kind === 'item' ? row.label : 'A surprise pin is inside'}</Text>
            {(onWear || onPins) && (
              <Pressable onPress={onWear ?? onPins} accessibilityRole="button" hitSlop={6}
                style={({ pressed }) => [styles.smallBtn, pressed && styles.buttonPressed]}>
                <Text style={styles.smallBtnText}>{onWear ? 'WEAR IT' : 'SEE PINS'}</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <Text style={styles.rowText} numberOfLines={1}>
            <Text style={styles.rowAmount}>{`+${amount} `}</Text>{row.label}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { width: '94%', marginTop: -14, backgroundColor: BRAND.blue, borderRadius: 24, borderWidth: 4, borderColor: BRAND.white,
    paddingTop: 20, paddingBottom: 14, paddingHorizontal: 12, alignItems: 'center' },
  subtitle: { fontFamily: 'Knockout', fontSize: 17, color: '#e4f7ff', textAlign: 'center', minHeight: 22 },
  stage: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  glow: { position: 'absolute', backgroundColor: 'rgba(255, 244, 196, 0.55)' },
  flash: { backgroundColor: BRAND.white },
  rows: { gap: 6, paddingVertical: 4 },
  hintBox: { alignItems: 'center', justifyContent: 'center' },
  hint: { fontFamily: 'Shark', fontSize: 22, color: BRAND.gold, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 2 },
  rowBig: { backgroundColor: BRAND.white, borderWidth: 3, borderColor: BRAND.gold, paddingVertical: 8 },
  rowIcon: { width: 58, alignItems: 'center' },
  rowIconBig: { width: 84 },
  beam: { position: 'absolute', left: -8, right: -8, top: -6, bottom: -6, borderRadius: 18, backgroundColor: 'rgba(255, 226, 92, 0.55)' },
  rowText: { flex: 1, fontFamily: 'Shark', fontSize: 18, color: BRAND.white },
  rowAmount: { color: BRAND.gold, fontSize: 22 },
  bigKicker: { fontFamily: 'Shark', fontSize: 13, color: BRAND.goldLip },
  bigName: { fontFamily: 'Shark', fontSize: 20, color: BRAND.navy },
  smallBtn: { alignSelf: 'flex-start', backgroundColor: BRAND.gold, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5,
    borderBottomWidth: 3, borderBottomColor: BRAND.goldLip },
  smallBtnText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.navy },
  bottom: { alignSelf: 'stretch', minHeight: 104, justifyContent: 'flex-end', gap: 8, marginTop: 6 },
  button: { alignSelf: 'stretch', backgroundColor: BRAND.gold, borderRadius: 16, paddingVertical: 12,
    alignItems: 'center', borderBottomWidth: 4, borderBottomColor: BRAND.goldLip },
  buttonPressed: { transform: [{ translateY: 2 }], borderBottomWidth: 2 },
  buttonText: { fontFamily: 'Shark', fontSize: 20, color: '#075083' },
});
