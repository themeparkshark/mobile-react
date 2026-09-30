import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useContext, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Modal from 'react-native-modal';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import update from '../api/endpoints/daily-gifts/update';
import getDailyGift from '../api/endpoints/daily-gifts/create';
import { DailyGiftContext } from '../context/DailyGiftProvider';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { AuthContext } from '../context/AuthProvider';
import { playSfx } from '../gamekit/SFX';
import type { DailyGiftRewardType, DailyGiftType } from '../models/daily-gift-type';
import Ribbon from './Ribbon';

const CHEST_CLOSED = require('../../assets/images/daily/chest-closed.png');
const CHEST_OPEN = require('../../assets/images/daily/chest-open.png');
const ICON = {
  coins: require('../../assets/images/coingold.png'),
  energy: require('../../assets/images/energy.png'),
  tickets: require('../../assets/images/ticket-icon.png'),
};

// Older servers send no ladder; show today's coins as day 1.
function fallbackLadder(gift: DailyGiftType): DailyGiftRewardType[] {
  return [{ day: 1, coins: gift.coins, energy: 0, tickets: 0 }];
}

function mainReward(r: DailyGiftRewardType): { icon: number; amount: number; label: string } {
  if (r.tickets > 0) return { icon: ICON.tickets, amount: r.tickets, label: r.tickets === 1 ? 'Park Ticket' : 'Park Tickets' };
  if (r.energy > 0) return { icon: ICON.energy, amount: r.energy, label: 'Energy' };
  return { icon: ICON.coins, amount: r.coins, label: 'Shark Coins' };
}

/**
 * Daily chest: a 7-day ladder you climb by coming back. Tap (or keep tapping)
 * the chest to shake it open; the lid pops, rewards burst out and the day's
 * stamp lands on the ladder. Day 7 holds a Park Ticket for your next visit.
 */
export default function DailyGiftModal({ dailyGift }: { readonly dailyGift: DailyGiftType }) {
  const { player, refreshPlayer } = useContext(AuthContext);
  const { width } = useWindowDimensions();
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<'closed' | 'opening' | 'open'>('closed');
  const [confirmedGift, setConfirmedGift] = useState<DailyGiftType | null>(null);
  const { setDailyGift } = useContext(DailyGiftContext);
  const reducedMotion = useReducedGameMotion();
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  const claiming = useRef(false);
  const acknowledgedGift = useRef<DailyGiftType | null>(null);
  const mounted = useRef(true);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (revealTimer.current) clearTimeout(revealTimer.current);
    };
  }, []);

  const displayedGift = confirmedGift ?? dailyGift;
  const ladder = displayedGift.ladder?.length ? displayedGift.ladder : fallbackLadder(displayedGift);
  const day = Math.min(ladder.length, Math.max(1, displayedGift.day ?? 1));
  const today = ladder[day - 1];
  const reward = mainReward(today);

  const bob = useSharedValue(0);
  const shake = useSharedValue(0);
  const pop = useSharedValue(1);
  const glow = useSharedValue(0);
  const prize = useSharedValue(0);
  const stamp = useSharedValue(0);

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
    [shake, pop, prize, stamp].forEach(cancelAnimation);
  }, [shake, pop, prize, stamp]);
  useEffect(() => {
    if (!reducedMotion) return;
    [shake, pop, prize, stamp].forEach(cancelAnimation);
    shake.value = 0; pop.value = 1;
    prize.value = phase === 'open' ? 1 : 0;
    stamp.value = phase === 'open' ? 1 : 0;
  }, [reducedMotion, phase, shake, pop, prize, stamp]);

  const dismiss = () => {
    setVisible(false);
    if (acknowledgedGift.current) setDailyGift(acknowledgedGift.current);
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
      revealTimer.current = setTimeout(() => {
        if (!mounted.current) return;
        setPhase('open');
        if (reducedMotionRef.current) {
          shake.value = 0; pop.value = 1; prize.value = 1; stamp.value = 1;
        } else {
          pop.value = withSequence(withTiming(1.25, { duration: 110 }), withSpring(1, { damping: 7, stiffness: 180 }));
          prize.value = withDelay(120, withSpring(1, { damping: 9, stiffness: 150 }));
          stamp.value = withDelay(650, withSpring(1, { damping: 8, stiffness: 220 }));
        }
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        playSfx('win'); playSfx('coin', 0.9);
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
        Alert.alert('Today’s chest is collected', 'Your rewards are already in your wallet. Come back tomorrow for the next chest.');
      } else {
        setPhase('closed');
        Alert.alert('Could not open your chest', 'Your chest is still waiting. Check your connection and try again.');
      }
    }
  };

  const onChestPress = () => { void open(); };

  const chestStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: phase === 'closed' ? bob.value : 0 }, { rotate: `${shake.value}deg` }, { scale: pop.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.35 + glow.value * 0.4, transform: [{ scale: 0.9 + glow.value * 0.15 }] }));
  const prizeStyle = useAnimatedStyle(() => ({
    opacity: prize.value, transform: [{ translateY: (1 - prize.value) * 40 }, { scale: 0.5 + prize.value * 0.5 }],
  }));

  const chestSize = Math.min(width * 0.52, 230);

  return (
    <Modal isVisible={visible} animationIn={reducedMotion ? 'fadeIn' : 'zoomIn'}
      animationOut={reducedMotion ? 'fadeOut' : 'zoomOut'}
      animationInTiming={reducedMotion ? 120 : 260} animationOutTiming={reducedMotion ? 120 : 180}
      backdropOpacity={0.7} onBackdropPress={phase !== 'opening' ? dismiss : undefined}
      onBackButtonPress={phase !== 'opening' ? dismiss : undefined}>
      <View style={styles.wrap}>
        <Ribbon text="Daily Chest" />
        <View style={styles.card}>
          <Text style={styles.subtitle}>{phase === 'open' ? `Day ${day} collected!` : `Today’s chest · Day ${day} of ${ladder.length}`}</Text>

          <View style={styles.ladder}>
            {ladder.map((r) => (
              <LadderDay key={r.day} reward={r} state={r.day < day ? 'done' : r.day === day ? 'today' : 'future'}
                stamp={r.day === day ? stamp : undefined} />
            ))}
          </View>

          <Pressable onPress={onChestPress} disabled={phase !== 'closed'} accessibilityRole="button"
            accessibilityState={{ disabled: phase !== 'closed', busy: phase === 'opening' }}
            accessibilityLabel={phase === 'open' ? `Opened: ${reward.amount} ${reward.label}` : 'Open today’s chest'}
            style={[styles.stage, { height: chestSize + 40 }]}>
            <Animated.View style={[styles.glow, { width: chestSize * 1.3, height: chestSize * 1.3, borderRadius: chestSize }, glowStyle]} />
            <Animated.View style={chestStyle}>
              <Image source={phase === 'open' ? CHEST_OPEN : CHEST_CLOSED} style={{ width: chestSize, height: chestSize }} contentFit="contain" />
            </Animated.View>
          </Pressable>

          {phase === 'open' ? (
            <Animated.View style={[styles.prize, prizeStyle]}>
              <Image source={reward.icon} style={styles.prizeIcon} contentFit="contain" />
              <Text style={styles.prizeText}>+{reward.amount} {reward.label}</Text>
              {today.tickets > 0 && today.coins > 0 && <Text style={styles.prizeExtra}>+{today.coins} Shark Coins</Text>}
            </Animated.View>
          ) : (
            <Text style={styles.hint}>{phase === 'opening' ? 'Opening your chest…' : 'Tap the chest to open it!'}</Text>
          )}

          {phase === 'open' && (
            <Pressable onPress={dismiss} accessibilityRole="button" style={styles.button}>
              <Text style={styles.buttonText}>{day === 7 ? 'SEE YOU AT THE PARK!' : 'AWESOME!'}</Text>
            </Pressable>
          )}
          {phase === 'closed' && <Pressable onPress={dismiss} accessibilityRole="button"
            accessibilityLabel="Back to map without opening this chest" style={styles.laterButton}>
            <Text style={styles.laterText}>BACK TO MAP ›</Text>
          </Pressable>}
        </View>
      </View>
    </Modal>
  );
}

function LadderDay({ reward, state, stamp }: {
  readonly reward: DailyGiftRewardType;
  readonly state: 'done' | 'today' | 'future';
  readonly stamp?: SharedValue<number>;
}) {
  const r = mainReward(reward);
  const fallback = useSharedValue(state === 'done' ? 1 : 0);
  const s = stamp ?? fallback;
  const checkStyle = useAnimatedStyle(() => ({ opacity: s.value, transform: [{ scale: 1.8 - s.value * 0.8 }] }));
  return (
    <View style={[styles.day, state === 'today' && styles.dayToday, reward.day === 7 && styles.daySeven]}>
      <Text style={[styles.dayLabel, state === 'today' && styles.dayLabelToday]}>{reward.day === 7 ? 'DAY 7' : `DAY ${reward.day}`}</Text>
      <Image source={r.icon} style={[styles.dayIcon, state === 'future' && { opacity: 0.55 }]} contentFit="contain" />
      <Text style={styles.dayAmount}>{r.amount}</Text>
      {(state === 'done' || stamp) && <Animated.View style={[styles.check, checkStyle]}><Text style={styles.checkText}>✓</Text></Animated.View>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  card: { width: '94%', marginTop: -14, backgroundColor: '#0768b9', borderRadius: 24, borderWidth: 4, borderColor: '#fff',
    paddingTop: 22, paddingBottom: 18, paddingHorizontal: 12, alignItems: 'center' },
  subtitle: { fontFamily: 'Knockout', fontSize: 16, color: '#e4f7ff', marginBottom: 10, textAlign: 'center' },
  ladder: { flexDirection: 'row', gap: 4, alignSelf: 'stretch', justifyContent: 'center' },
  day: { flex: 1, maxWidth: 48, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 10,
    paddingVertical: 5 },
  dayToday: { backgroundColor: '#ffcf3b' },
  daySeven: { borderWidth: 2, borderColor: '#ffcf3b' },
  dayLabel: { fontFamily: 'Knockout', fontSize: 10, color: '#cdeaff' },
  dayLabelToday: { color: '#7a3d00' },
  dayIcon: { width: 24, height: 24, marginVertical: 2 },
  dayAmount: { fontFamily: 'Shark', fontSize: 13, color: '#fff' },
  check: { ...StyleSheet.absoluteFillObject, borderRadius: 10, backgroundColor: 'rgba(22, 163, 74, 0.8)',
    justifyContent: 'center', alignItems: 'center' },
  checkText: { fontFamily: 'Shark', fontSize: 24, color: '#fff' },
  stage: { alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center', marginTop: 6 },
  glow: { position: 'absolute', backgroundColor: 'rgba(255, 226, 92, 0.35)' },
  hint: { fontFamily: 'Shark', fontSize: 20, color: '#ffcf3b' },
  prize: { alignItems: 'center' },
  prizeIcon: { width: 56, height: 56 },
  prizeText: { fontFamily: 'Shark', fontSize: 28, color: '#ffcf3b',
    textShadowColor: '#7a3d00', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  prizeExtra: { fontFamily: 'Shark', fontSize: 18, color: '#fff' },
  button: { marginTop: 14, alignSelf: 'stretch', backgroundColor: '#ffcf3b', borderRadius: 16, paddingVertical: 12,
    alignItems: 'center', borderBottomWidth: 4, borderBottomColor: '#d99a00' },
  buttonText: { fontFamily: 'Shark', fontSize: 20, color: '#075083' },
  laterButton: { minHeight: 44, alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center',
    marginTop: 8, borderRadius: 12, borderWidth: 2, borderColor: '#8fcdff', backgroundColor: '#075395' },
  laterText: { fontFamily: 'Knockout', fontSize: 17, color: '#fff' },
});
