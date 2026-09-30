/**
 * Crew roles payoff: every shark acts out what its player did, then the crew
 * opens the treasure together. "One finds the clue, one spots the signal, one
 * cracks the code, the captain picks the way, everyone finds the treasure."
 *
 * Art is only Dustin's existing drawings (the classic shark and the kit
 * icons); nothing is redrawn. Each beat hops in with anticipation and
 * overshoot, its prop pops up on the same frame as a haptic tick, and the
 * chest bursts open last. Reduced motion shows the finished scene at once.
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring,
  withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import useReducedGameMotion from '../../../hooks/useReducedGameMotion';
import { playSfx } from '../../../gamekit/SFX';
import { ParticleField, type ParticleHandle } from '../../../gamekit/Particles';
import { BRAND, GameIcon, type GameIconName } from '../../../ui';
import { crewStoryBeats, type CrewStoryBeat } from '../../../services/lineplay/crewStory';
import type { CrewRelayProgress } from '../../../services/lineplay/crewRelay';

const BEAT_MS = 520;
const SHARK = 64;
const PROP: Record<CrewStoryBeat['role'], GameIconName> = {
  navigator: 'map', lookout: 'search', decoder: 'lock', captain: 'crown',
};
/**
 * Where each prop sits on the classic shark (it faces left): the crown is worn
 * on the head, the map and lock are held in the front fin, the spyglass is up
 * at the eye. Fractions of the shark box; mirrored when a shark is flipped.
 */
const ANCHOR: Record<CrewStoryBeat['role'], { x: number; y: number; size: number; tilt: number }> = {
  captain: { x: 0.38, y: -0.1, size: 30, tilt: -8 },
  navigator: { x: 0.0, y: 0.5, size: 30, tilt: -14 },
  lookout: { x: -0.06, y: 0.14, size: 30, tilt: 18 },
  decoder: { x: 0.04, y: 0.52, size: 28, tilt: 10 },
};
/** Each player strikes a different pose: alternate facing and a small lean. */
const POSE = [{ flip: false, lean: -6 }, { flip: true, lean: 5 }, { flip: false, lean: 8 }, { flip: true, lean: -4 }];

function Beat({ beat, index, play, reducedMotion }: { beat: CrewStoryBeat; index: number; play: number; reducedMotion: boolean }) {
  const hop = useSharedValue(reducedMotion ? 1 : 0);
  const prop = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (!play) return;
    cancelAnimation(hop); cancelAnimation(prop);
    if (reducedMotion) { hop.value = 1; prop.value = 1; return; }
    hop.value = 0; prop.value = 0;
    const at = index * BEAT_MS;
    // Anticipation: a small crouch before the hop, then overshoot and settle.
    hop.value = withDelay(at, withSequence(withTiming(-0.12, { duration: 90 }),
      withSpring(1, { damping: 9, stiffness: 210, mass: 0.7 })));
    prop.value = withDelay(at + 200, withSequence(withTiming(1.3, { duration: 130 }),
      withSpring(1, { damping: 8, stiffness: 260 })));
  }, [play, reducedMotion, index, hop, prop]);
  const sharkStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, hop.value * 1.5)),
    transform: [{ translateY: (1 - hop.value) * 36 }, { scaleY: hop.value < 0 ? 1 + hop.value : 1 }],
  }));
  const propStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, prop.value), transform: [{ scale: prop.value }] }));
  const pose = POSE[index % POSE.length];
  const anchor = ANCHOR[beat.role];
  const x = pose.flip ? 1 - anchor.x - anchor.size / SHARK : anchor.x;
  return <View style={styles.beat} accessible accessibilityLabel={`${beat.who}: ${beat.action}`}>
    <Animated.View style={[styles.figure, sharkStyle]}>
      <View style={{ transform: [{ scaleX: pose.flip ? -1 : 1 }, { rotate: `${pose.lean}deg` }] }}>
        <GameIcon name="shark" size={SHARK} />
      </View>
      <Animated.View style={[styles.prop, { left: x * SHARK, top: anchor.y * SHARK }, propStyle]}>
        <View style={{ transform: [{ rotate: `${pose.flip ? -anchor.tilt : anchor.tilt}deg` }] }}>
          <GameIcon name={PROP[beat.role]} size={anchor.size} />
        </View>
      </Animated.View>
    </Animated.View>
    <Text style={styles.who} numberOfLines={1}>{beat.who}</Text>
    <Text style={styles.action} numberOfLines={2}>{beat.action}</Text>
  </View>;
}

export default function CrewStoryPayoff({ progress, routeNames }: {
  progress: CrewRelayProgress; routeNames: readonly [string, string];
}) {
  const reducedMotion = useReducedGameMotion();
  const beats = crewStoryBeats(progress, routeNames);
  const [play, setPlay] = useState(0);
  const [open, setOpen] = useState(reducedMotion);
  const chest = useSharedValue(1);
  const particles = useRef<ParticleHandle>(null);
  const [width, setWidth] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (progress.step !== 'complete') return;
    setPlay(value => value + 1);
    timers.current.forEach(clearTimeout);
    timers.current = [];
    void AccessibilityInfo.announceForAccessibility(
      `${beats.map(beat => `${beat.who} ${beat.action}`).join('. ')}. Everyone found the treasure.`);
    if (reducedMotion) { setOpen(true); return; }
    setOpen(false);
    beats.forEach((_, index) => timers.current.push(setTimeout(() => {
      void Haptics.selectionAsync(); playSfx('tap', 0.5);
    }, index * BEAT_MS + 200)));
    timers.current.push(setTimeout(() => {
      setOpen(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      playSfx('win');
      chest.value = withSequence(withTiming(1.35, { duration: 120 }), withSpring(1, { damping: 7, stiffness: 220 }));
      if (width > 0) {
        particles.current?.burst({ x: width / 2, y: 60, preset: 'burst', count: 40,
          colors: [BRAND.gold, BRAND.white, BRAND.goldLight] });
        particles.current?.burst({ x: width / 2, y: 40, preset: 'coins', count: 14 });
      }
    }, beats.length * BEAT_MS + 260));
    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
    // Replays only when the relay completes; the finished beats are stable after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress.step, progress.route, reducedMotion]);

  const chestStyle = useAnimatedStyle(() => ({ transform: [{ scale: chest.value }] }));
  if (progress.step !== 'complete') return null;
  return <View style={styles.wrap} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <Text style={styles.kicker}>YOUR CREW STORY</Text>
    <View style={styles.row}>
      {beats.map((beat, index) => <Beat key={beat.role} beat={beat} index={index} play={play}
        reducedMotion={reducedMotion} />)}
    </View>
    <View style={styles.finale}>
      <Animated.View style={chestStyle}>
        <GameIcon name={open ? 'chestOpen' : 'chest'} size={78}
          accessibilityLabel={open ? 'The treasure chest is open' : 'A closed treasure chest'} />
      </Animated.View>
      <Text style={styles.finaleText}>{open ? 'Everyone found the treasure!' : 'Opening the treasure...'}</Text>
    </View>
    <ParticleField ref={particles} width={width} height={220} style={styles.particles} />
  </View>;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, marginBottom: 12, padding: 12, borderRadius: 20, borderWidth: 3, borderColor: BRAND.navy,
    backgroundColor: BRAND.cream, overflow: 'hidden' },
  kicker: { fontFamily: 'Knockout', fontSize: 13, letterSpacing: 0.8, color: BRAND.blue, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  beat: { flex: 1, alignItems: 'center' },
  figure: { width: SHARK, height: SHARK, marginTop: 10 },
  prop: { position: 'absolute', zIndex: 1 },
  who: { fontFamily: 'Shark', fontSize: 13, color: BRAND.navy, marginTop: 2 },
  action: { fontFamily: 'Knockout', fontSize: 13, lineHeight: 15, color: BRAND.navySoft, textAlign: 'center',
    paddingHorizontal: 2 },
  finale: { alignItems: 'center', marginTop: 10 },
  finaleText: { fontFamily: 'Shark', fontSize: 18, color: BRAND.navy, marginTop: 2 },
  particles: { position: 'absolute', left: 0, top: 0 },
});
