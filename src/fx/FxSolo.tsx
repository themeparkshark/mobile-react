import { memo, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { useFxMomentCue } from './FxLayers';
import { FxBox, useFxClock, useFxKick, useFxRunning } from './FxStage';
import { FX_KEYS, FX_MOMENT, FxKey, FxLod, coverBox, focusBox } from './registry';
import { Image } from 'expo-image';
import { CLASSIC_NO_EYE, SHARK_EYES } from '../helpers/wardrobe';
import { GhostLanternBack, GhostLanternFront } from './rigs/GhostLantern';
import { JetpackFront } from './rigs/Jetpack';
import { MidwayFireworksScene } from './rigs/MidwayFireworks';
import { PlasmaBladeFront } from './rigs/PlasmaBlade';
import { ReefHaloBack, ReefHaloFront } from './rigs/ReefHalo';
import { SaucerFront } from './rigs/Saucer';

/**
 * Rigs on their own, with their own clock: shop tiles (the item alone,
 * zoomed to fill the tile) and stage backdrops (an animated scene behind a
 * try-on). See secret-shop/DESIGN.md 6 and 8.2. Both read Reduce Motion
 * themselves, so no caller can forget it.
 */

/** An animated scene as a stage backdrop (cover-fitted like any backdrop). */
export const FxSceneBackdrop = memo(function FxSceneBackdrop({ fxKey, still, lod = 'full', sound = false, play, startDelay = 0 }: {
  readonly fxKey: FxKey; readonly still: boolean; readonly lod?: FxLod;
  /** Stages only: the finale's pop and haptic. */
  readonly sound?: boolean;
  /** Replay requests from the stage (a tap on the shark, or the unlock after a buy). */
  readonly play?: { n: number; kind: 'tap' | 'unlock' } | null;
  /** Hold the first finale this long (the try-on sheet sliding in). */
  readonly startDelay?: number;
}) {
  const reduced = useReducedGameMotion();
  const level: FxLod = still || reduced ? 'still' : lod;
  const running = useFxRunning(level);
  const t = useFxClock(running, -startDelay);
  const kick = useFxKick();
  const { cue, play: playCue, touch } = useFxMomentCue(sound);
  const lastTap = useRef(-1e9);
  useEffect(() => {
    if (!play || !running) return;
    const { ms, cue: name } = FX_MOMENT[fxKey];
    if (play.kind === 'tap') {
      if (Date.now() - lastTap.current < ms * 0.6) return;
      lastTap.current = Date.now();
      touch();
      kick.value = t.value;
      playCue(name, true);
      return;
    }
    // The Secret unlock after a buy: after the landing settles, the finale twice, sound without a second haptic.
    touch();
    kick.value = t.value + 450;
    const a = setTimeout(() => playCue(name, false), 450);
    const b = setTimeout(() => { kick.value = t.value; playCue(name, false); }, 450 + ms * 0.75);
    return () => { clearTimeout(a); clearTimeout(b); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play?.n]);
  if (fxKey !== 'midway_fireworks') return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <FxBox>{({ width, height }) => <MidwayFireworksScene t={t} kick={kick} cue={cue} box={coverBox(width, height)} lod={level} />}</FxBox>
    </View>
  );
});

/**
 * The item alone, animated at tile LOD, filling a size x size box. It plays
 * its moment each time it starts running (scrolled into view, the shop
 * opening, the try-on closing), then idles on its loop.
 */
export const FxTileArt = memo(function FxTileArt({ fxKey, size, still }: {
  readonly fxKey: FxKey; readonly size: number; readonly still: boolean;
}) {
  const reduced = useReducedGameMotion();
  const lod: FxLod = still || reduced ? 'still' : 'lite';
  const running = useFxRunning(lod);
  const t = useFxClock(running, 0, 2);
  const kick = useFxKick();
  useEffect(() => {
    // Staggered by piece, so tiles waking together read as a ripple, not one synchronized burst.
    if (running) kick.value = t.value + (FX_KEYS.indexOf(fxKey) % 4) * 130;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
  const box = focusBox(fxKey, size);
  const props = { t, kick, box, lod };
  return (
    // Clipped to the art box, so a beam or a spark never runs over the tile's name and price.
    <View pointerEvents="none" style={{ width: size, height: size, overflow: 'hidden',
      borderRadius: fxKey === 'midway_fireworks' ? 14 : 0 }}>
      {fxKey === 'jetpack' && <JetpackFront {...props} />}
      {fxKey === 'plasma_blade' && <PlasmaBladeFront {...props} />}
      {fxKey === 'reef_halo' && <><ReefHaloBack {...props} /><ReefHaloFront {...props} /></>}
      {fxKey === 'saucer' && <SaucerFront {...props} />}
      {fxKey === 'ghost_lantern' && <><GhostLanternBack {...props} /><GhostLanternFront {...props} /></>}
      {fxKey === 'midway_fireworks' && <MidwayFireworksScene {...props} box={{ x: 0, y: 0, w: size, h: size }} />}
      {/* A scene is a backdrop: a small shark in front says "your shark goes here" (kids UX round 2). */}
      {fxKey === 'midway_fireworks' && (
        <View style={{ position: 'absolute', left: size * 0.26, top: size * 0.3, width: size * 0.5, height: size * 0.5 * (1530 / 1353) }}>
          <Image source={CLASSIC_NO_EYE} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory" />
          <Image source={SHARK_EYES} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory" />
        </View>
      )}
    </View>
  );
});
