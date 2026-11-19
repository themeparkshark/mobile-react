/**
 * Stage: the window of Alex's underwater light and rays for the one hero thing on a screen (a won
 * coin, an offer chest). DIRECTION.md kit: Stage; kit.css .stage. A navy-lined rounded window with
 * his stage water, his rays at 42 percent and the tinted rays at 85 percent, an inset highlight and
 * a hard drop. The hero art (children) sits over the window and may break its edge (it is not
 * clipped). The rays sway a little, slowly: the screen's one loop, on the UI thread; still under
 * Reduce Motion. Level 2: it lives inside a page.
 */
import { memo, useEffect, type ReactNode } from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import useUiReducedMotion from '../useUiReducedMotion';
import { ART, ART_RATIO } from './art';
import { DROP, INK, SHADE, STAGE } from './tokens';

export type StageProps = {
  readonly width: number;
  readonly height: number;
  /** The hero thing, centred over the window (it may overflow it). */
  readonly children?: ReactNode;
  /** What VoiceOver says about the hero ("Walt Statue coin"). */
  readonly label?: string;
  readonly style?: StyleProp<ViewStyle>;
};

function StageImpl({ width, height, children, label, style }: StageProps) {
  const reduced = useUiReducedMotion();
  const sway = useSharedValue(0);
  useEffect(() => {
    if (reduced) { sway.value = 0; return undefined; }
    sway.value = withRepeat(withTiming(1, { duration: STAGE.swayMs, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(sway);
  }, [reduced, sway]);
  const raysStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${STAGE.sway * (sway.value * 2 - 1)}deg` }] }));
  const rays = Math.round(width * STAGE.rays);
  const waterH = Math.round((width * 1.31) / ART_RATIO.stageWater);
  return (
    <View style={[{ width, height }, style]} accessible={!!label} accessibilityRole={label ? 'image' : undefined} accessibilityLabel={label}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: DROP.cardInPage, bottom: -DROP.cardInPage, borderRadius: STAGE.radius, backgroundColor: DROP.inPage }} />
      <View style={{ position: 'absolute', left: 0, top: 0, width, height, borderRadius: STAGE.radius, borderWidth: STAGE.line, borderColor: INK.navy, overflow: 'hidden', backgroundColor: SHADE.stageWater }}>
        <Image source={ART.stageWater} resizeMode="cover" fadeDuration={0} style={{ position: 'absolute', left: -width * 0.155, top: 0, width: width * 1.31, height: waterH }} />
        <Animated.View style={[{ position: 'absolute', left: (width - rays) / 2 - STAGE.line, top: (height - rays) / 2 - STAGE.line, width: rays, height: rays }, raysStyle]}>
          <Image source={ART.rays} fadeDuration={0} style={{ position: 'absolute', width: rays, height: rays, opacity: STAGE.raysOpacity }} />
          <Image source={ART.raysTint} fadeDuration={0} style={{ position: 'absolute', width: rays, height: rays, opacity: STAGE.tintOpacity }} />
        </Animated.View>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: STAGE.radius - STAGE.line, borderTopWidth: 3, borderColor: SHADE.shine35 }} />
      </View>
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, top: 0, width, height, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
    </View>
  );
}

const Stage = memo(StageImpl);
export default Stage;
