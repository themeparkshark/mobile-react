/**
 * The screen-space half of Fin-ister Nights, drawn above the map in one Skia
 * canvas: two drifting fog tiles with parallax as the player walks, the moon
 * with a cloud strip, and a soft lightning flash with distant thunder after
 * it. Also runs the ambient sound bed and the season intro cinematic.
 * Pure decoration: never takes touches. Everything reads the living map's
 * ambient clock, so it pauses with the map, the app and Reduce Motion.
 */
import {
  BlurMask, Canvas, Circle, Group, Image as SkImage, ImageShader, Mask, Path, RadialGradient, Rect, Skia, useImage, vec,
} from '@shopify/react-native-skia';
import { memo, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import {
  Easing, ReduceMotion, runOnJS, useDerivedValue, useFrameCallback, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { HeadingContext } from '../../../context/LocationProvider';
import { queueHaptic } from '../../../gamekit/Haptics';
import { CLOUDS_H, CLOUDS_W, FOG_TILE, FRIGHT_ART, NIGHT } from './frightArt';
import { FRIGHT_SOUNDS, playFrightSfx, useFrightSoundBed } from './frightAudio';
import { frameStats } from './frightBudget';
import { distanceMeters, pointsPerMeter, validPoint } from './geo';
import { flashLevel, startThunder, stepThunder, type ThunderState } from './thunder';
import type { FrightMapInput } from './types';
import { frightIntro, useFrightState } from './useFrightState';

export const INTRO_MS = 4000;
const INTRO_FLASH_MS = 1400;
const BOLT = Skia.Path.MakeFromSVGString('M0 0 L-7 16 L-1 16 L-9 34 L6 12 L0 12 L6 0 Z')!;

function playThunder(volume: number) {
  playFrightSfx('fright-thunder', FRIGHT_SOUNDS.thunder, volume, 7000);
  queueHaptic('tapLight');
}

export const FrightMapLayer = memo(function FrightMapLayer({ input, width, height, zoom }: {
  readonly input: FrightMapInput;
  readonly width: number;
  readonly height: number;
  readonly zoom: number;
}) {
  const st = useFrightState(input);
  const { alive, caps, visible, moving, effectsOn } = st;
  const { clock } = alive;
  const { heading } = useContext(HeadingContext);
  const fogFar = useImage(FRIGHT_ART.fogFar);
  const fogNear = useImage(FRIGHT_ART.fogNear);
  const clouds = useImage(FRIGHT_ART.moonClouds);
  const player = validPoint(input.player) ? input.player : null;

  // Blend: fog fades in over 4 s, steps toward each new intensity (the after-fade).
  const fog = useSharedValue(0);
  const fogTarget = caps.frightFog > 0 ? visible : 0;
  useEffect(() => {
    fog.value = withTiming(fogTarget, { duration: 4000, reduceMotion: ReduceMotion.Never });
  }, [fogTarget, fog]);

  // Parallax: the fog slides a fraction of the map's motion as the player walks.
  const anchor = useRef<{ latitude: number; longitude: number } | null>(null);
  const px = useSharedValue(0);
  const py = useSharedValue(0);
  useEffect(() => {
    if (!player) return;
    if (!anchor.current || distanceMeters(anchor.current, player) > 2000) anchor.current = player;
    const ppm = pointsPerMeter(zoom, player.latitude);
    const east = (player.longitude - anchor.current.longitude) * 111_320 * Math.cos(player.latitude * Math.PI / 180);
    const north = (player.latitude - anchor.current.latitude) * 111_320;
    const h = ((heading ?? 0) * Math.PI) / 180;
    const x = (east * Math.cos(h) - north * Math.sin(h)) * ppm;
    const y = -(east * Math.sin(h) + north * Math.cos(h)) * ppm;
    const duration = moving ? 900 : 0;
    px.value = withTiming(-x, { duration });
    py.value = withTiming(-y, { duration });
  }, [player?.latitude, player?.longitude, zoom, heading, moving]); // eslint-disable-line react-hooks/exhaustive-deps

  const farTransform = useDerivedValue(() => [
    { translateX: (((px.value * 0.25 - clock.value * 4) % FOG_TILE) + FOG_TILE) % FOG_TILE - FOG_TILE },
    { translateY: (((py.value * 0.25) % FOG_TILE) + FOG_TILE) % FOG_TILE - FOG_TILE },
  ]);
  const nearTransform = useDerivedValue(() => [
    { translateX: (((px.value * 0.5 - clock.value * 9) % FOG_TILE) + FOG_TILE) % FOG_TILE - FOG_TILE },
    { translateY: (((py.value * 0.5 + 180) % FOG_TILE) + FOG_TILE) % FOG_TILE - FOG_TILE },
  ]);
  const farOpacity = useDerivedValue(() => 0.75 * fog.value);
  const nearOpacity = useDerivedValue(() => fog.value);
  const cloudX = useDerivedValue(() => ((clock.value * 3 + 120) % (width + CLOUDS_W)) - CLOUDS_W);
  const moonX = Math.round(width * 0.2);
  const moonY = Math.round(height * 0.15);

  // Lightning: the flash rides the ambient clock; thunder follows 0.6 to 1.8 s later.
  const flashAt = useSharedValue(-1000);
  const flashStrength = useSharedValue(1);
  const flash = useDerivedValue(() => flashLevel(clock.value - flashAt.value, flashStrength.value));
  const bolt = useDerivedValue(() => Math.min(0.75, flash.value * 4.5));
  const thunderOn = effectsOn && caps.frightBolts > 0 && moving && !st.showLive;
  const thunder = useRef<ThunderState | null>(null);
  useEffect(() => {
    if (!thunderOn) return;
    // Each time thunder turns on it waits out the first 20 s again, and keeps the 90 s gap since the last strike.
    const fresh = startThunder(Date.now(), (Date.now() / 1000) | 0);
    thunder.current = thunder.current ? { ...fresh, lastStrikeAt: thunder.current.lastStrikeAt } : fresh;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const tick = setInterval(() => {
      if (!thunder.current) return;
      const { state, strike } = stepThunder(thunder.current, Date.now(), false);
      thunder.current = state;
      if (!strike) return;
      flashStrength.value = strike.strength;
      flashAt.value = clock.value;
      timers.push(setTimeout(() => playThunder(0.32), strike.thunderDelayMs));
    }, 2000);
    return () => { clearInterval(tick); timers.forEach(clearTimeout); };
  }, [thunderOn, clock, flashAt, flashStrength]);

  // Sound bed: only with the mode ON, Spooky effects on, phones up, map on screen, app open.
  const nearLantern = useMemo(() => !!player && input.tonight.spots.some(s => s.kind === 'haunt' && s.status === 'OPERATING' &&
    distanceMeters(player, s) < 35), [player?.latitude, player?.longitude, input.tonight.spots]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrightSoundBed(effectsOn && visible > 0, nearLantern);

  // Season intro: night drops fast, fog rolls in from the edges, one flash and
  // thunder, lanterns light one by one. Reduce Motion: a plain fade, no flash.
  const [introOn, setIntroOn] = useState(false);
  const doneRef = useRef(input.onCinematicDone);
  doneRef.current = input.onCinematicDone;
  const effectsRef = useRef(effectsOn);
  effectsRef.current = effectsOn;
  useEffect(() => {
    if (input.cinematic !== 'intro') return;
    setIntroOn(true);
    frightIntro.value = 0;
    frightIntro.value = withTiming(1, { duration: INTRO_MS, easing: Easing.linear, reduceMotion: ReduceMotion.Never });
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (!alive.reducedMotion && st.tier !== 'calm') {
      timers.push(setTimeout(() => {
        flashStrength.value = 1;
        flashAt.value = clock.value;
        if (effectsRef.current) timers.push(setTimeout(() => playThunder(0.36), 900));
      }, INTRO_FLASH_MS));
    }
    timers.push(setTimeout(() => {
      setIntroOn(false);
      doneRef.current?.();
    }, INTRO_MS + 200));
    return () => {
      timers.forEach(clearTimeout);
      frightIntro.value = 1;
    };
  }, [input.cinematic]); // eslint-disable-line react-hooks/exhaustive-deps
  const hole = useDerivedValue(() => Math.max(0, 1 - frightIntro.value * 1.6));
  const maskPositions = useDerivedValue(() => [hole.value * 0.7, Math.min(1, hole.value * 0.7 + 0.3)]);
  const diag = Math.hypot(width, height) / 2;

  if (visible <= 0 || width <= 0 || height <= 0) return null;
  const showFog = caps.frightFog > 0;
  const fogLayers = (
    <Group>
      {fogFar && caps.frightFog >= 3 && (
        <Rect x={0} y={0} width={width} height={height} opacity={farOpacity}>
          <ImageShader image={fogFar} tx="repeat" ty="repeat" fit="none" rect={{ x: 0, y: 0, width: FOG_TILE, height: FOG_TILE }} transform={farTransform} />
        </Rect>
      )}
      {fogNear && (
        <Rect x={0} y={0} width={width} height={height} opacity={nearOpacity}>
          <ImageShader image={fogNear} tx="repeat" ty="repeat" fit="none" rect={{ x: 0, y: 0, width: FOG_TILE, height: FOG_TILE }} transform={nearTransform} />
        </Rect>
      )}
    </Group>
  );
  return (
    <>
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* Moon and its cloud strip. */}
        <Group opacity={0.85 * visible}>
          <Circle cx={moonX} cy={moonY} r={40} opacity={0.35}>
            <RadialGradient c={vec(moonX, moonY)} r={40} colors={[NIGHT.moon, `${NIGHT.moon}00`]} />
          </Circle>
          <Circle cx={moonX} cy={moonY} r={18} color={NIGHT.moon} />
          <Circle cx={moonX - 5} cy={moonY - 4} r={3.5} color="#F1DC92" />
          <Circle cx={moonX + 6} cy={moonY + 5} r={2.5} color="#F1DC92" />
          {clouds && showFog && (
            <Group transform={[{ translateY: moonY - CLOUDS_H * 0.45 }]}>
              <SkImage image={clouds} x={cloudX} y={0} width={CLOUDS_W} height={CLOUDS_H} fit="fill" opacity={0.85} />
            </Group>
          )}
        </Group>
        {showFog && (introOn ? (
          // Fog rolls in from the edges: the clear middle closes as the intro runs.
          <Mask mode="alpha" mask={
            <Rect x={0} y={0} width={width} height={height}>
              <RadialGradient c={vec(width / 2, height / 2)} r={diag} colors={['rgba(0,0,0,0)', 'rgba(0,0,0,1)']} positions={maskPositions} />
            </Rect>
          }>{fogLayers}</Mask>
        ) : fogLayers)}
        {/* Lightning: a soft violet-white flash and a small bolt by the moon. */}
        {caps.frightBolts > 0 && (
          <Group>
            <Rect x={0} y={0} width={width} height={height} color={NIGHT.fogLight} opacity={flash} />
            <Group transform={[{ translateX: moonX + 46 }, { translateY: moonY + 8 }]} opacity={bolt}>
              <Path path={BOLT} color={NIGHT.moon}><BlurMask blur={2} style="solid" /></Path>
            </Group>
          </Group>
        )}
      </Canvas>
      {__DEV__ && process.env.EXPO_PUBLIC_FRIGHT_PROFILE === '1' && <FrightPerfProbe tier={st.tier} />}
    </>
  );
});

/**
 * Development only (EXPO_PUBLIC_FRIGHT_PROFILE=1): UI-thread frame intervals
 * while the fright layer is mounted, logged as average and p95 every 5 s.
 */
function FrightPerfProbe({ tier }: { readonly tier: string }) {
  const samples = useSharedValue<number[]>([]);
  const log = (values: number[]) => {
    const s = frameStats(values);
    console.log(`[fright-perf] tier=${tier} frames=${s.n} avg=${s.avg.toFixed(2)}ms p95=${s.p95.toFixed(2)}ms`);
  };
  useFrameCallback(info => {
    'worklet';
    const dt = info.timeSincePreviousFrame;
    if (dt === null || dt <= 0 || dt > 250) return;
    const next = samples.value;
    next.push(dt);
    if (next.length >= 300) {
      runOnJS(log)(next.slice());
      samples.value = [];
    } else {
      samples.value = next;
    }
  }, true);
  return null;
}
