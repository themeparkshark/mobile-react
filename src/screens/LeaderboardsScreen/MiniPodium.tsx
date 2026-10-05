/**
 * The Standings v2 podium: 236 pt, so the race below shows on the first
 * screen. Alex's barrel art (top third, flipped so silver has the taller base) with the top three
 * standing on it, 2nd left, 1st centre, 3rd right, each with its medal.
 *
 * Motion: the rise (3rd, 2nd, 1st) plays only when the top three changed since
 * this player last looked (`celebrate`); every other visit is a 150 ms fade
 * with finished numbers and no sound. A sound, a haptic and confetti only when
 * the change puts YOU on the podium. Reduced motion: no rise, no confetti.
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { memo, useContext, useEffect, useState } from 'react';
import { Image as RNImage, Pressable, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import { BRAND, GameIcon, RADIUS } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { CROWN_ART, RANK_RING } from './PodiumSpot';
import StandingsShark from './StandingsShark';
import { rowLabel, type StandingsMetric, type StandingsRowModel } from './standingsV2Model';

// Alex's barrels, flipped and re-lit from the top left (ART_QA round 4), so silver stands on the taller barrel.
const BARREL = require('../../../assets/images/screens/leaderboard/barrel-flipped.png');
const RIDE_COIN = require('../../../assets/images/map/ride-coin.png');
const revealSound = require('../../../assets/sounds/reveal.mp3');

export const MINI_PODIUM_HEIGHT = 236;
// Barrel tops only (the painted digits sit lower and stay hidden).
const BARREL_SHOWN = 100;
const CONFETTI_COLORS = [BRAND.gold, BRAND.goldLight, BRAND.white, BRAND.skyDeep, '#ff8a3d', '#ff5d8f'];

/**
 * 30 pieces from three points (left, centre, right) so the burst crosses the full podium
 * width (r7: one centre point stayed small). The side points fan up and inward.
 */
export const CONFETTI_PIECES = 30;
const PIECES = Array.from({ length: CONFETTI_PIECES }, (_, i) => {
  // Fixed per piece (no per-frame randomness): origin, direction, spin, color.
  const origin = i % 3; // 0 left, 1 centre, 2 right
  const k = Math.floor(i / 3) / 9; // 0..1 within its emitter
  const centre = -Math.PI / 2 + (k - 0.5) * 2.0;
  const side = -Math.PI / 2 + (origin === 0 ? 1 : -1) * (0.15 + k * 0.9);
  return {
    origin,
    angle: origin === 1 ? centre : side,
    speed: 0.8 + ((i * 37) % 10) / 16,
    spin: (i % 2 ? 1 : -1) * (300 + ((i * 53) % 240)),
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    w: 8 + (i % 3) * 2,
  };
});

function ConfettiPiece({ piece, t, originX, originY }: { readonly piece: typeof PIECES[number]; readonly t: SharedValue<number>; readonly originX: number; readonly originY: number }) {
  const style = useAnimatedStyle(() => {
    const d = t.value;
    const dist = 170 * piece.speed * d;
    return {
      opacity: d < 0.8 ? 1 : (1 - d) * 5,
      transform: [
        { translateX: originX + Math.cos(piece.angle) * dist },
        { translateY: originY + Math.sin(piece.angle) * dist + 260 * d * d },
        { rotate: `${piece.spin * d}deg` },
      ],
    };
  });
  return <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: piece.w, height: piece.w * 0.55, borderRadius: 1.5, backgroundColor: piece.color }, style]} />;
}

/**
 * Standings' own confetti (r5): 18 pieces on Reanimated, about 1.5 s, then it
 * unmounts. Nothing runs when idle (the shared particle stage cost about 4 s of
 * dropped UI frames here and did not always draw).
 */
function ConfettiBurst({ fireKey, width, y }: { readonly fireKey: number; readonly width: number; readonly y: number }) {
  const xs = [width * 0.14, width / 2, width * 0.86];
  const t = useSharedValue(0);
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!fireKey) return undefined;
    setLive(true);
    t.value = 0;
    t.value = withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) });
    const done = setTimeout(() => setLive(false), 1550);
    return () => clearTimeout(done);
  }, [fireKey, t]);
  if (!live) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
      {PIECES.map((piece, i) => <ConfettiPiece key={i} piece={piece} t={t} originX={xs[piece.origin]} originY={piece.origin === 1 ? y : y + 60} />)}
    </View>
  );
}

/** The board's unit icon: the ride cart for rides won this week, Alex's ride coin for All-Time. */
export function ScoreIcon({ metric, size }: { readonly metric: StandingsMetric; readonly size: number }) {
  return metric === 'ride_coins'
    ? <Image source={RIDE_COIN} style={{ width: size, height: size }} contentFit="contain" />
    : <GameIcon name="ride" size={size} />;
}

/** Each spot's score chip rests on its barrel rim (flipped art: center, then left, then right). */
const SEAT: Record<1 | 2 | 3, number> = { 1: 52, 2: 2, 3: -16 };

function Spot({ rank, row, metric, progress, pop, loading, onPress }: {
  readonly rank: 1 | 2 | 3;
  readonly row: StandingsRowModel | null;
  /** Your spot's scale pop on the crown's haptic beat (r7). */
  readonly pop: SharedValue<number>;
  /** First paint, before any answer: calm shark-disc placeholders, never "OPEN" (r7). */
  readonly loading: boolean;
  readonly metric: StandingsMetric;
  readonly progress: SharedValue<number>;
  readonly onPress: (row: StandingsRowModel) => void;
}) {
  const first = rank === 1;
  const size = first ? 72 : 60;
  const mine = !!row?.isMe;
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value * 1.4),
    transform: [{ translateY: (1 - progress.value) * 34 }, { scale: (0.86 + 0.14 * progress.value) * (mine ? pop.value : 1) }],
  }));
  return (
    <Animated.View style={[{ alignItems: 'center', width: first ? 132 : 112, marginBottom: SEAT[rank] }, style]}>
      {row ? (
        <Pressable accessibilityRole="button" accessibilityLabel={rowLabel(row, metric)} hitSlop={6}
          onPress={() => onPress(row)} style={({ pressed }) => ({ alignItems: 'center', transform: [{ scale: pressed ? 0.95 : 1 }] })}>
          <Image source={CROWN_ART[rank]} style={{ width: first ? 34 : 26, height: first ? 34 : 26, marginBottom: -6, zIndex: 2 }} contentFit="contain" />
          <StandingsShark avatar={row.avatar} size={size} ring={row.isMe ? BRAND.gold : RANK_RING[rank].ring} />
          <View style={{
            marginTop: -8, flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: first ? 130 : 110, paddingHorizontal: 8, height: 24,
            borderRadius: RADIUS.pill, backgroundColor: row.isMe ? BRAND.gold : BRAND.navy, borderWidth: 2, borderColor: row.isMe ? BRAND.goldLip : BRAND.white,
          }}>
            {/* One award language: the crown says the place (r2 art: no medal in the pill too). */}
            {/* The full name, shrunk to fit (r6: names were cut at 12 letters). */}
            <Text maxFontSizeMultiplier={1.2} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}
              style={{ fontFamily: 'Shark', fontSize: 13, color: row.isMe ? BRAND.navy : BRAND.white, textTransform: 'uppercase', flexShrink: 1 }}>
              {row.isMe ? 'You' : row.name}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3, paddingHorizontal: 8, height: 24,
            borderRadius: RADIUS.pill, backgroundColor: BRAND.cream, borderWidth: 2, borderColor: BRAND.gold }}>
            <ScoreIcon metric={metric} size={16} />
            <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: 'Shark', fontSize: 15, color: BRAND.blue, fontVariant: ['tabular-nums'] }}>{row.score}</Text>
          </View>
        </Pressable>
      ) : loading ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ alignItems: 'center' }}>
          <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: 'rgba(255,255,255,0.32)', marginTop: first ? 28 : 20 }} />
          <View style={{ width: first ? 84 : 72, height: 20, borderRadius: RADIUS.pill, backgroundColor: 'rgba(255,255,255,0.32)', marginTop: 6 }} />
        </View>
      ) : (
        <View accessible accessibilityLabel={`Place ${rank} is open`} style={{ alignItems: 'center' }}>
          <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderStyle: 'dashed',
            borderColor: 'rgba(255,255,255,0.85)', backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginTop: first ? 28 : 20 }}>
            <GameIcon name={`medal${rank}` as 'medal1'} size={first ? 34 : 28} />
          </View>
          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: 'Shark', fontSize: 13, color: BRAND.white, marginTop: 4, textShadowColor: BRAND.navy, textShadowRadius: 2 }}>OPEN</Text>
        </View>
      )}
    </Animated.View>
  );
}

function MiniPodium({ podium, metric, celebrate, meJoined, playKey, onPress, dimmed = false, loading = false }: {
  readonly loading?: boolean;
  /** While the Monday card and your climb play, the old top three stand dimmed (r5), then the new podium rises. */
  readonly dimmed?: boolean;
  readonly podium: readonly [StandingsRowModel | null, StandingsRowModel | null, StandingsRowModel | null];
  readonly metric: StandingsMetric;
  /** The top three changed since your last look: play the rise. */
  readonly celebrate: boolean;
  /** You just stepped onto the podium: sound, haptic and confetti. */
  readonly meJoined: boolean;
  readonly playKey: string;
  readonly onPress: (row: StandingsRowModel) => void;
}) {
  const reduced = useUiReducedMotion();
  const { width } = useWindowDimensions();
  const { playSound } = useContext(SoundEffectContext);
  const [confetti, setConfetti] = useState(0);
  const p1 = useSharedValue(reduced ? 1 : 0);
  const p2 = useSharedValue(reduced ? 1 : 0);
  const p3 = useSharedValue(reduced ? 1 : 0);
  const pop = useSharedValue(1);

  useEffect(() => {
    if (reduced) { p1.value = 1; p2.value = 1; p3.value = 1; return; }
    if (dimmed) { p1.value = 1; p2.value = 1; p3.value = 1; return; }
    if (!celebrate) {
      [p1, p2, p3].forEach(p => { p.value = 0.6; p.value = withTiming(1, { duration: 150 }); });
      return;
    }
    const rise = (delay: number) => withDelay(delay, withSpring(1, { damping: 11, stiffness: 200, mass: 0.7 }));
    // Never an empty stage (r7): 2nd and 3rd stay half-risen (the old #1 is pushed to #2 at
    // once) while the new #1 rises from below.
    p3.value = 0.55; p2.value = 0.55; p1.value = 0;
    p3.value = rise(0);
    p2.value = rise(140);
    p1.value = rise(320);
    if (meJoined) {
      // The crown landing: the reveal sound, the only success haptic and the confetti (r5).
      const timer = setTimeout(() => {
        playSound(revealSound);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        // The pop and the confetti land on the haptic's frame (r7).
        pop.value = withSequence(withTiming(1.15, { duration: 110 }), withSpring(1, { damping: 9, stiffness: 260 }));
        setConfetti(n => n + 1);
      }, 620);
      return () => clearTimeout(timer);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey, reduced, dimmed]);

  return (
    <View style={{ height: MINI_PODIUM_HEIGHT, width }}>
      {/* The top of Alex's barrels: coin rims and lids, the spots stand on them. */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: BARREL_SHOWN, overflow: 'hidden' }}>
        {/* Alex's art, flipped: the taller barrel sits under silver (left), the shorter under bronze,
            so the bases read 1 > 2 > 3. Crop and flip only (ART_RULES). */}
        <RNImage source={BARREL} fadeDuration={0} resizeMode="cover" style={{ width, height: width * 683 / 1079 }} />
      </View>
      <View pointerEvents="box-none" style={{
        position: 'absolute', left: 0, right: 0, bottom: 42, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center',
        opacity: dimmed ? 0.45 : 1,
      }}>
        <Spot rank={2} row={podium[1]} metric={metric} progress={p2} pop={pop} loading={loading} onPress={onPress} />
        <Spot rank={1} row={podium[0]} metric={metric} progress={p1} pop={pop} loading={loading} onPress={onPress} />
        <Spot rank={3} row={podium[2]} metric={metric} progress={p3} pop={pop} loading={loading} onPress={onPress} />
      </View>
      {!reduced && <ConfettiBurst fireKey={confetti} width={width} y={70} />}
    </View>
  );
}

export default memo(MiniPodium);
