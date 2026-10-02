/**
 * One place on the Standings podium (WS8): his crown art, the player's shark in
 * a gold, silver or bronze ring, a navy name plate and a score that counts up
 * once the spot has landed. An empty place is an "open spot" the player can
 * claim, so a park with one or two players still reads as a podium.
 *
 * Motion is driven by the parent (StandingsPodium) through `progress`
 * (0 hidden -> 1 landed) on the UI thread; the crown drops in after the land.
 */
import { Image } from 'expo-image';
import { useContext, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing, interpolate, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
  cancelAnimation, type SharedValue,
} from 'react-native-reanimated';
import * as RootNavigation from '../../RootNavigation';
import Avatar from '../../components/Avatar';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import { PlayerType } from '../../models/player-type';
import { BRAND, GameIcon, type GameIconName } from '../../ui';

const tapSound = require('../../../assets/sounds/tap.mp3');
const STARBURST = require('../../../assets/images/screens/explore/starburst.png');

export const CROWN_ART = {
  1: require('../../../assets/images/screens/leaderboard/crown-gold.png'),
  2: require('../../../assets/images/screens/leaderboard/crown-silver.png'),
  3: require('../../../assets/images/screens/leaderboard/crown-bronze.png'),
} as const;

/** Ring colours are the medal metals; plates and badges stay on the brand navy and gold. */
export const RANK_RING = {
  1: { ring: '#ffcf3b', lip: '#d99a00' },
  2: { ring: '#dfe8f2', lip: '#8fa3b8' },
  3: { ring: '#e39a55', lip: '#a65f24' },
} as const;

export type PodiumRank = 1 | 2 | 3;

/** Counts from 0 to value once `run` turns true. Reduced motion shows the value at once. */
export function useCountUp(value: number, run: boolean, reduced: boolean, durationMs = 900) {
  const [shown, setShown] = useState(reduced ? value : 0);
  useEffect(() => {
    if (reduced) { setShown(value); return; }
    if (!run) { setShown(0); return; }
    let frame = 0;
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / durationMs);
      setShown(Math.round((1 - Math.pow(1 - t, 3)) * value));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, run, reduced, durationMs]);
  return shown;
}

type Props = {
  readonly rank: PodiumRank;
  readonly player: PlayerType | null;
  readonly score: number;
  readonly scoreIcon: GameIconName;
  /** 0 = below the barrel, 1 = landed. Owned by the parent so the three spots are choreographed together. */
  readonly progress: SharedValue<number>;
  readonly landed: boolean;
  readonly reduced: boolean;
  readonly isMe?: boolean;
  /** False on Near Me boards: they never open a profile. */
  readonly interactive?: boolean;
};

export default function PodiumSpot({ rank, player, score, scoreIcon, progress, landed, reduced, isMe, interactive = true }: Props) {
  const { playSound } = useContext(SoundEffectContext);
  const first = rank === 1;
  const avatarPx = first ? 80 : 70;
  const shown = useCountUp(score, landed, reduced);
  const crown = useSharedValue(reduced ? 1 : 0);
  const spin = useSharedValue(0);
  const pulse = useSharedValue(0);
  const started = useRef(false);

  useEffect(() => {
    if (reduced) { crown.value = 1; return; }
    if (!landed || started.current) return;
    started.current = true;
    // Crown drops a beat after the spot lands, overshoots, settles.
    crown.value = withDelay(first ? 60 : 0, withSpring(1, { damping: 7, stiffness: 190, mass: 0.7 }));
    if (first) {
      spin.value = withRepeat(withTiming(1, { duration: 16000, easing: Easing.linear }), -1, false);
      pulse.value = withRepeat(withSequence(
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
      ), -1, false);
    }
  }, [landed, reduced, first, crown, spin, pulse]);

  useEffect(() => () => { cancelAnimation(spin); cancelAnimation(pulse); cancelAnimation(crown); }, [spin, pulse, crown]);

  const riseStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: interpolate(p, [0, 0.25, 1], [0, 1, 1], 'clamp'),
      transform: [
        { translateY: interpolate(p, [0, 1], [first ? 140 : 100, 0]) },
        { scale: interpolate(p, [0, 1], [first ? 0.55 : 0.65, 1]) },
      ],
    };
  });
  const crownStyle = useAnimatedStyle(() => ({
    opacity: interpolate(crown.value, [0, 0.3, 1], [0, 1, 1], 'clamp'),
    transform: [
      { translateY: interpolate(crown.value, [0, 1], [-34, 0]) },
      { rotate: `${interpolate(crown.value, [0, 1], [-18, 0])}deg` },
      { scale: 1 + pulse.value * 0.06 },
    ],
  }));
  const burstStyle = useAnimatedStyle(() => ({
    opacity: crown.value * (0.5 + pulse.value * 0.25),
    transform: [{ rotate: `${spin.value * 360}deg` }, { scale: 0.9 + crown.value * 0.2 }],
  }));

  const ring = RANK_RING[rank];
  const crownPx = first ? 52 : 40;

  if (!player) {
    return (
      <Animated.View style={[{ alignItems: 'center' }, riseStyle]} accessibilityLabel={`Place ${rank} is open`}>
        <View style={{ height: crownPx - 12 }} />
        <View style={{
          width: avatarPx + 12, height: avatarPx + 12, borderRadius: 999, borderWidth: 3, borderStyle: 'dashed',
          borderColor: 'rgba(255,255,255,0.85)', backgroundColor: 'rgba(191,229,255,0.35)', alignItems: 'center', justifyContent: 'center',
        }}>
          <GameIcon name="shark" size={first ? 46 : 38} style={{ opacity: 0.55 }} />
        </View>
        <View style={{ marginTop: 6, paddingHorizontal: 12, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(5,52,110,0.55)',
          borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' }}>
          <Text style={{ fontFamily: 'Shark', fontSize: first ? 15 : 13, color: BRAND.white, letterSpacing: 0.5 }}>OPEN SPOT</Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[{ alignItems: 'center' }, riseStyle]}>
      {first && (
        <Animated.Image source={STARBURST} resizeMode="contain"
          style={[{ position: 'absolute', top: -34, width: 190, height: 190, tintColor: BRAND.goldLight }, burstStyle]} />
      )}
      <Animated.View style={[{ marginBottom: -12, zIndex: 2 }, crownStyle]}>
        <Image source={CROWN_ART[rank]} style={{ width: crownPx, height: crownPx }} contentFit="contain" />
      </Animated.View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${player.screen_name}, place ${rank}, ${score}`}
        disabled={!interactive}
        onPress={() => { playSound(tapSound); RootNavigation.navigate('Player', { player: player.id }); }}
        style={({ pressed }) => ({ transform: [{ scale: pressed && interactive ? 0.95 : 1 }] })}
      >
        <View style={{
          borderWidth: first ? 5 : 4, borderColor: ring.ring, borderBottomColor: ring.lip, borderRadius: 999, padding: 2,
          backgroundColor: BRAND.white, shadowColor: BRAND.shadow, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
        }}>
          <View style={{ borderRadius: 999, overflow: 'hidden', backgroundColor: BRAND.sky }}>
            {/* His shark sits behind the avatar, so a player with no outfit yet still has a face. */}
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <GameIcon name="shark" size={avatarPx * 0.8} />
            </View>
            <Avatar player={player} size={first ? 'xl' : 'lg'} />
          </View>
        </View>
      </Pressable>
      <View style={{
        marginTop: 6, maxWidth: first ? 130 : 110, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10,
        backgroundColor: BRAND.navy, borderWidth: 2, borderColor: isMe ? BRAND.gold : BRAND.white,
      }}>
        <Text numberOfLines={1} style={{ fontFamily: 'Shark', fontSize: first ? 16 : 13, color: BRAND.white, textTransform: 'uppercase', textAlign: 'center' }}>
          {player.screen_name}
        </Text>
      </View>
      <View style={{
        marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 2,
        borderRadius: 12, backgroundColor: BRAND.cream, borderWidth: 2, borderColor: BRAND.goldLip,
      }}>
        <GameIcon name={scoreIcon} size={first ? 22 : 18} />
        <Text style={{ fontFamily: 'Shark', fontSize: first ? 22 : 18, color: BRAND.navy, fontVariant: ['tabular-nums'] }}>
          {shown.toLocaleString()}
        </Text>
      </View>
    </Animated.View>
  );
}
