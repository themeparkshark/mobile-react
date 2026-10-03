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
import { memo, useContext, useEffect, useRef } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import { ParticleField, type ParticleHandle } from '../../gamekit/Particles';
import { BRAND, GameIcon, RADIUS } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { CROWN_ART, RANK_RING } from './PodiumSpot';
import StandingsShark from './StandingsShark';
import { rowLabel, type StandingsMetric, type StandingsRowModel } from './standingsV2Model';

const BARREL = require('../../../assets/images/screens/leaderboard/barrel.png');
const RIDE_COIN = require('../../../assets/images/map/ride-coin.png');
const revealSound = require('../../../assets/sounds/reveal.mp3');

export const MINI_PODIUM_HEIGHT = 236;
// Barrel tops only (the painted digits sit lower and stay hidden).
const BARREL_SHOWN = 100;
const CONFETTI = [BRAND.gold, BRAND.goldLight, BRAND.white, BRAND.skyDeep, '#ff8a3d'];

/** The board's unit icon: the ride cart for rides won this week, Alex's ride coin for All-Time. */
export function ScoreIcon({ metric, size }: { readonly metric: StandingsMetric; readonly size: number }) {
  return metric === 'ride_coins'
    ? <Image source={RIDE_COIN} style={{ width: size, height: size }} contentFit="contain" />
    : <GameIcon name="ride" size={size} />;
}

function Spot({ rank, row, metric, progress, onPress }: {
  readonly rank: 1 | 2 | 3;
  readonly row: StandingsRowModel | null;
  readonly metric: StandingsMetric;
  readonly progress: SharedValue<number>;
  readonly onPress: (row: StandingsRowModel) => void;
}) {
  const first = rank === 1;
  const size = first ? 72 : 60;
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value * 1.4),
    transform: [{ translateY: (1 - progress.value) * 34 }, { scale: 0.86 + 0.14 * progress.value }],
  }));
  return (
    <Animated.View style={[{ alignItems: 'center', width: first ? 132 : 112, marginBottom: first ? 26 : 0 }, style]}>
      {row ? (
        <Pressable accessibilityRole="button" accessibilityLabel={rowLabel(row, metric)} hitSlop={6}
          onPress={() => onPress(row)} style={({ pressed }) => ({ alignItems: 'center', transform: [{ scale: pressed ? 0.95 : 1 }] })}>
          <Image source={CROWN_ART[rank]} style={{ width: first ? 34 : 26, height: first ? 34 : 26, marginBottom: -6, zIndex: 2 }} contentFit="contain" />
          <StandingsShark avatar={row.avatar} size={size} ring={row.isMe ? BRAND.gold : RANK_RING[rank].ring} />
          <View style={{
            marginTop: -8, flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: first ? 130 : 110, paddingHorizontal: 8, height: 24,
            borderRadius: RADIUS.pill, backgroundColor: row.isMe ? BRAND.gold : BRAND.navy, borderWidth: 2, borderColor: row.isMe ? BRAND.goldLip : BRAND.white,
          }}>
            <GameIcon name={`medal${rank}` as 'medal1'} size={16} />
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
              style={{ fontFamily: 'Shark', fontSize: 13, color: row.isMe ? BRAND.navy : BRAND.white, textTransform: 'uppercase', flexShrink: 1 }}>
              {row.isMe ? 'You' : row.name.slice(0, 12)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3, paddingHorizontal: 8, height: 24,
            borderRadius: RADIUS.pill, backgroundColor: BRAND.cream, borderWidth: 2, borderColor: BRAND.gold }}>
            <ScoreIcon metric={metric} size={16} />
            <Text style={{ fontFamily: 'Shark', fontSize: 15, color: BRAND.blue, fontVariant: ['tabular-nums'] }}>{row.score}</Text>
          </View>
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={`Place ${rank} is open`} style={{ alignItems: 'center' }}>
          <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderStyle: 'dashed',
            borderColor: 'rgba(255,255,255,0.85)', backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginTop: first ? 28 : 20 }}>
            <GameIcon name={`medal${rank}` as 'medal1'} size={first ? 34 : 28} />
          </View>
          <Text style={{ fontFamily: 'Shark', fontSize: 13, color: BRAND.white, marginTop: 4, textShadowColor: BRAND.navy, textShadowRadius: 2 }}>OPEN</Text>
        </View>
      )}
    </Animated.View>
  );
}

function MiniPodium({ podium, metric, celebrate, meJoined, playKey, onPress }: {
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
  const particles = useRef<ParticleHandle>(null);
  const p1 = useSharedValue(reduced ? 1 : 0);
  const p2 = useSharedValue(reduced ? 1 : 0);
  const p3 = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) { p1.value = 1; p2.value = 1; p3.value = 1; return; }
    if (!celebrate) {
      [p1, p2, p3].forEach(p => { p.value = 0.6; p.value = withTiming(1, { duration: 150 }); });
      return;
    }
    const rise = (delay: number) => withDelay(delay, withSpring(1, { damping: 11, stiffness: 200, mass: 0.7 }));
    p3.value = 0; p2.value = 0; p1.value = 0;
    p3.value = rise(0);
    p2.value = rise(140);
    p1.value = rise(320);
    if (meJoined) {
      const timer = setTimeout(() => {
        playSound(revealSound);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        particles.current?.burst({ x: width / 2, y: 70, preset: 'confetti', count: 26, colors: CONFETTI, speed: 1 });
      }, 620);
      return () => clearTimeout(timer);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey, reduced]);

  return (
    <View style={{ height: MINI_PODIUM_HEIGHT, width }}>
      {/* The top of Alex's barrels: coin rims and lids, the spots stand on them. */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: BARREL_SHOWN, overflow: 'hidden' }}>
        {/* Alex's art, flipped: the taller barrel sits under silver (left), the shorter under bronze,
            so the bases read 1 > 2 > 3. Crop and flip only (ART_RULES). */}
        <Image source={BARREL} style={{ width, height: width * 683 / 1079, transform: [{ scaleX: -1 }] }} contentFit="cover" />
      </View>
      <View pointerEvents="box-none" style={{
        position: 'absolute', left: 0, right: 0, bottom: BARREL_SHOWN - 30, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center',
      }}>
        <Spot rank={2} row={podium[1]} metric={metric} progress={p2} onPress={onPress} />
        <Spot rank={1} row={podium[0]} metric={metric} progress={p1} onPress={onPress} />
        <Spot rank={3} row={podium[2]} metric={metric} progress={p3} onPress={onPress} />
      </View>
      {!reduced && meJoined && (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height: MINI_PODIUM_HEIGHT }}>
          <ParticleField ref={particles} width={width} height={MINI_PODIUM_HEIGHT} pointerEvents="none" />
        </View>
      )}
    </View>
  );
}

export default memo(MiniPodium);
