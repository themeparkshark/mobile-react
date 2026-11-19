/**
 * LockedResultActions: the one input lock every game's own results card wraps its buttons in
 * (fix pass w4 N03). A results card appears where the game's targets were a moment ago, so a kid
 * still tapping the drum, the board or the water would press PLAY AGAIN or DONE without ever seeing
 * the card. This is the same lock and the same dimmed look the loss card, the win card and the shell's
 * shared results card already use (T046, hold-2: useResultInputLock and mashGuard): the buttons sleep
 * RESULT_INPUT_LOCK_MS after the card appears, every tap on them while asleep restarts a
 * RESULT_QUIET_MS quiet wait, they rest at LOCKED_BUTTON_OPACITY and fade up on the UI thread when
 * they wake, and then the first press answers.
 *
 * `active` is "the buttons are on screen now" (a card that slides its buttons in later passes false
 * until then). `delayMs` is how long after mount the buttons fade in (the lock counts from then).
 * `resetKey` locks again when a card swaps to a new set of buttons.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import useResultInputLock from '../../components/rewards/useResultInputLock';
import { RESULT_INPUT_LOCK_MS } from '../../components/rewards/mashGuard';

export const RESULT_LOCK_TEST_ID = 'results-input-lock';

export default function LockedResultActions({ children, style, active = true, resetKey, delayMs = 0 }: {
  readonly children: React.ReactNode;
  readonly delayMs?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly active?: boolean;
  readonly resetKey?: string | number;
}) {
  const lock = useResultInputLock(active, RESULT_INPUT_LOCK_MS + Math.max(0, delayMs), undefined, resetKey ?? 0);
  return (
    <Animated.View style={[style, lock.dimStyle]}>
      {children}
      {/* Drawn last, so it sits over the buttons: a tap while locked lands here and only restarts the wait. */}
      {!lock.armed ? (
        <View testID={RESULT_LOCK_TEST_ID} style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => { lock.lockedTap(); return true; }} />
      ) : null}
    </Animated.View>
  );
}
