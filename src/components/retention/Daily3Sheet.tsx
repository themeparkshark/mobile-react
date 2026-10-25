import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, LinearTransition, type SharedValue, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import type { DailyGoal, DailyThreeState, WeekDayState } from '../../api/endpoints/retention';
import { haptic, queueHaptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import { FULL_SET, LOOP_CUES } from '../../services/retention/loopMotion';
import { DURATION, SPRING } from '../../ui/motion';
import { EASE } from '../../ui/motionEasing';
import FlameArt from './FlameArt';
import GoldCheckCoin from './GoldCheckCoin';
import { FreezeSlots } from './FreezeMoments';
import {
  doneCount, goalAction, milestoneLine, resetLabel, showsBar, streakSubline, tomorrowLine, weekdayLetter, weeklyLine,
} from '../../services/retention/logic';
import { BRAND, GameIcon, ICON_SOURCES } from '../../ui';
import { useAmbient } from './power';
import CardSurface from './CardSurface';

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
  celebrate, celebrateAll = false, onAutoClaim, reducedMotion, coach, onCoachDone, freezeArrive = 0 }: {
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
  /** The third goal just landed: the checks bounce in a row, then the chest opens by itself. */
  readonly celebrateAll?: boolean;
  /** Called at the chest beat of the full-set celebration. */
  readonly onAutoClaim?: () => void;
  readonly reducedMotion: boolean;
  /** First open: a three-line "how it works" card over the sheet. */
  readonly coach: boolean;
  readonly onCoachDone: () => void;
  /** Freezes that just arrived (from the Weekly Box): they fly into their slots. */
  readonly freezeArrive?: number;
}) {
  const done = doneCount(state.goals);
  const s = state.streak;
  // An empty freeze slot shows "+" only when a freeze fits and the coins are there (one tap, coins only).
  const canBuyFreeze = s.freezes < s.freeze_cap && coins >= s.freeze_price;
  const tease = milestoneLine(state);
  const reminders = state.reminders !== false;
  // Done goals glide down to the done group once their checks have stamped (fresh ones start where they were).
  const sorted = useMemo(() => [...state.goals.filter(g => !g.done), ...state.goals.filter(g => g.done)], [state.goals]);
  const before = useMemo(() => [...state.goals.filter(g => !g.done || celebrate.includes(g.key)),
    ...state.goals.filter(g => g.done && !celebrate.includes(g.key))], [state.goals, celebrate]);
  const [settled, setSettled] = useState(celebrate.length === 0 || reducedMotion);
  useEffect(() => {
    if (settled) return;
    const t = setTimeout(() => setSettled(true), celebrateAll ? FULL_SET.chestAt - 200 : 350 + celebrate.length * 260 + 420);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // The full set: three checks bounce 120 ms apart on a rising tick, then the chest opens by itself.
  useEffect(() => {
    if (!celebrateAll) return;
    const timers = FULL_SET.tickSteps.map((step, i) => setTimeout(() => {
      queueHaptic('tickSelection');
      playSfx(LOOP_CUES.checkBounce.fallback, 0.5 + step / 16);
    }, reducedMotion ? 0 : FULL_SET.checksAt + i * FULL_SET.checkStep));
    timers.push(setTimeout(() => onAutoClaim?.(), reducedMotion ? 500 : FULL_SET.chestAt));
    return () => timers.forEach(clearTimeout);
  }, [celebrateAll]); // eslint-disable-line react-hooks/exhaustive-deps
  const order = settled ? sorted : before;
  return (
    <View style={styles.card}>
      <CardSurface />
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
        <View accessible accessibilityLabel={`${s.freezes} of ${s.freeze_cap} streak freezes`}>
          <FreezeSlots freezes={s.freezes} cap={s.freeze_cap} arrive={Math.min(freezeArrive, s.freezes)} from={{ x: -120, y: 260 }}
            reducedMotion={reducedMotion} emptyPressable={canBuyFreeze && !busy} onEmptyPress={onBuyFreeze} />
        </View>
      </View>

      <View style={styles.goals}>
        {order.map((g, i) => (
          <Animated.View key={g.key} layout={reducedMotion ? undefined : LinearTransition.springify().damping(SPRING.settle.damping)
            .stiffness(SPRING.settle.stiffness)}>
            <GoalRow goal={g} index={i} pop={celebrate.includes(g.key)} reducedMotion={reducedMotion}
              bounceAt={celebrateAll ? FULL_SET.checksAt + state.goals.findIndex(x => x.key === g.key) * FULL_SET.checkStep : null}
              onPress={() => { const a = goalAction(g); if (a) onGoal(a); }} />
          </Animated.View>
        ))}
      </View>

      <ChestBlock state={state} done={done} busy={busy} onClaim={onClaim} reducedMotion={reducedMotion} charging={celebrateAll} />

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
          <Image cachePolicy="memory-disk" source={WEEKLY} style={styles.weeklyArt} contentFit="contain" />
          <Text style={[styles.weeklyText, state.week.claimable && !state.claimable && styles.weeklyTextReady]}>
            {state.week.claimed ? 'DONE' : state.week.claimable ? (state.claimable ? 'NEXT' : 'OPEN') : 'GIFT'}
          </Text>
        </Pressable>
      </View>
      <Text style={styles.weekHint} numberOfLines={1}>{weeklyLine(state)}</Text>

      <Pressable onPress={onClose} disabled={celebrateAll} accessibilityRole="button" style={[styles.later, celebrateAll && { opacity: 0.4 }]}>
        <Text style={styles.laterText}>BACK TO MAP</Text>
      </Pressable>
      <View style={styles.footer}>
        <Text style={styles.reset}>{resetLabel(state.resets_at, now)}</Text>
        <Pressable onPress={() => onReminders(!reminders)} accessibilityRole="switch" accessibilityState={{ checked: reminders }}
          accessibilityLabel="Daily reminders" hitSlop={8} style={styles.bell}>
          <View style={!reminders && styles.bellOff}><GameIcon name="bell" size={26} /></View>
          <Text style={styles.bellText}>{reminders ? 'Reminders on' : 'Reminders off'}</Text>
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
        <CoachLine icon={<Image cachePolicy="memory-disk" source={FREEZE} style={{ width: 34, height: 34 }} contentFit="contain" />} text="Ice saves your flame if you miss a day." />
        <CoachLine icon={<Image cachePolicy="memory-disk" source={WEEKLY} style={{ width: 34, height: 34 }} contentFit="contain" />} text="Flames this week open the gift." />
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
  return (
    <View style={styles.flameWrap}>
      <FlameArt days={days} size={84} reducedMotion={reducedMotion} />
      <View style={styles.flameNum}><Text style={styles.flameNumText}>{days}</Text></View>
    </View>
  );
}

function goalIcon(g: DailyGoal) {
  if (g.kind === 'chest') return <Image cachePolicy="memory-disk" source={DAILY_CHEST} style={styles.goalImg} contentFit="contain" />;
  if (g.kind === 'catch') return g.park ? <GameIcon name="coin" size={36} /> : <Image cachePolicy="memory-disk" source={SNACK} style={styles.goalImg} contentFit="contain" />;
  if (g.kind === 'play') return <GameIcon name="play" size={36} />;
  if (g.kind === 'heart') return <GameIcon name="heart" size={36} />;
  return <GameIcon name="shark" size={38} />;
}

function GoalRow({ goal, index, pop, onPress, reducedMotion, bounceAt }: {
  readonly goal: DailyGoal; readonly index: number; readonly pop: boolean; readonly onPress: () => void; readonly reducedMotion: boolean;
  /** Full set: this row's check bounces at this many ms after the sheet opens. */
  readonly bounceAt?: number | null;
}) {
  const fresh = goal.done && pop && !reducedMotion;
  const stamp = useSharedValue(goal.done && !fresh ? 1 : 0);
  const draw = useSharedValue(goal.done && !fresh ? 1 : 0);
  const bounce = useSharedValue(1);
  useEffect(() => {
    if (!goal.done) { stamp.value = 0; draw.value = 0; return; }
    if (!fresh) { stamp.value = 1; draw.value = 1; return; }
    // The gold check stamps in from oversize (one goal after another) and draws itself; the title stays readable
    // (no strike-through, which a 7-year-old can read as "cancelled").
    const at = 350 + index * 260;
    stamp.value = withDelay(at, withSpring(1, SPRING.stamp));
    draw.value = withDelay(at + 60, withTiming(1, { duration: DURATION.base, easing: EASE.out }));
    const timer = setTimeout(() => queueHaptic('hitMedium'), at);
    return () => clearTimeout(timer);
  }, [goal.done, fresh, index, stamp, draw]);
  useEffect(() => {
    if (bounceAt == null || reducedMotion || !goal.done) return;
    bounce.value = withDelay(bounceAt, withSequence(withTiming(1.35, { duration: 110, easing: EASE.out }), withSpring(1, SPRING.pop)));
  }, [bounceAt, reducedMotion, goal.done, bounce]);
  const checkStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, stamp.value * 1.6),
    transform: [{ scale: (1.7 - stamp.value * 0.7) * bounce.value }, { rotate: `${(1 - stamp.value) * -14}deg` }] }));
  const actionable = !goal.done && goalAction(goal) !== null;
  const pct = Math.min(1, goal.progress / Math.max(1, goal.target));
  return (
    <Pressable onPress={actionable ? onPress : undefined} disabled={!actionable} accessibilityRole="button"
      accessibilityLabel={`${goal.title}. ${goal.done ? 'Done' : goal.hint}`}
      style={({ pressed }) => [styles.goal, goal.done && styles.goalDone, pressed && styles.goalPressed]}>
      <View style={[styles.goalIcon, goal.done && styles.goalIconDone]}>{goalIcon(goal)}</View>
      <View style={styles.goalText}>
        <View style={styles.titleBox}>
          <Text style={[styles.goalTitle, goal.done && styles.goalTitleDone]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {goal.title}
          </Text>
        </View>
        {goal.done ? <View style={styles.donePill}><Text style={styles.goalHintDone} numberOfLines={1}>Done!</Text></View> : showsBar(goal) ? (
          <View style={styles.bar}><View style={[styles.barFill, { width: `${pct * 100}%` }]} />
            <Text style={styles.barText}>{`${goal.progress}/${goal.target}`}</Text></View>
        ) : <Text style={styles.goalHint} numberOfLines={1}>{goal.hint}</Text>}
      </View>
      <View style={styles.goalEnd}>
        {goal.done ? (
          <Animated.View style={[styles.doneCheck, checkStyle]} accessibilityLabel="Done">
            <GoldCheck draw={draw} />
          </Animated.View>
        ) : actionable ? <View style={styles.go}><Text style={styles.goText}>GO</Text></View> : null}
      </View>
    </Pressable>
  );
}

/** The gold done check (the same mark that stamps on the map button). */
function GoldCheck({ draw }: { readonly draw: SharedValue<number> }) {
  return <GoldCheckCoin size={36} draw={draw} />;
}

function ChestBlock({ state, done, busy, onClaim, reducedMotion, charging = false }: {
  readonly state: DailyThreeState; readonly done: number; readonly busy: boolean; readonly onClaim: () => void; readonly reducedMotion: boolean;
  /** Full set: the chest starts rattling before it opens itself. */
  readonly charging?: boolean;
}) {
  const bob = useSharedValue(0);
  const ready = state.claimable;
  const ambient = useAmbient();
  useEffect(() => {
    if (charging && !reducedMotion) {
      // A rising rattle from the ribbon beat to the hand-off (anticipation).
      bob.value = withDelay(FULL_SET.ribbonAt - 100, withRepeat(withSequence(withTiming(-4, { duration: 50 }), withTiming(4, { duration: 50 })), 6, true));
      return () => cancelAnimation(bob);
    }
    if (!ready || reducedMotion || !ambient) { bob.value = 0; return; }
    bob.value = withRepeat(withSequence(
      withTiming(-6, { duration: 700, easing: Easing.inOut(Easing.sin) }),
      withTiming(0, { duration: 700, easing: Easing.inOut(Easing.sin) }),
    ), -1);
    return () => cancelAnimation(bob);
  }, [ready, reducedMotion, ambient, bob, charging]);
  const chestStyle = useAnimatedStyle(() => ({ transform: [{ translateY: charging ? 0 : bob.value }, { rotate: `${bob.value * (charging ? 2.2 : 0.6)}deg` }] }));
  const r = state.reward;
  const opened = state.claimed && !ready;
  const prize = state.claimable_milestone;
  return (
    <View style={[styles.chestBlock, ready && styles.chestBlockReady]}>
      <Animated.View style={[styles.chestArt, chestStyle]}>
        <Image cachePolicy="memory-disk" source={opened ? ICON_SOURCES.chestOpen : PRIZE_CHEST} style={{ width: 72, height: 72 }} contentFit="contain" />
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
        {state === 'freeze' && <Image cachePolicy="memory-disk" source={FREEZE} style={{ width: 24, height: 24 }} contentFit="contain" />}
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
  flameWrap: { width: 84, height: 84, alignItems: 'center', justifyContent: 'center' },
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
  // Done is gold and white (never green): the row turns warm cream with a gold lip.
  goalDone: { backgroundColor: '#fff7d8', borderBottomColor: '#e9c55a' },
  goalIconDone: { backgroundColor: '#ffe9a6' },
  titleBox: { alignSelf: 'flex-start', maxWidth: '100%', justifyContent: 'center' },
  doneCheck: { alignItems: 'center', justifyContent: 'center' },
  goalPressed: { transform: [{ translateY: 2 }], borderBottomWidth: 2 },
  goalIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: BRAND.sky, alignItems: 'center', justifyContent: 'center' },
  goalImg: { width: 38, height: 38 },
  goalText: { flex: 1 },
  goalTitle: { fontFamily: 'Shark', fontSize: 17, color: BRAND.navy },
  goalTitleDone: { color: BRAND.navy },
  goalHint: { fontFamily: 'Knockout', fontSize: 14, color: BRAND.navySoft },
  goalHintDone: { fontFamily: 'Shark', fontSize: 14, color: BRAND.navy, marginTop: 1 },
  donePill: { alignSelf: 'flex-start', backgroundColor: BRAND.gold, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 1, marginTop: 2 },
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
  bellText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.white },
  coachScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5, 52, 110, 0.82)', justifyContent: 'center', padding: 14 },
  coachCard: { backgroundColor: BRAND.white, borderRadius: 20, padding: 14, gap: 8, borderWidth: 3, borderColor: BRAND.gold },
  coachTitle: { fontFamily: 'Shark', fontSize: 20, color: BRAND.navy, textAlign: 'center' },
  coachLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coachIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: BRAND.sky, alignItems: 'center', justifyContent: 'center' },
  coachText: { flex: 1, fontFamily: 'Shark', fontSize: 16, color: BRAND.navy },
});
