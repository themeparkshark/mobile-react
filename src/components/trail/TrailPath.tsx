import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { memo, useEffect, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { milestonesCrossed } from '../../services/trail/trailModel';
import { BRAND } from '../../ui';
import { STEPS_ART } from './TrailBoxArt';

const SHARK = require('../../../assets/icons/game/shark.png');

/**
 * What each path last showed, by key (a box id). A path only animates the new
 * part of the walk since you last looked, the way Pikmin Bloom's seedlings
 * tick down when you open the list. Lives for the app session.
 */
const lastSeen = new Map<string, number>();
export function seenFraction(key: string | undefined): number | null {
  return key ? lastSeen.get(key) ?? null : null;
}

/**
 * The walking path: a sky track with footprint dots that fills gold as you
 * walk, with a tiny shark riding the front of the fill. It only ever moves
 * forward: the first time a box is seen it appears at its real progress; after
 * that, opening the sheet animates only the steps walked since you last looked
 * (about a second), with a light tick at 25/50/75/100%.
 */
function TrailPath({ fraction, height = 16, ready = false, seenKey, onFilled }: {
  readonly fraction: number;
  readonly height?: number;
  readonly ready?: boolean;
  /** Remember progress under this key (box id) so reopening animates only the new walk. */
  readonly seenKey?: string;
  /** Called once when the fill animation reaches the end. */
  readonly onFilled?: () => void;
}) {
  const reduced = useReducedGameMotion();
  const [width, setWidth] = useState(0);
  const target = Math.max(0, Math.min(1, ready ? 1 : fraction));
  const start = seenFraction(seenKey) ?? target;
  const fill = useSharedValue(Math.min(start, target));
  const bump = useSharedValue(1);

  useEffect(() => {
    const from = Math.max(seenFraction(seenKey) ?? fill.value, 0);
    const next = Math.max(from, target);
    if (seenKey) lastSeen.set(seenKey, next);
    if (reduced || next <= fill.value + 0.001) { fill.value = next; return; }
    const beats = milestonesCrossed(fill.value, next);
    const ms = 650 + Math.min(700, (next - fill.value) * 1400);
    const beat = (i: number) => {
      if (i >= beats.length) return;
      void Haptics.impactAsync(beats[i] >= 1 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    };
    beats.forEach((m, i) => setTimeout(() => beat(i), 250 + ms * ((m - fill.value) / (next - fill.value))));
    fill.value = withTiming(next, { duration: ms, easing: Easing.out(Easing.cubic) }, done => {
      if (done && next >= 1 && onFilled) runOnJS(onFilled)();
    });
    bump.value = withSequence(withTiming(1.25, { duration: 160 }), withSpring(1, { damping: 8, stiffness: 240 }));
  }, [target, reduced, seenKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const fillStyle = useAnimatedStyle(() => ({ width: Math.max(height, fill.value * width) }));
  const sharkSize = height * 1.9;
  const sharkStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.max(0, fill.value * width - sharkSize * 0.75) }, { scale: bump.value }],
  }));
  const dots = Math.max(0, Math.floor(width / (height * 1.6)) - 1);

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={{ height: sharkSize, justifyContent: 'center' }}>
      <View style={{ height, borderRadius: height / 2, backgroundColor: BRAND.sky, borderWidth: 2, borderColor: BRAND.navy,
        overflow: 'hidden', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', left: height * 0.6, right: height * 0.6, flexDirection: 'row', justifyContent: 'space-between' }}>
          {Array.from({ length: dots }, (_, i) => (
            <View key={i} style={{ width: height * 0.3, height: height * 0.3, borderRadius: height, backgroundColor: BRAND.skyDeep }} />
          ))}
        </View>
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: height / 2,
          backgroundColor: ready ? BRAND.gold : BRAND.goldLight, borderRightWidth: 2, borderColor: BRAND.goldLip }, fillStyle]} />
      </View>
      {width > 0 && (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, width: sharkSize, height: sharkSize }, sharkStyle]}>
          <Image source={ready ? STEPS_ART : SHARK} style={{ width: sharkSize, height: sharkSize }} contentFit="contain" />
        </Animated.View>
      )}
    </View>
  );
}

export default memo(TrailPath);
