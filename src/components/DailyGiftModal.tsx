import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useContext, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Modal from 'react-native-modal';
import Animated, {
  cancelAnimation, Easing, interpolate, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import update from '../api/endpoints/daily-gifts/update';
import getDailyGift from '../api/endpoints/daily-gifts/create';
import { DailyGiftContext } from '../context/DailyGiftProvider';
import { useCurrencyFly } from '../context/CurrencyFlyProvider';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { AuthContext } from '../context/AuthProvider';
import { playSfx } from '../gamekit/SFX';
import { playChestOpen, preloadLoopMoments } from '../gamekit/audio/loopSound';
import { useCaptureMark } from '../dev/captureMark';
import type { DailyGiftAmountsType, DailyGiftRewardType, DailyGiftType } from '../models/daily-gift-type';
import { BRAND, GameIcon, ICON_SOURCES, gameAlert } from '../ui';
import { ws7Preview } from '../dev/ws7Preview';
import { LocationStatusContext } from '../context/LocationProvider';
import { useRung } from '../services/reveal/revealLadder';
import { dailyChestAsked, dailyChestFromRewards, dailyChestMayShow, noteAutoOpen } from '../services/retention/rewardPresence';
import { returnToRewards } from '../services/retention/rewardsSignals';
import { useNativeModalLayer } from '../ui/modalLayers';
import Ribbon from './Ribbon';
import RewardBurst from './RewardBurst';
import { GoldBurst } from '../ui/GoldBurst';
import shortenNumber from '../helpers/shorten-number';
import { DURATION, EASE, SPRING } from '../ui/motionEasing';
import TapHint from './TapHint';

const CHEST_CLOSED = require('../../assets/images/daily/chest-closed.png');
const CHEST_OPEN = require('../../assets/images/daily/chest-open.png');
const WALLET_GLOW = require('../../assets/images/reveal/soft-spot.webp');

type PrizeKind = 'coins' | 'energy' | 'tickets';
const PRIZE: Record<PrizeKind, { icon: 'coins' | 'energy' | 'ticket'; one: string; many: string; fly: string }> = {
  coins: { icon: 'coins', one: 'coin', many: 'coins', fly: 'coins' },
  energy: { icon: 'energy', one: 'energy', many: 'energy', fly: 'energy' },
  tickets: { icon: 'ticket', one: 'ticket', many: 'tickets', fly: 'tickets' },
};

// Older servers send no ladder; show today's coins as day 1.
function fallbackLadder(gift: DailyGiftType): DailyGiftRewardType[] {
  return [{ day: 1, coins: gift.coins, energy: 0, tickets: 0 }];
}

function mainKind(r: DailyGiftAmountsType): PrizeKind {
  if (r.tickets > 0) return 'tickets';
  if (r.energy > 0) return 'energy';
  return 'coins';
}

export function prizeLabel(kind: PrizeKind, amount: number): string {
  return amount === 1 ? PRIZE[kind].one : PRIZE[kind].many;
}

/**
 * The amounts to celebrate. Once opened, only what the server says it paid
 * (`granted`); before that, the ladder day (never shown as earned).
 */
export function chestAmounts(gift: DailyGiftType, today: DailyGiftRewardType): DailyGiftAmountsType {
  return gift.granted ?? gift.reward ?? today;
}

/**
 * Daily chest: a 7-day ladder you climb by coming back, looping weekly with
 * streak milestones. Tap the chest to shake it open; the lid pops, the real
 * granted reward bursts out with confetti and counts up, and the day's stamp
 * lands on the ladder. Day 7 slams a Park Ticket down (motion and a sparkle,
 * no shapes drawn over the art). Closing flies the reward, in the same
 * GameIcon art as the prize, into its counter: coins and Tickets to the
 * header, Energy to the home avatar menu. An Energy or Ticket day never
 * shows a chest of coins.
 */

/** The count-up never shows "+0": it starts at 1 (or the whole prize when it is 0 or 1). */
export function countStart(amount: number): number {
  return Math.min(1, Math.max(0, amount));
}

/** Height the prize block reserves, so nothing below it ever moves or overlaps. */
export function prizeBlockHeight(extraLines: number, hasMilestone: boolean, ticketDay: boolean): number {
  return (ticketDay ? 0 : 60) + 38 + extraLines * 24 + (hasMilestone ? 24 : 0);
}
export default function DailyGiftModal({ dailyGift, onMapOcclusionChange, onClosed, autoOpen = ws7Preview() === 'chest', claim = update, simple = false,
  requested }: {
  readonly dailyGift: DailyGiftType;
  /**
   * The player tapped to open it (the Rewards button or sheet). At a park the card shows only then:
   * it never opens by itself there (core loop blueprint 4.3). At home the map decides when it mounts.
   */
  readonly requested?: boolean;
  readonly onMapOcclusionChange?: (busy: boolean) => void;
  /** After the card has gone: whether today's chest was claimed (false for "Back to map"). */
  readonly onClosed?: (claimed: boolean) => void;
  /** Dev visual QA only: open the chest without a tap. */
  readonly autoOpen?: boolean;
  /** The claim call (the release-like hook capture opens a local chest without the server). */
  readonly claim?: typeof update;
  /**
   * A brand new player's first visit: one big chest to tap, no 7-day strip,
   * streak or day count to read. The ladder shows from the next visit on.
   */
  readonly simple?: boolean;
}) {
  const occlusion = useRef(onMapOcclusionChange); occlusion.current = onMapOcclusionChange;
  const closed = useRef(onClosed); closed.current = onClosed;
  useEffect(() => () => { occlusion.current?.(false); }, []);
  // The chest's pop is decoded before the tap (wow-sound round 2: a first-play load rang it after the lid).
  useEffect(() => { preloadLoopMoments(); }, []);
  const { player, refreshPlayer } = useContext(AuthContext);
  const currencyFly = useCurrencyFly();
  const { triggerFly } = currencyFly;
  const getTarget = currencyFly.getTarget ?? (() => null);
  const dims = useWindowDimensions();
  const width = dims.width;
  const height = dims.height ?? 800;
  const [visible, setVisible] = useState(false);
  /** Opened from a Rewards sheet row: BACK (and AWESOME) return to the sheet, as a level chest does. */
  const fromRewards = useRef(false);
  // The chest registers as a native layer until UIKit really dismissed it, so the Rewards sheet coming back waits
  // for it. 'wait': asked from a Rewards row, it mounts while that sheet is still closing and presents the moment
  // UIKit says the sheet is gone (no bare map in between, never refused over a closing sheet). Opening by itself at
  // home, nothing else is up, so it presents at once as before.
  const layer = useNativeModalLayer(visible, 'wait');
  // At a park the chest never opens by itself: it waits in the Rewards button until the player asks.
  const atPark = !!useContext(LocationStatusContext)?.park;
  const mayShow = dailyChestMayShow({ atPark, requested, asked: dailyChestAsked() });
  // Before coin levels unlock (rung 3), Energy is "saved for growing coins": the number alone means nothing yet.
  const energyExplained = !useRung('coin_levels').open;
  const [phase, setPhase] = useState<'closed' | 'opening' | 'open'>('closed');
  const [confirmedGift, setConfirmedGift] = useState<DailyGiftType | null>(null);
  const [shown, setShown] = useState(0);
  const { setDailyGift } = useContext(DailyGiftContext);
  const reducedMotion = useReducedGameMotion();
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  const claiming = useRef(false);
  const acknowledgedGift = useRef<DailyGiftType | null>(null);
  const mounted = useRef(true);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const punchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (revealTimer.current) clearTimeout(revealTimer.current);
      if (countTimer.current) clearTimeout(countTimer.current);
      if (punchTimer.current) clearTimeout(punchTimer.current);
    };
  }, []);

  const displayedGift = confirmedGift ?? dailyGift;
  const ladder = displayedGift.ladder?.length ? displayedGift.ladder : fallbackLadder(displayedGift);
  const day = Math.min(ladder.length, Math.max(1, displayedGift.day ?? 1));
  const today = ladder[day - 1];
  const amounts = chestAmounts(displayedGift, today);
  const kind = mainKind(amounts);
  const amount = amounts[kind];
  const ticketDay = kind === 'tickets';
  const milestone = displayedGift.milestone ?? null;
  const next = displayedGift.next_milestone ?? null;
  const extras = (['coins', 'energy', 'tickets'] as PrizeKind[])
    .filter(k => k !== kind && amounts[k] > 0);

  const bob = useSharedValue(0);
  const shake = useSharedValue(0);
  const pop = useSharedValue(1);
  const prize = useSharedValue(0);
  const stamp = useSharedValue(0);
  const burst = useSharedValue(0);
  const punch = useSharedValue(0);
  const cardShake = useSharedValue(0);
  const spark = useSharedValue(0);
  // The shared gold (ui/GoldBurst): gathers while the chest shakes, blooms when the lid pops.
  const gold = useSharedValue(0);
  const goldBloom = useSharedValue(0);
  // Release-like hook capture only (an empty call in every other bundle): the lid's pop peak.
  useCaptureMark(pop, 'daily-chest-lid-peak', 1.245);

  useEffect(() => {
    if (!dailyGift.redeemed_at && player?.username && mayShow) {
      // Not asked for: this is the app open's one automatic open (nothing else opens by itself after it).
      if (requested !== true && !dailyChestAsked()) noteAutoOpen();
      fromRewards.current = dailyChestFromRewards();
      setVisible(true);
    }
  }, [dailyGift.id, dailyGift.redeemed_at, player?.username, mayShow]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bob.value = 0;
    if (visible && phase === 'closed' && !reducedMotion) {
      bob.value = withRepeat(withSequence(
        withTiming(-8, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      ), -1);
    }
    return () => { cancelAnimation(bob); };
  }, [visible, phase, reducedMotion, bob]);
  useEffect(() => () => {
    [shake, pop, prize, stamp, burst, punch, cardShake, spark, gold, goldBloom].forEach(cancelAnimation);
  }, [shake, pop, prize, stamp, burst, punch, cardShake, spark, gold, goldBloom]);
  useEffect(() => {
    if (!reducedMotion) return;
    [shake, pop, prize, stamp, burst, punch, cardShake, spark].forEach(cancelAnimation);
    shake.value = 0; pop.value = 1; burst.value = 0; cardShake.value = 0; spark.value = 0;
    cancelAnimation(gold); cancelAnimation(goldBloom); goldBloom.value = 0;
    gold.value = phase === 'open' ? 0.8 : 0;
    prize.value = phase === 'open' ? 1 : 0;
    stamp.value = phase === 'open' ? 1 : 0;
    punch.value = phase === 'open' ? 1 : 0;
  }, [reducedMotion, phase, shake, pop, prize, stamp, burst, punch, cardShake, spark]);

  // Count the prize up from 1 once the chest is open (instant when reduced).
  useEffect(() => {
    if (phase !== 'open') { setShown(0); return; }
    setShown(countStart(amount));
    if (reducedMotion || amount <= 1) { setShown(amount); flyToWallet(); return; }
    // ~650 ms in 20 frames; frame-counted so a stalled JS thread never skips the end.
    const frames = 20;
    let frame = 0;
    const step = () => {
      if (!mounted.current) return;
      frame += 1;
      const t = Math.min(1, frame / frames);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(t >= 1 ? amount : Math.max(1, Math.round(amount * eased)));
      if (t < 1) countTimer.current = setTimeout(step, 32);
      else { void Haptics.selectionAsync?.().catch(() => undefined); flyToWallet(); }
    };
    countTimer.current = setTimeout(step, 260);
    return () => { if (countTimer.current) clearTimeout(countTimer.current); };
  }, [phase, amount, reducedMotion]);

  // The wallet only changes when the coins land in it: the player refresh waits for the
  // count-up, then 3 to 5 coins fly from the pile to the coin chip, a tick each, and the chip bumps.
  const refreshed = useRef(false);
  const settleWallet = () => {
    if (refreshed.current || !acknowledgedGift.current) return;
    refreshed.current = true;
    void refreshPlayer?.();
  };
  const [walletFly, setWalletFly] = useState<{ from: { x: number; y: number }; to: { x: number; y: number }; count: number; start: number } | null>(null);
  const [landed, setLanded] = useState(0);
  const wrapRef = useRef<View>(null);
  const stageRef = useRef<View>(null);
  const flown = useRef(false);
  // The balance before this claim, taken at the chest tap: the chip counts up from here even if
  // something refreshes the player before the coins fly (it used to start 25 too high, then drop).
  const walletBefore = useRef<number | null>(null);
  const flyToWallet = () => {
    if (flown.current || !mounted.current) return;
    flown.current = true;
    const target = kind === 'coins' ? getTarget('coins') : null;
    const wrap = wrapRef.current; const stageView = stageRef.current;
    if (!target || !wrap || !stageView || reducedMotionRef.current) { settleWallet(); return; }
    wrap.measureInWindow((wx, wy) => stageView.measureInWindow((sx, sy, sw, sh) => {
      if (![wx, wy, sx, sy, sw, sh].every(Number.isFinite) || !mounted.current) { settleWallet(); return; }
      setWalletFly({ from: { x: sx - wx + sw / 2, y: sy - wy + sh * 0.45 }, to: { x: target.x - wx, y: target.y - wy },
        count: walletCoins(amount), start: Math.max(0, walletBefore.current ?? (player?.coins ?? 0)) });
    }));
  };
  const onCoinLand = (i: number, count: number) => {
    if (mounted.current) setLanded(n => Math.max(n, i + 1));
    playSfx('tick', 0.7 + i * 0.05);
    void Haptics.selectionAsync?.().catch(() => undefined);
    if (i === count - 1) settleWallet();
  };

  const dismiss = () => {
    setVisible(false);
    settleWallet();
    if (acknowledgedGift.current) {
      // The reward lands in its counter, drawn with the same art as the prize
      // (coins that already flew from the pile are not sent twice).
      const paid = chestAmounts(acknowledgedGift.current, today);
      (['coins', 'tickets', 'energy'] as PrizeKind[]).forEach(k => {
        if (paid[k] > 0 && !(k === 'coins' && walletFly)) {
          triggerFly({ imageSource: ICON_SOURCES[PRIZE[k].icon],
            amount: Math.min(8, paid[k]), startX: width / 2, startY: height * 0.55, targetPosition: PRIZE[k].fly });
        }
      });
      setDailyGift(acknowledgedGift.current);
    }
  };

  const celebrate = (isTicket: boolean) => {
    if (reducedMotionRef.current) {
      shake.value = 0; pop.value = 1; prize.value = 1; stamp.value = 1; punch.value = 1; gold.value = 0.8;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      playSfx('win');
      return;
    }
    // Anticipation done: lid pops with overshoot, the prize rises, confetti bursts.
    pop.value = withSequence(withTiming(1.25, { duration: 110 }), withSpring(1, SPRING.pop));
    gold.value = withTiming(1, { duration: 200, easing: EASE.out });
    goldBloom.value = withSequence(withTiming(1, { duration: 140, easing: EASE.out }),
      withTiming(0, { duration: DURATION.bloom, easing: EASE.out }));
    burst.value = 0;
    burst.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) });
    prize.value = withDelay(120, withSpring(1, { damping: 9, stiffness: 150 }));
    stamp.value = withDelay(650, withSpring(1, { damping: 8, stiffness: 220 }));
    if (isTicket) {
      // Day 7: the Ticket slams down, a short hit-stop, then the punch and a card shake.
      punch.value = withDelay(420, withSequence(
        withTiming(0.55, { duration: 140, easing: Easing.in(Easing.quad) }),
        withTiming(0.55, { duration: 90 }),
        withSpring(1, { damping: 6, stiffness: 260 }),
      ));
      cardShake.value = withDelay(650, withSequence(
        ...[9, -8, 6, -4, 2, 0].map(v => withTiming(v, { duration: 45 })),
      ));
      // A GameIcon sparkle flares on the impact frame and fades.
      spark.value = 0;
      spark.value = withDelay(640, withSequence(
        withTiming(1, { duration: 110, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 420, easing: Easing.in(Easing.quad) }),
      ));
      if (punchTimer.current) clearTimeout(punchTimer.current);
      punchTimer.current = setTimeout(() => {
        punchTimer.current = null;
        if (!mounted.current) return;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
        playSfx('hit');
      }, 650);
    }
    // Studio sound (approved Oct 24): the chest's own pop and coin spill, with its shaped buzz (wave 5: lid pop,
    // heavy land, coins patter) on the lid's frame. Switch off: exactly today's success buzz and sounds.
    if (playChestOpen()) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    playSfx('win'); playSfx('coin', 0.9);
  };

  const open = async () => {
    if (claiming.current || phase !== 'closed') return;
    claiming.current = true;
    walletBefore.current = player?.coins ?? null;
    setPhase('opening');
    const startedAt = Date.now();
    if (!reducedMotion) {
      shake.value = withSequence(
        ...[10, -12, 14, -16, 18, -18, 0].map(v => withTiming(v, { duration: 60 })),
      );
      // Anticipation: the chest squashes down (and holds two frames) while the gold gathers behind it.
      pop.value = withSequence(withTiming(0.85, { duration: 340, easing: EASE.in }), withTiming(0.85, { duration: 40 }));
      gold.value = withTiming(0.45, { duration: 420, easing: EASE.charge });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    }
    playSfx('tick', 0.8);
    try {
      const confirmed = await claim(dailyGift.id);
      if (!confirmed.redeemed_at) throw new Error('Chest was not confirmed');
      acknowledgedGift.current = confirmed;
      // The wallet refresh waits for the coins to land (flyToWallet); a closed screen refreshes now.
      if (!mounted.current) { void refreshPlayer?.(); setDailyGift(confirmed); return; }
      setConfirmedGift(confirmed);
      const confirmedLadder = confirmed.ladder?.length ? confirmed.ladder : fallbackLadder(confirmed);
      const confirmedToday = confirmedLadder[Math.min(confirmedLadder.length, Math.max(1, confirmed.day ?? 1)) - 1];
      const isTicket = mainKind(chestAmounts(confirmed, confirmedToday)) === 'tickets';
      revealTimer.current = setTimeout(() => {
        if (!mounted.current) return;
        setPhase('open');
        celebrate(isTicket);
      }, reducedMotion ? 0 : Math.max(0, 440 - (Date.now() - startedAt)));
    } catch {
      // A previous successful claim can outlive this screen. Reconcile before retrying.
      let current: DailyGiftType | null = null;
      try { current = await getDailyGift(); } catch { /* Leave an ordinary retry available. */ }
      if (!mounted.current) return;
      claiming.current = false;
      cancelAnimation(shake); shake.value = 0;
      cancelAnimation(pop); pop.value = 1; cancelAnimation(gold); gold.value = 0;
      if (current?.id === dailyGift.id && current.redeemed_at) {
        setDailyGift(current);
        void refreshPlayer?.();
        setVisible(false);
        gameAlert('Today’s chest is collected', 'You already got today’s prizes. Come back tomorrow for the next chest.');
      } else {
        setPhase('closed');
        gameAlert('Could not open your chest', 'Your chest is still waiting. Check your internet and try again.');
      }
    }
  };

  const onChestPress = () => { void open(); };
  useEffect(() => {
    if (!autoOpen || !visible || phase !== 'closed') return;
    const timer = setTimeout(() => { void open(); }, 2500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen, visible, phase]);

  const chestStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: phase === 'closed' ? bob.value : 0 }, { rotate: `${shake.value}deg` }, { scale: pop.value }],
  }));
  // The prize rises out of the chest (from above), so it never slides into the lines below it.
  const prizeStyle = useAnimatedStyle(() => ({
    opacity: prize.value, transform: [{ translateY: (1 - prize.value) * -36 }, { scale: 0.5 + prize.value * 0.5 }],
  }));
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateX: cardShake.value }] }));
  // Light pours out of the open chest with the lid pop (bright over the pile on a non-coin day).
  const mouthStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, prize.value * 1.4) * (kind === 'coins' ? 0.55 : 0.9),
    transform: [{ scaleY: 0.6 + Math.min(1.1, prize.value) * 0.4 }],
  }));
  // The prize climbs out of the chest mouth with a springy overshoot, then rests just above it.
  const riseStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, prize.value * 2),
    transform: [{ translateY: (1 - prize.value) * 40 }, { scale: 0.4 + prize.value * 0.6 }],
  }));
  // The Ticket falls from above tilted, squashes on impact, then settles.
  const ticketStyle = useAnimatedStyle(() => {
    const p = punch.value;
    return {
      opacity: p === 0 ? 0 : 1,
      transform: [
        { translateY: p < 0.55 ? -160 * (1 - p / 0.55) : 0 },
        { rotate: `${p < 0.55 ? -22 * (1 - p / 0.55) : -6 * (1 - p)}deg` },
        { scaleY: p >= 0.55 && p < 0.7 ? 0.82 : 1 },
      ],
    };
  });
  const sparkStyle = useAnimatedStyle(() => ({
    opacity: spark.value,
    transform: [{ scale: 0.6 + spark.value * 0.7 }, { rotate: `${spark.value * 25}deg` }],
  }));

  const chestSize = simple ? Math.min(width * 0.62, 260) : Math.min(width * 0.52, 230);
  // A coin day opens onto the pile of coins. Any other day never shows coins it did not pay: the lid pops,
  // light bursts out from under it and the prize itself climbs out and stays above the chest.
  const coinDay = kind === 'coins';

  return (
    <Modal isVisible={layer.present} animationIn={reducedMotion ? 'fadeIn' : 'zoomIn'}
      onModalWillShow={() => occlusion.current?.(true)} onModalHide={() => {
        occlusion.current?.(false);
        closed.current?.(!!acknowledgedGift.current);
        if (fromRewards.current) { fromRewards.current = false; returnToRewards(); }
      }}
      onDismiss={layer.onDismissed}
      animationOut={reducedMotion ? 'fadeOut' : 'zoomOut'}
      animationInTiming={reducedMotion ? 120 : 260} animationOutTiming={reducedMotion ? 120 : 180}
      backdropColor={BRAND.navy}
      backdropOpacity={0.55} onBackdropPress={phase !== 'opening' ? dismiss : undefined}
      onBackButtonPress={phase !== 'opening' ? dismiss : undefined}>
      <Animated.View ref={wrapRef} collapsable={false} style={[styles.wrap, cardStyle]}>
        <Ribbon text="Daily Chest" />
        <View style={styles.card}>
          {/* The ladder's words are "Day N of 7": the word streak belongs to the Daily 3 flame only. */}
          {simple ? null : <Text style={styles.subtitle}>{phase === 'open' ? `Day ${day} collected!` : `Day ${day} of ${ladder.length}`}</Text>}

          {simple ? null : <View style={[styles.ladder, styles.aboveGold]}>
            {ladder.map((r) => (
              <LadderDay key={r.day} reward={r} state={r.day < day ? 'done' : r.day === day ? 'today' : 'future'}
                stamp={r.day === day ? stamp : undefined} />
            ))}
          </View>}

          <Pressable ref={stageRef} collapsable={false} onPress={onChestPress} disabled={phase !== 'closed'} accessibilityRole="button"
            accessibilityState={{ disabled: phase !== 'closed', busy: phase === 'opening' }}
            accessibilityLabel={phase === 'open' ? `Opened: ${amount} ${prizeLabel(kind, amount)}` : 'Open today’s chest'}
            style={[styles.stage, { height: chestSize + 12 }]}>
            <View pointerEvents="none" style={styles.goldWrap}>
              {/* Big enough that the rays clear the chest by 40 pt or more on every side (they fade out by
                  about 74% of the radius); it overflows the stage and sits under the ladder. */}
              <GoldBurst size={chestSize * CHEST_GOLD_SCALE} amount={gold} bloom={goldBloom} reduced={reducedMotion} />
            </View>
            <Animated.View style={chestStyle}>
              {phase === 'open' && !coinDay && (
                // Light bursting out from under the popped lid, behind the chest (no coins it did not pay).
                <Animated.View pointerEvents="none" style={[styles.mouthGlow, { width: chestSize * 1.1, height: chestSize * 0.7,
                  left: -chestSize * 0.05, top: -chestSize * 0.22 }, mouthStyle]}>
                  <Image source={WALLET_GLOW} style={StyleSheet.absoluteFill} contentFit="fill" transition={0} tintColor="#fff3b0" />
                </Animated.View>
              )}
              <Image source={phase === 'open' && coinDay ? CHEST_OPEN : CHEST_CLOSED} style={{ width: chestSize, height: chestSize }} contentFit="contain" />
              {phase === 'open' && coinDay && (
                <Animated.View pointerEvents="none" style={[styles.mouthGlow, { width: chestSize * 0.8, height: chestSize * 0.42,
                  left: chestSize * 0.12, top: chestSize * 0.1 }, mouthStyle]}>
                  <Image source={WALLET_GLOW} style={StyleSheet.absoluteFill} contentFit="fill" transition={0} tintColor="#fff3b0" />
                </Animated.View>
              )}
            </Animated.View>
            {phase === 'open' && !coinDay && !ticketDay && (
              // The prize rises out of the open chest and stays there, so the settled card shows what came out.
              <Animated.View pointerEvents="none" style={[styles.risePrize, { top: chestSize * 0.02 }, riseStyle]}>
                <GameIcon name={PRIZE[kind].icon} size={chestSize * 0.4} />
              </Animated.View>
            )}
            {phase === 'open' && ticketDay && (
              <Animated.View style={[styles.ticketPunch, ticketStyle]} pointerEvents="none">
                <GameIcon name="ticket" size={chestSize * 0.62} />
                <Animated.View style={[styles.spark, sparkStyle]}>
                  <GameIcon name="sparkle" size={chestSize * 0.3} />
                </Animated.View>
              </Animated.View>
            )}
            {/* First visit: a hand taps the chest, no reading needed. */}
            {simple && phase === 'closed' && <TapHint delay={1400} style={{ right: '22%', bottom: chestSize * 0.18 }} />}
          </Pressable>

          <View style={[styles.prizeSlot, { height: prizeBlockHeight(extras.length + (energyExplained && (kind === 'energy' || extras.includes('energy')) ? 1 : 0), !!milestone, ticketDay) }]}>
          {phase === 'open' ? (
            <Animated.View style={[styles.prize, prizeStyle]}>
              {!ticketDay && <GameIcon name={PRIZE[kind].icon} size={56} />}
              <Text style={styles.prizeText}>+{Math.max(shown, countStart(amount))} {prizeLabel(kind, amount)}</Text>
              {extras.map(k => (
                <Text key={k} style={styles.prizeExtra}>+{amounts[k]} {prizeLabel(k, amounts[k])}</Text>
              ))}
              {energyExplained && (kind === 'energy' || extras.includes('energy')) && (
                <Text style={styles.prizeExtra}>Energy is saved for growing coins</Text>
              )}
              {milestone && <Text style={styles.milestone}>{`${milestone.label} bonus!`}</Text>}
            </Animated.View>
          ) : (
            <Text style={styles.hint}>{phase === 'opening' ? 'Opening your chest…' : 'Tap the chest to open it!'}</Text>
          )}
          </View>

          {phase === 'open' && next && !simple && (
            <Text style={styles.next}>{`${next.days_away} more day${next.days_away === 1 ? '' : 's'} to your ${next.label}`}</Text>
          )}

          {phase === 'open' && (
            <Pressable onPress={dismiss} accessibilityRole="button" style={styles.button}>
              <Text style={styles.buttonText}>{ticketDay ? 'SEE YOU AT THE PARK!' : 'AWESOME!'}</Text>
            </Pressable>
          )}
          {phase === 'closed' && <Pressable onPress={dismiss} accessibilityRole="button"
            accessibilityLabel={fromRewards.current ? 'Back to your Rewards without opening this chest' : 'Back to map without opening this chest'}
            style={styles.laterButton}>
            <Text style={styles.laterText}>{fromRewards.current ? 'BACK' : 'BACK TO MAP'}</Text>
          </Pressable>}
        </View>
        <RewardBurst progress={burst} x={width * 0.47} y={height * 0.36} />
        {walletFly && <WalletChip at={walletFly.to} start={walletFly.start} amount={amount} landed={landed} count={walletFly.count}
          caughtUp={(player?.coins ?? 0) >= walletFly.start + amount} />}
        {walletFly && Array.from({ length: walletFly.count }, (_, i) => (
          <WalletCoin key={i} index={i} from={walletFly.from} to={walletFly.to} onLand={() => onCoinLand(i, walletFly.count)} />
        ))}
        {walletFly && <WalletBump at={walletFly.to} count={walletFly.count} />}
      </Animated.View>
    </Modal>
  );
}

/** How many coins fly from the pile to the wallet: 3 for a small prize, up to 5. */
export function walletCoins(amount: number): number {
  return amount >= 50 ? 5 : amount >= 20 ? 4 : 3;
}

/** The chest gold fan, as a multiple of the chest art (rays visible to about 0.74 x half of this). */
export const CHEST_GOLD_SCALE = 2.4;
const WALLET_COIN = 42;
const WALLET_CHIP_HOLD = 500;
const WALLET_CHIP_MAX = 5000;
const WALLET_STAGGER = 110;
const WALLET_FLIGHT = 520;

/** One coin hopping out of the pile and arcing into the wallet chip (UI thread). */
function WalletCoin({ index, from, to, onLand }: {
  readonly index: number; readonly from: { x: number; y: number }; readonly to: { x: number; y: number }; readonly onLand: () => void;
}) {
  const t = useSharedValue(0);
  const land = useRef(onLand); land.current = onLand;
  useEffect(() => {
    t.value = withDelay(index * WALLET_STAGGER, withTiming(1, { duration: WALLET_FLIGHT, easing: Easing.in(Easing.quad) }));
    const timer = setTimeout(() => land.current(), index * WALLET_STAGGER + WALLET_FLIGHT);
    return () => { clearTimeout(timer); cancelAnimation(t); };
  }, [index, t]);
  const spread = (index - 2) * 14;
  const style = useAnimatedStyle(() => {
    const k = t.value;
    const x = from.x + spread * (1 - k) + (to.x - from.x) * k;
    // A hop up out of the pile, then a smooth arc into the chip.
    const y = from.y + (to.y - from.y) * k - Math.sin(Math.PI * Math.min(1, k * 1.1)) * 70;
    return {
      opacity: k <= 0 || k >= 1 ? 0 : 1,
      transform: [{ translateX: x - WALLET_COIN / 2 }, { translateY: y - WALLET_COIN / 2 }, { scale: interpolate(k, [0, 0.2, 1], [0.6, 1.15, 0.7]) }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.walletCoin, style]}>
      <Image source={ICON_SOURCES.coins} style={{ width: WALLET_COIN, height: WALLET_COIN }} contentFit="contain" transition={0} />
    </Animated.View>
  );
}

/**
 * A bright copy of the header coin chip drawn in the modal layer, right over the real one (which sits
 * under the navy scrim), so a kid sees the coins land in the wallet and the number go up. It counts
 * up one step per landing coin, then fades once the real chip has the new balance.
 */
function WalletChip({ at, start, amount, landed, count, caughtUp }: {
  readonly at: { x: number; y: number }; readonly start: number; readonly amount: number; readonly landed: number; readonly count: number;
  /** The real header chip already shows the new balance (the player refresh came back). */
  readonly caughtUp: boolean;
}) {
  const show = useSharedValue(0);
  const bump = useSharedValue(1);
  const done = landed >= count;
  useEffect(() => {
    show.value = withTiming(1, { duration: DURATION.quick });
    return () => cancelAnimation(show);
  }, [show]);
  useEffect(() => {
    if (landed <= 0) return;
    bump.value = withSequence(withTiming(1.16, { duration: 70 }), withSpring(1, SPRING.pop));
  }, [landed, bump]);
  // It fades only once the real chip has caught up (a slow refresh must never flash the old number back),
  // or after WALLET_CHIP_MAX if the refresh never answers.
  useEffect(() => {
    if (!done) return undefined;
    if (caughtUp) { show.value = withDelay(WALLET_CHIP_HOLD, withTiming(0, { duration: DURATION.quick })); return undefined; }
    const t = setTimeout(() => { show.value = withTiming(0, { duration: DURATION.quick }); }, WALLET_CHIP_MAX);
    return () => clearTimeout(t);
  }, [done, caughtUp, show]);
  const style = useAnimatedStyle(() => ({ opacity: show.value, transform: [{ scale: bump.value }] }));
  const value = start + Math.round(amount * Math.min(1, landed / Math.max(1, count)));
  // The real chip registers its container centre; its pill starts 14 pt in (marginLeft), so it is centred 7 pt right.
  return (
    <Animated.View pointerEvents="none" style={[styles.walletChip, { left: at.x + 7 - 43, top: at.y - 15 }, style]}>
      <Image source={ICON_SOURCES.coins} style={styles.walletChipIcon} contentFit="contain" transition={0} />
      <Text style={styles.walletChipText} numberOfLines={1}>{shortenNumber(value)}</Text>
    </Animated.View>
  );
}

/** A gold pop on the wallet chip, once per landing coin. */
function WalletBump({ at, count }: { readonly at: { x: number; y: number }; readonly count: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    const beats = Array.from({ length: count }, () => withSequence(withTiming(1, { duration: 70 }), withTiming(0, { duration: WALLET_STAGGER - 70 })));
    t.value = withDelay(WALLET_FLIGHT, withSequence(...beats));
    return () => cancelAnimation(t);
  }, [count, t]);
  const style = useAnimatedStyle(() => ({ opacity: t.value * 0.9, transform: [{ scale: 0.7 + t.value * 0.5 }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.walletBump, { left: at.x - 40, top: at.y - 40 }, style]}>
      <Image source={WALLET_GLOW} style={StyleSheet.absoluteFill} contentFit="fill" transition={0} tintColor={BRAND.gold} />
    </Animated.View>
  );
}

function LadderDay({ reward, state, stamp }: {
  readonly reward: DailyGiftRewardType;
  readonly state: 'done' | 'today' | 'future';
  readonly stamp?: SharedValue<number>;
}) {
  const kind = mainKind(reward);
  const fallback = useSharedValue(state === 'done' ? 1 : 0);
  const s = stamp ?? fallback;
  const checkStyle = useAnimatedStyle(() => ({ opacity: s.value, transform: [{ scale: 1.8 - s.value * 0.8 }] }));
  return (
    <View style={[styles.day, state === 'today' && styles.dayToday, reward.day === 7 && styles.daySeven]}>
      <Text style={[styles.dayLabel, state === 'today' && styles.dayLabelToday]}>{`DAY ${reward.day}`}</Text>
      <View style={state === 'future' ? styles.dimmed : undefined}>
        <GameIcon name={PRIZE[kind].icon} size={24} />
      </View>
      <Text style={styles.dayAmount}>{reward[kind]}</Text>
      {(state === 'done' || stamp) && <Animated.View style={[styles.check, checkStyle]}>
        <GameIcon name="check" size={26} accessibilityLabel="Collected" />
      </Animated.View>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  card: { width: '94%', marginTop: -14, backgroundColor: BRAND.blue, borderRadius: 24, borderWidth: 4, borderColor: BRAND.white,
    paddingTop: 22, paddingBottom: 18, paddingHorizontal: 12, alignItems: 'center' },
  subtitle: { fontFamily: 'Knockout', fontSize: 16, color: '#e4f7ff', marginBottom: 10, textAlign: 'center' },
  aboveGold: { zIndex: 2 },
  ladder: { flexDirection: 'row', gap: 4, alignSelf: 'stretch', justifyContent: 'center' },
  day: { flex: 1, maxWidth: 48, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 10,
    paddingVertical: 5 },
  dayToday: { backgroundColor: BRAND.gold },
  daySeven: { borderWidth: 2, borderColor: BRAND.gold },
  dayLabel: { fontFamily: 'Knockout', fontSize: 10, color: '#cdeaff' },
  dayLabelToday: { color: '#7a3d00' },
  dimmed: { opacity: 0.55, marginVertical: 2 },
  dayAmount: { fontFamily: 'Shark', fontSize: 13, color: BRAND.white },
  check: { ...StyleSheet.absoluteFillObject, borderRadius: 10, backgroundColor: 'rgba(60, 184, 92, 0.85)',
    justifyContent: 'center', alignItems: 'center' },
  stage: { alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center', marginTop: 6 },
  goldWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  mouthGlow: { position: 'absolute' },
  risePrize: { position: 'absolute', alignSelf: 'center', alignItems: 'center' },
  walletCoin: { position: 'absolute', left: 0, top: 0 },
  walletBump: { position: 'absolute', width: 80, height: 80 },
  walletChip: { position: 'absolute', width: 86, height: 30, borderRadius: 15, borderWidth: 2, borderColor: BRAND.white,
    backgroundColor: '#0b3f7d', flexDirection: 'row', alignItems: 'center', paddingLeft: 24, paddingRight: 8 },
  walletChipIcon: { position: 'absolute', left: -18, top: -5, width: 36, height: 36 },
  walletChipText: { flex: 1, textAlign: 'center', fontFamily: 'Shark', fontSize: 19, color: BRAND.white },
  ticketPunch: { position: 'absolute', alignItems: 'center', justifyContent: 'center', top: 0 },
  spark: { position: 'absolute', right: '8%', top: '10%' },
  prizeSlot: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  hint: { fontFamily: 'Shark', fontSize: 20, color: BRAND.gold },
  prize: { alignItems: 'center' },
  prizeText: { fontFamily: 'Shark', fontSize: 28, color: BRAND.gold,
    textShadowColor: '#7a3d00', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  prizeExtra: { fontFamily: 'Shark', fontSize: 18, color: BRAND.white },
  milestone: { fontFamily: 'Shark', fontSize: 16, color: BRAND.white, marginTop: 4 },
  next: { fontFamily: 'Knockout', fontSize: 15, color: '#e4f7ff', marginTop: 6, textAlign: 'center' },
  button: { marginTop: 14, alignSelf: 'stretch', backgroundColor: BRAND.gold, borderRadius: 16, paddingVertical: 12,
    alignItems: 'center', borderBottomWidth: 4, borderBottomColor: BRAND.goldLip },
  buttonText: { fontFamily: 'Shark', fontSize: 20, color: '#075083' },
  laterButton: { minHeight: 44, alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center',
    marginTop: 8, borderRadius: 12, borderWidth: 2, borderColor: '#8fcdff', backgroundColor: '#075395' },
  laterText: { fontFamily: 'Knockout', fontSize: 17, color: BRAND.white },
});
