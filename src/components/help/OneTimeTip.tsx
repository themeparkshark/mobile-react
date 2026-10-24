import type { StyleProp, ViewStyle } from 'react-native';
import { TIP_COPY } from '../../services/help/helpTopics';
import type { TipId } from '../../services/help/seenTips';
import CoachTip from './CoachTip';
import { useOneTimeTip } from './HelpProvider';

/**
 * Drop-in one-time tip. `ready` is the caller's "the player is free" signal:
 * false during a mini-game, a moving line, a dialog or a Finn lesson.
 */
export default function OneTimeTip({ id, ready, style, compact, autoHideMs, instantExit }: {
  readonly id: Exclude<TipId, `game:${string}`>;
  readonly ready: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly compact?: boolean;
  /** 0 keeps the tip up until it is tapped (CoachTip's default leaves after 9 s). */
  readonly autoHideMs?: number;
  /** Leave at once (no fade), for a tip inside a card that reflows as it goes. */
  readonly instantExit?: boolean;
}) {
  const { visible, dismiss } = useOneTimeTip(id, ready);
  if (!visible) return null;
  const copy = TIP_COPY[id];
  return <CoachTip title={copy.title} body={copy.body} onDismiss={dismiss} style={style} compact={compact}
    instantExit={instantExit} {...(autoHideMs != null ? { autoHideMs } : null)} />;
}
