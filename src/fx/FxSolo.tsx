import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { useFxMomentCue } from './FxLayers';
import { FxBox, useFxClock, useFxKick, useFxRunning } from './FxStage';
import { FxKey, FxLod, coverBox, focusBox } from './registry';
import { GhostLanternFront } from './rigs/GhostLantern';
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
export const FxSceneBackdrop = memo(function FxSceneBackdrop({ fxKey, still, lod = 'full', sound = false }: {
  readonly fxKey: FxKey; readonly still: boolean; readonly lod?: FxLod;
  /** Stages only: the finale's pop and haptic. */
  readonly sound?: boolean;
}) {
  const reduced = useReducedGameMotion();
  const level: FxLod = still || reduced ? 'still' : lod;
  const t = useFxClock(useFxRunning(level));
  const kick = useFxKick();
  const cue = useFxMomentCue(sound);
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
  const t = useFxClock(running);
  const kick = useFxKick();
  useEffect(() => {
    if (running) kick.value = t.value;
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
      {fxKey === 'ghost_lantern' && <GhostLanternFront {...props} />}
      {fxKey === 'midway_fireworks' && <MidwayFireworksScene {...props} box={{ x: 0, y: 0, w: size, h: size }} />}
    </View>
  );
});
