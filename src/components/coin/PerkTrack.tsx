import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { coinTier } from '../../constants/coinTiers';
import GameIcon from '../../ui/GameIcon';
import { nextReward, perkNodes, type PerkNode, type PerkTrackRow } from './progressionModel';

/**
 * The 10-node perk rail on the coin sheet (progression.md 9.3). Perk nodes are
 * round, milestones are small diamonds, the Level 5 node carries a tiny boss
 * eye and Level 10 is the boss. Only the next reward is prominent (enlarged
 * with a pulse ring and its short line); the full track is one swipe away.
 */
const NODE = 30;
const NEXT = 40;
/** Space between nodes and the rail's side padding (pt). */
const GAP = 4;
const PAD = 8;

/**
 * How the rail fits its box: as many WHOLE nodes as fit (never one cut by the edge), each step stretched to fill the
 * box exactly, and where it starts so the next reward sits in view (the rest is one swipe away, snapping node by node).
 */
export function railFit(boxWidth: number, count: number, nextIndex: number): { step: number; shown: number; start: number } {
  const minStep = NEXT + 6 + GAP;
  const shown = Math.max(1, Math.min(count, Math.floor((boxWidth - 2 * PAD + GAP) / minStep)));
  const step = (boxWidth - 2 * PAD + GAP) / shown;
  const centred = (nextIndex < 0 ? count - 1 : nextIndex) - Math.floor(shown / 2);
  const start = Math.max(0, Math.min(count - shown, centred));
  return { step, shown, start };
}

function Node({ node, reduced, onPress, selected, width }: { node: PerkNode; reduced: boolean; onPress: () => void; selected: boolean; width: number }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!node.isNext || reduced) { pulse.setValue(0); return; }
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [node.isNext, reduced]);
  const tier = coinTier(node.level);
  const size = node.isNext ? NEXT : node.shape === 'diamond' ? NODE - 8 : NODE;
  const fill = node.unlocked ? tier.ring : '#ffffff';
  const border = node.unlocked ? tier.ringDeep : '#83b9d2';
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      accessibilityLabel={`Level ${node.level}, ${node.name}. ${node.short}. ${node.unlocked ? 'Unlocked' : 'Locked'}`}
      style={[styles.nodeHit, { width }]}>
      {node.isNext && !reduced && (
        <Animated.View pointerEvents="none" style={[styles.pulse, { width: NEXT + 14, height: NEXT + 14, borderRadius: (NEXT + 14) / 2,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.25] }) }] }]} />
      )}
      <View style={[styles.node, {
        width: size, height: size, borderRadius: node.shape === 'diamond' ? 4 : size / 2,
        backgroundColor: fill, borderColor: selected ? '#ffcf3b' : border, borderWidth: selected || node.isNext ? 3 : 2,
        transform: node.shape === 'diamond' ? [{ rotate: '45deg' }] : [],
      }]}>
        <View style={node.shape === 'diamond' ? { transform: [{ rotate: '-45deg' }] } : undefined}>
          {node.shape === 'boss' ? <GameIcon name="crown" size={size * 0.62} />
            : node.unlocked ? <GameIcon name="check" size={size * 0.5} />
              : node.shape === 'round' ? <GameIcon name="star" size={size * 0.5} /> : null}
        </View>
      </View>
      {node.bossEye && <View style={styles.eye}><GameIcon name="shark" size={14} /></View>}
      {node.proc_today && <View style={styles.procDot} accessibilityLabel="Used today" />}
      <Text style={[styles.level, node.isNext && styles.levelNext]}>{node.level}</Text>
    </Pressable>
  );
}

export default function PerkTrack({ track, currentLevel, reduced }: { track: readonly PerkTrackRow[] | null | undefined; currentLevel: number; reduced: boolean }) {
  const nodes = perkNodes(track, currentLevel);
  const [selected, setSelected] = useState<number | null>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  const rail = useRef<ScrollView>(null);
  const placed = useRef(false);
  if (!nodes.length) return null;
  const shown = nodes.find(node => node.level === selected) ?? null;
  const next = nextReward(track, currentLevel);
  const fit = boxWidth > 0 ? railFit(boxWidth, nodes.length, nodes.findIndex(node => node.isNext)) : null;
  return (
    <View style={styles.card}>
      <ScrollView ref={rail} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}
        snapToInterval={fit?.step} decelerationRate="fast"
        onLayout={event => { const w = event.nativeEvent.layout.width; if (Math.abs(w - boxWidth) > 0.5) { placed.current = false; setBoxWidth(w); } }}
        onContentSizeChange={width => {
          // Placed once the rail has its fitted nodes (the content is wide enough to start there), never after a swipe.
          if (!fit || placed.current || width + 0.5 < fit.start * fit.step + boxWidth) return;
          placed.current = true;
          rail.current?.scrollTo({ x: fit.start * fit.step, animated: false });
        }}
        style={{ opacity: fit ? 1 : 0 }}>
        <View style={styles.line} />
        {nodes.map(node => <Node key={node.level} node={node} reduced={reduced} selected={selected === node.level}
          width={fit ? fit.step - GAP : NEXT + 6}
          onPress={() => setSelected(current => (current === node.level ? null : node.level))} />)}
      </ScrollView>
      <Text style={styles.nextLine} numberOfLines={2}>
        {shown ? `LEVEL ${shown.level} · ${shown.name}: ${shown.short}` : next ?? 'Every reward on this coin is yours'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', backgroundColor: '#ffffff', borderColor: '#79c7eb', borderWidth: 2, borderRadius: 12,
    paddingVertical: 8, marginBottom: 10 },
  rail: { alignItems: 'center', paddingHorizontal: PAD, gap: GAP, minHeight: NEXT + 26 },
  line: { position: 'absolute', left: 20, right: 20, top: (NEXT + 14) / 2, height: 3, backgroundColor: '#bfe5ff', borderRadius: 2 },
  nodeHit: { alignItems: 'center', justifyContent: 'center', height: NEXT + 26 },
  pulse: { position: 'absolute', top: 0, borderWidth: 3, borderColor: '#ffcf3b' },
  node: { alignItems: 'center', justifyContent: 'center' },
  eye: { position: 'absolute', top: 0, right: 0 },
  procDot: { position: 'absolute', top: 4, left: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: '#ffb400',
    borderWidth: 1.5, borderColor: '#ffffff' },
  level: { fontFamily: 'Shark', fontSize: 12, color: '#3b7197', marginTop: 2 },
  levelNext: { color: '#05346e', fontSize: 14 },
  nextLine: { fontFamily: 'Knockout', fontSize: 14, color: '#19496b', textAlign: 'center', paddingHorizontal: 10, marginTop: 2 },
});
