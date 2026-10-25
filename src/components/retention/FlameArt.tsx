import { Image } from 'expo-image';
import { useMemo } from 'react';
import { StyleSheet, Text, View, type TextStyle, type StyleProp } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming, type SharedValue,
} from 'react-native-reanimated';
import useAmbientLoop from '../../power/useAmbientLoop';
import { flameLook, nextFlameLine, nextFlameSize } from '../../services/retention/loopMotion';
import { GOLD_FX } from '../../ui/motion';

const FLAME = require('../../../assets/icons/game/streak.png');
const SOFT = require('../../../assets/images/reveal/soft-spot.webp');
const SPARK = require('../../../assets/fx/spark.webp');
const CROWN = require('../../assets/games/banana-basket/v2/crown.png');
const DAILY_CHEST = require('../../../assets/images/daily/chest-closed.png');
const GIFT = require('../../../assets/icons/game/gift.png');

/**
 * Alex's flame, grown by the streak so a kid can read it from across the room,
 * on a clear size ladder (0.55, 0.7, 0.85, 1.0, 1.1, 1.2): 0 days is a small
 * glowing coal with one spark (warm, never grey or sad), small (1 to 2 days),
 * medium (3 to 6), big with drifting sparks (7 to 29), a white-gold hot core
 * with a lick of blue-white at the tip (30 to 99), and a gold crown in a gold
 * ring (100 and up).
 *
 * Cheap: one ambient clock (useAmbientLoop: stops when idle, in the
 * background, in Battery Saver idle and with Reduce Motion) drives the
 * flicker and every spark on the UI thread. The box never changes size with
 * the tier (no layout jumps): the art scales inside it.
 *
 * `boost` (0..1) lets a moment swell the flame (a whoosh on +1, a charge on a milestone).
 */
export default function FlameArt({ days, size, reducedMotion, still = false, boost, ghost = false }: {
  readonly days: number;
  /** The box (pt). The art at scale 1 fills about 86 percent of it. */
  readonly size: number;
  readonly reducedMotion: boolean;
  /** No ambient flicker (lists, ghost flames). */
  readonly still?: boolean;
  readonly boost?: SharedValue<number>;
  /** Tomorrow's flame: a soft white silhouette (no halo, no sparks), never a muddy see-through flame. */
  readonly ghost?: boolean;
}) {
  const look = flameLook(days);
  const clock = useSharedValue(0);
  useAmbientLoop(
    () => { clock.value = 0; clock.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.linear }), -1, false); },
    () => { cancelAnimation(clock); clock.value = 0; },
    !still && !reducedMotion && !ghost,
  );
  const coal = days <= 0 && !ghost;
  const art = size * 0.86;
  const flameStyle = useAnimatedStyle(() => {
    // Two flickers per clock turn: scaleY breathes, a small lean.
    const f = Math.sin(clock.value * Math.PI * 4);
    const b = boost ? boost.value : 0;
    // A coal sits low and wide; a flame stands up and leans as it flickers.
    return { transform: [{ translateY: art * (coal ? 0.22 : 0.05 * (1 - look.scale)) }, { scale: look.scale * (1 + 0.22 * b) },
      { scaleY: (coal ? 0.62 : 1) * (1 + 0.045 * f) }, { rotate: `${(coal ? 0.8 : 2.4) * Math.sin(clock.value * Math.PI * 2)}deg` }] };
  });
  const haloStyle = useAnimatedStyle(() => {
    const b = boost ? boost.value : 0;
    return { opacity: Math.min(1, look.halo + 0.08 * Math.sin(clock.value * Math.PI * 4) + 0.4 * b),
      transform: [{ scale: 0.7 + look.scale * 0.45 + 0.25 * b }] };
  });
  const coreStyle = useAnimatedStyle(() => ({
    opacity: 0.75 + 0.2 * Math.sin(clock.value * Math.PI * 4 + 1),
    transform: [{ scale: look.scale * (0.92 + 0.08 * Math.sin(clock.value * Math.PI * 4)) }],
  }));
  // The 30+ flame's blue-white lick at the tip (the hottest part), flickering with the clock.
  const lickStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + 0.35 * Math.sin(clock.value * Math.PI * 4 + 2),
    transform: [{ scaleY: 0.9 + 0.2 * Math.sin(clock.value * Math.PI * 4 + 2) }],
  }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: 0.7 + 0.25 * Math.sin(clock.value * Math.PI * 2), transform: [{ rotate: `${clock.value * 360}deg` }] }));
  const crownStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -art * 0.5 * look.scale + 2 * Math.sin(clock.value * Math.PI * 2) }, { rotate: '-8deg' }],
  }));
  return (
    <View style={[styles.box, { width: size, height: size }]} pointerEvents="none">
      {!ghost && (
        <Animated.View style={[styles.layer, { width: size * 1.1, height: size * 1.1 }, haloStyle]}>
          <Image source={SOFT} style={StyleSheet.absoluteFill} contentFit="fill" tintColor={GOLD_FX.glow} transition={0} cachePolicy="memory-disk" />
        </Animated.View>
      )}
      {look.crown && !ghost && (
        <Animated.View style={[styles.layer, styles.ring, { width: size * 1.02, height: size * 1.02, borderRadius: size }, ringStyle]} />
      )}
      {look.sparks > 0 && !still && !reducedMotion && !ghost && <Sparks clock={clock} count={coal ? 1 : look.sparks} size={coal ? art * 0.5 : art} />}
      <Animated.View style={[styles.layer, { width: art, height: art }, flameStyle]}>
        <Image source={FLAME} style={[StyleSheet.absoluteFill, days <= 0 && styles.ember]} contentFit="contain" transition={0} cachePolicy="memory-disk"
          tintColor={ghost ? '#ffffff' : undefined} />
        {look.core && !ghost && (
          <Animated.View style={[styles.core, { width: art * 0.44, height: art * 0.44, bottom: art * 0.1, left: art * 0.28 }, coreStyle]}>
            <Image cachePolicy="memory-disk" source={SOFT} style={StyleSheet.absoluteFill} contentFit="fill" tintColor={GOLD_FX.core} transition={0} />
          </Animated.View>
        )}
        {look.core && !ghost && (
          <Animated.View style={[styles.core, { width: art * 0.24, height: art * 0.34, top: art * 0.1, left: art * 0.4 }, lickStyle]}>
            <Image cachePolicy="memory-disk" source={SOFT} style={StyleSheet.absoluteFill} contentFit="fill" tintColor="#dff4ff" transition={0} />
          </Animated.View>
        )}
      </Animated.View>
      {look.crown && !ghost && (
        <Animated.View style={[styles.layer, { width: art * 0.62, height: art * 0.62 }, crownStyle]}>
          <Image source={CROWN} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} cachePolicy="memory-disk" />
        </Animated.View>
      )}
    </View>
  );
}

/**
 * The next flame size as a picture: today's flame, a little arrow, and the next
 * tier's flame as a white silhouette (bigger, so the goal reads with zero
 * words), then "N more days" for readers. Past 100 it shows the crown flame.
 */
export function NextFlameGoal({ days, size = 30, textStyle, short = false }: {
  readonly days: number; readonly size?: number; readonly textStyle?: StyleProp<TextStyle>;
  /** Just "N more days" (the picture already shows which flame). */
  readonly short?: boolean;
}) {
  const next = nextFlameSize(days);
  const full = nextFlameLine(days);
  const line = short && next ? (next.away === 1 ? '1 more day!' : `${next.away} more days`) : full;
  return (
    <View style={styles.goal} accessible accessibilityLabel={full ?? undefined}>
      <FlameArt days={days} size={size} reducedMotion still />
      {next && <Text style={styles.arrow} allowFontScaling={false}>{'>'}</Text>}
      {next && (
        <View style={styles.ghostWrap}>
          <FlameArt days={next.day} size={size * 1.25} reducedMotion still ghost />
          <View style={styles.ghostDay}><Text style={styles.ghostDayText} allowFontScaling={false}>{next.day}</Text></View>
        </View>
      )}
      {/* The days to go lead as a big gold number (a non-reader sees "23" and the bigger flame), then the words. */}
      {next && next.away > 1 ? <View style={styles.awayChip}><Text style={styles.awayNum} allowFontScaling={false}>{next.away}</Text></View> : null}
      {line ? <Text style={[styles.goalText, textStyle, styles.goalMin]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
        {next && next.away > 1 ? line.replace(/^\d+\s+/, '') : line}</Text> : null}
    </View>
  );
}

/**
 * Tomorrow, as one big picture a non-reader gets at a glance: tomorrow's flame as a ghost with its day number on it,
 * a plus, and the real prize waiting (the Daily 3 chest, or a present only when gear is really next) wiggling gently,
 * then "Tomorrow!". No small print and no far ladder: the flame size ladder lives in the flame itself.
 */
export function TomorrowGoal({ days, prize, size = 30, textStyle, reducedMotion = false }: {
  readonly days: number;
  /** Tomorrow's prize: 'chest' (the Daily 3 chest), 'gear' (a gift) or 'flame' (the flame alone). */
  readonly prize: 'chest' | 'gear' | 'flame';
  /** The prize art's size (the ghost flame is a touch bigger). At least 40 reads from arm's length. */
  readonly size?: number;
  /** @deprecated The far ladder row is gone; kept so older callers still type-check. */
  readonly far?: boolean;
  readonly textStyle?: StyleProp<TextStyle>;
  readonly reducedMotion?: boolean;
}) {
  const next = Math.max(1, days + 1);
  const wiggle = useSharedValue(0);
  // The prize wiggles 6 degrees, twice, every 3 s (ambient: rests when idle, in the background or with Reduce Motion).
  useAmbientLoop(() => {
    wiggle.value = withRepeat(withSequence(
      withDelay(2400, withTiming(1, { duration: 110 })), withTiming(-1, { duration: 140 }),
      withTiming(1, { duration: 140 }), withTiming(0, { duration: 110 }),
    ), -1);
  }, () => { cancelAnimation(wiggle); wiggle.value = 0; }, !reducedMotion);
  const prizeStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${wiggle.value * 6}deg` }, { scale: 1 + Math.abs(wiggle.value) * 0.05 }] }));
  return (
    <View style={styles.goal} accessible accessibilityLabel={`Tomorrow: day ${next}${prize === 'gear' ? ' and new gear' : prize === 'chest' ? ' and a chest' : ''}`}>
      <View style={[styles.ghostWrap, { width: size * 1.25, height: size * 1.25 }]}>
        <FlameArt days={next} size={size * 1.15} reducedMotion still ghost />
        <View style={[styles.ghostDay, { minWidth: size * 0.75, height: size * 0.62, borderRadius: size * 0.31 }]}>
          <Text style={[styles.ghostDayText, { fontSize: Math.round(size * 0.42) }]} allowFontScaling={false}>{next}</Text>
        </View>
      </View>
      {prize !== 'flame' && <Text style={[styles.plus, { fontSize: Math.round(size * 0.6) }]} allowFontScaling={false}>+</Text>}
      {prize !== 'flame' && (
        <Animated.View style={prizeStyle}>
          <Image cachePolicy="memory-disk" source={prize === 'gear' ? GIFT : DAILY_CHEST} style={{ width: size * 1.15, height: size * 1.15 }} contentFit="contain" transition={0} />
        </Animated.View>
      )}
      <Text style={[styles.goalText, textStyle, styles.goalMin, { fontSize: Math.max(16, Math.round(size * 0.5)) }]} numberOfLines={1}
        adjustsFontSizeToFit minimumFontScale={0.8}>Tomorrow!</Text>
    </View>
  );
}

/** Drifting sparks over a big flame: one shared clock, each spark on its own phase (at most 5). */
function Sparks({ clock, count, size }: { readonly clock: SharedValue<number>; readonly count: number; readonly size: number }) {
  const sparks = useMemo(() => Array.from({ length: Math.min(5, count) }, (_, i) => ({
    phase: i / Math.min(5, count), dx: ((i * 37) % 11 - 5) / 5, s: 8 + (i % 3) * 3,
  })), [count]);
  return (
    <>
      {sparks.map((sp, i) => <Spark key={i} clock={clock} phase={sp.phase} dx={sp.dx} s={sp.s} size={size} />)}
    </>
  );
}

function Spark({ clock, phase, dx, s, size }: {
  readonly clock: SharedValue<number>; readonly phase: number; readonly dx: number; readonly s: number; readonly size: number;
}) {
  const style = useAnimatedStyle(() => {
    const t = (clock.value + phase) % 1;
    return {
      opacity: t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85,
      transform: [{ translateX: dx * size * 0.28 + Math.sin(t * Math.PI * 2) * 4 }, { translateY: -size * 0.15 - t * size * 0.55 },
        { scale: 1 - t * 0.5 }],
    };
  });
  return (
    <Animated.View style={[styles.layer, { width: s, height: s }, style]}>
      <Image source={SPARK} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} cachePolicy="memory-disk" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  layer: { position: 'absolute' },
  core: { position: 'absolute' },
  // A resting coal: the same warm flame art, low and quiet (never grey, never sad).
  ember: { opacity: 0.92 },
  ring: { borderWidth: 3, borderColor: GOLD_FX.rays, borderStyle: 'dashed' },
  goal: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  tomorrowCol: { gap: 2, flexShrink: 1 },
  plus: { fontFamily: 'Shark', color: GOLD_FX.rays, marginTop: 2 },
  farRow: { opacity: 0.8, transform: [{ scale: 0.92 }], alignSelf: 'flex-start' },
  farText: { fontSize: 12, color: '#e4f7ff' },
  arrow: { fontFamily: 'Shark', fontSize: 18, color: GOLD_FX.rays, marginHorizontal: 1, marginTop: 2 },
  ghostWrap: { alignItems: 'center', justifyContent: 'center' },
  ghostDay: { position: 'absolute', bottom: -4, right: -6, paddingHorizontal: 4,
    backgroundColor: '#05346e', borderWidth: 2, borderColor: GOLD_FX.rays, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  ghostDayText: { fontFamily: 'Shark', color: GOLD_FX.rays, marginTop: 2 },
  awayChip: { marginLeft: 6, minWidth: 34, height: 30, borderRadius: 15, paddingHorizontal: 7, backgroundColor: GOLD_FX.rays,
    alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: '#c98a00' },
  awayNum: { fontFamily: 'Shark', fontSize: 21, color: '#075083', marginTop: 2 },
  goalMin: { fontSize: 15 },
  goalText: { fontFamily: 'Shark', fontSize: 15, color: GOLD_FX.rays, marginLeft: 4, flexShrink: 1 },
});
