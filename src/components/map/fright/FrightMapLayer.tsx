/**
 * The screen-space half of Fin-ister Nights, drawn above the map in one Skia
 * canvas: two drifting fog tiles with parallax as the player walks, the moon
 * with a cloud strip, and a soft lightning flash with distant thunder after
 * it. Also runs the ambient sound bed and the season intro cinematic.
 * Pure decoration: never takes touches. Everything reads the living map's
 * ambient clock, so it pauses with the map, the app and Reduce Motion.
 */
import {
  BlurMask, Canvas, Circle, Group, Image as SkImage, ImageShader, Mask, Path, RadialGradient, Rect, Skia, vec, type SkImage as SkImageType,
} from '@shopify/react-native-skia';
import { memo, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import {
  Easing, ReduceMotion, runOnJS, useDerivedValue, useFrameCallback, useSharedValue, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { HeadingContext } from '../../../context/LocationProvider';
import { queueHaptic } from '../../../gamekit/Haptics';
import { CLOUDS_H, CLOUDS_W, FOG_TILE, FRIGHT_ART, NIGHT } from './frightArt';
import { frightEvents } from './events';
import { useFrightImage, useRemoteImage } from './useFrightImage';
import { FRIGHT_SOUNDS, playFrightSfx, useFrightSoundBed } from './frightAudio';
import { ambienceOn, frameStats } from './frightBudget';
import { distanceMeters, pointsPerMeter, validPoint } from './geo';
import { flashLevel, startThunder, stepThunder, type ThunderState } from './thunder';
import type { FrightMapInput } from './types';
import { frightIntro, introStep, useFrightState } from './useFrightState';

export const INTRO_MS = 4000;
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
  const assets = input.tonight.assets ?? null;
  const fogFar = useFrightImage(assets?.fog_night?.fog_far, FRIGHT_ART.fogFar);
  const fogNear = useFrightImage(assets?.fog_night?.fog_near, FRIGHT_ART.fogNear);
  const clouds = useFrightImage(assets?.ambient?.clouds?.file, FRIGHT_ART.moonClouds);
  const moon = useRemoteImage(assets?.ambient?.moon?.file);
  const boltAsset = assets?.ambient?.lightning ?? null;
  const boltSheet = useRemoteImage(boltAsset?.file);
  // MAP_FX_SPEC tiers: full far + near drifting, lite far only, calm one still far tile; clouds move in full only.
  const full = st.tier === 'full';
  const lite = st.tier === 'lite';
  const player = validPoint(input.player) ? input.player : null;

  // Blend: fog fades in over 4 s, steps toward each new intensity (the after-fade).
  const fog = useSharedValue(0);
  const fogTarget = caps.frightFog > 0 ? visible : visible * 0.7;
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
  const moonX = Math.round(width * 0.66); // top right, clear of the map buttons
  const moonY = Math.round(height * 0.15);

  // Lightning: the flash rides the ambient clock; thunder follows 0.6 to 1.8 s later.
  const flashAt = useSharedValue(-1000);
  const flashStrength = useSharedValue(1);
  const flash = useDerivedValue(() => flashLevel(clock.value - flashAt.value, flashStrength.value, lite));
  const bolt = useDerivedValue(() => Math.min(0.85, flash.value * 4));
  // The bolt sprite: 6 frames at 20 fps from the flash.
  const boltFrames = boltAsset?.rows?.[0] ?? 6;
  const boltFrame = useDerivedValue(() => Math.max(0, Math.min(boltFrames - 1, Math.floor((clock.value - flashAt.value) * 20))));
  const boltShown = useDerivedValue<number>(() => {
    const age = clock.value - flashAt.value;
    return age >= 0 && age < boltFrames / 20 ? 1 : 0;
  });
  const boltRow = useSharedValue(0);
  const boltX = useSharedValue(width * 0.6);
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
      // A strike is an event: with 2 already on screen it waits 2 to 5 s (once).
      const fire = () => {
        flashStrength.value = strike.strength;
        boltX.value = width * (0.15 + Math.random() * 0.7);
        flashAt.value = clock.value;
        timers.push(setTimeout(() => playThunder(0.32), strike.thunderDelayMs));
      };
      if (frightEvents.tryStart('bolt', Date.now(), 1500)) fire();
      else timers.push(setTimeout(() => { if (frightEvents.tryStart('bolt', Date.now(), 1500)) fire(); }, 2000 + Math.random() * 3000));
    }, 2000);
    return () => { clearInterval(tick); timers.forEach(clearTimeout); };
  }, [thunderOn, clock, flashAt, flashStrength]);

  // Sound bed: only with the mode ON, Spooky effects on, phones up, map on screen, app open.
  const nearLantern = useMemo(() => !!player && input.tonight.spots.some(s => s.kind === 'haunt' && s.status === 'OPERATING' &&
    distanceMeters(player, s) < 35), [player?.latitude, player?.longitude, input.tonight.spots]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrightSoundBed(ambienceOn(input, effectsOn) && visible > 0, nearLantern);

  // Season intro (one thunder only: the tutorial modal plays it). While the
  // intro runs the map stays quiet with the haunts unlit: no flash, no
  // thunder. When it ends the haunts light one by one, 120 ms apart.
  const doneRef = useRef(input.onCinematicDone);
  doneRef.current = input.onCinematicDone;
  const prevCinematic = useRef<FrightMapInput['cinematic']>(null);
  useEffect(() => {
    const step = introStep(prevCinematic.current ?? null, input.cinematic ?? null);
    prevCinematic.current = input.cinematic ?? null;
    if (step === 'hold') {
      frightIntro.value = 0;
      // Fallback: report the intro done if nothing else ends it.
      const timer = setTimeout(() => doneRef.current?.(), INTRO_MS + 200);
      return () => clearTimeout(timer);
    }
    if (step === 'light') {
      frightIntro.value = 0.5;
      frightIntro.value = withTiming(1, { duration: 2000, easing: Easing.linear, reduceMotion: ReduceMotion.Never });
    }
    return undefined;
  }, [input.cinematic]);
  useEffect(() => () => { frightIntro.value = 1; }, []);

  if (visible <= 0 || width <= 0 || height <= 0) return null;
  const fogLayers = (
    <Group>
      {fogFar && (
        <Rect x={0} y={0} width={width} height={height} opacity={farOpacity}>
          <ImageShader image={fogFar} tx="repeat" ty="repeat" fit="none" rect={{ x: 0, y: 0, width: FOG_TILE, height: FOG_TILE }} transform={farTransform} />
        </Rect>
      )}
      {fogNear && full && (
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
          {moon ? <SkImage image={moon} x={moonX - 24} y={moonY - 24} width={48} height={48} fit="contain" /> : (
            <Group>
              <Circle cx={moonX} cy={moonY} r={18} color={NIGHT.moon} />
              <Circle cx={moonX - 5} cy={moonY - 4} r={3.5} color="#F1DC92" />
              <Circle cx={moonX + 6} cy={moonY + 5} r={2.5} color="#F1DC92" />
            </Group>
          )}
          {clouds && full && (
            <Group transform={[{ translateY: moonY - CLOUDS_H * 0.45 }]}>
              <SkImage image={clouds} x={cloudX} y={0} width={CLOUDS_W} height={CLOUDS_H} fit="fill" opacity={0.85} />
            </Group>
          )}
        </Group>
        {fogLayers}
        {/* Lightning: a soft violet-white flash and a small bolt by the moon. */}
        {caps.frightBolts > 0 && (
          <Group>
            <Rect x={0} y={0} width={width} height={height} color={NIGHT.fogLight} opacity={flash} />
            {boltSheet && boltAsset?.frame
              ? <BoltSprite image={boltSheet} fw={boltAsset.frame[0]} fh={boltAsset.frame[1]} frame={boltFrame} row={boltRow} x={boltX} shown={boltShown} />
              : (
                <Group transform={[{ translateX: moonX + 46 }, { translateY: moonY + 8 }]} opacity={bolt}>
                  <Path path={BOLT} color={NIGHT.moon}><BlurMask blur={2} style="solid" /></Path>
                </Group>
              )}
          </Group>
        )}
      </Canvas>
      {__DEV__ && process.env.EXPO_PUBLIC_FRIGHT_PROFILE === '1' && <FrightPerfProbe tier={st.tier} />}
    </>
  );
});

/** The lightning sprite at its strike x in the top third (drawn at half pixel size). */
function BoltSprite({ image, fw, fh, frame, row, x, shown }: {
  image: SkImageType; fw: number; fh: number; frame: SharedValue<number>; row: SharedValue<number>; x: SharedValue<number>; shown: SharedValue<number>;
}) {
  const w = fw / 2;
  const h = fh / 2;
  const clip = useDerivedValue(() => Skia.XYWHRect(x.value - w / 2, 8, w, h));
  const slide = useDerivedValue(() => [{ translateX: x.value - w / 2 - frame.value * w }, { translateY: 8 - row.value * h }]);
  return (
    <Group clip={clip} opacity={shown}>
      <Group transform={slide}><SkImage image={image} x={0} y={0} width={image.width() / 2} height={image.height() / 2} fit="fill" /></Group>
    </Group>
  );
}

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
