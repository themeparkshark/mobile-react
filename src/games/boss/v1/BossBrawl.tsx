/**
 * A short pausable raid round. Each boss has one read that opens its weak spot
 * (encounter.ts): the Kraken's telegraphed tentacle, Robo-Shark's flashed and
 * shuffled circuit, Ghost Squid's 300ms eye flash. Damage uses the raid's own
 * server weights and the round's hit cap, so the number on screen is the
 * number the server applies.
 */
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import type { BossId, RaidDamageWeights } from '../../../api/endpoints/parks/raid';
import { BOSS_ART } from '../../../components/boss/bossArt';
import useReducedGameMotion from '../../../hooks/useReducedGameMotion';
import { BRAND } from '../../../ui/tokens';
import {
  BRAWL_DAMAGE, BRAWL_MS as ROUND_MS, GHOST_TELL_MS, HIT_GAP_MS, KRAKEN_TELL_MS, ROBO_SHUFFLE_MS,
  brawlDamage, brawlStars, consumeOpening, createEncounter, encounterAction, encounterExposed, encounterHint,
  encounterLocked, ghostPhase, krakenTell, registerStrike, roboBoard, weakAvailable, type GhostPhase,
} from './encounter';
import {
  GameShellV2, ParticleField, useFlash, useShake, haptic, playSfx,
  type GameResult, type GameShellV2Handle, type ParticleHandle,
} from '../../../gamekit';

export { BOSS_ART };

const BOSS_SIZE = 210;
const WEAK_SPOTS = { kraken: [0, -0.18], robo_shark: [0, 0.1], ghost_squid: [0, 0] } as const;
const OBJECTIVES: Record<BossId, string> = {
  kraken: 'A tentacle rises over one buoy. Tap that buoy to lure it, then strike the glowing center.',
  robo_shark: 'Watch the lights flash in order. They shuffle, so keep your eye on them. Then tap them in the same order.',
  ghost_squid: 'Its eyes flash just before it turns solid. Strike then. Tapping too early spooks it.',
};
const NODE_NAMES = ['POWER', 'RELAY', 'CORE'] as const;
const NODE_GAP = 9;

interface BoardView {
  tellKey: number; tellSide: -1 | 1 | 0; phase: string; flashing: number; shown: number;
  positions: readonly number[]; ghost: GhostPhase; locked: boolean; step: number;
}
const sameView = (a: BoardView, b: BoardView) => a.tellKey === b.tellKey && a.tellSide === b.tellSide && a.phase === b.phase &&
  a.flashing === b.flashing && a.shown === b.shown && a.ghost === b.ghost && a.locked === b.locked && a.step === b.step &&
  a.positions.join() === b.positions.join();

/** Boss center offset from the arena center at `ms` into the round (shared by UI and hit tests). */
function bossOffset(ms: number, w: number, h: number, boss: BossId, reduced: boolean, side: number, exposedUntil: number) {
  'worklet';
  if (reduced) return { x: 0, y: 0 };
  if (boss === 'robo_shark') return { x: 0, y: Math.sin(ms / 650) * Math.min(6, h * 0.02) };
  if (boss === 'ghost_squid') return { x: Math.sin(Math.floor(ms / 2400) * 1.8) * w * 0.14, y: 0 };
  const lure = Math.max(0, Math.min(1, (ms - (exposedUntil - 1800)) / 180, (exposedUntil - ms) / 180));
  return { x: Math.sin(ms / 1100) * w * 0.12 * (1 - lure) + side * w * 0.16 * lure,
    y: Math.sin(ms / 650) * Math.min(5, h * 0.02) };
}

export function BossBrawl({ visible, boss, bossName, hpLeft, hpMax, damageRate = 1, damage: weights = BRAWL_DAMAGE, maxHits,
  onComplete, onClose, onQuit }: {
  readonly visible: boolean;
  readonly boss: BossId;
  readonly bossName: string;
  readonly hpLeft: number;
  readonly hpMax: number;
  /** Fighting from home deals a fraction of the damage (the server applies the same rate). */
  readonly damageRate?: number;
  /** The raid's damage weights (raid.damage), so on-screen damage is the server's. */
  readonly damage?: Pick<RaidDamageWeights, 'per_hit' | 'per_weak_hit'>;
  /** This round's hit cap from the server round (round.max_hits). */
  readonly maxHits?: number;
  readonly onComplete: (multiplier: number, meta?: Record<string, unknown>) => void;
  readonly onClose: () => void;
  readonly onQuit?: (resume: () => void) => void;
}) {
  const shellRef = useRef<GameShellV2Handle>(null);
  const particlesRef = useRef<ParticleHandle>(null);
  const [field, setField] = useState({ w: 0, h: 0 });
  const [row, setRow] = useState(0);
  const [damage, setDamage] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [weakOn, setWeakOn] = useState(false);
  const [cue, setCue] = useState('');
  const [revision, setRevision] = useState(0);
  const [activeRound, setActiveRound] = useState(false);
  const [view, setView] = useState<BoardView>({ tellKey: -1, tellSide: 0, phase: '', flashing: -1, shown: 0,
    positions: [0, 1, 2], ghost: 'hidden', locked: false, step: 0 });
  const [pops, setPops] = useState<{ id: number; x: number; y: number; text: string; crit: boolean }[]>([]);
  const clock = useSharedValue(0);
  const hitFlash = useSharedValue(0);
  const squash = useSharedValue(1);
  const lean = useSharedValue(0);
  const shakeCtl = useShake();
  const flashCtl = useFlash();
  const stats = useRef({ hits: 0, weak: 0, lastHitMs: -HIT_GAP_MS, playedMs: 0, resumedAt: 0 });
  const encounter = useRef(createEncounter(boss, 0));
  const round = useRef(0), finished = useRef(false);
  const reduced = useReducedGameMotion();
  const playing = useRef(false);
  const popId = useRef(0);
  const shownView = useRef(view);
  const cap = maxHits && maxHits > 0 ? maxHits : Number.POSITIVE_INFINITY;

  const elapsed = () => stats.current.playedMs + (playing.current ? Date.now() - stats.current.resumedAt : 0);
  const updateCue = () => {
    const ms = elapsed(), state = encounter.current;
    setCue(encounterHint(state, stats.current, ms));
    setWeakOn(encounterExposed(state, ms) && weakAvailable(stats.current));
    const tell = krakenTell(state, ms), board = roboBoard(state, ms);
    const next: BoardView = { tellKey: tell?.up ? tell.at : -1, tellSide: tell?.up ? tell.side : 0, phase: board.phase,
      flashing: board.flashing ?? -1, shown: board.shown, positions: board.positions, ghost: ghostPhase(ms),
      locked: encounterLocked(state, ms), step: state.step };
    const was = shownView.current;
    if (sameView(was, next)) return;
    shownView.current = next; setView(next);
    if (!playing.current) return;
    // Every tell lands with a sound and a haptic on the frame it appears.
    if (boss === 'kraken' && next.tellKey !== was.tellKey) {
      lean.value = reduced ? 0 : withTiming(next.tellSide, { duration: 220, easing: Easing.out(Easing.back(1.6)) });
      if (next.tellKey >= 0) { haptic('tickSelection'); playSfx('whoosh'); }
    }
    if (boss === 'robo_shark' && next.flashing >= 0 && next.flashing !== was.flashing) { haptic('tickSelection'); playSfx('tick'); }
    if (boss === 'robo_shark' && next.phase === 'shuffle' && was.phase !== 'shuffle') playSfx('whoosh');
    if (boss === 'ghost_squid' && next.ghost === 'tell' && was.ghost !== 'tell' && !next.locked) { haptic('tickSelection'); playSfx('tick'); }
  };

  const run = useCallback(() => {
    if (!visible || playing.current || finished.current) return;
    playing.current = true;
    setActiveRound(true);
    stats.current.resumedAt = Date.now();
    const from = stats.current.playedMs;
    clock.value = from;
    clock.value = withTiming(ROUND_MS, { duration: ROUND_MS - from, easing: Easing.linear });
  }, [clock, visible]);

  const halt = useCallback(() => {
    if (playing.current) stats.current.playedMs = Math.min(ROUND_MS, elapsed());
    playing.current = false;
    setActiveRound(false); setPops([]);
    cancelAnimation(clock);
    cancelAnimation(hitFlash); cancelAnimation(squash); hitFlash.value = 0; squash.value = 1;
    cancelAnimation(shakeCtl.translateX); cancelAnimation(shakeCtl.translateY); cancelAnimation(flashCtl.opacity);
    shakeCtl.translateX.value = 0; shakeCtl.translateY.value = 0; flashCtl.opacity.value = 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock, hitFlash, squash, shakeCtl.translateX, shakeCtl.translateY, flashCtl.opacity]);

  useEffect(() => {
    halt();
    if (visible) {
      setDamage(0); setResult(null); setWeakOn(false); setPops([]); finished.current = false;
      stats.current = { hits: 0, weak: 0, lastHitMs: -HIT_GAP_MS, playedMs: 0, resumedAt: 0 };
      encounter.current = createEncounter(boss, round.current++);
      clock.value = 0; lean.value = 0; setRevision(value => value + 1); updateCue();
    }
    return halt;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, boss, halt, clock]);
  useEffect(() => {
    if (reduced) {
      cancelAnimation(hitFlash); cancelAnimation(squash); hitFlash.value = 0; squash.value = 1; lean.value = 0;
      cancelAnimation(shakeCtl.translateX); cancelAnimation(shakeCtl.translateY); cancelAnimation(flashCtl.opacity);
      shakeCtl.translateX.value = 0; shakeCtl.translateY.value = 0; flashCtl.opacity.value = 0;
      setPops([]);
    }
  }, [reduced, hitFlash, squash, lean, shakeCtl.translateX, shakeCtl.translateY, flashCtl.opacity]);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    halt();
    const s = stats.current, misreads = encounter.current.misreads;
    const total = brawlDamage(s, damageRate, weights);
    const stars = brawlStars(boss, s, misreads);
    const payoff = boss === 'kraken' ? 'TENTACLE TRICKED!' : boss === 'robo_shark' ? 'SYSTEM SHORTED!' : 'GHOST CAUGHT!';
    setWeakOn(false);
    setResult({
      score: total,
      stars,
      message: stars === 3 ? `CLEAN READ! ${payoff}` : s.weak > 0 ? payoff : s.hits > 0 ? 'DIRECT HIT!' : 'TRY ITS OPENING!',
      meta: { hits: s.hits, weak_hits: s.weak, misreads, stars,
        duration_ms: Math.round(Math.min(ROUND_MS, Math.max(12000, s.playedMs))) },
    });
  }, [halt, damageRate, boss, weights]);

  // Round timer and authored tells use the same paused gameplay clock.
  useEffect(() => {
    if (!visible || result) return;
    const id = setInterval(() => {
      if (!playing.current) return;
      const ms = elapsed();
      if (ms >= ROUND_MS) { finish(); return; }
      updateCue();
    }, 80);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, result, finish]);

  const onTap = (x: number, y: number, accessible = false) => {
    if (!playing.current || finished.current || !field.w) return;
    const ms = elapsed(), state = encounter.current;
    const s = stats.current;
    const o = bossOffset(ms, field.w, field.h, boss, reduced, state.lureSide, state.exposedUntil);
    const cx = field.w / 2 + o.x;
    const cy = field.h / 2 + o.y;
    if (!accessible && Math.hypot(x - cx, y - cy) > BOSS_SIZE * 0.44) return;
    const spot = WEAK_SPOTS[boss];
    const hit = registerStrike(s, state, ms, accessible || Math.hypot(x - (cx + spot[0] * BOSS_SIZE), y - (cy + spot[1] * BOSS_SIZE)) < 42, cap);
    if (!hit) return;
    encounter.current = hit.state;
    if (hit.spooked) {
      setRevision(value => value + 1); updateCue();
      if (!reduced) shakeCtl.shake(4, 120);
      haptic('failBuzz'); playSfx('fail');
      return;
    }
    const before = brawlDamage(s, damageRate, weights), crit = hit.critical;
    Object.assign(s, hit.stats);
    if (crit) { encounter.current = consumeOpening(hit.state, ms); setRevision(value => value + 1); }
    const total = brawlDamage(s, damageRate, weights), dealt = total - before;
    setDamage(total); updateCue();
    const id = ++popId.current;
    if (!reduced) {
      const impactX = accessible ? cx : x, impactY = accessible ? cy : y;
      setPops(p => [...p.slice(-5), { id, x: impactX, y: impactY, text: crit ? `CRIT ${dealt}` : `${dealt}`, crit }]);
      hitFlash.value = withSequence(withTiming(crit ? 0.8 : 0.4, { duration: 40 }), withTiming(0, { duration: 160 }));
      squash.value = withSequence(withTiming(crit ? 0.88 : 0.95, { duration: 50 }), withTiming(1, { duration: 140 }));
      if (crit) { shakeCtl.shake(7, 140); flashCtl.flash(0.2, 120); }
      particlesRef.current?.burst({ x: impactX, y: impactY, preset: 'burst', count: crit ? 12 : 4,
        colors: crit ? [BRAND.gold, BRAND.white] : [BRAND.white, BRAND.sky], speed: 0.7 });
    }
    haptic(crit ? 'comboHeavy' : 'tapLight'); playSfx(crit ? 'combo' : 'hit');
  };
  const act = (input: number) => {
    if (!playing.current || finished.current) return;
    const action = encounterAction(encounter.current, input, elapsed());
    encounter.current = action.state; setRevision(value => value + 1); updateCue();
    if (action.misread) {
      if (!reduced) shakeCtl.shake(5, 140);
      haptic('failBuzz'); playSfx('fail');
    } else if (action.accepted) { haptic(action.opened ? 'hitMedium' : 'tapLight'); playSfx(action.opened ? 'combo' : 'tick'); }
  };

  // Development autoplay reads the same tells; it never submits a raid itself.
  const tapRef = useRef(onTap);
  const actRef = useRef(act);
  tapRef.current = onTap;
  actRef.current = act;
  useEffect(() => {
    if (!__DEV__ || process.env.EXPO_PUBLIC_GAME_AUTOPLAY !== '1' || !visible || result || !field.w) return;
    const id = setInterval(() => {
      const state = encounter.current, ms = elapsed();
      if (state.boss === 'kraken') { const tell = krakenTell(state, ms); if (tell?.up && ms - tell.at > 250) actRef.current(tell.side); }
      if (state.boss === 'robo_shark' && roboBoard(state, ms).phase === 'connect' && !encounterLocked(state, ms)) actRef.current(state.circuit[state.step]);
      if (state.boss !== 'ghost_squid' || ghostPhase(ms) === 'solid') tapRef.current(0, 0, true);
    }, 300);
    return () => clearInterval(id);
  }, [visible, result, field.w]);

  const state = encounter.current;
  const bossStyle = useAnimatedStyle(() => {
    const o = bossOffset(clock.value, field.w, field.h, boss, reduced, state.lureSide, state.exposedUntil);
    const p = clock.value % 2400;
    // Ghost Squid: faint while hidden, flickers during its 300ms tell, solid after.
    const ghostOpacity = p >= 1400 ? 1 : p >= 1400 - GHOST_TELL_MS ? (Math.floor(p / 75) % 2 === 0 ? 0.75 : 0.4) : 0.22;
    return { opacity: boss === 'ghost_squid' ? ghostOpacity : 1,
      transform: [{ translateX: o.x + lean.value * field.w * 0.1 }, { translateY: o.y },
        { rotate: `${lean.value * 9}deg` }, { scale: squash.value }] };
  }, [revision, boss, reduced, field.w, field.h]);
  const flashStyle = useAnimatedStyle(() => ({ opacity: hitFlash.value }));
  const roundStyle = useAnimatedStyle(() => ({ width: `${Math.max(0, 1 - clock.value / ROUND_MS) * 100}%` as `${number}%` }));
  const revealStyle = useAnimatedStyle(() => ({ width: `${Math.min(1, (clock.value % 2400) / 1400) * 100}%` as `${number}%` }));
  const spot = WEAK_SPOTS[boss], exposed = encounterExposed(state, elapsed());
  const preview = Math.max(0, hpLeft - damage);
  const nodeW = row > 0 ? (row - NODE_GAP * 2) / 3 : 0;

  return (
    <GameShellV2
      ref={shellRef}
      visible={visible}
      title="Boss Brawl"
      subtitle={bossName}
      objective={OBJECTIVES[boss]}
      score={damage}
      result={result}
      starMultipliers={{ 0: 0, 1: 1, 2: 1, 3: 1 }}
      onStart={run}
      onPause={halt}
      onResume={run}
      onComplete={onComplete}
      onClose={onClose}
      onQuit={onQuit}
    >
      <Animated.View style={[StyleSheet.absoluteFill, shakeCtl.style]}
        onLayout={(e: LayoutChangeEvent) => setField({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        <Image source={require('../../../../assets/images/water_background.png')} style={StyleSheet.absoluteFill} contentFit="cover" />
        <View style={[StyleSheet.absoluteFill, styles.tint]} />

        {/* Shared boss HP, with this brawl's damage already chipped off. */}
        <View style={styles.hpWrap} pointerEvents="none">
          <Text style={styles.hpLabel}>{bossName.toUpperCase()}</Text>
          <View style={styles.hpTrack}>
            <View style={[styles.hpFill, { width: `${Math.max(0, (preview / Math.max(1, hpMax)) * 100)}%` }]} />
          </View>
          <Text style={styles.hpText}>{preview.toLocaleString()} / {hpMax.toLocaleString()} HP</Text>
          <View style={styles.roundTrack}><Animated.View style={[styles.roundFill, roundStyle]} /></View>
        </View>

        {/* Kraken: the tentacle tell rises over one buoy lane. */}
        {boss === 'kraken' && view.tellSide !== 0 && field.w > 0 && (
          <TentacleTell key={view.tellKey} side={view.tellSide} width={field.w} height={field.h} reduced={reduced} />
        )}

        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={`Strike ${bossName}. ${cue}`}
          onAccessibilityTap={() => onTap(0, 0, true)} onPressIn={e => onTap(e.nativeEvent.locationX, e.nativeEvent.locationY)}>
          <View style={styles.center} pointerEvents="none">
            <Animated.View style={[{ width: BOSS_SIZE, height: BOSS_SIZE }, bossStyle]}>
              {boss === 'ghost_squid' && view.ghost === 'tell' && !view.locked && <TellRing reduced={reduced} />}
              <Image source={BOSS_ART[boss]} style={StyleSheet.absoluteFill} contentFit="contain" />
              {!reduced && <Animated.View style={[StyleSheet.absoluteFill, flashStyle]}>
                <Image source={BOSS_ART[boss]} style={StyleSheet.absoluteFill} contentFit="contain" tintColor="#ffffff" />
              </Animated.View>}
              {weakOn && (
                <View style={[styles.weak, { left: BOSS_SIZE / 2 + spot[0] * BOSS_SIZE - 26, top: BOSS_SIZE / 2 + spot[1] * BOSS_SIZE - 26 }]} />
              )}
            </Animated.View>
          </View>
        </Pressable>

        <View style={styles.mechanic}>
          <Text style={[styles.cue, view.locked && styles.cueLocked]} accessibilityLiveRegion="polite">{cue}</Text>
          {boss === 'kraken' ? <View style={styles.nodes}>
            {([-1, 1] as const).map(side => {
              const up = view.tellSide === side, lured = exposed && side === state.lureSide;
              return <Pressable key={side} accessibilityRole="button"
                accessibilityLabel={`Lure Kraken ${side < 0 ? 'left' : 'right'} with a buoy`}
                accessibilityHint={up ? 'The tentacle is over this buoy' : undefined}
                disabled={exposed || view.locked} onPress={() => act(side)}
                style={[styles.buoy, up && styles.buoyUp, lured && styles.connected, view.locked && styles.dimmed]}>
                <View style={[styles.buoyTop, up && styles.buoyTopUp]} />
                <Text style={[styles.nodeLabel, (up || lured) && styles.nodeLabelInk]}>{up ? 'TENTACLE!' : side < 0 ? 'LEFT BUOY' : 'RIGHT BUOY'}</Text>
              </Pressable>;
            })}
          </View> : boss === 'robo_shark' ? <View style={styles.board} onLayout={(e: LayoutChangeEvent) => setRow(e.nativeEvent.layout.width)}>
            {nodeW > 0 && [0, 1, 2].map(node => {
              const order = state.circuit.indexOf(node);
              const connected = exposed || (view.phase === 'connect' && order < view.step);
              const flashing = view.flashing === node;
              const number = view.phase === 'flash' && order < view.shown ? String(order + 1) : '';
              return <RoboNode key={node} slot={view.positions.indexOf(node)} width={nodeW} reduced={reduced}
                label={NODE_NAMES[node]} number={number} flashing={flashing} connected={connected}
                disabled={exposed || view.locked || view.phase !== 'connect'} onPress={() => act(node)} />;
            })}
          </View> : <View style={styles.revealWrap}>
            <View style={[styles.revealDot, view.ghost === 'tell' && styles.revealTell, exposed && styles.revealReady, view.locked && styles.dimmed]} />
            <View style={styles.revealTrack}><Animated.View style={[styles.revealFill, revealStyle]} /></View>
            <Text style={styles.revealText}>{view.locked ? 'SPOOKED' : view.ghost === 'solid' ? 'SOLID' : view.ghost === 'tell' ? 'READY' : 'HIDDEN'}</Text>
          </View>}
        </View>

        {!reduced && pops.map(p => <DamagePop key={p.id} x={p.x} y={p.y} text={p.text} crit={p.crit} />)}
        {!reduced && activeRound && field.w > 0 && <ParticleField ref={particlesRef} width={field.w} height={field.h} />}
        {!reduced && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }, flashCtl.style]} />}
      </Animated.View>
    </GameShellV2>
  );
}

/** The Kraken's tell: ripples break the water over the lane and a shadow grows over its buoy. */
function TentacleTell({ side, width, height, reduced }: { side: -1 | 1; width: number; height: number; reduced: boolean }) {
  const grow = useSharedValue(reduced ? 1 : 0);
  const ripple = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    grow.value = withTiming(1, { duration: KRAKEN_TELL_MS * 0.6, easing: Easing.in(Easing.quad) });
    ripple.value = withRepeat(withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }), -1, false);
    return () => { cancelAnimation(grow); cancelAnimation(ripple); };
  }, [grow, ripple, reduced]);
  const shadow = useAnimatedStyle(() => ({ opacity: 0.2 + grow.value * 0.3, transform: [{ scaleX: 0.3 + grow.value * 0.7 }, { scaleY: 0.3 + grow.value * 0.7 }] }));
  const ring = useAnimatedStyle(() => ({ opacity: reduced ? 0.8 : 1 - ripple.value, transform: [{ scale: reduced ? 1 : 0.3 + ripple.value * 0.9 }] }));
  const arc = useAnimatedStyle(() => ({ opacity: grow.value, transform: [{ rotate: `${side * (12 - grow.value * 12)}deg` }] }));
  const x = width / 2 + side * width * 0.27 - 60;
  return (
    <View pointerEvents="none" style={[styles.tell, { left: x, top: height * 0.58 }]}>
      <Animated.View style={[styles.tellShadow, shadow]} />
      <Animated.View style={[styles.tellRing, ring]} />
      <Animated.View style={[styles.tellArc, arc]} />
    </View>
  );
}

/** Ghost Squid's 300ms tell: a white ring snaps in around it. */
function TellRing({ reduced }: { reduced: boolean }) {
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) p.value = withTiming(1, { duration: GHOST_TELL_MS, easing: Easing.out(Easing.cubic) });
    return () => cancelAnimation(p);
  }, [p, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: 0.4 + p.value * 0.6, transform: [{ scale: 1.6 - p.value * 0.75 }] }));
  return <Animated.View pointerEvents="none" style={[styles.ghostRing, style]} />;
}

/** One Robo-Shark circuit node; it slides to its new slot when the board shuffles. */
function RoboNode({ slot, width, reduced, label, number, flashing, connected, disabled, onPress }: {
  slot: number; width: number; reduced: boolean; label: string; number: string;
  flashing: boolean; connected: boolean; disabled: boolean; onPress: () => void;
}) {
  const x = useSharedValue(slot);
  const pulse = useSharedValue(1);
  useEffect(() => {
    x.value = reduced ? slot : withTiming(slot, { duration: ROBO_SHUFFLE_MS, easing: Easing.inOut(Easing.cubic) });
  }, [slot, reduced, x]);
  useEffect(() => {
    if (flashing && !reduced) pulse.value = withSequence(withTiming(1.12, { duration: 90 }), withTiming(1, { duration: 160 }));
  }, [flashing, reduced, pulse]);
  const style = useAnimatedStyle(() => ({ left: x.value * (width + NODE_GAP), transform: [{ scale: pulse.value }] }));
  return (
    <Animated.View style={[styles.nodeSlot, { width }, style]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Tap the ${label.toLowerCase()} light`}
        accessibilityState={{ disabled, selected: connected }} disabled={disabled} onPress={onPress}
        style={[styles.node, flashing && styles.nodeFlash, connected && styles.connected]}>
        <Text style={[styles.nodeNumber, (flashing || connected) && styles.nodeLabelInk]}>{number}</Text>
        <Text style={[styles.nodeLabel, (flashing || connected) && styles.nodeLabelInk]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function DamagePop({ x, y, text, crit }: { x: number; y: number; text: string; crit: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => { p.value = withTiming(1, { duration: 550, easing: Easing.out(Easing.cubic) }); return () => cancelAnimation(p); }, [p]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - p.value * p.value,
    transform: [{ translateY: -p.value * 60 }, { scale: crit ? 1.3 - p.value * 0.3 : 1 }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.popWrap, { left: x - 60, top: y - 30 }, style]}>
      <Text style={[styles.pop, crit && styles.popCrit]}>{text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tint: { backgroundColor: 'rgba(7, 104, 185, 0.14)' },
  roundTrack: { width: '100%', height: 5, borderRadius: 3, overflow: 'hidden', marginTop: 7, backgroundColor: 'rgba(255,255,255,0.45)' },
  roundFill: { height: '100%', backgroundColor: BRAND.white },
  mechanic: { position: 'absolute', bottom: 12, left: 14, right: 14, padding: 10, borderRadius: 20, borderWidth: 3,
    borderColor: BRAND.navy, backgroundColor: BRAND.blue },
  cue: { fontFamily: 'Knockout', fontSize: 15, color: BRAND.white, textAlign: 'center', marginBottom: 9 },
  cueLocked: { color: BRAND.goldLight },
  nodes: { flexDirection: 'row', gap: NODE_GAP, alignItems: 'center', justifyContent: 'center' },
  board: { height: 58, width: '100%' },
  nodeSlot: { position: 'absolute', top: 0, height: 58 },
  node: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 14,
    backgroundColor: BRAND.blueBright, borderWidth: 2, borderColor: BRAND.sky, padding: 5 },
  nodeFlash: { backgroundColor: BRAND.gold, borderColor: BRAND.white },
  connected: { backgroundColor: BRAND.goldLight, borderColor: BRAND.gold },
  dimmed: { opacity: 0.5 },
  nodeNumber: { fontFamily: 'Shark', fontSize: 21, lineHeight: 24, minHeight: 24, color: BRAND.white },
  nodeLabel: { fontFamily: 'Knockout', fontSize: 12, color: BRAND.white, letterSpacing: 0.4 },
  nodeLabelInk: { color: BRAND.navy },
  buoy: { flex: 1, minHeight: 54, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
    backgroundColor: BRAND.blueBright, borderWidth: 2, borderColor: BRAND.sky, borderRadius: 14, padding: 8 },
  buoyUp: { backgroundColor: BRAND.gold, borderColor: BRAND.white },
  buoyTop: { width: 18, height: 23, borderRadius: 9, backgroundColor: BRAND.white, borderWidth: 3, borderColor: BRAND.red },
  buoyTopUp: { borderColor: BRAND.navy },
  tell: { position: 'absolute', width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  tellShadow: { position: 'absolute', width: 110, height: 44, borderRadius: 55, backgroundColor: BRAND.navy },
  tellRing: { position: 'absolute', width: 100, height: 100, borderRadius: 50, borderWidth: 4, borderColor: BRAND.white },
  tellArc: { position: 'absolute', top: -34, width: 96, height: 96, borderRadius: 48, borderWidth: 5, borderStyle: 'dashed',
    borderColor: '#ff9f1c', borderBottomColor: 'transparent', borderLeftColor: 'transparent' },
  ghostRing: { position: 'absolute', left: 20, top: 20, width: BOSS_SIZE - 40, height: BOSS_SIZE - 40,
    borderRadius: (BOSS_SIZE - 40) / 2, borderWidth: 5, borderColor: BRAND.white },
  revealWrap: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8 },
  revealDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 3, borderColor: BRAND.sky, backgroundColor: BRAND.blueBright },
  revealTell: { backgroundColor: BRAND.white, borderColor: BRAND.gold },
  revealReady: { backgroundColor: BRAND.gold, borderColor: BRAND.white },
  revealTrack: { flex: 1, height: 12, borderRadius: 6, backgroundColor: BRAND.blueLip, overflow: 'hidden' },
  revealFill: { height: '100%', backgroundColor: BRAND.gold },
  revealText: { fontFamily: 'Knockout', fontSize: 12, color: BRAND.white, width: 58 },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  weak: { position: 'absolute', width: 52, height: 52, borderRadius: 26, borderWidth: 4, borderColor: BRAND.gold,
    backgroundColor: 'rgba(255, 207, 59, 0.35)', shadowColor: BRAND.gold, shadowOpacity: 1, shadowRadius: 12 },
  hpWrap: { position: 'absolute', top: 14, left: 20, right: 20, alignItems: 'center', zIndex: 5 },
  hpLabel: { fontFamily: 'Shark', fontSize: 18, color: BRAND.gold, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  hpTrack: { marginTop: 4, width: '100%', height: 16, borderRadius: 8, backgroundColor: BRAND.blueLip, borderWidth: 2, borderColor: BRAND.white, overflow: 'hidden' },
  hpFill: { height: '100%', backgroundColor: BRAND.red },
  hpText: { marginTop: 3, fontFamily: 'Knockout', fontSize: 13, color: BRAND.white, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
  popWrap: { position: 'absolute', width: 120 },
  pop: { width: 120, textAlign: 'center', fontFamily: 'Shark', fontSize: 24, color: BRAND.white,
    textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  popCrit: { fontSize: 30, color: BRAND.gold },
});
