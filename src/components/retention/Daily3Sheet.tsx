import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import type { DailyGoal, DailyThreeState, WeekDayState } from '../../api/endpoints/retention';
import { haptic } from '../../gamekit/Haptics';
import {
  doneCount, goalAction, milestoneLine, resetLabel, showsBar, streakSubline, tomorrowLine, weekdayLetter, weeklyLine,
} from '../../services/retention/logic';
import { BRAND, GameIcon, ICON_SOURCES } from '../../ui';
import { useAmbient } from './power';

const DAILY_CHEST = require('../../../assets/images/daily/chest-closed.png');
const SNACK = require('../../../assets/images/social/topic_snacks.png');
const FREEZE = require('../../../assets/images/retention/freeze.png');
const WEEKLY = require('../../../assets/images/retention/weekly-box-closed.png');
/** The Daily 3 prize is the treasure chest, never the blue daily chest that goal 1 opens. */
const PRIZE_CHEST = ICON_SOURCES.chest;

export type GoalTap = 'chest' | 'closet' | 'friends' | 'snack' | 'ride';

/**
 * The Daily 3 card: the streak hero on top (flame, number, freezes, next
 * prize), three goals you read at a glance with a GO that takes you there,
 * the Daily 3 chest, then the week of flames toward the Weekly Box.
 * Every number on it comes from the server.
 */
export default function Daily3Sheet({ state, now, onClaim, onClaimWeekly, onBuyFreeze, onGoal, onClose, onReminders, busy, coins,
  celebrate, reducedMotion, coach, onCoachDone }: {
  readonly state: DailyThreeState;
  readonly now: number;
  readonly onClaim: () => void;
  readonly onClaimWeekly: () => void;
  readonly onBuyFreeze: () => void;
  readonly onGoal: (tap: GoalTap) => void;
  readonly onClose: () => void;
  readonly onReminders: (on: boolean) => void;
  readonly busy: boolean;
  readonly coins: number;
  /** Goal keys that just turned done: they stamp in when the card opens. */
  readonly celebrate: readonly string[];
  readonly reducedMotion: boolean;
  /** First open: a three-line "how it works" card over the sheet. */
  readonly coach: boolean;
  readonly onCoachDone: () => void;
}) {
  const done = doneCount(state.goals);
  const s = state.streak;
  // An empty freeze slot shows "+" only when a freeze fits and the coins are there (one tap, coins only).
  const canBuyFreeze = s.freezes < s.freeze_cap && coins >= s.freeze_price;
  const tease = milestoneLine(state);
  const reminders = state.reminders !== false;
  return (
    <View style={styles.card}>
      <View style={styles.hero}>
        <Flame days={s.days} reducedMotion={reducedMotion} />
        <View style={styles.heroText}>
          <Text style={styles.streakBig} numberOfLines={1} adjustsFontSizeToFit>{s.days > 0 ? `${s.days} DAY STREAK` : 'START A STREAK'}</Text>
          <Text style={styles.streakSub} numberOfLines={2}>{streakSubline(state)}</Text>
          {tease && (
            <View style={styles.tease}>
              <GameIcon name="gift" size={18} />
              <Text style={styles.teaseText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{tease}</Text>
            </View>
          )}
        </View>
        <View style={styles.freezes} accessible accessibilityLabel={`${s.freezes} of ${s.freeze_cap} streak freezes`}>
          {Array.from({ length: s.freeze_cap }, (_, i) => i < s.freezes ? (
            <Image key={i} source={FREEZE} style={styles.freezeIcon} contentFit="contain" />
          ) : (
            <Pressable key={i} onPress={canBuyFreeze ? onBuyFreeze : undefined} disabled={busy || !canBuyFreeze} hitSlop={4}
              accessibilityRole="button" accessibilityLabel={canBuyFreeze ? `Get a streak freeze for ${s.freeze_price} coins` : 'Empty freeze slot'}
              style={[styles.freezeSlot, canBuyFreeze && styles.freezeSlotBuy]}>
              {canBuyFreeze && <Text style={styles.freezePlus}>+</Text>}
            </Pressable>
          ))}
        </View>
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
          <View style={styles.track} />
          {state.week.days.map(d => <WeekDay key={d.date} letter={weekdayLetter(d.date)} state={d.state} reducedMotion={reducedMotion} />)}
        </View>
        <Pressable onPress={state.week.claimable ? onClaimWeekly : undefined} disabled={busy || !state.week.claimable}
          accessibilityRole="button"
          accessibilityLabel={state.week.claimable ? 'Open your Weekly Box'
            : `Weekly Box: ${state.week.done} of ${state.week.needed} flames`}
          style={[styles.weekly, state.week.claimable && !state.claimable && styles.weeklyReady,
            state.week.claimable && state.claimable && styles.weeklyWaiting]}>
          <Image source={WEEKLY} style={styles.weeklyArt} contentFit="contain" />
          <Text style={[styles.weeklyText, state.week.claimable && !state.claimable && styles.weeklyTextReady]}>
            {state.week.claimed ? 'DONE' : state.week.claimable ? 'OPEN' : 'GIFT'}
          </Text>
        </Pressable>
      </View>
      <Text style={styles.weekHint} numberOfLines={1}>{weeklyLine(state)}</Text>

      <Pressable onPress={onClose} accessibilityRole="button" style={styles.later}>
        <Text style={styles.laterText}>BACK TO MAP</Text>
      </Pressable>
      <View style={styles.footer}>
        <Text style={styles.reset}>{resetLabel(state.resets_at, now)}</Text>
        <Pressable onPress={() => onReminders(!reminders)} accessibilityRole="switch" accessibilityState={{ checked: reminders }}
          accessibilityLabel="Daily reminders" hitSlop={8} style={styles.bell}>
          <View style={!reminders && styles.bellOff}><GameIcon name="bell" size={20} /></View>
          <Text style={styles.reset}>{reminders ? 'Reminders on' : 'Reminders off'}</Text>
        </Pressable>
      </View>
      {coach && <Coach onDone={onCoachDone} />}
    </View>
  );
}

/** First open only: how Daily 3 works, in three short lines with the real art. */
function Coach({ onDone }: { readonly onDone: () => void }) {
  return (
    <View style={styles.coachScrim}>
      <View style={styles.coachCard}>
        <Text style={styles.coachTitle}>HOW DAILY 3 WORKS</Text>
        <CoachLine icon={<GameIcon name="streak" size={34} />} text="Do all 3 every day to grow your flame." />
        <CoachLine icon={<Image source={FREEZE} style={{ width: 34, height: 34 }} contentFit="contain" />} text="Ice saves your flame if you miss a day." />
        <CoachLine icon={<Image source={WEEKLY} style={{ width: 34, height: 34 }} contentFit="contain" />} text="Flames this week open the gift." />
        <Pressable onPress={onDone} accessibilityRole="button" style={({ pressed }) => [styles.open, pressed && styles.openPressed, { marginTop: 6 }]}>
          <Text style={styles.openText}>GOT IT</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CoachLine({ icon, text }: { readonly icon: React.ReactNode; readonly text: string }) {
  return (
    <View style={styles.coachLine}>
      <View style={styles.coachIcon}>{icon}</View>
      <Text style={styles.coachText}>{text}</Text>
    </View>
  );
}

function Flame({ days, reducedMotion }: { readonly days: number; readonly reducedMotion: boolean }) {
  const t = useSharedValue(0);
  const lit = days > 0;
  const ambient = useAmbient();
  useEffect(() => {
    if (reducedMotion || !lit || !ambient) { t.value = 0; return; }
    t.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(t);
  }, [lit, reducedMotion, ambient, t]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: 1 + t.value * 0.07 }, { rotate: `${(t.value - 0.5) * 6}deg` }] }));
  return (
    <View style={styles.flameWrap}>
      <View style={styles.flameHalo} />
      <Animated.View style={style}><GameIcon name="streak" size={66} /></Animated.View>
      <View style={styles.flameNum}><Text style={styles.flameNumText}>{days}</Text></View>
    </View>
  );
}

function goalIcon(g: DailyGoal) {
  if (g.kind === 'chest') return <Image source={DAILY_CHEST} style={styles.goalImg} contentFit="contain" />;
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
  const actionable = !goal.done && goalAction(goal) !== null;
  const pct = Math.min(1, goal.progress / Math.max(1, goal.target));
  return (
    <Pressable onPress={actionable ? onPress : undefined} disabled={!actionable} accessibilityRole="button"
      accessibilityLabel={`${goal.title}. ${goal.done ? 'Done' : goal.hint}`}
      style={({ pressed }) => [styles.goal, goal.done && styles.goalDone, pressed && styles.goalPressed]}>
      <View style={styles.goalIcon}>{goalIcon(goal)}</View>
      <View style={styles.goalText}>
        <Text style={[styles.goalTitle, goal.done && styles.goalTitleDone]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {goal.title}
        </Text>
        {goal.done ? <Text style={styles.goalHintDone} numberOfLines={1}>Done!</Text> : showsBar(goal) ? (
          <View style={styles.bar}><View style={[styles.barFill, { width: `${pct * 100}%` }]} />
            <Text style={styles.barText}>{`${goal.progress}/${goal.target}`}</Text></View>
        ) : <Text style={styles.goalHint} numberOfLines={1}>{goal.hint}</Text>}
      </View>
      <View style={styles.goalEnd}>
        {goal.done ? (
          <Animated.View style={checkStyle}><GameIcon name="check" size={34} accessibilityLabel="Done" /></Animated.View>
        ) : actionable ? <View style={styles.go}><Text style={styles.goText}>GO</Text></View> : null}
      </View>
    </Pressable>
  );
}

function ChestBlock({ state, done, busy, onClaim, reducedMotion }: {
  readonly state: DailyThreeState; readonly done: number; readonly busy: boolean; readonly onClaim: () => void; readonly reducedMotion: boolean;
}) {
  const bob = useSharedValue(0);
  const ready = state.claimable;
  const ambient = useAmbient();
  useEffect(() => {
    if (!ready || reducedMotion || !ambient) { bob.value = 0; return; }
    bob.value = withRepeat(withSequence(
      withTiming(-6, { duration: 700, easing: Easing.inOut(Easing.sin) }),
      withTiming(0, { duration: 700, easing: Easing.inOut(Easing.sin) }),
    ), -1);
    return () => cancelAnimation(bob);
  }, [ready, reducedMotion, ambient, bob]);
  const chestStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }, { rotate: `${bob.value * 0.6}deg` }] }));
  const r = state.reward;
  const opened = state.claimed && !ready;
  const prize = state.claimable_milestone;
  return (
    <View style={[styles.chestBlock, ready && styles.chestBlockReady]}>
      <Animated.View style={[styles.chestArt, chestStyle]}>
        <Image source={opened ? ICON_SOURCES.chestOpen : PRIZE_CHEST} style={{ width: 72, height: 72 }} contentFit="contain" />
        {!ready && !opened && <View style={styles.lock}><GameIcon name="lock" size={20} /></View>}
      </Animated.View>
      <View style={styles.chestRight}>
        <Text style={styles.chestKicker}>DAILY 3 CHEST</Text>
        {opened ? (
          <Text style={styles.chestTitle} numberOfLines={2}>{tomorrowLine(state)}</Text>
        ) : ready ? (
          <Pressable onPress={onClaim} disabled={busy} accessibilityRole="button" accessibilityLabel="Open your Daily 3 chest"
            style={({ pressed }) => [styles.open, pressed && styles.openPressed]}>
            <Text style={styles.openText}>{busy ? '...' : 'OPEN!'}</Text>
          </Pressable>
        ) : (
          <Text style={styles.chestTitle}>{`${done} of 3 done`}</Text>
        )}
        {!opened && (
          <View style={styles.chips}>
            <Chip icon="coins" n={r.coins} /><Chip icon="ticket" n={r.tickets} /><Chip icon="energy" n={r.energy} /><Chip icon="xp" n={r.xp} />
            {prize?.gear && <View style={[styles.chip, styles.chipGold]}><GameIcon name="gift" size={18} /><Text style={styles.chipGoldText}>GEAR</Text></View>}
          </View>
        )}
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

function WeekDay({ letter, state, reducedMotion }: { readonly letter: string; readonly state: WeekDayState; readonly reducedMotion: boolean }) {
  const pulse = useSharedValue(0);
  const ambient = useAmbient();
  useEffect(() => {
    if (state !== 'today' || reducedMotion || !ambient) return;
    pulse.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [state, reducedMotion, ambient, pulse]);
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pulse.value * 0.08 }] }));
  return (
    <View style={styles.day}>
      <Animated.View style={[styles.dayDot, state === 'done' && styles.dayDone, state === 'today' && styles.dayToday,
        state === 'freeze' && styles.dayFreeze, state === 'missed' && styles.dayMissed, state === 'before' && styles.dayBefore,
        state === 'today' && ringStyle]}>
        {state === 'done' && <GameIcon name="streak" size={20} />}
        {state === 'freeze' && <Image source={FREEZE} style={{ width: 24, height: 24 }} contentFit="contain" />}
      </Animated.View>
      <Text style={[styles.dayLetter, state === 'today' && styles.dayLetterToday]}>{letter}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '94%', marginTop: -14, backgroundColor: BRAND.blue, borderRadius: 24, borderWidth: 4, borderColor: BRAND.white,
    paddingTop: 20, paddingBottom: 10, paddingHorizontal: 12, alignItems: 'stretch', overflow: 'hidden' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18, padding: 8 },
  flameWrap: { width: 78, height: 78, alignItems: 'center', justifyContent: 'center' },
  flameHalo: { position: 'absolute', width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255, 226, 92, 0.28)' },
  flameNum: { position: 'absolute', bottom: -2, right: -2, minWidth: 30, height: 30, borderRadius: 15, paddingHorizontal: 6,
    backgroundColor: BRAND.white, borderWidth: 2.5, borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center' },
  flameNumText: { fontFamily: 'Shark', fontSize: 16, color: BRAND.navy, marginTop: 1 },
  heroText: { flex: 1, gap: 1 },
  streakBig: { fontFamily: 'Shark', fontSize: 23, color: BRAND.gold },
  streakSub: { fontFamily: 'Knockout', fontSize: 15, color: '#e4f7ff' },
  tease: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', maxWidth: '100%', backgroundColor: BRAND.navy, borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 2, marginTop: 2 },
  teaseText: { fontFamily: 'Shark', fontSize: 12, color: BRAND.gold, marginTop: 1 },
  freezes: { gap: 4, alignItems: 'center' },
  freezeIcon: { width: 36, height: 36 },
  freezeSlot: { width: 36, height: 36, borderRadius: 10, borderWidth: 2.5, borderStyle: 'dashed', borderColor: '#9fd2f5',
    alignItems: 'center', justifyContent: 'center' },
  freezeSlotBuy: { borderColor: BRAND.gold, backgroundColor: 'rgba(255, 207, 59, 0.15)' },
  freezePlus: { fontFamily: 'Shark', fontSize: 22, color: BRAND.gold, marginTop: -2 },
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
  lock: { position: 'absolute', bottom: 0, right: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: BRAND.white,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: BRAND.navy },
  chestRight: { flex: 1, gap: 4 },
  chestKicker: { fontFamily: 'Shark', fontSize: 12, color: '#bfe5ff' },
  chestTitle: { fontFamily: 'Shark', fontSize: 17, color: BRAND.white },
  open: { backgroundColor: BRAND.gold, borderRadius: 14, paddingVertical: 8, alignItems: 'center', borderBottomWidth: 4,
    borderBottomColor: BRAND.goldLip },
  openPressed: { transform: [{ translateY: 2 }], borderBottomWidth: 2 },
  openText: { fontFamily: 'Shark', fontSize: 20, color: '#075083' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: BRAND.navy, borderRadius: 10, paddingHorizontal: 6,
    paddingVertical: 2 },
  chipText: { fontFamily: 'Shark', fontSize: 13, color: BRAND.white, marginTop: 1 },
  chipGold: { backgroundColor: BRAND.gold },
  chipGoldText: { fontFamily: 'Shark', fontSize: 12, color: BRAND.navy, marginTop: 1 },
  week: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6 },
  weekDays: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  track: { position: 'absolute', left: 15, right: 15, top: 15, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' },
  day: { alignItems: 'center', gap: 2 },
  dayDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: BRAND.blue, alignItems: 'center',
    justifyContent: 'center', borderWidth: 2.5, borderColor: '#9fd2f5' },
  dayDone: { backgroundColor: BRAND.white, borderColor: BRAND.white },
  dayToday: { borderColor: BRAND.gold, borderWidth: 3 },
  dayFreeze: { backgroundColor: '#d9f1ff', borderColor: '#d9f1ff' },
  dayMissed: { backgroundColor: '#3f6f9c', borderColor: '#6d8fb0' },
  dayBefore: { borderColor: 'rgba(159, 210, 245, 0.35)' },
  dayLetter: { fontFamily: 'Knockout', fontSize: 12, color: '#cdeaff' },
  dayLetterToday: { color: BRAND.gold },
  weekly: { width: 64, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 14, paddingVertical: 4 },
  weeklyReady: { backgroundColor: BRAND.gold },
  weeklyWaiting: { borderWidth: 2, borderColor: BRAND.gold },
  weeklyArt: { width: 38, height: 38 },
  weeklyText: { fontFamily: 'Shark', fontSize: 13, color: BRAND.white },
  weeklyTextReady: { color: BRAND.navy },
  weekHint: { fontFamily: 'Knockout', fontSize: 14, color: '#cdeaff', marginTop: 4, textAlign: 'center' },
  later: { minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: 10, borderRadius: 12, borderWidth: 2,
    borderColor: '#8fcdff', backgroundColor: '#075395' },
  laterText: { fontFamily: 'Knockout', fontSize: 17, color: BRAND.white },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 4 },
  reset: { fontFamily: 'Knockout', fontSize: 13, color: '#a9d6f7' },
  bell: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 4 },
  bellOff: { opacity: 0.45 },
  coachScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5, 52, 110, 0.82)', justifyContent: 'center', padding: 14 },
  coachCard: { backgroundColor: BRAND.white, borderRadius: 20, padding: 14, gap: 8, borderWidth: 3, borderColor: BRAND.gold },
  coachTitle: { fontFamily: 'Shark', fontSize: 20, color: BRAND.navy, textAlign: 'center' },
  coachLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coachIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: BRAND.sky, alignItems: 'center', justifyContent: 'center' },
  coachText: { flex: 1, fontFamily: 'Shark', fontSize: 16, color: BRAND.navy },
});
