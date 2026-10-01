/**
 * Standings podium (WS8): his barrel podium art with the top three players on
 * it, and "open spots" for places nobody holds yet.
 *
 * Choreography (UI thread): 3rd rises, then 2nd, then 1st, each with a small
 * overshoot and settle. When 1st lands: a medium haptic, the reveal sound and a
 * gold confetti pop from his spot, all on the same frame. Reduced motion shows
 * the finished podium with no confetti.
 *
 * The barrel art is numbered 3 (left), 1 (centre), 2 (right), so the spots sit
 * in that order.
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useContext, useEffect, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, { Easing, runOnJS, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import { ParticleField, type ParticleHandle } from '../../gamekit/Particles';
import { PlayerType } from '../../models/player-type';
import { BRAND, type GameIconName } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import PodiumSpot, { type PodiumRank } from './PodiumSpot';

const BARREL = require('../../../assets/images/screens/leaderboard/barrel.png');
const revealSound = require('../../../assets/sounds/reveal.mp3');

export const PODIUM_HEIGHT = 540;
const BARREL_HEIGHT = 270;
/** Rise order and start delays: 3rd, then 2nd, then 1st. */
export const PODIUM_ORDER: readonly PodiumRank[] = [3, 2, 1];
export const PODIUM_DELAY_MS: Record<PodiumRank, number> = { 3: 0, 2: 170, 1: 420 };
const CONFETTI = [BRAND.gold, BRAND.goldLight, BRAND.white, BRAND.skyDeep, '#ff8a3d'];

type Props = {
  readonly podium: readonly [PlayerType | null, PlayerType | null, PlayerType | null];
  readonly scoreOf: (player: PlayerType) => number;
  readonly scoreIcon: GameIconName;
  readonly meId?: number;
  /** Changes when a new board loads, so the podium plays again. */
  readonly playKey: string;
  /** Pickers or filters drawn above the podium. */
  readonly header?: React.ReactNode;
  /** False on Near Me boards, where names never open a profile. */
  readonly interactive?: boolean;
};

export default function StandingsPodium({ podium, scoreOf, scoreIcon, meId, playKey, header, interactive = true }: Props) {
  const reduced = useUiReducedMotion();
  const { width } = useWindowDimensions();
  const { playSound } = useContext(SoundEffectContext);
  const particles = useRef<ParticleHandle>(null);
  const spotsTop = useRef(0);
  const third = useSharedValue(reduced ? 1 : 0);
  const second = useSharedValue(reduced ? 1 : 0);
  const firstP = useSharedValue(reduced ? 1 : 0);
  const [landed, setLanded] = useState<Record<PodiumRank, boolean>>({ 1: reduced, 2: reduced, 3: reduced });
  const progressFor = { 1: firstP, 2: second, 3: third } as const;

  // Where the confetti pops: the centre of the 1st place avatar, measured on layout.
  const firstSpot = useRef({ x: width / 2, y: 200 });

  const onLand = (rank: PodiumRank) => {
    setLanded(current => ({ ...current, [rank]: true }));
    if (rank === 1 && podium[0]) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      playSound(revealSound);
      particles.current?.burst({ x: firstSpot.current.x, y: firstSpot.current.y, preset: 'confetti', count: 30, colors: CONFETTI, speed: 1.1 });
    } else if (podium[rank - 1]) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }
  };

  useEffect(() => {
    if (reduced) {
      [third, second, firstP].forEach(value => { value.value = 1; });
      setLanded({ 1: true, 2: true, 3: true });
      return;
    }
    setLanded({ 1: false, 2: false, 3: false });
    PODIUM_ORDER.forEach(rank => {
      const value = progressFor[rank];
      value.value = 0;
      value.value = withDelay(PODIUM_DELAY_MS[rank], withSequence(
        // Rise past the mark, then settle onto the barrel.
        withTiming(1.08, { duration: rank === 1 ? 380 : 300, easing: Easing.out(Easing.cubic) }),
        withSpring(1, { damping: 10, stiffness: 240, mass: 0.7 }, finished => {
          if (finished) runOnJS(onLand)(rank);
        }),
      ));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey, reduced]);

  // Spots: 3 on the left barrel, 1 in the centre, 2 on the right, lifted to each barrel's height.
  const spot = (rank: PodiumRank, lift: number, flex: number) => (
    <View style={{ flex, alignItems: 'center', marginBottom: lift }}
      onLayout={rank === 1 ? event => {
        const { x, y, width: w } = event.nativeEvent.layout;
        firstSpot.current = { x: x + w / 2, y: spotsTop.current + y + 70 };
      } : undefined}>
      <PodiumSpot
        rank={rank}
        player={podium[rank - 1]}
        score={podium[rank - 1] ? scoreOf(podium[rank - 1] as PlayerType) : 0}
        scoreIcon={scoreIcon}
        progress={progressFor[rank]}
        landed={landed[rank]}
        reduced={reduced}
        isMe={!!meId && podium[rank - 1]?.id === meId}
        interactive={interactive}
      />
    </View>
  );

  return (
    <View style={{ height: PODIUM_HEIGHT }}>
      {header}
      <Image style={{ width, height: BARREL_HEIGHT, position: 'absolute', bottom: 0 }} contentFit="cover" source={BARREL} />
      <View pointerEvents="box-none" onLayout={event => { spotsTop.current = event.nativeEvent.layout.y; }} style={{
        position: 'absolute', left: 0, right: 0, bottom: BARREL_HEIGHT - 50, flexDirection: 'row',
        alignItems: 'flex-end', paddingHorizontal: 8,
      }}>
        {spot(3, 0, 1)}
        {spot(1, 50, 1.2)}
        {spot(2, 20, 1)}
      </View>
      {!reduced && (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height: PODIUM_HEIGHT }}>
          <ParticleField ref={particles} width={width} height={PODIUM_HEIGHT} pointerEvents="none" />
        </Animated.View>
      )}
    </View>
  );
}
