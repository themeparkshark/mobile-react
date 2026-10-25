import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation, Easing, runOnJS, useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withRepeat,
  withSequence, withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import type { PaidRewards } from '../../api/endpoints/retention';
import { isDimFlashingLightsEnabled } from '../../../modules/flash-safety';
import { haptic, playHaptic, queueHaptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import { usePowerBudget } from '../../power';
import { doneDelay, isBigReward, rewardRows, rowSchedule, type RewardRow } from '../../services/retention/logic';
import { FULL_SET, LEVEL_CHEST, LOOP_CUES, REPEAT_CHEST, REVEAL_ROWS, countStart, lidDelay, rowCountMs } from '../../services/retention/loopMotion';
import CardSurface, { CARD_FRAME } from './CardSurface';
import type { Point } from './PrizeFlight';
import GoldCheckCoin from './GoldCheckCoin';
import { BRAND, GameIcon, ICON_SOURCES } from '../../ui';
import { GoldBurst, RadialFlash, SparkleBurst } from '../../ui/GoldBurst';
import { COUNT, DURATION, PARTICLES, SPRING, flashPeak, momentBeats, momentParticles } from '../../ui/motion';
import { EASE } from '../../ui/motionEasing';
import RewardBurst from '../RewardBurst';
import { useAmbient } from './power';
import { NOT_YET, withDelayAfter } from './delayUntil';

const BOX = require('../../../assets/images/retention/mystery-box.png');
/** Everything around the chest and rows on a known-prize card (safe areas, ribbon, header, flame row, button, padding). */
const CHROME_KNOWN = 475;
/**
 * The rows area for this many small prize rows and hero cards: a small row is 44 pt plus its 6 pt gap, a hero card
 * 102 pt plus its gap, and the list's own padding. Sized to the content, so the card never ends in empty blue.
 */
export function rowsFor(small: number, big: number): number {
  return small * 50 + big * 108 + 10;
}
const FREEZE = require('../../../assets/images/retention/freeze.png');
/** The plates start this long after the chips begin to fade (the chips are below 30 percent by then). */
export const SLOTS_AFTER_HINT_MS = 130;
const SOFT = require('../../../assets/images/reveal/soft-spot.webp');

Animated.addWhitelistedNativeProps({ text: true });
const AnimatedInput = Animated.createAnimatedComponent(TextInput);

/** Where each prize row's icon sits on screen when AWESOME is tapped (the prizes fly home from there). */
export interface PrizeOrigin extends Point { readonly kind: RewardRow['kind']; readonly amount: number }

/** After this long the shake settles into a calm "Still opening..." (the request has its own 6 s timeout). */
const STALL_MS = 6000;
/** The strong gather shake never runs longer than this (then a calm glow and bob while a slow server answers). */
export const GATHER_CAP_MS = 1500;

/**
 * A chest you open, on the chest beats (momentBeats('chest')):
 * 1. gather: the chest shakes harder and harder, gold light builds behind it and rising ticks play
 *    for as long as the server takes (never a static "Opening..." line);
 * 2. hold: one held frame, a soft flash capped at FLASH_MAX_OPACITY, the golden haptic;
 * 3. burst: the lid pops past full size, gold rays bloom, a coin fountain and sparkles fly out, and the
 *    open chest stays big and centred on full rays for REVEAL_ROWS.heroHold;
 * 4. settle: the chest glides up into its slot as the first prize lands, then the rest one by one, then the button.
 * A level chest drops in first, rattles three times (each harder) with light leaking from the lid,
 * shows a tap ring, and opens by itself. Shows only what the server paid.
 *
 * One React render starts the whole reveal: the lid, every row, every number and the button are
 * scheduled on the UI thread at once (withDelay from the lid mark), so nothing re-renders mid-burst
 * (a mid-burst render could show a frame of the closed chest or replay the burst) and a busy JS thread
 * never stretches a beat. The server's answer may arrive early: the lid still pops on its own mark.
 */
export default function RewardReveal({ subtitle, closedArt, openArt, rewards, opening, onOpen, onDone, onWear, onPins,
  reducedMotion, doneLabel, footer, dropIn = false, autoOpen = false, expectRows, preview, fullSet = false, repeat = false, rare = false, onArrive,
  gatherMs, entered: enteredProp }: {
  readonly subtitle: string;
  readonly closedArt: ImageSource | number;
  readonly openArt: ImageSource | number;
  /** Null until the server answers. */
  readonly rewards: PaidRewards | null;
  readonly opening: boolean;
  readonly onOpen: () => void;
  /** AWESOME: hands over where each prize row sits, so the prizes fly home from their own rows. */
  readonly onDone: (origins: readonly PrizeOrigin[]) => void;
  readonly onWear?: () => void;
  readonly onPins?: () => void;
  readonly reducedMotion: boolean;
  readonly doneLabel?: string;
  /** The closing beat (what comes next), shown with the button. */
  readonly footer?: React.ReactNode;
  /** A level chest: it drops in, rattles, then opens by itself if not tapped. */
  readonly dropIn?: boolean;
  /** Open by itself on arrival (the full Daily 3 set flows straight into its chest). */
  readonly autoOpen?: boolean;
  /** The prize rows coming, when known (the Daily 3 chest): the rows area fits them, no empty card. */
  readonly expectRows?: { readonly small: number; readonly big: number };
  /** What is inside (known amounts), shown while the chest gathers. */
  readonly preview?: React.ReactNode;
  /** The full Daily 3 set: three gold checks bounce in a row, then dive into the chest as it gathers. */
  readonly fullSet?: boolean;
  /** A repeat day (this phone has opened 3+ daily chests): a shorter gather and quicker rows, same four beats. */
  readonly repeat?: boolean;
  /** A rare chest (about 1 in 10): a gold beam rises behind the lid and extra coins spill out. */
  readonly rare?: boolean;
  /** A level chest landed: its claim can start now so the lid pops on the beat. */
  readonly onArrive?: () => void;
  /** The lid's beat after the open starts (ms): the gather before the hit-stop. Defaults per chest (lidDelay). */
  readonly gatherMs?: number;
  /**
   * When the card really started entering (epoch ms; NOT_YET until then), written on the UI thread by the card's
   * host. Every beat here (checks, gather, lid, burst, rows, button) is scheduled once and waits on the UI thread
   * for this mark plus its own offset, so the full set's card can mount early and hidden, and no JS delay can ever
   * put a beat before its card. Without it the card counts as entered when it mounts.
   */
  readonly entered?: SharedValue<number>;
}) {
  const ambient = useAmbient();
  const budget = usePowerBudget();
  const { width, height } = useWindowDimensions();
  const beats = momentBeats('chest', { reduced: reducedMotion });
  const localEntered = useSharedValue(NOT_YET);
  const entered = enteredProp ?? localEntered;
  const mountedAt = useRef(Date.now());
  /** The JS copy of the entrance (for haptics, sounds and the skip guard), learned from the UI thread. */
  const enteredJs = useRef<number | null>(null);
  const waitingEnter = useRef<((e: number) => void)[]>([]);
  const learnEntered = (e: number) => {
    // A mark left from an earlier card is never this card's entrance.
    if (enteredJs.current !== null || e < mountedAt.current - 2000) return;
    enteredJs.current = e;
    const q = waitingEnter.current; waitingEnter.current = [];
    q.forEach(f => f(e));
  };
  /** Runs `fn` with the entrance mark once the card has really started entering (at once if it has). */
  const whenEntered = (fn: (e: number) => void) => {
    if (enteredJs.current !== null) fn(enteredJs.current); else waitingEnter.current.push(fn);
  };
  useAnimatedReaction(() => entered.value, v => { if (v < NOT_YET / 2) runOnJS(learnEntered)(v); });
  useLayoutEffect(() => { if (!enteredProp) localEntered.value = Date.now(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /** A JS timer at `offset` ms after the entrance (sounds and haptics follow the UI-thread beats). */
  const afterEnter = (offset: number, fn: () => void) => whenEntered(e => later(fn, Math.max(0, e + offset - Date.now())));
  /** How far into the card we are now (0 before it has entered). */
  const sinceEnter = () => (enteredJs.current === null ? 0 : Math.max(0, Date.now() - enteredJs.current));
  const gatherFor = gatherMs ?? lidDelay({ dropIn, autoOpen, repeat });
  // The chest never resizes at the reveal (no jump); the rows area takes the rest of the screen.
  // Small phones (SE) get a compact layout so every prize shows without scrolling.
  const compact = height < 720;
  const known = !!expectRows && expectRows.small + expectRows.big > 0;
  // With known prizes the card is sized to fit the whole screen (ribbon, chest, every row, the flame row and the
  // button, under the Dynamic Island and above the home bar): the chest takes what the rows leave.
  // The rows never push the card past the screen (a milestone day with gear AND a mystery box): past this they scroll,
  // and each hero card slides into view as it lands.
  const rowsCap = Math.max(200, height - CHROME_KNOWN - (compact ? 96 : 120));
  const expectedRowsH = known && expectRows ? Math.min(rowsCap, rowsFor(expectRows.small, expectRows.big)) : 0;
  const size = known
    ? Math.max(compact ? 96 : 120, Math.min(width * 0.5, 210, height - CHROME_KNOWN - expectedRowsH))
    : Math.min(width * 0.44, height * (compact ? 0.17 : 0.21), 190);
  const stageH = size + (known ? 22 : 8);
  // The chest starts big and centred in the whole card on its own gold glow (never a small chest atop an empty
  // panel), stays big through the burst, then glides up into its slot as the prizes land.
  const cardW = width * 0.9 * 0.94;
  const heroScale = reducedMotion ? 1 : Math.max(1, Math.min(2, (cardW * 0.7) / size));
  // Rows get a fixed area (scrolls only on small phones), so the card never changes height.
  const baseRows = compact ? Math.max(200, height - size - 300) : Math.max(200, Math.min(300, height - size - 380));
  const bob = useSharedValue(0);
  const shake = useSharedValue(0);
  /** The shake's strength: the gather keeps shaking until the lid's own mark, then this drops to 0. */
  const amp = useSharedValue(1);
  const pop = useSharedValue(1);
  const squash = useSharedValue(1);
  const flash = useSharedValue(0);
  const gold = useSharedValue(known ? 0.12 : 0);
  const boost = useSharedValue(0);
  const bloom = useSharedValue(0);
  const heroGlow = useSharedValue(0);
  const burst = useSharedValue(0);
  const sparkle = useSharedValue(0);
  const leak = useSharedValue(0);
  const lift = useSharedValue(reducedMotion ? 0 : 1);
  /** A slow server: after the strong gather the chest settles into a calm glow and bob (never a frantic stuck chest). */
  const calm = useSharedValue(0);
  const beam = useSharedValue(0);
  /** A rare chest's extras: a second ring of stars, coins raining over the whole card, a gold rim and a WOW! stamp. */
  const stars2 = useSharedValue(0);
  const rain = useSharedValue(0);
  const rim = useSharedValue(0);
  const stamp = useSharedValue(0);
  const tapRing = useSharedValue(0);
  /** The lid: 0 closed art, 1 open art (swapped on the UI thread on the hit-stop frame, never by a render). */
  const lid = useSharedValue(0);
  /** The "what is inside" chips and the hint fade out as the rows take over. */
  const hintOut = useSharedValue(0);
  /** The closing line and button fade up after the last prize. */
  const doneIn = useSharedValue(0);
  const drop = useSharedValue(dropIn && !reducedMotion ? 1 : 0);
  /** The rows' empty plates (0 hidden, 1 shown), up from the glide's first frame. */
  const slots = useSharedValue(0);
  const dust = useSharedValue(0);
  const [stalled, setStalled] = useState(false);
  const rewardsRef = useRef(rewards);
  rewardsRef.current = rewards;
  /** When the lid pops (epoch ms), once the reveal is scheduled. */
  const lidAt = useRef(Number.MAX_SAFE_INTEGER);
  const openedAt = useRef(0);
  /** When the open was asked for, as ms after the entrance (0 for a chest that opens itself as it enters). */
  const askedOff = useRef<number | null>(null);
  /** When the button takes taps (a tap before then skips the show). */
  const readyAt = useRef(Number.MAX_SAFE_INTEGER);
  const [stage, setStage] = useState<{ x: number; y: number } | null>(null);
  const rows = useMemo(() => (rewards ? rewardRows(rewards) : []), [rewards]);
  const revealed = !!rewards;
  // The chest and chips are laid out from the expected prizes, so nothing moves when the answer comes.
  const rowsHeight = known ? expectedRowsH : baseRows;
  // More prizes than the preview promised (a milestone gear): the rows area grows to fit them (up to the screen),
  // then scrolls so the hero card is always seen.
  const paidRowsH = revealed ? rowsFor(rows.filter(r => !isBigReward(r.kind)).length, rows.filter(r => isBigReward(r.kind)).length) : 0;
  const rowsArea = known && revealed
    ? Math.min(rowsCap, Math.max(expectedRowsH, height - CHROME_KNOWN - size), Math.max(expectedRowsH, paidRowsH)) : rowsHeight;
  const overflow = known && revealed && paidRowsH > rowsArea;
  // Centre the big chest (and the chips under it) in the stage plus rows area.
  const previewH = preview ? 96 : 0;
  const heroH = size * heroScale;
  const groupTop = Math.max(0, (stageH + rowsHeight - heroH - previewH) / 2);
  const heroDY = reducedMotion ? 0 : Math.max(0, groupTop + heroH / 2 - stageH / 2);
  const previewTop = Math.max(0, groupTop + heroH + 6 - stageH);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scroll = useRef<ScrollView>(null);
  const rowRefs = useRef<(View | null)[]>([]);
  /** Each row's "land now" (a skip), registered by the row itself. */
  const rowFinish = useRef<((slam: boolean) => void)[]>([]);
  const overflowRef = useRef(false);
  overflowRef.current = overflow;
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  // One open per chest: a tap, the auto-open and the full-set hand-off can never claim twice.
  const asked = useRef(false);
  const requestOpen = () => {
    if (asked.current || revealed) return;
    asked.current = true;
    // The lid's beat counts from the card's entrance (a full set asks while it is still hidden: offset 0).
    askedOff.current = sinceEnter();
    onOpen();
  };
  const sparks = useMemo(() => momentParticles(PARTICLES.sparkles, budget, reducedMotion), [budget, reducedMotion]);
  const coins = useMemo(() => momentParticles(rare ? PARTICLES.sparkles : 8, budget, reducedMotion), [budget, reducedMotion, rare]);
  const rareStars = useMemo(() => (rare ? momentParticles(PARTICLES.sparkles, budget, reducedMotion) : 0), [budget, reducedMotion, rare]);
  const rainCoins = useMemo(() => (rare ? momentParticles(RARE_CHEST.rainCoins, budget, reducedMotion) : 0), [budget, reducedMotion, rare]);
  const schedule = useMemo(() => rowSchedule(rows, dropIn ? LEVEL_CHEST.rowBeat : repeat ? REPEAT_CHEST.rowBeat : REVEAL_ROWS.beat,
    REVEAL_ROWS.hold, repeat ? REPEAT_CHEST.first : REVEAL_ROWS.first),
    [rows, dropIn, repeat]);
  /**
   * The whole reveal, planned once in the render that first sees the answer, as ms after the card's entrance:
   * the lid keeps its beat (gatherFor after the open was asked for, or at once if the answer came late), then
   * every row's landing and the button. No state changes after this render until AWESOME.
   */
  const plan = useRef<{ lid: number; pop: number; hold: number; rows: number[]; ready: number } | null>(null);
  if (revealed && !plan.current) {
    const now = sinceEnter();
    if (reducedMotion) {
      const rowsAt = rows.map((_, i) => now + 120 * (i + 1));
      plan.current = { lid: now, pop: now, hold: 0, rows: rowsAt, ready: now + 120 * rows.length + 300 };
    } else {
      const lidAt_ = Math.max(now, (askedOff.current ?? now) + gatherFor);
      const pop_ = lidAt_ + DURATION.hitStop;
      // The open chest holds big on its rays, then the first prize lands as it glides into its slot.
      const hold_ = repeat ? REPEAT_CHEST.heroHold : REVEAL_ROWS.heroHold;
      const rowsAt = schedule.map(ms => pop_ + hold_ + REVEAL_ROWS.firstAfterGlide + ms - (schedule[0] ?? 0));
      plan.current = { lid: lidAt_, pop: pop_, hold: hold_, rows: rowsAt, ready: (rowsAt[rowsAt.length - 1] ?? pop_ + 400) + doneDelay(rows) };
    }
  }

  // A level chest: it drops in with a dust ring, rattles three times (each harder) while light leaks
  // from the lid, a tap ring shows, and it opens by itself if nobody taps.
  useEffect(() => {
    if (dropIn) onArrive?.();
    if (!dropIn) return;
    // Reduce Motion: no drop or rattles, but it still opens by itself on the same mark.
    if (reducedMotion) { later(() => requestOpen(), LEVEL_CHEST.autoOpenAt); return; }
    drop.value = withSpring(0, SPRING.land);
    dust.value = withDelay(260, withTiming(1, { duration: 520, easing: EASE.out }));
    later(() => { queueHaptic('hitMedium'); playSfx('fx.hit', 0.8); }, 260);
    const L = LEVEL_CHEST.landMs;
    const rattleHaptics = ['tickSelection', 'tapLight', 'hitMedium'] as const;
    // Three rattles, each harder (a quick left-right-left of 200 ms), all inside 900 ms of the card opening.
    shake.value = withSequence(...LEVEL_CHEST.rattles.map((r, i) => withDelay(i === 0 ? L : r.at - LEVEL_CHEST.rattles[i - 1].at - LEVEL_CHEST.rattleMs,
      withSequence(withTiming(r.deg, { duration: 50, easing: EASE.out }), withTiming(-r.deg, { duration: 70 }),
        withTiming(r.deg * 0.5, { duration: 40 }), withTiming(0, { duration: 40 })))));
    // Light leaks from the lid seam, brighter with every rattle.
    leak.value = withDelay(L, withTiming(1, { duration: LEVEL_CHEST.rattles[2].at + LEVEL_CHEST.rattleMs, easing: EASE.charge }));
    gold.value = withDelay(L, withTiming(0.45, { duration: LEVEL_CHEST.rattles[2].at + LEVEL_CHEST.rattleMs, easing: EASE.charge }));
    LEVEL_CHEST.rattles.forEach((r, i) => later(() => { queueHaptic(rattleHaptics[i]); playSfx('ui.button', 0.5 + i * 0.2); }, L + r.at));
    tapRing.value = withDelay(LEVEL_CHEST.handAt, withRepeat(withTiming(1, { duration: 700, easing: EASE.out }), 2, false));
    later(() => requestOpen(), LEVEL_CHEST.autoOpenAt);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The full set hands straight into the chest: it starts opening (its claim is already on the way) at once.
  useLayoutEffect(() => { if (autoOpen && !revealed && !opening) requestOpen(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Idle: a gentle bob, so it asks to be tapped (a level chest rattles instead).
  const gathering = opening || autoOpen || revealed;
  useEffect(() => {
    cancelAnimation(bob);
    bob.value = 0;
    if (reducedMotion || gathering || !ambient || dropIn || autoOpen) return;
    bob.value = withRepeat(withSequence(
      withTiming(-7, { duration: 850, easing: Easing.inOut(Easing.sin) }),
      withTiming(0, { duration: 850, easing: Easing.inOut(Easing.sin) }),
    ), -1);
    return () => cancelAnimation(bob);
  }, [gathering, reducedMotion, ambient, bob, dropIn, autoOpen]);

  // Gather: the shake builds and gold light grows behind the chest until the lid's mark (however soon the
  // server answers), with rising ticks (never a static line); it settles calmly if the server is slow.
  const gatherOn = useRef(false);
  useLayoutEffect(() => {
    if (!gathering || gatherOn.current) return;
    gatherOn.current = true;
    if (askedOff.current === null) askedOff.current = sinceEnter();
    cancelAnimation(tapRing); tapRing.value = withTiming(0, { duration: 120 });
    const stall = setTimeout(() => { if (!rewardsRef.current) { setStalled(true); amp.value = withTiming(0, { duration: 200 }); } }, STALL_MS);
    /** The gather starts when it is asked for: with the card's entrance for a chest that opens itself (UI-thread mark). */
    const E = askedOff.current ?? 0;
    const at = <T,>(off: number, a: T) => withDelayAfter(entered, E + off, a as never) as T;
    if (!reducedMotion) {
      // The strong shake builds for at most GATHER_CAP_MS (a quick server pops the lid well before), then a slow
      // server sees a calm glow and bob, never a frantic chest that looks stuck.
      const cycles = Math.max(1, Math.round((GATHER_CAP_MS - 330) / 110));
      shake.value = at(0, withSequence(
        ...[4, -4, 7, -7, 10, -10].map(v => withTiming(v, { duration: 55 })),
        withRepeat(withSequence(withTiming(12, { duration: 55 }), withTiming(-12, { duration: 55 })), cycles, true),
        withTiming(0, { duration: 160, easing: EASE.out }),
      ));
      calm.value = at(GATHER_CAP_MS, withRepeat(withSequence(
        withTiming(-6, { duration: 700, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 700, easing: Easing.inOut(Easing.sin) })), -1));
      gold.value = at(0, withSequence(withTiming(0.42, { duration: repeat ? REPEAT_CHEST.gatherMs : beats.anticipation, easing: EASE.charge }),
        withRepeat(withSequence(withTiming(0.55, { duration: 320 }), withTiming(0.42, { duration: 320 })), 12)));
      squash.value = at(0, withTiming(0.94, { duration: beats.anticipation, easing: EASE.charge }));
      // Rising ticks while it gathers (at most 8, each a step higher), only until the lid pops.
      for (let i = 0; i < 8; i++) {
        afterEnter(E + (i < 3 ? i * 140 : 420 + (i - 3) * 260), () => {
          if (Date.now() >= lidAt.current) return;
          queueHaptic(i < 2 ? 'tickSelection' : 'tapLight'); playSfx('fx.coinTick', 0.35 + Math.min(0.5, i * 0.07));
        });
      }
    }
    afterEnter(E, () => playSfx('fx.redeemOpen', 0.8));
    return () => { clearTimeout(stall); };
  }, [gathering]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hold, burst, settle, scheduled once on the UI thread from the lid's mark.
  const revealRan = useRef(false);
  useLayoutEffect(() => {
    if (!revealed || revealRan.current) return;
    revealRan.current = true;
    const pl = plan.current;
    if (!pl) return;
    // The plan is in ms after the card's entrance: the UI-thread beats wait for that mark; the JS refs and timers
    // (skip guard, haptics, sounds) learn it from the UI thread.
    whenEntered(e => { lidAt.current = e + pl.lid; openedAt.current = e + pl.pop; readyAt.current = e + pl.ready; });
    const later_ = (off: number, fn: () => void) => afterEnter(off, fn);
    if (reducedMotion) {
      cancelAnimation(shake); shake.value = 0;
      lid.value = 1;
      lift.value = 0;
      gold.value = withTiming(0.6, { duration: DURATION.quick });
      hintOut.value = withTiming(1, { duration: DURATION.quick });
      haptic('success'); playSfx('fx.reward');
      rows.forEach((row, i) => later_(pl.rows[i], () => {
        haptic(isBigReward(row.kind) ? 'comboHeavy' : 'tickSelection');
        if (isBigReward(row.kind) && (!known || overflowRef.current)) scroll.current?.scrollToEnd({ animated: false });
      }));
      doneIn.value = withDelayAfter(entered, pl.ready, withTiming(1, { duration: DURATION.quick }));
      return;
    }
    const H = DURATION.hitStop;
    // Every beat below sits on a mark after the card's entrance (lid, pop, glide), read on the UI thread, so a late
    // hand-over never reorders them against the card.
    const atLid = <T,>(a: T) => withDelayAfter(entered, pl.lid, a as never) as T;
    const atPop = <T,>(a: T) => withDelayAfter(entered, pl.pop, a as never) as T;
    // Gather keeps going right up to the mark: the shake stops, the squash finishes charging.
    amp.value = atLid(withTiming(0, { duration: 40 }));
    squash.value = atLid(withSequence(withTiming(0.92, { duration: 1 }),
      // Hold: one frame held still and squashed.
      withTiming(0.86, { duration: H, easing: EASE.in }), withSpring(1, { damping: 6, stiffness: 240 })));
    // A soft flash (capped; none brighter with Dim Flashing Lights).
    flash.value = atLid(withSequence(withTiming(flashPeak(isDimFlashingLightsEnabled(), false), { duration: 50 }),
      withTiming(0, { duration: DURATION.flash })));
    leak.value = atLid(withTiming(0, { duration: 200 }));
    // The lid swaps to the open art on the hit-stop frame (UI thread).
    lid.value = atPop(withTiming(1, { duration: 0 }));
    // Burst: the lid pops past full size on the pop spring, rays bloom, coins fountain out, sparkles fly.
    pop.value = atPop(withSequence(withTiming(1.26, { duration: 110, easing: EASE.out }), withSpring(1, SPRING.pop)));
    boost.value = atPop(withSequence(withTiming(1, { duration: 160, easing: EASE.out }),
      withDelay(Math.max(0, pl.hold - 160), withTiming(0.7, { duration: REVEAL_ROWS.glideMs, easing: EASE.out }))));
    bloom.value = atPop(withSequence(withTiming(1, { duration: DURATION.bloom * 0.35 }), withTiming(0, { duration: DURATION.bloom * 0.65 })));
    burst.value = 0;
    burst.value = atPop(withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }));
    sparkle.value = 0;
    sparkle.value = atPop(withTiming(1, { duration: DURATION.sparkle, easing: EASE.out }));
    later_(pl.pop, () => { playHaptic('golden'); playSfx('fx.reward'); });
    later_(pl.lid + 60, () => { cancelAnimation(shake); shake.value = 0; });
    cancelAnimation(calm); calm.value = withTiming(0, { duration: 120 });
    // Settle: the open chest holds big and centred on its rays, then glides up into its slot (eased, the rays riding
    // along and receding) as the first prize lands under it.
    lift.value = withDelayAfter(entered, pl.pop + pl.hold, withTiming(0, { duration: REVEAL_ROWS.glideMs, easing: EASE.out }));
    // The "what is inside" chips fade first; the empty plates come in only once the chips are nearly gone (the two
    // never draw together), and are in before the first prize stamps into its plate.
    hintOut.value = withDelayAfter(entered, pl.pop + Math.max(0, pl.hold - DURATION.quick), withTiming(1, { duration: DURATION.quick, easing: EASE.out }));
    slots.value = withDelayAfter(entered, pl.pop + Math.max(0, pl.hold - DURATION.quick) + SLOTS_AFTER_HINT_MS, withTiming(1, { duration: 110, easing: EASE.out }));
    // A rare chest (about 1 in 10) is its own event, readable with zero words: a tall saturated gold shaft drops onto
    // the chest from the top of the card, a second ring of stars follows the first, gold coins rain across the whole
    // card, the rim turns gold and a WOW! stamp lands, with its own haptic and sound on top of the golden one.
    if (rare) {
      beam.value = atPop(withSequence(withTiming(1, { duration: RARE_CHEST.beamInMs, easing: EASE.out }),
        withDelay(RARE_CHEST.beamHoldMs, withTiming(0.7, { duration: 900 }))));
      stars2.value = 0;
      stars2.value = atPop(withDelay(RARE_CHEST.stars2At, withTiming(1, { duration: DURATION.sparkle + 200, easing: EASE.out })));
      rain.value = 0;
      rain.value = atPop(withDelay(RARE_CHEST.rainAt, withTiming(1, { duration: RARE_CHEST.rainMs, easing: Easing.linear })));
      rim.value = atPop(withTiming(1, { duration: 160, easing: EASE.out }));
      stamp.value = atPop(withDelay(RARE_CHEST.stampAt, withSequence(withTiming(1.25, { duration: 110, easing: EASE.out }), withSpring(1, SPRING.stamp))));
      later_(pl.pop + RARE_CHEST.stampAt, () => { playHaptic('bigStarSlam'); playSfx('fx.firework', 1); });
      later_(pl.pop + RARE_CHEST.stampAt + 160, () => playSfx('fx.jingle', 0.8));
    }
    const at = pl.rows;
    // The chest glow flares again as each hero card lands.
    const heroes = at.filter((_, i) => isBigReward(rows[i].kind));
    if (heroes.length) {
      heroGlow.value = withDelayAfter(entered, heroes[0], withSequence(...heroes.map((ms, i) => withDelay(i === 0 ? 0 : ms - heroes[i - 1] - 520,
        withSequence(withTiming(0.8, { duration: 120 }), withTiming(0, { duration: 400 }))))));
    }
    doneIn.value = withDelayAfter(entered, pl.ready, withTiming(1, { duration: 200, easing: EASE.out }));
    rows.forEach((row, i) => later_(at[i], () => {
      const big = isBigReward(row.kind);
      // On a small phone the rows scroll: the hero cards (always last) slide into view as they land.
      // (A card sized to its prizes never scrolls: every row stays in view.)
      if (big && (!known || overflowRef.current)) later(() => scroll.current?.scrollToEnd({ animated: true }), 40);
      queueHaptic(big ? 'comboHeavy' : 'tickSelection');
      playSfx(big ? 'fx.firework' : row.kind === 'coins' || row.kind === 'bonus_coins' ? 'fx.coin' : 'fx.coinTick', big ? 1 : 0.6 + i * 0.08);
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  const goldAll = useDerivedValue(() => Math.max(gold.value, boost.value));
  const bloomAll = useDerivedValue(() => Math.max(bloom.value, heroGlow.value));
  const heroStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: heroDY * lift.value }, { scale: 1 + (heroScale - 1) * lift.value }],
  }));
  // The shaft drops from the top of the card onto the chest (it grows downward from its top edge).
  const beamStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, beam.value * 1.4), transform: [{ scaleX: 0.55 + 0.45 * beam.value }] }));
  const rimStyle = useAnimatedStyle(() => ({ opacity: rim.value }));
  const stampStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, stamp.value * 2), transform: [{ rotate: '-12deg' }, { scale: stamp.value <= 0 ? 0.01 : stamp.value }] }));
  const chestStyle = useAnimatedStyle(() => ({
    // The drop starts just above the stage (always in sight inside the card), never from off the card.
    transform: [{ translateY: bob.value + calm.value - drop.value * 70 }, { rotate: `${shake.value * amp.value}deg` }, { scale: pop.value },
      { scaleY: squash.value }, { scaleX: 2 - squash.value }],
  }));
  const closedStyle = useAnimatedStyle(() => ({ opacity: 1 - lid.value }));
  const openStyle = useAnimatedStyle(() => ({ opacity: lid.value }));
  const hintStyle = useAnimatedStyle(() => ({ opacity: 1 - hintOut.value }));
  const leakStyle = useAnimatedStyle(() => ({ opacity: leak.value, transform: [{ scaleX: 0.6 + leak.value * 0.6 }] }));
  const dustStyle = useAnimatedStyle(() => ({
    opacity: dust.value <= 0 || dust.value >= 1 ? 0 : 0.7 * (1 - dust.value),
    transform: [{ scaleX: 0.5 + dust.value * 1.1 }, { scaleY: 0.5 + dust.value * 0.5 }],
  }));
  const tapStyle = useAnimatedStyle(() => ({ opacity: tapRing.value <= 0 ? 0 : 0.9 * (1 - tapRing.value), transform: [{ scale: 0.7 + tapRing.value * 0.6 }] }));
  // A level chest drops in from just above its stage: its line fades in as the chest lands (never drawn over).
  const subtitleStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, 1 - drop.value * 1.6)) }));
  const skipped = useRef(false);
  const skip = () => {
    // The first 350 ms after the lid pops ignore taps (a quick double tap never skips the show).
    const now = Date.now();
    if (!revealed || skipped.current || now >= readyAt.current || now - openedAt.current < 350) return;
    skipped.current = true;
    timers.current.forEach(clearTimeout); timers.current = [];
    // Every row lands now (UI thread); skipping still lands the last hero with a short slam.
    rowFinish.current.forEach((f, i) => f?.(i === rows.length - 1));
    cancelAnimation(lift); lift.value = withSpring(0, SPRING.settle);
    hintOut.value = withTiming(1, { duration: DURATION.quick });
    const last = rows[rows.length - 1];
    if (last && isBigReward(last.kind)) { haptic('comboHeavy'); playSfx('fx.firework', 0.8); }
    readyAt.current = now + 400;
    cancelAnimation(doneIn); doneIn.value = withDelay(400, withTiming(1, { duration: 200, easing: EASE.out }));
  };
  const stalledNow = stalled && !revealed;
  const hint = stalledNow ? 'Still opening...' : opening || autoOpen || dropIn || revealed ? null : 'Tap to open!';
  // AWESOME: measure where each prize row's icon sits, then hand over (a slow measure never holds the button).
  const sentDone = useRef(false);
  const done = () => {
    if (Date.now() < readyAt.current) { skip(); return; }
    if (sentDone.current) return;
    sentDone.current = true;
    let sent = false;
    const send = (o: PrizeOrigin[]) => { if (!sent) { sent = true; onDone(o); } };
    setTimeout(() => send([]), 120);
    const out: PrizeOrigin[] = [];
    let left = rows.length;
    if (!left) { send(out); return; }
    rows.forEach((row, i) => {
      const ref = rowRefs.current[i];
      if (!ref) { left -= 1; if (!left) send(out); return; }
      ref.measureInWindow((x, y, w, h) => {
        if (Number.isFinite(x) && w > 0) out.push({ kind: row.kind, amount: row.amount, x: x + w / 2, y: y + h / 2 });
        left -= 1;
        if (!left) send(out);
      });
    });
  };
  const onStage = () => { if (!revealed && !opening) requestOpen(); else skip(); };

  return (
    <View style={styles.card}>
      <CardSurface />
      {/* A rare chest's card turns gold at the rim (stays gold for this card). */}
      {rare && <Animated.View pointerEvents="none" style={[styles.goldRim, rimStyle]} />}
      {fullSet ? <FullSetChecks reducedMotion={reducedMotion} diveY={stageH / 2 + heroDY} entered={entered} afterEnter={afterEnter} />
        : <Animated.Text style={[styles.subtitle, subtitleStyle]}>{subtitle}</Animated.Text>}
      <Pressable onPress={onStage} disabled={opening && !revealed} accessibilityRole="button"
        accessibilityLabel={revealed ? 'Opened' : 'Tap to open'} style={[styles.stage, { height: stageH }]}
        onLayout={e => { if (!stage) setStage({ x: e.nativeEvent.layout.x + e.nativeEvent.layout.width / 2, y: e.nativeEvent.layout.y + e.nativeEvent.layout.height / 2 }); }}>
        <Animated.View pointerEvents="none" style={[styles.hero, heroStyle]}>
        {rare && (
          <Animated.View pointerEvents="none" style={[styles.beam, { width: size * 1.1, height: size * 6, bottom: stageH / 2 - size * 0.1 }, beamStyle]}>
            {/* A saturated gold shaft (bright white-gold core, gold edges) that fades out toward its top. */}
            <LinearGradient colors={['rgba(255,176,0,0.55)', 'rgba(255,184,0,0.95)', '#FFB800']} locations={[0, 0.35, 1]}
              start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: size * 0.3 }]} />
            <LinearGradient colors={['rgba(255,226,92,0.7)', '#FFE45C']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
              style={{ position: 'absolute', left: '22%', right: '22%', top: 0, bottom: 0, borderRadius: size * 0.2 }} />
            <View style={{ position: 'absolute', left: '40%', right: '40%', top: 0, bottom: 0, borderRadius: size * 0.1, backgroundColor: 'rgba(255,250,224,0.9)' }} />
          </Animated.View>
        )}
        <GoldBurst size={size * 2.5} amount={goldAll} bloom={bloomAll} reduced={reducedMotion} spin={budget.level === 'full'} style={styles.abs} />
        {/* A warm pool of light on the floor under the chest, so it sits on a stage (never floats in a blue void). */}
        <Image cachePolicy="memory-disk" source={SOFT} pointerEvents="none" transition={0} contentFit="fill" tintColor="#FFE07A"
          style={[styles.floor, { width: size * 1.5, height: size * 0.34, top: stageH / 2 + size * 0.3 }]} />
        <RadialFlash flash={flash} size={size * 1.6} />
        <Animated.View pointerEvents="none" style={[styles.dust, { width: size * 1.1, height: size * 0.28, top: stageH / 2 + size * 0.36 }, dustStyle]}>
          <Image cachePolicy="memory-disk" source={SOFT} style={StyleSheet.absoluteFill} contentFit="fill" tintColor="#ffffff" transition={0} />
        </Animated.View>
        {dropIn && (
          <Animated.View pointerEvents="none" style={[styles.tapRing, { width: size * 1.05, height: size * 1.05, borderRadius: size }, tapStyle]} />
        )}
        <Animated.View style={chestStyle}>
          {/* Both arts stay mounted; the lid swaps on the UI thread on the hit-stop frame. */}
          <Animated.View style={closedStyle}>
            <Image cachePolicy="memory-disk" source={closedArt} style={{ width: size, height: size }} contentFit="contain" transition={0} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, openStyle]}>
            <Image cachePolicy="memory-disk" source={openArt} style={{ width: size, height: size }} contentFit="contain" transition={0} />
          </Animated.View>
          {/* Light leaking from the lid seam while a level chest rattles. */}
          <Animated.View pointerEvents="none" style={[styles.leak, { width: size * 1.1, height: size * 0.4, top: size * 0.22, left: -size * 0.05 }, leakStyle]}>
            <Image cachePolicy="memory-disk" source={SOFT} style={StyleSheet.absoluteFill} contentFit="fill" tintColor="#FFF4B8" transition={0} />
          </Animated.View>
        </Animated.View>
        <View style={styles.center} pointerEvents="none">
          <SparkleBurst progress={sparkle} count={sparks} radius={size * 1.05} />
          <CoinFountain progress={burst} count={coins} spread={size * (rare ? 1.2 : 0.95)} />
          {rareStars > 0 && <SparkleBurst progress={stars2} count={rareStars} radius={size * 1.75} />}
        </View>
        {rare && (
          <Animated.View pointerEvents="none" accessibilityLabel="Wow! A gold chest" style={[styles.wow, { left: '50%', marginLeft: size * 0.42, top: stageH / 2 - size * 0.95 }, stampStyle]}>
            <WowStamp />
          </Animated.View>
        )}
        </Animated.View>
      </Pressable>
      <Pressable onPress={onStage} disabled={opening && !revealed} accessible={false} style={{ alignSelf: 'stretch' }}>
        <View style={{ height: rowsArea }}>
          {revealed && plan.current && (
            <ScrollView ref={scroll} style={{ height: rowsArea }} contentContainerStyle={styles.rows} scrollEnabled={overflow || !known}
              showsVerticalScrollIndicator={false}>
              {rows.map((row, i) => (
                <Row key={row.kind} slots={reducedMotion ? undefined : slots} iconRef={r => { rowRefs.current[i] = r; }} row={row} entered={entered} at={plan.current?.rows[i] ?? 0} reducedMotion={reducedMotion} compact={compact}
                  countMs={rowCountMs(schedule[i] ?? 0, COUNT.ms)} register={f => { rowFinish.current[i] = f; }}
                  onWear={row.kind === 'item' ? onWear : undefined} onPins={row.kind === 'mystery_boxes' ? onPins : undefined} />
              ))}
            </ScrollView>
          )}
          <Animated.View pointerEvents="none" style={[styles.hintLayer, { height: rowsHeight }, hintStyle]}>
            <View style={[styles.hintBox, { height: rowsHeight - 8 }, !hint && !reducedMotion && { justifyContent: 'flex-start', paddingTop: previewTop }]}>
              {hint ? <Text style={styles.hint}>{hint}</Text> : preview && !stalledNow ? <PreviewIn entered={entered}>{preview}</PreviewIn> : null}
            </View>
          </Animated.View>
        </View>
      </Pressable>
      {/* The tall footer slot is only for the Daily 3 flame row: a level chest's card ends right under its button. */}
      <View style={[styles.bottom, known && (footer ? (dropIn ? styles.bottomLevel : styles.bottomKnown) : styles.bottomButton)]}>
        {revealed ? <DoneArea footer={footer} label={doneLabel ?? 'AWESOME!'} onDone={done} appear={doneIn} /> : null}
      </View>
      {/* A rare chest: gold coins rain across the whole card, over the rows (pointer events pass through). */}
      {rainCoins > 0 && <CoinRain progress={rain} count={rainCoins} width={cardW} height={height * 0.8} />}
      {/* Confetti only at full power: Battery Saver keeps still rays, half the sparkles and coins, and no confetti. */}
      {stage && budget.animate && budget.particleScale >= 1 && <RewardBurst progress={burst} x={stage.x} y={stage.y + heroDY} />}
    </View>
  );
}
/**
 * The full set's three gold checks: they bounce one after another (120 ms apart, rising ticks), then
 * dive into the chest as it starts to gather (the goals you finished charge the chest).
 */
function FullSetChecks({ reducedMotion, diveY, entered, afterEnter }: {
  readonly reducedMotion: boolean; readonly diveY: number; readonly entered: SharedValue<number>;
  readonly afterEnter: (offset: number, fn: () => void) => void;
}) {
  const a = useSharedValue(reducedMotion ? 1 : 0);
  const b = useSharedValue(reducedMotion ? 1 : 0);
  const c = useSharedValue(reducedMotion ? 1 : 0);
  const dive = useSharedValue(0);
  const vals = [a, b, c];
  useLayoutEffect(() => {
    if (reducedMotion) return;
    // From the card's real entrance (UI-thread mark), so they always bounce after the card is in.
    vals.forEach((v, i) => {
      v.value = withDelayAfter(entered, FULL_SET.checksAt + i * FULL_SET.checkStep, withSequence(withTiming(1.35, { duration: 110, easing: EASE.out }), withSpring(1, SPRING.pop)));
    });
    dive.value = withDelayAfter(entered, FULL_SET.chestAt, withTiming(1, { duration: 300, easing: EASE.in }));
    FULL_SET.tickSteps.forEach((step, i) => afterEnter(FULL_SET.checksAt + i * FULL_SET.checkStep, () => {
      queueHaptic('tickSelection');
      playSfx(LOOP_CUES.checkBounce.fallback, 0.5 + step / 16);
    }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={styles.checks} accessibilityLabel="All three goals done">
      {vals.map((v, i) => <DivingCheck key={i} v={v} dive={dive} index={i} diveY={diveY} />)}
    </View>
  );
}

function DivingCheck({ v, dive, index, diveY }: { readonly v: SharedValue<number>; readonly dive: SharedValue<number>; readonly index: number; readonly diveY: number }) {
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, v.value * 2) * (1 - dive.value * dive.value),
    transform: [{ translateX: (1 - index) * 52 * dive.value }, { translateY: diveY * dive.value }, { scale: v.value * (1 - 0.6 * dive.value) }],
  }));
  return <Animated.View style={style}><GoldCheckCoin size={40} /></Animated.View>;
}

/** The preview of what is inside rises in softly while the chest gathers (mounted at rest, so it never flickers). */
function PreviewIn({ children, entered }: { readonly children: React.ReactNode; readonly entered: SharedValue<number> }) {
  // It mounts at rest (a later render of the card can never draw a frame of it hidden) and gives a small rise.
  const a = useSharedValue(1);
  useLayoutEffect(() => {
    a.value = withDelayAfter(entered, 0, withSequence(withTiming(0.85, { duration: 1 }), withTiming(1, { duration: DURATION.enter, easing: EASE.out })));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({ opacity: 0.9, transform: [{ translateY: (1 - a.value) * 40 }] }));
  return <Animated.View style={[{ alignItems: 'center', gap: 6 }, style]}>{children}</Animated.View>;
}

/** A rare chest's extras (ms after the lid pops; capped and budgeted like every burst). */
export const RARE_CHEST = { beamInMs: 220, beamHoldMs: 1300, stars2At: 140, rainAt: 80, rainMs: 1700, rainCoins: 14, stampAt: 120 } as const;

/** Gold coins raining across the whole card on one shared progress (each on its own lane, delay and spin). */
function CoinRain({ progress, count, width, height }: { readonly progress: SharedValue<number>; readonly count: number; readonly width: number; readonly height: number }) {
  const drops = useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: ((i + 0.5) / count) * width + (((i * 37) % 21) - 10), delay: ((i * 53) % 45) / 100, size: 20 + (i % 3) * 6,
    spin: (i % 2 ? 1 : -1) * (200 + ((i * 29) % 160)), sway: ((i * 17) % 13) - 6,
  })), [count, width]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {drops.map((d, i) => <RainCoin key={i} d={d} progress={progress} fall={height} />)}
    </View>
  );
}

function RainCoin({ d, progress, fall }: {
  readonly d: { readonly x: number; readonly delay: number; readonly size: number; readonly spin: number; readonly sway: number };
  readonly progress: SharedValue<number>; readonly fall: number;
}) {
  const style = useAnimatedStyle(() => {
    const t = Math.max(0, Math.min(1, (progress.value - d.delay) / (1 - d.delay)));
    if (t <= 0 || t >= 1) return { opacity: 0, transform: [{ translateY: -60 }] };
    return { opacity: t > 0.85 ? (1 - t) / 0.15 : 1, transform: [{ translateX: d.sway * Math.sin(t * Math.PI * 3) },
      { translateY: -40 + fall * t * t * 0.6 + fall * t * 0.4 }, { rotate: `${d.spin * t}deg` }] };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: d.x - d.size / 2, top: 0, width: d.size, height: d.size }, style]}>
      <Image cachePolicy="memory-disk" source={ICON_SOURCES.coin} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
    </Animated.View>
  );
}

/** A gold starburst stamp with a navy ink line (two turned squares), "WOW!" on it. Drawn in code, no new art. */
function WowStamp() {
  return (
    <View style={styles.wowBox}>
      {/* Three turned squares make a 12-point burst; an inner light face keeps the ink line only on the outside. */}
      {[0, 30, 60].map(d => <View key={d} style={[styles.wowStar, { transform: [{ rotate: `${d}deg` }] }]} />)}
      {[0, 30, 60].map(d => <View key={`i${d}`} style={[styles.wowStar, styles.wowStarInner, { transform: [{ rotate: `${d}deg` }] }]} />)}
      <Text style={styles.wowText} allowFontScaling={false}>WOW!</Text>
    </View>
  );
}

/** Gold coins arcing up out of the open chest and falling back with gravity (one shared progress, budgeted count). */
function CoinFountain({ progress, count, spread }: { readonly progress: SharedValue<number>; readonly count: number; readonly spread: number }) {
  const pieces = useMemo(() => Array.from({ length: count }, (_, i) => {
    const side = i % 2 ? 1 : -1;
    return { vx: side * (0.25 + ((i * 37) % 60) / 100) * spread, vy: -(0.9 + ((i * 53) % 50) / 100) * spread * 1.1,
      spin: side * (180 + ((i * 29) % 180)), delay: (i % 4) * 0.035, size: 22 + (i % 3) * 5 };
  }), [count, spread]);
  if (count <= 0) return null;
  return <>{pieces.map((p, i) => <FountainCoin key={i} p={p} progress={progress} />)}</>;
}

function FountainCoin({ p, progress }: {
  readonly p: { readonly vx: number; readonly vy: number; readonly spin: number; readonly delay: number; readonly size: number };
  readonly progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const t = Math.max(0, Math.min(1, (progress.value - p.delay) / (1 - p.delay)));
    if (t <= 0 || t >= 1) return { opacity: 0, transform: [{ scale: 0 }] };
    // A thrown arc: up fast, gravity pulls it back down past the lid.
    const x = p.vx * t;
    const y = p.vy * t + 2.2 * Math.abs(p.vy) * t * t;
    return { opacity: t < 0.75 ? 1 : (1 - t) / 0.25, transform: [{ translateX: x }, { translateY: y }, { rotate: `${p.spin * t}deg` },
      { scale: t < 0.12 ? t / 0.12 : 1 }] };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: -p.size / 2, top: -p.size / 2 - 10, width: p.size, height: p.size }, style]}>
      <Image cachePolicy="memory-disk" source={ICON_SOURCES.coin} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
    </Animated.View>
  );
}

/** The closing line and the button fade up together (200 ms) on the reveal's own UI-thread mark, never pop in. */
function DoneArea({ footer, label, onDone, appear }: {
  readonly footer?: React.ReactNode; readonly label: string; readonly onDone: () => void; readonly appear: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({ opacity: appear.value, transform: [{ translateY: (1 - appear.value) * 8 }] }));
  return (
    <Animated.View style={[{ gap: 8 }, style]}>
      {footer}
      <Pressable onPress={onDone} accessibilityRole="button" style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
        <Text style={styles.buttonText}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function rowIcon(row: RewardRow) {
  switch (row.kind) {
    case 'coins': return <GameIcon name="coins" size={40} />;
    case 'bonus_coins': return <GameIcon name="coins" size={40} />;
    case 'tickets': return <GameIcon name="ticket" size={40} />;
    case 'energy': return <GameIcon name="energy" size={40} />;
    case 'xp': return <GameIcon name="xp" size={40} />;
    case 'freezes': return <Image cachePolicy="memory-disk" source={FREEZE} style={{ width: 64, height: 64 }} contentFit="contain" />;
    case 'mystery_boxes': return <Image cachePolicy="memory-disk" source={BOX} style={{ width: 72, height: 72 }} contentFit="contain" />;
    case 'item': return <GearArt uri={row.image ?? null} />;
  }
}

/**
 * The gear's own picture. With no art from the server (or art that fails to load) it is a gold gift, never a bare
 * shark, so a non-reader always sees "a present for my shark" rather than a picture of themselves.
 */
function GearArt({ uri }: { readonly uri: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) return <GameIcon name="gift" size={66} />;
  return <Image source={{ uri }} style={{ width: 80, height: 80 }} contentFit="contain" onError={() => setFailed(true)} />;
}


/**
 * "+N", rolled up on the UI thread (no React render per step): starts a third of the way (never "+0"),
 * eases out and lands on the exact number. The row owns the value, so a skip lands it at once.
 */
function RollNumber({ v, target }: { readonly v: SharedValue<number>; readonly target: number }) {
  const props = useAnimatedProps(() => {
    const text = `+${Math.round(v.value)}`;
    return { text, defaultValue: text } as never;
  });
  const first = `+${countStart(target)}`;
  return (
    <AnimatedInput editable={false} caretHidden underlineColorAndroid="transparent" pointerEvents="none" allowFontScaling={false}
      defaultValue={first} animatedProps={props}
      style={[styles.rowAmount, styles.rollInput, { width: 13 * (String(target).length + 1) + 4 }]} />
  );
}

/**
 * One prize row. It mounts with the reveal and lands on its own UI-thread mark (`at`, epoch ms): hero
 * cards slam past rest, hold a beat and spring back; small prizes stamp in and their number rolls, then
 * bumps. A skip (register) lands it at once.
 */
function Row({ row, at, entered, reducedMotion, onWear, onPins, compact = false, countMs, iconRef, register, slots }: {
  readonly iconRef?: (v: View | null) => void;
  /**
   * The rows' empty plates (0 to 1), up as the open chest glides into its slot: the card is never an empty blue panel
   * while the first prize is on its way, and each prize then stamps into its own plate.
   */
  readonly slots?: SharedValue<number>;
  /** When it lands: ms after the card's entrance (`entered`, a UI-thread mark). */
  readonly row: RewardRow; readonly at: number; readonly entered: SharedValue<number>; readonly reducedMotion: boolean; readonly compact?: boolean;
  readonly countMs: number;
  readonly register: (finish: (slam: boolean) => void) => void;
  readonly onWear?: () => void; readonly onPins?: () => void;
}) {
  const big = isBigReward(row.kind);
  const t = useSharedValue(0);
  const beam = useSharedValue(0);
  const bump = useSharedValue(1);
  const num = useSharedValue(countStart(row.amount));
  // Scheduled in the commit that mounts the row (a layout effect), on its absolute mark.
  useLayoutEffect(() => {
    const after = <T,>(off: number, a: T) => withDelayAfter(entered, off, a as never) as T;
    if (reducedMotion) {
      t.value = after(at, withTiming(1, { duration: 150 }));
      num.value = row.amount;
    } else {
      t.value = after(at, big
        ? withSequence(withTiming(1.114, { duration: 120, easing: Easing.in(Easing.quad) }), withDelay(90, withSpring(1, { damping: 7, stiffness: 260 })))
        : withSpring(1, SPRING.stamp));
      if (big) beam.value = after(at, withSequence(withTiming(1, { duration: 140 }), withTiming(0, { duration: 900 })));
      else {
        if (row.amount > 1) num.value = after(at, withTiming(row.amount, { duration: countMs, easing: Easing.out(Easing.cubic) }));
        else num.value = row.amount;
        // The number lands with a little bump when its roll ends.
        bump.value = after(at + countMs, withSequence(withTiming(COUNT.finalBump, { duration: 70 }), withSpring(1, SPRING.stamp)));
      }
    }
    register(slam => {
      cancelAnimation(t); cancelAnimation(num);
      num.value = row.amount;
      t.value = slam && big && !reducedMotion ? withSequence(withTiming(1.08, { duration: 90 }), withSpring(1, { damping: 8, stiffness: 300 }))
        : withTiming(1, { duration: 120 });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, t.value * 1.5),
    transform: big
      ? [{ scale: t.value <= 0 ? 1.35 : 1.35 - t.value * 0.35 }]
      : [{ translateY: (1 - t.value) * -18 }, { scale: 0.7 + t.value * 0.3 }],
  }));
  const beamStyle = useAnimatedStyle(() => ({ opacity: beam.value }));
  const bumpStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  const plateStyle = useAnimatedStyle(() => ({ opacity: (slots ? slots.value : 0) * Math.max(0, 1 - t.value * 1.5) }));
  return (
    // Laid out from the start (no jump); the face is a plain View (iOS clips a scaled bordered background).
    <View>
    {slots && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.slot, big && styles.slotBig, plateStyle]} />}
    <Animated.View style={style}>
      {big && <Animated.View pointerEvents="none" style={[styles.rowBeam, beamStyle]} />}
      <View style={[styles.row, big && styles.rowBig, compact && styles.rowCompact]}>
        <View ref={iconRef} collapsable={false} style={[styles.rowIcon, big && styles.rowIconBig]}>{rowIcon(row)}</View>
        {big ? (
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.bigKicker}>{row.kind === 'item' ? 'NEW GEAR' : row.kind === 'freezes' ? 'STREAK FREEZE' : 'FREE MYSTERY BOX'}</Text>
            <Text style={styles.bigName} numberOfLines={2}>{row.kind === 'item' ? row.label
              : row.kind === 'freezes' ? 'Your flame is safe if you miss a day' : 'A surprise pin is inside'}</Text>
            {(onWear || onPins) && (
              <Pressable onPress={onWear ?? onPins} accessibilityRole="button" hitSlop={6}
                style={({ pressed }) => [styles.smallBtn, pressed && styles.buttonPressed]}>
                <Text style={styles.smallBtnText}>{onWear ? 'WEAR IT' : 'SEE PINS'}</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <Animated.View style={[styles.rowLine, bumpStyle]}>
            <RollNumber v={num} target={row.amount} />
            <Text style={styles.rowText} numberOfLines={1}>{row.label}</Text>
          </Animated.View>
        )}
      </View>
    </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '94%', marginTop: -14, ...CARD_FRAME,
    paddingTop: 20, paddingBottom: 14, paddingHorizontal: 12, alignItems: 'center', overflow: 'hidden' },
  subtitle: { fontFamily: 'Knockout', fontSize: 17, color: '#e4f7ff', textAlign: 'center', minHeight: 22 },
  checks: { flexDirection: 'row', gap: 12, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  stage: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  abs: { position: 'absolute' },
  center: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 },
  dust: { position: 'absolute' },
  floor: { position: 'absolute', opacity: 0.55 },
  leak: { position: 'absolute' },
  tapRing: { position: 'absolute', borderWidth: 5, borderColor: BRAND.white },
  // Few prizes sit in the middle of the rows area, not at the top of an empty panel.
  rows: { gap: 6, paddingVertical: 4, flexGrow: 1, justifyContent: 'center' },
  hintBox: { alignItems: 'center', justifyContent: 'center' },
  hintLayer: { position: 'absolute', left: 0, right: 0, top: 0 },
  hint: { fontFamily: 'Shark', fontSize: 22, color: BRAND.gold, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 2 },
  rowCompact: { minHeight: 0, paddingVertical: 0 },
  // An empty prize plate waiting for its prize: a filled pale-blue cartoon slot pressed into the card (a darker top
  // edge like a dent, a light lip along the bottom), the row's own shape. Never a dashed UI outline.
  slot: { borderRadius: 14, backgroundColor: 'rgba(190,228,255,0.30)', borderWidth: 2, borderColor: 'rgba(5,52,110,0.22)',
    borderTopWidth: 3, borderBottomColor: 'rgba(255,255,255,0.55)' },
  slotBig: { borderRadius: 16, backgroundColor: 'rgba(255,236,170,0.32)', borderColor: 'rgba(201,138,0,0.35)', borderBottomColor: 'rgba(255,248,214,0.8)' },
  rowBig: { backgroundColor: BRAND.white, borderWidth: 3, borderColor: BRAND.gold, paddingVertical: 8 },
  rowIcon: { width: 58, alignItems: 'center' },
  rowIconBig: { width: 84 },
  beam: { position: 'absolute' },
  goldRim: { ...StyleSheet.absoluteFillObject, borderRadius: 20, borderWidth: 5, borderColor: '#FFD23F' },
  wow: { position: 'absolute', zIndex: 3 },
  wowBox: { width: 74, height: 74, alignItems: 'center', justifyContent: 'center' },
  wowStar: { position: 'absolute', width: 56, height: 56, borderRadius: 4, backgroundColor: BRAND.navy },
  wowStarInner: { width: 49, height: 49, borderRadius: 3, backgroundColor: '#FFD23F' },
  wowText: { fontFamily: 'Shark', fontSize: 19, color: BRAND.navy, marginTop: 3 },
  rowBeam: { position: 'absolute', left: -8, right: -8, top: -6, bottom: -6, borderRadius: 18, backgroundColor: 'rgba(255, 226, 92, 0.55)' },
  rowLine: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2 },
  rowText: { flex: 1, fontFamily: 'Shark', fontSize: 18, color: BRAND.white, marginTop: 2 },
  rowAmount: { fontFamily: 'Shark', color: BRAND.gold, fontSize: 22 },
  rollInput: { padding: 0, margin: 0, textAlign: 'left' },
  hero: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  bigKicker: { fontFamily: 'Shark', fontSize: 13, color: BRAND.goldLip },
  bigName: { fontFamily: 'Shark', fontSize: 20, color: BRAND.navy },
  smallBtn: { alignSelf: 'flex-start', backgroundColor: BRAND.gold, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5,
    borderBottomWidth: 3, borderBottomColor: BRAND.goldLip },
  smallBtnText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.navy },
  bottom: { alignSelf: 'stretch', minHeight: 96, justifyContent: 'flex-end', gap: 8, marginTop: 6 },
  // The Daily 3 chest footer holds the flame row too (flame plus tomorrow's picture pill).
  bottomKnown: { minHeight: 176 },
  // A level chest's footer: the next level line and its bar, then the button (ends right under it).
  bottomLevel: { minHeight: 116 },
  // Only the button.
  bottomButton: { minHeight: 58 },
  button: { alignSelf: 'stretch', backgroundColor: BRAND.gold, borderRadius: 16, paddingVertical: 12,
    alignItems: 'center', borderBottomWidth: 4, borderBottomColor: BRAND.goldLip },
  buttonPressed: { transform: [{ translateY: 2 }], borderBottomWidth: 2 },
  buttonText: { fontFamily: 'Shark', fontSize: 20, color: '#075083' },
});
