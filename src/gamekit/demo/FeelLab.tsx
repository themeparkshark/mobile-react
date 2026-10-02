/**
 * FeelLab: the third studio engine bench (dev MiniGameTester), for the pass-4
 * systems, all through their real code paths:
 *
 *   - Stamps: bubble-letter BONK! / x4 COMBO slab / CLOSE! in 3 Skia passes,
 *     FIFO one at a time, frozen by hit-stop.
 *   - Finisher cam: Final Bonk (boss), Ride win and Match point plans:
 *     freeze, slow-mo, push-in toward the impact, rings + shockwave, confetti
 *     cannons, stinger with a music duck, the finalBonk haptic pattern.
 *   - Haptic bus: pick a game's density rule, then "Haptic burst" offers 12
 *     Core Haptics patterns in 300 ms; the counters show fired / queued / dropped.
 *   - Screen cap: "Rush" fires 5 moments in 100 ms under Banana's 2-per-250 ms
 *     cap; capped ones keep particles and sound but no flash, shake or stamp.
 *   - Thermal ladder: Auto / Fair / Serious / Critical pins (particle cap,
 *     ambient bubbles, 60-step mode).
 *   - Results card with HITS / COMBO / BONUS bucket tallies and stars on the
 *     stinger's beat.
 *
 * `autoplay` runs the scripted tour for the demo video. Dev only.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, LogBox, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Canvas, Circle, Group, Image as SkImage, LinearGradient, Rect, useImage, vec } from '@shopify/react-native-skia';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useDerivedValue, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { FxStage, type FxStageHandle } from '../fx/FxStage';
import { StampLayer, type StampLayerHandle } from '../fx/StampLayer';
import { ShockwaveGroup, Sunburst, useShockwave } from '../fx/ShaderFx';
import { useCamera } from '../fx/useCamera';
import { useFinisher } from '../fx/useFinisher';
import { useGameClock } from '../useGameClock';
import { useFeel } from '../feel';
import { createFxGovernor } from '../core/fxGovernor';
import { THERMAL_NAMES, THERMAL_SCALES } from '../core/thermal';
import { HAPTIC_BUS_PRESETS, type HapticBusPreset } from '../core/hapticBus';
import { useThermal } from '../perf/useThermal';
import { PerfOverlay, usePerfProbe } from '../perf/PerfOverlay';
import { ResultsCard } from '../results/ResultsCard';
import { GameAudio } from '../audio/GameAudio';
import { registerStudioAudio } from '../audio/studioLibrary';
import { configureHaptics, hapticBusStats, hasNativeHaptics, playPattern } from '../Haptics';
import type { AhapPatternName } from '../core/hapticPattern';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';

registerStudioAudio(['whack', 'shared']);

const { width: SW, height: SH } = Dimensions.get('window');
const HEADER_H = 96;
const STAGE_H = Math.round(SH * 0.4);
const SHARK = 132;
const CX = SW / 2;
const CY = STAGE_H * 0.55;
const BUBBLES = 14;
const BEAT_MS = Math.round(60000 / 129.2);
const BUS_CHIPS: HapticBusPreset[] = ['default', 'whack', 'banana', 'sharky', 'lineParty'];
const BURST: AhapPatternName[] = ['whackGood', 'whackQuick', 'whackCrit', 'goldenTell', 'whackLate', 'whackCounter',
  'whackGood', 'purrTell', 'whackQuick', 'whackGood', 'tierUp', 'whackLate'];

function pick(...names: string[]): string {
  for (const n of names) if (GameAudio.hasCue(n)) return n;
  return names[names.length - 1];
}

export interface FeelLabProps {
  visible: boolean;
  onClose: () => void;
  autoplay?: boolean;
}

export default function FeelLab({ visible, onClose, autoplay = false }: FeelLabProps) {
  const reducedMotion = useReducedGameMotion();
  const fx = useRef<FxStageHandle>(null);
  const stamps = useRef<StampLayerHandle>(null);
  const perf = usePerfProbe(visible);
  const thermal = useThermal({ active: visible });
  const [thermalPin, setThermalPin] = useState(-1);
  const [busPreset, setBusPreset] = useState<HapticBusPreset>('default');
  const [busLine, setBusLine] = useState('fired 0  queued 0  dropped 0');
  const [log, setLog] = useState<string[]>([]);
  const [showResults, setShowResults] = useState(false);
  const note = useCallback((line: string) => setLog((l) => [line, ...l].slice(0, 5)), []);

  const clock = useGameClock({});
  const camera = useCamera({ width: SW, height: STAGE_H, timeScale: clock.fxScale, reducedMotion });
  const wave = useShockwave();
  const sun = useSharedValue(0);
  const t = THERMAL_SCALES[thermal.levelJs];

  // Banana's screen-event cap: 2 screen-space moments per 250 ms.
  const governor = useMemo(() => createFxGovernor({ calm: reducedMotion, screenEventsPerWindow: 2, screenWindowMs: 250,
    flashesPerWindow: 4, flashMinGapMs: 120 }), [reducedMotion]);

  // Ambient bubbles (off from 'fair' up: the thermal ladder's first cut).
  const now = useSharedValue(0);
  const bob = useSharedValue(0);
  useFrameCallback((info) => {
    'worklet';
    const dt = info.timeSincePreviousFrame ?? 16;
    now.value += dt * clock.fxScale.value;
    bob.value = Math.sin(now.value / 260) * 4;
  }, visible);
  const sharkY = useDerivedValue(() => CY - SHARK / 2 + bob.value);
  const sharkImg = useImage(require('../../assets/games/whack/shark-pop-1.png'));
  const holeImg = useImage(require('../../assets/games/whack/hole.png'));

  // Bus proxies log what the screen cap let through.
  const fxProxy = useMemo(() => ({
    get current() {
      const f = fx.current;
      if (!f) return null;
      return { ...f, flash: (o?: { color?: string; peak?: number; ms?: number }) => { note('  flash'); f.flash(o); },
        bloom: (x: number, y: number, o?: { color?: string; radius?: number; peak?: number; ms?: number }) => { note('  no flash: local bloom'); f.bloom(x, y, o); } };
    },
  }), [note]);

  const feel = useFeel({
    bonk: {
      sfx: pick('wh_bonk', 'fx.pop'), ladder: true, pattern: 'whackQuick', localStop: 60,
      burst: [{ emitter: 'impact' }, { emitter: 'stars', count: 10 }, { emitter: 'splash', count: 10 }],
      ring: { color: '#ffcf3b', to: 90, ms: 220 }, flash: { peak: 0.2, ms: 60 }, shake: 0.2,
      stamp: { style: 'sharky', color: '#ffffff', size: 36 },
    },
    combo: {
      sfx: pick('sh_tier_up', 'fx.reveal'), pattern: 'tierUp', burst: [{ emitter: 'confetti', count: 18 }],
      punch: 0.04, stamp: { style: 'slab', color: '#ffcf3b', size: 34 },
    },
    close: {
      sfx: pick('sk_skim', 'fx.whoosh'), pattern: 'whackGood', burst: [{ emitter: 'sparks', count: 12 }],
      stamp: { style: 'sharky', color: '#ffcf3b', size: 34 },
    },
    rush: {
      sfx: pick('wh_bonk', 'fx.pop'), ladder: true, pattern: 'whackGood', burst: [{ emitter: 'stars', count: 6 }],
      flash: { peak: 0.15, ms: 50 }, shake: 0.12, stamp: { style: 'party', color: '#ffffff', size: 28 },
    },
  }, { fx: fxProxy as unknown as React.RefObject<FxStageHandle>, stamps, camera, clock, width: SW, calm: reducedMotion, governor });

  const finisher = useFinisher({
    clock, camera, fx, stamps, wave, sunburst: sun, width: SW, height: HEADER_H + STAGE_H,
    stinger: pick('sting_whack_win', 'fx.reward'), reducedMotion,
  });

  const bonk = useCallback(() => feel('bonk', { x: CX, y: HEADER_H + CY - 30, step: 3, slot: 0, stamp: 'BONK!', dx: 0, dy: -1 }), [feel]);
  const combo = useCallback(() => feel('combo', { x: CX + 40, y: HEADER_H + CY - 50, stamp: 'x4 COMBO +600' }), [feel]);
  const close = useCallback(() => feel('close', { x: CX - 30, y: HEADER_H + CY - 40, stamp: 'CLOSE!' }), [feel]);
  const rush = useCallback(() => {
    note('rush: 5 moments in 100 ms (cap 2 per 250 ms)');
    for (let k = 0; k < 5; k++) setTimeout(() => feel('rush', { x: CX + (k - 2) * 56, y: HEADER_H + CY - 20, step: k, stamp: `POP ${k + 1}` }), k * 25);
  }, [feel, note]);

  const runFinisher = useCallback((name: 'bossDefeat' | 'rideWin' | 'matchPoint', text: string) => {
    note(`finisher: ${name}`);
    const ms = finisher.run(name, { x: CX, y: HEADER_H + CY - 20, text });
    setTimeout(() => note(`  handed to results after ${ms} ms`), ms);
  }, [finisher, note]);

  const refreshBus = useCallback(() => {
    const s = hapticBusStats();
    setBusLine(`fired ${s.fired}  queued ${s.queued}  dropped ${s.dropped}  preempted ${s.preempted}`);
  }, []);

  const pickBus = useCallback((p: HapticBusPreset) => {
    setBusPreset(p);
    configureHaptics(p);
    const cfg = { minGapMs: 60, ...HAPTIC_BUS_PRESETS[p] } as { minGapMs: number };
    note(`haptic bus: ${p} (${cfg.minGapMs} ms gap)`);
  }, [note]);

  const hapticBurst = useCallback(() => {
    const before = hapticBusStats();
    BURST.forEach((name, k) => setTimeout(() => playPattern(name, { priority: name === 'whackCounter' ? 9 : name.includes('Tell') ? 3 : 2, tell: name.includes('Tell') }), k * 25));
    setTimeout(() => {
      const s = hapticBusStats();
      note(`burst of 12: fired ${s.fired - before.fired}, queued ${s.queued - before.queued}, dropped ${s.dropped - before.dropped}`);
      refreshBus();
    }, 420);
  }, [note, refreshBus]);

  const pinThermal = useCallback((l: number) => {
    setThermalPin(l);
    thermal.force(l);
    note(l < 0 ? 'thermal: auto' : `thermal pinned: ${THERMAL_NAMES[l]} (cap ${THERMAL_SCALES[l].particleCap})`);
  }, [note, thermal]);

  useEffect(() => {
    if (!visible) return undefined;
    void GameAudio.init().then(() => GameAudio.preload([
      pick('wh_bonk', 'fx.pop'), pick('sh_tier_up', 'fx.reveal'), pick('sk_skim', 'fx.whoosh'), pick('sting_whack_win', 'fx.reward'),
    ]));
    return () => configureHaptics('default');
  }, [visible]);

  const act = useRef({ bonk, combo, close, rush, runFinisher, pickBus, hapticBurst, pinThermal });
  act.current = { bonk, combo, close, rush, runFinisher, pickBus, hapticBurst, pinThermal };
  useEffect(() => {
    if (!visible || !autoplay) return undefined;
    LogBox.ignoreAllLogs(true);
    const a = () => act.current;
    const plan: [number, () => void][] = [
      [1400, () => a().bonk()],
      [2600, () => a().combo()],
      [3800, () => a().close()],
      [5200, () => a().rush()],
      [7200, () => a().pickBus('whack')],
      [7800, () => a().hapticBurst()],
      [9000, () => a().pickBus('banana')],
      [9600, () => a().hapticBurst()],
      [11000, () => a().runFinisher('matchPoint', 'MATCH POINT!')],
      [13800, () => a().pinThermal(2)],
      [14600, () => a().bonk()],
      [15800, () => a().pinThermal(-1)],
      [16600, () => a().runFinisher('bossDefeat', 'KNOCKOUT!')],
      [19600, () => setShowResults(true)],
      [27500, () => setShowResults(false)],
    ];
    const timers = plan.map(([ms, fn]) => setTimeout(fn, ms));
    return () => timers.forEach(clearTimeout);
  }, [visible, autoplay]);

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait']}>
      <GestureHandlerRootView style={styles.fill}>
        <View style={styles.header}>
          <Text style={styles.title}>FEEL LAB</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {`thermal ${THERMAL_NAMES[thermal.levelJs].toUpperCase()}${thermalPin < 0 ? ' (auto)' : ''}  ·  bus ${busPreset}  ·  ${hasNativeHaptics() ? 'core haptics' : 'expo fallback'}`}
          </Text>
          <TouchableOpacity style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.closeText}>CLOSE</Text>
          </TouchableOpacity>
        </View>

        <Animated.View style={[styles.stage, camera.style]}>
          <Canvas style={StyleSheet.absoluteFill}>
            <ShockwaveGroup wave={wave}>
              <Rect x={0} y={0} width={SW} height={STAGE_H}>
                <LinearGradient start={vec(0, 0)} end={vec(0, STAGE_H)} colors={['#3db8ff', '#bfeaff']} />
              </Rect>
              <Sunburst cx={CX} cy={CY} radius={SW * 0.8} intensity={sun} width={SW} height={STAGE_H} rays={14} />
              <Rect x={0} y={STAGE_H * 0.74} width={SW} height={STAGE_H * 0.26}>
                <LinearGradient start={vec(0, STAGE_H * 0.74)} end={vec(0, STAGE_H)} colors={['#46c3d1', '#1c8fa6']} />
              </Rect>
              {t.ambient ? Array.from({ length: BUBBLES }, (_, i) => <Bubble key={i} index={i} now={now} />) : null}
              {holeImg ? <SkImage image={holeImg} x={CX - SHARK * 0.75} y={CY + SHARK * 0.18} width={SHARK * 1.5} height={SHARK * 0.6} fit="contain" /> : null}
              {sharkImg ? <SkImage image={sharkImg} x={CX - SHARK / 2} y={sharkY} width={SHARK} height={SHARK} fit="contain" /> : null}
            </ShockwaveGroup>
          </Canvas>
        </Animated.View>

        <View style={styles.panel}>
          <Text style={styles.panelLabel}>HAPTIC BUS</Text>
          <View style={styles.row}>
            {BUS_CHIPS.map((p) => (
              <TouchableOpacity key={p} style={[styles.miniChip, busPreset === p && styles.miniChipOn]} onPress={() => pickBus(p)} accessibilityRole="button">
                <Text style={styles.miniChipText}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.busLine}>{busLine}</Text>
          <Text style={styles.panelLabel}>THERMAL</Text>
          <View style={styles.row}>
            {[-1, 1, 2, 3].map((l) => (
              <TouchableOpacity key={l} style={[styles.miniChip, thermalPin === l && styles.miniChipOn]} onPress={() => pinThermal(l)} accessibilityRole="button">
                <Text style={styles.miniChipText}>{l < 0 ? 'auto' : THERMAL_NAMES[l]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.log}>
          {log.map((l, i) => <Text key={`${i}-${l}`} style={[styles.logText, i === 0 && styles.logNew]}>{l}</Text>)}
        </View>

        <View style={styles.controls}>
          {([
            ['Bonk', bonk], ['Combo slab', combo], ['Close!', close], ['Rush (cap)', rush], ['Haptic burst', hapticBurst],
            ['Final Bonk', () => runFinisher('bossDefeat', 'KNOCKOUT!')], ['Ride win', () => runFinisher('rideWin', 'RIDE COIN!')],
            ['Match point', () => runFinisher('matchPoint', 'MATCH POINT!')], ['Results', () => setShowResults(true)],
          ] as [string, () => void][]).map(([label, fn]) => (
            <TouchableOpacity key={label} style={styles.chip} onPress={fn} accessibilityRole="button">
              <Text style={styles.chipText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <FxStage ref={fx} width={SW} height={SH} timeScale={clock.fxScale} reducedMotion={reducedMotion}
          capacity={Math.min(200, t.particleCap)} style={StyleSheet.absoluteFill} />
        <StampLayer ref={stamps} width={SW} height={HEADER_H + STAGE_H} timeScale={clock.fxScale} reducedMotion={reducedMotion}
          minY={HEADER_H} queue={{ maxLive: 1, spacingMs: 0, maxWaitMs: 1500 }} />
        <PerfOverlay probe={perf} style={styles.perf}
          extra={() => `thermal ${THERMAL_NAMES[thermal.levelJs]}  ${thermal.hz()} Hz  step60 ${thermal.step60.value ? 'on' : 'off'}`} />

        {showResults ? (
          <TouchableOpacity activeOpacity={1} style={styles.resultsScrim} onPress={() => setShowResults(false)}>
            <View style={styles.resultsBox}>
              <ResultsCard score={4860} stars={3} thresholds={{ one: 1500, two: 3000, three: 4500 }} personalBest={4120}
                buckets={[{ label: 'HITS', value: '38' }, { label: 'COMBO', value: 'x14' }, { label: 'BONUS', value: '900' }]}
                bucketValues={[38, 14, 900]} starStepMs={BEAT_MS} rival={{ name: 'Maya', score: 4700 }} reducedMotion={reducedMotion} />
            </View>
          </TouchableOpacity>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

function Bubble({ index, now }: { index: number; now: SharedValue<number> }) {
  const seed = (index * 9301 + 49297) % 233280 / 233280;
  const x = 18 + seed * (SW - 36);
  const r = 4 + (index % 4) * 2.5;
  const cy = useDerivedValue(() => {
    const span = STAGE_H + 40;
    const speed = 0.03 + seed * 0.04;
    return STAGE_H + 20 - ((now.value * speed + seed * span) % span);
  });
  return (
    <Group opacity={0.75}>
      <Circle cx={x} cy={cy} r={r + 2} color="#05346e" opacity={0.35} />
      <Circle cx={x} cy={cy} r={r} color="#ffffff" opacity={0.85} />
    </Group>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#e4f7ff' },
  header: { height: HEADER_H, paddingTop: 48, paddingHorizontal: 16, backgroundColor: '#0768b9', borderBottomWidth: 4,
    borderColor: '#ffffff', flexDirection: 'row', alignItems: 'center' },
  title: { fontFamily: 'Shark', fontSize: 24, color: '#ffffff', marginRight: 10 },
  sub: { fontFamily: 'Knockout', fontSize: 13, color: '#e4f7ff', flex: 1 },
  close: { backgroundColor: '#ffcf3b', borderRadius: 999, borderWidth: 3, borderColor: '#05346e', paddingHorizontal: 12, paddingVertical: 4 },
  closeText: { fontFamily: 'Shark', fontSize: 14, color: '#05346e' },
  stage: { height: STAGE_H, overflow: 'hidden' },
  panel: { marginHorizontal: 16, marginTop: 10, padding: 8, borderRadius: 14, borderWidth: 3, borderColor: '#05346e', backgroundColor: '#ffffff' },
  panelLabel: { fontFamily: 'Knockout', fontSize: 12, color: '#0b3a66', letterSpacing: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: 3 },
  miniChip: { borderRadius: 999, borderWidth: 2, borderColor: '#05346e', paddingHorizontal: 9, paddingVertical: 3, marginRight: 5, marginBottom: 3,
    backgroundColor: '#e4f7ff' },
  miniChipOn: { backgroundColor: '#ffcf3b' },
  miniChipText: { fontFamily: 'Knockout', fontSize: 12, color: '#05346e' },
  busLine: { fontFamily: 'Menlo', fontSize: 11, color: '#05346e', marginBottom: 4 },
  log: { marginTop: 8, marginHorizontal: 16, padding: 8, minHeight: 86, borderRadius: 14, borderWidth: 3, borderColor: '#05346e',
    backgroundColor: '#ffffff' },
  logText: { fontFamily: 'Menlo', fontSize: 11, color: '#3d5f8c' },
  logNew: { color: '#05346e', fontWeight: '700' },
  controls: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 8, paddingHorizontal: 10 },
  chip: { backgroundColor: '#ffcf3b', borderRadius: 999, borderWidth: 3, borderColor: '#05346e', paddingHorizontal: 11,
    paddingVertical: 5, margin: 3 },
  chipText: { fontFamily: 'Shark', fontSize: 13, color: '#05346e' },
  perf: { top: HEADER_H + STAGE_H - 96, left: 8, right: 'auto' },
  resultsScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(191,234,255,0.72)', alignItems: 'center', justifyContent: 'center' },
  resultsBox: { width: '86%' },
});
