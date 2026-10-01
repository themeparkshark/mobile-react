/**
 * JuiceLab: the fourth studio engine bench (dev MiniGameTester), for the
 * pass-5 systems, all through their real code paths:
 *
 *   - On twos: the left star burst re-picks rotation and scale every 83 ms
 *     (Whack v5), the right one is the old smooth spin, side by side.
 *   - Line boil: the target ring is redrawn from 3 offset sets at 12 fps.
 *   - Mesh sprites: Alex's Sharky frame with the v7.1 tail mesh (holding,
 *     sinking, settling, Overdrive), and the Whack pop frame with head-row
 *     follow-through under the v5 caps (6% / 3 deg / 1%).
 *   - Fly-to-score: +150 overshoots, tilts, holds, curves to the header and
 *     the score digit-rolls with a 1.12 squash when it lands.
 *   - Camera presets (default / Whack linear 250 ms / Boss) and the Whack
 *     flash governor (334 ms, 3 per second, merge).
 *   - Beat layers: the Whack v5 escalating kit over the bed, level 0-5.
 *   - Gyro parallax: ocean plates at 0.25x / 0.5x, walk-gated (the simulator
 *     has no gyro, so the tour feeds a slow tilt through `source`).
 *   - Audio route + pan gating, Whack haptic tail cuts, Trivia signatures.
 *
 * `autoplay` runs the scripted tour for the demo video. Dev only.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, LogBox, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Canvas, Group, Image as SkImage, LinearGradient, Rect, Text as SkText, useFont, useImage, vec } from '@shopify/react-native-skia';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { FxStage, type FxStageHandle } from '../fx/FxStage';
import { MeshSprite, useMeshPoints } from '../fx/MeshSprite';
import { BoilRing } from '../fx/BoilRing';
import { useCamera } from '../fx/useCamera';
import { useGameClock } from '../useGameClock';
import { useFeel } from '../feel';
import { CAMERA_PRESETS } from '../core/camera';
import { GOVERNOR_PRESETS, createFxGovernor } from '../core/fxGovernor';
import { EMITTERS } from '../core/particles';
import { SHARKY_TAIL, createMeshGrid, deformRowFollow, deformTailWave } from '../core/mesh';
import { BEAT_LAYER_KITS } from '../core/beatLayers';
import { digitRollAt } from '../core/scoreFx';
import { hapticSignature, HAPTIC_PATTERNS } from '../core/hapticGrammar';
import { isPrivateRoute } from '../core/audioRoute';
import { useBeatLayers } from '../audio/BeatLayers';
import { useAudioRoute } from '../audio/useAudioRoute';
import { useGyroParallax } from '../motion/useGyroParallax';
import { useWalkSense } from '../motion/useWalkSense';
import { GameAudio } from '../audio/GameAudio';
import { registerStudioAudio } from '../audio/studioLibrary';
import { configureHaptics, hapticBusStats, playHaptic, playPattern } from '../Haptics';
import { PerfOverlay, usePerfProbe } from '../perf/PerfOverlay';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';

registerStudioAudio(['whack', 'shared']);

const { width: SW, height: SH } = Dimensions.get('window');
const HEADER_H = 96;
const STAGE_H = Math.round(SH * 0.42);
const POP = 120;
const SWIM = 150;
const WHACK_X = SW * 0.27;
const SWIM_X = SW * 0.7;
const GROUND_Y = STAGE_H * 0.62;
const SCORE_X = SW - 70;
const SCORE_Y = HEADER_H + 22;
const TAIL_STATES = ['holding', 'sinking', 'settling', 'overdrive'] as const;
type TailState = (typeof TAIL_STATES)[number];
type CamPreset = 'default' | 'whack' | 'boss';
type GovPreset = 'default' | 'whack';
const SMOOTH_STARS = { ...EMITTERS.stars, twos: false };

function pick(...names: string[]): string {
  for (const n of names) if (GameAudio.hasCue(n)) return n;
  return names[names.length - 1];
}

export interface JuiceLabProps {
  visible: boolean;
  onClose: () => void;
  autoplay?: boolean;
}

export default function JuiceLab({ visible, onClose, autoplay = false }: JuiceLabProps) {
  const reducedMotion = useReducedGameMotion();
  const fx = useRef<FxStageHandle>(null);
  const perf = usePerfProbe(visible);
  const walk = useWalkSense({ active: visible });
  const route = useAudioRoute();
  const [log, setLog] = useState<string[]>([]);
  const note = useCallback((line: string) => setLog((l) => [line, ...l].slice(0, 5)), []);
  const [camPreset, setCamPreset] = useState<CamPreset>('default');
  const [govPreset, setGovPreset] = useState<GovPreset>('default');
  const [tail, setTail] = useState<TailState>('holding');
  const [level, setLevel] = useState(0);
  const [demoTilt, setDemoTilt] = useState(false);

  const clock = useGameClock({});
  const camera = useCamera({ width: SW, height: STAGE_H, timeScale: clock.fxScale, reducedMotion, walking: walk.walking });
  const governor = useMemo(
    () => createFxGovernor({ ...(govPreset === 'whack' ? GOVERNOR_PRESETS.whack : {}), calm: reducedMotion }),
    [govPreset, reducedMotion],
  );

  // -- Parallax (simulated tilt on the simulator) ------------------------------
  const tiltPitch = useSharedValue(0);
  const tiltRoll = useSharedValue(0);
  const tiltOn = useSharedValue(0);
  const wall = useSharedValue(0);
  useFrameCallback((info) => {
    'worklet';
    wall.value += info.timeSincePreviousFrame ?? 16;
    if (tiltOn.value === 1) {
      tiltRoll.value = Math.sin(wall.value / 900) * 0.3;
      tiltPitch.value = Math.sin(wall.value / 1300) * 0.2;
    }
  }, visible);
  useEffect(() => { tiltOn.value = demoTilt ? 1 : 0; }, [demoTilt, tiltOn]);
  const parallax = useGyroParallax({
    active: visible, enabled: !walk.walking && !reducedMotion,
    source: demoTilt ? { pitch: tiltPitch, roll: tiltRoll } : undefined,
    config: { cutoffHz: 0.6, maxPx: 22 },
  });
  const backT = useDerivedValue(() => [{ translateX: parallax.x.value * 0.25 }, { translateY: parallax.y.value * 0.25 }]);
  const midT = useDerivedValue(() => [{ translateX: parallax.x.value * 0.5 }, { translateY: parallax.y.value * 0.5 }]);

  // -- Mesh sprites ----------------------------------------------------------------
  const swimGrid = useMemo(() => createMeshGrid(4, 12, SWIM, SWIM), []);
  const popGrid = useMemo(() => createMeshGrid(5, 6, POP, POP), []);
  const tailHz = useSharedValue(SHARKY_TAIL.holding.hz);
  const tailAmp = useSharedValue(SHARKY_TAIL.holding.ampPx);
  useEffect(() => {
    tailHz.value = SHARKY_TAIL[tail].hz;
    tailAmp.value = SHARKY_TAIL[tail].ampPx;
  }, [tail, tailHz, tailAmp]);
  const swimPts = useMeshPoints(swimGrid, clock.fxMs, (out, t) => {
    'worklet';
    deformTailWave(swimGrid, out, t, { fromU: 0.6, ampPx: tailAmp.value, hz: tailHz.value, wavelengths: 0.7, axis: 'y', tailAtEnd: true });
  }, reducedMotion);
  const bonkAt = useSharedValue(-1e9);
  const popPts = useMeshPoints(popGrid, clock.fxMs, (out, t) => {
    'worklet';
    const since = t - bonkAt.value;
    const k = since < 0 || since > 900 ? 0 : Math.exp(-since / 180) * Math.cos(since / 55);
    const breathe = Math.sin(t / 700) * 0.01;
    deformRowFollow(popGrid, out, { rows: 2, dx: k * 14, dy: -Math.abs(k) * 3, shearDeg: k * 4, breathe });
  }, reducedMotion);
  const swimBob = useDerivedValue(() => GROUND_Y - SWIM * 0.75 + Math.sin(clock.fxMs.value / 420) * 6);

  // -- Score digit roll ----------------------------------------------------------
  const font = useFont(require('../../../assets/fonts/shark-random-funnyness-2.ttf'), 30);
  const scoreFrom = useSharedValue(0);
  const scoreTo = useSharedValue(0);
  const rollAt = useSharedValue(-1e9);
  const pendingRef = useRef(0);
  const scoreRef = useRef(0);
  const scoreText = useDerivedValue(() => `${digitRollAt(scoreFrom.value, scoreTo.value, wall.value - rollAt.value)[0]}`);
  const scoreT = useDerivedValue(() => {
    const sy = digitRollAt(scoreFrom.value, scoreTo.value, wall.value - rollAt.value)[1];
    return [{ translateX: SCORE_X }, { translateY: 34 }, { scaleX: 2 - sy }, { scaleY: sy }];
  });
  const onFlyUpArrive = useCallback((n: number) => {
    const add = pendingRef.current;
    pendingRef.current = 0;
    scoreFrom.value = scoreRef.current;
    scoreRef.current += add;
    scoreTo.value = scoreRef.current;
    rollAt.value = wall.value;
    void GameAudio.play(pick('fx.coinTick'), { pitch: 7 });
    if (n > 0) playHaptic('tick');
  }, [rollAt, scoreFrom, scoreTo, wall]);

  // -- Feel -------------------------------------------------------------------------
  const feel = useFeel({
    bonk: {
      sfx: pick('wh_bonk', 'fx.hit'), ladder: true, pattern: 'whackQuick', localStop: 60,
      burst: [{ emitter: 'impact' }, { emitter: 'stars', count: 10 }],
      ring: { color: '#ffcf3b', to: 80, ms: 220 }, flash: { peak: 0.22, ms: 60 }, shake: 0.55,
    },
    flicker: { sfx: pick('wh_bonk', 'fx.hit'), ladder: true, flash: { peak: 0.2, ms: 50 }, burst: [{ emitter: 'glints' }] },
  }, { fx, camera, clock, width: SW, calm: reducedMotion, governor });

  const bonk = useCallback((pts = 150) => {
    bonkAt.value = clock.fxMs.value;
    feel('bonk', { x: WHACK_X, y: HEADER_H + GROUND_Y - POP * 0.55, step: 4, slot: 0 });
    pendingRef.current += pts;
    fx.current?.flyUp(`+${pts}`, WHACK_X, HEADER_H + GROUND_Y - POP, { size: 'lg', color: '#ffcf3b', to: { x: SCORE_X + 20, y: SCORE_Y } });
  }, [bonkAt, clock.fxMs, feel]);

  const twosVsSmooth = useCallback(() => {
    note('stars: left on twos (12 fps re-pick), right smooth');
    fx.current?.burst('stars', SW * 0.3, HEADER_H + STAGE_H * 0.25, { count: 10, speed: 0.6 });
    fx.current?.emitDef(SMOOTH_STARS, SW * 0.7, HEADER_H + STAGE_H * 0.25, { count: 10, speed: 0.6 });
  }, [note]);

  const pickCam = useCallback((p: CamPreset) => {
    setCamPreset(p);
    camera.configure(p === 'default' ? {} : CAMERA_PRESETS[p]);
    note(`camera: ${p}${p === 'whack' ? ' (16 pt, 250 ms linear, no cap)' : p === 'boss' ? ' (trauma squared, 1.6/s, no cap)' : ' (120 ms cap)'}`);
  }, [camera, note]);

  const pickGov = useCallback((p: GovPreset) => {
    setGovPreset(p);
    note(p === 'whack' ? 'flash governor: Whack (334 ms, 3/s, merge)' : 'flash governor: default (500 ms, denied = bloom)');
  }, [note]);

  const flicker = useCallback(() => {
    const before = { d: governor.denied, m: governor.merged };
    for (let k = 0; k < 6; k++) setTimeout(() => feel('flicker', { x: WHACK_X + (k - 2.5) * 30, y: HEADER_H + GROUND_Y - 80, step: k }), k * 90);
    setTimeout(() => note(`6 flashes in 450 ms: denied ${governor.denied - before.d}, merged ${governor.merged - before.m}`), 600);
  }, [feel, governor, note]);

  const layers = useBeatLayers('whack', visible);
  const setLayerLevel = useCallback((l: number) => {
    setLevel(l);
    layers.setLevel(l);
    const ids = BEAT_LAYER_KITS.whack.filter((L) => l >= L.level).map((L) => L.id);
    note(`beat layers L${l}: ${ids.length ? ids.join(' + ') : 'bed only'}`);
  }, [layers, note]);

  const panTest = useCallback(() => {
    const cue = pick('wh_bonk', 'fx.hit');
    GameAudio.play(cue, { pan: -0.8 });
    setTimeout(() => GameAudio.play(cue, { pan: 0.8 }), 260);
    note(`route ${route}: pan -0.8 plays as ${GameAudio.effectivePan(-0.8)} (${isPrivateRoute(route) ? 'headphones' : 'speaker: centred'})`);
  }, [note, route]);

  const tailCut = useCallback(() => {
    configureHaptics('whack');
    const before = hapticBusStats().tailCuts;
    playPattern('purrTell', { priority: 5, tell: true });
    setTimeout(() => playPattern('whackQuick', { priority: 8 }), 120);
    setTimeout(() => note(`purr tell, then QUICK at +120 ms: ${hapticBusStats().tailCuts - before} tail cut`), 300);
  }, [note]);

  const trivia = useCallback(() => {
    const c = hapticSignature(HAPTIC_PATTERNS.triviaCorrect);
    const w = hapticSignature(HAPTIC_PATTERNS.triviaWrong);
    playHaptic('triviaCorrect', { priority: 4 });
    setTimeout(() => playHaptic('triviaWrong', { priority: 4 }), 700);
    note(`trivia correct ${c.pulses.join('<')} rising, wrong ${w.pulses.join('')} pulse`);
  }, [note]);

  const nextTail = useCallback(() => {
    setTail((t) => {
      const n = TAIL_STATES[(TAIL_STATES.indexOf(t) + 1) % TAIL_STATES.length];
      note(`tail mesh: ${n} ${SHARKY_TAIL[n].hz} Hz / ${SHARKY_TAIL[n].ampPx}u`);
      return n;
    });
  }, [note]);

  useEffect(() => {
    if (!visible) return undefined;
    void GameAudio.init().then(async () => {
      await GameAudio.preload([pick('wh_bonk', 'fx.hit'), 'fx.coinTick', 'ui.tap', 'fx.firework', 'ui.select', 'fx.whooshRev']);
      GameAudio.music.play(pick('mus_whack_main', 'chris.track1'), 400);
    });
    return () => {
      GameAudio.music.stop(300);
      configureHaptics('default');
    };
  }, [visible]);

  const act = useRef({ bonk, twosVsSmooth, pickCam, pickGov, flicker, setLayerLevel, panTest, tailCut, trivia, nextTail, setDemoTilt });
  act.current = { bonk, twosVsSmooth, pickCam, pickGov, flicker, setLayerLevel, panTest, tailCut, trivia, nextTail, setDemoTilt };
  useEffect(() => {
    if (!visible || !autoplay) return undefined;
    LogBox.ignoreAllLogs(true);
    const a = () => act.current;
    const plan: [number, () => void][] = [
      [1200, () => a().twosVsSmooth()],
      [2600, () => a().twosVsSmooth()],
      [4000, () => a().bonk()],
      [5200, () => a().bonk(300)],
      [6400, () => a().nextTail()],
      [7400, () => a().nextTail()],
      [8400, () => a().nextTail()],
      [9400, () => a().pickCam('whack')],
      [9900, () => a().bonk()],
      [11000, () => a().pickCam('boss')],
      [11500, () => a().bonk(450)],
      [12800, () => a().flicker()],
      [14200, () => a().pickGov('whack')],
      [14600, () => a().flicker()],
      [16000, () => a().setLayerLevel(1)],
      [18000, () => a().setLayerLevel(2)],
      [20000, () => a().setLayerLevel(3)],
      [22000, () => a().setLayerLevel(5)],
      [22400, () => a().setDemoTilt(true)],
      [25500, () => a().setLayerLevel(0)],
      [26000, () => a().tailCut()],
      [27000, () => a().trivia()],
      [28200, () => a().panTest()],
      [29400, () => a().bonk()],
    ];
    const timers = plan.map(([ms, fn]) => setTimeout(fn, ms));
    return () => timers.forEach(clearTimeout);
  }, [visible, autoplay]);

  const back = useImage(require('../../assets/games/sharky/ocean-layer-back.png'));
  const mid = useImage(require('../../assets/games/sharky/ocean-layer-mid.png'));
  const swim = useImage(require('../../assets/games/sharky/shark-swim-1.png'));
  const pop = useImage(require('../../assets/games/whack/shark-pop-1.png'));
  const hole = useImage(require('../../assets/games/whack/hole.png'));
  const ringR = useDerivedValue(() => 64 + Math.sin(clock.fxMs.value / 300) * 4);

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait']}>
      <GestureHandlerRootView style={styles.fill}>
        <View style={styles.header}>
          <Text style={styles.title}>JUICE LAB</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {`cam ${camPreset}  ·  gov ${govPreset}  ·  tail ${tail}  ·  L${level}  ·  ${route}${walk.walking ? '  ·  walking' : ''}`}
          </Text>
          <TouchableOpacity style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.closeText}>CLOSE</Text>
          </TouchableOpacity>
        </View>

        <Animated.View style={[styles.stage, camera.style]}>
          <Canvas style={StyleSheet.absoluteFill}>
            <Rect x={0} y={0} width={SW} height={STAGE_H}>
              <LinearGradient start={vec(0, 0)} end={vec(0, STAGE_H)} colors={['#3db8ff', '#bfeaff']} />
            </Rect>
            {back ? (
              <Group transform={backT}>
                <SkImage image={back} x={-30} y={STAGE_H * 0.18} width={SW + 60} height={STAGE_H * 0.7} fit="cover" opacity={0.85} />
              </Group>
            ) : null}
            {mid ? (
              <Group transform={midT}>
                <SkImage image={mid} x={-40} y={STAGE_H * 0.36} width={SW + 80} height={STAGE_H * 0.66} fit="cover" />
              </Group>
            ) : null}
            {hole ? <SkImage image={hole} x={WHACK_X - POP * 0.8} y={GROUND_Y - 6} width={POP * 1.6} height={POP * 0.6} fit="contain" /> : null}
            <MeshSprite image={pop} grid={popGrid} points={popPts} x={WHACK_X - POP / 2} y={GROUND_Y - POP * 0.78} />
            <BoilRing cx={WHACK_X} cy={GROUND_Y - POP * 0.45} r={ringR} fxMs={clock.fxMs} color="#ffcf3b" strokeWidth={4}
              amp={reducedMotion ? 0 : 1.5} opacity={0.9} />
            <MeshSprite image={swim} grid={swimGrid} points={swimPts} x={SWIM_X - SWIM / 2} y={swimBob} />
          </Canvas>
        </Animated.View>

        {/* HUD: never inside the camera. */}
        <Canvas style={styles.hud} pointerEvents="none">
          {font ? (
            <Group transform={scoreT}>
              <SkText x={-20} y={0} text={scoreText} font={font} color="#05346e" style="stroke" strokeWidth={6} />
              <SkText x={-20} y={0} text={scoreText} font={font} color="#ffffff" />
            </Group>
          ) : null}
        </Canvas>

        <View style={styles.panel}>
          <View style={styles.row}>
            <Text style={styles.panelLabel}>CAMERA</Text>
            {(['default', 'whack', 'boss'] as CamPreset[]).map((p) => (
              <TouchableOpacity key={p} style={[styles.miniChip, camPreset === p && styles.miniChipOn]} onPress={() => pickCam(p)} accessibilityRole="button">
                <Text style={styles.miniChipText}>{p}</Text>
              </TouchableOpacity>
            ))}
            <Text style={styles.panelLabel}>FLASH</Text>
            {(['default', 'whack'] as GovPreset[]).map((p) => (
              <TouchableOpacity key={p} style={[styles.miniChip, govPreset === p && styles.miniChipOn]} onPress={() => pickGov(p)} accessibilityRole="button">
                <Text style={styles.miniChipText}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.row}>
            <Text style={styles.panelLabel}>BEAT LAYERS</Text>
            {[0, 1, 2, 3, 4, 5].map((l) => (
              <TouchableOpacity key={l} style={[styles.miniChip, level === l && styles.miniChipOn]} onPress={() => setLayerLevel(l)} accessibilityRole="button">
                <Text style={styles.miniChipText}>{l === 5 ? 'fever' : `L${l}`}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.log}>
          {log.map((l, i) => <Text key={`${i}-${l}`} style={[styles.logText, i === 0 && styles.logNew]}>{l}</Text>)}
        </View>

        <View style={styles.controls}>
          {([
            ['Bonk', () => bonk()], ['Twos vs smooth', twosVsSmooth], ['Tail state', nextTail], ['Flash x6', flicker],
            ['Tilt', () => setDemoTilt((v) => !v)], ['Pan L/R', panTest], ['Tail cut', tailCut], ['Trivia feel', trivia],
          ] as [string, () => void][]).map(([label, fn]) => (
            <TouchableOpacity key={label} style={styles.chip} onPress={fn} accessibilityRole="button">
              <Text style={styles.chipText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <FxStage ref={fx} width={SW} height={SH} timeScale={clock.fxScale} reducedMotion={reducedMotion}
          onFlyUpArrive={onFlyUpArrive} style={StyleSheet.absoluteFill} />
        <PerfOverlay probe={perf} style={styles.perf} />
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#e4f7ff' },
  header: { height: HEADER_H, paddingTop: 48, paddingHorizontal: 16, backgroundColor: '#0768b9', borderBottomWidth: 4,
    borderColor: '#ffffff', flexDirection: 'row', alignItems: 'center' },
  title: { fontFamily: 'Shark', fontSize: 24, color: '#ffffff', marginRight: 10 },
  sub: { fontFamily: 'Knockout', fontSize: 12, color: '#e4f7ff', flex: 1 },
  close: { backgroundColor: '#ffcf3b', borderRadius: 999, borderWidth: 3, borderColor: '#05346e', paddingHorizontal: 12, paddingVertical: 4 },
  closeText: { fontFamily: 'Shark', fontSize: 14, color: '#05346e' },
  stage: { height: STAGE_H, overflow: 'hidden' },
  hud: { position: 'absolute', left: 0, top: HEADER_H, width: SW, height: 60 },
  panel: { marginHorizontal: 16, marginTop: 10, padding: 8, borderRadius: 14, borderWidth: 3, borderColor: '#05346e', backgroundColor: '#ffffff' },
  panelLabel: { fontFamily: 'Knockout', fontSize: 12, color: '#0b3a66', letterSpacing: 1, marginRight: 6, alignSelf: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: 3, alignItems: 'center' },
  miniChip: { borderRadius: 999, borderWidth: 2, borderColor: '#05346e', paddingHorizontal: 9, paddingVertical: 3, marginRight: 5, marginBottom: 3,
    backgroundColor: '#e4f7ff' },
  miniChipOn: { backgroundColor: '#ffcf3b' },
  miniChipText: { fontFamily: 'Knockout', fontSize: 12, color: '#05346e' },
  log: { marginTop: 8, marginHorizontal: 16, padding: 8, minHeight: 86, borderRadius: 14, borderWidth: 3, borderColor: '#05346e',
    backgroundColor: '#ffffff' },
  logText: { fontFamily: 'Menlo', fontSize: 11, color: '#3d5f8c' },
  logNew: { color: '#05346e', fontWeight: '700' },
  controls: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 8, paddingHorizontal: 10 },
  chip: { backgroundColor: '#ffcf3b', borderRadius: 999, borderWidth: 3, borderColor: '#05346e', paddingHorizontal: 11,
    paddingVertical: 5, margin: 3 },
  chipText: { fontFamily: 'Shark', fontSize: 13, color: '#05346e' },
  perf: { top: HEADER_H + STAGE_H - 96, left: 8, right: 'auto' },
});
