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
 *    own view controller, not under the host), and a sheet UIKit did not put up asks again, a few times.
 */
import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { I18nManager, StyleSheet } from 'react-native';
import { leavingSheetTap } from './modalLayers';
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

  // UIKit gets a moment to say the sheet is up. A refused host asks again. The host stays mounted with its children
  // (a remount would hand a card's Reanimated styles fresh views with values that no longer change).
  useEffect(() => {
    if (phase !== 'presenting' || blink) return undefined;
    const timer = setTimeout(() => {
      const next = doorPresentTimedOut(tries.current, now.current.wants);
      if (next === 'present_again') {
        tries.current += 1;
        if (__DEV__) console.log(`[door] no native onShow after ${DOOR_PRESENT_MS} ms: asking again (try ${tries.current})`);
        setBlink(true);
      } else if (next === 'gone') {
        freeSlot();
        setPhase('off');
      } else {
        freeSlot();
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
      const state = now.current;
      if (state.nested) return;
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
      hardwareAccelerated={props.hardwareAccelerated}
      onRequestClose={props.onRequestClose}
      onShow={(event: unknown) => {
        if (now.current.phase === 'lost' && !now.current.nested) modalDoor.occupy(id.current);
        if (now.current.phase === 'presenting' || now.current.phase === 'lost') setPhase('up');
        props.onShow?.(event);
      }}
      onDismiss={gone}
      visible={doorNativeVisible(phase) && !blink}
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
              onTouchEnd={(event: { nativeEvent: { pageX: number; pageY: number } }) => leavingSheetTap.note(event.nativeEvent.pageX, event.nativeEvent.pageY)}>
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
