/**
 * SpotlightOverlay — Dark overlay with a transparent cutout
 * 
 * Uses react-native-svg to create a full-screen dark mask with
 * a "hole" cut out where the spotlight target is. This draws
 * attention to the highlighted UI element.
 */
import React from 'react';
import { Dimensions, StyleSheet, TouchableWithoutFeedback, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import Svg, { Defs, Mask, Rect, Circle } from 'react-native-svg';
import { SpotlightTarget } from './types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface SpotlightOverlayProps {
  /** Target area to spotlight (null = full dim overlay, no cutout) */
  target: SpotlightTarget | null;
  /** Called when user taps on the overlay (outside spotlight) */
  onPress?: () => void;
  /** Called when user taps inside the spotlight area */
  onSpotlightPress?: () => void;
  /** Overlay opacity (0-1) */
  opacity?: number;
  /** Whether tapping the spotlight is enabled */
  spotlightTappable?: boolean;
}

export default function SpotlightOverlay({
  target,
  onPress,
  onSpotlightPress,
  opacity = 0.75,
  spotlightTappable = false,
}: SpotlightOverlayProps) {
  const padding = target?.padding ?? 8;

  // No spotlight — just a dark overlay
  if (!target) {
    return (
      <Animated.View
        style={[styles.overlay, { backgroundColor: `rgba(0,0,0,${opacity})` }]}
        entering={FadeIn.duration(300)}
        exiting={FadeOut.duration(200)}
        pointerEvents="box-only"
      >
        <TouchableWithoutFeedback onPress={onPress}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
      </Animated.View>
    );
  }

  const spotX = target.x - padding;
  const spotY = target.y - padding;
  const spotW = target.width + padding * 2;
  const spotH = target.height + padding * 2;
  const spotR = Math.max(spotW, spotH) / 2 + padding;

  return (
    <Animated.View
      style={styles.overlay}
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
      pointerEvents="box-none"
    >
      {/* SVG mask overlay */}
      <Svg width={SCREEN_WIDTH} height={SCREEN_HEIGHT} style={StyleSheet.absoluteFill}>
        <Defs>
          <Mask id="spotlight-mask">
            {/* White = visible (dark overlay shows) */}
            <Rect x={0} y={0} width={SCREEN_WIDTH} height={SCREEN_HEIGHT} fill="white" />
            {/* Black = hidden (spotlight hole) */}
            {target.shape === 'circle' ? (
              <Circle
                cx={target.x + target.width / 2}
                cy={target.y + target.height / 2}
                r={spotR}
                fill="black"
              />
            ) : (
              <Rect
                x={spotX}
                y={spotY}
                width={spotW}
                height={spotH}
                rx={target.shape === 'rounded' ? 16 : 0}
                ry={target.shape === 'rounded' ? 16 : 0}
                fill="black"
              />
            )}
          </Mask>
        </Defs>
        {/* Dark overlay with hole */}
        <Rect
          x={0}
          y={0}
          width={SCREEN_WIDTH}
          height={SCREEN_HEIGHT}
          fill={`rgba(0,0,0,${opacity})`}
          mask="url(#spotlight-mask)"
        />
      </Svg>

      {/* Touchable areas */}
      {/* Overlay tap (outside spotlight) */}
      <TouchableWithoutFeedback onPress={onPress}>
        <View style={StyleSheet.absoluteFill} pointerEvents="box-only" />
      </TouchableWithoutFeedback>

      {/* Spotlight tap zone (pass-through or tappable) */}
      {spotlightTappable && onSpotlightPress && (
        <TouchableWithoutFeedback onPress={onSpotlightPress}>
          <View
            style={[
              styles.spotlightTapZone,
              {
                left: spotX,
                top: spotY,
                width: spotW,
                height: spotH,
                borderRadius: target.shape === 'circle' ? spotR : target.shape === 'rounded' ? 16 : 0,
              },
            ]}
          />
        </TouchableWithoutFeedback>
      )}

      {/* Pulsing ring around spotlight */}
      <PulsingRing target={target} padding={padding} />
    </Animated.View>
  );
}

/**
 * Animated pulsing ring that draws attention to the spotlight area
 */
function PulsingRing({ target, padding }: { target: SpotlightTarget; padding: number }) {
  const pulseValue = useSharedValue(0);

  React.useEffect(() => {
    pulseValue.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulseValue.value, [0, 1], [0.6, 0]),
    transform: [{ scale: interpolate(pulseValue.value, [0, 1], [1, 1.15]) }],
  }));

  const cx = target.x + target.width / 2;
  const cy = target.y + target.height / 2;
  const size = Math.max(target.width, target.height) + padding * 4;

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: cx - size / 2,
          top: cy - size / 2,
          width: size,
          height: size,
          borderRadius: target.shape === 'circle' ? size / 2 : 16,
          borderWidth: 3,
          borderColor: '#00a5f5',
        },
        pulseStyle,
      ]}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9998,
  },
  spotlightTapZone: {
    position: 'absolute',
  },
});
