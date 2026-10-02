import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useContext, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Modal from 'react-native-modal';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import update from '../api/endpoints/daily-gifts/update';
import getDailyGift from '../api/endpoints/daily-gifts/create';
import { DailyGiftContext } from '../context/DailyGiftProvider';
import { useCurrencyFly } from '../context/CurrencyFlyProvider';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { AuthContext } from '../context/AuthProvider';
import { playSfx } from '../gamekit/SFX';
import type { DailyGiftAmountsType, DailyGiftRewardType, DailyGiftType } from '../models/daily-gift-type';
import { BRAND, GameIcon, ICON_SOURCES, gameAlert } from '../ui';
import { ws7Preview } from '../dev/ws7Preview';
import Ribbon from './Ribbon';
import RewardBurst from './RewardBurst';

const CHEST_CLOSED = require('../../assets/images/daily/chest-closed.png');
const CHEST_OPEN = require('../../assets/images/daily/chest-open.png');

type PrizeKind = 'coins' | 'energy' | 'tickets';
const PRIZE: Record<PrizeKind, { icon: 'coins' | 'energy' | 'ticket'; one: string; many: string; fly: string }> = {
  coins: { icon: 'coins', one: 'Shark Coin', many: 'Shark Coins', fly: 'coins' },
  energy: { icon: 'energy', one: 'Energy', many: 'Energy', fly: 'energy' },
  tickets: { icon: 'ticket', one: 'Park Ticket', many: 'Park Tickets', fly: 'tickets' },
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
export default function DailyGiftModal({ dailyGift, onMapOcclusionChange, onClosed, autoOpen = ws7Preview() === 'chest' }: {
  readonly dailyGift: DailyGiftType;
  readonly onMapOcclusionChange?: (busy: boolean) => void;
  /** After the card has gone: whether today's chest was claimed (false for "Back to map"). */
  readonly onClosed?: (claimed: boolean) => void;
  /** Dev visual QA only: open the chest without a tap. */
  readonly autoOpen?: boolean;
}) {
  const occlusion = useRef(onMapOcclusionChange); occlusion.current = onMapOcclusionChange;
  const closed = useRef(onClosed); closed.current = onClosed;
  useEffect(() => () => { occlusion.current?.(false); }, []);
  const { player, refreshPlayer } = useContext(AuthContext);
  const { triggerFly } = useCurrencyFly();
  const dims = useWindowDimensions();
  const width = dims.width;
  const height = dims.height ?? 800;
  const [visible, setVisible] = useState(false);
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
  const glow = useSharedValue(0);
  const prize = useSharedValue(0);
  const stamp = useSharedValue(0);
  const burst = useSharedValue(0);
  const punch = useSharedValue(0);
  const cardShake = useSharedValue(0);
  const spark = useSharedValue(0);

  useEffect(() => {
    if (!dailyGift.redeemed_at && player?.username) setVisible(true);
  }, [dailyGift.id, dailyGift.redeemed_at, player?.username]);

  useEffect(() => {
    bob.value = 0;
    glow.value = 0;
    if (visible && phase === 'closed' && !reducedMotion) {
      bob.value = withRepeat(withSequence(
        withTiming(-8, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      ), -1);
      glow.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true);
    }
    return () => { cancelAnimation(bob); cancelAnimation(glow); };
  }, [visible, phase, reducedMotion, bob, glow]);
  useEffect(() => () => {
    [shake, pop, prize, stamp, burst, punch, cardShake, spark].forEach(cancelAnimation);
  }, [shake, pop, prize, stamp, burst, punch, cardShake, spark]);
  useEffect(() => {
    if (!reducedMotion) return;
    [shake, pop, prize, stamp, burst, punch, cardShake, spark].forEach(cancelAnimation);
    shake.value = 0; pop.value = 1; burst.value = 0; cardShake.value = 0; spark.value = 0;
    prize.value = phase === 'open' ? 1 : 0;
    stamp.value = phase === 'open' ? 1 : 0;
    punch.value = phase === 'open' ? 1 : 0;
  }, [reducedMotion, phase, shake, pop, prize, stamp, burst, punch, cardShake, spark]);

  // Count the prize up from 1 once the chest is open (instant when reduced).
  useEffect(() => {
    if (phase !== 'open') { setShown(0); return; }
    setShown(countStart(amount));
    if (reducedMotion || amount <= 1) { setShown(amount); return; }
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
      else void Haptics.selectionAsync?.().catch(() => undefined);
    };
    countTimer.current = setTimeout(step, 260);
    return () => { if (countTimer.current) clearTimeout(countTimer.current); };
  }, [phase, amount, reducedMotion]);

  const dismiss = () => {
    setVisible(false);
    if (acknowledgedGift.current) {
      // The reward lands in its counter, drawn with the same art as the prize.
      const paid = chestAmounts(acknowledgedGift.current, today);
      (['coins', 'tickets', 'energy'] as PrizeKind[]).forEach(k => {
        if (paid[k] > 0) {
          triggerFly({ imageSource: ICON_SOURCES[PRIZE[k].icon],
            amount: Math.min(8, paid[k]), startX: width / 2, startY: height * 0.55, targetPosition: PRIZE[k].fly });
        }
      });
      setDailyGift(acknowledgedGift.current);
    }
  };

  const celebrate = (isTicket: boolean) => {
    if (reducedMotionRef.current) {
      shake.value = 0; pop.value = 1; prize.value = 1; stamp.value = 1; punch.value = 1;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      playSfx('win');
      return;
    }
    // Anticipation done: lid pops with overshoot, the prize rises, confetti bursts.
    pop.value = withSequence(withTiming(1.25, { duration: 110 }), withSpring(1, { damping: 7, stiffness: 180 }));
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
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    playSfx('win'); playSfx('coin', 0.9);
  };

  const open = async () => {
    if (claiming.current || phase !== 'closed') return;
    claiming.current = true;
    setPhase('opening');
    const startedAt = Date.now();
    if (!reducedMotion) {
      shake.value = withSequence(
        ...[10, -12, 14, -16, 18, -18, 0].map(v => withTiming(v, { duration: 60 })),
      );
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    }
    playSfx('tick', 0.8);
    try {
      const confirmed = await update(dailyGift.id);
      if (!confirmed.redeemed_at) throw new Error('Chest was not confirmed');
      acknowledgedGift.current = confirmed;
      void refreshPlayer?.();
      if (!mounted.current) { setDailyGift(confirmed); return; }
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
      if (current?.id === dailyGift.id && current.redeemed_at) {
        setDailyGift(current);
        void refreshPlayer?.();
        setVisible(false);
        gameAlert('Today’s chest is collected', 'Your rewards are already in your wallet. Come back tomorrow for the next chest.');
      } else {
        setPhase('closed');
        gameAlert('Could not open your chest', 'Your chest is still waiting. Check your connection and try again.');
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
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.35 + glow.value * 0.4, transform: [{ scale: 0.9 + glow.value * 0.15 }] }));
  // The prize rises out of the chest (from above), so it never slides into the lines below it.
  const prizeStyle = useAnimatedStyle(() => ({
    opacity: prize.value, transform: [{ translateY: (1 - prize.value) * -36 }, { scale: 0.5 + prize.value * 0.5 }],
  }));
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateX: cardShake.value }] }));
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

  const chestSize = Math.min(width * 0.52, 230);
  // Only a coin day opens onto the pile of coins; other prizes rise from the chest.
  const openArt = kind === 'coins' ? CHEST_OPEN : CHEST_CLOSED;

  return (
    <Modal isVisible={visible} animationIn={reducedMotion ? 'fadeIn' : 'zoomIn'}
      onModalWillShow={() => occlusion.current?.(true)} onModalHide={() => {
        occlusion.current?.(false);
        closed.current?.(!!acknowledgedGift.current);
      }}
      animationOut={reducedMotion ? 'fadeOut' : 'zoomOut'}
      animationInTiming={reducedMotion ? 120 : 260} animationOutTiming={reducedMotion ? 120 : 180}
      backdropColor={BRAND.navy}
      backdropOpacity={0.55} onBackdropPress={phase !== 'opening' ? dismiss : undefined}
      onBackButtonPress={phase !== 'opening' ? dismiss : undefined}>
      <Animated.View style={[styles.wrap, cardStyle]}>
        <Ribbon text="Daily Chest" />
        <View style={styles.card}>
          <Text style={styles.subtitle}>{phase === 'open' ? `Day ${day} collected!` : `Today’s chest: day ${day} of ${ladder.length}`}</Text>

          <View style={styles.ladder}>
            {ladder.map((r) => (
              <LadderDay key={r.day} reward={r} state={r.day < day ? 'done' : r.day === day ? 'today' : 'future'}
                stamp={r.day === day ? stamp : undefined} />
            ))}
          </View>
          {(displayedGift.streak ?? 0) > 1 && (
            <View style={styles.streakRow}>
              <GameIcon name="streak" size={18} />
              <Text style={styles.streakText}>{`${displayedGift.streak} day streak`}</Text>
            </View>
          )}

          <Pressable onPress={onChestPress} disabled={phase !== 'closed'} accessibilityRole="button"
            accessibilityState={{ disabled: phase !== 'closed', busy: phase === 'opening' }}
            accessibilityLabel={phase === 'open' ? `Opened: ${amount} ${prizeLabel(kind, amount)}` : 'Open today’s chest'}
            style={[styles.stage, { height: chestSize + 12 }]}>
            <Animated.View style={[styles.glow, { width: chestSize * 1.3, height: chestSize * 1.3, borderRadius: chestSize }, glowStyle]} />
            <Animated.View style={chestStyle}>
              <Image source={phase === 'open' ? openArt : CHEST_CLOSED} style={{ width: chestSize, height: chestSize }} contentFit="contain" />
            </Animated.View>
            {phase === 'open' && ticketDay && (
              <Animated.View style={[styles.ticketPunch, ticketStyle]} pointerEvents="none">
                <GameIcon name="ticket" size={chestSize * 0.62} />
                <Animated.View style={[styles.spark, sparkStyle]}>
                  <GameIcon name="sparkle" size={chestSize * 0.3} />
                </Animated.View>
              </Animated.View>
            )}
          </Pressable>

          <View style={[styles.prizeSlot, { height: prizeBlockHeight(extras.length, !!milestone, ticketDay) }]}>
          {phase === 'open' ? (
            <Animated.View style={[styles.prize, prizeStyle]}>
              {!ticketDay && <GameIcon name={PRIZE[kind].icon} size={56} />}
              <Text style={styles.prizeText}>+{Math.max(shown, countStart(amount))} {prizeLabel(kind, amount)}</Text>
              {extras.map(k => (
                <Text key={k} style={styles.prizeExtra}>+{amounts[k]} {prizeLabel(k, amounts[k])}</Text>
              ))}
              {milestone && <Text style={styles.milestone}>{`${milestone.label} bonus!`}</Text>}
            </Animated.View>
          ) : (
            <Text style={styles.hint}>{phase === 'opening' ? 'Opening your chest…' : 'Tap the chest to open it!'}</Text>
          )}
          </View>

          {phase === 'open' && next && (
            <Text style={styles.next}>{`${next.days_away} more day${next.days_away === 1 ? '' : 's'} to your ${next.label}`}</Text>
          )}

          {phase === 'open' && (
            <Pressable onPress={dismiss} accessibilityRole="button" style={styles.button}>
              <Text style={styles.buttonText}>{ticketDay ? 'SEE YOU AT THE PARK!' : 'AWESOME!'}</Text>
            </Pressable>
          )}
          {phase === 'closed' && <Pressable onPress={dismiss} accessibilityRole="button"
            accessibilityLabel="Back to map without opening this chest" style={styles.laterButton}>
            <Text style={styles.laterText}>BACK TO MAP</Text>
          </Pressable>}
        </View>
        <RewardBurst progress={burst} x={width * 0.47} y={height * 0.36} />
      </Animated.View>
    </Modal>
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
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  streakText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.gold },
  stage: { alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center', marginTop: 6 },
  glow: { position: 'absolute', backgroundColor: 'rgba(255, 226, 92, 0.35)' },
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
