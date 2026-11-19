/**
 * iOS: every React Native <Modal> in the app, react-native-modal's included (installed through React Native's
 * ModalInjection seam by ui/installNativeGuards.ts). Same props and same children as React Native's own Modal, with
 * three differences that end the native modal races (see ui/nativeModalDoor.ts):
 *
 * 1. One at a time. A top-level sheet presents only with the door's slot, and holds it until UIKit says it is gone.
 *    A sheet inside another sheet's children presents from that sheet, so it does not wait.
 * 2. Never dismissed mid-present (UIKit ignores that and leaves an orphan on screen): a sheet asked to go while it is
 *    still coming up goes as soon as UIKit reports it up.
 * 3. A refused host can never take a touch. The host is pointerEvents box-none (a real sheet's contents live in its
 *    own view controller, not under the host). A sheet UIKit is slow to report is never presented again (that hid it
 *    mid-present, fix pass w4): after one long wait the door lets it go and its owner hears onPresentLost.
 * 4. A tap on a sheet that is leaving reaches the button under it once the sheet is gone (ui/tapThrough.ts).
 */
import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { I18nManager, StyleSheet } from 'react-native';
import { leavingSheetTap } from './modalLayers';
import { pressTrace } from './pressTrace';
import { tapThrough, type ChainNode } from './tapThrough';
import {
  DOOR_DISMISS_ANIMATED_MS, DOOR_DISMISS_MS, DOOR_PRESENT_MS, DOOR_TORN_ANIMATED_MS, DOOR_TORN_MS,
  doorNativeVisible, doorPresentTimedOut, modalDoor, type DoorPhase,
} from './nativeModalDoor';

/* eslint-disable @typescript-eslint/no-require-imports */
const RCTModalHostView = require('react-native/Libraries/Modal/RCTModalHostViewNativeComponent').default;
const ScrollView = require('react-native/Libraries/Components/ScrollView/ScrollView');
const View = require('react-native/Libraries/Components/View/View');
const AppContainer = require('react-native/Libraries/ReactNative/AppContainer');
const { RootTagContext } = require('react-native/Libraries/ReactNative/RootTag');
const { VirtualizedListContextResetter } = require('@react-native/virtualized-lists');
/* eslint-enable @typescript-eslint/no-require-imports */

/** True inside a sheet's children: UIKit presents what is there from that sheet, so it neither waits nor blocks. */
const InsideNativeModal = createContext(false);
let nextId = 1;
/** Phase log only: every host that is not off, so a refused present names what was up at that moment. */
const doorsUp = new Map<number, string>();
const doorsText = () => [...doorsUp].map(([k, v]) => `${k}:${v}`).join(' ');

export interface DoorModalProps {
  readonly visible?: boolean;
  readonly children?: ReactNode;
  readonly transparent?: boolean;
  readonly animationType?: 'none' | 'slide' | 'fade';
  readonly presentationStyle?: string;
  readonly hardwareAccelerated?: boolean;
  readonly statusBarTranslucent?: boolean;
  readonly supportedOrientations?: readonly string[];
  readonly testID?: string;
  readonly onShow?: (event: unknown) => void;
  readonly onDismiss?: () => void;
  readonly onRequestClose?: (event: unknown) => void;
  readonly onOrientationChange?: (event: unknown) => void;
  /** UIKit never put this sheet up, after every try: nothing is on screen, so its owner can let it go. */
  readonly onPresentLost?: () => void;
}

const respond = () => true;
/** How often, and how many times, a sheet not yet reported up is nudged (see the nudge in DoorModal). */
export const DOOR_NUDGE_MS = 600;
export const DOOR_NUDGES = 12;
/** The renderer's fiber behind a host view (React Native's own public-instance field, read as the inspector does). */
function internalHandle(host: unknown): ChainNode | null {
  const h = host as { __internalInstanceHandle?: ChainNode; _internalInstanceHandle?: ChainNode };
  return h._internalInstanceHandle ?? h.__internalInstanceHandle ?? null;
}

export default function DoorModal(props: DoorModalProps) {
  const nested = useContext(InsideNativeModal);
  const rootTag = useContext(RootTagContext);
  const wants = props.visible !== false;
  const animated = !!props.animationType && props.animationType !== 'none';
  const [phase, setPhase] = useState<DoorPhase>('off');
  // One commit with the native host told to hide: React Native's host then asks UIKit to present again.
  const [blink, setBlink] = useState(false);
  const id = useRef(0);
  if (id.current === 0) id.current = nextId++;
  const live = useRef(true);
  const now = useRef({ phase, wants, animated, nested, props });
  now.current = { phase, wants, animated, nested, props };
  const tries = useRef(0);
  const dismissTold = useRef(false);

  const freeSlot = () => { if (!now.current.nested) modalDoor.release(id.current); };
  const gone = () => {
    pressTrace('door.gone', () => `id=${id.current} phase=${now.current.phase}`);
    if (!dismissTold.current) { dismissTold.current = true; now.current.props.onDismiss?.(); }
    freeSlot();
    if (live.current) setPhase('off');
  };

  useLayoutEffect(() => {
    if (phase === 'off' && wants) {
      tries.current = 0;
      dismissTold.current = false;
      if (nested) { setPhase('presenting'); return; }
      setPhase('queued');
      modalDoor.request(id.current, () => { if (live.current) setPhase('presenting'); });
    } else if (phase === 'queued' && !wants) {
      modalDoor.cancel(id.current);
      setPhase('off');
    } else if (phase === 'up' && !wants) {
      setPhase('closing');
    } else if (phase === 'lost' && !wants) {
      setPhase('off');
    }
  }, [phase, wants, nested]);

  useEffect(() => { if (blink) setBlink(false); }, [blink]);
  // A sheet asked for but not yet reported up gets a harmless prop change every DOOR_NUDGE_MS (fix pass w4, N02).
  // Read off the phase log: some sheets (the grown-up gate inside the coin card) drew only about 4.5 s later, right
  // after an unrelated re-render of their host, or never: React Native's host presents on a props update, so a
  // present it skipped waited for the next one. The nudge is that update. It never hides the sheet, so it can never
  // dismiss one mid-present; on a sheet already up React Native's host does nothing with it.
  const [nudge, setNudge] = useState(0);
  useEffect(() => {
    if ((phase !== 'presenting' && phase !== 'lost') || !wants) return undefined;
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      if (count > DOOR_NUDGES) { clearInterval(timer); return; }
      pressTrace('door.nudge', () => `id=${id.current} n=${count}`);
      setNudge(n => n + 1);
    }, DOOR_NUDGE_MS);
    return () => clearInterval(timer);
  }, [phase, wants]);
  // A top-level sheet just left the screen: the first tap that landed on it while it was leaving now reaches the
  // screen under it (ui/tapThrough.ts). This effect runs after the commit that took the sheet out of the tree.
  const lastPhase = useRef<DoorPhase>('off');
  useEffect(() => {
    const was = lastPhase.current;
    lastPhase.current = phase;
    if (phase === 'off' && was !== 'off' && !nested) {
      const how = tapThrough.deliver();
      if (how !== 'none') pressTrace('tapThrough.deliver', () => `id=${id.current} ${how}`);
    }
  }, [phase, nested]);
  useEffect(() => {
    if (phase === 'off') doorsUp.delete(id.current); else doorsUp.set(id.current, `${props.testID ?? 'sheet'}${nested ? '/n' : ''}/${phase}`);
    pressTrace('door.phase', () => `id=${id.current} ${props.testID ?? 'sheet'} ${phase} wants=${wants} nested=${nested} holder=${modalDoor.holder()} waiting=${modalDoor.waiting()} up=[${doorsText()}]`);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // UIKit gets a moment to say the sheet is up. A refused host asks again. The host stays mounted with its children
  // (a remount would hand a card's Reanimated styles fresh views with values that no longer change).
  useEffect(() => {
    if (phase !== 'presenting' || blink) return undefined;
    const timer = setTimeout(() => {
      const next = doorPresentTimedOut(tries.current, now.current.wants);
      if (next === 'present_again') {
        tries.current += 1;
        pressTrace('door.presentAgain', () => `id=${id.current} try=${tries.current} up=[${doorsText()}]`);
        setBlink(true);
      } else if (next === 'gone') {
        freeSlot();
        setPhase('off');
      } else {
        freeSlot();
        pressTrace('door.lost', () => `id=${id.current} up=[${doorsText()}]`);
        setPhase('lost');
        now.current.props.onPresentLost?.();
      }
    }, DOOR_PRESENT_MS);
    return () => clearTimeout(timer);
  }, [phase, blink]); // eslint-disable-line react-hooks/exhaustive-deps

  // A sheet asked to go: UIKit's completion frees the slot; one it refused never sends it, so a fallback does.
  useEffect(() => {
    if (phase !== 'closing') return undefined;
    const timer = setTimeout(gone, animated ? DOOR_DISMISS_ANIMATED_MS : DOOR_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Torn out of the tree (its parent stopped rendering it): UIKit takes it down on its own in a moment.
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      doorsUp.delete(id.current);
      pressTrace('door.torn', () => `id=${id.current} phase=${now.current.phase}`);
      const state = now.current;
      if (state.nested) return;
      // Torn out while it was on screen: the tap kept for the screen under it goes there once this commit is done.
      if (state.phase !== 'off' && state.phase !== 'queued') setTimeout(() => { tapThrough.deliver(); }, 0);
      if (state.phase === 'queued' || state.phase === 'off' || state.phase === 'lost') modalDoor.cancel(id.current);
      else modalDoor.releaseAfter(id.current, state.animated ? DOOR_TORN_ANIMATED_MS : DOOR_TORN_MS);
    };
  }, []);

  // Wanted sheets mount their children in this very commit, like React Native's Modal: react-native-modal reads its
  // content ref in the same commit's callback, and with no ref its open animation never ends and it can never close.
  if (phase === 'off' && !wants) return null;

  const presentationStyle = props.presentationStyle ?? (props.transparent === true ? 'overFullScreen' : 'fullScreen');
  const containerStyles = { backgroundColor: props.transparent === true ? 'transparent' : 'white' };
  const children = __DEV__ ? <AppContainer rootTag={rootTag}>{props.children}</AppContainer> : props.children;

  return (
    <RCTModalHostView
      animationType={props.animationType ?? 'none'}
      presentationStyle={presentationStyle}
      transparent={props.transparent}
      // Android only (ignored on iOS): the nudge's prop change when the caller did not set it.
      hardwareAccelerated={props.hardwareAccelerated ?? nudge % 2 === 1}
      onRequestClose={props.onRequestClose}
      onShow={(event: unknown) => {
        pressTrace('door.nativeShow', () => `id=${id.current} phase=${now.current.phase}`);
        if (now.current.phase === 'lost' && !now.current.nested) modalDoor.occupy(id.current);
        if (now.current.phase === 'presenting' || now.current.phase === 'lost') setPhase('up');
        props.onShow?.(event);
      }}
      onDismiss={gone}
      // A sheet that is up and no longer wanted is hidden natively in this same commit (not one commit later through
      // 'closing'): the leaving sheet covers the screen for as short a time as UIKit allows.
      visible={doorNativeVisible(phase) && !blink && !(phase === 'up' && !wants)}
      ref={(host: unknown) => { if (host && !nested) tapThrough.setScreenRoot(internalHandle(host)); }}
      statusBarTranslucent={props.statusBarTranslucent}
      identifier={id.current}
      style={styles.modal}
      pointerEvents="box-none"
      onStartShouldSetResponder={respond}
      supportedOrientations={props.supportedOrientations}
      onOrientationChange={props.onOrientationChange}
      testID={props.testID}>
      <VirtualizedListContextResetter>
        <ScrollView.Context.Provider value={null}>
          <InsideNativeModal.Provider value>
            <View style={[styles.container, containerStyles]} collapsable={false}
              // On touch down: the sheet can be gone before the finger lifts, and that touch would never end here.
              onTouchStart={(event: { nativeEvent: { pageX: number; pageY: number; tpsSheetNoted?: boolean } }) => {
                // The touch bubbles from a sheet inside this one (the gate) to this sheet too: only the innermost notes it.
                if (event.nativeEvent.tpsSheetNoted) return;
                event.nativeEvent.tpsSheetNoted = true;
                leavingSheetTap.note(event.nativeEvent.pageX, event.nativeEvent.pageY, Date.now(), now.current.phase === 'closing' || (now.current.phase === 'up' && !now.current.wants), !now.current.nested);
              }}>
              {children}
            </View>
          </InsideNativeModal.Provider>
        </ScrollView.Context.Provider>
      </VirtualizedListContextResetter>
    </RCTModalHostView>
  );
}

const side = I18nManager.getConstants().isRTL ? 'right' : 'left';
const styles = StyleSheet.create({
  modal: { position: 'absolute' },
  container: { [side]: 0, top: 0, flex: 1 },
});
