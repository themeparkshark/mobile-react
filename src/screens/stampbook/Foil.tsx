/**
 * Foil sweep shaped by the stamp's own alpha: a narrow moving window shows a
 * white-tinted copy of the art, so the shine follows the die-cut edge of any
 * badge shape (circle, shield, hexagon, ticket) instead of a circle mask.
 *
 * Rare: one white band. Epic: a gold band. Legendary: rainbow holo, three
 * tinted bands. Driven by a 0..1 shared value; `visible` gates it on the UI
 * thread (off-screen or paused tiles commit nothing new).
 */
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import StampArt from './StampArt';
import type { BookStamp } from './model';
import { rarityRank } from './model';

const BANDS: Record<number, { tint: string; offset: number; opacity: number }[]> = {
  3: [{ tint: '#FFFFFF', offset: 0, opacity: 0.55 }],
  4: [{ tint: '#FFE7A0', offset: 0, opacity: 0.6 }, { tint: '#FFFFFF', offset: 0.09, opacity: 0.45 }],
  5: [{ tint: '#FF9AD5', offset: 0, opacity: 0.45 }, { tint: '#FFE27A', offset: 0.08, opacity: 0.55 }, { tint: '#8DF3FF', offset: 0.16, opacity: 0.45 }],
};

interface Props {
  readonly stamp: Pick<BookStamp, 'iconUrl' | 'thumbUrl' | 'lockedUrl' | 'lockedThumbUrl' | 'slug' | 'earned' | 'id' | 'rarity'>;
  readonly size: number;
  readonly art: 'thumb' | 'full';
  readonly progress: SharedValue<number>;
  readonly visible?: SharedValue<boolean>;
  /** Offsets the sweep for this tile (e.g. by column) so the book shines like a wave. */
  readonly lag?: number;
}

function Band({ stamp, size, art, progress, visible, lag = 0, tint, offset, opacity }: Props & { tint: string; offset: number; opacity: number }) {
  const W = Math.max(18, size * 0.2);
  const window = useAnimatedStyle(() => {
    const on = visible ? visible.value : true;
    const p = progress.value * 1.35 - lag - offset;
    const x = on ? -W + p * (size + W) : -W * 3;
    return { transform: [{ translateX: x }], opacity: on && p > 0 && p < 1 ? opacity : 0 };
  });
  const inner = useAnimatedStyle(() => {
    const on = visible ? visible.value : true;
    const p = progress.value * 1.35 - lag - offset;
    const x = on ? -W + p * (size + W) : -W * 3;
    return { transform: [{ translateX: -x }] };
  });
  return (
    <Animated.View style={[styles.window, { width: W, height: size }, window]}>
      <Animated.View style={[{ width: size, height: size }, inner]}>
        <StampArt stamp={stamp} size={art} locked={false} tint={tint} />
      </Animated.View>
    </Animated.View>
  );
}

function Foil(props: Props) {
  const bands = BANDS[Math.min(5, rarityRank(props.stamp.rarity))];
  if (!bands || !props.stamp.earned) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip]}>
      {bands.map(b => <Band key={b.tint} {...props} {...b} />)}
    </View>
  );
}

export default memo(Foil);

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  window: { position: 'absolute', top: 0, left: 0, overflow: 'hidden' },
});
