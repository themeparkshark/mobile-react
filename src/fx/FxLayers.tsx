import { useContext, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import { FxBox, RigProps } from './FxStage';
import { FxKey, FxLod, WornFx, coverBox, containBox, wornFx } from './registry';
export { wornFx };
import { GhostLanternFront } from './rigs/GhostLantern';
import { JetpackFront, jetpackFloat } from './rigs/Jetpack';
import { MidwayFireworksScene } from './rigs/MidwayFireworks';
import { PlasmaBladeFront } from './rigs/PlasmaBlade';
import { ReefHaloBack, ReefHaloFront } from './rigs/ReefHalo';
import { SaucerFront } from './rigs/Saucer';

type Rig = (props: RigProps) => JSX.Element;

const BACK: Partial<Record<FxKey, Rig>> = { reef_halo: ReefHaloBack };
const FRONT: Partial<Record<FxKey, Rig>> = {
  jetpack: JetpackFront,
  plasma_blade: PlasmaBladeFront,
  reef_halo: ReefHaloFront,
  saucer: SaucerFront,
  ghost_lantern: GhostLanternFront,
};
const SCENE: Partial<Record<FxKey, Rig>> = { midway_fireworks: MidwayFireworksScene };

export type { WornFx } from './registry';

/** The rig layers for one side of the shark, laid out on the paper canvas inside this box. */
export function FxRigLayers({ fx, side, t, lod }: { fx: WornFx; side: 'back' | 'front'; t: SharedValue<number>; lod: FxLod }) {
  const table = side === 'back' ? BACK : FRONT;
  const rigs = fx.rigs.filter(r => !!table[r.key]);
  if (!rigs.length) return null;
  return (
    <FxBox>
      {({ width, height }) => {
        const box = containBox(width, height);
        return rigs.map(({ slot, key }) => {
          const Rig = table[key]!;
          return <Rig key={`${side}-${slot}-${key}`} t={t} box={box} lod={lod} />;
        });
      }}
    </FxBox>
  );
}

/** The animated backdrop, cover-fitted like every backdrop. */
export function FxScene({ fx, t, lod }: { fx: WornFx; t: SharedValue<number>; lod: FxLod }) {
  if (!fx.scene) return null;
  const Scene = SCENE[fx.scene]!;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <FxBox>{({ width, height }) => <Scene t={t} box={coverBox(width, height)} lod={lod} />}</FxBox>
    </View>
  );
}

/** Lifts the shark for floating rigs. A plain View when nothing floats. */
export function FxFloat({ fx, t, height, children }: { fx: WornFx; t: SharedValue<number>; height: number; children: React.ReactNode }) {
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: fx.floats ? jetpackFloat(t.value, height) : 0 }] }));
  return <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, style]}>{children}</Animated.View>;
}

/** The contact shadow shrinks and fades as the shark rises. */
export function useFloatShadowStyle(fx: WornFx, t: SharedValue<number>, height: number) {
  return useAnimatedStyle(() => {
    if (!fx.floats || height <= 0) return { opacity: 1, transform: [{ scale: 1 }] };
    const lift = -jetpackFloat(t.value, height) / height; // 0.032 .. 0.148
    return { opacity: Math.max(0.25, 0.8 - lift * 3.5), transform: [{ scale: Math.max(0.5, 0.95 - lift * 2.8) }] };
  });
}

/** Equip cues (DESIGN.md 7): Chris's SFX at a rate per rig. */
export const FX_EQUIP_SOUNDS: Record<FxKey, { file: number; rate: number; volume: number }> = {
  jetpack: { file: require('../../assets/sounds/whoosh.mp3'), rate: 0.8, volume: 0.9 },
  plasma_blade: { file: require('../../assets/sounds/whoosh.mp3'), rate: 1.6, volume: 0.8 },
  reef_halo: { file: require('../../assets/sounds/inventory_item_tap.mp3'), rate: 1.5, volume: 0.8 },
  saucer: { file: require('../../assets/sounds/reveal.mp3'), rate: 1.4, volume: 0.7 },
  midway_fireworks: { file: require('../../assets/sounds/firework_pop.mp3'), rate: 1, volume: 0.8 },
  ghost_lantern: { file: require('../../assets/sounds/reveal.mp3'), rate: 0.8, volume: 0.7 },
};

/**
 * Plays a rig's equip cue when it is put on after the stage mounted (never
 * for what was already worn, so opening a screen is silent).
 */
export function useFxEquipSound(fx: WornFx, enabled: boolean) {
  const { playSound } = useContext(SoundEffectContext);
  const seen = useRef<Set<string> | null>(null);
  const keys = [fx.scene, ...fx.rigs.map(r => r.key)].filter((k): k is FxKey => !!k);
  const signature = keys.join(',');
  useEffect(() => {
    const now = new Set(keys);
    if (seen.current && enabled && playSound) {
      const fresh = keys.find(k => !seen.current!.has(k));
      if (fresh) {
        const cue = FX_EQUIP_SOUNDS[fresh];
        playSound(cue.file, { rate: cue.rate, volume: cue.volume });
      }
    }
    seen.current = now;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, enabled]);
}
