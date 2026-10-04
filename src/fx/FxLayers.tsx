import { useCallback, useContext, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import * as Haptics from '../helpers/haptics';
import { FxBox, RigProps } from './FxStage';
import { FxKey, FxLod, WornFx, coverBox, containBox, wornFx } from './registry';
import { GhostLanternBack, GhostLanternFront } from './rigs/GhostLantern';
import { JetpackFront, jetpackFloat } from './rigs/Jetpack';
import { MidwayFireworksScene } from './rigs/MidwayFireworks';
import { PlasmaBladeFront, bladeLean } from './rigs/PlasmaBlade';
import { ReefHaloBack, ReefHaloFront } from './rigs/ReefHalo';
import { SaucerFront } from './rigs/Saucer';

export type { WornFx } from './registry';
export { wornFx };

type Rig = (props: RigProps) => JSX.Element | null;

const BACK: Partial<Record<FxKey, Rig>> = { reef_halo: ReefHaloBack, ghost_lantern: GhostLanternBack };
const FRONT: Partial<Record<FxKey, Rig>> = {
  jetpack: JetpackFront,
  plasma_blade: PlasmaBladeFront,
  reef_halo: ReefHaloFront,
  saucer: SaucerFront,
  ghost_lantern: GhostLanternFront,
};
const SCENE: Partial<Record<FxKey, Rig>> = { midway_fireworks: MidwayFireworksScene };

type Shared = { t: SharedValue<number>; kick: SharedValue<number>; lod: FxLod; cue?: (moment: string) => void };

/** The rig layers for one side of the shark, laid out on the paper canvas inside this box. */
export function FxRigLayers({ fx, side, ...shared }: Shared & { fx: WornFx; side: 'back' | 'front' }) {
  const table = side === 'back' ? BACK : FRONT;
  const rigs = fx.rigs.filter(r => !!table[r.key]);
  if (!rigs.length) return null;
  return (
    <FxBox>
      {({ width, height }) => {
        const box = containBox(width, height);
        return rigs.map(({ slot, key }) => {
          const Rig = table[key]!;
          // Cues come from the front layer only, so a two-layer rig never plays twice.
          return <Rig key={`${side}-${slot}-${key}`} {...shared} cue={side === 'front' ? shared.cue : undefined} box={box} />;
        });
      }}
    </FxBox>
  );
}

/** The animated backdrop, cover-fitted like every backdrop. */
export function FxScene({ fx, ...shared }: Shared & { fx: WornFx }) {
  if (!fx.scene) return null;
  const Scene = SCENE[fx.scene]!;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <FxBox>{({ width, height }) => <Scene {...shared} box={coverBox(width, height)} />}</FxBox>
    </View>
  );
}

/**
 * Moves the shark for rigs that move it: the jetpack float and the blade's
 * lean into a slash. Any other look gets a plain view, so no style is
 * rebuilt per frame for nothing (performance panel round 2).
 */
export function FxFloat(props: { fx: WornFx; t: SharedValue<number>; kick: SharedValue<number>; height: number; children: React.ReactNode }) {
  const moves = props.fx.floats || props.fx.rigs.some(r => r.key === 'plasma_blade');
  if (!moves) return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>{props.children}</View>;
  return <MovingShark {...props} />;
}

function MovingShark({ fx, t, kick, height, children }: { fx: WornFx; t: SharedValue<number>; kick: SharedValue<number>; height: number;
  children: React.ReactNode }) {
  const floats = fx.floats;
  const leans = fx.rigs.some(r => r.key === 'plasma_blade');
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: floats ? jetpackFloat(t.value, kick.value, height) : 0 },
      { rotate: `${leans ? bladeLean(t.value, kick.value) : 0}deg` },
    ],
  }));
  return <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { transformOrigin: '55% 85%' }, style]}>{children}</Animated.View>;
}

/** Wraps the contact shadow: it shrinks and fades as a floating shark rises; a plain view otherwise. */
export function FxShadow({ fx, t, kick, height, children }: { fx: WornFx; t: SharedValue<number>; kick: SharedValue<number>; height: number;
  children: React.ReactNode }) {
  if (!fx.floats) return <View pointerEvents="none" style={StyleSheet.absoluteFill}>{children}</View>;
  return <FloatShadow t={t} kick={kick} height={height}>{children}</FloatShadow>;
}

function FloatShadow({ t, kick, height, children }: { t: SharedValue<number>; kick: SharedValue<number>; height: number; children: React.ReactNode }) {
  const style = useAnimatedStyle(() => {
    if (height <= 0) return { opacity: 1 };
    const lift = -jetpackFloat(t.value, kick.value, height) / height; // about 0.05 .. 0.2
    return { opacity: Math.max(0.2, 0.85 - lift * 3.2), transform: [{ scale: Math.max(0.45, 1 - lift * 2.6) }] };
  });
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>{children}</Animated.View>;
}

type Cue = { file: number; rate: number; volume: number; haptic?: 'light' | 'medium' | 'rigid' | 'selection' };

/** Equip cues (DESIGN.md 7): Chris's SFX at a rate per rig. */
export const FX_EQUIP_SOUNDS: Record<FxKey, Cue> = {
  jetpack: { file: require('../../assets/sounds/whoosh.mp3'), rate: 0.8, volume: 0.9, haptic: 'medium' },
  plasma_blade: { file: require('../../assets/sounds/whoosh.mp3'), rate: 1.6, volume: 0.8, haptic: 'light' },
  reef_halo: { file: require('../../assets/sounds/inventory_item_tap.mp3'), rate: 1.5, volume: 0.8, haptic: 'light' },
  saucer: { file: require('../../assets/sounds/reveal.mp3'), rate: 1.4, volume: 0.7, haptic: 'light' },
  midway_fireworks: { file: require('../../assets/sounds/firework_pop.mp3'), rate: 1, volume: 0.8, haptic: 'medium' },
  ghost_lantern: { file: require('../../assets/sounds/reveal.mp3'), rate: 0.8, volume: 0.7, haptic: 'light' },
};

/** One quiet cue per moment, on stages only (game feel round 2). Chris's SFX, new rates. */
export const FX_MOMENT_CUES: Record<string, Cue> = {
  boost: { file: require('../../assets/sounds/whoosh.mp3'), rate: 1.25, volume: 0.5, haptic: 'rigid' },
  swing: { file: require('../../assets/sounds/whoosh.mp3'), rate: 1.9, volume: 0.45, haptic: 'light' },
  flip: { file: require('../../assets/sounds/inventory_item_tap.mp3'), rate: 1.6, volume: 0.45, haptic: 'selection' },
  beam: { file: require('../../assets/sounds/reveal.mp3'), rate: 1.5, volume: 0.35 },
  finale: { file: require('../../assets/sounds/firework_pop.mp3'), rate: 1, volume: 0.55, haptic: 'medium' },
  peek: { file: require('../../assets/sounds/reveal.mp3'), rate: 0.8, volume: 0.4, haptic: 'light' },
};

const STYLES = Haptics.ImpactFeedbackStyle as unknown as Record<string, string>;

function haptic(kind: Cue['haptic']) {
  if (!kind) return;
  if (kind === 'selection') { void Haptics.selectionAsync().catch(() => undefined); return; }
  const style = kind === 'rigid' ? (STYLES.Rigid ?? STYLES.Heavy) : kind === 'medium' ? STYLES.Medium : STYLES.Light;
  void Haptics.impactAsync(style).catch(() => undefined);
}

/** Plays a cue (sound through the player's sound setting, then its haptic). */
export function useFxCuePlayer() {
  const { playSound } = useContext(SoundEffectContext);
  const ref = useRef(playSound);
  ref.current = playSound;
  return useCallback((cue: Cue | undefined) => {
    if (!cue) return;
    // Dev builds log every cue with a timestamp, so captures can prove sound and haptic sync.
    if (__DEV__) console.log(`[fx-cue] ${Date.now()} rate=${cue.rate} haptic=${cue.haptic ?? 'none'}`);
    ref.current?.(cue.file, { rate: cue.rate, volume: cue.volume });
    haptic(cue.haptic);
  }, []);
}

/** How long after the last thing the player did a moment may still make a sound. */
export const CUE_WINDOW_MS = 12_000;

/**
 * The moment-cue callback for a stage (undefined when the stage is silent),
 * and `touch` to mark a player action. Cues sound only within 12 s of the
 * stage opening, a tap, an equip or a buy; then moments keep moving in
 * silence, so a Dressing Room left open never whooshes and buzzes forever
 * (performance panel round 2).
 */
export function useFxMomentCue(enabled: boolean): {
  cue: ((moment: string) => void) | undefined;
  touch: () => void;
  /** Play a moment's cue now (a tap or an unlock), with or without its haptic. */
  play: (moment: string, haptic: boolean) => void;
} {
  const play = useFxCuePlayer();
  const last = useRef(Date.now());
  const touch = useCallback(() => { last.current = Date.now(); }, []);
  const cue = useCallback((moment: string) => {
    if (Date.now() - last.current <= CUE_WINDOW_MS) play(FX_MOMENT_CUES[moment]);
  }, [play]);
  const playNow = useCallback((moment: string, haptic: boolean) => {
    if (!enabled) return;
    const c = FX_MOMENT_CUES[moment];
    play(c && !haptic ? { ...c, haptic: undefined } : c);
  }, [play, enabled]);
  return { cue: enabled ? cue : undefined, touch, play: playNow };
}

/**
 * Plays a rig's equip cue when it is put on after the stage mounted. With
 * `onOpen`, a piece already worn when the stage opens plays too (the try-on:
 * the first thing you hear is the piece you came to see).
 */
export function useFxEquipSound(fx: WornFx, enabled: boolean, onOpen = false) {
  const play = useFxCuePlayer();
  const seen = useRef<Set<string> | null>(onOpen ? new Set() : null);
  const keys = [fx.scene, ...fx.rigs.map(r => r.key)].filter((k): k is FxKey => !!k);
  const signature = keys.join(',');
  useEffect(() => {
    const now = new Set(keys);
    if (seen.current && enabled) {
      const fresh = keys.find(k => !seen.current!.has(k));
      if (fresh) play(FX_EQUIP_SOUNDS[fresh]);
    }
    seen.current = now;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, enabled]);
}
