/**
 * StatePanel: empty, error and loading, one recipe (DIRECTION.md kit: Empty, error, loading).
 * Alex's shark (128 pt, kit.png), one line as a Heading and one large action. Empty: his happy
 * shark and a way to go play. Error: his so-close shark, bright and friendly, no codes, and TRY
 * AGAIN. Loading: his shark and three hopping gold dots, shown only after 200 ms so a quick load
 * never flashes a spinner; after `slowAfterMs` it says it is still loading and offers the retry.
 * Never a stock spinner. The action is the screen's one gold primary.
 *
 * It speaks SharkLoader's props by name (state, title, message, onRetry, retryLabel, action, icon,
 * compact, tone, slowAfterMs, testID: its 84 uses move without edits), plus the kit's own `kind`
 * and `line`. On its own it is a Page; `compact` (or inside a page already) it draws inline as level
 * 2 content with a smaller shark, never a page in a page.
 */
import { memo, useEffect, useState } from 'react';
import { View, type StyleProp } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import useUiReducedMotion from '../useUiReducedMotion';
import type { GameIconName } from '../iconNames';
import Lift from './Lift';
import Page from './Page';
import StickerButton from './StickerButton';
import { useInsidePage } from './StickerContext';
import { Body, Heading } from './Text';
import { ART, ART_RATIO } from './art';
import { iconArt } from './icons';
import type { LayoutStyle } from './style';
import { ART_SIZE, INK, LINE, SPACE } from './tokens';

export type StateKind = 'empty' | 'error' | 'loading';

export type StatePanelProps = {
  /** The kit's name; SharkLoader's `state` means the same. */
  readonly kind?: StateKind;
  readonly state?: StateKind;
  /** One line ("No coins here yet"); SharkLoader's `title`. */
  readonly line?: string;
  readonly title?: string;
  /** A second, softer sentence (SharkLoader's `message`). */
  readonly message?: string;
  readonly action?: { readonly label: string; readonly onPress: () => void; readonly icon?: GameIconName };
  /** Error and slow loading: TRY AGAIN (SharkLoader's names). */
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
  /** SharkLoader's icon: one of Alex's files above the line instead of the shark (icons.ts). */
  readonly icon?: GameIconName;
  /** Inline, level 2 content with a smaller shark (inside a card or a list). */
  readonly compact?: boolean;
  /** SharkLoader parity; the kit reads its place instead. */
  readonly tone?: 'onLight' | 'onBlue';
  /** Loading says it is still loading (and offers the retry) after this long. */
  readonly slowAfterMs?: number;
  /** VoiceOver for loading (default "Loading"). */
  readonly loadingLabel?: string;
  readonly testID?: string;
  readonly style?: StyleProp<LayoutStyle>;
};

/** How long a load must take before the loading panel shows. */
export const LOADING_DELAY_MS = 200;

/** The shark's height on its own and inline (pure, tested): never small on its own (kit.png: about 140). */
export function stateSharkHeight(kind: StateKind, compact: boolean): number {
  const full = kind === 'loading' ? Math.round(ART_SIZE.state * 0.78) : ART_SIZE.state;
  return compact ? Math.round(full * 0.6) : full;
}

const SHARK = {
  empty: { art: ART.sharkHappy, ratio: ART_RATIO.sharkHappy },
  error: { art: ART.sharkSoClose, ratio: ART_RATIO.sharkSoClose },
  loading: { art: ART.shark, ratio: ART_RATIO.shark },
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

function StatePanelImpl({ kind: kindProp, state, line, title, message, action, onRetry, retryLabel = 'TRY AGAIN', icon, compact: compactProp = false,
  slowAfterMs, loadingLabel = 'Loading', testID, style }: StatePanelProps) {
  const kind: StateKind = kindProp ?? state ?? 'loading';
  const reduced = useUiReducedMotion();
  const inPage = useInsidePage();
  const compact = compactProp || inPage;
  const [late, setLate] = useState(kind !== 'loading');
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (kind !== 'loading') { setLate(true); return undefined; }
    setLate(false);
    const timer = setTimeout(() => setLate(true), LOADING_DELAY_MS);
    const slowTimer = slowAfterMs ? setTimeout(() => setSlow(true), slowAfterMs) : null;
    return () => { clearTimeout(timer); if (slowTimer) clearTimeout(slowTimer); };
  }, [kind, slowAfterMs]);
  if (!late) return null;
  const s = SHARK[kind];
  const h = stateSharkHeight(kind, compact);
  const said = line ?? title ?? (kind === 'loading' && slow ? 'Still loading' : undefined);
  const art = iconArt(icon, 'StatePanel');
  const retry = (kind === 'error' || slow) && onRetry ? { label: retryLabel, onPress: onRetry } : null;
  const act = retry ?? (kind !== 'loading' ? action : undefined);
  const content = (
    <View testID={testID} style={{ alignItems: 'center', gap: SPACE.base * 2 }} accessible={kind === 'loading' && !slow} accessibilityRole={kind === 'loading' ? 'progressbar' : undefined}
      accessibilityLabel={kind === 'loading' ? loadingLabel : undefined}>
      {art ? <Lift source={art} width={Math.round(h * 0.7)} height={Math.round(h * 0.7)} /> : <Lift source={s.art} width={Math.round(h * s.ratio)} height={h} flat={kind !== 'loading'} />}
      {said ? <Heading size={compact ? 'sub' : 'heading'} role={kind === 'loading' ? 'none' : 'header'}>{said}</Heading> : null}
      {message ? <Body soft>{message}</Body> : null}
      {kind === 'loading' && !slow ? (
        <View style={{ flexDirection: 'row', gap: SPACE.base * 2, height: 24, alignItems: 'flex-end', marginTop: 2 }}>
          {[0, 1, 2].map(i => <GoldDot key={i} index={i} reduced={reduced} />)}
        </View>
      ) : act ? (
        <StickerButton label={act.label} variant="primary" size={compact ? 'medium' : 'large'} icon={'icon' in act ? act.icon : undefined} onPress={act.onPress} style={{ marginTop: SPACE.base }} />
      ) : null}
    </View>
  );
  if (compact) return <View style={[{ paddingVertical: SPACE.base * 2 }, style]}>{content}</View>;
  return <Page style={style}>{content}</Page>;
}

const StatePanel = memo(StatePanelImpl);
export default StatePanel;
