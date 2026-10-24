import { Image, type ImageSource } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { PaidRewards } from '../../api/endpoints/retention';
import { isDimFlashingLightsEnabled } from '../../../modules/flash-safety';
import { haptic, playHaptic, queueHaptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import { usePowerBudget } from '../../power';
import { doneDelay, isBigReward, rewardRows, rowSchedule, type RewardRow } from '../../services/retention/logic';
import { FULL_SET, LEVEL_CHEST, LOOP_CUES, REVEAL_ROWS, countStart, rowCountMs } from '../../services/retention/loopMotion';
import GoldCheckCoin from './GoldCheckCoin';
import { BRAND, GameIcon, ICON_SOURCES } from '../../ui';
import { GoldBurst, RadialFlash, SparkleBurst } from '../../ui/GoldBurst';
import { COUNT, DURATION, PARTICLES, SPRING, flashPeak, momentBeats, momentParticles } from '../../ui/motion';
import { EASE } from '../../ui/motionEasing';
import RewardBurst from '../RewardBurst';
import { useAmbient } from './power';

const BOX = require('../../../assets/images/retention/mystery-box.png');
/** Everything around the chest and rows on a known-prize card (safe areas, ribbon, header, flame row, button, padding). */
const CHROME_KNOWN = 440;
/** The rows area for this many small prize rows and hero cards (row heights plus gaps). */
function rowsFor(small: number, big: number): number {
  return small * 52 + big * 110 + 28;
}
const FREEZE = require('../../../assets/images/retention/freeze.png');
const SOFT = require('../../../assets/images/reveal/soft-spot.webp');

/** After this long the shake settles into a calm "Still opening..." (the request has its own 6 s timeout). */
const STALL_MS = 6000;

/**
 * A chest you open, on the chest beats (momentBeats('chest')):
 * 1. gather: the chest shakes harder and harder, gold light builds behind it and rising ticks play
 *    for as long as the server takes (never a static "Opening..." line);
 * 2. hold: one held frame, a soft flash capped at FLASH_MAX_OPACITY, the golden haptic;
 * 3. burst: the lid pops past full size, gold rays bloom, a coin fountain and sparkles fly out;
 * 4. settle: prizes land one by one (every row counted inside 1.2 s, never from "+0"), then the button.
 * A level chest drops in first, rattles three times (each harder) with light leaking from the lid,
 * shows a tap ring, and opens by itself after 2 s. Shows only what the server paid.
 */
export default function RewardReveal({ subtitle, closedArt, openArt, rewards, opening, onOpen, onDone, onWear, onPins,
  reducedMotion, doneLabel, footer, dropIn = false, autoOpen = false, expectRows, preview, fullSet = false }: {
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
  /** A level chest: it drops in, rattles, then opens by itself if not tapped. */
  readonly dropIn?: boolean;
  /** Open by itself on arrival (the full Daily 3 set flows straight into its chest). */
  readonly autoOpen?: boolean;
  /** The prize rows coming, when known (the Daily 3 chest): the rows area fits them, no empty card. */
  readonly expectRows?: { readonly small: number; readonly big: number };
  /** What is inside (known amounts), shown while the chest gathers. */
  readonly preview?: React.ReactNode;
  /** The full Daily 3 set: three gold checks bounce in a row, then dive into the chest as it gathers. */
  readonly fullSet?: boolean;
}) {
  const ambient = useAmbient();
  const budget = usePowerBudget();
  const { width, height } = useWindowDimensions();
  const beats = momentBeats('chest', { reduced: reducedMotion });
  // The chest never resizes at the reveal (no jump); the rows area takes the rest of the screen.
  // Small phones (SE) get a compact layout so every prize shows without scrolling.
  const compact = height < 720;
  const known = !!expectRows && expectRows.small + expectRows.big > 0;
  // With known prizes the card is sized to fit the whole screen (ribbon, chest, every row, the flame row and the
  // button, under the Dynamic Island and above the home bar): the chest takes what the rows leave.
  const expectedRowsH = known && expectRows ? rowsFor(expectRows.small, expectRows.big) : 0;
  const size = known
    ? Math.max(compact ? 96 : 120, Math.min(width * 0.5, 210, height - CHROME_KNOWN - expectedRowsH))
    : Math.min(width * 0.44, height * (compact ? 0.17 : 0.21), 190);
  const stageH = size + (known ? 22 : 8);
  // Rows get a fixed area (scrolls only on small phones), so the card never changes height.
  const baseRows = compact ? Math.max(200, height - size - 300) : Math.max(200, Math.min(300, height - size - 380));
  // Sized to the prizes coming; if the server pays more rows than the preview said (a milestone gear), it grows to fit
  // them all at the burst (never a row cut off at the top).
  const bob = useSharedValue(0);
  const shake = useSharedValue(0);
  const pop = useSharedValue(1);
  const squash = useSharedValue(1);
  const flash = useSharedValue(0);
  const gold = useSharedValue(known ? 0.12 : 0);
  const bloom = useSharedValue(0);
  const burst = useSharedValue(0);
  const sparkle = useSharedValue(0);
  const leak = useSharedValue(0);
  const tapRing = useSharedValue(0);
  const drop = useSharedValue(dropIn && !reducedMotion ? 1 : 0);
  const dust = useSharedValue(0);
  const [landed, setLanded] = useState(0);
  const [swapped, setSwapped] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [showTap, setShowTap] = useState(false);
  // The button appears a beat after the last prize (600 ms after a hero card) and ignores taps for 400 ms after a skip.
  const [buttonReady, setButtonReady] = useState(false);
  const [replay, setReplay] = useState(0);
  const openedAt = useRef(0);
  const [stage, setStage] = useState<{ x: number; y: number } | null>(null);
  const rows = rewards ? rewardRows(rewards) : [];
  const revealed = !!rewards;
  const rowsHeight = known && expectRows
    ? Math.min(Math.max(expectedRowsH, height - CHROME_KNOWN - size), Math.max(expectedRowsH,
      revealed ? rowsFor(rows.filter(r => !isBigReward(r.kind)).length, rows.filter(r => isBigReward(r.kind)).length) : 0))
    : baseRows;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scroll = useRef<ScrollView>(null);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  // One open per chest: a tap, the 2 s auto-open and the full-set hand-off can never claim twice.
  const asked = useRef(false);
  const requestOpen = () => { if (asked.current || revealed) return; asked.current = true; onOpen(); };
  const sparks = useMemo(() => momentParticles(PARTICLES.sparkles, budget, reducedMotion), [budget, reducedMotion]);
  const coins = useMemo(() => momentParticles(8, budget, reducedMotion), [budget, reducedMotion]);
  const schedule = useMemo(() => rowSchedule(rows, dropIn ? LEVEL_CHEST.rowBeat : REVEAL_ROWS.beat, REVEAL_ROWS.hold, REVEAL_ROWS.first),
    [rows.length, dropIn]); // eslint-disable-line react-hooks/exhaustive-deps

  // A level chest: it drops in with a dust ring, rattles three times (each harder) while light leaks
  // from the lid, a tap ring shows, and it opens by itself 2 s after landing if nobody taps.
  useEffect(() => {
    if (!dropIn || reducedMotion) return;
    drop.value = withSpring(0, SPRING.land);
    dust.value = withDelay(260, withTiming(1, { duration: 520, easing: EASE.out }));
    later(() => { queueHaptic('hitMedium'); playSfx('fx.hit', 0.8); }, 260);
    const L = LEVEL_CHEST.landMs;
    const rattleHaptics = ['tickSelection', 'tapLight', 'hitMedium'] as const;
    shake.value = withSequence(...LEVEL_CHEST.rattles.map((r, i) => withDelay(i === 0 ? L : r.at - LEVEL_CHEST.rattles[i - 1].at - LEVEL_CHEST.rattleMs,
      withSequence(withTiming(r.deg, { duration: 60, easing: EASE.out }), withTiming(-r.deg, { duration: 80 }),
        withTiming(r.deg * 0.5, { duration: 50 }), withTiming(0, { duration: 50 })))));
    leak.value = withDelay(L, withTiming(1, { duration: LEVEL_CHEST.rattles[2].at + LEVEL_CHEST.rattleMs, easing: EASE.charge }));
    gold.value = withDelay(L, withTiming(0.45, { duration: LEVEL_CHEST.rattles[2].at + LEVEL_CHEST.rattleMs, easing: EASE.charge }));
    LEVEL_CHEST.rattles.forEach((r, i) => later(() => { queueHaptic(rattleHaptics[i]); playSfx('ui.button', 0.5 + i * 0.2); }, L + r.at));
    later(() => setShowTap(true), L + LEVEL_CHEST.handAt);
    tapRing.value = withDelay(L + LEVEL_CHEST.handAt, withRepeat(withTiming(1, { duration: 900, easing: EASE.out }), 3, false));
    later(() => requestOpen(), L + LEVEL_CHEST.autoOpenAt);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The full set hands straight into the chest: it starts opening on the first frame.
  useEffect(() => { if (autoOpen && !revealed && !opening) requestOpen(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Idle: a gentle bob, so it asks to be tapped (a level chest rattles instead).
  useEffect(() => {
    cancelAnimation(bob);
    bob.value = 0;
    if (reducedMotion || revealed || opening || !ambient || dropIn || autoOpen) return;
    bob.value = withRepeat(withSequence(
      withTiming(-7, { duration: 850, easing: Easing.inOut(Easing.sin) }),
      withTiming(0, { duration: 850, easing: Easing.inOut(Easing.sin) }),
    ), -1);
    return () => cancelAnimation(bob);
  }, [revealed, opening, reducedMotion, ambient, bob, dropIn, autoOpen]);

  // Gather: the shake builds and gold light grows behind the chest for as long as the server takes,
  // with rising ticks (never a static line), then settles calmly if it is slow.
  useEffect(() => {
    // The full set starts gathering on its first frame (its claim is already on the way).
    if (!(opening || autoOpen) || revealed) return;
    setStalled(false);
    setShowTap(false);
    cancelAnimation(tapRing); tapRing.value = 0;
    const stall = setTimeout(() => { setStalled(true); cancelAnimation(shake); shake.value = withTiming(0, { duration: 200 }); }, STALL_MS);
    if (!reducedMotion) {
      shake.value = withSequence(
        ...[4, -4, 7, -7, 10, -10].map(v => withTiming(v, { duration: 55 })),
        withRepeat(withSequence(withTiming(12, { duration: 55 }), withTiming(-12, { duration: 55 })), 50, true),
      );
      gold.value = withSequence(withTiming(0.42, { duration: beats.anticipation, easing: EASE.charge }),
        withRepeat(withSequence(withTiming(0.55, { duration: 320 }), withTiming(0.42, { duration: 320 })), -1));
      squash.value = withTiming(0.94, { duration: beats.anticipation, easing: EASE.charge });
      // Rising ticks while it gathers (at most 8, each a step higher).
      for (let i = 0; i < 8; i++) {
        later(() => { queueHaptic(i < 2 ? 'tickSelection' : 'tapLight'); playSfx('fx.coinTick', 0.35 + Math.min(0.5, i * 0.07)); }, i < 3 ? i * 140 : 420 + (i - 3) * 260);
      }
    }
    playSfx('fx.redeemOpen', 0.8);
    return () => { clearTimeout(stall); cancelAnimation(shake); shake.value = 0; };
  }, [opening || autoOpen, revealed, reducedMotion, shake]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hold, burst, settle: then one row per beat.
  useEffect(() => {
    if (!revealed) { setLanded(0); setSwapped(false); setButtonReady(false); return; }
    openedAt.current = Date.now();
    cancelAnimation(shake); shake.value = 0;
    cancelAnimation(gold);
    timers.current.forEach(clearTimeout); timers.current = [];
    setShowTap(false);
    if (reducedMotion) {
      setSwapped(true);
      gold.value = withTiming(0.6, { duration: DURATION.quick });
      haptic('success'); playSfx('fx.reward');
      rows.forEach((row, i) => later(() => {
        setLanded(n => Math.max(n, i + 1));
        haptic(isBigReward(row.kind) ? 'comboHeavy' : 'tickSelection');
        if (isBigReward(row.kind) && !known) scroll.current?.scrollToEnd({ animated: false });
      }, 120 * (i + 1)));
      later(() => setButtonReady(true), 120 * rows.length + 300);
      return;
    }
    const H = DURATION.hitStop;
    // Hold: one frame held still and squashed, a soft flash (capped; none brighter with Dim Flashing Lights).
    squash.value = withSequence(withTiming(0.86, { duration: H, easing: EASE.in }), withSpring(1, { damping: 6, stiffness: 240 }));
    flash.value = withSequence(withTiming(flashPeak(isDimFlashingLightsEnabled(), false), { duration: 50 }),
      withTiming(0, { duration: DURATION.flash }));
    leak.value = withTiming(0, { duration: 200 });
    later(() => setSwapped(true), H);
    // Burst: the lid pops past full size on the pop spring, rays bloom, coins fountain out, sparkles fly.
    pop.value = withDelay(H, withSequence(withTiming(1.24, { duration: 110, easing: EASE.out }), withSpring(1, SPRING.pop)));
    gold.value = withDelay(H, withSequence(withTiming(1, { duration: 160, easing: EASE.out }), withDelay(900, withTiming(0.75, { duration: 600 }))));
    bloom.value = withDelay(H, withSequence(withTiming(1, { duration: DURATION.bloom * 0.35 }), withTiming(0, { duration: DURATION.bloom * 0.65 })));
    burst.value = 0;
    burst.value = withDelay(H, withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }));
    sparkle.value = 0;
    sparkle.value = withDelay(H, withTiming(1, { duration: DURATION.sparkle, easing: EASE.out }));
    later(() => { playHaptic('golden'); playSfx('fx.reward'); }, H);
    later(() => setButtonReady(true), (schedule[schedule.length - 1] ?? 400) + doneDelay(rows));
    schedule.forEach((ms, i) => later(() => {
      setLanded(n => Math.max(n, i + 1));
      const big = isBigReward(rows[i].kind);
      // On a small phone the rows scroll: the hero cards (always last) slide into view as they land.
      // (A card sized to its prizes never scrolls: every row stays in view.)
      if (big && !known) later(() => scroll.current?.scrollToEnd({ animated: true }), 40);
      queueHaptic(big ? 'comboHeavy' : 'tickSelection');
      playSfx(big ? 'fx.firework' : rows[i].kind === 'coins' || rows[i].kind === 'bonus_coins' ? 'fx.coin' : 'fx.coinTick', big ? 1 : 0.6 + i * 0.08);
    }, ms + H));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, reducedMotion]);

  // The chest glow flares again when a hero card lands.
  const pulseGlow = () => { if (!reducedMotion) bloom.value = withSequence(withTiming(0.8, { duration: 120 }), withTiming(0, { duration: 400 })); };
  const chestStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bob.value - drop.value * 160 }, { rotate: `${shake.value}deg` }, { scale: pop.value },
      { scaleY: squash.value }, { scaleX: 2 - squash.value }],
  }));
  const leakStyle = useAnimatedStyle(() => ({ opacity: leak.value, transform: [{ scaleX: 0.6 + leak.value * 0.6 }] }));
  const dustStyle = useAnimatedStyle(() => ({
    opacity: dust.value <= 0 || dust.value >= 1 ? 0 : 0.7 * (1 - dust.value),
    transform: [{ scaleX: 0.5 + dust.value * 1.1 }, { scaleY: 0.5 + dust.value * 0.5 }],
  }));
  const tapStyle = useAnimatedStyle(() => ({ opacity: tapRing.value <= 0 ? 0 : 0.9 * (1 - tapRing.value), transform: [{ scale: 0.7 + tapRing.value * 0.6 }] }));
  const allIn = revealed && landed >= rows.length && buttonReady;
  const skip = () => {
    // The first 350 ms after the lid pops ignore taps (a quick double tap never skips the show).
    if (!revealed || allIn || Date.now() - openedAt.current < 350) return;
    timers.current.forEach(clearTimeout); timers.current = [];
    setLanded(rows.length); setSwapped(true);
    // Skipping still lands the last hero with a short slam (repeat openers mostly see this version).
    setReplay(k => k + 1);
    const last = rows[rows.length - 1];
    if (last && isBigReward(last.kind)) { haptic('comboHeavy'); playSfx('fx.firework', 0.8); }
    later(() => setButtonReady(true), 400);
  };
  const hint = stalled ? 'Still opening...' : opening || autoOpen || dropIn ? null : 'Tap to open!';

  return (
    <View style={styles.card}>
      {fullSet ? <FullSetChecks reducedMotion={reducedMotion} /> : <Text style={styles.subtitle}>{subtitle}</Text>}
      <Pressable onPress={!revealed && !opening ? requestOpen : skip} disabled={opening && !revealed} accessibilityRole="button"
        accessibilityLabel={revealed ? 'Opened' : 'Tap to open'} style={[styles.stage, { height: stageH }]}
        onLayout={e => setStage({ x: e.nativeEvent.layout.x + e.nativeEvent.layout.width / 2, y: e.nativeEvent.layout.y + e.nativeEvent.layout.height / 2 })}>
        <GoldBurst size={size * 2.3} amount={gold} bloom={bloom} reduced={reducedMotion} style={styles.abs} />
        <RadialFlash flash={flash} size={size * 1.5} />
        <Animated.View pointerEvents="none" style={[styles.dust, { width: size * 1.1, height: size * 0.28, top: stageH / 2 + size * 0.36 }, dustStyle]}>
          <Image source={SOFT} style={StyleSheet.absoluteFill} contentFit="fill" tintColor="#ffffff" transition={0} />
        </Animated.View>
        {showTap && (
          <Animated.View pointerEvents="none" style={[styles.tapRing, { width: size * 1.05, height: size * 1.05, borderRadius: size }, tapStyle]} />
        )}
        <Animated.View style={chestStyle}>
          <Image source={swapped ? openArt : closedArt} style={{ width: size, height: size }} contentFit="contain" transition={0} />
          {/* Light leaking from the lid seam while a level chest rattles. */}
          <Animated.View pointerEvents="none" style={[styles.leak, { width: size * 1.05, height: size * 0.36, top: size * 0.24, left: -size * 0.025 }, leakStyle]}>
            <Image source={SOFT} style={StyleSheet.absoluteFill} contentFit="fill" tintColor="#FFF4B8" transition={0} />
          </Animated.View>
        </Animated.View>
        <View style={styles.center} pointerEvents="none">
          <SparkleBurst progress={sparkle} count={sparks} radius={size * 0.95} />
          <CoinFountain progress={burst} count={coins} spread={size * 0.9} />
        </View>
      </Pressable>
      <Pressable onPress={skip} disabled={!revealed || allIn} accessible={false} style={{ alignSelf: 'stretch' }}>
        <ScrollView ref={scroll} style={{ height: rowsHeight }} contentContainerStyle={styles.rows} scrollEnabled={revealed}
          showsVerticalScrollIndicator={false}>
          {!revealed ? (
            <View style={[styles.hintBox, { height: rowsHeight - 8 }]}>
              {hint ? <Text style={styles.hint}>{hint}</Text> : preview && !stalled ? <PreviewIn>{preview}</PreviewIn> : null}
            </View>
          ) : rows.map((row, i) => (
            <Row key={row.kind} row={row} shown={i < landed} reducedMotion={reducedMotion} compact={compact}
              countMs={rowCountMs(schedule[i] ?? 0, COUNT.ms)}
              slamKey={i === rows.length - 1 ? replay : 0} onLand={isBigReward(row.kind) ? pulseGlow : undefined}
              onWear={row.kind === 'item' ? onWear : undefined} onPins={row.kind === 'mystery_boxes' ? onPins : undefined} />
          ))}
        </ScrollView>
      </Pressable>
      <View style={[styles.bottom, known && styles.bottomKnown]}>
        {allIn ? <DoneArea footer={footer} label={doneLabel ?? 'AWESOME!'} onDone={onDone} reducedMotion={reducedMotion} /> : null}
      </View>
      {stage && budget.animate && budget.particleScale >= 0.5 && <RewardBurst progress={burst} x={stage.x} y={stage.y} />}
    </View>
  );
}

/**
 * The full set's three gold checks: they bounce one after another (120 ms apart, rising ticks), then
 * dive into the chest as it starts to gather (the goals you finished charge the chest).
 */
function FullSetChecks({ reducedMotion }: { readonly reducedMotion: boolean }) {
  const a = useSharedValue(reducedMotion ? 1 : 0);
  const b = useSharedValue(reducedMotion ? 1 : 0);
  const c = useSharedValue(reducedMotion ? 1 : 0);
  const dive = useSharedValue(0);
  const vals = [a, b, c];
  useEffect(() => {
    if (reducedMotion) return;
    vals.forEach((v, i) => {
      v.value = withDelay(FULL_SET.checksAt + i * FULL_SET.checkStep, withSequence(withTiming(1.35, { duration: 110, easing: EASE.out }), withSpring(1, SPRING.pop)));
    });
    dive.value = withDelay(FULL_SET.chestAt, withTiming(1, { duration: 300, easing: EASE.in }));
    const timers = FULL_SET.tickSteps.map((step, i) => setTimeout(() => {
      queueHaptic('tickSelection');
      playSfx(LOOP_CUES.checkBounce.fallback, 0.5 + step / 16);
    }, FULL_SET.checksAt + i * FULL_SET.checkStep));
    return () => timers.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={styles.checks} accessibilityLabel="All three goals done">
      {vals.map((v, i) => <DivingCheck key={i} v={v} dive={dive} index={i} />)}
    </View>
  );
}

function DivingCheck({ v, dive, index }: { readonly v: SharedValue<number>; readonly dive: SharedValue<number>; readonly index: number }) {
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, v.value * 2) * (1 - dive.value),
    transform: [{ translateX: (1 - index) * 52 * dive.value }, { translateY: 90 * dive.value }, { scale: v.value * (1 - 0.6 * dive.value) }],
  }));
  return <Animated.View style={style}><GoldCheckCoin size={40} /></Animated.View>;
}

/** The preview of what is inside rises in softly while the chest gathers. */
function PreviewIn({ children }: { readonly children: React.ReactNode }) {
  const a = useSharedValue(0);
  useEffect(() => { a.value = withTiming(1, { duration: DURATION.enter, easing: EASE.out }); }, [a]);
  const style = useAnimatedStyle(() => ({ opacity: 0.9 * a.value, transform: [{ translateY: (1 - a.value) * 10 }] }));
  return <Animated.View style={[{ alignItems: 'center', gap: 6 }, style]}>{children}</Animated.View>;
}

/** Gold coins arcing up out of the open chest and falling back with gravity (one shared progress, budgeted count). */
function CoinFountain({ progress, count, spread }: { readonly progress: SharedValue<number>; readonly count: number; readonly spread: number }) {
  const pieces = useMemo(() => Array.from({ length: count }, (_, i) => {
    const side = i % 2 ? 1 : -1;
    return { vx: side * (0.25 + ((i * 37) % 60) / 100) * spread, vy: -(0.9 + ((i * 53) % 50) / 100) * spread * 1.1,
      spin: side * (180 + ((i * 29) % 180)), delay: (i % 4) * 0.035, size: 22 + (i % 3) * 5 };
  }), [count, spread]);
  if (count <= 0) return null;
  return <>{pieces.map((p, i) => <FountainCoin key={i} p={p} progress={progress} />)}</>;
}

function FountainCoin({ p, progress }: {
  readonly p: { readonly vx: number; readonly vy: number; readonly spin: number; readonly delay: number; readonly size: number };
  readonly progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const t = Math.max(0, Math.min(1, (progress.value - p.delay) / (1 - p.delay)));
    if (t <= 0 || t >= 1) return { opacity: 0, transform: [{ scale: 0 }] };
    // A thrown arc: up fast, gravity pulls it back down past the lid.
    const x = p.vx * t;
    const y = p.vy * t + 2.2 * Math.abs(p.vy) * t * t;
    return { opacity: t < 0.75 ? 1 : (1 - t) / 0.25, transform: [{ translateX: x }, { translateY: y }, { rotate: `${p.spin * t}deg` },
      { scale: t < 0.12 ? t / 0.12 : 1 }] };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: -p.size / 2, top: -p.size / 2 - 10, width: p.size, height: p.size }, style]}>
      <Image source={ICON_SOURCES.coin} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
    </Animated.View>
  );
}

/** The closing line and the button fade up together (200 ms), never pop in. */
function DoneArea({ footer, label, onDone, reducedMotion }: {
  readonly footer?: React.ReactNode; readonly label: string; readonly onDone: () => void; readonly reducedMotion: boolean;
}) {
  const a = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => { if (!reducedMotion) a.value = withTiming(1, { duration: 200 }); }, [reducedMotion, a]);
  const style = useAnimatedStyle(() => ({ opacity: a.value, transform: [{ translateY: (1 - a.value) * 8 }] }));
  return (
    <Animated.View style={[{ gap: 8 }, style]}>
      {footer}
      <Pressable onPress={onDone} accessibilityRole="button" style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
        <Text style={styles.buttonText}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function rowIcon(row: RewardRow) {
  switch (row.kind) {
    case 'coins': return <GameIcon name="coins" size={40} />;
    case 'bonus_coins': return <GameIcon name="coins" size={40} />;
    case 'tickets': return <GameIcon name="ticket" size={40} />;
    case 'energy': return <GameIcon name="energy" size={40} />;
    case 'xp': return <GameIcon name="xp" size={40} />;
    case 'freezes': return <Image source={FREEZE} style={{ width: 64, height: 64 }} contentFit="contain" />;
    case 'mystery_boxes': return <Image source={BOX} style={{ width: 72, height: 72 }} contentFit="contain" />;
    case 'item': return row.image
      ? <Image source={{ uri: row.image }} style={{ width: 80, height: 80 }} contentFit="contain" />
      : <GameIcon name="shark" size={64} />;
  }
}

/**
 * Counts a number up once it is shown: starts a third of the way (never "+0"), eases out over `ms`
 * (at most COUNT.ms), and lands on the exact number. Instant when motion is reduced.
 */
function useCountUp(target: number, run: boolean, instant: boolean, ms: number): number {
  const [n, setN] = useState(instant ? target : countStart(target));
  useEffect(() => {
    if (!run) return;
    if (instant || target <= 1) { setN(target); return; }
    const start = countStart(target);
    setN(start);
    const steps = Math.max(4, Math.min(COUNT.maxTicks, Math.round(ms / 50)));
    let f = 0;
    const id = setInterval(() => {
      f += 1;
      const t = 1 - Math.pow(1 - f / steps, 3);
      setN(f >= steps ? target : Math.max(start, Math.round(start + (target - start) * t)));
      if (f >= steps) clearInterval(id);
    }, ms / steps);
    return () => clearInterval(id);
  }, [run, target, instant, ms]);
  return n;
}

function Row({ row, shown, reducedMotion, onWear, onPins, compact = false, slamKey = 0, onLand, countMs }: {
  readonly row: RewardRow; readonly shown: boolean; readonly reducedMotion: boolean; readonly compact?: boolean;
  readonly slamKey?: number; readonly onLand?: () => void; readonly countMs: number;
  readonly onWear?: () => void; readonly onPins?: () => void;
}) {
  const big = isBigReward(row.kind);
  const t = useSharedValue(0);
  const beam = useSharedValue(0);
  const bump = useSharedValue(1);
  useEffect(() => {
    if (!shown) { t.value = 0; return; }
    if (reducedMotion) { t.value = withTiming(1, { duration: 150 }); return; }
    // Hero cards: slam past rest, a held beat, then spring back to 1. Small prizes stamp in on the stamp spring.
    t.value = big ? withSequence(withTiming(1.114, { duration: 120, easing: Easing.in(Easing.quad) }), withDelay(90, withSpring(1, { damping: 7, stiffness: 260 })))
      : withSpring(1, SPRING.stamp);
    if (big) { beam.value = withSequence(withTiming(1, { duration: 140 }), withTiming(0, { duration: 900 })); onLand?.(); }
    // The number lands with a little bump when its roll ends.
    else bump.value = withDelay(countMs, withSequence(withTiming(COUNT.finalBump, { duration: 70 }), withSpring(1, SPRING.stamp)));
  }, [shown, reducedMotion, big, t, beam]); // eslint-disable-line react-hooks/exhaustive-deps
  // A skip replays a short slam on the last hero (250 ms).
  useEffect(() => {
    if (!slamKey || !big || reducedMotion) return;
    t.value = withSequence(withTiming(1.08, { duration: 90 }), withSpring(1, { damping: 8, stiffness: 300 }));
    onLand?.();
  }, [slamKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, t.value * 1.5),
    transform: big
      ? [{ scale: 1.35 - t.value * 0.35 }]
      : [{ translateY: (1 - t.value) * -18 }, { scale: 0.7 + t.value * 0.3 }],
  }));
  const beamStyle = useAnimatedStyle(() => ({ opacity: beam.value }));
  const bumpStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  const amount = useCountUp(row.amount, shown, reducedMotion, countMs);
  return (
    // Laid out from the start (no jump); the face is a plain View (iOS clips a scaled bordered background).
    <Animated.View style={style}>
      {big && <Animated.View pointerEvents="none" style={[styles.beam, beamStyle]} />}
      <View style={[styles.row, big && styles.rowBig, compact && styles.rowCompact]}>
        <View style={[styles.rowIcon, big && styles.rowIconBig]}>{rowIcon(row)}</View>
        {big ? (
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.bigKicker}>{row.kind === 'item' ? 'NEW GEAR' : row.kind === 'freezes' ? 'STREAK FREEZE' : 'FREE MYSTERY BOX'}</Text>
            <Text style={styles.bigName} numberOfLines={2}>{row.kind === 'item' ? row.label
              : row.kind === 'freezes' ? 'Your flame is safe if you miss a day' : 'A surprise pin is inside'}</Text>
            {(onWear || onPins) && (
              <Pressable onPress={onWear ?? onPins} accessibilityRole="button" hitSlop={6}
                style={({ pressed }) => [styles.smallBtn, pressed && styles.buttonPressed]}>
                <Text style={styles.smallBtnText}>{onWear ? 'WEAR IT' : 'SEE PINS'}</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <Animated.View style={[{ flex: 1 }, bumpStyle]}>
            <Text style={styles.rowText} numberOfLines={1}>
              <Text style={styles.rowAmount}>{`+${amount} `}</Text>{row.label}
            </Text>
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { width: '94%', marginTop: -14, backgroundColor: BRAND.blue, borderRadius: 24, borderWidth: 4, borderColor: BRAND.white,
    paddingTop: 20, paddingBottom: 14, paddingHorizontal: 12, alignItems: 'center', overflow: 'hidden' },
  subtitle: { fontFamily: 'Knockout', fontSize: 17, color: '#e4f7ff', textAlign: 'center', minHeight: 22 },
  checks: { flexDirection: 'row', gap: 12, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  stage: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  abs: { position: 'absolute' },
  center: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 },
  dust: { position: 'absolute' },
  leak: { position: 'absolute' },
  tapRing: { position: 'absolute', borderWidth: 5, borderColor: BRAND.white },
  // Few prizes sit in the middle of the rows area, not at the top of an empty panel.
  rows: { gap: 6, paddingVertical: 4, flexGrow: 1, justifyContent: 'center' },
  hintBox: { alignItems: 'center', justifyContent: 'center' },
  hint: { fontFamily: 'Shark', fontSize: 22, color: BRAND.gold, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 2 },
  rowCompact: { minHeight: 0, paddingVertical: 0 },
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
  bottom: { alignSelf: 'stretch', minHeight: 96, justifyContent: 'flex-end', gap: 8, marginTop: 6 },
  // The Daily 3 chest footer holds the flame row too.
  bottomKnown: { minHeight: 146 },
  button: { alignSelf: 'stretch', backgroundColor: BRAND.gold, borderRadius: 16, paddingVertical: 12,
    alignItems: 'center', borderBottomWidth: 4, borderBottomColor: BRAND.goldLip },
  buttonPressed: { transform: [{ translateY: 2 }], borderBottomWidth: 2 },
  buttonText: { fontFamily: 'Shark', fontSize: 20, color: '#075083' },
});
