import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { TIP_COPY } from '../../services/help/helpTopics';
import type { TipId } from '../../services/help/seenTips';
import CoachTip from './CoachTip';
import { useOneTimeTip } from './HelpProvider';

/**
 * Drop-in one-time tip. `ready` is the caller's "the player is free" signal:
 * false during a mini-game, a moving line, a dialog or a Finn lesson.
 */
export default function OneTimeTip({ id, ready, style, compact, autoHideMs, onVisibleChange, small, art, pointerLeft, fit, narrow, artImages }: {
  readonly id: Exclude<TipId, `game:${string}`>;
  readonly ready: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly compact?: boolean;
  /** 0 keeps the tip up until it is tapped (CoachTip's default leaves after 9 s). */
  readonly autoHideMs?: number;
  /** Tells the screen when the tip is up, so nothing else (a toast, a nudge) asks at the same time. */
  readonly onVisibleChange?: (visible: boolean) => void;
  readonly small?: boolean;
  readonly art?: ReactNode;
  readonly pointerLeft?: number;
  readonly fit?: boolean;
  readonly narrow?: boolean;
  readonly artImages?: number;
}) {
  const { visible, dismiss } = useOneTimeTip(id, ready);
  useEffect(() => {
    if (!onVisibleChange) return undefined;
    onVisibleChange(visible);
    return visible ? () => onVisibleChange(false) : undefined;
  }, [visible, onVisibleChange]);
  if (!visible) return null;
  const copy = TIP_COPY[id];
  return <CoachTip title={copy.title} body={copy.body} onDismiss={dismiss} style={style} compact={compact}
    small={small} art={art} pointerLeft={pointerLeft} fit={fit} narrow={narrow} artImages={artImages}
    {...(autoHideMs != null ? { autoHideMs } : null)} />;
}
