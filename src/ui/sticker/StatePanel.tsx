/**
 * StatePanel: empty, error and loading, one recipe (DIRECTION.md kit: Empty, error, loading).
 * A page with Alex's shark, one line and one action. Empty: his happy shark and a way to go play.
 * Error: his so-close shark, bright and friendly, no codes, and TRY AGAIN. Loading: his small shark
 * and three hopping gold dots, shown only after 200 ms so a quick load never flashes a spinner.
 * Never a stock spinner. The action is the screen's one gold primary.
 */
import { memo, useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import useUiReducedMotion from '../useUiReducedMotion';
import Lift from './Lift';
import Page from './Page';
import StickerButton from './StickerButton';
import { Name } from './Text';
import { ART, ART_RATIO } from './art';
import { INK, LINE, SPACE } from './tokens';

export type StateKind = 'empty' | 'error' | 'loading';

export type StatePanelProps = {
  readonly kind: StateKind;
  /** One line ("No coins here yet"). Loading may leave it out. */
  readonly line?: string;
  readonly action?: { readonly label: string; readonly onPress: () => void };
  /** VoiceOver for loading (default "Loading"). */
  readonly loadingLabel?: string;
  readonly style?: StyleProp<ViewStyle>;
};

/** How long a load must take before the loading panel shows. */
export const LOADING_DELAY_MS = 200;

const SHARK = {
  empty: { art: ART.sharkHappy, height: 98, ratio: ART_RATIO.sharkHappy },
  error: { art: ART.sharkSoClose, height: 88, ratio: ART_RATIO.sharkSoClose },
  loading: { art: ART.shark, height: 64, ratio: ART_RATIO.shark },
} as const;

function GoldDot({ index, reduced }: { index: number; reduced: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(index * 140, withRepeat(withSequence(
      withTiming(1, { duration: reduced ? 150 : 260, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: reduced ? 150 : 260, easing: Easing.in(Easing.quad) }),
      withTiming(0, { duration: 200 }),
    ), -1));
    return () => cancelAnimation(t);
  }, [index, reduced, t]);
  const style = useAnimatedStyle(() => (reduced ? { opacity: 0.5 + 0.5 * t.value } : { transform: [{ translateY: -8 * t.value }] }));
  return <Animated.View style={[{ width: 12, height: 12, borderRadius: 6, backgroundColor: INK.gold, borderWidth: LINE.chip, borderColor: INK.navy }, style]} />;
}

function StatePanelImpl({ kind, line, action, loadingLabel = 'Loading', style }: StatePanelProps) {
  const reduced = useUiReducedMotion();
  const [late, setLate] = useState(kind !== 'loading');
  useEffect(() => {
    if (kind !== 'loading') { setLate(true); return undefined; }
    setLate(false);
    const timer = setTimeout(() => setLate(true), LOADING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [kind]);
  if (!late) return null;
  const s = SHARK[kind];
  return (
    <Page style={style}>
      <View style={{ alignItems: 'center', gap: SPACE.base * 2 }} accessible={kind === 'loading'} accessibilityRole={kind === 'loading' ? 'progressbar' : undefined}
        accessibilityLabel={kind === 'loading' ? loadingLabel : undefined}>
        <Lift source={s.art} width={Math.round(s.height * s.ratio)} height={s.height} flat={kind !== 'loading'} />
        {line ? <Name align="center" lines={2}>{line}</Name> : null}
        {kind === 'loading' ? (
          <View style={{ flexDirection: 'row', gap: 8, height: 24, alignItems: 'flex-end', marginTop: 2 }}>
            {[0, 1, 2].map(i => <GoldDot key={i} index={i} reduced={reduced} />)}
          </View>
        ) : action ? (
          <StickerButton label={action.label} variant="primary" size="medium" width={160} onPress={action.onPress} style={{ marginTop: SPACE.base }} />
        ) : null}
      </View>
    </Page>
  );
}

const StatePanel = memo(StatePanelImpl);
export default StatePanel;
