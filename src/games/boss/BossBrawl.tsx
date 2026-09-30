/**
 * A short pausable raid: lure Kraken, connect Robo-Shark's circuit, or time
 * Ghost Squid's reveal. Damage uses the server's formula and critical limit.
 */
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming,
} from 'react-native-reanimated';
import type { BossId } from '../../api/endpoints/parks/raid';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { BRAWL_MS as ROUND_MS, HIT_GAP_MS, brawlDamage, brawlStars, consumeOpening, createEncounter, encounterAction,
  encounterExposed, encounterHint, ghostRevealed, registerStrike, weakAvailable } from './encounter';
import {
  GameShellV2, ParticleField, useFlash, useShake, haptic, playSfx,
  type GameResult, type GameShellV2Handle, type ParticleHandle,
} from '../../gamekit';

export const BOSS_ART: Record<BossId, number> = {
  kraken: require('../../../assets/images/boss/kraken.png'),
  robo_shark: require('../../../assets/images/boss/robo_shark.png'),
  ghost_squid: require('../../../assets/images/boss/ghost_squid.png'),
};

const BOSS_SIZE = 210;
const WEAK_SPOTS = { kraken: [0, -0.18], robo_shark: [0, 0.1], ghost_squid: [0, 0] } as const;
const OBJECTIVES: Record<BossId, string> = {
  kraken: 'Lure a tentacle with a buoy, then strike its glowing center.',
  robo_shark: 'Connect the numbered circuit, then strike the exposed core.',
  ghost_squid: 'Watch its reveal ring. Strike when Ghost Squid becomes solid.',
};

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

export function BossBrawl({ visible, boss, bossName, hpLeft, hpMax, damageRate = 1, onComplete, onClose, onQuit }: {
  readonly visible: boolean;
  readonly boss: BossId;
  readonly bossName: string;
  readonly hpLeft: number;
  readonly hpMax: number;
  /** Fighting from home deals a fraction of the damage (the server applies the same rate). */
  readonly damageRate?: number;
  readonly onComplete: (multiplier: number, meta?: Record<string, unknown>) => void;
  readonly onClose: () => void;
  readonly onQuit?: (resume: () => void) => void;
}) {
  const shellRef = useRef<GameShellV2Handle>(null);
  const particlesRef = useRef<ParticleHandle>(null);
  const [field, setField] = useState({ w: 0, h: 0 });
  const [damage, setDamage] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [weakOn, setWeakOn] = useState(false);
  const [cue, setCue] = useState('');
  const [revision, setRevision] = useState(0);
  const [activeRound, setActiveRound] = useState(false);
  const [pops, setPops] = useState<{ id: number; x: number; y: number; text: string; crit: boolean }[]>([]);
  const clock = useSharedValue(0);
  const hitFlash = useSharedValue(0);
  const squash = useSharedValue(1);
  const shakeCtl = useShake();
  const flashCtl = useFlash();
  const stats = useRef({ hits: 0, weak: 0, lastHitMs: -HIT_GAP_MS, playedMs: 0, resumedAt: 0 });
  const encounter = useRef(createEncounter(boss, 0));
  const round = useRef(0), finished = useRef(false);
  const reduced = useReducedGameMotion();
  const playing = useRef(false);
  const popId = useRef(0);

  const elapsed = () => stats.current.playedMs + (playing.current ? Date.now() - stats.current.resumedAt : 0);
  const updateCue = () => {
    const ms = elapsed();
    setCue(encounterHint(encounter.current, stats.current, ms));
    setWeakOn(encounterExposed(encounter.current, ms) && weakAvailable(stats.current));
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
      clock.value = 0; setRevision(value => value + 1); updateCue();
    }
    return halt;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, boss, halt, clock]);
  useEffect(() => {
    if (reduced) {
      cancelAnimation(hitFlash); cancelAnimation(squash); hitFlash.value = 0; squash.value = 1;
      cancelAnimation(shakeCtl.translateX); cancelAnimation(shakeCtl.translateY); cancelAnimation(flashCtl.opacity);
      shakeCtl.translateX.value = 0; shakeCtl.translateY.value = 0; flashCtl.opacity.value = 0;
      setPops([]);
    }
  }, [reduced, hitFlash, squash, shakeCtl.translateX, shakeCtl.translateY, flashCtl.opacity]);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    halt();
    const s = stats.current;
    const total = brawlDamage(s, damageRate);
    const stars = brawlStars(boss, s);
    const payoff = boss === 'kraken' ? 'TENTACLE TRICKED!' : boss === 'robo_shark' ? 'SYSTEM SHORTED!' : 'GHOST CAUGHT!';
    setWeakOn(false);
    setResult({
      score: total,
      stars,
      message: s.weak > 0 ? payoff : s.hits > 0 ? 'DIRECT HIT!' : 'TRY ITS OPENING!',
      meta: { hits: s.hits, weak_hits: s.weak, duration_ms: Math.round(Math.min(26000, Math.max(12000, s.playedMs))) },
    });
  }, [halt, damageRate, boss]);

  // Round timer and authored opening cues use the same paused gameplay clock.
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
    const hit = registerStrike(s, state, ms, accessible || Math.hypot(x - (cx + spot[0] * BOSS_SIZE), y - (cy + spot[1] * BOSS_SIZE)) < 42);
    if (!hit) return;
    const before = brawlDamage(s, damageRate), crit = hit.critical;
    Object.assign(s, hit.stats);
    if (crit) { encounter.current = consumeOpening(state, ms); setRevision(value => value + 1); }
    const total = brawlDamage(s, damageRate), dealt = total - before;
    setDamage(total); updateCue();
    const id = ++popId.current;
    if (!reduced) {
      const impactX = accessible ? cx : x, impactY = accessible ? cy : y;
      setPops(p => [...p.slice(-5), { id, x: impactX, y: impactY, text: crit ? `CRIT ${dealt}` : `${dealt}`, crit }]);
      hitFlash.value = withSequence(withTiming(crit ? 0.8 : 0.4, { duration: 40 }), withTiming(0, { duration: 160 }));
      squash.value = withSequence(withTiming(crit ? 0.88 : 0.95, { duration: 50 }), withTiming(1, { duration: 140 }));
      if (crit) { shakeCtl.shake(7, 140); flashCtl.flash(0.2, 120); }
      particlesRef.current?.burst({ x: impactX, y: impactY, preset: 'burst', count: crit ? 12 : 4,
        colors: crit ? ['#ffcf3b', '#fff'] : ['#fff', '#9fe3ff'], speed: 0.7 });
    }
    haptic(crit ? 'comboHeavy' : 'tapLight'); playSfx(crit ? 'combo' : 'hit');
  };
  const act = (input: number) => {
    if (!playing.current || finished.current) return;
    const action = encounterAction(encounter.current, input, elapsed());
    encounter.current = action.state; setRevision(value => value + 1); updateCue();
    if (action.accepted) { haptic('tapLight'); playSfx(action.opened ? 'combo' : 'tick'); }
  };

  // Development autoplay follows the same openings; it never submits a raid itself.
  const tapRef = useRef(onTap);
  const actRef = useRef(act);
  tapRef.current = onTap;
  actRef.current = act;
  useEffect(() => {
    if (!__DEV__ || process.env.EXPO_PUBLIC_GAME_AUTOPLAY !== '1' || !visible || result || !field.w) return;
    const id = setInterval(() => {
      const state = encounter.current, ms = elapsed();
      if (state.boss !== 'ghost_squid' && !encounterExposed(state, ms))
        actRef.current(state.boss === 'kraken' ? -state.lureSide : state.circuit[state.step]);
      tapRef.current(0, 0, true);
    }, 220);
    return () => clearInterval(id);
  }, [visible, result, field.w]);

  const state = encounter.current;
  const bossStyle = useAnimatedStyle(() => {
    const o = bossOffset(clock.value, field.w, field.h, boss, reduced, state.lureSide, state.exposedUntil);
    return { opacity: boss === 'ghost_squid' && !ghostRevealed(clock.value) ? 0.22 : 1,
      transform: [{ translateX: o.x }, { translateY: o.y }, { scale: squash.value }] };
  }, [revision, boss, reduced, field.w, field.h]);
  const flashStyle = useAnimatedStyle(() => ({ opacity: hitFlash.value }));
  const roundStyle = useAnimatedStyle(() => ({ width: `${Math.max(0, 1 - clock.value / ROUND_MS) * 100}%` as `${number}%` }));
  const revealStyle = useAnimatedStyle(() => ({ width: `${Math.min(1, (clock.value % 2400) / 1400) * 100}%` as `${number}%` }));
  const spot = WEAK_SPOTS[boss], exposed = encounterExposed(state, elapsed());
  const preview = Math.max(0, hpLeft - damage);

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
        <Image source={require('../../../assets/images/water_background.png')} style={StyleSheet.absoluteFill} contentFit="cover" />
        <View style={[StyleSheet.absoluteFill, styles.tint]} />

        {/* Shared boss HP, with this brawl's damage already chipped off. */}
        <View style={styles.hpWrap} pointerEvents="none">
          <Text style={styles.hpLabel}>{bossName.toUpperCase()} · ROUND PREVIEW</Text>
          <View style={styles.hpTrack}>
            <View style={[styles.hpFill, { width: `${Math.max(0, (preview / Math.max(1, hpMax)) * 100)}%` }]} />
          </View>
          <Text style={styles.hpText}>{preview.toLocaleString()} / {hpMax.toLocaleString()} HP</Text>
          <View style={styles.roundTrack}><Animated.View style={[styles.roundFill, roundStyle]} /></View>
        </View>

        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={`Strike ${bossName}. ${cue}`}
          onAccessibilityTap={() => onTap(0, 0, true)} onPressIn={e => onTap(e.nativeEvent.locationX, e.nativeEvent.locationY)}>
          <View style={styles.center} pointerEvents="none">
            <Animated.View style={[{ width: BOSS_SIZE, height: BOSS_SIZE }, bossStyle]}>
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
          <Text style={styles.cue} accessibilityLiveRegion="polite">{cue}</Text>
          {boss === 'kraken' ? <View style={styles.nodes}>
            {([-1, 1] as const).map(side => <Pressable key={side} accessibilityRole="button"
              accessibilityLabel={`Lure Kraken ${side < 0 ? 'left' : 'right'} with a buoy`} disabled={exposed}
              onPress={() => act(side)} style={[styles.buoy, exposed && side === state.lureSide && styles.connected]}>
              <View style={styles.buoyTop} /><Text style={styles.nodeLabel}>{side < 0 ? 'LURE LEFT' : 'LURE RIGHT'}</Text>
            </Pressable>)}
          </View> : boss === 'robo_shark' ? <View style={styles.nodes}>
            {[0, 1, 2].map(index => { const order = state.circuit.indexOf(index), connected = exposed || order < state.step;
              return <Pressable key={index} accessibilityRole="button" accessibilityLabel={`Connect circuit node ${order + 1}`}
                accessibilityState={{ disabled: exposed, selected: connected }} disabled={exposed} onPress={() => act(index)}
                style={[styles.node, connected && styles.connected, !exposed && order === state.step && styles.nextNode]}>
                <Text style={styles.nodeNumber}>{connected ? '✓' : order + 1}</Text><Text style={styles.nodeLabel}>{['POWER', 'RELAY', 'CORE'][index]}</Text>
              </Pressable>;
            })}
          </View> : <View style={styles.revealWrap}><View style={[styles.revealDot, exposed && styles.revealReady]} />
            <View style={styles.revealTrack}><Animated.View style={[styles.revealFill, revealStyle]} /></View>
            <Text style={styles.revealText}>{exposed ? 'SOLID' : 'REVEAL'}</Text>
          </View>}
        </View>

        {!reduced && pops.map(p => <DamagePop key={p.id} x={p.x} y={p.y} text={p.text} crit={p.crit} />)}
        {!reduced && activeRound && field.w > 0 && <ParticleField ref={particlesRef} width={field.w} height={field.h} />}
        {!reduced && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }, flashCtl.style]} />}
      </Animated.View>
    </GameShellV2>
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
  tint: { backgroundColor: 'rgba(4, 30, 70, 0.45)' },
  roundTrack: { width: '100%', height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 7, backgroundColor: '#113C6B' },
  roundFill: { height: '100%', backgroundColor: '#9FE3FF' },
  mechanic: { position: 'absolute', bottom: 12, left: 14, right: 14, padding: 10, borderRadius: 20, borderWidth: 2,
    borderColor: '#A6DFF5', backgroundColor: '#075083' },
  cue: { fontFamily: 'Knockout', fontSize: 15, color: '#FFF', textAlign: 'center', marginBottom: 9 },
  nodes: { flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center' },
  node: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 14,
    backgroundColor: '#163B6D', borderWidth: 2, borderColor: '#6AA7C9', padding: 5 },
  nextNode: { borderColor: '#FFD34B', backgroundColor: '#22577D' },
  connected: { backgroundColor: '#167970', borderColor: '#8BFFE0' },
  nodeNumber: { fontFamily: 'Shark', fontSize: 21, color: '#FFE37B' },
  nodeLabel: { fontFamily: 'Knockout', fontSize: 12, color: '#FFF', letterSpacing: 0.4 },
  buoy: { flex: 1, minHeight: 54, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
    backgroundColor: '#163B6D', borderWidth: 2, borderColor: '#FFD34B', borderRadius: 14, padding: 8 },
  buoyTop: { width: 18, height: 23, borderRadius: 9, backgroundColor: '#FFCF3B', borderWidth: 3, borderColor: '#FFF' },
  revealWrap: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8 },
  revealDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 3, borderColor: '#9FE3FF', backgroundColor: '#163B6D' },
  revealReady: { backgroundColor: '#FFD34B', borderColor: '#FFF' },
  revealTrack: { flex: 1, height: 12, borderRadius: 6, backgroundColor: '#163B6D', overflow: 'hidden' },
  revealFill: { height: '100%', backgroundColor: '#FFD34B' },
  revealText: { fontFamily: 'Knockout', fontSize: 12, color: '#FFF', width: 45 },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  weak: { position: 'absolute', width: 52, height: 52, borderRadius: 26, borderWidth: 4, borderColor: '#ffcf3b',
    backgroundColor: 'rgba(255, 207, 59, 0.35)', shadowColor: '#ffcf3b', shadowOpacity: 1, shadowRadius: 12 },
  hpWrap: { position: 'absolute', top: 14, left: 20, right: 20, alignItems: 'center', zIndex: 5 },
  hpLabel: { fontFamily: 'Shark', fontSize: 18, color: '#ffcf3b', textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  hpTrack: { marginTop: 4, width: '100%', height: 16, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 2, borderColor: '#fff', overflow: 'hidden' },
  hpFill: { height: '100%', backgroundColor: '#ef4444' },
  hpText: { marginTop: 3, fontFamily: 'Knockout', fontSize: 13, color: '#fff' },
  popWrap: { position: 'absolute', width: 120 },
  pop: { width: 120, textAlign: 'center', fontFamily: 'Shark', fontSize: 24, color: '#fff',
    textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  popCrit: { fontSize: 30, color: '#ffcf3b' },
});
