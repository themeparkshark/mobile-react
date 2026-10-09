import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Modal from 'react-native-modal';
import {
  buyStreakFreeze, claimDailyThree, claimWeeklyBox, getDailyThree, getLevelChests, openLevelChest,
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
import { buttonState, newlyDone, nextLevelChest } from '../../services/retention/logic';
import { mayAskForPush, notePushAsked } from '../../services/retention/pushAsk';
import { BRAND, GameIcon, ICON_SOURCES, gameAlert } from '../../ui';
import { useModalLayer } from '../../ui/modalLayers';
import Ribbon from '../Ribbon';
import Daily3MapButton from './Daily3MapButton';
import Daily3Sheet, { type GoalTap } from './Daily3Sheet';
import RewardReveal from './RewardReveal';

const LEVEL_CHEST = require('../../../assets/images/retention/level-chest-closed.png');
const LEVEL_CHEST_OPEN = require('../../../assets/images/retention/level-chest-open.png');
const FREEZE = require('../../../assets/images/retention/freeze.png');

/** Reads are cheap but not free: at most one refresh every 15 s unless something just happened. */
const MIN_REFRESH_MS = 15000;

type View_ =
  | { k: 'sheet' }
  | { k: 'reveal'; src: 'daily' | 'weekly' | 'level'; level?: number; rewards: PaidRewards | null; opening: boolean }
  | { k: 'freeze' }
  | { k: 'push' };

export interface RetentionOptions {
  /** Signed in, on the map, onboarding done. */
  readonly enabled: boolean;
  readonly mapFocused: boolean;
  /** Nothing else (chest, find, boss, ride, tutorial) is on screen: a level chest may present itself. */
  readonly screenFree: boolean;
  /** Something changed that can finish a goal (chest opened, find collected, ride won). */
  readonly refreshKey: string;
  /** A push asked to open Daily 3 or the daily chest. */
  readonly openRequest: 'daily3' | 'chest' | null;
  readonly onOpenRequestHandled: () => void;
  /** Show today's daily chest (the "Open your daily chest" goal). */
  readonly onOpenChest: () => void;
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
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedGameMotion();
  const [flags, setFlags] = useState<RetentionFlags | null>(null);
  const [daily, setDaily] = useState<DailyThreeState | null>(null);
  const [chests, setChests] = useState<readonly LevelChest[]>([]);
  const [view, setView] = useState<View_ | null>(null);
  const [busy, setBusy] = useState(false);
  const [pop, setPop] = useState<{ index: number | null; key: number }>({ index: null, key: 0 });
  const [celebrate, setCelebrate] = useState<string[]>([]);
  const lastRead = useRef(0);
  const prevGoals = useRef<DailyThreeState['goals'] | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // Read the switches; a failed read (offline, slow server) is retried on the next map focus.
  useEffect(() => {
    if (!o.enabled || flags) return;
    void loadRetentionFlags().then(f => { if (mounted.current && f) setFlags(f); });
  }, [o.enabled, o.mapFocused, o.refreshKey, flags]);

  const applyDaily = useCallback((next: DailyThreeState) => {
    const fresh = newlyDone(prevGoals.current, next.goals);
    prevGoals.current = next.goals;
    setDaily(next);
    if (fresh.length) {
      const index = next.goals.findIndex(g => g.key === fresh[fresh.length - 1]);
      setPop(p => ({ index, key: p.key + 1 }));
      setCelebrate(c => [...new Set([...c, ...fresh])]);
      haptic('success');
      playSfx(next.claimable ? 'fx.jingle' : 'fx.coinTick');
    }
  }, []);

  const refresh = useCallback(async (force = false) => {
    if (!flags || (!flags.dailyThree && !flags.levelChests)) return;
    const now = Date.now();
    if (!force && now - lastRead.current < MIN_REFRESH_MS) return;
    lastRead.current = now;
    try {
      const [d, c] = await Promise.all([
        flags.dailyThree ? getDailyThree() : Promise.resolve(null),
        flags.levelChests ? getLevelChests() : Promise.resolve(null),
      ]);
      if (!mounted.current) return;
      if (d && d.enabled) applyDaily(d); else if (d) setDaily(null);
      if (c && c.enabled) setChests(c.chests); else if (c) setChests([]);
    } catch {
      // Offline or a server without these routes: keep what we had, try again on the next focus.
    }
  }, [flags, applyDaily]);

  useEffect(() => { if (o.enabled && o.mapFocused) void refresh(true); }, [o.enabled, o.mapFocused, flags, refresh]);
  useEffect(() => { if (o.enabled) void refresh(true); }, [o.refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const level = player?.experience_level?.level ?? 0;
  useEffect(() => { if (o.enabled && level > 0) void refresh(true); }, [level]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => { if (s === 'active' && o.enabled) void refresh(false); });
    return () => sub.remove();
  }, [o.enabled, refresh]);

  // A push asked for Daily 3 or the chest.
  useEffect(() => {
    if (!o.openRequest || !o.enabled) return;
    if (o.openRequest === 'chest') o.onOpenChest();
    else if (daily) setView({ k: 'sheet' });
    else return; // wait for the first read
    o.onOpenRequestHandled();
  }, [o.openRequest, o.enabled, daily]); // eslint-disable-line react-hooks/exhaustive-deps

  // A level-up chest presents itself as soon as the map is free.
  const pendingChest = flags?.levelChests ? nextLevelChest(chests) : null;
  useEffect(() => {
    if (!pendingChest || view || !o.screenFree || !o.mapFocused || !o.enabled) return;
    const timer = setTimeout(() => {
      setView(v => v ?? { k: 'reveal', src: 'level', level: pendingChest.level, rewards: null, opening: false });
      haptic('hitMedium');
      playSfx('fx.jingle');
    }, 700);
    return () => clearTimeout(timer);
  }, [pendingChest?.level, view, o.screenFree, o.mapFocused, o.enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const fly = (paid: PaidRewards) => {
    const send = (kind: 'coins' | 'ticket' | 'energy', n: number | undefined, target: string) => {
      if (n && n > 0) triggerFly({ imageSource: ICON_SOURCES[kind], amount: Math.min(8, n), startX: width / 2, startY: height * 0.5, targetPosition: target });
    };
    send('coins', paid.coins, 'coins');
    send('ticket', paid.tickets, 'tickets');
    send('energy', paid.energy, 'energy');
  };

  const finishReveal = async (paid: PaidRewards | null) => {
    if (paid) fly(paid);
    void refreshPlayer?.();
    void refresh(true);
    // Right after a win is the one good moment to ask about reminders.
    if (await mayAskForPush()) { setView({ k: 'push' }); return; }
    setView(null);
  };

  const openReveal = async () => {
    if (!view || view.k !== 'reveal' || view.opening || view.rewards) return;
    const current = view;
    setView({ ...current, opening: true });
    const started = Date.now();
    try {
      const result: { rewards: PaidRewards; state?: DailyThreeState } = current.src === 'daily' ? await claimDailyThree()
        : current.src === 'weekly' ? await claimWeeklyBox()
        : await openLevelChest(current.level ?? 0);
      // Let the shake land before the lid pops (anticipation reads as 400 ms+).
      const wait = reducedMotion ? 0 : Math.max(0, 520 - (Date.now() - started));
      setTimeout(() => { if (mounted.current) setView({ ...current, opening: false, rewards: result.rewards }); }, wait);
      if (result.state?.goals) applyDaily(result.state);
    } catch {
      // A slow answer can arrive after the server already paid: read back what it paid and keep the reveal going.
      const paid = await recoverPaid(current.src, current.level ?? 0);
      if (!mounted.current) return;
      if (paid) { setView({ ...current, opening: false, rewards: paid }); return; }
      setView(null);
      void refresh(true);
      gameAlert('Could not open it yet', 'Your reward is safe. Check your internet and try again.');
    }
  };

  const recoverPaid = async (src: 'daily' | 'weekly' | 'level', level: number): Promise<PaidRewards | null> => {
    try {
      if (src === 'level') {
        const c = await getLevelChests();
        const chest = c.enabled ? c.chests.find(x => x.level === level) : undefined;
        if (c.enabled) setChests(c.chests);
        return chest?.opened && chest.rewards ? chest.rewards : null;
      }
      const d = await getDailyThree();
      if (!d.enabled) return null;
      applyDaily(d);
      if (src === 'weekly') return d.week.claimed ? d.week.claimed_rewards ?? null : null;
      return d.claimed ? d.claimed_rewards ?? null : null;
    } catch {
      return null;
    }
  };

  const onGoal = (tap: GoalTap) => {
    setView(null);
    if (tap === 'chest') o.onOpenChest();
    else if (tap === 'closet') RootNavigation.navigate('Inventory');
    else if (tap === 'friends') RootNavigation.navigate('Friends');
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

  const close = () => {
    if (view?.k === 'sheet') setCelebrate([]);
    if (view?.k === 'push') void notePushAsked();
    setView(null);
  };

  const visible = !!view;
  const front = useModalLayer(visible, 'wait');

  let button: ReactNode | null = null;
  if (flags?.dailyThree && daily) {
    const b = buttonState(daily, new Date().getHours());
    button = (
      <Daily3MapButton pips={b.pips} streak={b.streak} attention={b.attention} popIndex={pop.index} popKey={pop.key}
        active={o.mapFocused && !visible} reducedMotion={reducedMotion}
        onPress={() => { playSfx('ui.tap'); setView({ k: 'sheet' }); }} />
    );
  }

  let title = 'Daily 3';
  let content: ReactNode = null;
  if (view?.k === 'sheet' && daily) {
    content = (
      <Daily3Sheet state={daily} now={Date.now()} busy={busy} coins={player?.coins ?? 0} celebrate={celebrate}
        reducedMotion={reducedMotion} onClose={close} onGoal={onGoal}
        onClaim={() => setView({ k: 'reveal', src: 'daily', rewards: null, opening: false })}
        onClaimWeekly={() => setView({ k: 'reveal', src: 'weekly', rewards: null, opening: false })}
        onBuyFreeze={() => setView({ k: 'freeze' })} />
    );
  } else if (view?.k === 'reveal') {
    const r = view;
    title = r.src === 'level' ? `Level ${r.level}!` : r.src === 'weekly' ? 'Weekly Box' : 'Daily 3 done!';
    content = (
      <RewardReveal title={title} reducedMotion={reducedMotion} rewards={r.rewards} opening={r.opening}
        subtitle={r.src === 'level' ? 'You leveled up! Your Level Chest is here.'
          : r.src === 'weekly' ? 'A whole week of Daily 3. Big box time!' : 'All three goals done. Your chest is ready!'}
        closedArt={r.src === 'level' ? LEVEL_CHEST : r.src === 'weekly' ? ICON_SOURCES.gift : ICON_SOURCES.chest}
        openArt={r.src === 'level' ? LEVEL_CHEST_OPEN : r.src === 'weekly' ? ICON_SOURCES.gift : ICON_SOURCES.chestOpen}
        onOpen={() => { void openReveal(); }} onDone={() => { void finishReveal(r.rewards); }} />
    );
  } else if (view?.k === 'freeze' && daily) {
    title = 'Streak Freeze';
    content = (
      <View style={styles.card}>
        <Image source={FREEZE} style={styles.bigArt} contentFit="contain" />
        <Text style={styles.lead}>Miss a day? A freeze keeps your streak safe.</Text>
        <Text style={styles.small}>{`You have ${daily.streak.freezes} of ${daily.streak.freeze_cap}. It works by itself.`}</Text>
        <Pressable onPress={() => { void buyFreeze(); }} disabled={busy} accessibilityRole="button"
          accessibilityLabel={`Get a Streak Freeze for ${daily.streak.freeze_price} coins`}
          style={({ pressed }) => [styles.gold, pressed && styles.pressed]}>
          <GameIcon name="coins" size={26} />
          <Text style={styles.goldText}>{busy ? '...' : `GET ONE  ${daily.streak.freeze_price}`}</Text>
        </Pressable>
        <Pressable onPress={() => setView({ k: 'sheet' })} accessibilityRole="button" style={styles.later}>
          <Text style={styles.laterText}>NOT NOW</Text>
        </Pressable>
      </View>
    );
  } else if (view?.k === 'push') {
    title = 'Reminders';
    content = (
      <View style={styles.card}>
        <GameIcon name="bell" size={86} />
        <Text style={styles.lead}>Want a heads-up when your chest is ready?</Text>
        <Text style={styles.small}>One friendly reminder a day. Never at night.</Text>
        <Pressable onPress={() => { void notePushAsked(); setView(null); void enablePush().catch(() => undefined); }}
          accessibilityRole="button" style={({ pressed }) => [styles.gold, pressed && styles.pressed]}>
          <Text style={styles.goldText}>YES, REMIND ME</Text>
        </Pressable>
        <Pressable onPress={close} accessibilityRole="button" style={styles.later}>
          <Text style={styles.laterText}>NOT NOW</Text>
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
      useNativeDriverForBackdrop hideModalContentWhileAnimating={false}>
      <View style={styles.wrap}>
        <Ribbon text={title} />
        {content}
      </View>
    </Modal>
  );

  return { button, overlay, occluding: visible };
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  card: { width: '94%', marginTop: -14, backgroundColor: BRAND.blue, borderRadius: 24, borderWidth: 4, borderColor: BRAND.white,
    paddingTop: 22, paddingBottom: 14, paddingHorizontal: 14, alignItems: 'center', gap: 8 },
  bigArt: { width: 110, height: 110 },
  lead: { fontFamily: 'Shark', fontSize: 21, color: BRAND.white, textAlign: 'center' },
  small: { fontFamily: 'Knockout', fontSize: 16, color: '#e4f7ff', textAlign: 'center' },
  gold: { flexDirection: 'row', gap: 8, alignSelf: 'stretch', backgroundColor: BRAND.gold, borderRadius: 16, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center', borderBottomWidth: 4, borderBottomColor: BRAND.goldLip, marginTop: 6 },
  pressed: { transform: [{ translateY: 2 }], borderBottomWidth: 2 },
  goldText: { fontFamily: 'Shark', fontSize: 20, color: '#075083' },
  later: { minHeight: 44, alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center', borderRadius: 12, borderWidth: 2,
    borderColor: '#8fcdff', backgroundColor: '#075395' },
  laterText: { fontFamily: 'Knockout', fontSize: 17, color: BRAND.white },
});
