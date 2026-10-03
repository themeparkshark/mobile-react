/**
 * How much of the screen the keyboard covers, from the keyboard's own
 * height. Used instead of KeyboardAvoidingView, which (a) measures from its
 * own frame, so one placed under a header pads too little and leaves the
 * input behind the keyboard, and (b) on iOS returns 0 when Reduce Motion
 * with "Prefer Cross-Fade Transitions" is on. Apply it as paddingBottom on a
 * container that reaches the bottom of the window.
 */
import { useEffect, useState } from 'react';
import { Keyboard, LayoutAnimation, Platform, type KeyboardEvent } from 'react-native';

export function keyboardInset(event: Pick<KeyboardEvent, 'endCoordinates'>, windowHeight: number): number {
  const { height, screenY } = event.endCoordinates;
  // A floating or undocked iPad keyboard does not cover the bottom edge.
  if (screenY > 0 && screenY + height < windowHeight - 1) return 0;
  return Math.max(0, height);
}

export default function useKeyboardInset(windowHeight: number, reduced: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const animate = (duration?: number) => {
      if (Platform.OS === 'ios' && !reduced) {
        LayoutAnimation.configureNext({ duration: duration || 250, update: { type: LayoutAnimation.Types.keyboard } });
      }
    };
    const show = Keyboard.addListener(showEvent, (event) => {
      animate(event.duration);
      setInset(keyboardInset(event, windowHeight));
    });
    const hide = Keyboard.addListener(hideEvent, (event) => {
      animate(event?.duration);
      setInset(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [windowHeight, reduced]);
  return inset;
}
