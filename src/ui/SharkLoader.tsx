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
 * The art is Dustin's own TPS shark (the hand-drawn mascot in the TPS cap).
 * While loading he bobs and sways on the UI thread; reduced motion holds him
 * still. Error and empty states show him standing, or a GameIcon when given.
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
import { Image } from 'expo-image';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import GameButton from './GameButton';
import GameIcon from './GameIcon';
import GameText from './GameText';
import type { GameIconName } from './iconNames';
import { MOTION, SPACE } from './tokens';

/** Dustin's TPS shark mascot (hand-drawn original). */
export const SHARK_LOADER_ART = require('../../assets/images/screens/pin-collections/shark.png');

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
      art: props.icon ? 'icon' as const : 'shark' as const,
      icon: props.icon,
      title: props.title ?? SHARK_LOADER_COPY.errorTitle,
      message: props.message ?? SHARK_LOADER_COPY.errorMessage,
      retry: props.onRetry ? props.retryLabel ?? SHARK_LOADER_COPY.retry : undefined,
      action: undefined,
    };
  }
  if (state === 'empty') {
    return {
      art: props.icon ? 'icon' as const : 'shark' as const,
      icon: props.icon,
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

/** The shark, bobbing and swaying while it loads. Reduced motion holds it still. */
function SwimmingShark({ size, still }: { size: number; still: boolean }) {
  const bob = useSharedValue(0);
  const sway = useSharedValue(0);
  useEffect(() => {
    if (still) {
      bob.value = 0; sway.value = 0;
      return;
    }
    bob.value = withRepeat(withSequence(
      withTiming(1, { duration: MOTION.bobMs, easing: Easing.inOut(Easing.sin) }),
      withTiming(0, { duration: MOTION.bobMs, easing: Easing.inOut(Easing.sin) }),
    ), -1, false);
    sway.value = withRepeat(withSequence(
      withTiming(1, { duration: MOTION.swimMs, easing: Easing.inOut(Easing.sin) }),
      withTiming(-1, { duration: MOTION.swimMs, easing: Easing.inOut(Easing.sin) }),
    ), -1, true);
    return () => { cancelAnimation(bob); cancelAnimation(sway); };
  }, [still, bob, sway]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: -bob.value * size * 0.07 },
      { translateX: sway.value * size * 0.04 },
      { rotate: `${sway.value * 5}deg` },
    ],
  }));
  return <Animated.View style={[{ width: size, height: size }, style]}>
    <Image source={SHARK_LOADER_ART} contentFit="contain" style={{ width: size, height: size }}
      accessibilityIgnoresInvertColors />
  </Animated.View>;
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
  const art = compact ? 72 : 120;
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
      {content.art === 'swim' && <SwimmingShark size={art} still={reducedMotion} />}
      {content.art === 'shark' && <Image source={SHARK_LOADER_ART} contentFit="contain" style={{ width: art, height: art }} />}
      {content.art === 'icon' && content.icon && <GameIcon name={content.icon} size={Math.round(art * 0.8)} />}
      {!!content.title && <GameText preset={compact ? 'heading' : 'title'} tone={textTone} align="center">{content.title}</GameText>}
      {!!content.message && <GameText preset={content.art === 'swim' ? 'label' : 'body'} tone={textTone} align="center"
        style={{ maxWidth: 300 }}>{content.message}</GameText>}
      {!!content.retry && <View style={{ width: '100%', maxWidth: 260, marginTop: SPACE.xs }}>
        <GameButton label={content.retry} size="compact"
          variant={state === 'error' ? 'primary' : 'secondary'} onPress={props.onRetry} />
      </View>}
      {!!content.action && <View style={{ width: '100%', maxWidth: 280, marginTop: SPACE.xs }}>
        <GameButton label={content.action.label} icon={content.action.icon} size="compact" onPress={content.action.onPress} />
      </View>}
    </View>
  );
}
