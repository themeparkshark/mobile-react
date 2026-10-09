import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Modal from 'react-native-modal';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import {
  buyStreakFreeze, claimDailyThree, claimWeeklyBox, getDailyThree, getLevelChests, markFreezeSeen, openLevelChest, setReminders,
  type DailyThreeState, type LevelChest, type PaidRewards,
} from '../../api/endpoints/retention';
import { AuthContext } from '../../context/AuthProvider';
import { useCurrencyFly } from '../../context/CurrencyFlyProvider';
import { haptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import * as RootNavigation from '../../RootNavigation';
import { enablePush } from '../../services/push';
import { loadRetentionFlags, type RetentionFlags } from '../../services/retention/flags';
import { buttonState, newlyDone, nextLevelChest, sameJson, tomorrowLine } from '../../services/retention/logic';
import { mayAskForPush, notePushAsked } from '../../services/retention/pushAsk';
import { BRAND, GameIcon, ICON_SOURCES, gameAlert } from '../../ui';
import { useModalLayer } from '../../ui/modalLayers';
import Ribbon from '../Ribbon';
import Daily3MapButton from './Daily3MapButton';
import Daily3Sheet, { type GoalTap } from './Daily3Sheet';
import RewardReveal from './RewardReveal';

const LEVEL_CHEST = require('../../../assets/images/retention/level-chest-closed.png');
const LEVEL_CHEST_OPEN = require('../../../assets/images/retention/level-chest-open.png');
const WEEKLY = require('../../../assets/images/retention/weekly-box-closed.png');
const WEEKLY_OPEN = require('../../../assets/images/retention/weekly-box-open.png');
const FREEZE = require('../../../assets/images/retention/freeze.png');
const BOX = require('../../../assets/images/retention/mystery-box.png');
const ART = [LEVEL_CHEST, LEVEL_CHEST_OPEN, WEEKLY, WEEKLY_OPEN, FREEZE, BOX];

/** Reads are cheap but not free: focus and app-resume reads wait at least 15 s; real events read at once. */
const MIN_REFRESH_MS = 15000;
const COACH_KEY = 'tps.retention.coach.v1';

type View_ =
  | { k: 'sheet' }
  | { k: 'reveal'; src: 'daily' | 'weekly' | 'level'; level?: number; claimDate?: string | null; rewards: PaidRewards | null; opening: boolean }
  | { k: 'freeze' }
  | { k: 'freezeSaved'; days: number; streak: number }
  | { k: 'push' };

export interface RetentionOptions {
  /** Signed in, on the map, onboarding done. */
  readonly enabled: boolean;
  readonly mapFocused: boolean;
  /** Something else covers the map (ride, boss, chest, find): map-button loops pause. */
  readonly mapCovered: boolean;
  /** Nothing else (chest, find, boss, ride, tutorial) is on screen: a level chest may present itself. */
  readonly screenFree: boolean;
  /** Something happened that can finish a goal (chest opened, find collected, ride won). */
  readonly refreshKey: string;
  /** A push asked to open Daily 3 or the daily chest. */
  readonly openRequest: 'daily3' | 'chest' | null;
  readonly onOpenRequestHandled: () => void;
  /** Show today's daily chest (the "Open your daily chest" goal). */
  readonly onOpenChest: () => void;
  /** GO on a snack or ride goal: point the map at the nearest one. */
  readonly onFind: (what: 'snack' | 'ride') => void;
}

/**
 * Daily 3, the Weekly Box and level-up chests on the map: returns the map
 * button (for the controls column) and the one overlay that hosts every
 * retention moment in a single modal (sheet, reveal, freeze, reminders ask),
 * so they never stack on each other or on another sheet.
 */
export default function useRetention(o: RetentionOptions): { button: ReactNode | null; overlay: ReactNode; occluding: boolean } {
  const { player, refreshPlayer } = useContext(AuthContext);
  const { triggerFly } = useCurrencyFly();
  const reducedMotion = useReducedGameMotion();
  const { width, height } = useWindowDimensions();
  const [flags, setFlags] = useState<RetentionFlags | null>(null);
  const [daily, setDaily] = useState<DailyThreeState | null>(null);
  const [chests, setChests] = useState<readonly LevelChest[]>([]);
  const [view, setView] = useState<View_ | null>(null);
  const [busy, setBusy] = useState(false);
  const [pop, setPop] = useState<{ index: number | null; key: number }>({ index: null, key: 0 });
  const [celebrate, setCelebrate] = useState<string[]>([]);
  const [coach, setCoach] = useState(false);
  const lastRead = useRef(0);
  const lastChestRead = useRef(-1);
  const prevGoals = useRef<DailyThreeState['goals'] | null>(null);
  const opening = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // Read the switches; a failed read (offline, slow server) is retried on the next map focus.
  useEffect(() => {
    if (!o.enabled || flags) return;
    void loadRetentionFlags().then(f => { if (mounted.current && f) setFlags(f); });
  }, [o.enabled, o.mapFocused, o.refreshKey, flags]);

  // Warm the art once the features are on, so the first reveal never pops in.
  useEffect(() => {
    if (flags?.dailyThree || flags?.levelChests) void Asset.loadAsync(ART).catch(() => undefined);
  }, [flags?.dailyThree, flags?.levelChests]);

  const applyDaily = useCallback((next: DailyThreeState) => {
    const fresh = newlyDone(prevGoals.current, next.goals);
    prevGoals.current = next.goals;
    // Identical answers never re-render the map.
    setDaily(prev => (prev && sameJson(prev, next) ? prev : next));
    if (fresh.length) {
      const index = next.goals.findIndex(g => g.key === fresh[fresh.length - 1]);
      setPop(p => ({ index, key: p.key + 1 }));
      setCelebrate(c => [...new Set([...c, ...fresh])]);
      haptic('success');
      playSfx(next.claimable ? 'fx.reveal' : 'fx.coinTick');
    }
  }, []);

  const level = player?.experience_level?.level ?? 0;
  const refresh = useCallback(async (force = false) => {
    if (!flags || (!flags.dailyThree && !flags.levelChests)) return;
    const now = Date.now();
    if (!force && now - lastRead.current < MIN_REFRESH_MS) return;
    lastRead.current = now;
    // Level chests only change with the level: read them once, then on each level-up.
    const wantChests = flags.levelChests && lastChestRead.current !== level;
    try {
      const [d, c] = await Promise.all([
        flags.dailyThree ? getDailyThree() : Promise.resolve(null),
        wantChests ? getLevelChests() : Promise.resolve(null),
      ]);
      if (!mounted.current) return;
      if (d && d.enabled) applyDaily(d); else if (d) setDaily(null);
      if (c) {
        lastChestRead.current = level;
        const list = c.enabled ? c.chests : [];
        setChests(prev => (sameJson(prev, list) ? prev : list));
      }
    } catch {
      // Offline or a server without these routes: keep what we had, try again on the next focus.
    }
  }, [flags, applyDaily, level]);

  useEffect(() => { if (o.enabled && o.mapFocused) void refresh(lastRead.current === 0); }, [o.enabled, o.mapFocused, flags, refresh]);
  useEffect(() => { if (o.enabled) void refresh(true); }, [o.refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (o.enabled && level > 0 && lastChestRead.current !== -1) void refresh(true); }, [level]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active' && o.enabled) void refresh(false);
    });
    return () => sub.remove();
  }, [o.enabled, refresh]);

  // A push asked for Daily 3 or the chest.
  useEffect(() => {
    if (!o.openRequest || !o.enabled) return;
    if (o.openRequest === 'chest') o.onOpenChest();
    else if (daily) openSheet();
    else return; // wait for the first read
    o.onOpenRequestHandled();
  }, [o.openRequest, o.enabled, daily]); // eslint-disable-line react-hooks/exhaustive-deps

  // A level-up chest presents itself as soon as the map is free; then a freeze that saved the streak says so once.
  const pendingChest = flags?.levelChests ? nextLevelChest(chests) : null;
  const freezeSaved = daily?.streak.freeze_saved ?? 0;
  useEffect(() => {
    if (view || !o.screenFree || !o.mapFocused || !o.enabled) return;
    if (pendingChest) {
      const timer = setTimeout(() => {
        setView(v => v ?? { k: 'reveal', src: 'level', level: pendingChest.level, rewards: null, opening: false });
        playSfx('fx.reveal');
      }, 700);
      return () => clearTimeout(timer);
    }
    if (freezeSaved > 0 && daily) {
      const timer = setTimeout(() => setView(v => v ?? { k: 'freezeSaved', days: freezeSaved, streak: daily.streak.days }), 700);
      return () => clearTimeout(timer);
    }
  }, [pendingChest?.level, freezeSaved, view, o.screenFree, o.mapFocused, o.enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const openSheet = () => {
    setView({ k: 'sheet' });
    void AsyncStorage.getItem(COACH_KEY).then(v => { if (!v && mounted.current) setCoach(true); }).catch(() => undefined);
  };
  const coachDone = () => {
    setCoach(false);
    void AsyncStorage.setItem(COACH_KEY, '1').catch(() => undefined);
  };

  const fly = (paid: PaidRewards) => {
    const send = (kind: 'coins' | 'ticket' | 'energy', n: number | undefined, target: string, delay: number) => {
      if (n && n > 0) setTimeout(() => triggerFly({ imageSource: ICON_SOURCES[kind], amount: Math.min(8, n), startX: width / 2, startY: height * 0.5, targetPosition: target }), delay);
    };
    send('coins', (paid.coins ?? 0) + (paid.bonus_coins ?? 0), 'coins', 0);
    send('ticket', paid.tickets, 'tickets', 80);
    send('energy', paid.energy, 'energy', 160);
  };

  const finishReveal = async (paid: PaidRewards | null) => {
    if (paid) fly(paid);
    void refreshPlayer?.();
    void refresh(true);
    // Right after a win is the one good moment to ask about reminders.
    if (await mayAskForPush()) { setView({ k: 'push' }); return; }
    setView(null);
  };

  /** A claim whose answer was lost: read back what the server paid for that exact chest. */
  const recoverPaid = async (src: 'daily' | 'weekly' | 'level', level_: number, claimDate: string | null | undefined): Promise<PaidRewards | null> => {
    try {
      if (src === 'level') {
        const c = await getLevelChests(6000);
        const chest = c.enabled ? c.chests.find(x => x.level === level_) : undefined;
        if (c.enabled) setChests(c.chests);
        return chest?.opened && chest.rewards ? chest.rewards : null;
      }
      const d = await getDailyThree(6000);
      if (!d.enabled) return null;
      applyDaily(d);
      if (src === 'weekly') return d.week.claimed ? d.week.claimed_rewards ?? null : null;
      const last = d.claimed_rewards;
      return last && claimDate && last.date === claimDate ? last : null;
    } catch {
      return null;
    }
  };

  const openReveal = async () => {
    if (!view || view.k !== 'reveal' || view.rewards || opening.current) return;
    opening.current = true;
    const current = view;
    setView({ ...current, opening: true });
    const started = Date.now();
    try {
      const result: { rewards: PaidRewards; state?: DailyThreeState } = current.src === 'daily' ? await claimDailyThree()
        : current.src === 'weekly' ? await claimWeeklyBox()
        : await openLevelChest(current.level ?? 0);
      // Let the shake build before the lid pops (anticipation reads at 450 ms+).
      // The Weekly Box shakes longest (900 ms): the week's biggest moment earns the longest wind-up.
      const wait = reducedMotion ? 0 : Math.max(0, (current.src === 'weekly' ? 900 : 560) - (Date.now() - started));
      setTimeout(() => { if (mounted.current) setView({ ...current, opening: false, rewards: result.rewards }); }, wait);
      if (result.state?.goals) applyDaily(result.state);
      if (current.src === 'level') setChests(cs => cs.map(c => (c.level === current.level ? { ...c, opened: true, rewards: result.rewards } : c)));
    } catch {
      // The claim may still be committing: read back up to 3 times, 1.5 s apart (the card says "Still opening...").
      let paid: PaidRewards | null = null;
      const giveUp = Date.now() + 12000; // never more than ~12 s of "Still opening..."
      for (let i = 0; i < 3 && !paid && mounted.current && Date.now() < giveUp; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 1500));
        paid = await recoverPaid(current.src, current.level ?? 0, current.claimDate);
      }
      if (!mounted.current) return;
      if (paid) { setView({ ...current, opening: false, rewards: paid }); return; }
      setView(null);
      void refresh(true);
      gameAlert('Could not open it yet', 'Your reward is safe. Check your internet and try again.');
    } finally {
      opening.current = false;
    }
  };

  const onGoal = (tap: GoalTap) => {
    setView(null);
    if (tap === 'chest') o.onOpenChest();
    else if (tap === 'closet') RootNavigation.navigate('Inventory');
    else if (tap === 'friends') RootNavigation.navigate('Friends');
    else o.onFind(tap);
  };

  const buyFreeze = async () => {
    setBusy(true);
    try {
      const { state } = await buyStreakFreeze();
      applyDaily(state);
      haptic('success'); playSfx('fx.purchase');
      void refreshPlayer?.();
      setView({ k: 'sheet' });
    } catch {
      gameAlert('No freeze this time', 'You may already hold the most freezes, or need a few more coins.');
      setView({ k: 'sheet' });
    } finally {
      setBusy(false);
    }
  };

  const toggleReminders = async (on: boolean) => {
    haptic('tapLight');
    try {
      const { state } = await setReminders(on);
      applyDaily(state);
      if (on) void enablePush().catch(() => undefined);
    } catch {
      gameAlert('Could not change reminders', 'Check your internet and try again.');
    }
  };

  const close = () => {
    if (view?.k === 'sheet') setCelebrate([]);
    if (view?.k === 'push') void notePushAsked();
    if (view?.k === 'freezeSaved') void markFreezeSeen().then(r => applyDaily(r.state)).catch(() => undefined);
    setView(null);
  };

  const visible = !!view;
  const front = useModalLayer(visible, 'wait');

  let button: ReactNode | null = null;
  if (flags?.dailyThree && daily) {
    const b = buttonState(daily, new Date().getHours());
    button = (
      <Daily3MapButton pips={b.pips} streak={b.streak} attention={b.attention} popIndex={pop.index} popKey={pop.key}
        active={o.mapFocused && !o.mapCovered && !visible} reducedMotion={reducedMotion}
        onPress={() => { playSfx('ui.tap'); openSheet(); }} />
    );
  }

  const xpNow = player?.experience ?? 0;
  const xpNeed = player?.experience_level?.experience ?? 0;
  // When the next level is far off (Level 7+ takes weeks), lead with the nearer streak prize.
  const farLevel = xpNeed > 0 && xpNow / xpNeed < 0.5 && lvOf(player) >= 6;
  const nextLevel = (lv: number) => (
    <View style={styles.nextBlock}>
      <View style={styles.nextRow}>
        <Image source={LEVEL_CHEST} style={{ width: 30, height: 30 }} contentFit="contain" />
        <Text style={styles.nextText}>{farLevel && daily?.streak.next_milestone
          ? `Next prize: ${daily.streak.next_milestone.label.toLowerCase()} on Day ${daily.streak.next_milestone.day}`
          : `Next: Level ${lv + 1} chest with new gear`}</Text>
      </View>
      {xpNeed > 0 && <XpBar pct={Math.min(1, xpNow / xpNeed)} reducedMotion={reducedMotion} />}
    </View>
  );

  let title = 'Daily 3';
  let content: ReactNode = null;
  if (view?.k === 'sheet' && daily) {
    content = (
      <Daily3Sheet state={daily} now={Date.now()} busy={busy} coins={player?.coins ?? 0} celebrate={celebrate}
        reducedMotion={reducedMotion} onClose={close} onGoal={onGoal} coach={coach} onCoachDone={coachDone}
        onReminders={on => { void toggleReminders(on); }}
        onClaim={() => setView({ k: 'reveal', src: 'daily', claimDate: daily.claimable_date, rewards: null, opening: false })}
        onClaimWeekly={() => setView({ k: 'reveal', src: 'weekly', rewards: null, opening: false })}
        onBuyFreeze={() => setView({ k: 'freeze' })} />
    );
  } else if (view?.k === 'reveal') {
    const r = view;
    title = r.src === 'level' ? `Level ${r.level}!` : r.src === 'weekly' ? 'Weekly Box' : 'Daily 3 done!';
    const footer = r.src === 'level' ? nextLevel(r.level ?? 1)
      : r.src === 'weekly' ? (
        <View style={styles.nextRow}>
          <Image source={WEEKLY} style={{ width: 28, height: 28 }} contentFit="contain" />
          <Text style={styles.nextText}>Next box: 5 flames next week</Text>
        </View>
      )
      : daily ? (
        <View style={styles.nextRow}>
          <GameIcon name="streak" size={26} />
          <Text style={styles.nextText}>{tomorrowLine(daily)}</Text>
        </View>
      ) : null;
    content = (
      <RewardReveal reducedMotion={reducedMotion} rewards={r.rewards} opening={r.opening} footer={footer} dropIn={r.src === 'level'}
        subtitle={r.src === 'level' ? `You reached Level ${r.level}! Tap your chest.`
          : r.src === 'weekly' ? 'A whole week of flames. Tap the box!' : 'All three goals done. Tap your chest!'}
        closedArt={r.src === 'level' ? LEVEL_CHEST : r.src === 'weekly' ? WEEKLY : ICON_SOURCES.chest}
        openArt={r.src === 'level' ? LEVEL_CHEST_OPEN : r.src === 'weekly' ? WEEKLY_OPEN : ICON_SOURCES.chestOpen}
        onWear={() => { void finishReveal(r.rewards).then(() => RootNavigation.navigate('Inventory')); }}
        onPins={() => { void finishReveal(r.rewards).then(() => RootNavigation.navigate('PinCollections')); }}
        onOpen={() => { void openReveal(); }} onDone={() => { void finishReveal(r.rewards); }} />
    );
  } else if (view?.k === 'freeze' && daily) {
    title = 'Streak Freeze';
    content = (
      <View style={styles.card}>
        <Image source={FREEZE} style={styles.bigArt} contentFit="contain" />
        <Text style={styles.lead}>Miss a day? A freeze keeps your flame safe.</Text>
        <Text style={styles.small}>{`You have ${daily.streak.freezes} of ${daily.streak.freeze_cap}. It works by itself.`}</Text>
        <Pressable onPress={() => { void buyFreeze(); }} disabled={busy} accessibilityRole="button"
          accessibilityLabel={`Get a Streak Freeze for ${daily.streak.freeze_price} coins`}
          style={({ pressed }) => [styles.gold, pressed && styles.pressed]}>
          <Text style={styles.goldText}>{busy ? '...' : 'GET ONE'}</Text>
          <View style={styles.priceChip}><GameIcon name="coins" size={20} /><Text style={styles.priceText}>{daily.streak.freeze_price}</Text></View>
        </Pressable>
        <Pressable onPress={() => setView({ k: 'sheet' })} accessibilityRole="button" style={({ pressed }) => [styles.plain, pressed && styles.pressed]}>
          <Text style={styles.plainText}>NOT NOW</Text>
        </Pressable>
      </View>
    );
  } else if (view?.k === 'freezeSaved') {
    title = 'Saved!';
    content = (
      <View style={styles.card}>
        <Image source={FREEZE} style={styles.bigArt} contentFit="contain" />
        <Text style={styles.lead}>{`A freeze saved your ${view.streak}-day flame!`}</Text>
        <Text style={styles.small}>{view.days > 1 ? `It covered ${view.days} missed days.` : 'It covered the day you missed.'}</Text>
        <Pressable onPress={close} accessibilityRole="button" style={({ pressed }) => [styles.gold, pressed && styles.pressed]}>
          <Text style={styles.goldText}>KEEP IT GOING</Text>
        </Pressable>
      </View>
    );
  } else if (view?.k === 'push') {
    title = 'Reminders';
    content = (
      <View style={styles.card}>
        <GameIcon name="bell" size={86} />
        <Text style={styles.lead}>Want a friendly reminder each day?</Text>
        <Text style={styles.small}>One a day, never at night. Turn it off anytime.</Text>
        <Pressable onPress={() => { void notePushAsked(); setView(null); void enablePush().catch(() => undefined); }}
          accessibilityRole="button" style={({ pressed }) => [styles.gold, pressed && styles.pressed]}>
          <Text style={styles.goldText}>YES, REMIND ME</Text>
        </Pressable>
        <Pressable onPress={close} accessibilityRole="button" style={({ pressed }) => [styles.plain, pressed && styles.pressed]}>
          <Text style={styles.plainText}>NOT NOW</Text>
        </Pressable>
      </View>
    );
  }

  const revealing = view?.k === 'reveal';
  const overlay = (
    <Modal isVisible={visible && front && !!content} animationIn={reducedMotion ? 'fadeIn' : 'zoomIn'}
      animationOut={reducedMotion ? 'fadeOut' : 'zoomOut'} animationInTiming={reducedMotion ? 120 : 240}
      animationOutTiming={reducedMotion ? 120 : 180} backdropColor={BRAND.navy} backdropOpacity={0.55}
      onBackdropPress={revealing ? undefined : close} onBackButtonPress={revealing ? undefined : close}
      useNativeDriver useNativeDriverForBackdrop hideModalContentWhileAnimating={false}>
      <View style={styles.wrap}>
        <Ribbon text={title} />
        {content}
      </View>
    </Modal>
  );

  return { button, overlay, occluding: visible };
}

function lvOf(p: { experience_level?: { level: number } } | null | undefined): number {
  return p?.experience_level?.level ?? 0;
}

/** The road to the next level chest: fills from empty over 600 ms when the chest closes its show. */
function XpBar({ pct, reducedMotion }: { readonly pct: number; readonly reducedMotion: boolean }) {
  const w = useSharedValue(reducedMotion ? pct : 0);
  useEffect(() => { w.value = reducedMotion ? pct : withTiming(pct, { duration: 600 }); }, [pct, reducedMotion, w]);
  // scaleX from the left edge (no layout pass per frame).
  const [trackW, setTrackW] = useState(0);
  const fill = useAnimatedStyle(() => ({ transform: [{ translateX: -trackW / 2 * (1 - Math.max(0.04, w.value)) }, { scaleX: Math.max(0.04, w.value) }] }));
  return (
    <View style={styles.xpTrack} onLayout={e => setTrackW(e.nativeEvent.layout.width)} accessibilityLabel={`${Math.round(pct * 100)} percent of the way to the next level`}>
      <Animated.View style={[styles.xpFill, fill]} />
      <GameIcon name="xp" size={22} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  nextBlock: { gap: 6 },
  xpTrack: { height: 16, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'visible', justifyContent: 'center',
    marginHorizontal: 18, paddingLeft: 0 },
  xpFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 8, backgroundColor: BRAND.gold },
  card: { width: '94%', marginTop: -14, backgroundColor: BRAND.blue, borderRadius: 24, borderWidth: 4, borderColor: BRAND.white,
    paddingTop: 22, paddingBottom: 14, paddingHorizontal: 14, alignItems: 'center', gap: 8 },
  bigArt: { width: 110, height: 110 },
  lead: { fontFamily: 'Shark', fontSize: 21, color: BRAND.white, textAlign: 'center' },
  small: { fontFamily: 'Knockout', fontSize: 16, color: '#e4f7ff', textAlign: 'center' },
  gold: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', minHeight: 54, backgroundColor: BRAND.gold, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', borderBottomWidth: 4, borderBottomColor: BRAND.goldLip, marginTop: 6 },
  pressed: { transform: [{ translateY: 2 }], borderBottomWidth: 2 },
  goldText: { fontFamily: 'Shark', fontSize: 20, color: '#075083' },
  // Same size and type as the gold button: an equal choice, never a buried "no".
  plain: { alignSelf: 'stretch', minHeight: 54, backgroundColor: BRAND.white, borderRadius: 16, alignItems: 'center',
    justifyContent: 'center', borderBottomWidth: 4, borderBottomColor: '#a9cdea' },
  plainText: { fontFamily: 'Shark', fontSize: 20, color: BRAND.navy },
  priceChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BRAND.navy, borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 3 },
  priceText: { fontFamily: 'Shark', fontSize: 16, color: BRAND.white, marginTop: 1 },
  nextRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  nextText: { fontFamily: 'Shark', fontSize: 16, color: BRAND.white, textAlign: 'center', flexShrink: 1 },
});
