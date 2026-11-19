/**
 * Every iOS sheet, drawn in-tree over the whole window (fix pass w5, lane host; why in ui/sheetHost.ts).
 *
 * Same props and same children as React Native's Modal (ui/DoorModal.tsx hands them over), with no UIKit
 * presentation or dismissal at all:
 * - The sheet is a child of whoever renders it, so it keeps every React context, and it is drawn inside
 *   react-native-screens' FullWindowOverlay: a view laid over the whole window, above the screen and above every
 *   older sheet (the newest is the window's front subview, so a sheet over a sheet is on top).
 * - Enter and leave run on the UI thread from one shared value: 'fade' fades, 'slide' rises on a settle spring with no
 *   overshoot and leaves on a short ease in, 'none' (most hosts: they animate their own card) is placed and removed at
 *   once. Reduce Motion and Battery Saver turn a slide into a quick fade.
 * - Touches: while it is up the sheet takes every touch over the window, like a native sheet. While it leaves it still
 *   holds them (what is drawn is what is tapped) but its buttons no longer answer; the first tap it held goes to what is
 *   under that point the moment it is gone (ui/tapThrough.ts), so a quick next press is never lost and never fires
 *   twice. A leave whose end never comes back still ends (sheetLeaveFallbackMs). The in-tree host itself takes no touch.
 * - onShow after its first frame, onDismiss once it is out of the tree, onRequestClose on VoiceOver's escape.
 * - Assistive tech: the overlay is modal (react-native-screens sets accessibilityViewIsModal on its container), the
 *   screen behind and every older sheet are hidden (ui/SheetScreenRoot.tsx), focus moves into the sheet when it
 *   appears, and returns to the element that opened it when the last sheet closes.
 * - Safe areas: the overlay is the whole window, so the notch and home bar insets are the screen's own.
 * - React Native measures the sheet's children in window points like the touch (sheetHost.overlayNodeStyle), so
 *   Pressability never cancels a press for a finger that moved a little, wherever the sheet's owner sits.
 */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { I18nManager, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import type { DoorModalProps } from './DoorModal';
import { leavingSheetTap } from './modalLayers';
import { SPRING } from './motion';
import { pressTrace } from './pressTrace';
import { overlayDrop, sheetOverlayContext, sheetPressContext, withOverlay, type SheetOverlayList, type SheetOverlaySet } from './sheetOverlay';
import SheetOverlayLayer, { SHEET_LAYER_OUT_MS } from './SheetOverlayLayer';
import { SHEET_RELEASE_FALLBACK_MS, SHEET_RELEASE_FRAMES, overlayNodeStyle, overlayStack, ownerMoved, sheetLeaveFallbackMs, sheetMotion, type OwnerPlace } from './sheetHost';
import { openerNow, returnFocus, type TouchPoint } from './SheetScreenRoot';
import { internalHandle, pressInside, tapThrough } from './tapThrough';
import useUiReducedMotion from './useUiReducedMotion';
import { useBatterySaver } from '../power/batterySaver';

/* eslint-disable @typescript-eslint/no-require-imports */
const FullWindowOverlayNative = require('react-native-screens/src/fabric/FullWindowOverlayNativeComponent').default;
const ScrollView = require('react-native/Libraries/Components/ScrollView/ScrollView');
const { VirtualizedListContextResetter } = require('@react-native/virtualized-lists');
/* eslint-enable @typescript-eslint/no-require-imports */

/** True inside an in-tree sheet's children: a sheet there is nested (it never replays a kept tap onto the screen). */
const InsideOverlay = createContext(false);

type Phase = 'off' | 'up' | 'closing';
let nextId = 1;
type TouchEvent = { nativeEvent: { pageX: number; pageY: number; tpsSheetNoted?: boolean } };
type Measurable = { measure?: (callback: (x: number, y: number, w: number, h: number, pageX: number, pageY: number) => void) => void };

export default function OverlaySheet(props: DoorModalProps) {
  const SheetOverlay = sheetOverlayContext();
  const SheetPress = sheetPressContext();
  const nested = useContext(InsideOverlay);
  const wants = props.visible !== false;
  const reduced = useUiReducedMotion();
  const saver = useBatterySaver();
  const motion = sheetMotion(props.animationType, reduced || saver);
  const { width, height } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase>('off');
  const id = useRef(0);
  if (id.current === 0) id.current = nextId++;
  const live = useRef(true);
  const now = useRef({ phase, wants, nested, props, motion });
  now.current = { phase, wants, nested, props, motion };
  const dismissTold = useRef(false);
  const showTold = useRef(false);
  const opener = useRef<TouchPoint | null>(null);
  const p = useSharedValue(motion.kind === 'none' ? 1 : 0);

  const [overlays, setOverlays] = useState<SheetOverlayList>([]);
  const setOverlay = useCallback<SheetOverlaySet>((key, node) => {
    if (!live.current) return;
    setOverlays(list => withOverlay(list, key, node));
    if (node == null) setTimeout(() => { if (live.current) setOverlays(list => overlayDrop(list, key)); }, SHEET_LAYER_OUT_MS + 60);
  }, []);
  const contentRef = useRef<unknown>(null);
  const pressAt = useCallback((x: number, y: number) => { pressInside(internalHandle(contentRef.current), x, y); }, []);

  // Where the owner sits, so the children measure in window points (sheetHost.overlayNodeStyle).
  const anchor = useRef<unknown>(null);
  const [owner, setOwner] = useState<OwnerPlace | null>(null);
  const measureOwner = useCallback(() => {
    const node = anchor.current as Measurable | null;
    try {
      node?.measure?.((x, y, _w, _h, pageX, pageY) => {
        if (!live.current || !Number.isFinite(pageX) || !Number.isFinite(pageY)) return;
        const next = { x, y, pageX, pageY };
        setOwner(prev => (ownerMoved(prev, next) ? next : prev));
      });
    } catch {
      // No measure (a test renderer): the children measure from the owner's place, as a native sheet's never did.
    }
  }, []);

  const gone = useCallback(() => {
    const state = now.current;
    if (state.phase === 'off') return;
    pressTrace('door.gone', () => `id=${id.current} phase=${state.phase} overlay=1`);
    overlayStack.remove(id.current);
    if (!dismissTold.current) { dismissTold.current = true; state.props.onDismiss?.(); }
    if (live.current) setPhase('off');
  }, []);
  const goneIfClosing = useCallback(() => { if (now.current.phase === 'closing' && !now.current.wants) gone(); }, [gone]);
  // Released: the leave has ended, the sheet is invisible and lets every touch through natively. It leaves the tree
  // only a couple of frames later (sheetHost.SHEET_RELEASE_FRAMES): a touch that landed on it before the release was
  // drawn still finds it in the tree (and is kept for the screen under it), and none can land on a sheet that is
  // still drawn natively but already gone from JS, where its touch would be lost (seen once in 4 on the map PLAY!
  // pill, phase log, fix pass w5).
  const [released, setReleased] = useState(false);
  const release = useCallback(() => {
    if (!live.current || now.current.phase !== 'closing' || now.current.wants) return;
    pressTrace('door.released', () => `id=${id.current} overlay=1`);
    setReleased(true);
  }, []);

  // Up: measured, listed, and on its way in on the UI thread, in the very commit that first draws it (not one
  // re-render later: on a busy phone that was 100 to 180 ms more before the root gate began to show, fix pass w5,
  // ROOT-GATE). Asked again while leaving: back from where it is.
  const showFrame = useRef(0);
  const enterNow = () => {
    measureOwner();
    overlayStack.add(id.current);
    cancelAnimation(p);
    if (motion.kind === 'none') p.value = 1;
    else if (motion.kind === 'fade') p.value = withTiming(1, { duration: motion.inMs, easing: Easing.out(Easing.quad) });
    else p.value = withSpring(1, { ...SPRING.settle, overshootClamping: true });
    if (showTold.current) return;
    // onShow once its first frame is drawn (a native sheet's onShow came after UIKit put it up).
    cancelAnimationFrame(showFrame.current);
    showFrame.current = requestAnimationFrame(() => {
      if (!live.current || !now.current.wants || now.current.phase === 'closing' || showTold.current) return;
      showTold.current = true;
      pressTrace('door.nativeShow', () => `id=${id.current} ${now.current.props.testID ?? 'sheet'} overlay=1`);
      now.current.props.onShow?.({ nativeEvent: {} });
    });
  };
  useLayoutEffect(() => {
    if (phase === 'off' && wants) {
      dismissTold.current = false;
      showTold.current = false;
      opener.current = openerNow();
      enterNow();
      setPhase('up');
    } else if (phase === 'up' && !wants) {
      cancelAnimationFrame(showFrame.current);
      setPhase('closing');
    } else if (phase === 'closing' && wants) {
      setReleased(false);
      enterNow();
      setPhase('up');
    }
  }, [phase, wants]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving: off the list at once (assistive tech moves on), out on the UI thread, out of the tree when that ends.
  useEffect(() => {
    if (phase !== 'closing') return undefined;
    overlayStack.remove(id.current);
    if (motion.outMs === 0) { release(); return undefined; }
    cancelAnimation(p);
    p.value = withTiming(0, { duration: motion.outMs, easing: Easing.in(Easing.quad) }, done => { if (done) runOnJS(release)(); });
    const timer = setTimeout(release, sheetLeaveFallbackMs(motion));
    return () => clearTimeout(timer);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Released and committed: React Native's hit test (findNodeAtPoint, 0.76) no longer sees this sheet (a box-none
  // overlay over a pass-through view), so the tap it held is pressed on the screen under it now, not two frames and a
  // tree removal later (0.5 to 0.9 s of a busy phone, phase log, fix pass w5). Only with no other sheet up: what is
  // under the tap then is that sheet, and the gone step below drops the tap.
  const deliverAtRelease = useCallback((why: string) => {
    if (now.current.nested || overlayStack.others(id.current)) return;
    const how = tapThrough.deliver();
    if (how !== 'none') pressTrace('tapThrough.deliver', () => `id=${id.current} ${how} at=${why}`);
  }, []);
  // A sheet with no leave of its own (animationType none: CalmModal and GameDialog animate their own card, which has
  // already ended) is released in the very commit that stops wanting it, not two commits later (each a second on a
  // busy phone: phase log, Rewards, fix pass w5).
  const shownReleased = released || (motion.outMs === 0 && !wants && phase !== 'off');
  const releasedRef = useRef(false);
  releasedRef.current = shownReleased;
  useEffect(() => {
    if (shownReleased && !now.current.wants) deliverAtRelease('release');
  }, [shownReleased]); // eslint-disable-line react-hooks/exhaustive-deps

  // Out of the tree once the release has had its frames (a frame clock that stalls still ends it).
  useEffect(() => {
    if (!released || phase !== 'closing') return undefined;
    let frame = 0;
    let left = SHEET_RELEASE_FRAMES;
    const tick = () => { left -= 1; if (left <= 0) goneIfClosing(); else frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    const timer = setTimeout(goneIfClosing, SHEET_RELEASE_FALLBACK_MS);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [released, phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (phase === 'off' && released) setReleased(false); }, [phase, released]);

  // Gone: the first tap held on the leaving sheet presses what is under it now; VoiceOver's focus goes home.
  const lastPhase = useRef<Phase>('off');
  useEffect(() => {
    const was = lastPhase.current;
    lastPhase.current = phase;
    pressTrace('door.phase', () => `id=${id.current} ${props.testID ?? 'sheet'} ${phase} wants=${wants} nested=${nested} overlay=1 up=${overlayStack.count()}`);
    if (phase !== 'off' || was === 'off') return;
    if (!nested && !overlayStack.others(id.current)) {
      const how = tapThrough.deliver();
      if (how !== 'none') pressTrace('tapThrough.deliver', () => `id=${id.current} ${how}`);
    } else if (!nested) {
      // Another sheet is up: what is under the tap is that sheet, and it never saw the press.
      tapThrough.drop();
    }
    if (overlayStack.count() === 0) returnFocus(opener.current);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Torn out of the tree (its owner stopped rendering it): off the list, and a kept tap reaches the screen.
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      cancelAnimationFrame(showFrame.current);
      const state = now.current;
      pressTrace('door.torn', () => `id=${id.current} phase=${state.phase} overlay=1`);
      overlayStack.remove(id.current);
      if (state.nested || state.phase === 'off') return;
      setTimeout(() => {
        if (overlayStack.count() === 0) { tapThrough.deliver(); returnFocus(opener.current); } else tapThrough.drop();
      }, 0);
    };
  }, []);

  const isTop = useSyncExternalStore(overlayStack.subscribe, () => overlayStack.top() === id.current);
  const enter = useAnimatedStyle(() => {
    if (motion.kind === 'slide') return { transform: [{ translateY: (1 - p.value) * height }] };
    if (motion.kind === 'fade') return { opacity: p.value };
    return {};
  }, [motion.kind, height]);

  // Wanted sheets mount their children in this very commit, like React Native's Modal: react-native-modal reads its
  // content ref in the same commit's callback, and with no ref its open animation never ends and it can never close.
  if (phase === 'off' && !wants) return null;

  // Leaving: the door is taking it down, or its owner's own leave animation has started. Its buttons rest, so a tap
  // then is only ever the screen's (kept and replayed there), never pressed on the sheet and again under it.
  const leaving = phase === 'closing' || (phase === 'up' && !wants) || props.leaving === true;
  const background = props.transparent === true ? 'transparent' : 'white';
  const place = overlayNodeStyle(owner);
  const onTouchStart = (event: TouchEvent) => {
    // The touch bubbles from a sheet inside this one to this one too: only the innermost notes it.
    if (event.nativeEvent.tpsSheetNoted) return;
    event.nativeEvent.tpsSheetNoted = true;
    measureOwner();
    // Going: the door is taking it down, or its owner's own leave animation has started (props.leaving).
    leavingSheetTap.note(event.nativeEvent.pageX, event.nativeEvent.pageY, Date.now(), now.current.phase === 'closing' || (now.current.phase === 'up' && !now.current.wants) || now.current.props.leaving === true, !now.current.nested);
    // Released in JS but not yet natively: the hit test already sees what is under, so the tap goes there at once.
    if (releasedRef.current) setTimeout(() => deliverAtRelease('touch'), 0);
  };

  return (
    <>
      {/* Zero size, no touch: tells the sheet where its owner sits, and is the screen's root for the replayed tap. */}
      <View pointerEvents="none" style={styles.anchor} collapsable={false}
        ref={(host: unknown) => { anchor.current = host; if (host && !nested) tapThrough.setScreenRoot(internalHandle(host)); }} />
      <FullWindowOverlayNative style={[styles.overlay, { width, height }, place]} pointerEvents={shownReleased ? 'box-none' : undefined}>
        {/* Released: hidden by a plain view's style. Reanimated re-applies the leave's last animated opacity on every
            commit, so with a stalled frame clock the sheet would stay drawn mid-fade while it let touches through
            (W4-SMOKE-2: a tap through a gate a kid could still see). */}
        <View collapsable={false} style={[StyleSheet.absoluteFill, shownReleased && styles.released]} pointerEvents={shownReleased ? 'none' : 'box-none'}>
        <Animated.View collapsable={false} testID={props.testID} style={[StyleSheet.absoluteFill, enter]}
          // Up or leaving, the sheet takes every touch over the window (a native sheet did); leaving, its buttons rest.
          // Released (invisible, about to leave the tree), every touch goes to what is under it.
          pointerEvents={shownReleased ? 'none' : 'auto'}
          accessibilityElementsHidden={!isTop || leaving}
          importantForAccessibility={!isTop || leaving ? 'no-hide-descendants' : 'auto'}
          onAccessibilityEscape={props.onRequestClose ? () => props.onRequestClose?.({ nativeEvent: {} }) : undefined}
          onTouchStart={onTouchStart}>
          <VirtualizedListContextResetter>
            <ScrollView.Context.Provider value={null}>
              <InsideOverlay.Provider value>
                <SheetOverlay.Provider value={setOverlay}>
                  <SheetPress.Provider value={pressAt}>
                    <View ref={contentRef as never} collapsable={false} style={[styles.container, { backgroundColor: background }]} pointerEvents={leaving ? 'none' : 'box-none'}>
                      {props.children as ReactNode}
                      {overlays.map(item => <SheetOverlayLayer key={`${item.key}.${item.gen}`} leaving={item.leaving}>{item.node}</SheetOverlayLayer>)}
                    </View>
                  </SheetPress.Provider>
                </SheetOverlay.Provider>
              </InsideOverlay.Provider>
            </ScrollView.Context.Provider>
          </VirtualizedListContextResetter>
        </Animated.View>
        </View>
      </FullWindowOverlayNative>
    </>
  );
}

const side = I18nManager.getConstants().isRTL ? 'right' : 'left';
const styles = StyleSheet.create({
  anchor: { position: 'absolute', top: 0, [side]: 0, width: 0, height: 0 },
  overlay: { position: 'absolute' },
  released: { opacity: 0 },
  container: { [side]: 0, top: 0, flex: 1 },
});
