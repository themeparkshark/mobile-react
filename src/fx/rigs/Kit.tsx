import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { RigProps, useMomentCue } from '../FxStage';
import { KitEmitter, KitItem, KitLayer, KitPart, kitMoment, particleAt, posedAt, sampleAt } from '../kit';
import { FX_KIT, FxKey, PAPER_H, PAPER_W, PaperBox, partLayout } from '../registry';
import { KIT_ART } from './kitArt';

/**
 * Draws one layer of a kit item (secret-shop/DESIGN-WAVE2.md 3): its groups, parts and particle
 * pools, every pose a worklet of the stage clock. Parts with no motion draw as plain images (no
 * animated view), so a still stage and the quiet parts of a piece cost nothing per frame.
 */

const moves = (p: { loops?: readonly unknown[]; keys?: readonly unknown[]; momentOnly?: boolean }) =>
  !!(p.loops?.length || p.keys?.length || p.momentOnly);

function shown(lod: RigProps['lod'], need: 'lite' | 'full' | undefined, fallback: 'lite' | 'full') {
  const n = need ?? fallback;
  return lod === 'full' || lod === 'still' || n === 'lite';
}

function Part({ item, part, t, kick, box, lod }: Pick<RigProps, 't' | 'kick' | 'lod'> & { item: KitItem; part: KitPart; box: PaperBox }) {
  const still = lod === 'still';
  const style = useAnimatedStyle(() => {
    const s = sampleAt(item, t.value, kick.value, still);
    const pose = posedAt(part.loops, part.keys, part.calm ?? 1, s.t, s.p, part.momentOnly ? 0 : 1);
    const hidden = (part.momentOnly && s.p < 0) || (part.depth === 'near' && pose.depth <= 0) || (part.depth === 'far' && pose.depth > 0);
    return {
      opacity: hidden ? 0 : (part.o ?? 1) * pose.o,
      transform: [
        { translateX: pose.x * box.w },
        { translateY: pose.y * box.h },
        { rotate: `${(part.rot ?? 0) + pose.rot}deg` },
        { scale: pose.s },
        { scaleX: (part.flip ? -1 : 1) * pose.sx },
        { scaleY: pose.sy },
      ],
    };
  });
  const l = partLayout(box, part, part.aspect);
  const base = { position: 'absolute' as const, left: l.left, top: l.top, width: l.width, height: l.height, transformOrigin: l.origin };
  if (!moves(part)) {
    return (
      <Image source={KIT_ART[part.src]} contentFit="contain" cachePolicy="memory" tintColor={part.tint}
        style={[base, { opacity: part.o ?? 1, transform: [{ rotate: `${part.rot ?? 0}deg` }, { scaleX: part.flip ? -1 : 1 }] }]} />
    );
  }
  return <Animated.Image source={KIT_ART[part.src]} resizeMode="contain" style={[base, { tintColor: part.tint }, style]} />;
}

function Group({ item, gid, t, kick, box, lod, children }: Pick<RigProps, 't' | 'kick' | 'lod'> & { item: KitItem; gid: string; box: PaperBox;
  children: React.ReactNode }) {
  const g = item.groups!.find(x => x.id === gid)!;
  const still = lod === 'still';
  const style = useAnimatedStyle(() => {
    const s = sampleAt(item, t.value, kick.value, still);
    const pose = posedAt(g.loops, g.keys, g.calm ?? 1, s.t, s.p);
    return {
      transform: [{ translateX: pose.x * box.w }, { translateY: pose.y * box.h }, { rotate: `${pose.rot}deg` }, { scale: pose.s },
        { scaleX: pose.sx * (g.squash?.[0] ?? 1) }, { scaleY: pose.sy * (g.squash?.[1] ?? 1) }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h,
      transformOrigin: `${Math.round(g.pivot[0] * box.w)}px ${Math.round(g.pivot[1] * box.h)}px` }, style]}>
      {children}
    </Animated.View>
  );
}

function Particle({ item, e, i, t, kick, box, lod, aspectHW }: Pick<RigProps, 't' | 'kick' | 'lod'> & { item: KitItem; e: KitEmitter; i: number;
  box: PaperBox; aspectHW: number }) {
  const still = lod === 'still';
  const big = e.size[1] * box.w * Math.max(1, e.grow?.[0] ?? 1, e.grow?.[1] ?? 1);
  const style = useAnimatedStyle(() => {
    const s = sampleAt(item, t.value, kick.value, still);
    const q = particleAt(item, e, i, s.t, s.p, aspectHW);
    if (q.o <= 0) return { opacity: 0 };
    return {
      opacity: q.o,
      transform: [{ translateX: box.x + q.x * box.w - big / 2 }, { translateY: box.y + q.y * box.h - big / 2 },
        { rotate: `${q.rot}deg` }, { scale: (q.s * box.w) / big }],
    };
  });
  return <Animated.Image source={KIT_ART[e.src]} resizeMode="contain"
    style={[styles.abs, { width: big, height: big, tintColor: e.tint }, style]} />;
}

/** One layer of a kit item, laid out in `box` (the paper box, or the cover box for a scene). */
export function KitLayerView({ fxKey, layer, ...props }: RigProps & { fxKey: FxKey; layer: KitLayer }) {
  const item = FX_KIT[fxKey]!;
  const { t, kick, box, lod, cue } = props;
  const signature = layer === 'front' || (layer === 'scene' && !item.parts.some(p => p.layer === 'front'));
  useMomentCue(t, kick, () => { 'worklet'; if (lod === 'still') return -1; const m = kitMoment(item, t.value, kick.value); return m.cycle < 0 ? -1 : m.p; },
    signature && cue ? () => cue(item.moment.cue) : undefined);
  const parts = item.parts.filter(p => p.layer === layer && shown(lod, p.lod, 'lite'));
  const emitters = (item.emitters ?? []).filter(e => e.layer === layer && shown(lod, e.lod, 'full'));
  // Paper boxes keep the canvas aspect; a scene's cover box is square.
  const aspectHW = layer === 'scene' ? 1 : PAPER_H / PAPER_W;
  const local = { x: 0, y: 0, w: box.w, h: box.h };
  // Draw order is the order in kit.json: a group draws where its first part is listed.
  const order: ({ kind: 'part'; part: KitPart } | { kind: 'group'; gid: string })[] = [];
  for (const p of parts) {
    if (!p.group) order.push({ kind: 'part', part: p });
    else if (!order.some(o => o.kind === 'group' && o.gid === p.group)) order.push({ kind: 'group', gid: p.group });
  }
  return (
    <>
      {order.map(o => o.kind === 'part'
        ? <Part key={o.part.id} item={item} part={o.part} t={t} kick={kick} box={box} lod={lod} />
        : (
          <Group key={`g-${o.gid}`} item={item} gid={o.gid} t={t} kick={kick} box={box} lod={lod}>
            {parts.filter(p => p.group === o.gid).map(p => <Part key={p.id} item={item} part={p} t={t} kick={kick} box={local} lod={lod} />)}
          </Group>
        ))}
      {emitters.map(e => Array.from({ length: e.n }, (_, i) => (
        <Particle key={`${e.id}-${i}`} item={item} e={e} i={i} t={t} kick={kick} box={box} lod={lod} aspectHW={aspectHW} />
      )))}
    </>
  );
}

/** Does this kit item draw anything on this layer at this LOD? */
export function kitHasLayer(fxKey: FxKey, layer: KitLayer): boolean {
  const item = FX_KIT[fxKey];
  return !!item && (item.parts.some(p => p.layer === layer) || (item.emitters ?? []).some(e => e.layer === layer));
}

/** Kit rigs for the layer tables (FxLayers, FxSolo). */
export const kitBack = (fxKey: FxKey) => function KitBack(props: RigProps) { return <KitLayerView fxKey={fxKey} layer="back" {...props} />; };
export const kitFront = (fxKey: FxKey) => function KitFront(props: RigProps) { return <KitLayerView fxKey={fxKey} layer="front" {...props} />; };
export const kitScene = (fxKey: FxKey) => function KitScene(props: RigProps) { return <KitLayerView fxKey={fxKey} layer="scene" {...props} />; };
export const kitSceneFront = (fxKey: FxKey) => function KitSceneFront(props: RigProps) {
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}><KitLayerView fxKey={fxKey} layer="scenefront" {...props} /></View>;
};

const styles = StyleSheet.create({
  abs: { position: 'absolute', left: 0, top: 0 },
});
