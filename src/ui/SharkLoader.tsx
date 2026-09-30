/**
 * <SharkLoader> (WS0 UI kit): loading, empty and error states in one component.
 *
 *   <SharkLoader />                                          // loading
 *   <SharkLoader onRetry={reload} />                         // loading, offers retry once it runs slow
 *   <SharkLoader state="error" onRetry={reload} />           // error with retry
 *   <SharkLoader state="empty" title="Be the first on the podium" action={{ label: 'Play a ride', onPress }} />
 *
 * A screen should never spin forever: pass `state="error"` when the request
 * fails and `state="empty"` when it succeeds with nothing to show.
 *
 * Loading art is a blue shark fin swimming through a porthole of water, all on
 * the UI thread. Reduced motion shows the same art standing still.
 */
import { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import GameButton from './GameButton';
import GameIcon from './GameIcon';
import GameText from './GameText';
import type { GameIconName } from './iconNames';
import { BRAND, MOTION, OUTLINE, SPACE } from './tokens';

export type SharkLoaderState = 'loading' | 'empty' | 'error';

export type SharkLoaderProps = {
  readonly state?: SharkLoaderState;
  readonly title?: string;
  readonly message?: string;
  readonly icon?: GameIconName;
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
  /** Empty state call to action. */
  readonly action?: { readonly label: string; readonly onPress: () => void; readonly icon?: GameIconName };
  /** Loading turns into "still loading" copy (and a retry, if given) after this long. */
  readonly slowAfterMs?: number;
  /** Smaller art and no flex fill, for use inside cards and lists. */
  readonly compact?: boolean;
  /** Text colour for the surface behind it. */
  readonly tone?: 'onLight' | 'onBlue';
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
};

export const SHARK_LOADER_COPY = {
  loading: 'Loading',
  slow: 'Still loading. Hang tight.',
  errorTitle: "Couldn't load this",
  errorMessage: 'Check your connection and try again.',
  emptyTitle: 'Nothing here yet',
  retry: 'Try again',
} as const;

/** Which text and buttons a state shows. Pure, so it is unit tested. */
export function sharkLoaderContent(props: SharkLoaderProps, slow: boolean) {
  const state = props.state ?? 'loading';
  if (state === 'error') {
    return {
      art: 'icon' as const,
      icon: props.icon ?? 'wrench',
      title: props.title ?? SHARK_LOADER_COPY.errorTitle,
      message: props.message ?? SHARK_LOADER_COPY.errorMessage,
      retry: props.onRetry ? props.retryLabel ?? SHARK_LOADER_COPY.retry : undefined,
      action: undefined,
    };
  }
  if (state === 'empty') {
    return {
      art: 'icon' as const,
      icon: props.icon ?? 'shark',
      title: props.title ?? SHARK_LOADER_COPY.emptyTitle,
      message: props.message,
      retry: undefined,
      action: props.action,
    };
  }
  return {
    art: 'swim' as const,
    icon: undefined,
    title: undefined,
    message: slow ? props.message ?? SHARK_LOADER_COPY.slow : props.title ?? SHARK_LOADER_COPY.loading,
    retry: slow && props.onRetry ? props.retryLabel ?? SHARK_LOADER_COPY.retry : undefined,
    action: undefined,
  };
}

const FIN = 'M4 30 C11 24 16 13 26 3 C25 13 26 22 31 30 Z';
const WAVE = 'M0 10 Q10 3 20 10 T40 10 T60 10 T80 10 T100 10 T120 10 T140 10 T160 10 T180 10 T200 10 V60 H0 Z';

function SwimmingFin({ size, still }: { size: number; still: boolean }) {
  const swim = useSharedValue(0);
  const bob = useSharedValue(0);
  const drift = useSharedValue(0);
  useEffect(() => {
    if (still) {
      swim.value = 0.5; bob.value = 0; drift.value = 0;
      return;
    }
    // The fin leads with its curved edge, so it swims right to left across the porthole and wraps.
    swim.value = 0;
    swim.value = withRepeat(withTiming(1, { duration: MOTION.swimMs * 1.4, easing: Easing.linear }), -1, false);
    bob.value = withRepeat(withSequence(
      withTiming(1, { duration: MOTION.bobMs / 2, easing: Easing.inOut(Easing.sin) }),
      withTiming(0, { duration: MOTION.bobMs / 2, easing: Easing.inOut(Easing.sin) }),
    ), -1, false);
    drift.value = withRepeat(withTiming(1, { duration: MOTION.swimMs * 1.5, easing: Easing.linear }), -1, false);
    return () => { cancelAnimation(swim); cancelAnimation(bob); cancelAnimation(drift); };
  }, [still, swim, bob, drift]);

  const finStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (0.5 - swim.value) * size * 1.3 },
      { translateY: bob.value * size * 0.04 },
    ],
  }));
  const waveStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -drift.value * size * 0.4 }] }));
  const finSize = size * 0.42;
  const waterTop = size * 0.56;
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2, overflow: 'hidden',
      backgroundColor: BRAND.white, borderWidth: OUTLINE.heavy, borderColor: BRAND.navy,
    }}>
      <Animated.View style={[{ position: 'absolute', left: size / 2 - finSize / 2, top: waterTop - finSize * 0.82 }, finStyle]}>
        <Svg width={finSize} height={finSize} viewBox="0 0 34 34">
          <Path d={FIN} fill={BRAND.blueBright} stroke={BRAND.navy} strokeWidth={3} strokeLinejoin="round" />
          <Path d="M22.5 10 Q19 17 16 22" stroke={BRAND.white} strokeWidth={2.4} strokeLinecap="round" fill="none" opacity={0.9} />
        </Svg>
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', left: 0, top: waterTop - size * 0.06, width: size * 2 }, waveStyle]}>
        <Svg width={size * 2} height={size} viewBox="0 0 200 100" preserveAspectRatio="none">
          <Path d={WAVE} fill={BRAND.sky} stroke={BRAND.navy} strokeWidth={2.5} strokeLinejoin="round" />
        </Svg>
      </Animated.View>
    </View>
  );
}

export default function SharkLoader(props: SharkLoaderProps) {
  const { compact = false, tone = 'onLight', slowAfterMs = 6000, style, testID } = props;
  const state = props.state ?? 'loading';
  const reducedMotion = useReducedGameMotion();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (state !== 'loading') return;
    const timer = setTimeout(() => setSlow(true), slowAfterMs);
    return () => clearTimeout(timer);
  }, [state, slowAfterMs]);

  const content = sharkLoaderContent(props, slow);
  const art = compact ? 64 : 96;
  const textTone = tone === 'onBlue' ? 'onBlue' : 'onLight';

  return (
    <View testID={testID} accessibilityRole={state === 'loading' ? 'progressbar' : undefined}
      accessibilityLiveRegion="polite"
      accessibilityLabel={[content.title, content.message].filter(Boolean).join('. ')}
      style={[{
        flex: compact ? undefined : 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: SPACE.xl,
        paddingVertical: compact ? SPACE.lg : SPACE.xxl,
        gap: SPACE.md,
      }, style]}>
      {content.art === 'swim'
        ? <SwimmingFin size={art} still={reducedMotion} />
        : <View style={{
          width: art, height: art, borderRadius: art / 2, backgroundColor: BRAND.white,
          borderWidth: OUTLINE.heavy, borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center',
        }}>
          <GameIcon name={content.icon ?? 'shark'} size={Math.round(art * 0.6)} />
        </View>}
      {!!content.title && <GameText preset={compact ? 'heading' : 'title'} tone={textTone} align="center">{content.title}</GameText>}
      {!!content.message && <GameText preset={content.art === 'swim' ? 'label' : 'body'} tone={textTone} align="center"
        style={{ maxWidth: 300 }}>{content.message}</GameText>}
      {!!content.retry && <View style={{ width: '100%', maxWidth: 260, marginTop: SPACE.xs }}>
        <GameButton label={content.retry} icon="retry" size="compact"
          variant={state === 'error' ? 'primary' : 'secondary'} onPress={props.onRetry} />
      </View>}
      {!!content.action && <View style={{ width: '100%', maxWidth: 280, marginTop: SPACE.xs }}>
        <GameButton label={content.action.label} icon={content.action.icon} size="compact" onPress={content.action.onPress} />
      </View>}
    </View>
  );
}
