import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, SharedValue, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import * as Haptics from '../helpers/haptics';
import { FxBox, RigProps } from './FxStage';
import { kitSharkMove } from './kit';
import { FX_KIT, FxKey, FxLod, LiftFraming, WornFx, coverBox, containBox, liftFraming, liftScaleFor, wornFx } from './registry';
import { kitBack, kitFront, kitHasLayer, kitScene, kitSceneFront } from './rigs/Kit';
import { PumpkinPackFront } from './rigs/PumpkinPack';
import { GhostLanternBack, GhostLanternFront } from './rigs/GhostLantern';
import { JetpackFront, jetpackBody, jetpackFloat } from './rigs/Jetpack';
import { MidwayFireworksScene, SceneFlashOnShark } from './rigs/MidwayFireworks';
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
/** A scene's light layer in front of the shark (stages only). */
const SCENE_FRONT: Partial<Record<FxKey, Rig>> = { midway_fireworks: SceneFlashOnShark };
FRONT.pumpkin_pack = PumpkinPackFront;
// Wave 2 kit items: one component per layer they draw, made once (stable identity).
for (const key of Object.keys(FX_KIT) as FxKey[]) {
  if (kitHasLayer(key, 'back')) BACK[key] = kitBack(key);
  if (kitHasLayer(key, 'front')) FRONT[key] = kitFront(key);
  if (kitHasLayer(key, 'scene')) SCENE[key] = kitScene(key);
  if (kitHasLayer(key, 'scenefront')) SCENE_FRONT[key] = kitSceneFront(key);
}

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

/** A worn scene's light on the shark (in front of it): the fireworks flash. */
export function FxSceneLight({ fx, ...shared }: Shared & { fx: WornFx }) {
  const Front = fx.scene ? SCENE_FRONT[fx.scene] : undefined;
  if (!Front) return null;
  return <FxBox>{({ width, height }) => <Front {...shared} box={containBox(width, height)} />}</FxBox>;
}

/**
 * Moves the shark for rigs that move it: the jetpack float and the blade's
 * lean into a slash. Any other look gets a plain view, so no style is
 * rebuilt per frame for nothing (performance panel round 2).
 */
export function FxFloat(props: { fx: WornFx; t: SharedValue<number>; kick: SharedValue<number>; width: number; height: number; room?: number; floored?: boolean; hat?: boolean; children: React.ReactNode }) {
  // Every hook before the early return. The float eases in on equip and out on unequip.
  const lift = useFloatWeight(props.fx.floats);
  // The whole flight stays inside this card (registry liftFraming, from the rig's own FX_LIFT).
  const framing = useMemo(() => liftFraming(props.fx, props.width, props.height, props.room ?? 0, props.floored ?? false, props.hat ?? true),
    [props.fx, props.width, props.height, props.room, props.floored, props.hat]);
  const moves = lift.active || props.fx.rigs.some(r => r.key === 'plasma_blade' || !!FX_KIT[r.key]?.shark);
  if (!moves) return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>{props.children}</View>;
  return <MovingShark {...props} framing={framing} weight={lift.w} />;
}

/**
 * 0..1: how much of the jetpack float applies. Putting the jetpack on lifts the shark over
 * 0.7 s and taking it off sets it down the same way, from wherever it is: never a snap.
 */
export function useFloatWeight(floats: boolean): { w: SharedValue<number>; active: boolean } {
  const w = useSharedValue(floats ? 1 : 0);
  const [settling, setSettling] = useState(false);
  useEffect(() => {
    if (!floats && w.value <= 0) return;
    if (!floats) setSettling(true);
    w.value = withTiming(floats ? 1 : 0, { duration: 700, easing: Easing.inOut(Easing.sin) }, done => {
      if (done && !floats) runOnJS(setSettling)(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floats]);
  return { w, active: floats || settling };
}

function MovingShark({ fx, t, kick, height, weight, framing, children }: { fx: WornFx; t: SharedValue<number>; kick: SharedValue<number>; height: number;
  weight: SharedValue<number>; framing: LiftFraming; children: React.ReactNode }) {
  const leans = fx.rigs.some(r => r.key === 'plasma_blade');
  const { scale, shift, lift } = framing;
  // Wave 2 pieces that move the shark in their moment (a gentle lift or rock): the first one worn.
  const mover = fx.rigs.map(r => FX_KIT[r.key]).find(item => !!item?.shark);
  const style = useAnimatedStyle(() => {
    // The jetpack: a steady lift, a slow boost and a lazy lean, scaled by the ease in/out weight.
    // Framing first (a small sink, then a slight shrink about the tail), so the peak stays in the card.
    const w = weight.value;
    const body = w > 0 ? jetpackBody(t.value, kick.value) : { rot: 0 };
    const kitMove = kitSharkMove(mover, t.value, kick.value);
    return {
      transform: [
        { translateY: w * shift },
        { scale: 1 - w * (1 - scale) },
        { translateY: (w > 0 ? w * lift * jetpackFloat(t.value, kick.value, height) : 0) + kitMove.y * height },
        { rotate: `${(leans ? bladeLean(t.value, kick.value) : 0) + w * body.rot + kitMove.rot}deg` },
      ],
    };
  });
  return <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { transformOrigin: '55% 85%' }, style]}>{children}</Animated.View>;
}

/** Wraps the contact shadow: it shrinks and fades as a floating shark rises; a plain view otherwise. */
export function FxShadow({ fx, t, kick, height, children }: { fx: WornFx; t: SharedValue<number>; kick: SharedValue<number>; height: number;
  children: React.ReactNode }) {
  const lift = useFloatWeight(fx.floats);
  if (!lift.active) return <View pointerEvents="none" style={StyleSheet.absoluteFill}>{children}</View>;
  return <FloatShadow t={t} kick={kick} height={height} weight={lift.w} amount={liftScaleFor(height)}>{children}</FloatShadow>;
}

function FloatShadow({ t, kick, height, weight, amount, children }: { t: SharedValue<number>; kick: SharedValue<number>; height: number;
  weight: SharedValue<number>; amount: number; children: React.ReactNode }) {
  const style = useAnimatedStyle(() => {
    if (height <= 0) return { opacity: 1 };
    const lift = (-jetpackFloat(t.value, kick.value, height) / height) * weight.value * amount; // 0 .. about 0.135
    return { opacity: Math.max(0.2, 1 - lift * 4.5), transform: [{ scale: Math.max(0.45, 1 - lift * 2.6) }] };
  });
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>{children}</Animated.View>;
}

/** file null: silent until Dustin picks its sound (round 2 candidates); the haptic still plays. */
type Cue = { file: number | null; rate: number; volume: number; haptic?: 'light' | 'medium' | 'rigid' | 'selection' };

/** Dustin's pick (October 5): ss_jet_boost v2, "the only sound that wasn't jarring". */
const JET_BOOST = require('../../assets/sounds/ss_jet_boost.m4a');

/** Equip cues (DESIGN.md 7): Chris's SFX at a rate per rig. */
export const FX_EQUIP_SOUNDS = {
  jetpack: { file: JET_BOOST, rate: 1, volume: 0.9, haptic: 'medium' },
  plasma_blade: { file: null, rate: 1, volume: 0.8, haptic: 'light' },
  reef_halo: { file: require('../../assets/sounds/inventory_item_tap.mp3'), rate: 1.5, volume: 0.8, haptic: 'light' },
  saucer: { file: null, rate: 1, volume: 0.7, haptic: 'light' },
  midway_fireworks: { file: require('../../assets/sounds/firework_pop.mp3'), rate: 1, volume: 0.8, haptic: 'medium' },
  ghost_lantern: { file: null, rate: 1, volume: 0.7, haptic: 'light' },
  // Wave 2: the Pumpkin Rocket Pack rides Dustin's approved jet boost (same rig, same gentle sound).
  pumpkin_pack: { file: JET_BOOST, rate: 1, volume: 0.9, haptic: 'medium' },
  // Every other wave 2 piece is silent until Dustin picks its sound by ear (haptic only).
  ...Object.fromEntries(Object.keys(FX_KIT).map(k => [k, { file: null, rate: 1, volume: 0.7, haptic: 'light' } as Cue])),
} as Record<FxKey, Cue>;

/** One quiet cue per moment, on stages only (game feel round 2). Chris's SFX, new rates. */
export const FX_MOMENT_CUES: Record<string, Cue> = {
  boost: { file: JET_BOOST, rate: 1, volume: 0.6, haptic: 'rigid' },
  // Silent until Dustin picks from round 2 (studio/audio/for-dustin/secret-shop/round2).
  swing: { file: null, rate: 1, volume: 0.45, haptic: 'light' },
  flip: { file: require('../../assets/sounds/inventory_item_tap.mp3'), rate: 1.6, volume: 0.45, haptic: 'selection' },
  beam: { file: null, rate: 1, volume: 0.35 },
  finale: { file: require('../../assets/sounds/firework_pop.mp3'), rate: 1, volume: 0.55, haptic: 'medium' },
  peek: { file: null, rate: 1, volume: 0.4, haptic: 'light' },
  pumpkin_boost: { file: JET_BOOST, rate: 1, volume: 0.6, haptic: 'rigid' },
  // Wave 2 kit moments: silent (a light haptic) until Dustin picks each sound by ear.
  ...Object.fromEntries(Object.values(FX_KIT).map(item => [item!.moment.cue, { file: null, rate: 1, volume: 0.4, haptic: 'light' } as Cue])),
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
    if (cue.file != null) ref.current?.(cue.file, { rate: cue.rate, volume: cue.volume });
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
  // A piece that left the look a moment ago and comes back (the buy drop: the slot empties while the
  // piece falls in) is not a new equip, so it plays no second cue on top of the landing and the unlock.
  const gone = useRef(new Map<string, number>());
  useEffect(() => {
    const now = new Set<string>(keys);
    const at = Date.now();
    if (seen.current) for (const k of seen.current) if (!now.has(k)) gone.current.set(k, at);
    if (seen.current && enabled) {
      const fresh = keys.find(k => !seen.current!.has(k) && at - (gone.current.get(k) ?? -1e9) > 3000);
      if (fresh) play(FX_EQUIP_SOUNDS[fresh]);
    }
    seen.current = now;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, enabled]);
}
