import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Modal from 'react-native-modal';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
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
  FULL_SET, LEVEL_CHEST as LEVEL_FX, PRIZE_FLIGHT, REPEAT_CHEST, STREAK_MILESTONES, WELCOME_FX, dailyChain, daysAway, flameMomentFor, flightDoneMs, flightPlan,
  flightTarget, isRareChest, isRepeatChest, mayAskAfterChain, tomorrowPrize, welcomeCards, type FlameMoment, type WelcomeCard,
} from '../../services/retention/loopMotion';
import { DURATION, SPRING } from '../../ui/motion';
import { EASE } from '../../ui/motionEasing';
import PrizeFlight, { type FlightSpec } from './PrizeFlight';
import { mayAskForPush, notePushAsked } from '../../services/retention/pushAsk';
import { BRAND, GameIcon, ICON_SOURCES, gameAlert } from '../../ui';
import { useModalLayer } from '../../ui/modalLayers';
import Daily3MapButton, { type CheckLanding } from './Daily3MapButton';
import StampRibbon from './StampRibbon';
import StreakMoment from './StreakMoment';
import TomorrowCard from './TomorrowCard';
import Daily3Sheet, { type GoalTap } from './Daily3Sheet';
import FlameUpRow from './FlameUpRow';
import { EmberCard, FreezeSavedCard } from './FreezeMoments';
import WelcomeBack from './WelcomeBack';
import RewardReveal, { type PrizeOrigin } from './RewardReveal';
import CardSurface from './CardSurface';

const LEVEL_CHEST = require('../../../assets/images/retention/level-chest-closed.png');
const LEVEL_CHEST_OPEN = require('../../../assets/images/retention/level-chest-open.png');
const WEEKLY = require('../../../assets/images/retention/weekly-box-closed.png');
const WEEKLY_OPEN = require('../../../assets/images/retention/weekly-box-open.png');
const FREEZE = require('../../../assets/images/retention/freeze.png');
const BOX = require('../../../assets/images/retention/mystery-box.png');
// The loop moments' art too (flame, crown, Finn, the gold), so the flame never pops in late.
const ART = [LEVEL_CHEST, LEVEL_CHEST_OPEN, WEEKLY, WEEKLY_OPEN, FREEZE, BOX,
  require('../../../assets/icons/game/streak.png'), require('../../assets/games/banana-basket/v2/crown.png'),
  require('../../assets/games/banana-basket/v2/shark_cheer.png'), require('../../../assets/images/reveal/soft-spot.webp')];

/** Reads are cheap but not free: focus and app-resume reads wait at least 15 s; real events read at once. */
const MIN_REFRESH_MS = 15000;
const COACH_KEY = 'tps.retention.coach.v1';
/** The last streak number this phone celebrated (per player), so a flame moment plays once. */
const FLAME_SEEN_KEY = 'tps.retention.flameSeen.v1';
/** This phone has shown the "come back tomorrow" card (per player): after that it shows only before gear or a milestone. */
const TOMORROW_SEEN_KEY = 'tps.retention.tomorrowSeen.v1';
/** How many Daily 3 chests this phone has opened (per player): after three, the chest plays its shorter repeat version. */
const CHEST_OPENS_KEY = 'tps.retention.chestOpens.v1';
/** When this phone last opened the map for this player (for the welcome back). */
const LAST_OPEN_KEY = 'tps.retention.lastOpen.v1';

type View_ =
  | { k: 'sheet'; all?: boolean; freezeArrive?: number }
  | { k: 'flame'; moment: Exclude<FlameMoment, { kind: 'none' }> }
  | { k: 'tomorrow' }
  | { k: 'reveal'; src: 'daily' | 'weekly' | 'level'; level?: number; claimDate?: string | null; rewards: PaidRewards | null; opening: boolean;
      auto?: boolean; state?: DailyThreeState | null; moment?: FlameMoment; repeat?: boolean; rare?: boolean }
  /** Between cards: the card steps aside and the prizes fly from their rows into the HUD where the kid can see them land. */
  | { k: 'flying'; legs: readonly FlightSpec[] }
  | { k: 'freeze' }
  | { k: 'freezeSaved'; days: number; streak: number }
  /** The streak ended: the flame settles into a warm ember, once. */
  | { k: 'ember'; was: number }
  /** Back after 3 or more days: Finn and what is new (real data only), once. */
  | { k: 'welcome'; cards: readonly WelcomeCard[] }
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
  const { triggerFly, getTarget } = useCurrencyFly();
  const reducedMotion = useReducedGameMotion();
  const { width, height } = useWindowDimensions();
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
  const buttonBox = useRef<View>(null);
  // Dev readout for the lane tools (debug()).
  const presentRef = useRef(false);
  const frontRef = useRef(false);
  const cardTRef = useRef<{ value: number } | null>(null);
  viewRef.current = view;
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
      // The map button flies the check in (its own haptic and sound); a card that is open just updates.
      const index = next.goals.findIndex(g => g.key === fresh[fresh.length - 1]);
      setCelebrate(c => [...new Set([...c, ...fresh])]);
      if (!viewRef.current) setLanding(l => ({ index, done: doneCount(next.goals), key: (l?.key ?? 0) + 1 }));
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
  const [welcomeDone, setWelcomeDone] = useState(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', st => { if (st === 'active') { welcomeChecked.current = false; setWelcomeDone(false); } });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!daily || !o.enabled || welcomeChecked.current || !player?.id) return;
    welcomeChecked.current = true;
    const key = `${LAST_OPEN_KEY}:${player.id}`;
    void AsyncStorage.getItem(key).then(v => {
      const away = daysAway(v ? Number(v) : null, Date.now());
      void AsyncStorage.setItem(key, String(Date.now())).catch(() => undefined);
      if (!mounted.current) return;
      if (away >= WELCOME_FX.minDaysAway) welcomeCards_.current = welcomeCards(daily, { levelChest: pendingChest?.level ?? null });
      setWelcomeDone(true);
    }).catch(() => setWelcomeDone(true));
  }, [daily, o.enabled, player?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const welcomeCards_ = useRef<WelcomeCard[] | null>(null);
  useEffect(() => {
    if (view || !o.screenFree || !o.mapFocused || !o.enabled) return;
    // Back after a few days: the welcome goes first (it tells the flame and the chest kindly), once.
    if (welcomeDone && welcomeCards_.current?.length) {
      const cards = welcomeCards_.current;
      const timer = setTimeout(() => { welcomeCards_.current = null; setView(v => v ?? { k: 'welcome', cards }); }, 500);
      return () => clearTimeout(timer);
    }
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
  }, [pendingChest?.level, freezeSaved, daily?.streak.days, view, o.screenFree, o.mapFocused, o.enabled, welcomeDone]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const tomorrowKey = `${TOMORROW_SEEN_KEY}:${player?.id ?? 0}`;

  /**
   * After a chest: the card and its ribbon shrink away together and every prize flies from its own row into its
   * HUD counter in plain sight (coins first, then tickets, then energy), bumping it on each landing. 300 ms after
   * the last landing the next card starts (for the Daily 3 chest: the big flame at 3, 7, 30, 100 and the tomorrow
   * card the first time, or before gear or a milestone). A normal day ends right here: one tap after the chest.
   * The balance is read at once so the counters roll while the icons land; nothing ever waits on it.
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
    setView({ k: 'flying', legs });
    void Promise.resolve(refreshPlayer?.()).catch(() => undefined);
    // The next card launches out of the Daily 3 button (where the flame lives), so the eye goes there with it.
    launchFrom.current = null;
    buttonBox.current?.measureInWindow((x, y, w, h) => {
      if (Number.isFinite(x) && w > 0) launchFrom.current = { x: x + w / 2 - width / 2, y: y + h / 2 - height / 2 };
    });
    const next = async () => {
      chainTimer.current = null;
      if (src !== 'daily') void refresh(true);
      if (!mounted.current) return;
      let chain: ('flame' | 'tomorrow')[] = [];
      if (src === 'daily' && state) {
        let seen = false;
        try { seen = !!(await AsyncStorage.getItem(tomorrowKey)); } catch { /* treat as not seen */ }
        chain = dailyChain({ moment: moment ?? { kind: 'none' }, prize: tomorrowPrize(state), tomorrowSeen: seen,
          milestoneAway: state.streak.next_milestone?.days_away ?? null });
      }
      chainRef.current = chain;
      if (chain.length) { showChain(); return; }
      // A freeze from the Weekly Box flies into its slot beside the flame.
      if (src === 'weekly' && paid && (paid.freezes ?? 0) > 0) { setView({ k: 'sheet', freezeArrive: paid.freezes }); return; }
      if (src !== 'daily' && await mayAskForPush()) { setView({ k: 'push' }); return; }
      if (src === 'daily' && mayAskAfterChain(chain) && await mayAskForPush()) { setView({ k: 'push' }); return; }
      setView(null);
    };
    chainTimer.current = setTimeout(() => { void next(); }, reducedMotion ? 420 : flightDoneMs(plan));
  };

  /** The rest of the daily chain, one card at a time. */
  const chainRef = useRef<('flame' | 'tomorrow')[]>([]);
  const flameRef = useRef<Exclude<FlameMoment, { kind: 'none' }> | null>(null);
  const showChain = () => {
    const step = chainRef.current.shift();
    if (step === 'flame' && flameRef.current) { setView({ k: 'flame', moment: flameRef.current }); return; }
    if (step === 'tomorrow') {
      void AsyncStorage.setItem(tomorrowKey, '1').catch(() => undefined);
      setView({ k: 'tomorrow' }); return;
    }
    if (step === 'flame') { showChain(); return; }
    setView(null);
  };

  const afterFlame = () => { showChain(); };
  const afterTomorrow = () => { showChain(); };

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

  const openReveal = async () => {
    if (!view || view.k !== 'reveal' || view.rewards || opening.current) return;
    opening.current = true;
    const current = view;
    setView({ ...current, opening: true });
    const started = Date.now();
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
      // Let the shake build before the lid pops (anticipation reads at 450 ms+).
      // The Weekly Box shakes longest (900 ms): the week's biggest moment earns the longest wind-up.
      // The Daily 3 chest follows the chest beats (420 ms of shake, then the held frame); the Weekly Box winds up longest.
      // The full set holds the lid until its checks have dived in (chestAt), then the chest's own 420 ms gather.
      const gather = current.repeat ? REPEAT_CHEST.gatherMs : 420;
      const hold = current.src === 'weekly' ? 900 : current.src === 'daily' ? (current.auto ? FULL_SET.chestAt + gather : gather) : LEVEL_FX.holdMs;
      const wait = reducedMotion ? 0 : Math.max(0, hold - (Date.now() - started));
      setTimeout(() => {
        if (mounted.current) setView({ ...current, opening: false, rewards: result.rewards, state: result.state ?? null, moment });
      }, wait);
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
  const onFullSet = () => {
    if (viewRef.current || !daily?.claimable) return;
    // Start the claim now: by the chest beat (900 ms later) the server has usually answered, so the lid never waits.
    claimAhead.current = claimDailyThree();
    claimAhead.current.catch(() => undefined);
    // Straight into the chest card (one card, no sheet in between): the checks bounce, dive in, the lid pops.
    setCelebrate([]);
    setView({ k: 'reveal', src: 'daily', claimDate: daily.claimable_date, rewards: null, opening: false, auto: true, ...dailyFlavor(daily.claimable_date) });
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
      setLastOpen: (daysAgo: number) => { if (player?.id) void AsyncStorage.setItem(`${LAST_OPEN_KEY}:${player.id}`, String(Date.now() - daysAgo * 86400000)); },
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
    if (view?.k === 'freezeSaved' || (view?.k === 'welcome' && view.cards.some(c => c.kind === 'saved'))) {
      void markFreezeSeen().then(r => applyDaily(r.state)).catch(() => undefined);
    }
    // The welcome already told an ended flame kindly: no second ember card.
    if (view?.k === 'welcome' && view.cards.some(c => c.kind === 'ember')) writeSeen(0);
    setView(null);
  };

  // The modal stays up through a card's exit and the prize flight (the map shows through), then closes.
  const [present, setPresent] = useState(false);
  const visible = !!view || present;
  const front = useModalLayer(visible, 'wait');
  const showing = !!view && view.k !== 'flying' && front;
  presentRef.current = present; frontRef.current = front;
  const dim = useSharedValue(0);
  const cardT = useSharedValue(0);
  cardTRef.current = cardT;
  const cardUp = useRef(false);
  /** Where the next card launches from (relative to the screen centre), set while the prizes fly home. */
  const launchFrom = useRef<{ x: number; y: number } | null>(null);
  const launch = useSharedValue({ x: 0, y: 0 });
  useEffect(() => {
    if (view) setPresent(true);
    if (showing) {
      if (!cardUp.current) {
        cardUp.current = true;
        launch.value = !reducedMotion && launchFrom.current ? launchFrom.current : { x: 0, y: 0 };
        launchFrom.current = null;
        cardT.value = 0;
        cardT.value = reducedMotion ? withTiming(1, { duration: DURATION.quick }) : withSpring(1, SPRING.settle);
        dim.value = withTiming(0.55, { duration: DURATION.enter, easing: EASE.out });
      }
      return;
    }
    if (cardUp.current) {
      // Exits are faster than entrances: the card and its ribbon leave together, the map comes back into view.
      cardUp.current = false;
      cardT.value = withTiming(0, { duration: reducedMotion ? DURATION.quick : PRIZE_FLIGHT.exitMs, easing: EASE.in });
      dim.value = withTiming(0, { duration: DURATION.exit, easing: EASE.in });
    }
    if (!view) {
      const t = setTimeout(() => { if (!viewRef.current) setPresent(false); }, DURATION.exit + 40);
      return () => clearTimeout(t);
    }
  }, [showing, !!view]); // eslint-disable-line react-hooks/exhaustive-deps
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));
  const cardStyle = useAnimatedStyle(() => {
    const t = cardT.value;
    const far = launch.value.x !== 0 || launch.value.y !== 0;
    // From the button: it grows out of it on the settle spring; otherwise a plain pop-in.
    return { opacity: Math.min(1, t * (far ? 3 : 1.6)), transform: [{ translateX: launch.value.x * (1 - t) }, { translateY: launch.value.y * (1 - t) },
      { scale: far ? 0.15 + 0.85 * t : 0.86 + 0.14 * t }] };
  });

  let button: ReactNode | null = null;
  if (flags?.dailyThree && daily) {
    const b = buttonState(daily, new Date().getHours());
    button = (
      <View ref={buttonBox} collapsable={false}>
      <Daily3MapButton pips={b.pips} streak={b.streak} attention={b.attention}
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
    const levelPreview = r.src === 'level' ? chests.find(c => c.level === r.level)?.preview ?? null : null;
    title = r.src === 'level' ? `Level ${r.level}!` : r.src === 'weekly' ? 'Weekly Box' : r.auto ? 'All 3 done!' : 'Daily 3 done!';
    const footer = r.src === 'level' ? nextLevel(r.level ?? 1)
      : r.src === 'weekly' ? (
        <View style={styles.nextRow}>
          <Image source={WEEKLY} style={{ width: 28, height: 28 }} contentFit="contain" />
          <Text style={styles.nextText}>Next box: 5 flames next week</Text>
          <View style={styles.pips}>{[0, 1, 2, 3, 4].map(i => <View key={i} style={[styles.pip, i < 5 && styles.pipLit]} />)}</View>
        </View>
      )
      : r.state ? (
        <FlameUpRow from={r.moment && r.moment.kind !== 'none' ? Math.max(0, r.state.streak.days - 1) : r.state.streak.days}
          to={r.state.streak.days} grow={!!r.moment && r.moment.kind !== 'none'} reducedMotion={reducedMotion} />
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
        onArrive={r.src === 'level' ? () => {
          // The level chest's claim starts as it lands, so its lid pops on the beat even on a slow server.
          if (r.level && !levelAhead.current) {
            const p = openLevelChest(r.level);
            p.catch(() => { if (levelAhead.current?.p === p) levelAhead.current = null; });
            levelAhead.current = { level: r.level, p };
          }
        } : undefined}
        expectRows={r.src === 'daily' && daily ? dailyRowCount(daily) : levelPreview ? levelRowCount(levelPreview) : undefined}
        preview={r.src === 'daily' && daily ? <DailyPreview state={daily} /> : levelPreview ? <LevelPreview p={levelPreview} /> : undefined}
        onWear={() => { if (r.rewards) fly(r.rewards); void refreshPlayer?.(); setView(null); RootNavigation.navigate('Inventory'); }}
        onPins={() => { if (r.rewards) fly(r.rewards); void refreshPlayer?.(); setView(null); RootNavigation.navigate('PinCollections'); }}
        onOpen={() => { void openReveal(); }} onDone={origins => finishReveal(r.rewards, r.src, r.state ?? null, r.moment, origins)} />
    );
  } else if (view?.k === 'flame') {
    title = view.moment.kind === 'milestone' ? 'Big flame!' : 'Flame up!';
    content = <StreakMoment key={JSON.stringify(view.moment)} moment={view.moment} reducedMotion={reducedMotion} onDone={afterFlame} />;
  } else if (view?.k === 'tomorrow') {
    title = 'See you tomorrow';
    content = <TomorrowCard prize={tomorrowPrize(daily)} reducedMotion={reducedMotion} onDone={afterTomorrow} />;
  } else if (view?.k === 'freeze' && daily) {
    title = 'Streak Freeze';
    content = (
      <View style={styles.card}>
        <CardSurface />
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
  // The last card stays mounted (same title, same content) while it shrinks away, so the ribbon never shows
  // another word and the card never vanishes in one frame.
  const lastCard = useRef<{ title: string; content: ReactNode } | null>(null);
  if (content && view && view.k !== 'flying') lastCard.current = { title, content };
  const shownTitle = showing || !lastCard.current ? title : lastCard.current.title;
  const shownContent = showing ? content : lastCard.current?.content ?? null;
  if (!view && !present) lastCard.current = null;
  const overlay = (
    <Modal isVisible={visible && front} style={styles.modal} hasBackdrop={false} coverScreen
      animationIn="fadeIn" animationOut="fadeOut" animationInTiming={60} animationOutTiming={60}
      onBackButtonPress={revealing ? undefined : close} useNativeDriver hideModalContentWhileAnimating={false}>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dimStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={revealing || !showing ? undefined : close} accessible={false} />
        </Animated.View>
        <View style={[StyleSheet.absoluteFill, styles.center, { paddingHorizontal: width * 0.05 }]} pointerEvents="box-none">
          <Animated.View style={[styles.wrap, cardStyle]} pointerEvents={showing ? 'box-none' : 'none'}>
            <StampRibbon text={shownTitle} reducedMotion={reducedMotion} />
            {shownContent}
          </Animated.View>
        </View>
        {view?.k === 'flying' && view.legs.length > 0 && <PrizeFlight legs={view.legs} origin={{ x: 0, y: 0 }} reducedMotion={reducedMotion} />}
      </View>
    </Modal>
  );

  return { button, overlay, occluding: visible };
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
  modal: { margin: 0 },
  dim: { backgroundColor: BRAND.navy },
  center: { alignItems: 'center', justifyContent: 'center' },
  wrap: { alignItems: 'center', alignSelf: 'stretch' },
  nextBlock: { gap: 6 },
  pips: { flexDirection: 'row', gap: 3 },
  pip: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: BRAND.gold },
  // This week's five flames, all earned (the box just opened).
  pipLit: { backgroundColor: BRAND.gold },
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
  previewRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  previewChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 5 },
  previewText: { fontFamily: 'Shark', fontSize: 20, color: BRAND.white, marginTop: 2 },
  previewGear: { backgroundColor: BRAND.gold },
  previewGearText: { fontFamily: 'Shark', fontSize: 17, color: BRAND.navy, marginTop: 2 },
  nextText: { fontFamily: 'Shark', fontSize: 16, color: BRAND.white, textAlign: 'center', flexShrink: 1 },
});
