import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Image as RNImage, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { runOnUI, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { NOT_YET, withDelayAfter, withDelayUntil } from './delayUntil';
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
import { buttonState, doneCount, newlyDone, nextLevelChest, sameJson, tomorrowLine } from '../../services/retention/logic';
import {
  CHECK, LOOP_DIM_LEVEL, PRIZE_FLIGHT, chainNextAfter, handoffDim, lidDelay, STREAK_MILESTONES, WELCOME_FX, dailyChain, daysAway, flameMomentFor, flightDoneMs, flightPlan,
  flightTarget, isRareChest, isRepeatChest, mayAskAfterChain, tomorrowPrize, welcomeCards, type FlameMoment, type WelcomeCard,
} from '../../services/retention/loopMotion';
import { DURATION, SPRING } from '../../ui/motion';
import { EASE } from '../../ui/motionEasing';
import { type FlightSpec } from './PrizeFlight';
import { counterStepAt, counterTicks, legLandings } from '../../services/retention/counterTicks';
import { mayAskForPush, notePushAsked } from '../../services/retention/pushAsk';
import { BRAND, GameIcon, ICON_SOURCES, gameAlert } from '../../ui';
import { useModalLayer } from '../../ui/modalLayers';
import Daily3MapButton, { type CheckLanding } from './Daily3MapButton';
import LoopStage, { createStageStore, stageStyles, type StageState } from './LoopStage';
import StreakMoment from './StreakMoment';
import TomorrowCard from './TomorrowCard';
import Daily3Sheet, { type GoalTap } from './Daily3Sheet';
import FlameUpRow from './FlameUpRow';
import { EmberCard, FreezeSavedCard } from './FreezeMoments';
import WelcomeBack from './WelcomeBack';
import RewardReveal, { type PrizeOrigin } from './RewardReveal';
import LoopPerf, { LOOPS_PERF_CAPTURE, loopPerfMapStyle, loopPerfOn } from './LoopPerf';
import CardSurface, { CARD_FRAME } from './CardSurface';

const LEVEL_CHEST = require('../../../assets/images/retention/level-chest-closed.png');
const LEVEL_CHEST_OPEN = require('../../../assets/images/retention/level-chest-open.png');
const WEEKLY = require('../../../assets/images/retention/weekly-box-closed.png');
const WEEKLY_OPEN = require('../../../assets/images/retention/weekly-box-open.png');
const FREEZE = require('../../../assets/images/retention/freeze.png');
const BOX = require('../../../assets/images/retention/mystery-box.png');
// The loop moments' art too (flame, crown, Finn, the gold), so the flame never pops in late.
const ART = [LEVEL_CHEST, LEVEL_CHEST_OPEN, WEEKLY, WEEKLY_OPEN, FREEZE, BOX,
  require('../../../assets/icons/game/streak.png'), require('../../assets/games/banana-basket/v2/crown.png'),
  require('../../assets/games/banana-basket/v2/shark_cheer.png'), require('../../../assets/images/reveal/soft-spot.webp'),
  require('../../../assets/images/daily/chest-closed.png'), require('../../../assets/fx/spark.webp'),
  require('../../../assets/images/reveal/rays-gold-fade.webp')];
const LOOP_ICONS = ['coins', 'coin', 'ticket', 'energy', 'xp', 'gift', 'streak', 'chest', 'chestOpen', 'crown'] as const;

/** The art's URLs as expo-image keys them (a required asset resolves to the same URL the <Image> asks for). */
function artUrls(): string[] {
  return [...ART, ...LOOP_ICONS.map(k => ICON_SOURCES[k])].map(m => RNImage.resolveAssetSource(m)?.uri).filter((u): u is string => !!u);
}

/** Reads are cheap but not free: focus and app-resume reads wait at least 15 s; real events read at once. */
const MIN_REFRESH_MS = 15000;
/** The armed full-set card flies its check by this long even if the modal never says it has shown. */
const ARM_FALLBACK_MS = 600;
/**
 * A claim answer that lands while the full set's card grows out of the button renders once the card is this far in:
 * past the settle spring, well before the lid's beat (FULL_SET.chestAt plus the gather).
 */
export const ENTER_QUIET_MS = 460;
/** The next chain card enters this long before the prize flight ends (it overlaps the last landings)... */
export const NEXT_OVERLAP_MS = 380;
/** ...but never sooner than this after the prizes lift off (the eye follows them to the HUD first). */
export const NEXT_MIN_MS = 420;
/**
 * The chest's handoff starts about this long after AWESOME (the render that starts it reaches the screen first); JS
 * timers that follow the flight allow this much.
 */
export const HANDOFF_SLACK_MS = 250;
/** The chest card that left is unmounted this long after the next card starts to grow in (its entrance beats are done). */
export const A_LET_GO_AFTER_MS = 2200;
/** The next chain card counts taps this long after it starts to grow in (its settle spring is mostly done). */
export const B_TAPS_AFTER_MS = 360;
/** The chain's next card mounts (hidden) this long after the chest's answer, once its prizes have landed. */
const PREMOUNT_MS = 2400;
const COACH_KEY = 'tps.retention.coach.v1';
/** The last streak number this phone celebrated (per player), so a flame moment plays once. */
const FLAME_SEEN_KEY = 'tps.retention.flameSeen.v1';
/** This phone has shown the "come back tomorrow" card (per player): after that it shows only before gear or a milestone. */
const TOMORROW_SEEN_KEY = 'tps.retention.tomorrowSeen.v1';
/** The navy dim behind every loop card (the HUD and map recede). */
const LOOP_DIM = LOOP_DIM_LEVEL;
/**
 * The dim through a chest's handoff (handoffDim), on the handoff's UI-thread mark: it lifts for the prize flight and
 * comes back with the next chain card. Written once, by the exit, so nothing later can leave a card on a bright map.
 */
function dimForHandoff(mark: SharedValue<number>, nextOffset: number | null) {
  const steps = handoffDim(nextOffset, DURATION.exit, DURATION.enter).map((st, i) =>
    withDelayAfter(mark, st.after, withTiming(st.to, { duration: st.ms, easing: i === 0 ? EASE.in : EASE.out })));
  return steps.length === 1 ? steps[0] : withSequence(...steps);
}
/** How many Daily 3 chests this phone has opened (per player): after three, the chest plays its shorter repeat version. */
const CHEST_OPENS_KEY = 'tps.retention.chestOpens.v1';
/** When this phone last opened the map for this player (for the welcome back). */
const LAST_OPEN_KEY = 'tps.retention.lastOpen.v1';
/** The same last-open times kept in memory too, so a return to the app knows the days away at once (no storage read). */
const lastOpenMem = new Map<string, number>();

type View_ =
  | { k: 'sheet'; all?: boolean; freezeArrive?: number }
  /** enterAt: the card enters at this time (epoch ms, UI thread): mounted while the prizes still fly home. */
  /** slot 'B': the card was mounted early, hidden, in the second host and grows in the frame the last prize lands. */
  | { k: 'flame'; moment: Exclude<FlameMoment, { kind: 'none' }>; enterAt?: number; slot?: 'B' }
  | { k: 'tomorrow'; enterAt?: number; slot?: 'B' }
  | { k: 'reveal'; src: 'daily' | 'weekly' | 'level'; level?: number; claimDate?: string | null; rewards: PaidRewards | null; opening: boolean;
      auto?: boolean; state?: DailyThreeState | null; moment?: FlameMoment; repeat?: boolean; rare?: boolean;
      /**
       * The card enters at this time (epoch ms): mounted early while the check still flies, shown on the UI thread.
       * Null: armed (the full set's card is mounting, hidden; the check flies and this is set once it is mounted).
       */
      enterAt?: number | null }
  /** Between cards: the card steps aside and the prizes fly from their rows into the HUD where the kid can see them land. */
  | { k: 'flying'; legs: readonly FlightSpec[] }
  | { k: 'freeze' }
  | { k: 'freezeSaved'; days: number; streak: number }
  /** The streak ended: the flame settles into a warm ember, once. */
  | { k: 'ember'; was: number }
  /** Back after 3 or more days: Finn and what is new (real data only), once. */
  /** Cards null while today's goals are still being read (Finn says hello at once; the tiles drop in when known). */
  | { k: 'welcome'; cards: readonly WelcomeCard[] | null }
  | { k: 'push' };

export interface RetentionOptions {
  /** Signed in, on the map, onboarding done. */
  readonly enabled: boolean;
  readonly mapFocused: boolean;
  /** The welcome back may show (no find, ride, boss or tutorial up; the daily gift may still be waiting: it goes after). */
  readonly welcomeFree?: boolean;
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
  const { triggerFly, getTarget } = useCurrencyFly();
  const reducedMotion = useReducedGameMotion();
  const { width, height } = useWindowDimensions();
  useEffect(() => () => { if (armTimer.current) clearTimeout(armTimer.current); }, []);
  const [flags, setFlags] = useState<RetentionFlags | null>(null);
  const [daily, setDaily] = useState<DailyThreeState | null>(null);
  const [chests, setChests] = useState<readonly LevelChest[]>([]);
  const [view, setView] = useState<View_ | null>(null);
  const [busy, setBusy] = useState(false);
  const [landing, setLanding] = useState<CheckLanding | null>(null);
  const [celebrate, setCelebrate] = useState<string[]>([]);
  const [coach, setCoach] = useState(false);
  const lastRead = useRef(0);
  const seenInit = useRef<number | null>(null);
  const lastChestRead = useRef(-1);
  const prevGoals = useRef<DailyThreeState['goals'] | null>(null);
  const opening = useRef(false);
  /** The full set starts its claim when the third check lands, so the chest never waits on the server. */
  const claimAhead = useRef<Promise<{ rewards: PaidRewards; state: DailyThreeState }> | null>(null);
  const chainTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A level chest's claim starts when its card lands, so it opens on time (1.1 s) even on a slow server. */
  const levelAhead = useRef<{ level: number; p: Promise<{ rewards: PaidRewards }> } | null>(null);
  /** Daily 3 chests this phone has opened (the repeat version plays after three). */
  const chestOpens = useRef(0);
  useEffect(() => () => { if (chainTimer.current) clearTimeout(chainTimer.current); }, []);
  const mounted = useRef(true);
  const viewRef = useRef<View_ | null>(null);
  /** A Daily 3 claim whose answer was lost (slow connection): the claim date to open as soon as a read shows it. */
  const pendingDaily = useRef<string | null>(null);
  const readSeenRef = useRef<(() => Promise<number | null>) | null>(null);
  const writeSeenRef = useRef<((n: number) => void) | null>(null);
  /** A welcome back is waiting for the first fresh Daily 3 read after the app opened. */
  const welcomeWaiting = useRef(false);
  const refreshRef = useRef<((force?: boolean) => Promise<void>) | null>(null);
  const buttonBox = useRef<View>(null);
  /** The Daily 3 button's centre on screen (window points), kept fresh so the full-set card can grow out of it. */
  const buttonCenter = useRef<{ x: number; y: number } | null>(null);
  const fullSetRef = useRef<((at?: { readonly x: number; readonly y: number }, enterInMs?: number, state?: DailyThreeState | null, armed?: boolean) => void) | null>(null);
  /** The armed full set: the check's flight starts when the card has mounted (or after ARM_FALLBACK_MS). */
  const goFullSetRef = useRef<(() => void) | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedRef = useRef(false);
  // Dev readout for the lane tools (debug()).
  const presentRef = useRef(false);
  const frontRef = useRef(false);
  const cardTRef = useRef<{ value: number } | null>(null);
  viewRef.current = view;
  reducedRef.current = reducedMotion;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // Read the switches; a failed read (offline, slow server) is retried on the next map focus.
  useEffect(() => {
    // An all-off answer is checked again on the next focus (a read that raced sign-in, or a flag just turned on).
    if (!o.enabled || (flags && (flags.dailyThree || flags.levelChests))) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // A failed or all-off read (slow network at launch, a read that raced sign-in) tries again on its own while the map
    // is up: 15 s, then 30 s, then each minute, so Daily 3 never stays hidden for a whole session.
    let tries = 0;
    const attempt = () => {
      void loadRetentionFlags(undefined, player?.id ?? '', Date.now()).then(f => {
        if (!live || !mounted.current) return;
        if (f && !sameJson(f, flags)) setFlags(f);
        if (!f || (!f.dailyThree && !f.levelChests)) {
          tries += 1;
          timer = setTimeout(attempt, tries === 1 ? 15_000 : tries === 2 ? 30_000 : 60_000);
        }
      });
    };
    if (player?.id) attempt();
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [o.enabled, o.mapFocused, o.refreshKey, flags, player?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!player?.id) return;
    void AsyncStorage.getItem(`${CHEST_OPENS_KEY}:${player.id}`).then(v => { chestOpens.current = Number(v) || 0; }).catch(() => undefined);
  }, [player?.id]);
  const noteChestOpen = () => {
    chestOpens.current += 1;
    if (player?.id) void AsyncStorage.setItem(`${CHEST_OPENS_KEY}:${player.id}`, String(chestOpens.current)).catch(() => undefined);
  };

  // Warm the art once the features are on, so the first reveal never pops in: decoded into expo-image's memory cache
  // (every loop <Image> asks for memory-disk), so a card's chest and icons are drawn on its very first frame.
  useEffect(() => {
    if (!(flags?.dailyThree || flags?.levelChests)) return;
    void Asset.loadAsync(ART).catch(() => undefined)
      .then(() => Image.prefetch(artUrls(), 'memory-disk')).catch(() => undefined);
  }, [flags?.dailyThree, flags?.levelChests]);

  const applyDaily = useCallback((next: DailyThreeState) => {
    const fresh = newlyDone(prevGoals.current, next.goals);
    prevGoals.current = next.goals;
    // Identical answers never re-render the map.
    setDaily(prev => (prev && sameJson(prev, next) ? prev : next));
    // A Daily 3 chest whose claim answer was lost opens now, with exactly what the server paid.
    const lost = pendingDaily.current;
    if (lost && next.claimed_rewards && next.claimed_rewards.date === lost && !viewRef.current) {
      pendingDaily.current = null;
      const paid = next.claimed_rewards;
      void readSeenRef.current?.().then(seen => {
        const moment = flameMomentFor(seen, next.streak.days, next.streak.counted_today);
        if (next.streak.counted_today) writeSeenRef.current?.(next.streak.days);
        flameRef.current = moment.kind === 'milestone' ? moment : null;
        if (!viewRef.current) setView({ k: 'reveal', src: 'daily', claimDate: lost, rewards: paid, opening: false, state: next, moment });
      });
    }
    // A welcome back waits for a fresh read after the app opens (never yesterday's goals or flame).
    if (welcomeWaiting.current) { welcomeWaiting.current = false; setFreshDaily(n => n + 1); }
    if (fresh.length) {
      // The map button flies the check in (its own haptic and sound); a card that is open just updates.
      const index = next.goals.findIndex(g => g.key === fresh[fresh.length - 1]);
      setCelebrate(c => [...new Set([...c, ...fresh])]);
      if (!viewRef.current) {
        const done = doneCount(next.goals);
        if (done >= 3 && next.claimable && !reducedRef.current) {
          // The third goal: the chest card mounts first, hidden (mounting a whole card can hold the screen for a few
          // frames), and the check flies the moment it is mounted (the modal's onShow), so the flight never stutters;
          // the card then enters on the UI thread the moment the ring completes.
          setLanding(l => ({ index, done, key: (l?.key ?? 0) + 1, armed: true }));
          fullSetRef.current?.(buttonCenter.current ?? undefined, 0, next, true);
          if (armTimer.current) clearTimeout(armTimer.current);
          armTimer.current = setTimeout(() => goFullSetRef.current?.(), ARM_FALLBACK_MS);
        } else {
          setLanding(l => ({ index, done, key: (l?.key ?? 0) + 1 }));
          if (done >= 3 && next.claimable) fullSetRef.current?.(buttonCenter.current ?? undefined, CHECK.fly + CHECK.fullRing + 40, next);
        }
      }
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
      if (d && d.enabled) {
        applyDaily(d);
        // A phone that has never celebrated a flame starts from today's number (no fake celebration of an old streak).
        if (seenInit.current !== (player?.id ?? 0)) {
          seenInit.current = player?.id ?? 0;
          void readSeen().then(v => { if (v === null) writeSeen(d.streak.days); });
        }
      } else if (d) setDaily(null);
      if (c) {
        lastChestRead.current = level;
        const list = c.enabled ? c.chests : [];
        setChests(prev => (sameJson(prev, list) ? prev : list));
      }
    } catch {
      // Offline or a server without these routes: keep what we had, try again on the next focus.
    }
  }, [flags, applyDaily, level]);
  refreshRef.current = refresh;

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
  // The welcome back is checked once per app open (and again after the app comes back to the front).
  const welcomeChecked = useRef(false);
  const playerIdRef = useRef(player?.id);
  playerIdRef.current = player?.id;
  const enabledRef = useRef(o.enabled);
  enabledRef.current = o.enabled;
  const [welcomeDone, setWelcomeDone] = useState(false);
  const [reopen, setReopen] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', st => {
      if (st !== 'active') return;
      welcomeChecked.current = false; welcomeShown.current = false; awayDays.current = null; setWelcomeDone(false); setReopen(n => n + 1);
      // Back in the app: the days away are known at once from memory, so Finn can say hello in the same render.
      const id = playerIdRef.current;
      const last = id ? lastOpenMem.get(String(id)) : undefined;
      if (!id || last === undefined || !enabledRef.current) return;
      const away = daysAway(last, Date.now());
      lastOpenMem.set(String(id), Date.now());
      void AsyncStorage.setItem(`${LAST_OPEN_KEY}:${id}`, String(Date.now())).catch(() => undefined);
      awayDays.current = away;
      if (away >= WELCOME_FX.minDaysAway) {
        setWelcomePending(true);
        welcomeWaiting.current = true;
        lastRead.current = 0;
        void refreshRef.current?.(true);
      }
      setAwayKnown(n => n + 1);
    });
    return () => sub.remove();
  }, []);
  // How long since this phone last opened the map for this player, read at once (no server wait), so the
  // welcome can hold the map's tips and the daily gift until it has said hello.
  const awayDays = useRef<number | null>(null);
  const [welcomePending, setWelcomePending] = useState(false);
  const [awayKnown, setAwayKnown] = useState(0);
  const [freshDaily, setFreshDaily] = useState(0);
  /** Dev only: the frame graph over loop moments (lane tools turn it on). */
  const [perfOn, setPerfOn] = useState(loopPerfOn);
  useEffect(() => {
    if (!o.enabled || !player?.id || awayDays.current !== null) return;
    const key = `${LAST_OPEN_KEY}:${player.id}`;
    void AsyncStorage.getItem(key).then(v => {
      const away = daysAway(v ? Number(v) : null, Date.now());
      lastOpenMem.set(String(player.id), Date.now());
      void AsyncStorage.setItem(key, String(Date.now())).catch(() => undefined);
      if (!mounted.current) return;
      awayDays.current = away;
      if (away >= WELCOME_FX.minDaysAway) {
        setWelcomePending(true);
        welcomeWaiting.current = true;
        lastRead.current = 0;
        void refreshRef.current?.(true);
      }
      setAwayKnown(n => n + 1);
    }).catch(() => { awayDays.current = 0; setAwayKnown(n => n + 1); });
  }, [o.enabled, player?.id, reopen]); // eslint-disable-line react-hooks/exhaustive-deps
  // Never hold the map for long: if the goals never load, the tips and the gift go ahead after 15 s.
  useEffect(() => {
    if (!welcomePending) return;
    const t = setTimeout(() => setWelcomePending(false), 15000);
    return () => clearTimeout(t);
  }, [welcomePending]);
  useEffect(() => {
    if (!daily || !o.enabled || welcomeChecked.current || !player?.id || awayDays.current === null) return;
    if (awayDays.current >= WELCOME_FX.minDaysAway && welcomeWaiting.current) return;
    welcomeChecked.current = true;
    if (awayDays.current >= WELCOME_FX.minDaysAway) welcomeCards_.current = welcomeCards(daily, { levelChest: pendingChest?.level ?? null });
    if (!welcomeCards_.current?.length) setWelcomePending(false);
    setWelcomeDone(true);
  }, [daily, o.enabled, player?.id, awayKnown, freshDaily]); // eslint-disable-line react-hooks/exhaustive-deps
  const welcomeCards_ = useRef<WelcomeCard[] | null>(null);
  const welcomeFree = o.welcomeFree ?? o.screenFree;
  /** The welcome has said hello this app open. */
  const welcomeShown = useRef(false);
  // Back after a few days: Finn says hello the moment the map is free (never a held, still map while today's goals
  // load); the tiles drop in as soon as the fresh read lands.
  useEffect(() => {
    if (!welcomePending || welcomeShown.current || view || !welcomeFree || !o.mapFocused || !o.enabled) return;
    welcomeShown.current = true;
    const cards = welcomeDone ? welcomeCards_.current : null;
    if (welcomeDone) welcomeCards_.current = null;
    setView({ k: 'welcome', cards });
    setWelcomePending(false);
  }, [welcomePending, view, welcomeFree, o.mapFocused, o.enabled, welcomeDone]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!welcomeDone || view?.k !== 'welcome' || view.cards !== null) return;
    const cards = welcomeCards_.current ?? [];
    welcomeCards_.current = null;
    setView(v => (v && v.k === 'welcome' && v.cards === null ? { ...v, cards } : v));
  }, [welcomeDone, view]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Back after a few days: the welcome goes first, before the map's tips and the daily gift (they wait for it),
    // and tells the flame and the chest kindly, once.
    if (!view && !welcomeShown.current && welcomeFree && o.mapFocused && o.enabled && welcomeDone && welcomeCards_.current?.length) {
      const cards = welcomeCards_.current;
      const timer = setTimeout(() => {
        welcomeCards_.current = null;
        welcomeShown.current = true;
        setView(v => v ?? { k: 'welcome', cards });
        setWelcomePending(false);
      }, 200);
      return () => clearTimeout(timer);
    }
    // A welcome on its way goes first: the level chest, a saved flame or an ember wait for it (it tells them kindly).
    if (welcomePending) return;
    if (view || !o.screenFree || !o.mapFocused || !o.enabled) return;
    if (!welcomeDone) return;
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
    // A flame this phone celebrated has gone back to an ember (no freeze left): say it kindly, once.
    if (daily && daily.streak.days === 0 && !daily.streak.counted_today) {
      let live = true;
      const timer = setTimeout(() => {
        void readSeen().then(seen => {
          if (!live || !mounted.current || !seen || seen <= 0) return;
          writeSeen(0);
          setView(v => v ?? { k: 'ember', was: seen });
        });
      }, 700);
      return () => { live = false; clearTimeout(timer); };
    }
  }, [pendingChest?.level, freezeSaved, daily?.streak.days, view, o.screenFree, welcomeFree, o.mapFocused, o.enabled, welcomeDone, welcomePending]); // eslint-disable-line react-hooks/exhaustive-deps

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

  /** The streak number this phone last celebrated (null on a fresh install: no fake celebration). */
  const seenKey = `${FLAME_SEEN_KEY}:${player?.id ?? 0}`;
  const readSeen = async (): Promise<number | null> => {
    try { const v = await AsyncStorage.getItem(seenKey); return v === null ? null : Number(v) || 0; } catch { return null; }
  };
  const writeSeen = (n: number) => { void AsyncStorage.setItem(seenKey, String(n)).catch(() => undefined); };
  readSeenRef.current = readSeen;
  writeSeenRef.current = writeSeen;

  const tomorrowKey = `${TOMORROW_SEEN_KEY}:${player?.id ?? 0}`;
  const tomorrowSeen = useRef<boolean | null>(null);
  useEffect(() => {
    tomorrowSeen.current = null;
    void AsyncStorage.getItem(tomorrowKey).then(v => { tomorrowSeen.current = !!v; }).catch(() => undefined);
  }, [tomorrowKey]);

  /**
   * After a chest: the card and its ribbon shrink away together and every prize flies from its own row into its
   * HUD counter in plain sight (coins first, then tickets, then energy), bumping it on each landing. 300 ms after
   * the last landing the next card starts (for the Daily 3 chest: the big flame at 3, 7, 30, 100 and the tomorrow
   * card the first time, or before gear or a milestone). A normal day ends right here: one tap after the chest.
   * The HUD counters step up as the icons land (counterTicks); the balance is read back once the moment is over.
   */
  const finishReveal = (paid: PaidRewards | null, src: 'daily' | 'weekly' | 'level', state: DailyThreeState | null, moment: FlameMoment | undefined,
    origins: readonly PrizeOrigin[] = []) => {
    if (src === 'daily') noteChestOpen();
    const fallback = { x: width / 2, y: height * 0.45 };
    const rows = origins.length ? origins : paid ? paidRows(paid) : [];
    const plan = flightPlan(rows, t => !!getTarget(t));
    const legs: FlightSpec[] = [];
    for (const leg of plan) {
      const to = getTarget(leg.target);
      if (!to) continue;
      const row = origins.find(o => flightTarget(o.kind) === leg.target);
      legs.push({ ...leg, from: row ?? fallback, to });
    }
    // ONE render says everything React needs to know (the flight, and which card is up). The handoff itself (the chest
    // card leaving, the prizes flying, the next card growing in) starts on a UI-thread mark the frame after that render
    // is on screen, so the render's main-thread cost lands while the card still sits still under the kid's finger,
    // never mid-motion (a held main thread froze the card and made the simulator replay an old frame of it).
    const doneAt = Date.now() + HANDOFF_SLACK_MS + (reducedMotion ? 420 : flightDoneMs(plan));
    // The balance is read once the moment is over (the HUD counters already step up as each prize lands), so its
    // render never lands in the middle of the flight or the next card's entrance.
    playerReadDue.current = true;
    // The next card launches out of the Daily 3 button (where the flame lives), so the eye goes there with it.
    launchFrom.current = null;
    buttonBox.current?.measureInWindow((x, y, w, h) => {
      if (Number.isFinite(x) && w > 0) launchFrom.current = { x: x + w / 2 - width / 2, y: y + h / 2 - height / 2 };
    });
    handoffAt.value = NOT_YET;
    // The HUD numbers are told now (this same render mounts each new number hidden); they swap in on the UI thread
    // as every counter gets its first prize, so no render lands while the prizes fly or the next card grows in.
    counterTicks.prepare(legs, handoffAt, reducedMotion ? 160 : counterStepAt(legs.map(l => ({ landings: legLandings(l, PRIZE_FLIGHT.stepMs, PRIZE_FLIGHT.flyMs) }))));
    const pre = preNextRef.current;
    if (src === 'daily' && pre && !reducedMotion) {
      chainRef.current = preChainRef.current.slice(1);
      // One continuous moment, no still map between cards: the next card (mounted early, hidden, in the second host)
      // grows out of the Daily 3 button while the last prizes are still landing, after the HUD's one render.
      const nextOffset = chainNextAfter(plan, NEXT_OVERLAP_MS, NEXT_MIN_MS);
      handoff.current = { nextOffset };
      // A JS estimate for the tap guard (the real entrance is on the UI thread).
      nextAtRef.current = Date.now() + HANDOFF_SLACK_MS + nextOffset;
      enterBOnFlight.value = 0;
      outB.value = 0;
      enteredB.value = NOT_YET;
      cardB.value = withDelayAfter(handoffAt, nextOffset, withSpring(1, SPRING.settle));
      launchB.value = launchFrom.current ?? { x: 0, y: 0 };
      buttonBox.current?.measureInWindow((x, y, w, h) => {
        if (Number.isFinite(x) && w > 0) launchB.value = { x: x + w / 2 - width / 2, y: y + h / 2 - height / 2 };
      });
      setView(pre.step === 'flame' && flameRef.current ? { k: 'flame', moment: flameRef.current, slot: 'B' } : { k: 'tomorrow', slot: 'B' });
      setLegs(legs);
      if (pre.step === 'tomorrow') { tomorrowSeen.current = true; void AsyncStorage.setItem(tomorrowKey, '1').catch(() => undefined); }
      // The chest card that left is let go once the next card has fully played in (its own render then lands on a
      // still card, never in the flight or the entrance): its rays and wiggles stop instead of running hidden.
      if (aGoneTimer.current) clearTimeout(aGoneTimer.current);
      aGoneTimer.current = setTimeout(() => { aGoneTimer.current = null; if (mounted.current) setAGoneAt(Date.now()); },
        Math.max(0, nextAtRef.current + A_LET_GO_AFTER_MS - Date.now()));
      return;
    }
    handoff.current = { nextOffset: null };
    nextAtRef.current = 0;
    setView({ k: 'flying', legs });
    setLegs(legs);
    const next = async () => {
      chainTimer.current = null;
      if (src !== 'daily') void refresh(true);
      if (!mounted.current) return;
      let chain: ('flame' | 'tomorrow')[] = [];
      if (src === 'daily' && state) {
        // Read ahead when the map opened (no storage wait between the last landing and the next card).
        let seen = tomorrowSeen.current;
        if (seen === null) { try { seen = !!(await AsyncStorage.getItem(tomorrowKey)); } catch { seen = false; } }
        chain = dailyChain({ moment: moment ?? { kind: 'none' }, prize: tomorrowPrize(state), tomorrowSeen: seen,
          milestoneAway: state.streak.next_milestone?.days_away ?? null });
      }
      chainRef.current = chain;
      if (chain.length) { showChain(); return; }
      // Nothing more to show: the modal stays up until the prizes have landed.
      const wait = Math.max(0, doneAt - Date.now());
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      if (!mounted.current) return;
      // A freeze from the Weekly Box flies into its slot beside the flame.
      if (src === 'weekly' && paid && (paid.freezes ?? 0) > 0) { setView({ k: 'sheet', freezeArrive: paid.freezes }); return; }
      if (src !== 'daily' && await mayAskForPush()) { setView({ k: 'push' }); return; }
      if (src === 'daily' && mayAskAfterChain(chain) && await mayAskForPush()) { setView({ k: 'push' }); return; }
      setView(null);
    };
    // Not mounted ahead (a very quick tap): the next card mounts once the prizes have landed, so mounting it never
    // stutters the flight.
    chainTimer.current = setTimeout(() => { void next(); }, HANDOFF_SLACK_MS + (reducedMotion ? 420 : flightDoneMs(plan)));
  };

  /** The rest of the daily chain, one card at a time. */
  const chainRef = useRef<('flame' | 'tomorrow')[]>([]);
  const flameRef = useRef<Exclude<FlameMoment, { kind: 'none' }> | null>(null);
  const showChain = (enterAt?: number) => {
    const step = chainRef.current.shift();
    if (step === 'flame' && flameRef.current) { setView({ k: 'flame', moment: flameRef.current, enterAt }); return; }
    if (step === 'tomorrow') {
      tomorrowSeen.current = true;
      void AsyncStorage.setItem(tomorrowKey, '1').catch(() => undefined);
      setView({ k: 'tomorrow', enterAt }); return;
    }
    if (step === 'flame') { showChain(enterAt); return; }
    setView(null);
  };

  const afterFlame = () => { showChain(); };
  const afterTomorrow = () => { showChain(); };
  const afterFlameRef = useRef(afterFlame);
  afterFlameRef.current = afterFlame;
  const afterTomorrowRef = useRef(afterTomorrow);
  afterTomorrowRef.current = afterTomorrow;
  /**
   * The next card of the daily chain (the big flame, or tomorrow's card), mounted early and hidden in the second host
   * while the chest card is still up (after its prizes have landed, when nothing on screen is moving much).
   */
  const [preNext, setPreNext] = useState<{ step: 'flame' | 'tomorrow' } | null>(null);
  const preNextRef = useRef<{ step: 'flame' | 'tomorrow' } | null>(null);
  preNextRef.current = preNext;
  const preChainRef = useRef<('flame' | 'tomorrow')[]>([]);
  const revealKey = view?.k === 'reveal' && view.src === 'daily' && view.rewards && view.state ? `${view.claimDate ?? ''}` : '';
  useEffect(() => {
    if (!revealKey || reducedMotion || view?.k !== 'reveal' || !view.state) return;
    const st = view.state;
    const chain = dailyChain({ moment: view.moment ?? { kind: 'none' }, prize: tomorrowPrize(st), tomorrowSeen: !!tomorrowSeen.current,
      milestoneAway: st.streak.next_milestone?.days_away ?? null });
    if (!chain.length || (chain[0] === 'flame' && !flameRef.current)) return;
    preChainRef.current = chain;
    const t = setTimeout(() => {
      cardB.value = 0; outB.value = 0; enteredB.value = NOT_YET; enterBOnFlight.value = 0;
      setPreNext({ step: chain[0] });
    }, PREMOUNT_MS);
    return () => clearTimeout(t);
  }, [revealKey]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Prizes flying home from their rows (kept apart from the card, so the next card can mount while they fly). */
  const [legs, setLegs] = useState<readonly FlightSpec[] | null>(null);
  /** The flight's HUD step after a card left (epoch ms): the left card's content is unmounted in that same render. */
  const [aGoneAt, setAGoneAt] = useState(0);
  /** When the card host last started showing a card (epoch ms). */
  const aShownAt = useRef(0);
  const aGoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handoffTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { handoffTimers.current.forEach(clearTimeout); }, []);
  useEffect(() => () => { if (aGoneTimer.current) clearTimeout(aGoneTimer.current); }, []);
  /** The chest's handoff mark (epoch ms, UI thread): set the frame after the render that started it is on screen. */
  const handoffAt = useSharedValue(NOT_YET);
  /** A handoff the next exit starts (with the next chain card's offset, null when no card follows). */
  const handoff = useRef<{ nextOffset: number | null } | null>(null);
  /** When the next chain card enters (epoch ms, 0 when none is booked): the dim comes back on this mark. */
  const nextAtRef = useRef(0);
  /** A chest paid out: the balance is read once the moment is over (never mid-flight or mid-entrance). */
  const playerReadDue = useRef(false);

  /** A claim whose answer was lost: read back what the server paid for that exact chest. */
  const recoverPaid = async (src: 'daily' | 'weekly' | 'level', level_: number, claimDate: string | null | undefined, timeoutMs = 6000):
    Promise<{ rewards: PaidRewards; state?: DailyThreeState } | null> => {
    try {
      if (src === 'level') {
        const c = await getLevelChests(timeoutMs);
        const chest = c.enabled ? c.chests.find(x => x.level === level_) : undefined;
        if (c.enabled) setChests(c.chests);
        return chest?.opened && chest.rewards ? { rewards: chest.rewards } : null;
      }
      const d = await getDailyThree(timeoutMs);
      if (!d.enabled) return null;
      applyDaily(d);
      if (src === 'weekly') return d.week.claimed && d.week.claimed_rewards ? { rewards: d.week.claimed_rewards } : null;
      const last = d.claimed_rewards;
      // The read-back state drives the same flame row and next cards as a normal claim (never the fallback footer).
      return last && claimDate && last.date === claimDate ? { rewards: last, state: d } : null;
    } catch {
      return null;
    }
  };

  /** Resolves once the card has been in for ENTER_QUIET_MS (at once if it has not started entering, or is long in). */
  const quietAfterEntrance = async () => {
    if (reducedMotion) return;
    const e = enteredAt.value;
    if (e >= NOT_YET / 2) return;
    const wait = e + ENTER_QUIET_MS - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
  };

  const openReveal = async () => {
    if (!view || view.k !== 'reveal' || view.rewards || opening.current) return;
    opening.current = true;
    const current = view;
    // The full set's chest gathers by itself from the card's entrance: no extra render (and native commit) just to say
    // "opening" while the card may still be growing out of the button.
    if (!current.auto) setView({ ...current, opening: true });
    try {
      const seenP = current.src === 'daily' ? readSeen() : Promise.resolve(null);
      const ahead = current.src === 'daily' ? claimAhead.current : null;
      claimAhead.current = null;
      const ahead_ = levelAhead.current;
      const levelP = current.src === 'level' && ahead_ && ahead_.level === current.level ? ahead_.p : null;
      if (current.src === 'level') levelAhead.current = null;
      const result: { rewards: PaidRewards; state?: DailyThreeState } = current.src === 'daily' ? await (ahead ?? claimDailyThree())
        : current.src === 'weekly' ? await claimWeeklyBox()
        : await (levelP ?? openLevelChest(current.level ?? 0));
      // The flame moment comes from the claim's own answer (no second read before the next card).
      let moment: FlameMoment | undefined;
      if (current.src === 'daily' && result.state) {
        moment = flameMomentFor(await seenP, result.state.streak.days, result.state.streak.counted_today);
        if (result.state.streak.counted_today) writeSeen(result.state.streak.days);
        flameRef.current = moment.kind === 'milestone' ? moment : null;
      }
      // The answer goes straight to the card: the chest keeps its own lid beat on the UI thread (gatherMs),
      // so a fast server never cuts the shake short and a busy JS thread never adds a second wait.
      // One exception: an answer that lands while the full set's card is still growing out of the button waits
      // until the card is in (ENTER_QUIET_MS, well before the lid's beat). Mounting the prize rows is the biggest
      // native commit of the moment; mid-entrance it held the main thread for about 250 ms (a frozen card on a
      // phone, and a card that seemed to vanish and pop back on the simulator).
      if (current.auto) await quietAfterEntrance();
      if (mounted.current) setView({ ...current, opening: false, rewards: result.rewards, state: result.state ?? null, moment });
      if (result.state?.goals) applyDaily(result.state);
      if (current.src === 'level') setChests(cs => cs.map(c => (c.level === current.level ? { ...c, opened: true, rewards: result.rewards } : c)));
    } catch {
      // The claim may still be committing: read back up to 3 times, 1.5 s apart (the card says "Still opening...").
      let paid: { rewards: PaidRewards; state?: DailyThreeState } | null = null;
      const giveUp = Date.now() + 12000; // never more than ~12 s of "Still opening..."
      for (let i = 0; i < 3 && !paid && mounted.current && Date.now() < giveUp; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 1500));
        const left = giveUp - Date.now();
        if (left < 1000) break;
        paid = await recoverPaid(current.src, current.level ?? 0, current.claimDate, Math.min(6000, left));
      }
      if (!mounted.current) return;
      if (paid) {
        let moment: FlameMoment | undefined;
        if (current.src === 'daily' && paid.state) {
          moment = flameMomentFor(await readSeen(), paid.state.streak.days, paid.state.streak.counted_today);
          if (paid.state.streak.counted_today) writeSeen(paid.state.streak.days);
          flameRef.current = moment.kind === 'milestone' ? moment : null;
        }
        setView({ ...current, opening: false, rewards: paid.rewards, state: paid.state ?? null, moment });
        return;
      }
      setView(null);
      if (current.src === 'daily' && current.claimDate) {
        // A slow connection: the chest opens by itself as soon as the next read shows what was paid (never a lost show).
        pendingDaily.current = current.claimDate;
        void refresh(true);
        gameAlert('Almost there!', 'Your chest is safe. It opens as soon as your phone catches up.');
        return;
      }
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

  // The third check landed on the map: open the card in full-set mode (checks bounce, ribbon stamps, chest opens by itself).
  const onFullSet = (at?: { readonly x: number; readonly y: number }, enterInMs = 0, state: DailyThreeState | null = daily, armed = false) => {
    const daily = state;
    if (viewRef.current || !daily?.claimable) return;
    viewRef.current = { k: 'reveal', src: 'daily', rewards: null, opening: false };
    // The card grows out of the Daily 3 button while its ring still glows.
    launchFrom.current = at ? { x: at.x - width / 2, y: at.y - height / 2 } : null;
    // Start the claim now: by the chest beat (900 ms later) the server has usually answered, so the lid never waits.
    claimAhead.current = claimDailyThree();
    claimAhead.current.catch(() => undefined);
    // Straight into the chest card (one card, no sheet in between): the checks bounce, dive in, the lid pops.
    setCelebrate([]);
    setView({ k: 'reveal', src: 'daily', claimDate: daily.claimable_date, rewards: null, opening: false, auto: true,
      enterAt: reducedMotion ? undefined : armed ? null : Date.now() + enterInMs, ...dailyFlavor(daily.claimable_date) });
  };
  fullSetRef.current = onFullSet;
  // The armed card is mounted: the check flies now and the card enters as the ring completes.
  goFullSetRef.current = () => {
    if (armTimer.current) { clearTimeout(armTimer.current); armTimer.current = null; }
    const v = viewRef.current;
    if (!v || v.k !== 'reveal' || v.enterAt !== null) return;
    // The check flies now; the card enters on the UI thread the frame the ring completes (the button writes
    // ringDone). If the ring is ever cut short (the map was covered), the card still comes in.
    setLanding(l => (l && l.armed ? { ...l, armed: false } : l));
    if (armTimer.current) clearTimeout(armTimer.current);
    armTimer.current = setTimeout(() => { if (enteredAt.value >= NOT_YET / 2) ringDone.value = Date.now(); }, CHECK.fly + CHECK.fullRing + 900);
  };
  /** The repeat version after three chests on this phone, and about one rare chest in ten (stable per claim date). */
  const dailyFlavor = (claimDate: string | null | undefined) => ({
    repeat: isRepeatChest(chestOpens.current), rare: isRareChest(claimDate, player?.id ?? 0),
  });

  // Dev only: drive the loop moments from the lane tools (CDP) on the live scratch data.
  useEffect(() => {
    if (!__DEV__) return;
    (globalThis as Record<string, unknown>).__tpsLoops = {
      refresh: () => { lastRead.current = 0; void refresh(true); },
      refreshPlayer: () => { void refreshPlayer?.(); },
      land: (index: number, done: number) => setLanding(l => ({ index, done, key: (l?.key ?? 0) + 1 })),
      flame: (days: number, from?: number) => setView({ k: 'flame', moment: flameMomentFor(from ?? days - 1, days, true) as Exclude<FlameMoment, { kind: 'none' }> }),
      tomorrow: () => setView({ k: 'tomorrow' }),
      saved: (streak: number, days = 1) => setView({ k: 'freezeSaved', streak, days }),
      ember: (was: number) => setView({ k: 'ember', was }),
      welcome: () => { if (daily) setView({ k: 'welcome', cards: welcomeCards(daily, { levelChest: pendingChest?.level ?? null }) }); },
      perf: (on: boolean) => { (globalThis as Record<string, unknown>).__loopsPerfOn = !!on; setPerfOn(!!on); },
      setLastOpen: (daysAgo: number) => {
        if (!player?.id) return;
        lastOpenMem.set(String(player.id), Date.now() - daysAgo * 86400000);
        void AsyncStorage.setItem(`${LAST_OPEN_KEY}:${player.id}`, String(Date.now() - daysAgo * 86400000));
      },
      freezeIn: (n = 1) => setView({ k: 'sheet', freezeArrive: n }),
      sheet: (all?: boolean) => setView({ k: 'sheet', all: !!all }),
      forgetFlame: () => { void AsyncStorage.removeItem(seenKey); },
      setSeen: (n: number) => writeSeen(n),
      debug: () => ({ enabled: o.enabled, focused: o.mapFocused, flags, daily: daily ? { done: doneCount(daily.goals), streak: daily.streak.days } : null,
        view: view?.k ?? null, present: presentRef.current, front: frontRef.current, cardT: cardTRef.current?.value ?? null }),
      reloadFlags: () => { void loadRetentionFlags(undefined, player?.id ?? '', Date.now() + 120_000).then(f => { if (mounted.current && f) setFlags(f); }); },
    };
  });

  const close = () => {
    // The full set flows into its chest by itself (its claim is already on the way): nothing closes it midway.
    if (view?.k === 'sheet' && view.all) return;
    if (view?.k === 'sheet') setCelebrate([]);
    if (view?.k === 'push') void notePushAsked();
    if (view?.k === 'freezeSaved' || (view?.k === 'welcome' && !!view.cards?.some(c => c.kind === 'saved'))) {
      void markFreezeSeen().then(r => applyDaily(r.state)).catch(() => undefined);
    }
    // The welcome already told an ended flame kindly: no second ember card.
    if (view?.k === 'welcome' && view.cards?.some(c => c.kind === 'ember')) writeSeen(0);
    setView(null);
  };

  // The modal stays up through a card's exit and the prize flight (the map shows through), then closes.
  // The modal lingers only while the last card leaves (no extra map render when a card opens).
  const [present, setPresent] = useState(false);
  const wasUp = useRef(false);
  if (view) wasUp.current = true;
  const lingering = !view && wasUp.current;
  const visible = !!view || present || lingering;
  const front = useModalLayer(visible, 'wait');
  const showing = !!view && view.k !== 'flying' && !((view.k === 'flame' || view.k === 'tomorrow') && view.slot === 'B') && front;
  presentRef.current = present; frontRef.current = front;
  const dim = useSharedValue(0);
  const cardT = useSharedValue(0);
  /** The exit: the card fades and settles back a touch (0.96) while the prizes lift off its rows. */
  const out = useSharedValue(0);
  cardTRef.current = cardT;
  const cardUp = useRef(false);
  /** Where the next card launches from (relative to the screen centre), set while the prizes fly home. */
  const launchFrom = useRef<{ x: number; y: number } | null>(null);
  /** The goals as they were when the chest card opened (its preview and size stay put through the claim). */
  const revealDaily = useRef<DailyThreeState | null>(null);
  const launch = useSharedValue({ x: 0, y: 0 });
  /** When the card really started entering (epoch ms, UI thread): every beat on the card waits for it. */
  const enteredAt = useSharedValue(NOT_YET);
  /** The Daily 3 ring's third segment completed (epoch ms, written on the UI thread by the map button). */
  const ringDone = useSharedValue(0);
  /** The armed full-set card enters on the next ringDone. */
  const enterOnRing = useSharedValue(0);
  /** The second host (the next card, mounted early): its own entrance, exit, launch point and entrance mark. */
  const cardB = useSharedValue(0);
  const outB = useSharedValue(0);
  const launchB = useSharedValue({ x: 0, y: 0 });
  const enteredB = useSharedValue(NOT_YET);
  const enterBOnFlight = useSharedValue(0);
  /** The last prize landed in the HUD (epoch ms, UI thread). */
  const flightLanded = useSharedValue(0);
  /** An armed full-set card (mounting, hidden) has no entrance mark yet. */
  const enterMark = view?.k === 'reveal' || view?.k === 'flame' || view?.k === 'tomorrow' ? view.enterAt : undefined;
  const armed = enterMark === null;
  // A layout effect: the entrance is scheduled in the same JS task as the commit that mounted the card (never a
  // passive-effect hop later), on an absolute mark, so a busy JS thread never shifts it against the card's own beats.
  useLayoutEffect(() => {
    if (showing) {
      if (!cardUp.current) {
        cardUp.current = true;
        aShownAt.current = Date.now();
        launch.value = !reducedMotion && launchFrom.current ? launchFrom.current : { x: 0, y: 0 };
        launchFrom.current = null;
        out.value = 0;
        cardT.value = 0;
        enteredAt.value = NOT_YET;
        if (armed && !reducedMotion) {
          // The full set: mounted now, hidden; it grows out of the button the frame its ring completes (UI thread).
          enterOnRing.value = 1;
          return;
        }
        // An absolute mark read on the UI thread (the card's own beats count from the same mark).
        const at = typeof enterMark === 'number' ? Math.max(enterMark, Date.now()) : Date.now();
        enteredAt.value = at;
        cardT.value = reducedMotion ? withTiming(1, { duration: DURATION.quick }) : withDelayUntil(at, withSpring(1, SPRING.settle));
        dim.value = withDelayUntil(at, withTiming(LOOP_DIM, { duration: DURATION.enter, easing: EASE.out }));
      }
      return;
    }
    enterOnRing.value = 0;
    if (cardUp.current) {
      // Exits are faster than entrances: the card fades and settles back a touch while the prizes lift off its rows
      // (the eye follows the prizes to the HUD), then the map comes back into view.
      cardUp.current = false;
      const h = handoff.current;
      handoff.current = null;
      if (h) {
        // A chest's handoff: the card leaves, the dim lifts (and comes back with the next card) on the handoff mark.
        out.value = withDelayAfter(handoffAt, 0, withTiming(1, { duration: reducedMotion ? DURATION.quick : PRIZE_FLIGHT.exitMs, easing: EASE.in }));
        dim.value = dimForHandoff(handoffAt, h.nextOffset);
        const off = h.nextOffset;
        // The mark: the frame after this render is on screen (a UI-thread job queued behind its mount, then one frame).
        runOnUI(() => {
          'worklet';
          requestAnimationFrame(() => {
            const now = Date.now();
            if (off !== null) enteredB.value = now + off;
            handoffAt.value = now;
          });
        })();
        // Never a stuck card: if the mark is somehow not set, the handoff starts anyway.
        const late = setTimeout(() => {
          runOnUI(() => {
            'worklet';
            if (handoffAt.value < NOT_YET / 2) return;
            const now = Date.now();
            if (off !== null) enteredB.value = now + off;
            handoffAt.value = now;
          })();
        }, HANDOFF_SLACK_MS * 3);
        handoffTimers.current.push(late);
      } else {
        out.value = withTiming(1, { duration: reducedMotion ? DURATION.quick : PRIZE_FLIGHT.exitMs, easing: EASE.in });
        dim.value = withTiming(0, { duration: DURATION.exit, easing: EASE.in });
      }
    }
    if (!view && wasUp.current) {
      // Keep the modal up through the exit, then let it go (one render to close, none to open).
      setPresent(true);
      const t = setTimeout(() => { if (!viewRef.current) { wasUp.current = false; setPresent(false); } }, DURATION.exit + 40);
      return () => clearTimeout(t);
    }
  }, [showing, !!view]); // eslint-disable-line react-hooks/exhaustive-deps
  // A card swapped in place (the sheet to its chest, one chain card to the next): it enters now.
  const cardKey = view ? `${view.k}:${view.k === 'reveal' ? `${view.src}:${view.level ?? ''}:${view.claimDate ?? ''}` : ''}` : '';
  const lastKey = useRef('');
  useLayoutEffect(() => {
    const prev = lastKey.current;
    lastKey.current = cardKey;
    if (!cardKey || !prev || prev === cardKey || !cardUp.current || enterOnRing.value === 1) return;
    enteredAt.value = Date.now();
  }, [cardKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // The last prize landed: the next card (already mounted in the second host) grows out of the Daily 3 button.
  useAnimatedReaction(() => flightLanded.value, (v, p) => {
    if (v === p || v <= 0 || enterBOnFlight.value !== 1) return;
    enterBOnFlight.value = 0;
    const at = v + PRIZE_FLIGHT.nextAfterMs;
    enteredB.value = at;
    outB.value = 0;
    cardB.value = withDelayUntil(at, withSpring(1, SPRING.settle));
    dim.value = withDelayUntil(at, withTiming(LOOP_DIM, { duration: DURATION.enter, easing: EASE.out }));
  });
  // The second host's card leaves when its moment is done (faster than it came); the dim goes if nothing follows.
  const slotB = (view?.k === 'flame' || view?.k === 'tomorrow') && view.slot === 'B';
  const wasSlotB = useRef(false);
  useLayoutEffect(() => {
    if (slotB) { wasSlotB.current = true; return; }
    if (!wasSlotB.current) return;
    wasSlotB.current = false;
    nextAtRef.current = 0;
    outB.value = withTiming(1, { duration: reducedMotion ? DURATION.quick : PRIZE_FLIGHT.exitMs, easing: EASE.in });
    if (!view) dim.value = withTiming(0, { duration: DURATION.exit, easing: EASE.in });
    const t = setTimeout(() => setPreNext(null), PRIZE_FLIGHT.exitMs + 80);
    return () => clearTimeout(t);
  }, [slotB]); // eslint-disable-line react-hooks/exhaustive-deps
  // A chest closed without its chain (or the overlay went away): the hidden card is let go.
  useEffect(() => { if (!view && preNext && !slotB) { const t = setTimeout(() => setPreNext(null), 300); return () => clearTimeout(t); } }, [!!view]); // eslint-disable-line react-hooks/exhaustive-deps
  const nextStyle = useAnimatedStyle(() => {
    const t = cardB.value;
    const o = outB.value;
    const far = launchB.value.x !== 0 || launchB.value.y !== 0;
    return { opacity: Math.min(1, t * (far ? 3 : 1.6)) * (1 - o), transform: [{ translateX: launchB.value.x * (1 - t) }, { translateY: launchB.value.y * (1 - t) },
      { scale: (far ? 0.15 + 0.85 * t : 0.86 + 0.14 * t) * (1 - 0.04 * o) }] };
  });
  const nextLayer = useMemo(() => [stageStyles.wrap, nextStyle], [nextStyle]);
  // The ring completed on the map: the armed card grows out of the button now, on the UI thread (no JS hop).
  useAnimatedReaction(() => ringDone.value, (v, p) => {
    if (v === p || v <= 0 || enterOnRing.value !== 1) return;
    enterOnRing.value = 0;
    enteredAt.value = v;
    cardT.value = withSpring(1, SPRING.settle);
    dim.value = withTiming(LOOP_DIM, { duration: DURATION.enter, easing: EASE.out });
  });
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));
  const dimLayer = useMemo(() => [StyleSheet.absoluteFill, stageStyles.dim, dimStyle], [dimStyle]);
  const cardStyle = useAnimatedStyle(() => {
    const t = cardT.value;
    const o = out.value;
    const far = launch.value.x !== 0 || launch.value.y !== 0;
    // From the button: it grows out of it on the settle spring; otherwise a plain pop-in. The exit fades and settles to 0.96.
    return { opacity: Math.min(1, t * (far ? 3 : 1.6)) * (1 - o), transform: [{ translateX: launch.value.x * (1 - t) }, { translateY: launch.value.y * (1 - t) },
      { scale: (far ? 0.15 + 0.85 * t : 0.86 + 0.14 * t) * (1 - 0.04 * o) }] };
  });
  const cardLayer = useMemo(() => [stageStyles.wrap, cardStyle], [cardStyle]);
  const stage = useMemo(() => createStageStore(), []);
  const backdropRef = useRef<() => void>(() => undefined);
  const onBackdrop = useCallback(() => backdropRef.current(), []);

  let button: ReactNode | null = null;
  if (flags?.dailyThree && daily) {
    const b = buttonState(daily, new Date().getHours());
    button = (
      <View ref={buttonBox} collapsable={false} onLayout={() => {
        buttonBox.current?.measureInWindow((x, y, w, h) => { if (Number.isFinite(x) && w > 0) buttonCenter.current = { x: x + w / 2, y: y + h / 2 }; });
      }}>
      {/* Release-like perf captures only (never in store builds): the same frame graph over the idle map. */}
      {LOOPS_PERF_CAPTURE && !visible && <LoopPerf style={loopPerfMapStyle} />}
      <Daily3MapButton ringDone={ringDone} pips={b.pips} streak={b.streak} attention={b.attention}
        active={o.mapFocused && !o.mapCovered && !visible} reducedMotion={reducedMotion} landing={landing} onFullSet={onFullSet}
        onPress={() => { playSfx('ui.tap'); openSheet(); }} />
      </View>
    );
  }

  const xpNow = player?.experience ?? 0;
  const xpNeed = player?.experience_level?.experience ?? 0;
  // When the next level is far off (Level 7+ takes weeks), lead with the nearer streak prize.
  const farLevel = xpNeed > 0 && xpNow / xpNeed < 0.5 && lvOf(player) >= 6;
  const nextLevel = (lv: number) => (
    <View style={styles.nextBlock}>
      <View style={styles.nextRow}>
        <Image cachePolicy="memory-disk" source={LEVEL_CHEST} style={{ width: 30, height: 30 }} contentFit="contain" />
        <Text style={styles.nextText}>{farLevel && daily?.streak.next_milestone
          ? `Next prize: ${daily.streak.next_milestone.label.toLowerCase()} on Day ${daily.streak.next_milestone.day}`
          : `Next: Level ${lv + 1} chest with new gear`}</Text>
      </View>
      {xpNeed > 0 && <XpBar pct={Math.min(1, xpNow / xpNeed)} reducedMotion={reducedMotion} />}
    </View>
  );

  let title = 'Daily 3';
  let content: ReactNode = null;
  if (view?.k !== 'reveal') revealDaily.current = null;
  const [allRibbon, setAllRibbon] = useState(false);
  const fullSetSheet = view?.k === 'sheet' && !!view.all;
  useEffect(() => {
    if (!fullSetSheet) { setAllRibbon(false); return; }
    const t = setTimeout(() => setAllRibbon(true), reducedMotion ? 0 : 700);
    return () => clearTimeout(t);
  }, [fullSetSheet, reducedMotion]);
  if (view?.k === 'sheet' && daily) {
    if (allRibbon) title = 'All 3 done!';
    content = (
      <Daily3Sheet state={daily} now={Date.now()} busy={busy} coins={player?.coins ?? 0} celebrate={celebrate}
        celebrateAll={!!view.all} freezeArrive={view.freezeArrive ?? 0} onAutoClaim={() => {
          if (!daily.claimable) return;
          setCelebrate([]);
          setView({ k: 'reveal', src: 'daily', claimDate: daily.claimable_date, rewards: null, opening: false, auto: true, ...dailyFlavor(daily.claimable_date) });
        }}
        reducedMotion={reducedMotion} onClose={close} onGoal={onGoal} coach={coach} onCoachDone={coachDone}
        onReminders={on => { void toggleReminders(on); }}
        onClaim={() => setView({ k: 'reveal', src: 'daily', claimDate: daily.claimable_date, rewards: null, opening: false, ...dailyFlavor(daily.claimable_date) })}
        onClaimWeekly={() => setView({ k: 'reveal', src: 'weekly', rewards: null, opening: false })}
        onBuyFreeze={() => setView({ k: 'freeze' })} />
    );
  } else if (view?.k === 'reveal') {
    const r = view;
    // The preview and card size come from the goals as they were when the card opened (the claim's answer
    // changes the preview to tomorrow's, which must never resize the chest or swap the chips mid-gather).
    if (!revealDaily.current) revealDaily.current = daily;
    const dSnap = revealDaily.current ?? daily;
    const levelPreview = r.src === 'level' ? chests.find(c => c.level === r.level)?.preview ?? null : null;
    title = r.src === 'level' ? `Level ${r.level}!` : r.src === 'weekly' ? 'Weekly Box' : r.auto ? 'All 3 done!' : 'Daily 3 done!';
    const footer = r.src === 'level' ? nextLevel(r.level ?? 1)
      : r.src === 'weekly' ? (
        <View style={styles.nextRow}>
          <Image cachePolicy="memory-disk" source={WEEKLY} style={{ width: 28, height: 28 }} contentFit="contain" />
          <Text style={styles.nextText}>Next box: 5 flames next week</Text>
          <View style={styles.pips}>{[0, 1, 2, 3, 4].map(i => <View key={i} style={[styles.pip, i < 5 && styles.pipLit]} />)}</View>
        </View>
      )
      : r.state ? (
        <FlameUpRow from={r.moment && r.moment.kind !== 'none' ? Math.max(0, r.state.streak.days - 1) : r.state.streak.days}
          to={r.state.streak.days} grow={!!r.moment && r.moment.kind !== 'none'} reducedMotion={reducedMotion}
          prize={tomorrowPrize(r.state).kind} />
      ) : daily ? (
        <View style={styles.nextRow}>
          <GameIcon name="streak" size={26} />
          <Text style={styles.nextText}>{tomorrowLine(daily)}</Text>
        </View>
      ) : null;
    content = (
      <RewardReveal reducedMotion={reducedMotion} rewards={r.rewards} opening={r.opening} footer={footer} dropIn={r.src === 'level'}
        subtitle={r.src === 'level' ? `You reached Level ${r.level}! Tap your chest.`
          : r.src === 'weekly' ? 'A whole week of flames. Tap the box!' : r.auto ? 'All three goals done!' : 'All three goals done. Tap your chest!'}
        closedArt={r.src === 'level' ? LEVEL_CHEST : r.src === 'weekly' ? WEEKLY : ICON_SOURCES.chest}
        openArt={r.src === 'level' ? LEVEL_CHEST_OPEN : r.src === 'weekly' ? WEEKLY_OPEN : ICON_SOURCES.chestOpen}
        autoOpen={!!r.auto} fullSet={!!r.auto} repeat={!!r.repeat} rare={!!r.rare}
        entered={enteredAt}
        gatherMs={lidDelay({ dropIn: r.src === 'level', autoOpen: !!r.auto, repeat: !!r.repeat, weekly: r.src === 'weekly' })}
        onArrive={r.src === 'level' ? () => {
          // The level chest's claim starts as it lands, so its lid pops on the beat even on a slow server.
          if (r.level && !levelAhead.current) {
            const p = openLevelChest(r.level);
            p.catch(() => { if (levelAhead.current?.p === p) levelAhead.current = null; });
            levelAhead.current = { level: r.level, p };
          }
        } : undefined}
        expectRows={r.src === 'daily' && dSnap ? dailyRowCount(dSnap) : levelPreview ? levelRowCount(levelPreview) : undefined}
        preview={r.src === 'daily' && dSnap ? <DailyPreview state={dSnap} /> : levelPreview ? <LevelPreview p={levelPreview} /> : undefined}
        onWear={() => { if (r.rewards) fly(r.rewards); void refreshPlayer?.(); setView(null); RootNavigation.navigate('Inventory'); }}
        onPins={() => { if (r.rewards) fly(r.rewards); void refreshPlayer?.(); setView(null); RootNavigation.navigate('PinCollections'); }}
        onOpen={() => { void openReveal(); }} onDone={origins => finishReveal(r.rewards, r.src, r.state ?? null, r.moment, origins)} />
    );
  } else if (view?.k === 'flame' && view.slot === 'B') {
    title = view.moment.kind === 'milestone' ? 'Big flame!' : 'Flame up!';
  } else if (view?.k === 'tomorrow' && view.slot === 'B') {
    title = 'See you tomorrow';
  } else if (view?.k === 'flame') {
    title = view.moment.kind === 'milestone' ? 'Big flame!' : 'Flame up!';
    content = <StreakMoment key={JSON.stringify(view.moment)} moment={view.moment} reducedMotion={reducedMotion} onDone={afterFlame}
      prize={tomorrowPrize(daily).kind} startAt={view.enterAt} />;
  } else if (view?.k === 'tomorrow') {
    title = 'See you tomorrow';
    content = <TomorrowCard prize={tomorrowPrize(daily)} reducedMotion={reducedMotion} onDone={afterTomorrow} startAt={view.enterAt} />;
  } else if (view?.k === 'freeze' && daily) {
    title = 'Streak Freeze';
    content = (
      <View style={styles.card}>
        <CardSurface />
        <Image cachePolicy="memory-disk" source={FREEZE} style={styles.bigArt} contentFit="contain" />
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
    content = <FreezeSavedCard streak={view.streak} days={view.days} reducedMotion={reducedMotion} onDone={close} />;
  } else if (view?.k === 'welcome') {
    title = 'Welcome back!';
    // Mounted only while it is really in front, so its entrance plays when the kid can see it (never behind another layer).
    content = front ? <WelcomeBack cards={view.cards} reducedMotion={reducedMotion} onDone={close} /> : null;
  } else if (view?.k === 'ember') {
    title = 'New day!';
    content = <EmberCard was={view.was} reducedMotion={reducedMotion} onDone={close} />;
  } else if (view?.k === 'push') {
    title = 'Reminders';
    content = (
      <View style={styles.card}>
        <CardSurface />
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

  // Moments that must finish (a chest mid-open, the flame) ignore backdrop taps; their button moves on.
  const revealing = view?.k === 'reveal' || view?.k === 'flame' || view?.k === 'flying' || (view?.k === 'sheet' && !!view.all);
  // The last card stays mounted (same title, same content) while it fades away, so the ribbon never shows
  // another word and the card never vanishes in one frame.
  const lastCard = useRef<{ title: string; content: ReactNode } | null>(null);
  if (content && view && view.k !== 'flying') lastCard.current = { title, content };
  const shownTitle = showing || !lastCard.current ? title : lastCard.current.title;
  // A card that has left (its exit is long done by the flight's HUD step) is let go: its rays, wiggles and sparkles
  // stop instead of running hidden under the next card, and every later render has less to walk.
  const hostAGone = !showing && aGoneAt > aShownAt.current;
  const shownContent = showing ? content : hostAGone ? null : lastCard.current?.content ?? null;
  if (!view && !present && !lingering) lastCard.current = null;
  backdropRef.current = () => { if (!revealing && (showing || slotB)) close(); };
  /**
   * The next card takes taps from AWESOME on (no render to switch them on), so a tap on it counts only once it has
   * really grown in: a quick second tap on AWESOME never skips a card the kid has not seen yet.
   */
  const bIsIn = () => nextAtRef.current === 0 || Date.now() >= nextAtRef.current + B_TAPS_AFTER_MS;
  // The balance read after a chest waits until the moment is over (the counters already stepped up as prizes landed).
  useEffect(() => {
    if (!playerReadDue.current || (view && view.k !== 'sheet' && view.k !== 'push')) return;
    playerReadDue.current = false;
    void Promise.resolve(refreshPlayer?.()).catch(() => undefined);
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  // The second host's card: built once per pre-mount (same element while it waits, enters and plays).
  const nextKind = preNext?.step ?? null;
  const nextMoment = flameRef.current;
  const nextCard = useMemo(() => {
    if (!nextKind) return null;
    if (nextKind === 'flame' && nextMoment) {
      return { title: nextMoment.kind === 'milestone' ? 'Big flame!' : 'Flame up!', live: false,
        content: <StreakMoment key={`B:${JSON.stringify(nextMoment)}`} moment={nextMoment} reducedMotion={reducedMotion}
          onDone={() => { if (bIsIn()) afterFlameRef.current(); }} prize={tomorrowPrize(daily).kind} entered={enteredB} /> };
    }
    return { title: 'See you tomorrow', live: false,
      content: <TomorrowCard prize={tomorrowPrize(daily)} reducedMotion={reducedMotion} onDone={() => { if (bIsIn()) afterTomorrowRef.current(); }} entered={enteredB} /> };
  }, [nextKind]); // eslint-disable-line react-hooks/exhaustive-deps
  const nextLive = useMemo(() => (nextCard ? { ...nextCard, live: slotB } : null), [nextCard, slotB]);
  const stageState: StageState = {
    title: shownTitle, content: shownContent, showing, closable: !revealing && showing, reducedMotion,
    // The flight layer shows only while the prizes fly (no extra render to take it down afterwards).
    legs: view?.k === 'flying' || slotB ? legs : null, landed: flightLanded, flightMark: handoffAt, perf: perfOn,
    next: nextLive,
  };
  // The card host never re-renders: what it shows goes through the stage store, in the same commit (layout effect).
  useLayoutEffect(() => { stage.set(stageState); });
  const overlay = (
    // A plain RN Modal: visible is declarative (no inner open/close state machine that can miss a quick re-open);
    // every entrance and exit is our own UI-thread animation inside it. onShow: an armed full-set card has mounted.
    <Modal visible={visible && front} transparent animationType="none" statusBarTranslucent
      onShow={() => goFullSetRef.current?.()}
      onRequestClose={revealing ? () => undefined : close}>
      <LoopStage store={stage} dimStyle={dimLayer} cardStyle={cardLayer} nextStyle={nextLayer} gutter={width * 0.05} onBackdrop={onBackdrop} />
    </Modal>
  );

  // A welcome on its way holds the map's tips and the daily gift too (it goes first).
  return { button, overlay, occluding: visible || welcomePending };
}

/** How many prize rows the Daily 3 chest will show (the server's preview), so its card fits them with no empty space. */
function dailyRowCount(d: DailyThreeState): { small: number; big: number } {
  const r = d.reward;
  const m = d.claimable_milestone;
  // A streak milestone day pays gear even when the preview has not said so yet: keep a hero slot for it.
  const milestoneDay = d.streak.counted_today && (STREAK_MILESTONES as readonly number[]).includes(d.streak.days);
  const gear = m?.gear || (!m && milestoneDay) ? 1 : 0;
  return { small: [r.coins, r.tickets, r.energy, r.xp].filter(n => n > 0).length, big: gear + (m && m.mystery_boxes > 0 ? 1 : 0) };
}

type LevelPreviewData = LevelChest['preview'];
function levelRowCount(p: LevelPreviewData): { small: number; big: number } {
  return { small: [p.coins, p.tickets, p.energy, p.bonus_coins ?? 0].filter(n => n > 0).length, big: (p.item ? 1 : 0) + (p.mystery_boxes > 0 ? 1 : 0) };
}

/** What is inside a level chest (exact amounts from the server, gear shown as a present): zero reading. */
function LevelPreview({ p }: { readonly p: LevelPreviewData }) {
  const chips = ([['coins', p.coins], ['ticket', p.tickets], ['energy', p.energy]] as const).filter(([, n]) => n > 0);
  return (
    <>
      <View style={styles.previewRow}>
        {chips.map(([icon, n]) => (
          <View key={icon} style={styles.previewChip}><GameIcon name={icon} size={30} /><Text style={styles.previewText}>{n}</Text></View>
        ))}
      </View>
      {p.item && (
        <View style={[styles.previewChip, styles.previewGear]}><GameIcon name="gift" size={30} /><Text style={styles.previewGearText}>NEW GEAR</Text></View>
      )}
    </>
  );
}

/** What is inside the Daily 3 chest (the server's preview), shown while it gathers: icons and numbers, zero reading. */
function DailyPreview({ state }: { readonly state: DailyThreeState }) {
  const r = state.reward;
  const chips = ([['coins', r.coins], ['ticket', r.tickets], ['energy', r.energy], ['xp', r.xp]] as const).filter(([, n]) => n > 0);
  return (
    <>
      <View style={styles.previewRow}>
        {chips.map(([icon, n]) => (
          <View key={icon} style={styles.previewChip}><GameIcon name={icon} size={30} /><Text style={styles.previewText}>{n}</Text></View>
        ))}
      </View>
      {state.claimable_milestone?.gear && (
        <View style={[styles.previewChip, styles.previewGear]}><GameIcon name="gift" size={30} /><Text style={styles.previewGearText}>NEW GEAR</Text></View>
      )}
    </>
  );
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

/** Prize rows from what the server paid (for a flight with no measured rows). */
function paidRows(p: PaidRewards): { kind: string; amount: number }[] {
  return [['coins', p.coins], ['bonus_coins', p.bonus_coins], ['tickets', p.tickets], ['energy', p.energy]]
    .map(([kind, n]) => ({ kind: kind as string, amount: Number(n) || 0 })).filter(r => r.amount > 0);
}

const styles = StyleSheet.create({
  dim: { backgroundColor: BRAND.navy },
  center: { alignItems: 'center', justifyContent: 'center' },
  wrap: { alignItems: 'center', alignSelf: 'stretch' },
  wrapInner: { alignItems: 'center', alignSelf: 'stretch' },
  nextBlock: { gap: 6 },
  pips: { flexDirection: 'row', gap: 3 },
  pip: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: BRAND.gold },
  // This week's five flames, all earned (the box just opened).
  pipLit: { backgroundColor: BRAND.gold },
  xpTrack: { height: 16, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'visible', justifyContent: 'center',
    marginHorizontal: 18, paddingLeft: 0 },
  xpFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 8, backgroundColor: BRAND.gold },
  card: { width: '94%', marginTop: -14, ...CARD_FRAME,
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
  previewRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  previewChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 5 },
  previewText: { fontFamily: 'Shark', fontSize: 20, color: BRAND.white, marginTop: 2 },
  previewGear: { backgroundColor: BRAND.gold },
  previewGearText: { fontFamily: 'Shark', fontSize: 17, color: BRAND.navy, marginTop: 2 },
  nextText: { fontFamily: 'Shark', fontSize: 16, color: BRAND.white, textAlign: 'center', flexShrink: 1 },
});
