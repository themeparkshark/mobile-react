/**
 * Signal Repair: a one-thumb circuit puzzle for the queue.
 *
 * Big tiles, one tap turns a tile a quarter clockwise, and a stray bump costs
 * at most three extra taps, so it plays fine while shuffling forward in line.
 * Boards are procedural (see services/lineplay/navigationPanel.ts), 3x3 for a
 * first repair and 4x4 for replays, and dressed per ride theme.
 *
 * Motion: each tile springs through its quarter turn with a little overshoot,
 * the signal then flows tile by tile in the order it reaches them, relay stars
 * pop as they light, and a solved board bursts with particles. Reduced motion
 * gets the same states instantly. Haptic and sound land on the same frame as
 * the visual they belong to.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence,
  withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import useReducedGameMotion from '../../../hooks/useReducedGameMotion';
import HapticPatterns from '../../../helpers/hapticPatterns';
import { playSfx } from '../../../gamekit/SFX';
import { ParticleField, type ParticleHandle } from '../../../gamekit/Particles';
import { BRAND, GameButton, GameIcon } from '../../../ui';
import { createNavigationPanel, createNavigationPanelProgress, navigationPanelStars, nextNavigationRepair,
  traceNavigationPanel, type NavigationPanelProgress } from '../../../services/lineplay/navigationPanel';
import { circuitThemeFor, type CircuitTheme } from '../../../services/lineplay/circuitTheme';

interface Props {
  readonly seed: number;
  readonly progress?: NavigationPanelProgress;
  readonly completed: boolean;
  readonly paused: boolean;
  readonly onTurn: (index: number) => void;
  readonly onNewRound: () => void;
  readonly onNext: () => void;
  /** 'mission' is the chapter's first story mission; 'free' is a free-play round. */
  readonly mode?: 'mission' | 'free';
  readonly theme?: CircuitTheme;
  /** Label for the next action in free play, e.g. the next page's name. */
  readonly nextLabel?: string;
}

const SPACE_SHARK = require('../../../../assets/images/screens/lineplay/space-navigation-shark-v2.png');
const TEACHER_SHARK = require('../../../../assets/images/tutorial/teacher-shark.png');
const PORTS = [[1, 50, 0, 'north'], [2, 100, 50, 'east'],
  [4, 50, 100, 'south'], [8, 0, 50, 'west']] as const;
const FLOW_STEP_MS = 55;

function pipePath(mask: number): string {
  const ports = PORTS.filter(([bit]) => mask & bit);
  if (ports.length < 2) return 'M 50 50 L 50 50';
  return `M ${ports[0][1]} ${ports[0][2]} L 50 50 L ${ports[1][1]} ${ports[1][2]}`;
}

/** One tile's art: the base pipe rotates as a whole, so a tap reads as a real turn. */
function TileArt({ mask, turns, lit, depth, relay, flow, reducedMotion }: {
  mask: number; turns: number; lit: boolean; depth: number; relay: boolean; flow: string; reducedMotion: boolean;
}) {
  const angle = useSharedValue(turns * 90);
  const glow = useSharedValue(lit ? 1 : 0);
  const pop = useSharedValue(1);
  const lastTurns = useRef(turns);
  const total = useRef(turns * 90);

  useEffect(() => {
    // Always spin forward: 3 -> 0 is one more clockwise quarter, never a rewind.
    const step = ((turns - lastTurns.current) % 4 + 4) % 4;
    lastTurns.current = turns;
    if (step === 0) return;
    total.current += step * 90;
    cancelAnimation(angle);
    angle.value = reducedMotion ? total.current
      : withSpring(total.current, { damping: 11, stiffness: 320, mass: 0.6 });
  }, [turns, reducedMotion, angle]);

  useEffect(() => {
    cancelAnimation(glow);
    if (reducedMotion) { glow.value = lit ? 1 : 0; return; }
    glow.value = lit
      ? withDelay(depth * FLOW_STEP_MS, withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) }))
      : withTiming(0, { duration: 120 });
    if (lit && relay) {
      pop.value = withDelay(depth * FLOW_STEP_MS, withSequence(
        withTiming(1.35, { duration: 110 }), withSpring(1, { damping: 9, stiffness: 260 })));
    }
  }, [lit, depth, relay, reducedMotion, glow, pop]);

  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const path = pipePath(mask);

  return <View style={StyleSheet.absoluteFill} pointerEvents="none">
    <Animated.View style={[StyleSheet.absoluteFill, glowStyle, { backgroundColor: 'transparent' }]} />
    <Animated.View style={[StyleSheet.absoluteFill, spin]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" accessible={false}>
        <Path d={path} stroke={BRAND.navy} strokeWidth={26} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <Path d={path} stroke={BRAND.sky} strokeWidth={15} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, glowStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100" accessible={false}>
          <Path d={path} stroke={flow} strokeWidth={15} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <Path d={path} stroke={BRAND.white} strokeWidth={4} strokeOpacity={0.85} fill="none"
            strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Animated.View>
    </Animated.View>
    {relay ? <Animated.View style={[styles.relayBadge, popStyle]}>
      <GameIcon name="star" size={30} mono={lit ? undefined : '#9db7cf'} />
    </Animated.View> : <View style={[styles.hub, lit && { backgroundColor: flow }]} />}
  </View>;
}

/** A short original fiction puzzle; the server's verified wait still owns every reward. */
export default function NavigationPanelCard({ seed, progress: saved, completed, paused, onTurn, onNewRound, onNext,
  mode = 'mission', theme, nextLabel }: Props) {
  const look = theme ?? circuitThemeFor(undefined, true);
  const progress = useMemo(() => saved ?? createNavigationPanelProgress(seed, 0, completed), [seed, saved, completed]);
  const panel = useMemo(() => createNavigationPanel(seed, progress.round), [seed, progress.round]);
  const trace = useMemo(() => traceNavigationPanel(panel, progress.rotations), [panel, progress.rotations]);
  const stars = trace.solved ? navigationPanelStars(seed, progress) : 0;
  const [showHint, setShowHint] = useState(false);
  const [artFailed, setArtFailed] = useState(false);
  const [boardWidth, setBoardWidth] = useState(0);
  const reducedMotion = useReducedGameMotion();
  const reveal = useSharedValue(trace.solved ? 1 : 0);
  const shake = useSharedValue(0);
  const particles = useRef<ParticleHandle>(null);
  const scroll = useRef<ScrollView>(null);
  const scrollToPayoff = useRef(false);
  const previousSolved = useRef(trace.solved);
  const previousSignals = useRef(trace.signals);
  const previousRound = useRef(progress.round);
  const hint = showHint ? nextNavigationRepair(panel, progress) : null;
  const locked = paused || trace.solved;
  const space = look.id === 'space';

  useEffect(() => {
    if (previousRound.current !== progress.round) {
      previousRound.current = progress.round;
      previousSignals.current = 0;
      setShowHint(false);
    }
    if (!trace.solved) scrollToPayoff.current = false;
    if (trace.signals > previousSignals.current && !trace.solved) {
      // A new relay lit: a small tick lands with the star pop.
      HapticPatterns.selection(); playSfx('star', 0.5);
    }
    previousSignals.current = trace.signals;
    if (trace.solved && !previousSolved.current) {
      scrollToPayoff.current = true;
      HapticPatterns.success(); playSfx('win');
      if (!reducedMotion && boardWidth > 0) {
        particles.current?.burst({ x: boardWidth / 2, y: boardWidth / 2, preset: 'burst', count: 36,
          colors: [look.flow, BRAND.gold, BRAND.white] });
        particles.current?.burst({ x: boardWidth / 2, y: boardWidth / 3, preset: 'confetti', count: 24 });
      }
      void AccessibilityInfo.announceForAccessibility(
        `${look.solvedTitle} All three ${look.relayNoun} connected. ${stars} of 3 stars.`);
    }
    previousSolved.current = trace.solved;
  }, [progress.round, trace.solved, trace.signals]);

  useEffect(() => {
    cancelAnimation(reveal);
    if (!trace.solved) reveal.value = 0;
    else if (reducedMotion) reveal.value = 1;
    else reveal.value = withDelay(panel.route.length * FLOW_STEP_MS,
      withSpring(1, { damping: 13, stiffness: 190 }));
    return () => cancelAnimation(reveal);
  }, [trace.solved, reducedMotion, reveal, panel.route.length]);

  const revealStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateY: (1 - reveal.value) * 18 }, { scale: 0.94 + reveal.value * 0.06 }],
  }));
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const turn = (index: number) => {
    if (locked) {
      if (paused && !reducedMotion) {
        // A tap on a paused board says so with a tiny nudge instead of doing nothing.
        shake.value = withSequence(withTiming(-5, { duration: 45 }), withTiming(5, { duration: 70 }),
          withTiming(0, { duration: 45 }));
      }
      return;
    }
    onTurn(index); HapticPatterns.selection(); playSfx('tick', 0.45);
  };

  const size = panel.size;
  const kicker = mode === 'mission'
    ? `${look.place} · MISSION 1 OF 3`
    : `${look.place} · SIGNAL REPAIR`;
  const status = paused ? 'Paused. Your circuit is saved right where you left it.'
    : trace.solved ? `3 / 3 ${look.relayNoun} linked · exit online`
      : hint != null ? 'Turn the gold-edged tile to reconnect the route.'
        : trace.signals === 3 ? `All ${look.relayNoun} linked! Now reach the exit.`
          : `${trace.signals} / 3 ${look.relayNoun} linked · follow the glow`;

  return <ScrollView ref={scroll} style={styles.scroll} contentContainerStyle={styles.card}
    onContentSizeChange={() => {
      if (!scrollToPayoff.current || !scroll.current) return;
      scrollToPayoff.current = false;
      scroll.current.scrollToEnd({ animated: !reducedMotion });
    }}>
    <LinearGradient colors={[BRAND.blueBright, BRAND.blue]} style={styles.hero}>
      <View style={styles.heroCopy}>
        <Text style={styles.kicker}>{kicker}</Text>
        <Text style={styles.title}>{trace.solved ? look.solvedTitle : look.repairTitle}</Text>
        <View style={styles.relayRow} accessible
          accessibilityLabel={`${trace.signals} of 3 ${look.relayNoun} connected`}>
          {[0, 1, 2].map(slot => <GameIcon key={slot} name="star" size={22}
            mono={slot < trace.signals ? undefined : '#8fb9e0'} />)}
          <Text style={styles.heroHint}>{panel.name} · {size}x{size}</Text>
        </View>
      </View>
      <Image source={space && !artFailed ? SPACE_SHARK : TEACHER_SHARK}
        onError={() => setArtFailed(true)} style={styles.shark} contentFit="contain"
        accessibilityLabel="Your shark points toward the circuit puzzle" />
    </LinearGradient>

    <View style={styles.brief}>
      <Pressable style={[styles.hintButton, showHint && styles.hintButtonOn]} disabled={locked}
        onPress={() => setShowHint(value => !value)} accessibilityRole="button"
        accessibilityLabel={showHint ? 'Hide the circuit clue' : 'Show a clue for this circuit'}
        accessibilityState={{ disabled: locked, expanded: showHint }} hitSlop={6}>
        <GameIcon name="search" size={26} />
      </Pressable>
      <Text style={styles.instruction}>Tap a tile to turn it. Link all three {look.relayNoun} to the exit.</Text>
    </View>

    <Animated.View style={[styles.panel, shakeStyle]}>
      <View style={styles.boardFrame} onLayout={event => setBoardWidth(event.nativeEvent.layout.width)}>
        <View style={[styles.port, styles.portIn, { top: `${(Math.floor(panel.entry / size) + 0.5) * (100 / size)}%` }]}
          accessible={false} />
        <View style={[styles.port, styles.portOut, trace.reachesExit && { backgroundColor: look.flow },
          { top: `${(Math.floor(panel.exit / size) + 0.5) * (100 / size)}%` }]} accessible={false} />
        {Array.from({ length: size }, (_, row) => <View key={row} style={styles.row}>
          {Array.from({ length: size }, (_, column) => {
            const index = row * size + column;
            const active = trace.connected.includes(index), relay = panel.relays.includes(index);
            const ports = PORTS.filter(([bit]) => trace.masks[index] & bit);
            return <Pressable key={index} onPress={() => turn(index)} disabled={locked}
              accessibilityRole="button" accessibilityState={{ disabled: locked }}
              accessibilityLabel={`Circuit tile row ${row + 1}, column ${column + 1}. ${ports.map(port => port[3]).join(' to ')}. ${active ? 'Glowing signal' : 'No signal'}${relay ? `, ${look.relayNoun.replace(/s$/, '')} relay` : ''}. Tap to rotate clockwise.`}
              style={({ pressed }) => [styles.tile, active && { backgroundColor: look.litTile, borderColor: look.flow },
                hint === index && styles.tileHint, pressed && !reducedMotion && styles.pressed]}>
              <TileArt mask={panel.masks[index]} turns={progress.rotations[index] ?? 0} lit={active}
                depth={trace.depth[index] ?? 0} relay={relay} flow={look.flow} reducedMotion={reducedMotion} />
              {hint === index && <View style={styles.hintBadge}><GameIcon name="retry" size={16} /></View>}
            </Pressable>;
          })}
        </View>)}
        <ParticleField ref={particles} width={boardWidth} height={boardWidth} style={styles.particles} />
      </View>
      <Text style={styles.panelStatus} accessibilityLiveRegion="polite">{status}</Text>
    </Animated.View>

    {trace.solved ? <Animated.View style={[styles.success, revealStyle]}>
      <View style={styles.starsRow} accessible accessibilityLabel={`${stars} of 3 stars`}>
        {[1, 2, 3].map(slot => <GameIcon key={slot} name="star" size={slot === 2 ? 44 : 36}
          mono={slot <= stars ? undefined : '#cfd9e4'} />)}
      </View>
      <Text style={styles.successTitle}>{mode === 'mission' ? 'First signal found!' : 'Circuit repaired!'}</Text>
      <Text style={styles.successCopy}>{stars === 3 ? 'Perfect repair: not a single wasted turn.'
        : stars === 2 ? 'Clean work. A few extra turns, still a great repair.'
          : 'Repaired! Try another circuit for a cleaner run.'}</Text>
      <GameButton label={mode === 'mission' ? 'FIND THE NEXT SIGNAL' : (nextLabel ?? 'NEXT ROUND').toUpperCase()}
        icon="arrow" onPress={onNext} disabled={paused} fullWidth
        accessibilityLabel={mode === 'mission' ? 'Next mission: Find the missing signal' : `Next: ${nextLabel ?? 'next round'}`} />
      <GameButton label="Try another circuit" variant="ghost" onPress={onNewRound} disabled={paused}
        accessibilityLabel="Play another navigation circuit" />
    </Animated.View> : null}
    <Text style={styles.footer}>Play solo or pass the phone. Keep walking with the line; your circuit stays saved.</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  card: { padding: 12, borderRadius: 22, borderWidth: 3, borderColor: BRAND.white, backgroundColor: BRAND.cream },
  hero: { minHeight: 92, borderRadius: 16, flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
    paddingLeft: 14, borderWidth: 3, borderColor: BRAND.navy },
  heroCopy: { flex: 1, zIndex: 1, paddingVertical: 9 },
  kicker: { fontFamily: 'Knockout', fontSize: 12, color: BRAND.goldLight, letterSpacing: 0.8 },
  title: { fontFamily: 'Shark', fontSize: 23, lineHeight: 27, color: BRAND.white, marginTop: 3,
    textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  relayRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6 },
  heroHint: { fontFamily: 'Knockout', fontSize: 12, color: '#d9f0ff', marginLeft: 6 },
  shark: { width: 84, height: 92, marginRight: -6, alignSelf: 'flex-end' },
  brief: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 10 },
  hintButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: BRAND.gold, alignItems: 'center',
    justifyContent: 'center', borderWidth: 3, borderColor: BRAND.navy, borderBottomWidth: 5 },
  hintButtonOn: { backgroundColor: BRAND.goldLight, borderBottomWidth: 3 },
  instruction: { flex: 1, fontFamily: 'Knockout', fontSize: 16, lineHeight: 20, color: BRAND.navy },
  panel: { backgroundColor: BRAND.blueBright, borderRadius: 20, borderWidth: 3, borderColor: BRAND.navy,
    paddingVertical: 12, paddingHorizontal: 22 },
  boardFrame: { gap: 6, width: '100%', maxWidth: 300, alignSelf: 'center' },
  row: { flexDirection: 'row', gap: 6 },
  tile: { flex: 1, aspectRatio: 1, borderRadius: 14, overflow: 'hidden', borderWidth: 3, borderColor: BRAND.navy,
    backgroundColor: BRAND.white },
  tileHint: { borderColor: BRAND.gold, borderWidth: 4 },
  pressed: { transform: [{ scale: 0.94 }] },
  hub: { position: 'absolute', left: '50%', top: '50%', width: 14, height: 14, marginLeft: -7, marginTop: -7,
    borderRadius: 7, backgroundColor: BRAND.white, borderWidth: 3, borderColor: BRAND.navy },
  relayBadge: { position: 'absolute', left: '50%', top: '50%', marginLeft: -15, marginTop: -15 },
  port: { position: 'absolute', width: 16, height: 26, marginTop: -13, borderRadius: 6, borderWidth: 3,
    borderColor: BRAND.navy, backgroundColor: BRAND.gold },
  portIn: { left: -19 },
  portOut: { right: -19, backgroundColor: BRAND.sky },
  hintBadge: { position: 'absolute', right: 2, bottom: 2, width: 22, height: 22, borderRadius: 11,
    backgroundColor: BRAND.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: BRAND.navy },
  particles: { position: 'absolute', left: 0, top: 0 },
  panelStatus: { fontFamily: 'Knockout', color: BRAND.white, fontSize: 15, lineHeight: 19, marginTop: 11,
    textAlign: 'center' },
  success: { marginTop: 12, padding: 12, borderWidth: 3, borderColor: BRAND.gold, borderRadius: 18,
    backgroundColor: BRAND.white, alignItems: 'center', gap: 4 },
  starsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginBottom: 2 },
  successTitle: { fontFamily: 'Shark', fontSize: 22, color: BRAND.navy, textAlign: 'center' },
  successCopy: { fontFamily: 'Knockout', fontSize: 15, lineHeight: 19, color: BRAND.navySoft, marginBottom: 6,
    textAlign: 'center' },
  footer: { fontFamily: 'Knockout', fontSize: 13, lineHeight: 17, color: BRAND.navySoft, textAlign: 'center',
    marginTop: 8 },
});
