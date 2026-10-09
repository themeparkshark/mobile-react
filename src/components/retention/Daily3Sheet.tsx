import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import type { DailyGoal, DailyThreeState, WeekDayState } from '../../api/endpoints/retention';
import { haptic } from '../../gamekit/Haptics';
import { doneCount, goalAction, resetLabel, streakLine, weekdayLetter } from '../../services/retention/logic';
import { BRAND, GameIcon } from '../../ui';

const CHEST = require('../../../assets/images/daily/chest-closed.png');
const SNACK = require('../../../assets/images/social/topic_snacks.png');
const FREEZE = require('../../../assets/images/retention/freeze.png');

export type GoalTap = 'chest' | 'closet' | 'friends' | 'map';

/**
 * The Daily 3 card: streak on top, three goals you can read in one glance,
 * the chest they open, then the week strip toward the Weekly Box.
 * Every number on it comes from the server.
 */
export default function Daily3Sheet({ state, now, onClaim, onClaimWeekly, onBuyFreeze, onGoal, onClose, busy, coins,
  celebrate, reducedMotion }: {
  readonly state: DailyThreeState;
  readonly now: number;
  readonly onClaim: () => void;
  readonly onClaimWeekly: () => void;
  readonly onBuyFreeze: () => void;
  readonly onGoal: (tap: GoalTap) => void;
  readonly onClose: () => void;
  readonly busy: boolean;
  readonly coins: number;
  /** Goal keys that just turned done: they pop when the card opens. */
  readonly celebrate: readonly string[];
  readonly reducedMotion: boolean;
}) {
  const done = doneCount(state.goals);
  const s = state.streak;
  // The + shows only when a freeze fits and the coins are there (one tap, Shark Coins only).
  const canBuyFreeze = s.freezes < s.freeze_cap && coins >= s.freeze_price;
  return (
    <View style={styles.card}>
      <View style={styles.streakRow}>
        <Flame days={s.days} lit={state.done || s.days > 0} reducedMotion={reducedMotion} />
        <View style={styles.streakText}>
          <Text style={styles.streakBig} numberOfLines={1}>{s.days > 0 ? `${s.days} DAY STREAK` : 'NO STREAK YET'}</Text>
          <Text style={styles.streakSub} numberOfLines={2}>{streakLine(state)}</Text>
        </View>
        <Pressable onPress={canBuyFreeze ? onBuyFreeze : undefined} disabled={busy || !canBuyFreeze} hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`${s.freezes} of ${s.freeze_cap} streak freezes.${canBuyFreeze ? ` Get one for ${s.freeze_price} coins.` : ''}`}
          style={styles.freezes}>
          {Array.from({ length: s.freeze_cap }, (_, i) => (
            <Image key={i} source={FREEZE} style={[styles.freezeIcon, i >= s.freezes && styles.freezeEmpty]} contentFit="contain" />
          ))}
          {canBuyFreeze && <View style={styles.plus}><Text style={styles.plusText}>+</Text></View>}
        </Pressable>
      </View>

      <View style={styles.goals}>
        {state.goals.map((g, i) => (
          <GoalRow key={g.key} goal={g} index={i} pop={celebrate.includes(g.key)} reducedMotion={reducedMotion}
            onPress={() => { const a = goalAction(g); if (a) onGoal(a); }} />
        ))}
      </View>

      <ChestBlock state={state} done={done} busy={busy} onClaim={onClaim} reducedMotion={reducedMotion} />

      <View style={styles.week}>
        <View style={styles.weekDays}>
          {state.week.days.map(d => <WeekDay key={d.date} letter={weekdayLetter(d.date)} state={d.state} />)}
        </View>
        <Pressable onPress={state.week.claimable ? onClaimWeekly : undefined} disabled={busy || !state.week.claimable}
          accessibilityRole="button"
          accessibilityLabel={state.week.claimable ? 'Open your Weekly Box'
            : `Weekly Box: ${state.week.done} of ${state.week.needed} days`}
          style={[styles.weekly, state.week.claimable && styles.weeklyReady]}>
          <GameIcon name="gift" size={34} />
          <Text style={[styles.weeklyText, state.week.claimable && styles.weeklyTextReady]}>
            {state.week.claimed ? 'DONE' : state.week.claimable ? 'OPEN' : `${Math.min(state.week.done, state.week.needed)}/${state.week.needed}`}
          </Text>
        </Pressable>
      </View>
      <Text style={styles.weekHint} numberOfLines={1}>
        {state.week.claimed ? 'Weekly Box opened. New week starts Monday.'
          : `Do Daily 3 on ${state.week.needed} days for the Weekly Box`}
      </Text>

      <Pressable onPress={onClose} accessibilityRole="button" style={styles.later}>
        <Text style={styles.laterText}>BACK TO MAP</Text>
      </Pressable>
      <Text style={styles.reset}>{resetLabel(state.resets_at, now)}</Text>
    </View>
  );
}

function Flame({ days, lit, reducedMotion }: { readonly days: number; readonly lit: boolean; readonly reducedMotion: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion || !lit) { t.value = 0; return; }
    t.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(t);
  }, [lit, reducedMotion, t]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: 1 + t.value * 0.07 }, { rotate: `${(t.value - 0.5) * 6}deg` }] }));
  return (
    <View style={styles.flameWrap}>
      <Animated.View style={[style, !lit && styles.flameOff]}><GameIcon name="streak" size={58} /></Animated.View>
      {days > 0 && <View style={styles.flameNum}><Text style={styles.flameNumText}>{days}</Text></View>}
    </View>
  );
}

function goalIcon(g: DailyGoal) {
  if (g.kind === 'chest') return <Image source={CHEST} style={styles.goalImg} contentFit="contain" />;
  if (g.kind === 'catch') return g.park ? <GameIcon name="coin" size={36} /> : <Image source={SNACK} style={styles.goalImg} contentFit="contain" />;
  if (g.kind === 'play') return <GameIcon name="play" size={36} />;
  if (g.kind === 'heart') return <GameIcon name="heart" size={36} />;
  return <GameIcon name="shark" size={38} />;
}

function GoalRow({ goal, index, pop, onPress, reducedMotion }: {
  readonly goal: DailyGoal; readonly index: number; readonly pop: boolean; readonly onPress: () => void; readonly reducedMotion: boolean;
}) {
  const stamp = useSharedValue(goal.done && !pop ? 1 : 0);
  useEffect(() => {
    if (!goal.done) { stamp.value = 0; return; }
    if (!pop || reducedMotion) { stamp.value = 1; return; }
    // The check stamps in, one goal after another.
    stamp.value = withDelay(350 + index * 260, withSpring(1, { damping: 8, stiffness: 220 }));
    const timer = setTimeout(() => haptic('success'), 350 + index * 260);
    return () => clearTimeout(timer);
  }, [goal.done, pop, index, reducedMotion, stamp]);
  const checkStyle = useAnimatedStyle(() => ({ opacity: stamp.value, transform: [{ scale: 1.8 - stamp.value * 0.8 }] }));
  const actionable = !goal.done;
  const pct = Math.min(1, goal.progress / Math.max(1, goal.target));
  return (
    <Pressable onPress={actionable ? onPress : undefined} disabled={!actionable} accessibilityRole="button"
      accessibilityLabel={`${goal.title}. ${goal.done ? 'Done' : `${goal.progress} of ${goal.target}`}`}
      style={({ pressed }) => [styles.goal, goal.done && styles.goalDone, pressed && styles.goalPressed]}>
      <View style={styles.goalIcon}>{goalIcon(goal)}</View>
      <View style={styles.goalText}>
        <Text style={[styles.goalTitle, goal.done && styles.goalTitleDone]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {goal.title}
        </Text>
        {goal.done ? <Text style={styles.goalHintDone} numberOfLines={1}>Done!</Text> : goal.target > 1 ? (
          <View style={styles.bar}><View style={[styles.barFill, { width: `${pct * 100}%` }]} />
            <Text style={styles.barText}>{`${goal.progress}/${goal.target}`}</Text></View>
        ) : <Text style={styles.goalHint} numberOfLines={1}>{goal.hint}</Text>}
      </View>
      <View style={styles.goalEnd}>
        {goal.done ? (
          <Animated.View style={checkStyle}><GameIcon name="check" size={34} accessibilityLabel="Done" /></Animated.View>
        ) : <View style={styles.go}><Text style={styles.goText}>GO</Text></View>}
      </View>
    </Pressable>
  );
}

function ChestBlock({ state, done, busy, onClaim, reducedMotion }: {
  readonly state: DailyThreeState; readonly done: number; readonly busy: boolean; readonly onClaim: () => void; readonly reducedMotion: boolean;
}) {
  const bob = useSharedValue(0);
  const ready = state.claimable;
  useEffect(() => {
    if (!ready || reducedMotion) { bob.value = 0; return; }
    bob.value = withRepeat(withSequence(
      withTiming(-6, { duration: 700, easing: Easing.inOut(Easing.sin) }),
      withTiming(0, { duration: 700, easing: Easing.inOut(Easing.sin) }),
    ), -1);
    return () => cancelAnimation(bob);
  }, [ready, reducedMotion, bob]);
  const chestStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }, { rotate: `${bob.value * 0.6}deg` }] }));
  const r = state.reward;
  return (
    <View style={[styles.chestBlock, ready && styles.chestBlockReady]}>
      <Animated.View style={[styles.chestArt, chestStyle, !ready && !state.claimed && styles.chestLocked]}>
        <Image source={CHEST} style={{ width: 74, height: 74 }} contentFit="contain" />
      </Animated.View>
      <View style={styles.chestRight}>
        {state.claimed && !ready ? (
          <Text style={styles.chestTitle}>Chest opened!</Text>
        ) : ready ? (
          <Pressable onPress={onClaim} disabled={busy} accessibilityRole="button" accessibilityLabel="Open your Daily 3 chest"
            style={({ pressed }) => [styles.open, pressed && styles.openPressed]}>
            <Text style={styles.openText}>{busy ? '...' : 'OPEN!'}</Text>
          </Pressable>
        ) : (
          <Text style={styles.chestTitle}>{`${done} of 3 done`}</Text>
        )}
        <View style={styles.chips}>
          <Chip icon="coins" n={r.coins} /><Chip icon="ticket" n={r.tickets} /><Chip icon="energy" n={r.energy} /><Chip icon="xp" n={r.xp} />
        </View>
      </View>
    </View>
  );
}

function Chip({ icon, n }: { readonly icon: 'coins' | 'ticket' | 'energy' | 'xp'; readonly n: number }) {
  if (n <= 0) return null;
  return (
    <View style={styles.chip}>
      <GameIcon name={icon} size={18} />
      <Text style={styles.chipText}>{n}</Text>
    </View>
  );
}

function WeekDay({ letter, state }: { readonly letter: string; readonly state: WeekDayState }) {
  return (
    <View style={styles.day}>
      <View style={[styles.dayDot, state === 'done' && styles.dayDone, state === 'today' && styles.dayToday,
        state === 'freeze' && styles.dayFreeze, (state === 'future' || state === 'before') && styles.dayFuture]}>
        {state === 'done' && <GameIcon name="streak" size={18} />}
        {state === 'freeze' && <Image source={FREEZE} style={{ width: 18, height: 18 }} contentFit="contain" />}
      </View>
      <Text style={[styles.dayLetter, state === 'today' && styles.dayLetterToday]}>{letter}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '94%', marginTop: -14, backgroundColor: BRAND.blue, borderRadius: 24, borderWidth: 4, borderColor: BRAND.white,
    paddingTop: 20, paddingBottom: 12, paddingHorizontal: 12, alignItems: 'stretch' },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  flameWrap: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  flameOff: { opacity: 0.45 },
  flameNum: { position: 'absolute', bottom: -2, right: -2, minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 5,
    backgroundColor: BRAND.white, borderWidth: 2, borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center' },
  flameNumText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.navy, marginTop: 1 },
  streakText: { flex: 1 },
  streakBig: { fontFamily: 'Shark', fontSize: 20, color: BRAND.gold },
  streakSub: { fontFamily: 'Knockout', fontSize: 14, color: '#e4f7ff' },
  freezes: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 14,
    paddingHorizontal: 6, paddingVertical: 4, minHeight: 44 },
  freezeIcon: { width: 28, height: 28 },
  freezeEmpty: { opacity: 0.3 },
  plus: { width: 18, height: 18, borderRadius: 9, backgroundColor: BRAND.gold, alignItems: 'center', justifyContent: 'center', marginLeft: 1 },
  plusText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.navy, marginTop: -1 },
  goals: { gap: 6 },
  goal: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BRAND.white, borderRadius: 16, padding: 6,
    borderBottomWidth: 4, borderBottomColor: '#a9cdea', minHeight: 60 },
  goalDone: { backgroundColor: '#e8f8ec', borderBottomColor: '#9ad4a8' },
  goalPressed: { transform: [{ translateY: 2 }], borderBottomWidth: 2 },
  goalIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: BRAND.sky, alignItems: 'center', justifyContent: 'center' },
  goalImg: { width: 38, height: 38 },
  goalText: { flex: 1 },
  goalTitle: { fontFamily: 'Shark', fontSize: 17, color: BRAND.navy },
  goalTitleDone: { color: '#2c7a43' },
  goalHint: { fontFamily: 'Knockout', fontSize: 14, color: BRAND.navySoft },
  goalHintDone: { fontFamily: 'Knockout', fontSize: 14, color: '#2c7a43' },
  bar: { height: 16, borderRadius: 8, backgroundColor: BRAND.sky, overflow: 'hidden', justifyContent: 'center', marginTop: 2, marginRight: 4 },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: BRAND.gold, borderRadius: 8 },
  barText: { fontFamily: 'Shark', fontSize: 11, color: BRAND.navy, textAlign: 'center' },
  goalEnd: { width: 46, alignItems: 'center' },
  go: { backgroundColor: BRAND.gold, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: 3,
    borderBottomColor: BRAND.goldLip },
  goText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.navy },
  chestBlock: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 16, padding: 6, borderWidth: 2, borderColor: 'transparent' },
  chestBlockReady: { borderColor: BRAND.gold, backgroundColor: 'rgba(255, 226, 92, 0.22)' },
  chestArt: { width: 78, alignItems: 'center' },
  chestLocked: { opacity: 0.75 },
  chestRight: { flex: 1, gap: 6 },
  chestTitle: { fontFamily: 'Shark', fontSize: 18, color: BRAND.white },
  open: { backgroundColor: BRAND.gold, borderRadius: 14, paddingVertical: 8, alignItems: 'center', borderBottomWidth: 4,
    borderBottomColor: BRAND.goldLip },
  openPressed: { transform: [{ translateY: 2 }], borderBottomWidth: 2 },
  openText: { fontFamily: 'Shark', fontSize: 20, color: '#075083' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: BRAND.navy, borderRadius: 10, paddingHorizontal: 6,
    paddingVertical: 2 },
  chipText: { fontFamily: 'Shark', fontSize: 13, color: BRAND.white, marginTop: 1 },
  week: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6 },
  weekDays: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  day: { alignItems: 'center', gap: 2 },
  dayDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center',
    justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  dayDone: { backgroundColor: BRAND.white },
  dayToday: { borderColor: BRAND.gold, borderStyle: 'dashed' },
  dayFreeze: { backgroundColor: '#d9f1ff' },
  dayFuture: { opacity: 0.55 },
  dayLetter: { fontFamily: 'Knockout', fontSize: 12, color: '#cdeaff' },
  dayLetterToday: { color: BRAND.gold },
  weekly: { width: 62, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 14, paddingVertical: 4 },
  weeklyReady: { backgroundColor: BRAND.gold },
  weeklyText: { fontFamily: 'Shark', fontSize: 13, color: BRAND.white },
  weeklyTextReady: { color: BRAND.navy },
  weekHint: { fontFamily: 'Knockout', fontSize: 13, color: '#cdeaff', marginTop: 4, textAlign: 'center' },
  later: { minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: 10, borderRadius: 12, borderWidth: 2,
    borderColor: '#8fcdff', backgroundColor: '#075395' },
  laterText: { fontFamily: 'Knockout', fontSize: 17, color: BRAND.white },
  reset: { fontFamily: 'Knockout', fontSize: 12, color: '#a9d6f7', textAlign: 'center', marginTop: 6 },
});
