/**
 * FxLab: the second studio engine bench (dev MiniGameTester). Shows the pass-3
 * engine systems through the real code paths:
 *
 *   - Ribbon trail + afterimages: Alex's shark swims (or follows your thumb)
 *     with a gold ink-outlined ribbon; DASH adds 4 afterimages every 30 ms.
 *   - Brush strokes: an ink ring and a route recap drawn on with progress.
 *   - FX governor: "Stack moments" fires a golden plus three pearls inside
 *     60 ms. The golden takes the stop and the (capped) flash; the pearls get
 *     local blooms. The log shows what the governor allowed.
 *   - Card flip pose: 3D rotateY with the face swapping at 90 deg, edge strip,
 *     side shade, specular band and landing squash. Taps resolve to the
 *     NEAREST card (walk-safe), and a bump between two cards is ignored.
 *   - Perf tiers: auto full / lite / min, or pinned from the chips.
 *   - Colour guard: purple/navy/near-black team colours remapped to bright.
 *   - Results card with a ghost rival near-miss line.
 *
 * `autoplay` runs a scripted tour (used for the demo video). Dev only.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, LogBox, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  Canvas,
  Group,
  Image as SkImage,
  LinearGradient,
  Rect,
  useImage,
  vec,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  runOnUI,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { FxStage, type FxStageHandle } from '../fx/FxStage';
import { useCamera } from '../fx/useCamera';
import { useGameClock } from '../useGameClock';
import { useFeel } from '../feel';
import { RibbonTrail, BrushStroke, useRibbonTrail } from '../fx/RibbonTrail';
import { trailPush, createAfterimages, afterimagePush, afterimageAlpha, quadPolyline, ringPolyline, type Afterimages } from '../core/trail';
import { createFxGovernor, govBeginStroke } from '../core/fxGovernor';
import { flipPose } from '../core/flip';
import { nearestTarget, MISS, AMBIGUOUS } from '../core/hitTest';
import { brightTeamColor } from '../core/color';
import { TIER_NAMES, TIER_SCALES, tierCount } from '../core/perfTier';
import { usePerfTier } from '../perf/usePerfTier';
import { PerfOverlay, usePerfProbe } from '../perf/PerfOverlay';
import { ResultsCard } from '../results/ResultsCard';
import { GameAudio } from '../audio/GameAudio';
import { registerStudioAudio } from '../audio/studioLibrary';
import { playHaptic } from '../Haptics';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';

registerStudioAudio(['current-quest', 'memory']);

const { width: SW, height: SH } = Dimensions.get('window');
const HEADER_H = 96;
const STAGE_H = Math.round(SH * 0.36);
const SHARK = 92;
const CARD_GAP = 14;
const CARD_W = Math.min(80, (SW - 32 - CARD_GAP * 3) / 4);
const CARD_H = Math.round(CARD_W * 1.32);
const ROW_W = CARD_W * 4 + CARD_GAP * 3;
const CARD_CX = [0, 1, 2, 3].map((i) => i * (CARD_W + CARD_GAP) + CARD_W / 2);
const CARD_CY = [CARD_H / 2, CARD_H / 2, CARD_H / 2, CARD_H / 2];
// True-hit radius is half the card width; walking forgiveness grows it.
const CARD_R = [CARD_W * 0.5, CARD_W * 0.5, CARD_W * 0.5, CARD_W * 0.5];
const TEAM_IN = ['#6a1b9a', '#0b3a66', '#ffcf3b', '#b0208f', '#111111', '#3db8ff'];

const CARD_BACK = require('../../assets/games/memory/card-back.png');
const CARD_FACES = [
  require('../../assets/games/memory/deck-ocean-shark.png'),
  require('../../assets/games/memory/deck-ocean-crab.png'),
  require('../../assets/games/memory/deck-park-coaster.png'),
  require('../../assets/games/memory/deck-park-ferriswheel.png'),
];

// Brush geometry (static): an ink ring around the gate and a route recap.
const RING_X: number[] = [];
const RING_Y: number[] = [];
ringPolyline(SW * 0.8, STAGE_H * 0.3, 34, 28, RING_X, RING_Y);
const RECAP_X: number[] = [];
const RECAP_Y: number[] = [];
quadPolyline(SW * 0.08, STAGE_H * 0.86, SW * 0.5, STAGE_H * 0.42, SW * 0.92, STAGE_H * 0.8, 24, RECAP_X, RECAP_Y);

function pick(...names: string[]): string {
  for (const n of names) if (GameAudio.hasCue(n)) return n;
  return names[names.length - 1];
}

export interface FxLabProps {
  visible: boolean;
  onClose: () => void;
  autoplay?: boolean;
}

export default function FxLab({ visible, onClose, autoplay = false }: FxLabProps) {
  const reducedMotion = useReducedGameMotion();
  const fx = useRef<FxStageHandle>(null);
  const perf = usePerfProbe(visible);
  const [tierPin, setTierPin] = useState(-1);
  const tier = usePerfTier({ active: visible });
  const [walking, setWalking] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [faceUp, setFaceUp] = useState([false, false, false, false]);
  const stroke = useRef(0);

  const clock = useGameClock({});
  const camera = useCamera({ width: SW, height: STAGE_H, timeScale: clock.fxScale, reducedMotion, walking });
  const governor = useMemo(() => createFxGovernor({ calm: reducedMotion }), [reducedMotion]);

  // -- Swim: trail + afterimages ------------------------------------------------
  const trail = useRibbonTrail({ cap: 32, lifeMs: 750, minDist: 4 });
  const ghosts = useSharedValue<Afterimages>(createAfterimages(4, 30, 170));
  const now = useSharedValue(0);
  const sx = useSharedValue(SW / 2);
  const sy = useSharedValue(STAGE_H / 2);
  const dragging = useSharedValue(false);
  const dashUntil = useSharedValue(0);
  const phase = useSharedValue(0);

  useFrameCallback((info) => {
    'worklet';
    const t = info.timestamp;
    const dt = info.timeSincePreviousFrame ?? 16;
    now.value = t;
    const dashing = t < dashUntil.value;
    if (!dragging.value) {
      phase.value += (dt / 1000) * (dashing ? 2.6 : 0.9);
      const u = phase.value;
      sx.value = SW / 2 + Math.sin(u) * SW * 0.36;
      sy.value = STAGE_H * 0.52 + Math.sin(u * 2) * STAGE_H * 0.24;
    }
    trailPush(trail.state.value, sx.value, sy.value, t);
    trail.version.value += 1;
    if (dashing) afterimagePush(ghosts.value, t, sx.value, sy.value, 0, 0);
  }, visible);

  const sharkX = useDerivedValue(() => sx.value - SHARK / 2);
  const sharkY = useDerivedValue(() => sy.value - SHARK / 2);
  const sharkImg = useImage(require('../../assets/games/whack/shark-pop-1.png'));

  const pan = useMemo(() => Gesture.Pan().minDistance(0)
    .onBegin((e) => {
      'worklet';
      dragging.value = true;
      sx.value = e.x;
      sy.value = e.y;
    })
    .onUpdate((e) => {
      'worklet';
      sx.value = e.x;
      sy.value = Math.max(20, Math.min(STAGE_H - 20, e.y));
    })
    .onFinalize(() => {
      'worklet';
      dragging.value = false;
    }), [dragging, sx, sy]);

  const recap = useSharedValue(0);
  const ringAlpha = useSharedValue(1);

  // -- Feel table through the governor --------------------------------------------
  const tierNow = tier.tierJs;
  const burstN = useCallback((n: number) => tierCount(tierNow, n), [tierNow]);
  const note = useCallback((line: string) => setLog((l) => [line, ...l].slice(0, 5)), []);
  // Proxies record what the governor let through.
  const clockProxy = useMemo(() => ({
    ...clock,
    hitStop: (ms: number, o?: Parameters<typeof clock.hitStop>[1]) => { note(`  stop ${Math.round(ms)} ms`); clock.hitStop(ms, o); },
  }), [clock, note]);
  const fxProxy = useMemo(() => ({
    get current() {
      const f = fx.current;
      if (!f) return null;
      return {
        ...f,
        flash: (o?: { color?: string; peak?: number; ms?: number }) => { note(`  flash ${Math.round((o?.peak ?? 0) * 100)}%`); f.flash(o); },
        bloom: (x: number, y: number, o?: { color?: string; radius?: number; peak?: number; ms?: number }) => { note('  flash denied, local bloom'); f.bloom(x, y, o); },
      };
    },
  }), [note]);
  const feel = useFeel({
    golden: {
      sfx: pick('cq_golden_pearl', 'fx.purchase'), haptic: 'golden', hitStop: 110, prio: 5,
      flash: { color: '#fff6d0', peak: 0.6 }, shake: 0.35, punch: 0.05,
      burst: [{ emitter: 'coins', count: burstN(14) }, { emitter: 'stars', count: burstN(10) }],
      ring: { color: '#ffcf3b', to: 110, ms: 320 }, flyUp: { size: 'lg', color: '#ffcf3b' },
    },
    pearl: {
      sfx: pick('cq_pearl', 'fx.coin'), ladder: true, haptic: 'tick', hitStop: 50, prio: 1,
      flash: { peak: 0.3 }, punch: 0.03, burst: [{ emitter: 'sparkles', count: burstN(8) }], flyUp: { size: 'sm' },
    },
    flip: { sfx: pick('mm_flip', 'fx.pop'), haptic: 'tap', burst: [{ emitter: 'glints', count: burstN(6) }] },
    dash: { sfx: pick('cq_riptide', 'cq_swim', 'fx.whoosh'), haptic: 'quickHit', kick: 3,
      burst: [{ emitter: 'splash', count: burstN(12) }] },
  }, { fx: fxProxy as unknown as React.RefObject<FxStageHandle>, camera, clock: clockProxy, width: SW, calm: reducedMotion || walking, governor });

  const stack = useCallback(() => {
    stroke.current += 1;
    govBeginStroke(governor, -1); // many moments, no per-stroke rule here
    const cx = SW / 2;
    const cy = HEADER_H + STAGE_H * 0.5;
    note('golden (prio 5)');
    feel('golden', { x: cx, y: cy, text: 'GOLDEN! +500', magnetTo: { x: SW - 40, y: HEADER_H - 20 } });
    [20, 40, 60].forEach((ms, k) => setTimeout(() => {
      note(`pearl ${k + 1} (prio 1)`);
      feel('pearl', { x: cx + (k - 1) * 70, y: cy + 40, step: k, text: `+${50 * (k + 1)}` });
    }, ms));
  }, [feel, governor, note]);

  const dash = useCallback(() => {
    dashUntil.value = now.value + 900;
    feel('dash', { x: sx.value, y: HEADER_H + sy.value, dx: 1, dy: 0 });
    note('dash: afterimages every 30 ms');
  }, [dashUntil, feel, note, now, sx, sy]);

  const drawRecap = useCallback(() => {
    recap.value = 0;
    recap.value = withTiming(1, { duration: 700 });
    ringAlpha.value = 0;
    ringAlpha.value = withTiming(1, { duration: 300 });
    GameAudio.play(pick('cq_ring_on', 'fx.reveal'));
  }, [recap, ringAlpha]);

  // -- Cards: nearest-target taps --------------------------------------------------
  const tapX = useSharedValue(-100);
  const tapY = useSharedValue(-100);
  const tapA = useSharedValue(0);

  const flipCard = useCallback((i: number) => {
    setFaceUp((f) => {
      const next = f.slice();
      next[i] = !f[i];
      return next;
    });
    const rowLeft = (SW - ROW_W) / 2;
    feel('flip', { x: rowLeft + CARD_CX[i], y: HEADER_H + STAGE_H + 60 + CARD_H / 2 });
  }, [feel]);

  const onCardTap = useCallback((idx: number) => {
    if (idx === AMBIGUOUS) {
      note('bump between two cards: ignored');
      return;
    }
    if (idx === MISS) return;
    flipCard(idx);
  }, [flipCard, note]);

  const forgiveness = walking ? 1.35 : 1;
  const tap = useMemo(() => Gesture.Tap().maxDistance(24).onEnd((e) => {
    'worklet';
    tapX.value = e.x;
    tapY.value = e.y;
    tapA.value = 1;
    tapA.value = withTiming(0, { duration: 500 });
    const i = nearestTarget(CARD_CX, CARD_CY, CARD_R, null, 4, e.x, e.y, { forgiveness });
    runOnJS(onCardTap)(i);
  }), [forgiveness, onCardTap, tapA, tapX, tapY]);
  const tapStyle = useAnimatedStyle(() => ({
    opacity: tapA.value,
    transform: [{ translateX: tapX.value - 14 }, { translateY: tapY.value - 14 }, { scale: 1.6 - tapA.value * 0.6 }],
  }));

  // Simulated taps for the tour: a clean tap on card 2, then a bump dead-centre between 3 and 4.
  const simTap = useCallback((x: number, y: number) => {
    tapX.value = x;
    tapY.value = y;
    tapA.value = 1;
    tapA.value = withTiming(0, { duration: 500 });
    onCardTap(nearestTarget(CARD_CX, CARD_CY, CARD_R, null, 4, x, y, { forgiveness }));
  }, [forgiveness, onCardTap, tapA, tapX, tapY]);

  // -- Tier chips -----------------------------------------------------------------
  const pinTier = useCallback((t: number) => {
    setTierPin(t);
    tier.force(t);
    note(t < 0 ? 'tier: auto' : `tier pinned: ${TIER_NAMES[t]}`);
  }, [note, tier]);

  useEffect(() => {
    if (!visible) return undefined;
    void GameAudio.init().then(() => GameAudio.preload([
      pick('cq_golden_pearl', 'fx.purchase'), pick('cq_pearl', 'fx.coin'), pick('mm_flip', 'fx.pop'), pick('cq_riptide', 'cq_swim', 'fx.whoosh'),
    ]));
    return undefined;
  }, [visible]);

  // -- Autoplay tour ----------------------------------------------------------------
  // The plan reads the latest callbacks through a ref, so toggling walking (which
  // changes the tap forgiveness) never restarts the tour.
  const act = useRef({ drawRecap, dash, stack, simTap, pinTier, note });
  act.current = { drawRecap, dash, stack, simTap, pinTier, note };
  useEffect(() => {
    if (!visible || !autoplay) return undefined;
    LogBox.ignoreAllLogs(true);
    const a = () => act.current;
    const plan: [number, () => void][] = [
      [1500, () => a().drawRecap()],
      [3000, () => a().dash()],
      [5000, () => a().stack()],
      [8000, () => a().simTap(CARD_CX[1], CARD_CY[1] + 6)],
      [9200, () => a().simTap(CARD_CX[0] - 4, CARD_CY[0] - 8)],
      [10600, () => { setWalking(true); a().note('walking: taps forgive 35%, camera x0.3'); }],
      [11800, () => a().simTap((CARD_CX[2] + CARD_CX[3]) / 2, CARD_CY[2])],
      [13200, () => a().simTap(CARD_CX[3] + CARD_W * 0.6, CARD_CY[3])],
      [14600, () => a().pinTier(1)],
      [15600, () => a().stack()],
      [18000, () => a().dash()],
      [20000, () => { a().pinTier(-1); setWalking(false); }],
      [21000, () => setShowResults(true)],
      [28500, () => setShowResults(false)],
    ];
    const timers = plan.map(([ms, fn]) => setTimeout(fn, ms));
    return () => timers.forEach(clearTimeout);
  }, [visible, autoplay]);

  const scale = TIER_SCALES[tier.tierJs];

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait']}>
      <GestureHandlerRootView style={styles.fill}>
        <View style={styles.header}>
          <Text style={styles.title}>FX LAB</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {`tier ${TIER_NAMES[tier.tierJs].toUpperCase()}${tierPin < 0 ? ' (auto)' : ''}  ·  denied ${governor.denied}  ·  ${walking ? 'walking' : 'standing'}`}
          </Text>
          <TouchableOpacity style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.closeText}>CLOSE</Text>
          </TouchableOpacity>
        </View>

        {/* Stage: one canvas inside the camera */}
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.stage, camera.style]}>
            <Canvas style={StyleSheet.absoluteFill}>
              <Rect x={0} y={0} width={SW} height={STAGE_H}>
                <LinearGradient start={vec(0, 0)} end={vec(0, STAGE_H)} colors={['#3db8ff', '#bfeaff']} />
              </Rect>
              <Rect x={0} y={STAGE_H * 0.72} width={SW} height={STAGE_H * 0.28}>
                <LinearGradient start={vec(0, STAGE_H * 0.72)} end={vec(0, STAGE_H)} colors={['#46c3d1', '#1c8fa6']} />
              </Rect>
              <BrushStroke xs={RECAP_X} ys={RECAP_Y} progress={recap} color="#ffffff" head={3} tail={9} taperIn={0.1} />
              <BrushStroke xs={RING_X} ys={RING_Y} opacity={ringAlpha} color="#ffcf3b" head={9} tail={3} taperIn={0.15} />
              <RibbonTrail trail={trail} now={now} color="#ffcf3b" head={Math.round(26 * scale.trails)} tail={8} />
              {[0, 1, 2, 3].map((i) => (
                <Ghost key={i} index={i} ghosts={ghosts} now={now} image={sharkImg} />
              ))}
              {sharkImg ? <SkImage image={sharkImg} x={sharkX} y={sharkY} width={SHARK} height={SHARK} fit="contain" /> : null}
            </Canvas>
          </Animated.View>
        </GestureDetector>

        {/* Cards: nearest-target taps */}
        <View style={styles.cardArea}>
          <GestureDetector gesture={tap}>
            <View style={styles.cardRow}>
              {[0, 1, 2, 3].map((i) => (
                <FlipCard key={i} index={i} now={now} face={CARD_FACES[i]} faceUp={faceUp[i]} />
              ))}
              <Animated.View pointerEvents="none" style={[styles.tapDot, tapStyle]} />
            </View>
          </GestureDetector>
          <Text style={styles.caption}>Tap near a card: the nearest one flips. A bump between two is ignored.</Text>
        </View>

        {/* Colour guard */}
        <View style={styles.teamRow}>
          <Text style={styles.teamLabel}>TEAM COLOURS</Text>
          {TEAM_IN.map((c) => (
            <View key={c} style={styles.teamPair}>
              <View style={[styles.swatch, { backgroundColor: c }]} />
              <View style={[styles.swatch, { backgroundColor: brightTeamColor(c) }]} />
            </View>
          ))}
        </View>

        {/* Governor log */}
        <View style={styles.log}>
          {log.map((l, i) => <Text key={`${i}-${l}`} style={[styles.logText, i === 0 && styles.logNew]}>{l}</Text>)}
        </View>

        <View style={styles.controls}>
          {([
            ['Stack moments', stack], ['Dash', dash], ['Brush', drawRecap],
            [walking ? 'Standing' : 'Walking', () => setWalking((w) => !w)],
            ['Tier auto', () => pinTier(-1)], ['Lite', () => pinTier(1)], ['Min', () => pinTier(2)],
            ['Results', () => setShowResults(true)],
          ] as [string, () => void][]).map(([label, fn]) => (
            <TouchableOpacity key={label} style={styles.chip} onPress={fn} accessibilityRole="button">
              <Text style={styles.chipText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <FxStage ref={fx} width={SW} height={SH} timeScale={clock.fxScale} reducedMotion={reducedMotion}
          capacity={Math.round(200 * scale.particles)} style={StyleSheet.absoluteFill} />
        <PerfOverlay probe={perf} style={styles.perf} extra={() => `tier ${TIER_NAMES[tier.tierJs]}  denied ${governor.denied}`} />

        {showResults ? (
          <TouchableOpacity activeOpacity={1} style={styles.resultsScrim} onPress={() => setShowResults(false)}>
            <View style={styles.resultsBox}>
              <ResultsCard score={2140} stars={2} thresholds={{ one: 1000, two: 2000, three: 3000 }} personalBest={2400}
                rival={{ name: 'Maya', score: 2080 }} maxCombo={14} stats={[{ label: 'PEARLS', value: '9' }]}
                reducedMotion={reducedMotion} onRevealed={() => playHaptic('win')} />
            </View>
          </TouchableOpacity>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

function Ghost({ index, ghosts, now, image }: {
  index: number;
  ghosts: SharedValue<Afterimages>;
  now: SharedValue<number>;
  image: ReturnType<typeof useImage>;
}) {
  const x = useDerivedValue(() => ghosts.value.x[index] - SHARK / 2);
  const y = useDerivedValue(() => ghosts.value.y[index] - SHARK / 2);
  const a = useDerivedValue(() => afterimageAlpha(ghosts.value, index, now.value, 0.5));
  if (!image) return null;
  return (
    <Group opacity={a}>
      <SkImage image={image} x={x} y={y} width={SHARK} height={SHARK} fit="contain" />
    </Group>
  );
}

function FlipCard({ index, now, face, faceUp }: {
  index: number;
  now: SharedValue<number>;
  face: number;
  faceUp: boolean;
}) {
  const startSv = useSharedValue(-1e9);
  const upSv = useSharedValue(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // Stamp the flip start on the UI thread, on the same clock the pose reads.
    runOnUI((u: number) => {
      'worklet';
      startSv.value = now.value;
      upSv.value = u;
    })(faceUp ? 1 : 0);
  }, [faceUp, now, startSv, upSv]);
  const card = useAnimatedStyle(() => {
    const p = flipPose(now.value - startSv.value, undefined, upSv.value === 0);
    return {
      transform: [{ perspective: 800 }, { rotateY: `${p.angle}deg` }, { scale: p.squash }],
    };
  });
  const backStyle = useAnimatedStyle(() => {
    const p = flipPose(now.value - startSv.value, undefined, upSv.value === 0);
    return { opacity: p.faceUp ? 0 : 1 };
  });
  const faceStyle = useAnimatedStyle(() => {
    const p = flipPose(now.value - startSv.value, undefined, upSv.value === 0);
    return { opacity: p.faceUp ? 1 : 0 };
  });
  const shade = useAnimatedStyle(() => {
    const p = flipPose(now.value - startSv.value, undefined, upSv.value === 0);
    return { opacity: p.shade };
  });
  const spec = useAnimatedStyle(() => {
    const p = flipPose(now.value - startSv.value, undefined, upSv.value === 0);
    return { opacity: p.specular * 0.55, transform: [{ translateX: (p.specularX - 0.5) * CARD_W * 1.4 }, { rotate: '18deg' }] };
  });
  const edge = useAnimatedStyle(() => {
    const p = flipPose(now.value - startSv.value, undefined, upSv.value === 0);
    return { opacity: p.edge };
  });
  const shadow = useAnimatedStyle(() => {
    const p = flipPose(now.value - startSv.value, undefined, upSv.value === 0);
    return { transform: [{ scaleX: p.shadowStretch }], opacity: 0.25 - (p.shadowStretch - 1) * 0.2 };
  });
  return (
    <View style={styles.cardSlot} accessible accessibilityLabel={`Card ${index + 1}${faceUp ? ', face up' : ''}`}>
      <Animated.View style={[styles.cardShadow, shadow]} />
      <Animated.View style={[styles.card, card]}>
        <Animated.View style={[StyleSheet.absoluteFill, backStyle]}>
          <Image source={CARD_BACK} style={styles.cardImg} contentFit="cover" />
        </Animated.View>
        {/* Face is mirrored so it reads correctly past 90 deg. */}
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scaleX: -1 }] }, faceStyle]}>
          <Image source={face} style={styles.cardImg} contentFit="cover" />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.cardShade, shade]} />
        <Animated.View pointerEvents="none" style={[styles.cardSpec, spec]} />
        <Animated.View pointerEvents="none" style={[styles.cardEdge, edge]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#e4f7ff' },
  header: { height: HEADER_H, paddingTop: 48, paddingHorizontal: 16, backgroundColor: '#0768b9', borderBottomWidth: 4,
    borderColor: '#ffffff', flexDirection: 'row', alignItems: 'center' },
  title: { fontFamily: 'Shark', fontSize: 24, color: '#ffffff', marginRight: 10 },
  sub: { fontFamily: 'Knockout', fontSize: 14, color: '#e4f7ff', flex: 1 },
  close: { backgroundColor: '#ffcf3b', borderRadius: 999, borderWidth: 3, borderColor: '#05346e', paddingHorizontal: 12, paddingVertical: 4 },
  closeText: { fontFamily: 'Shark', fontSize: 14, color: '#05346e' },
  stage: { height: STAGE_H, overflow: 'hidden' },
  cardArea: { alignItems: 'center', paddingTop: 22 },
  cardRow: { width: ROW_W, height: CARD_H + 16, flexDirection: 'row', justifyContent: 'space-between' },
  cardSlot: { width: CARD_W, height: CARD_H },
  card: { width: CARD_W, height: CARD_H, borderRadius: 12, borderWidth: 3, borderColor: '#05346e', overflow: 'hidden',
    backgroundColor: '#ffffff', backfaceVisibility: 'visible' },
  cardImg: { width: '100%', height: '100%' },
  cardShade: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0b3a66' },
  cardSpec: { position: 'absolute', top: -20, bottom: -20, left: CARD_W / 2 - 9, width: 18, backgroundColor: '#ffffff' },
  cardEdge: { ...StyleSheet.absoluteFillObject, borderLeftWidth: 4, borderRightWidth: 4, borderColor: '#ffe07a' },
  cardShadow: { position: 'absolute', bottom: -10, left: CARD_W * 0.1, width: CARD_W * 0.8, height: 10, borderRadius: 999,
    backgroundColor: '#0b3a66' },
  tapDot: { position: 'absolute', left: 0, top: 0, width: 28, height: 28, borderRadius: 14, borderWidth: 3, borderColor: '#ff8a00' },
  caption: { fontFamily: 'Knockout', fontSize: 13, color: '#0b3a66', marginTop: 6 },
  teamRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  teamLabel: { fontFamily: 'Knockout', fontSize: 12, color: '#0b3a66', marginRight: 8, letterSpacing: 1 },
  teamPair: { marginHorizontal: 4, alignItems: 'center' },
  swatch: { width: 22, height: 14, borderRadius: 4, borderWidth: 2, borderColor: '#05346e', marginVertical: 1 },
  log: { marginTop: 10, marginHorizontal: 16, padding: 8, minHeight: 92, borderRadius: 14, borderWidth: 3, borderColor: '#05346e',
    backgroundColor: '#ffffff' },
  logText: { fontFamily: 'Menlo', fontSize: 11, color: '#3d5f8c' },
  logNew: { color: '#05346e', fontWeight: '700' },
  controls: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 10, paddingHorizontal: 10 },
  chip: { backgroundColor: '#ffcf3b', borderRadius: 999, borderWidth: 3, borderColor: '#05346e', paddingHorizontal: 12,
    paddingVertical: 6, margin: 4 },
  chipText: { fontFamily: 'Shark', fontSize: 13, color: '#05346e' },
  perf: { top: HEADER_H + STAGE_H - 96, left: 8, right: 'auto' },
  resultsScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(191,234,255,0.72)', alignItems: 'center', justifyContent: 'center' },
  resultsBox: { width: '86%' },
});
