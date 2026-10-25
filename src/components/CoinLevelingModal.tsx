import { Image } from 'expo-image';
import { useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import config from '../config';
import HoloCoinPreview from './HoloCoinPreview';
import Ribbon from './Ribbon';
import YellowButton from './YellowButton';
import CoinUpgradeDemo from './CoinUpgradeDemo';
import { AuthContext } from '../context/AuthProvider';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import { RideCoinLevelType } from '../models/ride-coin-level-type';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { COIN_TIERS, coinTier, coinTierName } from '../constants/coinTiers';
import GameIcon from '../ui/GameIcon';
import { queueHaptic } from '../gamekit/Haptics';
import { playLimited, SFX_PRIORITY } from '../audio/sfxLimiter';
import { usePresentationSlot } from '../hooks/usePresentationQueue';
import type { LevelUpResult } from '../api/endpoints/me/ride-coins/level-up';
import CoinStand from './coin/CoinStand';
import TierPlate, { plateRoom } from './coin/TierPlate';
import Crowning from './coin/Crowning';
import LevelUpBurst from './coin/LevelUpBurst';
import PerkTrack from './coin/PerkTrack';
import Reanimated, { Easing as UiEasing, cancelAnimation as cancelUi, useAnimatedStyle, useSharedValue, withDelay as uiDelay,
  withRepeat as uiRepeat, withSequence as uiSequence, withSpring as uiSpring, withTiming as uiTiming } from 'react-native-reanimated';
import { GatherRings, GoldBurst, ShineSweep, SparkleBurst } from '../ui/GoldBurst';
import { CHARGE_REACH, DURATION, EASE, SLOW_SERVER_LABEL_MS, SPRING, levelUpPayoff, momentParticles, windupWobble } from '../ui/motionEasing';
import { usePowerBudget } from '../power';
import { LEVEL_UP_ACTS, levelRibbon, levelUpFx, perkChip, revealBadges, revealCard, type LevelUpFx, type LevelUpUnlocks } from './coin/progressionModel';
import type { CollectedRideCoin } from '../api/endpoints/me/ride-coins/show';

const SHORT_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/** "SEP 27" from an ISO time, read as a calendar day. */
function ridDay(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${SHORT_MONTHS[Number(match[2]) - 1] ?? ''} ${Number(match[3])}` : '';
}
import * as RootNavigation from '../RootNavigation';
import OneTimeTip from './help/OneTimeTip';
import { useHelp } from './help/HelpProvider';
import CoinTopUpOffer from './money/CoinTopUpOffer';
import { storeAvailable } from '../services/purchases';
import { isDimFlashingLightsEnabled } from '../../modules/flash-safety';
import { FlexShareButton, SHARE_IN_MODALS, ShareStudioHost } from '../share';
import { useDevAutoPress } from '../share/devDrive';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
/** The success CTA's width: the card is 95% of (screen - 48), with 14 pt padding each side. */
const SUCCESS_CTA_WIDTH = (SCREEN_W - 48) * 0.95 - 28;
/** The Level Up button's height (its art is 3.8 : 1): the charge bar takes exactly its place, so the card never moves. */
const CTA_HEIGHT = SUCCESS_CTA_WIDTH / 3.8;
/** How long the coin charges before the burst (the burst waits for the server too). */
const CHARGE_MS = LEVEL_UP_ACTS.charge.end;
/** The new coin settles this much bigger on the success card (120 pt art to about 142 pt), and this far lower. */
export const SUCCESS_COIN_SCALE = 1.18;
/**
 * A short phone (iPhone SE, 667 pt): the success card is laid out tighter (the coin grows a little, no extra line,
 * smaller prize chips, the first-time tip only if there is room) so Awesome! is on screen from the first frame.
 */
export const SHORT_PHONE = SCREEN_H < 740;
const COIN_GROW = SHORT_PHONE ? 1.06 : SUCCESS_COIN_SCALE;
const SUCCESS_COIN_DROP = SHORT_PHONE ? 4 : 14;
/** On success the line under the coin (and the blue band) move down this far, clear of the bigger coin and its plate. */
const SUCCESS_TEXT_DROP = SHORT_PHONE ? 0 : 22;
/**
 * Extra room under a coin that stands on a plinth (Level 6 and up): the stand hangs about 22 pt below the coin, and
 * more once the success coin has grown and dropped, so without this it sat over "YOUR COIN LEVELED UP".
 */
export function standRoom(level: number, success: boolean, shortPhone: boolean): number {
  if (coinTier(level).stand === 'none') return 0;
  // A short phone's success coin on a stand does not grow or drop (tightStand), so it needs only the card's room.
  return success && !shortPhone ? 28 : 16;
}
/**
 * How much deeper the blue band reaches than the room under a stand: the stand's navy foot rests inside the band,
 * on its floor, instead of hanging past it into the pale card.
 */
export function standFloor(level: number): number {
  return coinTier(level).stand === 'none' ? 0 : 12;
}
/** Vertical padding of the success box, the breathing gap it keeps after fitting, and when and how fast it fits. */
const SUCCESS_BOX_PAD = SHORT_PHONE ? 4 : 10;
/** The first-time tip shows on the success card only when the card has this much spare room for it. */
const TIP_ROOM = 96;
/** Prize chips: smaller on a short phone so two fit on one row. */
const CHIP = SHORT_PHONE ? { icon: 22, font: 17, padX: 8 } : { icon: 26, font: 20, padX: 10 };
/**
 * The big tier chip on the success card ("SAPPHIRE 6"): a little smaller on a short phone, so a coin on its stand, the
 * whole prize box with its rounded bottom, and a clear gap above Awesome! all fit on an iPhone SE.
 */
export const TIER_CHIP = SHORT_PHONE ? { font: 25, padY: 3, border: 3, badge: 29, badgeFont: 18 }
  : { font: 30, padY: 6, border: 4, badge: 34, badgeFont: 20 };
export const SUCCESS_SNUG_GAP = 12;
/** The card fits its payoff while the success content stamps in (the button is not on screen yet), then Awesome! pops in. */
export const SUCCESS_SNUG_MS = 180;
/** If the success content is never measured (a starved layout pass), Awesome! still shows by then. */
const SUCCESS_CTA_FALLBACK_MS = 600;

interface Props {
  visible: boolean;
  rideCoin: RideCoinLevelType | null;
  playerEnergy: number;
  playerParts: number;
  onClose: () => void;
  /** true / the server's level-up reply on success, false on failure. */
  onLevelUp: (rideCoinId: number) => Promise<boolean | LevelUpResult>;
  onFeature: (assetId: number | null) => Promise<boolean>;
  onPlayInLine?: () => void;
}

type ModalState = 'preview' | 'confirm' | 'leveling' | 'success' | 'maxed';

// Tier names, colours and looks come from the one tier token file.
const TIER_NAMES = COIN_TIERS.map(tier => tier.name);
const TIER_VISUAL_REWARDS = COIN_TIERS.map(tier => tier.look);
const TIER_COLORS = COIN_TIERS.map(tier => tier.ringDeep);
const TOP_TIER = COIN_TIERS.length - 1;

/** The one next step when a coin cannot power up yet (never a dead end). */
export function missingResourceAction(missingParts: number, missingEnergy: number): { label: string; kind: 'parts' | 'energy' } | null {
  if (missingParts > 0) return { label: `Get ${missingParts} Ride Part${missingParts === 1 ? '' : 's'}`, kind: 'parts' };
  if (missingEnergy > 0) return { label: `Find ${missingEnergy} Energy`, kind: 'energy' };
  return null;
}

export default function CoinLevelingModal({
  visible,
  rideCoin,
  playerEnergy,
  playerParts,
  onClose,
  onLevelUp,
  onFeature,
  onPlayInLine,
}: Props) {
  const [state, setState] = useState<ModalState>('preview');
  const [featured, setFeatured] = useState(false);
  const [featureBusy, setFeatureBusy] = useState(false);
  const featureBusyRef = useRef(false);
  const [featureError, setFeatureError] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const upgradeBusy = useRef(false);
  const mounted = useRef(true);
  const reducedMotion = useReducedGameMotion();
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  const upgradeAnimations = useRef<Animated.CompositeAnimation[]>([]);
  const upgradeTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stopUiShowRef = useRef<() => void>(() => undefined);
  const stopUpgradeEffects = () => {
    stopUiShowRef.current();
    upgradeTimers.current.forEach(clearTimeout); upgradeTimers.current = [];
    upgradeAnimations.current.forEach(animation => animation.stop()); upgradeAnimations.current = [];
  };
  // On unmount (closing, or a fresh card for the next coin) every UI-thread animation this card started is cancelled
  // first, so no running animation writes to a view that is going away (the Reanimated 3.16 Fabric crash class).
  const stopAllUiRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stopUpgradeEffects(); stopAllUiRef.current(); };
  }, []);
  const [holoVisible, setHoloVisible] = useState(false);
  const [showEditions, setShowEditions] = useState(false);
  const { refreshPlayer } = useContext(AuthContext);
  const { playSound } = useContext(SoundEffectContext);

  // ── Animations ──
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(50)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  // The whole level-up runs on the UI thread on one engine (Reanimated, ui/motion.ts springs):
  // the coin's charge shake and punch, and the success card springing in.
  const coinPop = useSharedValue(1);
  // 0 to 1 through the charge (linear): the coin's wobble grows bigger and faster from it (windupWobble).
  const windup = useSharedValue(0);
  const successIn = useSharedValue(0);
  // 0 to 1 on success: the new coin settles bigger and a little lower, on its tier plate (no relayout of the coin).
  const grow = useSharedValue(0);
  // 0 to 1 on success: the tier plate behind the coin (a metal disc, or rays from Prismatic up) springs out.
  const plate = useSharedValue(0);
  // On a short phone a coin that lands on a stand (Level 6 and up) keeps its size and place, so the stand fits
  // above the prize box and Awesome! with nothing cut off (the stand itself already makes it read bigger).
  const successLevel = rideCoin ? Math.min(rideCoin.current_level + 1, rideCoin.max_level) : 1;
  const tightStand = SHORT_PHONE && coinTier(successLevel).stand !== 'none';
  const coinGrow = tightStand ? 1 : COIN_GROW;
  const coinDrop = tightStand ? 0 : SUCCESS_COIN_DROP;
  const coinStyle = useAnimatedStyle(() => {
    const x = windupWobble(windup.value, CHARGE_MS, 1.5, 6);
    return { transform: [{ translateY: coinDrop * grow.value }, { scale: coinPop.value * (1 + (coinGrow - 1) * grow.value) },
      { translateX: x }, { rotate: `${x * 0.9}deg` }] };
  });
  // The success content is on screen from its very first frame (never a blank card while a spring starts
  // from zero): it stamps in from a little small and a little tilted, overshoots and settles.
  const successStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.84 + 0.16 * successIn.value }, { rotate: `${-4 * (1 - Math.min(1, successIn.value))}deg` }],
  }));
  // Progression v2 level-up: three acts, the burst, the reveal and the Crowning.
  const [fx, setFx] = useState<LevelUpFx | null>(null);
  const [burstKey, setBurstKey] = useState(0);
  const [unlocks, setUnlocks] = useState<LevelUpUnlocks | null>(null);
  const [levelXp, setLevelXp] = useState(0);
  const [crowningId, setCrowningId] = useState<string | null>(null);
  const crowningSlot = usePresentationSlot(crowningId, 'crowning', 'coin_shelf');
  const pendingLinePlayRef = useRef(false);
  const pendingExploreRef = useRef(false);
  // Short on Tickets or Energy: the Supplies tab, opened after the sheet hides.
  const pendingSuppliesRef = useRef<null | 'tickets' | 'featured'>(null);
  const [showPartsHelp, setShowPartsHelp] = useState(false);
  // The card keeps its height from the tap through the success card (no collapse into a short card): the
  // content's height is tracked while the preview shows and held as a minimum once the charge starts.
  const contentHeight = useRef(0);
  // The card's visible height: the held height never passes it, so the success card's button is always on screen.
  const viewportHeight = useRef(0);
  // The held minimum height, on the UI thread: after the success settles it eases down to the success content
  // (about 280 ms), so the payoff never floats in a hollow card.
  const held = useSharedValue(0);
  const heldTarget = useRef(0);
  const heldStyle = useAnimatedStyle(() => ({ minHeight: held.value }));
  const lockHeight = (value: number) => { cancelUi(held); held.value = value; heldTarget.current = value; };
  // The success content's measured heights (the box that grows, and what is inside it).
  const successBox = useRef({ outer: 0, inner: 0 });
  // Whether the success card had room for the first-time tip (decided once per success, from its spare space).
  const [tipRoom, setTipRoom] = useState(false);
  // The card fits its payoff once per success, on the first measure, before Awesome! is on screen.
  const snugDone = useRef(false);
  const { tipsReady, hasSeenTip } = useHelp();
  // Awesome! pops in only once the card has its final height, so the button never moves after it shows.
  const ctaIn = useSharedValue(1);
  const [ctaLive, setCtaLive] = useState(true);
  const ctaShown = useRef(true);
  const ctaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctaStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, ctaIn.value * 1.6), transform: [{ scale: 0.72 + 0.28 * ctaIn.value }] }));
  // The button hides only once the charge bar is on screen over it (an effect after the commit), so the tap never
  // shows a frame with an empty slot between Level Up! and the charge bar.
  const hideCta = () => {
    if (ctaTimer.current) { clearTimeout(ctaTimer.current); ctaTimer.current = null; }
    ctaShown.current = false; setCtaLive(false);
  };
  useEffect(() => {
    if (state !== 'leveling' || ctaShown.current) return;
    cancelUi(ctaIn); ctaIn.value = 0;
  }, [state]);
  const showCtaNow = () => {
    if (ctaTimer.current) { clearTimeout(ctaTimer.current); ctaTimer.current = null; }
    ctaShown.current = true; cancelUi(ctaIn); ctaIn.value = 1; setCtaLive(true);
  };
  const revealCta = (after: number) => {
    if (ctaShown.current) return;
    ctaShown.current = true;
    if (ctaTimer.current) { clearTimeout(ctaTimer.current); ctaTimer.current = null; }
    cancelUi(ctaIn);
    if (reducedMotionRef.current) { ctaIn.value = 1; setCtaLive(true); return; }
    ctaIn.value = uiDelay(after, uiSpring(1, SPRING.pop));
    ctaTimer.current = setTimeout(() => { ctaTimer.current = null; if (mounted.current) setCtaLive(true); }, after);
  };

  // The level-up show, on the UI thread: the charge bar, the gold gathering behind the coin,
  // the burst bloom, sparkles and one shine across the new coin (ui/motion.ts language).
  const charge = useSharedValue(0);
  const gold = useSharedValue(0);
  const bloom = useSharedValue(0);
  const sparkle = useSharedValue(0);
  // Legendary and up: a second, wider sparkle wave a beat after the first.
  const sparkle2 = useSharedValue(0);
  const shine = useSharedValue(0);
  const bloomOut = useSharedValue(0);
  // The big fan's size for the level being reached (screen widths), set when the level-up starts.
  const [fanScale, setFanScale] = useState(1.5);
  const budget = usePowerBudget();
  const [slowServer, setSlowServer] = useState(false);
  // Gold rings tightening onto the coin while it charges, and one every 0.65 s while a slow server answers.
  const gatherRing = useSharedValue(0);
  const stopUiShow = () => { [charge, gold, bloom, sparkle, sparkle2, shine, ringPulse, bloomOut, slow, windup, gatherRing, coinPop].forEach(value => cancelUi(value)); };
  const chargeStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.001, charge.value) }] }));
  // 0 while charging, 1 once the server is slow (scheduled on the UI thread with the charge).
  const slow = useSharedValue(0);
  const poweringStyle = useAnimatedStyle(() => ({ opacity: 1 - slow.value }));
  const almostStyle = useAnimatedStyle(() => ({ opacity: slow.value, transform: [{ scale: 0.9 + 0.1 * slow.value }] }));
  // The payoff is bigger than the card: the gold and sparkles burst out past its edges and a
  // ring in the new tier's colour pulses outward. Anchored on the coin (measured, plain Views only).
  const rootRef = useRef<View>(null);
  const coinRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const ringPulse = useSharedValue(0);
  // How far the tier ring reaches grows with the tier (levelUpPayoff), so Legendary's ring is clearly the biggest.
  const ringReach = useSharedValue(0.9);
  const ringPulseStyle = useAnimatedStyle(() => ({
    opacity: ringPulse.value <= 0 || ringPulse.value >= 1 ? 0 : 1 - ringPulse.value,
    transform: [{ scale: 1 + ringPulse.value * ringReach.value }],
  }));
  const measureAnchor = () => {
    const root = rootRef.current; const coin = coinRef.current;
    if (!root || !coin) return;
    root.measureInWindow((rx, ry) => coin.measureInWindow((cx, cy, cw, ch) => {
      if ([rx, ry, cx, cy, cw, ch].every(Number.isFinite) && cw > 0) setAnchor({ x: cx - rx + cw / 2, y: cy - ry + ch / 2 });
    }));
  };
  stopUiShowRef.current = stopUiShow;
  stopAllUiRef.current = () => {
    [successIn, grow, plate, held, ctaIn, ringReach, charge, gold, bloom, sparkle, sparkle2, shine, ringPulse, bloomOut, slow,
      windup, gatherRing, coinPop].forEach(value => cancelUi(value));
  };

  // Staggered resource bar animations
  const energyBarAnim = useRef(new Animated.Value(0)).current;
  const partsBarAnim = useRef(new Animated.Value(0)).current;

  // ── Reset on open ──
  useEffect(() => {
    if (visible && rideCoin) {
      setFeatured(!!rideCoin.is_featured);
      setShowEditions(false);
      setFeatureError(false);
      setUpgradeError(null);
      // The burst's plan is known when the card opens, so its views are mounted (idle) before the tap.
      const opening = Math.min(rideCoin.current_level + 1, rideCoin.max_level);
      setFx(rideCoin.current_level < rideCoin.max_level
        ? levelUpFx(opening, rideCoin.parts_to_next_level, { reducedMotion: reducedMotionRef.current, dimFlashingLights: isDimFlashingLightsEnabled() })
        : null);
      setBurstKey(0); // 0 never plays: the burst waits for this card's own success
      setUnlocks(null); setLevelXp(0); setSlowServer(false);
      stopUiShow(); charge.value = 0; gold.value = 0; bloom.value = 0; sparkle.value = 0; sparkle2.value = 0; shine.value = 0; bloomOut.value = 0; ringPulse.value = 0;
      windup.value = 0; gatherRing.value = 0; setAnchor(null); lockHeight(0); showCtaNow();
      cancelUi(grow); cancelUi(plate); grow.value = 0; plate.value = 0;
      setFanScale(levelUpPayoff(Math.min(rideCoin.current_level + 1, rideCoin.max_level)).fanScale);
      const isMax = rideCoin.current_level >= rideCoin.max_level;
      setState(isMax ? 'maxed' : 'preview');
    }
  }, [visible, rideCoin?.id]);

  useEffect(() => {
    if (!visible || !rideCoin) return;
    const energyPct = rideCoin.energy_to_next_level > 0
      ? Math.min(playerEnergy / rideCoin.energy_to_next_level, 1) : 1;
    const partsPct = rideCoin.parts_to_next_level > 0
      ? Math.min(playerParts / rideCoin.parts_to_next_level, 1) : 1;
    if (reducedMotion) {
      fadeIn.setValue(1); slideUp.setValue(0);
      energyBarAnim.setValue(energyPct); partsBarAnim.setValue(partsPct);
      successIn.value = 1; coinPop.value = 1;
      return;
    }
    fadeIn.setValue(0); slideUp.setValue(50);
    energyBarAnim.setValue(0); partsBarAnim.setValue(0);
    const entrance = Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(slideUp, { toValue: 0, friction: 8, useNativeDriver: true }),
    ]);
    const bars = Animated.stagger(100, [
      Animated.timing(energyBarAnim, { toValue: energyPct, duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: false }),
      Animated.timing(partsBarAnim, { toValue: partsPct, duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: false }),
    ]);
    entrance.start(); bars.start();
    return () => { entrance.stop(); bars.stop(); };
  }, [visible, rideCoin?.id, reducedMotion]);

  // The success card is mounted by setState('success'). Its spring starts only after that commit: a spring
  // started earlier can finish on the UI thread before a busy JS thread mounts the card, which then mounts
  // with the stale small scale and sits there (seen for over a second in release JS under load).
  useEffect(() => {
    if (state !== 'success') { snugDone.current = false; setTipRoom(false); return undefined; }
    // The card fits the payoff on its first measure (snug), then Awesome! pops in. This only backs that up.
    const fallback = setTimeout(() => revealCtaRef.current(0), SUCCESS_CTA_FALLBACK_MS);
    cancelUi(successIn);
    if (reducedMotionRef.current) { successIn.value = 1; return () => clearTimeout(fallback); }
    successIn.value = 0;
    successIn.value = uiSpring(1, SPRING.stamp);
    return () => clearTimeout(fallback);
  }, [state]);
  useEffect(() => () => { if (ctaTimer.current) clearTimeout(ctaTimer.current); }, []);

  useEffect(() => {
    if (!reducedMotion) return;
    stopUpgradeEffects();
    cancelUi(coinPop); cancelUi(successIn); cancelUi(grow); cancelUi(plate);
    windup.value = 0; gatherRing.value = 0; coinPop.value = 1; successIn.value = 1;
    grow.value = state === 'success' ? 1 : 0; plate.value = state === 'success' ? 1 : 0;
  }, [reducedMotion]);

  // Dev-only evidence driver (no-op in release builds). Every hook runs before the
  // `!rideCoin` return: TaskCoinModal mounts this sheet with no coin, so a hook after the
  // return ran only once a coin loaded ("Rendered more hooks", a fatal crash on coin tap).
  const levelUpPress = useRef<() => void>(() => undefined);
  const revealCtaRef = useRef<(after: number) => void>(() => undefined);
  revealCtaRef.current = revealCta;
  useDevAutoPress(visible ? 'level_up' : 'level_up_off', () => levelUpPress.current(), 2500);

  // Fit the held height to the success content, once, on its first measure: the spare space in the success box
  // (beyond a small breathing gap) comes off the held minimum while the content stamps in, then Awesome! pops in at
  // its final spot. On the first-ever level-up with room for the tip, the card keeps that room (the tip fills it).
  const snug = () => {
    const { outer, inner } = successBox.current;
    if (snugDone.current || outer <= 0 || inner <= 0) return;
    snugDone.current = true;
    const room = outer - inner - SUCCESS_BOX_PAD * 2;
    const showTip = tipsReady && !hasSeenTip('first_level_up') && room >= TIP_ROOM;
    setTipRoom(showTip);
    const spare = room - SUCCESS_SNUG_GAP;
    if (showTip || spare <= 2 || heldTarget.current <= 0) { revealCta(0); return; }
    const target = Math.max(0, heldTarget.current - spare);
    heldTarget.current = target;
    cancelUi(held);
    if (reducedMotionRef.current) { held.value = target; revealCta(0); return; }
    held.value = uiTiming(target, { duration: SUCCESS_SNUG_MS, easing: EASE.out });
    revealCta(SUCCESS_SNUG_MS);
  };

  if (!rideCoin) return null;

  const currentLevel = rideCoin.current_level;
  const nextLevel = Math.min(currentLevel + 1, rideCoin.max_level);
  const isMaxLevel = currentLevel >= rideCoin.max_level;
  const tierColor = TIER_COLORS[Math.min(currentLevel - 1, TOP_TIER)];
  const nextTierColor = TIER_COLORS[Math.min(nextLevel - 1, TOP_TIER)];
  const tierName = TIER_NAMES[Math.min(currentLevel - 1, TOP_TIER)];
  const nextTierName = TIER_NAMES[Math.min(nextLevel - 1, TOP_TIER)];
  const nextVisualReward = TIER_VISUAL_REWARDS[Math.min(nextLevel - 1, TOP_TIER)];
  const nextPayoff = levelUpPayoff(nextLevel);

  const reveal = state === 'success' ? revealCard(unlocks, levelXp) : null;
  const hasEnergy = playerEnergy >= rideCoin.energy_to_next_level;
  const hasParts = playerParts >= rideCoin.parts_to_next_level;
  const ctaPinned = (state === 'success' || (!showEditions && !isMaxLevel && (state === 'preview' || state === 'confirm' || state === 'leveling')));
  const canLevelUp = !isMaxLevel && rideCoin.is_unlocked && hasEnergy && hasParts;
  const yourRides = (rideCoin as CollectedRideCoin).your_rides ?? null;
  const missingAction = rideCoin.is_unlocked && !isMaxLevel
    ? missingResourceAction(Math.max(0, rideCoin.parts_to_next_level - playerParts), Math.max(0, rideCoin.energy_to_next_level - playerEnergy))
    : null;

  // ── Level up sequence ──
  const handleLevelUp = async () => {
    if (!canLevelUp || upgradeBusy.current) return;
    upgradeBusy.current = true;
    setUpgradeError(null);

    setState('leveling');
    measureAnchor();
    // Under the charge bar the button waits hidden; Awesome! pops in once the success card has its final height.
    hideCta();
    setUnlocks(null);
    setLevelXp(0);
    const plan = levelUpFx(nextLevel, rideCoin.parts_to_next_level, { reducedMotion, dimFlashingLights: isDimFlashingLightsEnabled() });
    const payoff = levelUpPayoff(nextLevel);
    setFx(plan);
    setFanScale(payoff.fanScale);

    // Phase 1: the coin charges up, and every frame looks further along than the last: the wobble grows
    // bigger and faster (windupWobble), the coin swells faster and faster, the bar fills at a steady pace,
    // the gold gathers behind it and gold rings tighten onto it, coming in quicker toward the burst.
    // Then, if the server is slow, it hums (a breathing coin, a pulsing glow, a ring every 0.65 s), never a still bar.
    lockHeight(viewportHeight.current > 0 ? Math.min(contentHeight.current, viewportHeight.current - 14) : contentHeight.current);
    setSlowServer(false);
    stopUiShow(); bloom.value = 0; sparkle.value = 0; sparkle2.value = 0; shine.value = 0;
    charge.value = 0;
    gold.value = 0;
    windup.value = 0; gatherRing.value = 0;
    if (!reducedMotion) {
      charge.value = uiSequence(uiTiming(CHARGE_REACH, { duration: CHARGE_MS, easing: UiEasing.linear }),
        uiTiming(0.97, { duration: 5000, easing: EASE.out }));
      gold.value = uiSequence(uiTiming(0.62, { duration: CHARGE_MS, easing: EASE.charge }),
        uiRepeat(uiSequence(uiTiming(0.82, { duration: 420, easing: EASE.inOut }), uiTiming(0.6, { duration: 420, easing: EASE.inOut })), -1, false));
      windup.value = uiTiming(1, { duration: CHARGE_MS, easing: UiEasing.linear });
      gatherRing.value = uiSequence(uiTiming(3, { duration: CHARGE_MS, easing: UiEasing.in(UiEasing.quad) }),
        uiRepeat(uiSequence(uiTiming(3, { duration: 0 }), uiTiming(4, { duration: 650, easing: UiEasing.linear })), -1, false));
    } else {
      charge.value = CHARGE_REACH;
    }
    cancelUi(slow); slow.value = 0;
    slow.value = uiDelay(SLOW_SERVER_LABEL_MS, uiTiming(1, { duration: DURATION.quick }));
    upgradeTimers.current.push(setTimeout(() => { if (mounted.current) setSlowServer(true); }, SLOW_SERVER_LABEL_MS));

    // The charge always plays out in full so the pop lands at the peak, even
    // when the server answers instantly. Haptics climb with the charge.
    cancelUi(coinPop); cancelUi(successIn); successIn.value = 0;
    if (!reducedMotion) {
      coinPop.value = uiSequence(uiTiming(1.2, { duration: CHARGE_MS, easing: EASE.charge }),
        uiRepeat(uiSequence(uiTiming(1.25, { duration: 260, easing: EASE.inOut }), uiTiming(1.18, { duration: 260, easing: EASE.inOut })), -1, false));
    }
    // The burst lands on the clock, not on the JS-driven shake finishing (a busy JS thread used
    // to stretch a 0.9 s charge to about 2 s). Not in upgradeTimers: it must always resolve.
    const charged = reducedMotion ? Promise.resolve() : new Promise<void>((resolve) => {
      setTimeout(resolve, CHARGE_MS);
    });
    // Light 300, Medium 600, Heavy 900 through the app-wide haptic gate.
    const chargeTicks = plan.haptics.filter(tick => tick.intent !== 'success')
      .map(tick => setTimeout(() => queueHaptic(tick.intent), tick.at));

    upgradeTimers.current.push(...chargeTicks);
    // Phase 2: Flash + success
    try {
      const [outcome] = await Promise.all([onLevelUp(rideCoin.id), charged]);
      stopUpgradeEffects();
      if (!mounted.current) return;
      const result = typeof outcome === 'object' && outcome ? outcome : null;
      const success = outcome === true || !!result?.success;

      if (success) {
        playLimited('coin-level-up', { priority: SFX_PRIORITY.land, durationMs: 900 },
          () => { playSound(require('../../assets/sounds/reward.mp3')); });
        queueHaptic('success');
        setUnlocks(result?.unlocks ?? null);
        setLevelXp(result?.xp ?? 0);
        setBurstKey(key => key + 1);
        // Level 10: the Crowning takes the screen when the PresentationQueue allows it.
        if (plan.crowning) setCrowningId(`crowning:${rideCoin.id}:${Date.now()}`);

        // Stop the wobble and the rings, big pop: the new coin punches to 1.35x, then springs home.
        cancelUi(windup); windup.value = 0; cancelUi(gatherRing); gatherRing.value = 0;
        // The punch starts from wherever the charge left the coin (about 1.2x), never from a shrunken coin:
        // if a busy device holds a frame here, the kid still sees a big coin, not a half-size one.
        cancelUi(coinPop);
        setSlowServer(false);
        // Burst: the bar snaps full, the gold blooms and settles to a warm glow behind the new
        // coin, sparkles fly, and one shine sweeps the coin.
        cancelUi(charge); charge.value = uiTiming(1, { duration: 120 });
        cancelUi(gold);
        if (reducedMotionRef.current) {
          gold.value = 0.8;
          bloomOut.value = 0.5;
        } else {
          gold.value = uiTiming(1, { duration: 180, easing: EASE.out });
          bloom.value = uiSequence(uiTiming(1, { duration: 140, easing: EASE.out }), uiTiming(0, { duration: DURATION.bloom, easing: EASE.out }));
          sparkle.value = uiTiming(1, { duration: DURATION.sparkle });
          if (payoff.sparkleWaves === 2) sparkle2.value = uiDelay(240, uiTiming(1, { duration: DURATION.sparkle }));
          shine.value = uiDelay(380, uiTiming(1, { duration: 620, easing: EASE.inOut }));
          // The big fan peaks and then stays lit behind the card by tier: Legendary keeps most of it.
          bloomOut.value = uiSequence(uiTiming(payoff.fanPeak, { duration: 160, easing: EASE.out }),
            uiDelay(500, uiTiming(payoff.fanHold, { duration: 700, easing: EASE.out })));
          ringReach.value = payoff.ringReach;
          ringPulse.value = 0;
          ringPulse.value = uiSequence(uiTiming(0.001, { duration: 60 }), uiTiming(1, { duration: 700, easing: EASE.out }));
        }

        setState('success');

        cancelUi(grow); cancelUi(plate);
        if (reducedMotionRef.current) {
          coinPop.value = 1; successIn.value = 1; grow.value = 1; plate.value = 1;
        } else {
          coinPop.value = uiSequence(uiTiming(1.35, { duration: 140, easing: EASE.out }), uiSpring(1, SPRING.pop));
          // The new coin settles bigger, on its tier plate: the plate flares out from behind it a beat after the punch.
          grow.value = uiDelay(140, uiSpring(1, SPRING.pop));
          plate.value = 0;
          plate.value = uiDelay(90, uiSequence(uiTiming(1.12, { duration: 160, easing: EASE.out }), uiSpring(1, SPRING.pop)));
          // The success card springs in from an effect once it is mounted (see the state effect), never before.
        }

        // The server upgrade is already confirmed. A profile refresh failure must not
        // turn the successful purchase back into an apparent failed attempt.
        void refreshPlayer().catch(() => undefined);
      } else {
        throw new Error('Level up failed');
      }
    } catch (error) {
      stopUpgradeEffects();
      if (!mounted.current) return;
      const status = (error as { response?: { status?: number } })?.response?.status;
      setUpgradeError(status === 409
        ? 'This coin changed. Close its detail and reopen it to refresh your level.'
        : 'Your upgrade could not be confirmed. Check your connection and try again.');
      setState('preview');
      cancelUi(coinPop); windup.value = 0; gatherRing.value = 0; coinPop.value = 1; lockHeight(0); showCtaNow();
      cancelUi(grow); cancelUi(plate); grow.value = 0; plate.value = 0;
      progressAnim.setValue(0);
      charge.value = 0; gold.value = 0; bloomOut.value = 0; setSlowServer(false);
      queueHaptic('failBuzz');
    } finally {
      upgradeBusy.current = false;
    }
  };
  levelUpPress.current = () => { void handleLevelUp(); };


  const handleClose = () => {
    if (upgradeBusy.current) return;
    stopUpgradeEffects();
    if (reducedMotion) { onClose(); return; }
    const closing = Animated.timing(fadeIn, {
      toValue: 0, duration: 200, useNativeDriver: true,
    });
    upgradeAnimations.current.push(closing);
    closing.start(({ finished }) => {
      if (!finished || !mounted.current) return;
      setState('preview');
      cancelUi(coinPop); cancelUi(successIn); coinPop.value = 1; successIn.value = 0;
      cancelUi(grow); cancelUi(plate); grow.value = 0; plate.value = 0;
      progressAnim.setValue(0);
      charge.value = 0; gold.value = 0; bloomOut.value = 0; lockHeight(0); showCtaNow();
      onClose();
    });
  };

  // ── Interpolations ──
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1], outputRange: ['0%', '100%'],
  });
  const energyBarWidth = energyBarAnim.interpolate({
    inputRange: [0, 1], outputRange: ['0%', '100%'],
  });
  const partsBarWidth = partsBarAnim.interpolate({
    inputRange: [0, 1], outputRange: ['0%', '100%'],
  });

  return (
    <Modal
      animationIn="fadeIn"
      animationOut="fadeOut"
      isVisible={visible}
      animationInTiming={reducedMotion ? 120 : 250}
      animationOutTiming={reducedMotion ? 120 : 200}
      onBackButtonPress={state !== 'leveling' ? handleClose : undefined}
      onModalHide={() => {
        if (pendingLinePlayRef.current) {
          pendingLinePlayRef.current = false;
          onPlayInLine?.();
        }
        if (pendingExploreRef.current) {
          pendingExploreRef.current = false;
          RootNavigation.navigate('Explore');
        }
        if (pendingSuppliesRef.current) {
          const focus = pendingSuppliesRef.current;
          pendingSuppliesRef.current = null;
          RootNavigation.navigate('Store', { store: 'shark-shop', tab: 'supplies', focus });
        }
      }}
      onBackdropPress={state !== 'leveling' ? handleClose : undefined}
      backdropColor="#05346e"
      backdropOpacity={0.6}
      statusBarTranslucent
      style={{ margin: 0, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View ref={rootRef} collapsable={false} style={{
        opacity: fadeIn,
        transform: [{ translateY: slideUp }],
        width: SCREEN_W - 48,
        maxHeight: SCREEN_H * 0.82,
        alignItems: 'center',
      }}>
        {/* Behind the card: the big gold fan reaches past its edges on the success beat. */}
        {/* Mounted as soon as the coin is measured (hidden at 0): iOS reuses native views, and a view created on the
            tap could inherit a just-closed card's fill and border drawn over the coin. Nothing new mounts on the tap. */}
        {anchor && (
          <View pointerEvents="none" style={{ position: 'absolute', left: anchor.x - SCREEN_W * fanScale / 2, top: anchor.y - SCREEN_W * fanScale / 2,
            width: SCREEN_W * fanScale, height: SCREEN_W * fanScale, alignItems: 'center', justifyContent: 'center', zIndex: 5, ...BARE }}>
            {/* Never turns: a card left open must not spin a screen-sized layer (the small fan on the coin does).
                Its size grows with the tier, so Legendary throws rays well past the card while the kid reads it. */}
            <GoldBurst size={SCREEN_W * fanScale} amount={bloomOut} bloom={bloom} spin={false} reduced={reducedMotion} />
          </View>
        )}
        {/* Above the card: sparkles fly out over its edges and the new tier's ring pulses outward. */}
        {/* Mounted from the start of the charge (hidden until the burst), so the success frame mounts nothing heavy. */}
        {anchor && !reducedMotion && (
          <View pointerEvents="none" style={{ position: 'absolute', left: anchor.x, top: anchor.y, width: 0, height: 0,
            alignItems: 'center', justifyContent: 'center', zIndex: 30, ...BARE }}>
            <Reanimated.View style={[{ position: 'absolute', width: 132, height: 132, borderRadius: 66, borderWidth: nextPayoff.ringWidth,
              borderColor: coinTier(nextLevel).ring }, ringPulseStyle]} />
            <SparkleBurst progress={sparkle} radius={SCREEN_W * 0.46} count={momentParticles(nextPayoff.sparkles, budget, reducedMotion)} />
            {nextPayoff.sparkleWaves === 2 && (
              <SparkleBurst progress={sparkle2} radius={SCREEN_W * 0.62} count={momentParticles(nextPayoff.sparkles, budget, reducedMotion)} />
            )}
          </View>
        )}
        {/* Always a visible way out (the backdrop is a thin strip on small phones). */}
        {state !== 'leveling' && (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" onPress={handleClose} hitSlop={12}
            style={{ position: 'absolute', top: 58, right: 0, zIndex: 40 }}>
            <GameIcon name="close" size={34} />
          </TouchableOpacity>
        )}
        {/* ── Ribbon Header ── */}
        <Ribbon text={
          state === 'success' ? levelRibbon(nextLevel) :
          isMaxLevel ? tierName :
          rideCoin.ride_name
        } />

        {/* ── Main Card ── */}
        <View style={{
          backgroundColor: '#D9F5FF',
          marginTop: '-10%',
          width: '95%',
          zIndex: 10,
          borderRadius: 20,
          borderWidth: 2.5,
          borderColor: state === 'success' ? '#FFD363' : '#FFFFFF',
          shadowColor: state === 'success' ? nextTierColor : tierColor,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 16,
          overflow: 'hidden',
          flexShrink: 1,
        }}>
          <ScrollView
            onLayout={event => { viewportHeight.current = event.nativeEvent.layout.height; }}
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: ctaPinned ? 4 : 14 }}
          >
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: (state === 'success' ? 185 + SUCCESS_TEXT_DROP : 185)
                + standRoom(state === 'success' ? nextLevel : currentLevel, state === 'success', SHORT_PHONE)
                + standFloor(state === 'success' ? nextLevel : currentLevel)
                + plateRoom(nextLevel, state === 'success', SHORT_PHONE),
              backgroundColor: '#168AD7', borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }} />
            <View style={{ position: 'absolute', top: 16, left: 20, width: 15, height: 15,
              borderRadius: 8, borderWidth: 2, borderColor: '#FFFFFF88' }} />
            <View style={{ position: 'absolute', top: 71, right: 25, width: 21, height: 21,
              borderRadius: 11, borderWidth: 2, borderColor: '#FFFFFF88' }} />
            <View style={{ position: 'absolute', top: 132, left: 40, width: 8, height: 8,
              borderRadius: 4, backgroundColor: '#FFFFFF88' }} />
              <Reanimated.View pointerEvents={state === 'leveling' ? 'none' : 'auto'}
                onLayout={event => { if (state === 'preview' || state === 'confirm') contentHeight.current = event.nativeEvent.layout.height; }}
                style={[{ paddingTop: 6, paddingHorizontal: 14, paddingBottom: 4, alignItems: 'center' }, heldStyle]}>

                {/* ── Coin Display with CoinUpgradeDemo ── */}
                <Reanimated.View style={[{ marginBottom: 0 }, coinStyle]}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => state !== 'leveling' && setHoloVisible(true)}
                  >
                    <View ref={coinRef} collapsable={false} onLayout={() => { if (!anchor) measureAnchor(); }} style={{ alignItems: 'center', justifyContent: 'center', marginTop: (state === 'success' ? nextLevel : currentLevel) >= 10 ? 26 : 0,
                      marginBottom: ((state === 'success' ? nextLevel : currentLevel) >= 6 ? 14 : 0)
                        + standRoom(state === 'success' ? nextLevel : currentLevel, state === 'success', SHORT_PHONE)
                        + plateRoom(nextLevel, state === 'success', SHORT_PHONE) }}>
                      {/* Mounted with the card (hidden at 0), like every burst layer: nothing new mounts on the tap. */}
                      {state !== 'maxed' && (
                        <View pointerEvents="none" style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
                          <GoldBurst size={250} amount={gold} bloom={bloom} reduced={reducedMotion} />
                        </View>
                      )}
                      {/* The new tier's plate (mounted with the card, hidden at 0): a metal disc for Silver and Gold,
                          rays for Prismatic, a blazing sunburst for Legendary, so each tier looks different at a glance. */}
                      {!isMaxLevel && <TierPlate level={nextLevel} size={120} progress={plate} />}
                      <CoinStand level={state === 'success' ? nextLevel : currentLevel} size={120} layer="stand" />
                      {/* The coin at its current tier, and the next tier already mounted under it (still and hidden) from
                          the moment the card opens: the success frame only swaps which one shows, so the Legendary and
                          Prismatic layers (bolts, rays, stars) never mount on the burst frame. */}
                      <View style={{ opacity: state === 'success' ? 0 : 1 }}>
                        <CoinUpgradeDemo
                          level={currentLevel}
                          coinUrl={rideCoin.coin_url}
                          size={120}
                          showLabel={false}
                          animate={state !== 'success'}
                        />
                      </View>
                      {!isMaxLevel && (
                        <View pointerEvents="none" style={{ position: 'absolute', opacity: state === 'success' ? 1 : 0 }}>
                          <CoinUpgradeDemo
                            level={nextLevel}
                            coinUrl={rideCoin.coin_url}
                            size={120}
                            showLabel={false}
                            animate={state === 'success'}
                          />
                        </View>
                      )}
                      {/* The tier is unmistakable: a thick two-tone rim in the tier's own colour (silver, gold, water blue). */}
                      <TierRim level={state === 'success' ? nextLevel : currentLevel} size={120} />
                      <CoinStand level={state === 'success' ? nextLevel : currentLevel} size={120} layer="crown" />
                      <LevelUpBurst fx={fx} size={120} playKey={burstKey} />
                      {/* Mounted with the card (hidden at 0), so nothing new mounts on the tap. */}
                      {!reducedMotion && <GatherRings progress={gatherRing} size={128} count={2} color={coinTier(nextLevel).ring} width={5} />}
                      {/* Mounted with the card (all hidden at 0), so the tap and the burst frame mount nothing. */}
                      {!reducedMotion && (
                        <>
                          <View pointerEvents="none" style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
                            <ShineSweep progress={shine} size={104} />
                          </View>
                          <SparkleBurst progress={sparkle} radius={110} count={momentParticles(nextPayoff.sparkles, budget, reducedMotion)} />
                        </>
                      )}
                    </View>
                  </TouchableOpacity>
                </Reanimated.View>

                {/* ── Ride Name ── */}
                <Text style={{
                  fontFamily: 'Shark',
                  fontSize: 17,
                  color: '#17476B',
                  textTransform: 'uppercase',
                  textAlign: 'center',
                  marginBottom: 2,
                  marginTop: state === 'success' ? SUCCESS_TEXT_DROP : 0,
                  // A short phone skips this line on the success card (the ribbon already names the new tier).
                  display: state === 'success' && SHORT_PHONE ? 'none' : 'flex',
                }}>
                  {state === 'success' ? 'YOUR COIN LEVELED UP'
                    : state === 'maxed' ? 'MAX LEVEL REACHED' : 'LEVEL UP YOUR COIN'}
                </Text>

                {/* Share Studio: a fresh Lv5-9 level-up (the Crowning has its own). A round button pinned
                    over the coin art's top-left corner, so it adds no height (the CTA stays on an SE screen). */}
                {SHARE_IN_MODALS && (state === 'leveling' || state === 'success') && nextLevel >= 5 && nextLevel < 10 && (
                  <View pointerEvents={state === 'success' ? 'box-none' : 'none'}
                    style={{ position: 'absolute', left: 14, top: 30, zIndex: 5, opacity: state === 'success' ? 1 : 0 }}>
                    <FlexShareButton kind="coin_level" surface="coin_sheet" size="sm" caption
                      payload={{ coinUrl: rideCoin.coin_url, level: nextLevel, tierName: coinTierName(nextLevel), tierIndex: nextLevel, timesCollected: rideCoin.times_collected }} />
                  </View>
                )}

                {/* ── Level Badge Row (compact) ── the success card skips it: the ribbon and the big tier chip already say it. */}
                {state !== 'success' && <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginBottom: 6,
                  gap: 6,
                }}>
                  <Text style={{
                    fontFamily: 'Shark',
                    fontSize: 15,
                    color: '#05346e',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}>
                    Lv.{currentLevel} {tierName}
                  </Text>

                  {!isMaxLevel && (
                    <>
                      <GameIcon name="arrow" size={16} />
                      <Text style={{
                        fontFamily: 'Shark',
                        fontSize: 15,
                        color: '#a36609',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        opacity: 1,
                      }}>
                        Lv.{nextLevel} {nextTierName}
                      </Text>
                    </>
                  )}
                </View>}

                {!!rideCoin.editions?.length && (state === 'preview' || state === 'maxed' || state === 'leveling') && (
                  <TouchableOpacity accessibilityRole="button"
                    accessibilityLabel={`View ${rideCoin.editions.length} ride coin editions`}
                    onPress={() => setShowEditions(!showEditions)}
                    style={{ paddingVertical: 5, marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <GameIcon name="sparkle" size={16} />
                      <Text style={{ fontFamily: 'Knockout', fontSize: 14, color: '#0768b9', textAlign: 'center' }}>
                        {showEditions ? 'Back to coin' : `${rideCoin.editions[0].name}, view ${rideCoin.editions.length}`}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}

                {!!rideCoin.perk_track?.length && !showEditions && (state === 'preview' || state === 'maxed' || state === 'leveling') && (
                  <PerkTrack track={rideCoin.perk_track} currentLevel={currentLevel} reduced={reducedMotion} />
                )}

                {/* ── Level Progress Dots ── */}
                {!rideCoin.perk_track?.length && <View style={{
                  flexDirection: 'row',
                  gap: 5,
                  marginBottom: 8,
                }}>
                  {Array.from({ length: rideCoin.max_level }).map((_, i) => {
                    const filled = state === 'success' ? i < nextLevel : i < currentLevel;
                    const dotColor = TIER_COLORS[Math.min(i, TOP_TIER)];
                    return (
                      <View key={i} style={{
                        width: 14, height: 14, borderRadius: 7,
                        backgroundColor: filled ? dotColor : '#FFFFFF',
                        borderWidth: 2,
                        borderColor: filled ? '#FFFFFF' : '#83B9D2',
                        alignItems: 'center',
                        justifyContent: 'center',
                        ...(filled && Platform.OS === 'ios' ? {
                          shadowColor: dotColor,
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.6,
                          shadowRadius: 4,
                        } : {}),
                      }}>
                        {filled && <GameIcon name="check" size={12} />}
                      </View>
                    );
                  })}
                </View>}

                {/* ── Your rides: the ride journal behind this coin ── */}
                {yourRides && yourRides.count > 0 && (state === 'preview' || state === 'maxed' || state === 'leveling') && !showEditions && (
                  <View style={{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ffffff',
                    borderWidth: 2, borderColor: '#bfe5ff', borderRadius: 12, paddingVertical: 7, paddingHorizontal: 10, marginBottom: 8 }}
                    accessible accessibilityLabel={`You rode this ${yourRides.count} times.`}>
                    <GameIcon name="ride" size={28} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'Shark', fontSize: 15, color: '#05346e' }}>
                        YOUR RIDES: {yourRides.count}{yourRides.last_rode_at ? `, LAST ${ridDay(yourRides.last_rode_at)}` : ''}
                      </Text>
                      {!!yourRides.last_memory && <Text numberOfLines={1} style={{ fontFamily: 'Knockout', fontSize: 14, color: '#3d5f8c' }}>
                        “{yourRides.last_memory}”
                      </Text>}
                    </View>
                    {yourRides.average_rating !== null && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <GameIcon name="star" size={18} />
                      <Text style={{ fontFamily: 'Shark', fontSize: 15, color: '#05346e' }}>{yourRides.average_rating.toFixed(1)}</Text>
                    </View>}
                  </View>
                )}

                {showEditions && (state === 'preview' || state === 'maxed' || state === 'leveling') && (
                  <ScrollView style={{ maxHeight: 180, width: '100%', marginBottom: 10 }}
                    contentContainerStyle={{ gap: 7 }}>
                    {rideCoin.editions?.map(edition => <View key={edition.id} style={{
                      borderLeftWidth: 3, borderLeftColor: edition.color,
                      backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8,
                      paddingHorizontal: 10, paddingVertical: 6,
                    }}>
                      <Text style={{ color: edition.color, fontFamily: 'Knockout', fontSize: 14 }}>
                        {edition.name}
                      </Text>
                      <Text style={{ color: '#D5DFE8', fontFamily: 'Knockout', fontSize: 11 }}>
                        {edition.project_title} · {edition.source} · {new Date(edition.earned_at).toLocaleDateString()}
                      </Text>
                    </View>)}
                  </ScrollView>
                )}

                {!showEditions && (state === 'preview' || state === 'maxed' || state === 'leveling') && (
                  <TouchableOpacity
                    disabled={featureBusy || state === 'leveling'}
                    accessibilityRole="button"
                    accessibilityLabel={featured ? 'Remove featured ride coin from profile' : 'Feature ride coin on profile'}
                    onPress={async () => {
                      if (featureBusy || featureBusyRef.current) return;
                      featureBusyRef.current = true;
                      setFeatureBusy(true);
                      setFeatureError(false);
                      try {
                        const success = await onFeature(featured ? null : rideCoin.id);
                        if (success) setFeatured(!featured);
                        else setFeatureError(true);
                      } catch {
                        setFeatureError(true); // never leave the button stuck on Saving
                      } finally {
                        featureBusyRef.current = false;
                        setFeatureBusy(false);
                      }
                    }}
                    style={{ borderWidth: 2, borderColor: '#D99D24', backgroundColor: '#FFF5D6', borderRadius: 9,
                      paddingVertical: 7, paddingHorizontal: 13, marginBottom: 8 }}>
                    <Text style={{ color: '#795015', fontFamily: 'Knockout', fontSize: 13,
                      textAlign: 'center' }}>
                      {featureBusy ? 'Saving…' : featured ? 'Featured on your Profile. Remove' : 'Feature on your Profile'}
                    </Text>
                  </TouchableOpacity>
                )}
                {featureError && <Text style={{ color: '#FF9B9B', fontSize: 12, marginBottom: 6 }}>
                  Could not save your featured coin. Try again.
                </Text>}

                {/* ══════════════════════════════════════ */}
                {/* ── PREVIEW / CONFIRM STATE ── */}
                {/* ══════════════════════════════════════ */}
                {!showEditions && (state === 'preview' || state === 'confirm' || state === 'leveling') && !isMaxLevel && (
                  <>
                    {/* ── Upgrade Cost Section ── */}
                    <View style={{
                      width: '100%',
                      backgroundColor: '#FFFFFF',
                      borderWidth: 2,
                      borderColor: '#79C7EB',
                      borderRadius: 12,
                      padding: 14,
                      marginBottom: 12,
                    }}>
                      {/* Section Header */}
                      <Text style={{
                        fontFamily: 'Knockout',
                        fontSize: 11,
                        color: '#14517E',
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        marginBottom: 10,
                        textAlign: 'center',
                      }}>
                        Level-Up Cost
                      </Text>

                      {/* Cost Row */}
                      <View style={{
                        flexDirection: 'row',
                        justifyContent: 'space-around',
                        marginBottom: 14,
                      }}>
                        {/* Energy Cost */}
                        <View style={{ alignItems: 'center' }}>
                          <Image source={require('../../assets/images/energy.png')} style={{ width: 29, height: 29, marginBottom: 4 }} contentFit="contain" />
                          <Text style={{
                            fontFamily: 'Shark',
                            fontSize: 22,
                            color: '#173F65',
                          }}>
                            {rideCoin.energy_to_next_level}
                          </Text>
                          <Text style={{
                            fontFamily: 'Knockout',
                            fontSize: 10,
                            color: '#3B7197',
                            textTransform: 'uppercase',
                          }}>
                            Energy
                          </Text>
                        </View>

                        {/* Divider */}
                        <View style={{
                          width: 1,
                          backgroundColor: '#B9DDEC',
                          marginVertical: 4,
                        }} />

                        {/* Ride Parts Cost */}
                        <View style={{ alignItems: 'center' }}>
                          <Image source={require('../../assets/images/ride-parts.png')} style={{ width: 29, height: 29, marginBottom: 4 }} contentFit="contain" />
                          <Text style={{
                            fontFamily: 'Shark',
                            fontSize: 22,
                            color: '#173F65',
                          }}>
                            {rideCoin.parts_to_next_level}
                          </Text>
                          <Text style={{
                            fontFamily: 'Knockout',
                            fontSize: 10,
                            color: '#3B7197',
                            textTransform: 'uppercase',
                          }}>
                            Ride Parts
                          </Text>
                        </View>
                      </View>

                      {/* Divider Line */}
                      <View style={{
                        height: 1,
                        backgroundColor: '#B9DDEC',
                        marginBottom: 10,
                      }} />

                      {/* Your Balance Section */}
                      <Text style={{
                        fontFamily: 'Knockout',
                        fontSize: 11,
                        color: '#14517E',
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        marginBottom: 8,
                        textAlign: 'center',
                      }}>
                        You Have
                      </Text>

                      {/* Balance Row */}
                      <View style={{
                        flexDirection: 'row',
                        justifyContent: 'space-around',
                      }}>
                        {/* Energy Balance */}
                        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 6 }}>
                          <Image source={require('../../assets/images/energy.png')} style={{ width: 20, height: 20 }} contentFit="contain" />
                          <Text style={{
                            fontFamily: 'Shark',
                            fontSize: 18,
                            color: hasEnergy ? '#168052' : '#B43D42',
                          }}>
                            {playerEnergy.toLocaleString()}
                          </Text>
                          {hasEnergy && <GameIcon name="check" size={16} />}
                        </View>

                        {/* Ride Parts Balance */}
                        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 6 }}>
                          <Image source={require('../../assets/images/ride-parts.png')} style={{ width: 20, height: 20 }} contentFit="contain" />
                          <Text style={{
                            fontFamily: 'Shark',
                            fontSize: 18,
                            color: hasParts ? '#168052' : '#B43D42',
                          }}>
                            {playerParts.toLocaleString()}
                          </Text>
                          {hasParts && <GameIcon name="check" size={16} />}
                        </View>
                      </View>
                    </View>

                    <View style={{ width: '100%', backgroundColor: '#FFF4CE', borderWidth: 2,
                      borderColor: '#F3C657', borderRadius: 12, padding: 11, marginBottom: 12 }}>
                      <Text style={{ fontFamily: 'Shark', color: '#825414', fontSize: 15,
                        textAlign: 'center', marginBottom: 6 }}>NEXT LEVEL UNLOCKS</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Image source={require('../../assets/images/coingold.png')}
                          style={{ width: 31, height: 31 }} contentFit="contain" />
                        <Text style={{ flex: 1, fontFamily: 'Knockout', fontSize: 14,
                          color: '#19496B' }}>{nextVisualReward}</Text>
                      </View>
                      {rideCoin.next_level_perks.length > 0 && (
                        <View style={{ marginTop: 7, borderTopWidth: 1, borderTopColor: '#EBC970',
                          paddingTop: 7 }}>
                        {rideCoin.next_level_perks.map(perk => (
                          <View key={perk.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <GameIcon name="star" size={16} />
                            <Text style={{ flex: 1, fontFamily: 'Knockout', fontSize: 14, color: '#19496B' }}>{perk.description}</Text>
                          </View>
                        ))}
                        </View>
                      )}
                    </View>

                    {upgradeError && <View accessibilityRole="alert" style={{
                      flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8,
                      backgroundColor: '#FFF1C5', borderColor: '#F4C453', borderWidth: 2,
                      borderRadius: 12, padding: 10,
                    }}>
                      <Image source={require('../../assets/images/ride-parts.png')}
                        style={{ width: 28, height: 28 }} contentFit="contain" />
                      <Text style={{ flex: 1, fontFamily: 'Knockout', fontSize: 13, color: '#17476B' }}>
                        {upgradeError}
                      </Text>
                    </View>}
                    {/* First look at a coin card: what leveling costs and does, once. */}
                    {/* It stays mounted (hidden) through the charge: removing it at the tap left a stray copy of it
                        drawn over the coin for a few frames on iOS. */}
                    <View style={{ alignSelf: 'stretch', opacity: state === 'leveling' ? 0 : 1 }}>
                      <OneTimeTip id="coin_card" ready={visible && (state === 'preview' || state === 'leveling')} compact instantExit
                        style={{ alignSelf: 'stretch', marginBottom: 8 }} />
                      {/* A kid whose first success card had no room for its tip (a short phone, or a quick close)
                          sees it here once, on the next coin card after a level-up. */}
                      <OneTimeTip id="first_level_up" ready={visible && (state === 'preview' || state === 'leveling') && currentLevel >= 2}
                        compact instantExit style={{ alignSelf: 'stretch', marginBottom: 8 }} />
                    </View>
                  </>
                )}

                {/* ══════════════════════════════════════ */}
                {/* ── SUCCESS STATE ── */}
                {/* ══════════════════════════════════════ */}
                {/* Mounted with its content on the very first success frame (successStyle never scales it to nothing),
                    centred in the height the card already had, so the card neither empties nor jumps. */}
                {state === 'success' && (
                  <Reanimated.View onLayout={event => { successBox.current.outer = event.nativeEvent.layout.height; snug(); }}
                    style={[{ alignItems: 'center', justifyContent: 'center', paddingVertical: SUCCESS_BOX_PAD, flexGrow: 1, alignSelf: 'stretch' }, successStyle]}>
                    <View onLayout={event => { successBox.current.inner = event.nativeEvent.layout.height; snug(); }}
                      style={{ alignSelf: 'stretch', alignItems: 'center' }}>
                    {/* New tier announcement */}
                    <View style={{
                      backgroundColor: '#FFF5D6',
                      borderWidth: 2,
                      borderColor: '#F3C657',
                      borderRadius: 18,
                      paddingHorizontal: SHORT_PHONE ? 12 : 20,
                      paddingVertical: SHORT_PHONE ? 8 : 14,
                      alignItems: 'center',
                      marginBottom: SHORT_PHONE ? 6 : 16,
                      width: '100%',
                    }}>
                      {/* The tier first, as a big chip in the tier's own metal (silver, gold, water blue, orange):
                          a kid who cannot read yet still sees which coin they made. */}
                      <View accessibilityRole="header" accessibilityLabel={`${nextTierName}, Level ${nextLevel}`}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: coinTier(nextLevel).ring,
                          borderColor: coinTier(nextLevel).ringDeep, borderWidth: TIER_CHIP.border, borderRadius: 22,
                          paddingHorizontal: 16, paddingVertical: TIER_CHIP.padY }}>
                        <Text style={{ fontFamily: 'Shark', fontSize: TIER_CHIP.font, color: '#05346e', textTransform: 'uppercase', paddingTop: 3 }}>
                          {nextTierName}
                        </Text>
                        <View style={{ backgroundColor: '#05346e', borderRadius: 14, minWidth: TIER_CHIP.badge, height: TIER_CHIP.badge, alignItems: 'center',
                          justifyContent: 'center', paddingHorizontal: 6 }}>
                          <Text style={{ fontFamily: 'Shark', fontSize: TIER_CHIP.badgeFont, color: '#ffffff', paddingTop: 2 }}>{nextLevel}</Text>
                        </View>
                      </View>
                      {!SHORT_PHONE && (
                        <Text style={{ fontFamily: 'Knockout', fontSize: 14,
                          color: '#19496B', marginTop: 8, textAlign: 'center' }}>
                          {nextVisualReward}
                        </Text>
                      )}

                      {/* Progression v2 reveal: the perk or milestone card and its chips (server data). */}
                      {reveal && (
                        <View style={{ marginTop: SHORT_PHONE ? 6 : 10, width: '100%', backgroundColor: '#ffffff', borderRadius: 12,
                          borderWidth: 2, borderColor: '#ffcf3b', padding: SHORT_PHONE ? 7 : 10, alignItems: 'center' }}>
                          <Text style={{ fontFamily: 'Shark', fontSize: 16, color: '#05346e', textAlign: 'center' }}>{reveal.title}</Text>
                          <Text style={{ fontFamily: 'Knockout', fontSize: 14, color: '#19496B', textAlign: 'center', marginTop: 2 }}>{reveal.line}</Text>
                          {revealBadges(unlocks, levelXp).length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 8 }}>
                            {revealBadges(unlocks, levelXp).map(badge => (
                              <View key={badge.say} accessible accessibilityLabel={badge.say} style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                                backgroundColor: '#fff5d6', borderRadius: 16, borderWidth: 2, borderColor: '#ffcf3b', paddingHorizontal: CHIP.padX, paddingVertical: 4 }}>
                                <GameIcon name={badge.icon} size={CHIP.icon} />
                                <Text style={{ fontFamily: 'Shark', fontSize: CHIP.font, color: '#05346e', paddingTop: 2 }}>{badge.label}</Text>
                              </View>
                            ))}
                          </View>}
                        </View>
                      )}

                      {/* New bonuses (legacy curve): a picture and a big number each ("+500" with a trophy),
                          the full sentence is read out by VoiceOver. */}
                      {!reveal && rideCoin.next_level_perks.length > 0 && (
                        <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
                          {rideCoin.next_level_perks.map((perk) => {
                            const chip = perkChip(perk);
                            return (
                              <View key={perk.id} accessible accessibilityLabel={`New bonus: ${perk.description}`}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ffffff', borderRadius: 16,
                                  borderWidth: 2, borderColor: '#ffcf3b', paddingHorizontal: CHIP.padX + 2, paddingVertical: 5 }}>
                                <GameIcon name={chip.icon} size={CHIP.icon} />
                                <Text style={{ fontFamily: 'Shark', fontSize: CHIP.font, color: '#05346e', paddingTop: 2 }}>{chip.label}</Text>
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                    {/* The very first level-up's tip sits inside the card, above the button (never over it). */}
                    <OneTimeTip id="first_level_up" ready={visible && state === 'success' && tipRoom} compact instantExit
                      style={{ alignSelf: 'stretch', marginBottom: 10 }} />
                    </View>

                  </Reanimated.View>
                )}

                {!showEditions && !isMaxLevel && (state === 'preview' || state === 'confirm' || state === 'leveling') && (
                  <>
                    {/* Helper text for what you're missing */}
                    {!canLevelUp && state !== 'leveling' && (
                      <Text style={{
                        fontFamily: 'Knockout', fontSize: 11,
                        color: '#315D7B',
                        textAlign: 'center', marginTop: 8,
                      }}>
                        {!hasParts
                          ? showPartsHelp || !onPlayInLine
                            ? 'Win this ride again or play LinePlay in its line to earn Ride Parts.'
                            : 'Play LinePlay in this line to earn Ride Parts.'
                          : 'Energy comes from finds on your home map.'}
                      </Text>
                    )}
                    {/* Ride Parts are earned at the ride and never sold. The shop
                        only helps with what is sold: Tickets for more ride
                        challenges, or Energy. */}
                    {/* Short only on energy: the one pack that covers it, right here (grown-up gated). */}
                    {!canLevelUp && !isMaxLevel && rideCoin.is_unlocked && storeAvailable() && hasParts && !hasEnergy && (
                      <CoinTopUpOffer currency="energy" reason="level-up" need={Math.max(1, rideCoin.energy_to_next_level - playerEnergy)}
                        style={{ marginTop: 8 }} />
                    )}
                    {!canLevelUp && !isMaxLevel && rideCoin.is_unlocked && storeAvailable() && !hasParts && (
                      <TouchableOpacity onPress={() => { pendingSuppliesRef.current = !hasParts ? 'tickets' : 'featured'; handleClose(); }}
                        accessibilityRole="button" hitSlop={8}
                        accessibilityLabel={!hasParts ? 'Get tickets in Supplies. A grown-up buys these with real money.' : 'See Supplies packs with energy. A grown-up buys these with real money.'}>
                        <Text style={{ fontFamily: 'Knockout', fontSize: 13, color: '#0B5FA8', textAlign: 'center',
                          marginTop: 6, textDecorationLine: 'underline' }}>
                          {!hasParts ? 'Out of tickets? Get more in Supplies (real money)' : 'Need energy? Supplies packs have it (real money)'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}

                {/* ══════════════════════════════════════ */}
                {/* ── MAX LEVEL STATE ── */}
                {/* ══════════════════════════════════════ */}
                {state === 'maxed' && !showEditions && (
                  <View style={{ alignItems: 'center', paddingVertical: 10 }}>
                    <View style={{
                      backgroundColor: '#FFF5D6',
                      borderWidth: 2,
                      borderColor: 'rgba(249,115,22,0.4)',
                      borderRadius: 18,
                      paddingHorizontal: 20,
                      paddingVertical: 16,
                      alignItems: 'center',
                      width: '100%',
                      marginBottom: 16,
                    }}>
                      <Text style={{
                        fontFamily: 'Shark', fontSize: 24,
                        color: '#9D6300',
                        marginBottom: 4,
                      }}>
                        {tierName.toUpperCase()}
                      </Text>
                      <Text style={{
                        fontFamily: 'Knockout', fontSize: 14,
                        color: '#315D7B',
                        textAlign: 'center',
                        marginBottom: 12,
                      }}>
                        This coin is at its top level!
                      </Text>
                      {typeof rideCoin.parts_banked === 'number' && (
                        <Text style={{ fontFamily: 'Knockout', fontSize: 14, color: '#19496B', textAlign: 'center', marginBottom: 8 }}>
                          Parts saved: {rideCoin.parts_banked}{rideCoin.polish?.next_cost ? `. Next Trophy Polish: ${rideCoin.polish.next_cost} Parts` : ''}
                        </Text>
                      )}

                      {/* All perks */}
                      {rideCoin.current_perks.length > 0 && (
                        <View style={{ width: '100%' }}>
                          {rideCoin.current_perks.map((perk) => (
                            <View key={perk.id} style={{
                              flexDirection: 'row', alignItems: 'center', marginBottom: 4,
                            }}>
                              <View style={{ marginRight: 8 }}><GameIcon name="trophy" size={18} /></View>
                              <Text style={{
                                fontFamily: 'Knockout', fontSize: 14, color: '#19496B',
                              }}>
                                {perk.description}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>

                    <Text style={{
                      fontFamily: 'Knockout', fontSize: 12,
                      color: '#315D7B',
                      textAlign: 'center', marginBottom: 16,
                    }}>
                      {rideCoin.editions?.length
                        ? `${rideCoin.editions.length} project editions earned`
                        : `Level ${rideCoin.current_level} of ${rideCoin.max_level}`}
                    </Text>

                    <YellowButton text="Nice!" onPress={handleClose} />
                  </View>
                )}

                {onPlayInLine && !showEditions && (state === 'preview' || state === 'maxed' || state === 'leveling') &&
                  <TouchableOpacity accessibilityRole="button"
                    accessibilityLabel={`Play LinePlay for ${rideCoin.ride_name}`}
                    onPress={() => { pendingLinePlayRef.current = true; handleClose(); }}
                    style={{ alignSelf: 'center', paddingVertical: 10, marginTop: 5 }}>
                    <Text style={{ color: '#075b9b', fontFamily: 'Shark', fontSize: 15,
                      textDecorationLine: 'underline' }}>Waiting here? Play in Line</Text>
                  </TouchableOpacity>}

              </Reanimated.View>
          </ScrollView>
          {/* ── The one CTA ── pinned under the scrolling card, so a short phone shows it on the first frame. Level Up!, then the charge bar in its spot, then Awesome!: one button that never
              remounts (a new button's art decoded a few frames late on the success card) and one height, so
              nothing in the card moves from the tap to the settled card. */}
          {ctaPinned && (
            <View style={{ alignSelf: 'stretch', height: CTA_HEIGHT, justifyContent: 'center', marginHorizontal: 14, marginBottom: 14 }}>
              {/* Never unmounted: the charge bar covers it instead (an iOS image under a hidden parent drew late once shown
                  again). On success it pops in once the card has its final height, so it never moves after it shows. */}
              <Reanimated.View style={ctaStyle} pointerEvents={state === 'leveling' || (state === 'success' && !ctaLive) ? 'none' : 'auto'}>
                <YellowButton
                  estimatedWidth={SUCCESS_CTA_WIDTH}
                  text={state === 'success' ? 'Awesome!' : canLevelUp || !missingAction ? 'Level Up!' : missingAction.label}
                  disabled={state !== 'success' && !canLevelUp && !missingAction}
                  onPress={() => {
                    if (state === 'success') { handleClose(); return; }
                    if (canLevelUp || !missingAction) return handleLevelUp();
                    if (missingAction.kind === 'parts' && onPlayInLine) {
                      pendingLinePlayRef.current = true; handleClose();
                    } else if (missingAction.kind === 'energy') {
                      pendingExploreRef.current = true; handleClose();
                    } else {
                      setShowPartsHelp(true);
                    }
                  }}
                />
              </Reanimated.View>
              {state === 'leveling' && (
                <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: '#D9F5FF' }}
                  accessible accessibilityLiveRegion="polite"
                  accessibilityLabel={slowServer ? 'Almost there' : 'Powering up your coin'}>
                  {/* A dark track with a bright gold fill: easy to see on the pale card. */}
                  <View style={{
                    width: '86%', height: 24, borderRadius: 12,
                    backgroundColor: '#0b3a66', borderWidth: 3, borderColor: '#ffffff',
                    overflow: 'hidden', marginBottom: 8,
                  }}>
                    <Reanimated.View style={[{
                      position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%',
                      backgroundColor: '#ffcf3b', transformOrigin: 'left',
                    }, chargeStyle]}>
                      <View style={{ position: 'absolute', left: 0, right: 0, top: 2, height: 5, borderRadius: 3,
                        backgroundColor: '#fff2b0' }} />
                    </Reanimated.View>
                  </View>
                  {/* The label swaps on the UI thread (a starved JS thread can't hold it on Powering up!). */}
                  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                    <Reanimated.Text style={[LABEL_STYLE, poweringStyle]}>Powering up!</Reanimated.Text>
                    <Reanimated.Text style={[LABEL_STYLE, { position: 'absolute' }, almostStyle]}>Almost there!</Reanimated.Text>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      </Animated.View>


      {crowningSlot.visible && (
        <Crowning rideName={rideCoin.ride_name} coinUrl={rideCoin.coin_url} boss={rideCoin.boss ?? null}
          reduced={reducedMotion} playSound={playSound}
          onDone={() => { crowningSlot.done(); setCrowningId(null); }} />
      )}

      <HoloCoinPreview
        visible={holoVisible}
        coinUrl={rideCoin.coin_url}
        name={rideCoin.ride_name}
        onClose={() => setHoloVisible(false)}
      />
      {/* Share Studio presents from inside this modal (a root sheet can't present over it on iOS). */}
      {SHARE_IN_MODALS && visible && <ShareStudioHost portal />}
    </Modal>
  );
}

/** A bold two-tone rim over the coin in its tier's colours, so Level 2 reads silver and Level 3 gold at a glance. */
function TierRim({ level, size }: { readonly level: number; readonly size: number }) {
  const tier = coinTier(level);
  if (tier.level < 2) return null;
  // A metal band: a dark outer edge, a thick band in the tier colour and a bright inner lip.
  const d = size + 16;
  const band = d - 6;
  const lip = band - 16;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', width: d, height: d, borderRadius: d / 2, borderWidth: 3,
      borderColor: tier.ringDeep, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: band, height: band, borderRadius: band / 2, borderWidth: 8, borderColor: tier.ring,
        alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: lip, height: lip, borderRadius: lip / 2, borderWidth: 2, borderColor: tier.ringDeep }} />
      </View>
    </View>
  );
}

const LABEL_STYLE = { fontFamily: 'Shark', fontSize: 22, color: '#05346e', textTransform: 'uppercase' } as const;
/**
 * Explicitly bare (no fill, no border) for the layers that mount on the tap: iOS reuses native views, and a reused
 * view kept a closed tip card's cream fill and gold border, drawn shrinking over the coin. A value that equals the
 * default is skipped as "no change", so these are clear white and a 0 width, which always get written.
 */
const BARE = { backgroundColor: 'rgba(255,255,255,0)', borderWidth: 0, borderColor: 'rgba(255,255,255,0)' } as const;
