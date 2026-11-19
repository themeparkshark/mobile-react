/**
 * The app's root view on iOS (installed by ui/installNativeGuards.ts through React Native's wrapper seam), for the
 * in-tree sheets (ui/sheetHost.ts, fix pass w5, lane host):
 * - While a sheet is up the screen behind it is hidden from VoiceOver and the accessibility tree (a native sheet did
 *   this by itself; an in-tree one lives in the same window as the screen).
 * - It notes where the last touch went down, so a sheet that closes can hand VoiceOver's focus back to the button
 *   that opened it.
 * It draws nothing and takes no touch of its own (no responder), so layout and every press are unchanged.
 */
import { useSyncExternalStore, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { overlayStack } from './sheetHost';
import { accessibleFromChain, fabricFindNodeAtPoint, shadowOf, tapThrough } from './tapThrough';

export type TouchPoint = { readonly x: number; readonly y: number; readonly at: number };
/** An opener older than this when its sheet opens is not the opener (the sheet came up by itself). */
export const OPENER_MAX_AGE_MS = 4000;

let lastTouch: TouchPoint | null = null;
export function noteTouch(x: number, y: number, at: number = Date.now()): void { lastTouch = { x, y, at }; }
/** Pure: the touch that opened a sheet appearing at `now`, if it is recent enough. */
export function openerFrom(touch: TouchPoint | null, now: number): TouchPoint | null {
  return touch && now - touch.at <= OPENER_MAX_AGE_MS ? touch : null;
}
export function openerNow(now: number = Date.now()): TouchPoint | null { return openerFrom(lastTouch, now); }

let readerOn = false;
let readerWatched = false;
function watchReader(): void {
  if (readerWatched) return;
  readerWatched = true;
  void AccessibilityInfo.isScreenReaderEnabled().then(on => { readerOn = on; }).catch(() => undefined);
  AccessibilityInfo.addEventListener('screenReaderChanged', (on: boolean) => { readerOn = on; });
}

/** A sheet closed with no sheet left: VoiceOver's focus goes back to the element under the touch that opened it. */
export function returnFocus(opener: TouchPoint | null): void {
  if (!readerOn || !opener) return;
  const find = fabricFindNodeAtPoint();
  const shadow = shadowOf(tapThrough.screenRoot());
  if (!find || !shadow) return;
  try {
    find(shadow, opener.x, opener.y, hit => {
      const element = accessibleFromChain(hit);
      if (element) AccessibilityInfo.sendAccessibilityEvent(element as never, 'focus');
    });
  } catch {
    // No hit test in this build: VoiceOver picks its own element, as it did before.
  }
}

type TouchEvent = { nativeEvent: { pageX: number; pageY: number } };

export default function SheetScreenRoot({ children }: { readonly children?: ReactNode }) {
  watchReader();
  const hidden = useSyncExternalStore(overlayStack.subscribe, () => overlayStack.count() > 0);
  return (
    <View style={styles.root} collapsable={false} accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      onTouchStart={(event: TouchEvent) => noteTouch(event.nativeEvent.pageX, event.nativeEvent.pageY)}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
