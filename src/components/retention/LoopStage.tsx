import { memo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { type SharedValue } from 'react-native-reanimated';
import StampRibbon from './StampRibbon';
import PrizeFlight, { type FlightSpec } from './PrizeFlight';
import LoopPerf from './LoopPerf';
import { BRAND } from '../../ui';

/** What the loop stage shows right now (the card host never re-renders for it: only its body does). */
export interface StageState {
  readonly title: string;
  readonly content: ReactNode;
  /** The card takes taps (it is in front and not stepping aside). */
  readonly showing: boolean;
  /** Backdrop taps close the card (never mid-moment). */
  readonly closable: boolean;
  readonly reducedMotion: boolean;
  /** Prizes flying home from their rows (the card steps aside). */
  readonly legs: readonly FlightSpec[] | null;
  /** When the prizes start flying (epoch ms): shared with the next card's entrance mark. */
  readonly legsAt?: number;
  /** Set on the UI thread when the last prize lands (the next card grows in from that frame). */
  readonly landed?: SharedValue<number>;
  /** The handoff's UI-thread mark: the flight starts the frame after the render that mounted it is on screen. */
  readonly flightMark?: SharedValue<number>;
  readonly perf: boolean;
  /**
   * The next card, mounted early and hidden in its own host while the chest card is still up (a big card mounting
   * can hold the screen for a few frames; doing it then means the prize flight and the next card's entrance never
   * stutter). It enters on the UI thread the frame the last prize lands.
   */
  readonly next?: { readonly title: string; readonly content: ReactNode; readonly live: boolean } | null;
}

export interface StageStore {
  get: () => StageState;
  set: (next: StageState) => void;
  subscribe: (fn: () => void) => () => void;
}

const EMPTY: StageState = { title: '', content: null, showing: false, closable: false, reducedMotion: false, legs: null, perf: false, next: null };

export function createStageStore(): StageStore {
  let state = EMPTY;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set: next => {
      if (next.title === state.title && next.content === state.content && next.showing === state.showing && next.closable === state.closable
        && next.reducedMotion === state.reducedMotion && next.legs === state.legs && next.legsAt === state.legsAt && next.perf === state.perf
        && next.next === state.next) return;
      state = next;
      subs.forEach(fn => fn());
    },
    subscribe: fn => { subs.add(fn); return () => { subs.delete(fn); }; },
  };
}

function useStage(store: StageStore): StageState {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/**
 * The loop overlay's stage: the dim and the card's animated host are mounted once and never re-render
 * (their props are stable), so a new card, a server answer or a state change inside the card can never
 * re-send the host's first-frame style (opacity 0) to the native view: the card cannot blink out mid-moment.
 * Only the body below the host (ribbon plus card) and the flight layer re-render, through the store.
 */
const LoopStage = memo(function LoopStage({ store, dimStyle, cardStyle, nextStyle, gutter, onBackdrop }: {
  readonly store: StageStore;
  readonly dimStyle: StyleProp<ViewStyle>;
  readonly cardStyle: StyleProp<ViewStyle>;
  /** The second host (the next card, mounted early and hidden). */
  readonly nextStyle: StyleProp<ViewStyle>;
  readonly gutter: number;
  readonly onBackdrop: () => void;
}) {
  return (
    <View style={StyleSheet.absoluteFill} collapsable={false}>
      <Animated.View style={dimStyle}>
        <Backdrop store={store} onBackdrop={onBackdrop} />
      </Animated.View>
      <View style={[StyleSheet.absoluteFill, styles.center, { paddingHorizontal: gutter }]} pointerEvents="box-none" collapsable={false}>
        <Animated.View style={cardStyle}>
          <Body store={store} />
        </Animated.View>
      </View>
      <View style={[StyleSheet.absoluteFill, styles.center, { paddingHorizontal: gutter }]} pointerEvents="box-none" collapsable={false}>
        <Animated.View style={nextStyle}>
          <NextBody store={store} />
        </Animated.View>
      </View>
      <Extras store={store} />
    </View>
  );
});
export default LoopStage;

function Backdrop({ store, onBackdrop }: { readonly store: StageStore; readonly onBackdrop: () => void }) {
  const s = useStage(store);
  const tap = useRef(onBackdrop);
  tap.current = onBackdrop;
  return <Pressable style={StyleSheet.absoluteFill} onPress={s.closable ? () => tap.current() : undefined} accessible={false} />;
}

function Body({ store }: { readonly store: StageStore }) {
  const s = useStage(store);
  // Never flattened (collapsable false), so switching taps on and off never re-creates the native views under the card.
  return (
    <View pointerEvents={s.showing ? 'box-none' : 'none'} style={styles.inner} collapsable={false}>
      <StampRibbon text={s.title} reducedMotion={s.reducedMotion} />
      {s.content}
    </View>
  );
}

function NextBody({ store }: { readonly store: StageStore }) {
  const s = useStage(store);
  if (!s.next) return null;
  // Never takes taps while it waits hidden over the chest card.
  return (
    <View pointerEvents={s.next.live ? 'box-none' : 'none'} style={styles.inner} collapsable={false}>
      <StampRibbon text={s.next.title} reducedMotion={s.reducedMotion} />
      {s.next.content}
    </View>
  );
}

function Extras({ store }: { readonly store: StageStore }) {
  const s = useStage(store);
  return (
    <>
      {s.legs && s.legs.length > 0 && <PrizeFlight legs={s.legs} origin={{ x: 0, y: 0 }} reducedMotion={s.reducedMotion} startAt={s.legsAt} landed={s.landed} mark={s.flightMark} />}
      {s.perf && <LoopPerf />}
    </>
  );
}

export const stageStyles = StyleSheet.create({
  dim: { backgroundColor: BRAND.navy },
  wrap: { alignItems: 'center', alignSelf: 'stretch' },
});

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  inner: { alignItems: 'center', alignSelf: 'stretch' },
});
