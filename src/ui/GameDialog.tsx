/**
 * GameDialog (WS0 UI kit): the branded replacement for Alert.alert.
 *
 * Imperative, Alert-compatible (mount <GameDialogHost /> once near the root):
 *   gameAlert('Out of Tickets', 'Start a queue adventure to earn one.');
 *   const leave = await confirmGame({ title: 'Leave the line?', confirmLabel: 'Leave', destructive: true });
 *
 * Controlled, for a screen that owns the state:
 *   <GameDialog visible={open} title="Saved!" icon="check" buttons={[{ text: 'Nice' }]} onAnswer={() => setOpen(false)} />
 *
 * Look: Dustin's own modal template, the one TaskCoinModal and
 * UnfoundCoinModal use: his ribbon.png title (the Ribbon component) over the
 * house blue card with a white border, white copy, an optional GameIcon, and
 * his yellow image buttons stacked with the main action on top (red for
 * destructive, a quiet text action for cancel). The scrim is a light blur
 * with a navy tint, never black or grey.
 * Titles up to RIBBON_TITLE_MAX characters sit in the ribbon; a longer title
 * becomes a wrapping heading on the card (and warns in dev) so it never
 * shrinks to an unreadable size.
 * Motion (src/ui/motion.ts): the scrim fades in over DURATION.base, the card pops from 0.86 with
 * one overshoot (SPRING.pop) while it fades in over DURATION.quick, the ribbon drops in from above and
 * stamps down (SPRING.stamp, from 1.18), then the body and buttons arrive STAGGER.stepMs apart.
 * A celebrating dialog (a reward icon or a success haptic, never a destructive one) throws a pair of
 * gold star sparkles off the ribbon tails as it lands. It leaves quicker than it came: the card shrinks to
 * CARD_EXIT and stays solid until its last frames (DIALOG_CLOSE.cardMs, never a see-through card over the
 * buttons behind it), and the backdrop leaves last. A selection tick on open. Reduced motion fades.
 * The preference is known on the first render (useUiReducedMotion), so a
 * dialog that mounts already open still springs.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { modalLayers, useModalLayer } from './modalLayers';
import { Alert, Dimensions, Image as RNImage, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import useUiReducedMotion from './useUiReducedMotion';
import { haptic, queueHaptic } from '../gamekit/Haptics';
import { DURATION, EASE, SPRING, STAGGER } from './motionEasing';
import SparkleBurst from './SparkleBurst';
import { GoldBurst } from './GoldBurst';
import { COIN_FLIGHT, measureShelfTarget, prizeAt, shelfHitsValue, type Point } from './CoinFlight';
import { PrizeTrail } from '../fx/CoinTrails';
import { glanceGoal } from './goalGlance';
import { LinearGradient } from 'expo-linear-gradient';
import GameButton from './GameButton';
import GameIcon, { ICON_SOURCES } from './GameIcon';
import { resolveIconName } from './iconNames';
import type { GameIconName } from './iconNames';
import GameText from './GameText';
import Ribbon from '../components/Ribbon';
import {
  createDialogStore,
  dialogCelebrates,
  dialogTitleLayout,
  dismissAction,
  RIBBON_TITLE_MAX,
  layoutActions,
  type DialogRequest,
  type GameDialogButton,
  type GameDialogOptions,
} from './gameDialogModel';
import { BRAND, MOTION, SPACE, Z } from './tokens';

/** Dustin's modal card, as in UnfoundCoinModal and TaskCoinModal. */
export const DIALOG_CARD = {
  backgroundColor: '#0a77bf',
  borderRadius: 20,
  borderWidth: 2.5,
  borderColor: '#ffffff',
} as const;
/** The card pops in from this scale and leaves to CARD_EXIT. */
const CARD_FROM = 0.86;
const CARD_EXIT = 0.92;
/**
 * The close: a snappy shrink (the card stays solid until its last frames), then the backdrop leaves
 * last, so the screen behind never shows through a half-faded card.
 */
export const DIALOG_CLOSE = { cardMs: 140, scrimDelayMs: 60, scrimMs: 170 } as const;
/**
 * A card handing over to a queued one: the next card (already drawn, hidden, under this one) pops in on the UI thread
 * at this share of the shrink, so a card is on screen in every frame.
 */
export const HANDOFF_AT = 0.6;
/** The card's opacity at close progress e (0 to 1): solid for most of the shrink, gone at the end. Pure worklet. */
export function closeOpacity(e: number): number {
  'worklet';
  return 1 - e * e * e * e;
}
/** Each part (ribbon, body, buttons) pops and rises over PART_MS, STAGGER.stepMs after the one above. */
const PART_MS = DURATION.base;
const PARTS_MS = PART_MS + 2 * STAGGER.stepMs;
/**
 * Parts are fully opaque from their first frame: a half-faded yellow button over the blue card reads
 * as a disabled olive one, and a fade under the card's own fade flickers. They move only: a pop from
 * PART_FROM_SCALE with an 8 pt rise.
 */
export const PART_FROM_OPACITY = 1;
export const PART_FROM_SCALE = 0.9;
/** The card itself is fully visible after this long (ms), so nothing on it ever reads half there. */
export const CARD_FADE_MS = DURATION.tap;
/** Part i of the card at time `clock` (ms): pops from 0.9 and rises 8 pt into place. Pure worklet (unit tested). */
export function partStyle(clock: number, i: number, reduced: boolean) {
  'worklet';
  if (reduced) return {};
  const raw = Math.min(1, Math.max(0, (clock - i * STAGGER.stepMs) / PART_MS));
  // Ease out (quick arrival, soft landing).
  const t = 1 - (1 - raw) * (1 - raw) * (1 - raw);
  return { transform: [{ translateY: (1 - t) * 8 }, { scale: PART_FROM_SCALE + (1 - PART_FROM_SCALE) * t }] };
}
/** The icon stamps in on its own beat: small, past full size, then rest (with a gold glint on a reward). */
export const ICON_STAMP = { at: 110, from: 0.4, peak: 1.22 } as const;
/**
 * A celebrating dialog's prize: a bigger icon that stamps onto a fan of gold rays (the house GoldBurst),
 * the brightest thing on the screen, with the buzz on the stamp frame itself.
 */
export const DIALOG_PRIZE = { iconPt: 124, plainIconPt: 72, raysPt: 380, glowAmount: 1, bloomMs: 420,
  /** A wider fan of the same rays behind the card and the ribbon, so the burst reaches past the card's edges. */
  outerRaysPt: 660,
  /**
   * Taking the prize (OK): it lifts out of the card at the card icon's size and flies to the shelf (the Profile tab)
   * in flyMs, landing PRIZE_FLIGHT.endScale of its size (CoinFlight: its path, size and trail).
   */
  flyMs: 460 } as const;
/**
 * How long a card's opening keeps its motion in the view tree (keepInTree): the pop, the ribbon stamp and the prize's
 * stamp are all done inside this.
 */
export const OPEN_TREE_MS = 760;
/**
 * A sub-pixel `top` that changes with a moving value. On Fabric (Reanimated 3.16.7) opacity and transforms are written
 * straight onto the view, outside the view tree, while a layout prop such as `top` is committed into the tree with
 * every other prop of that frame. So while a dialog opens or closes, its motion is in the tree, and a React render
 * elsewhere (the map, a coin flight, a button laying out) can never re-apply an older card, scrim or prize for the rest
 * of the move: the w5 'card half see-through, then solid again, then gone with no shrink' close. Rounds to no
 * visible move (under a thousandth of a point).
 */
export function keepInTree(v: number): number {
  'worklet';
  return v * 0.0005;
}
/** A fresh dialog's card is solid inside this (ms): a pop, never a see-through card over the buttons behind it. */
export const CARD_SOLID_MS = 50;
/** The ribbon drops this far (pt) and stamps down from this scale. */
const RIBBON_DROP = 24;
const RIBBON_STAMP_FROM = 1.18;
/** The ribbon stamps from the card's first visible frame (an empty card never shows). */
export const RIBBON_AT = 0;
/** Where the ribbon's tails are (the ribbon spans the card's width, 85% of the screen up to 380 pt). */
const CARD_W = Math.min(380, Dimensions.get('window').width * 0.85);
const RIBBON_TAIL = { left: CARD_W * 0.06, right: CARD_W * 0.94, y: 30 } as const;
/**
 * The backdrop: underwater daylight, never dirty. Deep brand blue only at the top and bottom edges; across
 * the middle band (where the card and most buttons sit) a pale sky-blue haze that lightens what is behind
 * instead of darkening it, so cream reads as clean pale cream and blue as bright water (a dark tint over
 * cream read grey-green). Never black or grey, no blur pass.
 */
export const DIALOG_SCRIM = 'rgba(0,88,196,0.30)';
export const DIALOG_SCRIM_STOPS = ['rgba(6,96,206,0.46)', 'rgba(214,240,255,0.3)', 'rgba(214,240,255,0.3)', 'rgba(4,70,170,0.46)'] as const;
/** Where the backdrop's light band starts and ends (share of the screen): most of the screen stays nearly clear. */
export const DIALOG_SCRIM_AT = [0, 0.2, 0.82, 1] as const;
/** Message copy on the card, as in UnfoundCoinModal. */
export const DIALOG_COPY = '#e2f6ff';

export type { GameDialogButton, GameDialogOptions };

const store = createDialogStore((title, message, buttons) => {
  Alert.alert(title, message, buttons.map(button => ({ text: button.text, style: button.style, onPress: button.onPress })));
});

/** Show a dialog. Resolves with the index of the chosen button (null if closed without one). */
export function showGameDialog(options: GameDialogOptions): Promise<number | null> {
  return store.show(options);
}

/** Drop-in for Alert.alert(title, message, buttons). */
export function gameAlert(title: string, message?: string, buttons?: readonly GameDialogButton[], options: Omit<GameDialogOptions, 'title' | 'message' | 'buttons'> = {}) {
  void store.show({ ...options, title, message, buttons });
}

/** Two-button confirm. Resolves true only when the confirm button is chosen. */
export async function confirmGame({
  title,
  message,
  icon,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  destructive = false,
}: {
  title: string;
  message?: string;
  icon?: GameDialogOptions['icon'];
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  const index = await store.show({
    title,
    message,
    icon,
    haptic: destructive ? 'warning' : 'none',
    buttons: [
      { text: cancelLabel, style: 'cancel' },
      { text: confirmLabel, style: destructive ? 'destructive' : 'default' },
    ],
  });
  return index === 1;
}

export type GameDialogProps = GameDialogOptions & {
  readonly visible: boolean;
  /** Called after the close animation with the chosen button index, or null. */
  readonly onAnswer?: (index: number | null) => void;
  /** Extra content between the message and the buttons. */
  readonly children?: ReactNode;
  /** Run the chosen button's onPress after closing. Default true; the host sets false because the store runs it. */
  readonly runButtonHandlers?: boolean;
  /** Lift the card above the keyboard (dialogs whose children include a text field). Default false. */
  readonly avoidKeyboard?: boolean;
  /**
   * Which request this is (the host's queue id). When it changes while the dialog is up, the new card pops in on
   * the same backdrop.
   */
  readonly contentKey?: number | string;
  /**
   * The request waiting right behind this one (the host's queue). Its card is drawn hidden under this one, so the
   * moment this one is answered it pops in on the same backdrop with no render in between.
   */
  readonly next?: DialogCardContent | null;
  readonly testID?: string;
};

/** What one card shows. */
export type DialogCardContent = GameDialogOptions & { readonly key: number | string };

/**
 * One card's motion, all shared values (three slots per dialog: the card showing, the one waiting under it, and a
 * card that just left while its prize still flies). Nothing here ever needs a React render to move.
 */
type CardSlot = {
  readonly shown: SharedValue<number>;
  readonly pop: SharedValue<number>;
  readonly fade: SharedValue<number>;
  readonly exit: SharedValue<number>;
  /** 0 to 1 over OPEN_TREE_MS after the card opens: the card's motion stays in the view tree that long. */
  readonly life: SharedValue<number>;
  readonly parts: SharedValue<number>;
  readonly ribbon: SharedValue<number>;
  readonly tails: SharedValue<number>;
  readonly iconPop: SharedValue<number>;
  readonly iconSpark: SharedValue<number>;
  readonly prizeGlow: SharedValue<number>;
  readonly prizeBloom: SharedValue<number>;
  readonly stampArmed: SharedValue<number>;
  readonly raysX: SharedValue<number>;
  readonly raysY: SharedValue<number>;
  readonly raysOn: SharedValue<number>;
  /** The prize's flight: 0 parked, up to 1 landed. */
  readonly prize: SharedValue<number>;
  /** 1 once the prize has left the card (the card's own icon hides on that frame). */
  readonly iconGone: SharedValue<number>;
  /** Where the prize leaves from (the card's icon) and lands (the shelf), in window points; ready: 1 once known. */
  readonly from: SharedValue<Point>;
  readonly to: SharedValue<Point>;
  readonly ready: SharedValue<number>;
  /** Gold stars where the prize lands. */
  readonly land: SharedValue<number>;
};

function useCardSlot(): CardSlot {
  return {
    shown: useSharedValue(0), pop: useSharedValue(0), fade: useSharedValue(0), exit: useSharedValue(0),
    life: useSharedValue(0), parts: useSharedValue(0), ribbon: useSharedValue(0), tails: useSharedValue(0),
    iconPop: useSharedValue(1), iconSpark: useSharedValue(0), prizeGlow: useSharedValue(0), prizeBloom: useSharedValue(0),
    stampArmed: useSharedValue(0), raysX: useSharedValue(0), raysY: useSharedValue(0), raysOn: useSharedValue(0),
    prize: useSharedValue(0), iconGone: useSharedValue(0), from: useSharedValue<Point>({ x: 0, y: 0 }),
    to: useSharedValue<Point>({ x: 0, y: 0 }), ready: useSharedValue(0), land: useSharedValue(0),
  };
}

/**
 * Open a card: it pops from CARD_FROM with one overshoot, solid from its first frames, the ribbon stamps down, and a
 * prize stamps onto its rays. A worklet, so a queued card can open on the UI thread the frame the card above it
 * starts to go (no render in between). Called from JS for a dialog's first card.
 */
export function openSlot(s: CardSlot, o: { readonly handedOver: boolean; readonly celebrates: boolean; readonly prize: boolean;
  readonly reduced: boolean }): void {
  'worklet';
  s.exit.value = 0;
  s.pop.value = 0;
  s.iconGone.value = 0;
  s.prize.value = 0;
  s.land.value = 0;
  s.shown.value = 1;
  s.life.value = 0;
  s.life.value = withTiming(1, { duration: OPEN_TREE_MS });
  // Solid from its first frames (a pop, not a fade): never the screen behind ghosting through the card.
  s.fade.value = o.handedOver ? 1 : withTiming(1, { duration: o.reduced ? MOTION.fadeMs : CARD_SOLID_MS, easing: EASE.out });
  s.iconPop.value = o.reduced ? 1 : ICON_STAMP.from;
  if (!o.reduced) {
    s.iconPop.value = withDelay(ICON_STAMP.at, withSequence(
      withTiming(ICON_STAMP.peak, { duration: DURATION.tap + 30, easing: EASE.out }), withSpring(1, SPRING.pop)));
  }
  s.iconSpark.value = 0;
  s.prizeGlow.value = 0;
  s.prizeBloom.value = 0;
  if (o.prize) {
    // The rays gather behind the prize, bloom on the stamp frame, then settle to a warm glow.
    s.prizeGlow.value = o.reduced ? 0.7 : withDelay(ICON_STAMP.at - 60, withTiming(DIALOG_PRIZE.glowAmount, { duration: 220, easing: EASE.out }));
    if (!o.reduced) s.prizeBloom.value = withDelay(ICON_STAMP.at + DURATION.tap, withSequence(
      withTiming(1, { duration: 90, easing: EASE.out }), withTiming(0, { duration: DIALOG_PRIZE.bloomMs, easing: EASE.in })));
  }
  if (o.celebrates && !o.reduced) {
    s.iconSpark.value = withDelay(ICON_STAMP.at + DURATION.tap, withTiming(1, { duration: DURATION.sparkle, easing: EASE.out }));
  }
  s.pop.value = o.reduced ? 1 : withSpring(1, SPRING.pop);
  s.parts.value = 0;
  s.parts.value = o.reduced ? PARTS_MS : withTiming(PARTS_MS, { duration: PARTS_MS });
  s.ribbon.value = 0;
  s.ribbon.value = o.reduced ? 1 : withDelay(RIBBON_AT, withSpring(1, SPRING.stamp));
  s.tails.value = 0;
  if (o.celebrates && !o.reduced) {
    s.tails.value = withDelay(RIBBON_AT + 120, withTiming(1, { duration: DURATION.sparkle, easing: EASE.out }));
  }
  // A prize buzzes on its stamp frame (the peak of the pop), not on the open.
  s.stampArmed.value = o.prize && !o.reduced ? 1 : 0;
}

/** Does this card's content celebrate with a prize (a reward icon that stamps and can fly to the shelf)? Pure. */
function cardPrize(c: GameDialogOptions): boolean {
  return dialogCelebrates({ icon: c.icon, haptic: c.haptic ?? 'none', buttons: c.buttons }) && !!c.icon;
}

/** The haptic a card gives as it opens (a prize buzzes later, on its stamp frame). */
function openHaptic(c: GameDialogOptions, reduced: boolean) {
  const kind = c.haptic ?? 'none';
  if (cardPrize(c)) { if (reduced) { if (kind !== 'none') haptic(kind); else queueHaptic('hitMedium'); } return; }
  if (kind !== 'none') haptic(kind);
  else queueHaptic('tickSelection');
}


/** Controlled dialog. Button onPress handlers run after the close animation. */
export function GameDialog({
  visible,
  title,
  message,
  icon,
  buttons,
  dismissible,
  haptic: hapticKind = 'none',
  onAnswer,
  children,
  runButtonHandlers = true,
  avoidKeyboard = false,
  testID,
  equalChoices = false,
  contentKey,
  next = null,
}: GameDialogProps) {
  const reducedMotion = useUiReducedMotion();
  const [mounted, setMounted] = useState(() => visible && modalLayers.count() === 0);
  // Never a second sibling <Modal>: wait until every sheet or dialog opened before this one is gone
  // (ui/modalLayers.ts; a sibling iOS refuses to present froze the shop).
  const front = useModalLayer(visible || mounted, 'wait');
  const shown = visible && front;
  const closing = useRef(false);
  const chosen = useRef<number | null>(null);
  const scrim = useSharedValue(0);
  const slots = [useCardSlot(), useCardSlot(), useCardSlot()];
  const key = contentKey ?? 'one';
  const current: DialogCardContent = { key, title, message, icon, buttons, dismissible, haptic: hapticKind, equalChoices };
  /** A card that handed over to a queued one and is still mounted while its prize lands. */
  const [leaving, setLeaving] = useState<DialogCardContent | null>(null);
  const leavingKey = leaving && leaving.key !== key && leaving.key !== next?.key ? leaving.key : null;
  // Which slot each card uses (kept across renders, so a card that moves from waiting to showing keeps its motion).
  const slotOf = useRef(new Map<number | string, number>());
  const place = (k: number | string, taken: number[]) => {
    const had = slotOf.current.get(k);
    if (had !== undefined && !taken.includes(had)) return had;
    const free = [0, 1, 2].find(i => !taken.includes(i)) ?? 0;
    slotOf.current.set(k, free);
    return free;
  };
  const frontSlot = place(key, []);
  const leavingSlot = leavingKey !== null ? place(leavingKey, [frontSlot]) : null;
  const nextSlot = next ? place(next.key, leavingSlot === null ? [frontSlot] : [frontSlot, leavingSlot]) : null;
  for (const k of [...slotOf.current.keys()]) {
    if (k !== key && k !== leavingKey && k !== next?.key) slotOf.current.delete(k);
  }
  const nextRef = useRef<{ content: DialogCardContent | null; slot: number | null }>({ content: null, slot: null });
  nextRef.current = { content: next, slot: nextSlot };
  const dismiss = dismissAction(current);

  // Mount first, then animate: a dialog that waited its turn (queued behind another) mounts its views
  // in the render after it is shown, and an opening started before its backdrop existed never drew it.
  useEffect(() => {
    if (shown) setMounted(true);
    else openedFor.current = null;
  }, [shown]);
  /** The request the showing card was opened for (null while closed). */
  const openedFor = useRef<number | string | null>(null);
  useEffect(() => {
    if (shown && mounted && openedFor.current !== key) {
      // A new request taking over an open dialog: the backdrop is already up, only the card pops in.
      const handedOver = openedFor.current !== null;
      openedFor.current = key;
      closing.current = false;
      chosen.current = null;
      if (!handedOver) scrim.value = withTiming(1, { duration: reducedMotion ? MOTION.fadeMs : DURATION.base, easing: EASE.out });
      openSlot(slots[frontSlot]!, { handedOver, celebrates: dialogCelebrates({ icon, haptic: hapticKind, buttons }),
        prize: cardPrize(current), reduced: reducedMotion });
      openHaptic(current, reducedMotion);
    }
    // Opening only depends on visibility and which request is shown; haptic kind and motion are read at open time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, mounted, key]);

  /** The prize in flight (it holds the dialog's views until it lands) and whether the backdrop has gone. */
  const flight = useRef({ flying: new Set<number>(), seq: 0, scrimGone: false });
  const finish = () => {
    if (flight.current.flying.size > 0 || !flight.current.scrimGone) return;
    setMounted(false);
    setLeaving(null);
    const index = chosen.current;
    onAnswer?.(index);
    const button = index === null ? undefined : (buttons && buttons.length ? buttons : [{ text: 'OK' }])[index];
    if (runButtonHandlers) button?.onPress?.();
  };
  const prizeLanded = (id: number, landed: boolean) => {
    if (!flight.current.flying.delete(id)) return;
    if (landed) glanceGoal();
    finish();
  };
  const scrimGone = () => {
    flight.current.scrimGone = true;
    finish();
  };

  /** The queued card popped in on the UI thread: its open haptic, from JS. */
  const nextOpened = () => {
    const c = nextRef.current.content;
    if (c) openHaptic(c, reducedMotion);
  };
  /** The card that handed over has gone: answer it; the card already showing becomes the front one (no re-open). */
  const finishHandOff = (nextKey: number | string) => {
    const index = chosen.current;
    setLeaving(current);
    openedFor.current = nextKey;
    closing.current = false;
    chosen.current = null;
    onAnswer?.(index);
    const button = index === null ? undefined : (buttons && buttons.length ? buttons : [{ text: 'OK' }])[index];
    if (runButtonHandlers) button?.onPress?.();
  };

  /**
   * Taking a prize (OK on a reward dialog): it lifts out of the card's icon spot as the card shrinks, flies over the
   * backdrop with a gold trail and lands on the shelf (the Profile tab, which squashes as it arrives), so a kid sees
   * where it went. Drawn inside this dialog, above the backdrop, from shared values only: OK never mounts a view.
   * No shelf on screen (a game screen), Reduce Motion, or a cancel: nothing flies.
   */
  const launchPrize = (s: CardSlot, c: DialogCardContent, index: number | null, measure: () => void) => {
    if (!cardPrize(c) || index === null || reducedMotion) return;
    const list = c.buttons && c.buttons.length ? c.buttons : [{ text: 'OK' }];
    const button = list[index] as GameDialogButton | undefined;
    if (!button || button.style === 'cancel' || button.style === 'destructive') return;
    const go = () => {
      const id = ++flight.current.seq;
      flight.current.flying.add(id);
      const hits = shelfHitsValue();
      s.iconGone.value = 1;
      s.prize.value = 0;
      s.prize.value = withTiming(1, { duration: DIALOG_PRIZE.flyMs, easing: Easing.linear }, done => {
        // The Profile icon squashes and throws its stars on the landing frame (Wrapper, UI thread).
        if (done) hits.value += 1;
        runOnJS(prizeLanded)(id, done === true);
      });
      // A backstop only (never what times the move): a flight that never reports back cannot hold the dialog up.
      setTimeout(() => prizeLanded(id, false), DIALOG_PRIZE.flyMs + 1500);
    };
    if (s.ready.value === 1) go();
    else { pendingLaunch.current = go; measure(); }
  };
  /** A launch waiting for its first measure (a kid who tapped OK before the card settled). */
  const pendingLaunch = useRef<(() => void) | null>(null);
  const measured = (s: CardSlot) => {
    if (s.ready.value !== 1) return;
    const go = pendingLaunch.current;
    pendingLaunch.current = null;
    go?.();
  };

  const measureFns = useRef<(() => void)[]>([]);
  const close = (index: number | null) => {
    if (closing.current) return;
    closing.current = true;
    chosen.current = index;
    const s = slots[frontSlot]!;
    s.stampArmed.value = 0;
    flight.current.scrimGone = false;
    launchPrize(s, current, index, measureFns.current[frontSlot] ?? (() => undefined));
    const queued = nextRef.current;
    if (queued.content && queued.slot !== null) {
      // A card waits under this one: it pops in on the same backdrop as this one shrinks (UI thread, no render), and
      // this one is answered once it has gone.
      const back = slots[queued.slot]!;
      const opts = { handedOver: true, celebrates: dialogCelebrates({ icon: queued.content.icon, haptic: queued.content.haptic ?? 'none',
        buttons: queued.content.buttons }), prize: cardPrize(queued.content), reduced: reducedMotion };
      const nextKey = queued.content.key;
      s.exit.value = withTiming(HANDOFF_AT, { duration: DIALOG_CLOSE.cardMs * HANDOFF_AT, easing: EASE.in }, done => {
        if (!done) return;
        openSlot(back, opts);
        runOnJS(nextOpened)();
        s.exit.value = withTiming(1, { duration: DIALOG_CLOSE.cardMs * (1 - HANDOFF_AT), easing: Easing.linear }, gone => {
          if (gone) runOnJS(finishHandOff)(nextKey);
        });
      });
      return;
    }
    // The card shrinks and goes first (solid until its last frames); the backdrop leaves last.
    s.exit.value = withTiming(1, { duration: DIALOG_CLOSE.cardMs, easing: EASE.in });
    scrim.value = withDelay(DIALOG_CLOSE.scrimDelayMs, withTiming(0, { duration: DIALOG_CLOSE.scrimMs, easing: EASE.in }, done => {
      if (done) runOnJS(scrimGone)();
    }));
  };

  useEffect(() => {
    if (!visible && mounted && !closing.current) close(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // The backdrop's fade stays in the view tree (keepInTree), so a render elsewhere can never put back an older,
  // half-faded backdrop after it has gone.
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value, top: keepInTree(scrim.value) }));

  if (!mounted) return null;
  const cards: { content: DialogCardContent; slot: number; role: 'front' | 'next' | 'leaving' }[] = [];
  if (leaving && leavingSlot !== null) cards.push({ content: leaving, slot: leavingSlot, role: 'leaving' });
  if (next && nextSlot !== null) cards.push({ content: next, slot: nextSlot, role: 'next' });
  cards.push({ content: current, slot: frontSlot, role: 'front' });

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent
      onRequestClose={() => { if (dismiss !== null) close(dismiss); }}>
      <KeyboardAvoidingView testID={testID} enabled={avoidKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', zIndex: Z.dialog }}>
        <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
          {/* Underwater light, no blur pass: deeper blue at the edges, light in the middle so the colours stay clean. */}
          <LinearGradient pointerEvents="none" colors={DIALOG_SCRIM_STOPS} locations={DIALOG_SCRIM_AT}
            style={StyleSheet.absoluteFill} />
          <Pressable accessibilityLabel="Close" accessibilityRole="button" style={{ flex: 1 }}
            disabled={dismiss === null} onPress={() => { if (dismiss !== null) close(dismiss); }} />
        </Animated.View>
        {/* The waiting card sits under the showing one (drawn, hidden), then the showing card on top. */}
        {cards.map(card => (
          <DialogCard key={card.content.key} s={slots[card.slot]!} content={card.content} role={card.role} reduced={reducedMotion}
            onChoose={close} registerMeasure={fn => { measureFns.current[card.slot] = fn; }} onMeasured={measured}>
            {card.role === 'front' ? children : null}
          </DialogCard>
        ))}
        {/* Prizes fly above every card and the backdrop. */}
        {cards.map(card => cardPrize(card.content) && !reducedMotion
          ? <PrizeFlight key={`prize-${card.content.key}`} s={slots[card.slot]!} icon={card.content.icon!} /> : null)}
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** One card: the ribbon over the house blue card, the prize on its rays, the copy and the buttons. */
export function DialogCard({ s, content, role, reduced, onChoose, registerMeasure, onMeasured, children }: {
  readonly s: CardSlot;
  readonly content: DialogCardContent;
  readonly role: 'front' | 'next' | 'leaving';
  readonly reduced: boolean;
  readonly onChoose: (index: number) => void;
  readonly registerMeasure: (measure: () => void) => void;
  readonly onMeasured: (s: CardSlot) => void;
  readonly children?: ReactNode;
}) {
  const { title, message, icon, buttons, equalChoices = false } = content;
  const hapticKind = content.haptic ?? 'none';
  const actions = layoutActions(buttons, equalChoices);
  const celebrates = dialogCelebrates({ icon, haptic: hapticKind, buttons });
  const titleLayout = dialogTitleLayout(title);
  const isFront = role === 'front';
  useEffect(() => {
    if (__DEV__ && isFront && titleLayout.placement === 'card') {
      console.warn(`GameDialog: "${title}" is longer than ${RIBBON_TITLE_MAX} characters, so it moves off the ribbon. Pass a short title and put the rest in the message.`);
    }
  }, [isFront, title, titleLayout.placement]);
  // A card drawn ahead of its turn starts hidden (its slot may have held a card that just left).
  useEffect(() => {
    if (role === 'next') { s.shown.value = 0; s.ready.value = 0; s.prize.value = 0; s.iconGone.value = 0; }
    // Only on mount: a card's role moves on from 'next' to 'front' without a reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buzzStamp = () => {
    if (hapticKind !== 'none') haptic(hapticKind); else queueHaptic('hitMedium');
  };
  // The prize's buzz lands on its stamp frame (the icon reaching its peak), timed on the UI thread.
  useAnimatedReaction(() => s.stampArmed.value === 1 && s.iconPop.value >= ICON_STAMP.peak - 0.02, (now, before) => {
    if (!now || before) return;
    s.stampArmed.value = 0;
    runOnJS(buzzStamp)();
  });

  const outerRef = useRef<View>(null);
  const iconRef = useRef<View>(null);
  /** Where the prize leaves from and where it lands, measured once the card has settled (so OK flies it at once). */
  const measureFlight = () => {
    const node = iconRef.current;
    if (!node || !cardPrize(content)) return;
    node.measureInWindow((x, y, w, h) => {
      if (!Number.isFinite(x) || w <= 0) return;
      measureShelfTarget(to => {
        if (!to) return;
        s.from.value = { x: x + w / 2, y: y + h / 2 };
        s.to.value = to;
        s.ready.value = 1;
        onMeasured(s);
      });
    });
  };
  registerMeasure(measureFlight);
  useAnimatedReaction(() => s.shown.value === 1 && s.life.value >= 1, (now, before) => {
    if (now && !before) runOnJS(measureFlight)();
  });

  // Every part of the card keeps its motion in the view tree while it opens and while it closes (keepInTree): on
  // Fabric a React render elsewhere (the map, a coin flight) re-applies the props it last knew, and a value moved
  // only on the UI thread could come back stale for the rest of the close (a half-faded card snapping back solid).
  const cardStyle = useAnimatedStyle(() => ({
    opacity: s.shown.value * s.fade.value * closeOpacity(s.exit.value),
    transform: reduced ? [] : [
      { scale: (CARD_FROM + (1 - CARD_FROM) * s.pop.value) * (1 - (1 - CARD_EXIT) * s.exit.value) },
    ],
    top: keepInTree(s.life.value + s.exit.value),
  }));
  const ribbonStyle = useAnimatedStyle(() => {
    if (reduced) return {};
    const r = s.ribbon.value;
    // Solid from its first frame (a stamp): a see-through ribbon showed the buttons behind it.
    return { transform: [{ translateY: -RIBBON_DROP * (1 - r) }, { scale: RIBBON_STAMP_FROM + (1 - RIBBON_STAMP_FROM) * r }] };
  });
  const bodyStyle = useAnimatedStyle(() => partStyle(s.parts.value, 1, reduced));
  const buttonsStyle = useAnimatedStyle(() => partStyle(s.parts.value, 2, reduced));
  // The card's own prize hides on the frame the flying one leaves its spot (one prize, lifting out of the card).
  const iconStyle = useAnimatedStyle(() => ({ opacity: 1 - s.iconGone.value, transform: [{ scale: s.iconPop.value }] }));
  // The wide ray fan sits behind the card and the ribbon, centred on the prize, and turns with the card's own fan.
  const outerRaysStyle = useAnimatedStyle(() => ({ opacity: s.raysOn.value,
    transform: [{ translateX: s.raysX.value - DIALOG_PRIZE.outerRaysPt / 2 }, { translateY: s.raysY.value - DIALOG_PRIZE.outerRaysPt / 2 }] }));
  /** Where the prize sits in the card (layout, not transforms): the wide fan centres on it. */
  const placeRays = () => {
    const node = iconRef.current;
    const outer = outerRef.current;
    if (!node || !outer) return;
    node.measureLayout(outer, (x, y, w, h) => {
      s.raysX.value = x + w / 2;
      s.raysY.value = y + h / 2;
      s.raysOn.value = 1;
    }, () => {});
  };

  return (
    // Only the showing card takes touches; a card waiting its turn is hidden from touch and from VoiceOver. The showing
    // card stays in the dialog's own layout (so the keyboard lift still works); the others sit centred over it.
    <View pointerEvents={isFront ? 'box-none' : 'none'} accessibilityElementsHidden={!isFront}
      importantForAccessibility={isFront ? 'auto' : 'no-hide-descendants'}
      style={isFront ? { width: '100%', alignItems: 'center' } : [StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      <Animated.View ref={outerRef} accessibilityViewIsModal={isFront} accessibilityRole="alert"
        style={[{ width: '85%', maxWidth: 380, alignItems: 'center' }, cardStyle]}>
        {/* The prize's rays burst past the card: a wider fan behind the ribbon and the card (the card's own fan is on top). */}
        {celebrates && icon && <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0,
          width: DIALOG_PRIZE.outerRaysPt, height: DIALOG_PRIZE.outerRaysPt }, outerRaysStyle]}>
          <GoldBurst size={DIALOG_PRIZE.outerRaysPt} amount={s.prizeGlow} bloom={s.prizeBloom} reduced={reduced} raysOnly />
        </Animated.View>}
        {titleLayout.placement === 'ribbon' && (
          <Animated.View accessible accessibilityRole="header" accessibilityLabel={title} style={[{ width: '100%', zIndex: 2 }, ribbonStyle]}>
            <Ribbon text={titleLayout.text} />
            {celebrates && <>
              <SparkleBurst progress={s.tails} count={3} x={RIBBON_TAIL.left} y={RIBBON_TAIL.y} spread={[-200, -120]}
                dist={[22, 40]} size={[14, 18]} seed={3} />
              <SparkleBurst progress={s.tails} count={3} x={RIBBON_TAIL.right} y={RIBBON_TAIL.y} spread={[-60, 20]}
                dist={[22, 40]} size={[14, 18]} seed={5} />
            </>}
          </Animated.View>
        )}
        <View style={{
          ...DIALOG_CARD,
          width: '95%',
          marginTop: titleLayout.placement === 'ribbon' ? '-10%' : 0,
          paddingTop: titleLayout.placement === 'ribbon' ? SPACE.xxl + SPACE.sm : SPACE.xl,
          paddingHorizontal: SPACE.xl,
          paddingBottom: SPACE.lg,
          alignItems: 'center',
          gap: SPACE.md,
        }}>
          <Animated.View style={[{ alignSelf: 'stretch', alignItems: 'center', gap: SPACE.md }, bodyStyle]}>
          {titleLayout.placement === 'card' && (
            <GameText preset="title" tone="onBlue" align="center" accessibilityRole="header"
              style={{ textTransform: 'uppercase' }}>{titleLayout.text}</GameText>
          )}
          {icon && <Animated.View ref={iconRef} onLayout={celebrates ? placeRays : undefined}
            style={[{ alignItems: 'center', justifyContent: 'center' }, iconStyle]}>
            {/* A prize stamps onto a fan of gold rays: the brightest thing on the screen. */}
            {celebrates && <GoldBurst size={DIALOG_PRIZE.raysPt} amount={s.prizeGlow} bloom={s.prizeBloom} reduced={reduced}
              style={{ position: 'absolute' }} />}
            <GameIcon name={icon} size={celebrates ? DIALOG_PRIZE.iconPt : DIALOG_PRIZE.plainIconPt} />
            {/* A reward's icon lands with a ring of gold stars around it. */}
            {celebrates && <SparkleBurst progress={s.iconSpark} count={8} x={DIALOG_PRIZE.iconPt / 2} y={DIALOG_PRIZE.iconPt / 2}
              spread={[-210, 30]} dist={[52, 78]} size={[16, 22]} seed={9} />}
          </Animated.View>}
          {!!message && <GameText preset="body" tone="onBlue" align="center" style={{ color: DIALOG_COPY }}>{message}</GameText>}
          {children}
          </Animated.View>
          <Animated.View style={[{ alignSelf: 'stretch', gap: SPACE.xs, marginTop: SPACE.xs }, buttonsStyle]}>
            {actions.map(action => (
              <GameButton key={action.index} label={action.text} variant={action.variant} tone="onBlue" icon={action.icon} image={action.image}
                onPress={() => { if (isFront) onChoose(action.index); }} />
            ))}
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}

/**
 * The prize on its way to the shelf: it leaves the card's icon spot at the card icon's size (EASE.out, so it moves
 * at once), arcs low over the backdrop pulling a gold trail, shrinks into the Profile icon and lands with a pop of
 * gold stars. Shared values only; drawn by the dialog above everything else.
 */
function PrizeFlight({ s, icon }: { readonly s: CardSlot; readonly icon: GameIconName }) {
  const size = DIALOG_PRIZE.iconPt;
  const half = size / 2;
  const style = useAnimatedStyle(() => {
    const raw = s.prize.value;
    const at = prizeAt(raw, s.from.value, s.to.value);
    return { opacity: raw > 0 && raw < 1 ? 1 : 0, top: keepInTree(raw),
      transform: [{ translateX: at.x - half }, { translateY: at.y - half }, { rotate: `${at.rot}deg` }, { scale: at.scale }] };
  });
  const landStyle = useAnimatedStyle(() => ({ transform: [{ translateX: s.to.value.x }, { translateY: s.to.value.y }] }));
  return <>
    <PrizeTrail progress={s.prize} from={s.from} to={s.to} />
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, width: size, height: size }, style]}>
      {/* A plain image view (a pooled expo-image view handed on after a flight showed its gift on a map marker). */}
      <RNImage source={ICON_SOURCES[resolveIconName(icon) ?? 'gift']} fadeDuration={0} resizeMode="contain"
        style={{ width: size, height: size }} />
    </Animated.View>
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: 0, height: 0 }, landStyle]}>
      <SparkleBurst progress={s.land} count={COIN_FLIGHT.big.endSparkles} x={0} y={0} dist={[30, 62]} size={[16, 24]} gravity={14} seed={21} />
    </Animated.View>
  </>;
}

/**
 * Mount exactly once near the root (WS9 owns Root.tsx). Do not mount one per
 * screen: only the newest host shows dialogs.
 */
export function GameDialogHost() {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const [queued, setQueued] = useState<DialogRequest | null>(null);
  const [visible, setVisible] = useState(false);
  const current = useRef<DialogRequest | null>(null);
  useEffect(() => store.attach(next => {
    current.current = next;
    setRequest(next);
    setVisible(!!next);
  }, setQueued), []);
  if (!request) return null;
  // One dialog for the whole queue: the request waiting behind the open one is drawn hidden under it (next) and
  // pops in on the same backdrop the moment the open one is answered.
  const next: DialogCardContent | null = queued && queued.id !== request.id ? { key: queued.id, title: queued.title,
    message: queued.message, icon: queued.icon, buttons: queued.buttons, dismissible: queued.dismissible, haptic: queued.haptic,
    equalChoices: queued.equalChoices } : null;
  return <GameDialog contentKey={request.id} visible={visible} title={request.title} message={request.message}
    icon={request.icon} buttons={request.buttons} dismissible={request.dismissible} haptic={request.haptic} equalChoices={request.equalChoices}
    runButtonHandlers={false} next={next}
    onAnswer={index => { if (current.current) store.answer(current.current.id, index); }} />;
}

export default GameDialog;
