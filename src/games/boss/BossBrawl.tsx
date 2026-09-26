/**
 * BossBrawl — a 20 second raid attack. The boss swims a figure-eight; every tap
 * that lands is a hit (10 damage) and tapping the glowing weak spot is a crit
 * (30). The last five seconds it gets angry and moves faster. Damage shown is
 * exactly what the server will count from the hits we report, never inflated.
 */
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming,
} from 'react-native-reanimated';
import type { BossId } from '../../api/endpoints/parks/raid';
import {
  GameShellV2, ParticleField, useFlash, useShake, haptic, playSfx,
  type GameResult, type GameShellV2Handle, type ParticleHandle,
} from '../../gamekit';

export const BOSS_ART: Record<BossId, number> = {
  kraken: require('../../../assets/images/boss/kraken.png'),
  robo_shark: require('../../../assets/images/boss/robo_shark.png'),
  ghost_squid: require('../../../assets/images/boss/ghost_squid.png'),
};

const ROUND_MS = 20000;
const ANGRY_MS = 15000;
const HIT_GAP_MS = 145;          // server allows at most 7 hits a second
const BOSS_SIZE = 210;
const WEAK_EVERY_MS = 2200;
const WEAK_FOR_MS = 950;
const WEAK_SPOTS = [[-0.18, -0.12], [0.2, -0.05], [0, 0.18]] as const;

/** Boss center offset from the arena center at `ms` into the round (shared by UI and hit tests). */
function bossOffset(ms: number, w: number, h: number) {
  'worklet';
  const angry = ms > ANGRY_MS;
  const t = ms / (angry ? 2200 : 3600);
  return { x: Math.sin(t * Math.PI) * w * 0.26, y: Math.sin(t * Math.PI * 2) * h * 0.12 + Math.sin(ms / 260) * 4 };
}

export function BossBrawl({ visible, boss, bossName, hpLeft, hpMax, onComplete, onClose, onQuit }: {
  readonly visible: boolean;
  readonly boss: BossId;
  readonly bossName: string;
  readonly hpLeft: number;
  readonly hpMax: number;
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
  const [pops, setPops] = useState<{ id: number; x: number; y: number; text: string; crit: boolean }[]>([]);
  const clock = useSharedValue(0);
  const hitFlash = useSharedValue(0);
  const squash = useSharedValue(1);
  const shakeCtl = useShake();
  const flashCtl = useFlash();
  const stats = useRef({ hits: 0, weak: 0, lastHit: 0, playedMs: 0, resumedAt: 0, weakIndex: 0 });
  const playing = useRef(false);
  const popId = useRef(0);

  useEffect(() => {
    if (!visible) return;
    setDamage(0); setResult(null); setWeakOn(false); setPops([]);
    stats.current = { hits: 0, weak: 0, lastHit: 0, playedMs: 0, resumedAt: 0, weakIndex: 0 };
    clock.value = 0;
  }, [visible, clock]);

  const elapsed = () => stats.current.playedMs + (playing.current ? Date.now() - stats.current.resumedAt : 0);

  const run = useCallback(() => {
    playing.current = true;
    stats.current.resumedAt = Date.now();
    const from = stats.current.playedMs;
    clock.value = from;
    clock.value = withTiming(ROUND_MS, { duration: ROUND_MS - from, easing: Easing.linear });
  }, [clock]);

  const halt = useCallback(() => {
    if (!playing.current) return;
    stats.current.playedMs = elapsed();
    playing.current = false;
    cancelAnimation(clock);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock]);

  const finish = useCallback(() => {
    halt();
    const s = stats.current;
    const total = s.hits * 10 + s.weak * 20;
    const stars = total <= 0 ? 0 : total >= 1300 ? 3 : total >= 1000 ? 2 : 1;
    setWeakOn(false);
    setResult({
      score: total,
      stars,
      message: total >= 1300 ? 'MONSTER HIT!' : total > 0 ? 'DIRECT HIT!' : 'IT DODGED YOU!',
      meta: { hits: s.hits, weak_hits: s.weak, duration_ms: Math.round(Math.min(26000, Math.max(12000, s.playedMs))) },
    });
  }, [halt]);

  // Round timer + weak spot rhythm.
  useEffect(() => {
    if (!visible || result) return;
    const id = setInterval(() => {
      if (!playing.current) return;
      const ms = elapsed();
      if (ms >= ROUND_MS) { finish(); return; }
      const phase = ms % WEAK_EVERY_MS;
      const on = ms > 1500 && phase < WEAK_FOR_MS;
      setWeakOn(prev => {
        if (on && !prev) stats.current.weakIndex = (stats.current.weakIndex + 1) % WEAK_SPOTS.length;
        return on;
      });
    }, 80);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, result, finish]);

  const onTap = (x: number, y: number) => {
    if (!playing.current || result || !field.w) return;
    const now = Date.now();
    const s = stats.current;
    if (now - s.lastHit < HIT_GAP_MS) return;
    const o = bossOffset(clock.value, field.w, field.h);
    const cx = field.w / 2 + o.x;
    const cy = field.h / 2 + o.y;
    if (Math.hypot(x - cx, y - cy) > BOSS_SIZE * 0.44) return;
    s.lastHit = now;
    const spot = WEAK_SPOTS[s.weakIndex];
    const crit = weakOn && Math.hypot(x - (cx + spot[0] * BOSS_SIZE), y - (cy + spot[1] * BOSS_SIZE)) < 42
      && s.weak < Math.floor((s.hits + 1) / 3);
    s.hits += 1;
    if (crit) { s.weak += 1; setWeakOn(false); }
    const dealt = crit ? 30 : 10;
    setDamage(d => d + dealt);
    const id = ++popId.current;
    setPops(p => [...p.slice(-7), { id, x, y, text: crit ? `CRIT ${dealt}` : `${dealt}`, crit }]);
    hitFlash.value = withSequence(withTiming(crit ? 0.9 : 0.55, { duration: 40 }), withTiming(0, { duration: 160 }));
    squash.value = withSequence(withTiming(crit ? 0.84 : 0.93, { duration: 50 }), withTiming(1, { duration: 140 }));
    if (crit) {
      haptic('comboHeavy'); playSfx('combo'); shakeCtl.shake(12, 180); flashCtl.flash(0.35, 140);
      particlesRef.current?.burst({ x, y, preset: 'burst', count: 18, colors: ['#ffcf3b', '#ffffff', '#ff8a3b'], speed: 1.2 });
    } else {
      haptic('tapLight'); playSfx('hit');
      particlesRef.current?.burst({ x, y, preset: 'burst', count: 6, colors: ['#ffffff', '#9fe3ff'], speed: 0.7 });
    }
  };

  const bossStyle = useAnimatedStyle(() => {
    const o = bossOffset(clock.value, field.w, field.h);
    return { transform: [{ translateX: o.x }, { translateY: o.y }, { scale: squash.value }, { rotate: `${Math.sin(clock.value / 300) * 5}deg` }] };
  });
  const flashStyle = useAnimatedStyle(() => ({ opacity: hitFlash.value }));
  const angryStyle = useAnimatedStyle(() => ({ opacity: clock.value > ANGRY_MS ? 0.35 + Math.sin(clock.value / 120) * 0.15 : 0 }));
  const spot = WEAK_SPOTS[stats.current.weakIndex];
  const preview = Math.max(0, hpLeft - damage);

  return (
    <GameShellV2
      ref={shellRef}
      visible={visible}
      title="Boss Brawl"
      subtitle={bossName}
      objective={`Tap ${bossName}! Hit the glowing weak spot for a crit.`}
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
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.angry, angryStyle]} />

        {/* Shared boss HP, with this brawl's damage already chipped off. */}
        <View style={styles.hpWrap} pointerEvents="none">
          <Text style={styles.hpLabel}>{bossName.toUpperCase()}</Text>
          <View style={styles.hpTrack}>
            <View style={[styles.hpFill, { width: `${Math.max(2, (preview / Math.max(1, hpMax)) * 100)}%` }]} />
          </View>
          <Text style={styles.hpText}>{preview.toLocaleString()} / {hpMax.toLocaleString()} HP</Text>
        </View>

        <Pressable style={StyleSheet.absoluteFill} onPressIn={e => onTap(e.nativeEvent.locationX, e.nativeEvent.locationY)}>
          <View style={styles.center} pointerEvents="none">
            <Animated.View style={[{ width: BOSS_SIZE, height: BOSS_SIZE }, bossStyle]}>
              <Image source={BOSS_ART[boss]} style={StyleSheet.absoluteFill} contentFit="contain" />
              <Animated.View style={[StyleSheet.absoluteFill, flashStyle]}>
                <Image source={BOSS_ART[boss]} style={StyleSheet.absoluteFill} contentFit="contain" tintColor="#ffffff" />
              </Animated.View>
              {weakOn && (
                <View style={[styles.weak, { left: BOSS_SIZE / 2 + spot[0] * BOSS_SIZE - 26, top: BOSS_SIZE / 2 + spot[1] * BOSS_SIZE - 26 }]} />
              )}
            </Animated.View>
          </View>
        </Pressable>

        {pops.map(p => <DamagePop key={p.id} x={p.x} y={p.y} text={p.text} crit={p.crit} />)}
        {field.w > 0 && <ParticleField ref={particlesRef} width={field.w} height={field.h} />}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }, flashCtl.style]} />
      </Animated.View>
    </GameShellV2>
  );
}

function DamagePop({ x, y, text, crit }: { x: number; y: number; text: string; crit: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => { p.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }); }, [p]);
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
  angry: { backgroundColor: '#ff3b3b' },
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
