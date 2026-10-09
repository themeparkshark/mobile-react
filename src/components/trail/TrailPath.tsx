import { Image } from 'expo-image';
import { memo, useEffect, useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming, withSequence, withSpring } from 'react-native-reanimated';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { BRAND } from '../../ui';
import { STEPS_ART } from './TrailBoxArt';

const SHARK = require('../../../assets/icons/game/shark.png');

/**
 * The walking path: a sky track with footprint dots that fills gold as you
 * walk, with a tiny shark riding the front of the fill. It only ever moves
 * forward on screen. A fill that grows animates over ~0.9 s from where it was,
 * so catching up after the app was closed reads as "my walk just landed".
 */
function TrailPath({ fraction, height = 16, ready = false, onFilled }: {
  readonly fraction: number;
  readonly height?: number;
  readonly ready?: boolean;
  /** Called once when the fill animation reaches the end. */
  readonly onFilled?: () => void;
}) {
  const reduced = useReducedGameMotion();
  const [width, setWidth] = useState(0);
  const shown = useRef(0);
  const fill = useSharedValue(0);
  const bump = useSharedValue(1);
  const target = Math.max(0, Math.min(1, ready ? 1 : fraction));

  useEffect(() => {
    const next = Math.max(shown.current, target);
    const grew = next > shown.current + 0.001;
    shown.current = next;
    if (reduced || !grew) { fill.value = next; return; }
    fill.value = withTiming(next, { duration: 900, easing: Easing.out(Easing.cubic) });
    bump.value = withSequence(withTiming(1.25, { duration: 160 }), withSpring(1, { damping: 8, stiffness: 240 }));
    if (next >= 1 && onFilled) setTimeout(onFilled, 900);
  }, [target, reduced, fill, bump, onFilled]);

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
