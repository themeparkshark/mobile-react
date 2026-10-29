import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Modal from 'react-native-modal';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import {
  buyStreakFreeze, claimDailyThree, claimWeeklyBox, getDailyThree, getLevelChests, markFreezeSeen, openLevelChest, setReminders,
  setRetentionMode, type DailyThreeState, type LevelChest, type PaidRewards,
} from '../../api/endpoints/retention';
import { claimStampReward, getStamps } from '../../api/endpoints/me/stamps';
import { getSharkPass, type SharkPassEvent } from '../../api/endpoints/me/shark-pass';
import { AuthContext } from '../../context/AuthProvider';
import { DailyGiftContext } from '../../context/DailyGiftProvider';
import { LocationStatusContext } from '../../context/LocationProvider';
import { readStampDotCache, stampClaimableCount, writeStampDotCache } from '../profile/stampDot';
import { useCurrencyFly } from '../../context/CurrencyFlyProvider';
import { haptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import { studioMoment } from '../../gamekit/audio/playMoment';
import { flameDay, playDaily3, preloadLoopMoments } from '../../gamekit/audio/loopSound';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import * as RootNavigation from '../../RootNavigation';
import { enablePush } from '../../services/push';
import { markRungSeen, useRung } from '../../services/reveal/revealLadder';
import { rowRung } from '../../services/retention/newTag';
import { flagOn, loadRetentionFlags, type RetentionFlags } from '../../services/retention/flags';
import { buttonState, doneCount, newlyDone, nextLevelChest, sameJson, tomorrowLine } from '../../services/retention/logic';
import { mayAskForPush, noteParkDaySeen, notePushAsked, parkDaySeen } from '../../services/retention/pushAsk';
import { devLadderFeed } from '../../services/retention/devLadderFeed';
import {
  askForDailyChest, autoOpenUsed, noteAppState, noteAutoOpen, rewardMayAutoOpen,
} from '../../services/retention/rewardPresence';
import { emptyLine, rewardsRows, rewardsSummary, type RewardsInput, type RewardsRowKey, type RewardsSummary } from '../../services/retention/rewardsModel';
import { openRewardsDoor, rewardsDoorOpen } from '../../services/retention/rewardsSignals';
import { mapAllows, mapTake } from '../../services/retention/mapAttention';
import { boxFraction, headlineBox } from '../../services/trail/trailModel';
import { useTrail } from '../../services/trail/TrailProvider';
import useLiveEvent from '../../services/liveEvents/useLiveEvent';
import { openableKeys } from '../../services/liveEvents/model';
import { wearAndOpenCloset } from '../../services/retention/wearRewardLive';
import { BRAND, GameIcon, ICON_SOURCES, gameAlert } from '../../ui';
import { useNativeModalLayer } from '../../ui/modalLayers';
import Ribbon from '../Ribbon';
import Daily3MapButton from './Daily3MapButton';
import Daily3Sheet, { type GoalTap } from './Daily3Sheet';
import RewardReveal from './RewardReveal';
import RewardsSheet from './RewardsSheet';

const LEVEL_CHEST = require('../../../assets/images/retention/level-chest-closed.png');
const LEVEL_CHEST_OPEN = require('../../../assets/images/retention/level-chest-open.png');
const WEEKLY = require('../../../assets/images/retention/weekly-box-closed.png');
const WEEKLY_OPEN = require('../../../assets/images/retention/weekly-box-open.png');
const FREEZE = require('../../../assets/images/retention/freeze.png');
const BOX = require('../../../assets/images/retention/mystery-box.png');
const ART = [LEVEL_CHEST, LEVEL_CHEST_OPEN, WEEKLY, WEEKLY_OPEN, FREEZE, BOX];

/** Reads are cheap but not free: focus and app-resume reads wait at least 15 s; real events read at once. */
const MIN_REFRESH_MS = 15000;
/** No native onDismiss after the hide animation (Android, or a sheet UIKit never showed): carry on after this. */
const NATIVE_GONE_FALLBACK_MS = 700;
const COACH_KEY = 'tps.retention.coach.v1';

type View_ =
  | { k: 'rewards' }
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
  /** The map knows it is at a park (else read from the location status). */
  readonly atPark?: boolean;
  /** Open Trail Boxes (the map's TrailHost); else the sheet asks TrailHost itself. */
  readonly onOpenTrail?: () => void;
  /** Open the event sheet; else the sheet asks EventSheet itself. */
  readonly onOpenEvents?: () => void;
}

export interface RetentionResult {
  readonly button: ReactNode | null;
  readonly overlay: ReactNode;
  readonly occluding: boolean;
  /** Open the Rewards sheet (guide-map's Rewards button). */
  readonly openRewards: () => void;
  /** What the Rewards button draws: one number, the flame after rung 4, the Trail ring after rung 6. */
  readonly rewards: RewardsSummary;
}

/**
 * The Rewards sheet, Daily 3, the Weekly Box and level-up chests on the map:
 * returns the Rewards summary and opener (for guide-map's one Rewards button)
 * and the one overlay that hosts every retention moment in a single modal
 * (Rewards sheet, Daily 3, reveals, freeze, reminders ask), so they never stack
 * on each other or on another sheet (core loop blueprint 4.2 and 4.3).
 *
 * Calm by rule: at a park nothing here opens by itself; at home a level chest
 * or the freeze card may open only as the app open's one automatic open, and
 * only after Daily 3 unlocks (rung 4). Daily 3, level chests, Trail Boxes and
 * event chests show only once their rung is open.
 */
export default function useRetention(o: RetentionOptions): RetentionResult {
  const { player, refreshPlayer } = useContext(AuthContext);
  const { dailyGift } = useContext(DailyGiftContext);
  const parkNow = useContext(LocationStatusContext)?.park ?? null;
  const atPark = o.atPark ?? !!parkNow;
  const parkId = parkNow?.id ?? null;
  // Daily 3 sends where the map is, so home gets home goals and the park gets park goals. The mode is set in an
  // effect and again at each read's call time (never during render).
  const atParkRef = useRef(atPark);
  useEffect(() => { atParkRef.current = atPark; setRetentionMode(atPark ? 'park' : 'home'); }, [atPark]);
  const dailyOpen = useRung('daily').open;
  const passOpen = useRung('shark_pass').open;
  const trailOpen = useRung('trail').open;
  const eventsOpen = useRung('events').open;
  const coinLevelsOpen = useRung('coin_levels').open;
  const trail = useTrail();
  const liveEvt = useLiveEvent(parkId);
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
  const [stamps, setStamps] = useState(0);
  const [rewardsBusy, setRewardsBusy] = useState<RewardsRowKey | null>(null);
  const [rewardsNote, setRewardsNote] = useState<string | null>(null);
  const [passToday, setPassToday] = useState<readonly SharkPassEvent[] | null>(null);
  /** A reveal opened from the Rewards sheet goes back to it when done. */
  const backToRewards = useRef(false);
  /** Runs once the overlay is really gone (UIKit dismissed it), so the next native sheet can present. */
  const afterHide = useRef<(() => void) | null>(null);
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

  // Warm the art once the features are on, so the first reveal never pops in (and the loop's sounds, so the day's
  // first check and chest ring on their frame, not after a first-play load).
  useEffect(() => {
    if (flags?.dailyThree || flags?.levelChests) { void Asset.loadAsync(ART).catch(() => undefined); preloadLoopMoments(); }
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
      // Studio sound (approved Oct 24): each check climbs a note (do, re, mi), the third leads into the all-done chord,
      // and that chord rings brighter each day of the streak (every 7th day the flame's own ignite). Its shaped buzz
      // (a tick then the check; the flame's swell) is felt even with the sound off. Studio off: today's.
      const checked = next.claimable ? 3 : Math.min(2, next.goals.filter(g => g.done).length);
      if (!playDaily3(checked, flameDay(next.streak))) {
        haptic('success');
        playSfx(next.claimable ? 'fx.reveal' : 'fx.coinTick');
      }
    }
  }, []);

  const level = player?.experience_level?.level ?? 0;
  const wantDaily = !!flags?.dailyThree && dailyOpen;
  const wantChestsOn = !!flags?.levelChests && dailyOpen;
  const refresh = useCallback(async (force = false) => {
    if (!flags || (!wantDaily && !wantChestsOn)) return;
    const now = Date.now();
    if (!force && now - lastRead.current < MIN_REFRESH_MS) return;
    lastRead.current = now;
    setRetentionMode(atParkRef.current ? 'park' : 'home');
    // Level chests only change with the level: read them once, then on each level-up.
    const wantChests = wantChestsOn && lastChestRead.current !== level;
    try {
      const [d, c] = await Promise.all([
        wantDaily ? getDailyThree() : Promise.resolve(null),
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
  }, [flags, applyDaily, level, wantDaily, wantChestsOn]);

  useEffect(() => { if (o.enabled && o.mapFocused) void refresh(lastRead.current === 0); }, [o.enabled, o.mapFocused, flags, refresh]);
  // Daily 3 or level chests just unlocked (rung 4 opened after the first read): read them now, not on the next focus.
  useEffect(() => { if (o.enabled && (wantDaily || wantChestsOn)) void refresh(true); }, [wantDaily, wantChestsOn]); // eslint-disable-line react-hooks/exhaustive-deps
  // Home and park goals differ: a move between them reads the right ones.
  useEffect(() => { if (o.enabled && lastRead.current > 0) void refresh(true); }, [atPark]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (o.enabled) void refresh(true); }, [o.refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (o.enabled && level > 0 && lastChestRead.current !== -1) void refresh(true); }, [level]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      noteAppState(s);
      if (s === 'active' && o.enabled) void refresh(false);
    });
    return () => sub.remove();
  }, [o.enabled, refresh]);

  // Lane testing only (a no-op in store and OTA bundles): feed the unlock ladder until the map's own feed lands.
  useEffect(() => {
    devLadderFeed({ flags: flags?.all, level, atPark, hasTeam: false,
      coinsWon: Number(player?.ride_coins_collected ?? player?.completed_tasks_count ?? 0) || 0 });
  }, [flags, level, atPark, player?.ride_coins_collected, player?.completed_tasks_count]);

  // The first park day, for the reminders ask on the next home open.
  const [sawParkDay, setSawParkDay] = useState(false);
  useEffect(() => {
    if (!player?.id) return;
    if (atPark) { setSawParkDay(true); void noteParkDaySeen(player.id); return; }
    void parkDaySeen(player.id).then(v => { if (mounted.current && v) setSawParkDay(true); });
  }, [atPark, player?.id]);

  // Stamps with prizes to claim (the Profile dot's 5 minute cache, so the map adds no new polling).
  const playerId = player?.id ?? null;
  const refreshStamps = useCallback(async (force = false) => {
    if (playerId == null) return;
    const cached = force ? null : readStampDotCache(playerId);
    if (cached != null) { setStamps(cached); return; }
    try {
      const r = await getStamps();
      // The Stamp Book's own count (it honors the server's summary.claimable), so the row and Profile agree.
      const n = stampClaimableCount(r);
      writeStampDotCache(playerId, n);
      if (mounted.current) setStamps(n);
    } catch { /* no dot this time */ }
  }, [playerId]);
  useEffect(() => { if (o.enabled && o.mapFocused) void refreshStamps(); }, [o.enabled, o.mapFocused, refreshStamps]);
  // A win, find or chest can earn a stamp: read again so the Rewards number rises right away (one read per event).
  const firstKey = useRef(o.refreshKey);
  useEffect(() => {
    if (!o.enabled || o.refreshKey === firstKey.current) return;
    void refreshStamps(true);
  }, [o.refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // A push asked for Daily 3 or the chest.
  useEffect(() => {
    if (!o.openRequest || !o.enabled) return;
    if (o.openRequest === 'chest') { askForDailyChest(); o.onOpenChest(); }
    else if (daily && dailyOpen) openSheet();
    else if (!wantDaily) { /* Daily 3 is not open for this player yet: nothing to show */ }
    else return; // wait for the first read
    o.onOpenRequestHandled();
  }, [o.openRequest, o.enabled, daily]); // eslint-disable-line react-hooks/exhaustive-deps

  // At home only, as the app open's one automatic open: a level-up chest presents itself once the map is free, then a
  // freeze that saved the flame says so once. At a park they wait in the Rewards sheet (BLUEPRINT 4.3).
  const pendingChest = wantChestsOn ? nextLevelChest(chests) : null;
  const freezeSaved = daily?.streak.freeze_saved ?? 0;
  // The map's own attention rules (guide-map's gate) must agree too, when this build has them.
  // One counter for "one automatic open per app open": the map's queue when this build has it (its gate counts every
  // automatic open on the map's app-open clock); this lane's own counter only in a build without the gate.
  const may = (kind: 'level_chest' | 'freeze_saved') => {
    const mapSays = mapAllows('reward');
    return rewardMayAutoOpen({ kind, atPark, firstCatchDone: true, autoOpenUsed: mapSays === null ? autoOpenUsed() : false,
      dailyRungOpen: dailyOpen }) && mapSays !== false;
  };
  useEffect(() => {
    if (view || !o.screenFree || !o.mapFocused || !o.enabled) return;
    if (pendingChest && may('level_chest')) {
      const timer = setTimeout(() => {
        if (!may('level_chest') || !mapTake('reward')) return;
        noteAutoOpen();
        setView(v => v ?? { k: 'reveal', src: 'level', level: pendingChest.level, rewards: null, opening: false });
        playSfx('fx.reveal');
      }, 700);
      return () => clearTimeout(timer);
    }
    if (freezeSaved > 0 && daily && may('freeze_saved')) {
      const timer = setTimeout(() => {
        if (!may('freeze_saved') || !mapTake('reward')) return;
        noteAutoOpen();
        setView(v => v ?? { k: 'freezeSaved', days: freezeSaved, streak: daily.streak.days });
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [pendingChest?.level, freezeSaved, view, o.screenFree, o.mapFocused, o.enabled, atPark, dailyOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // The reminders ask: the first home open after the first park day, only while reminder pushes really work
  // (the server's retention_push switch: off until the push key is set), and only as the one automatic open.
  useEffect(() => {
    if (view || atPark || !sawParkDay || !o.screenFree || !o.mapFocused || !o.enabled) return;
    const used = () => (mapAllows('reward') === null ? autoOpenUsed() : mapAllows('reward') === false);
    if (!flagOn(flags, 'retention_push') || used()) return;
    let live = true;
    const timer = setTimeout(() => {
      void mayAskForPush().then(ok => {
        if (!live || !ok || used() || !mapTake('reward')) return;
        noteAutoOpen();
        setView(v => v ?? { k: 'push' });
      });
    }, 900);
    return () => { live = false; clearTimeout(timer); };
  }, [view, atPark, sawParkDay, o.screenFree, o.mapFocused, o.enabled, flags]);

  const [sheetFromRewards, setSheetFromRewards] = useState(false);
  const openSheet = (fromRewards = false) => {
    // Opening Daily 3 is seeing it: its NEW tag (rung 4) clears.
    markRungSeen('daily');
    setSheetFromRewards(fromRewards);
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

  // WEAR IT: the piece goes on first, then the closet opens on its own tab with it worn (must-fix 5).
  const [wearing, setWearing] = useState(false);
  const wearItem = async (paid: PaidRewards | null) => {
    const itemId = paid?.item?.id;
    if (wearing || !itemId) return;
    setWearing(true);
    try {
      await wearAndOpenCloset(itemId, refreshPlayer);
    } finally {
      if (mounted.current) setWearing(false);
      if (paid) fly(paid);
      void refresh(true);
      if (mounted.current) setView(null);
    }
  };

  const finishReveal = async (paid: PaidRewards | null) => {
    if (paid) fly(paid);
    void refreshPlayer?.();
    void refresh(true);
    // Opened from the Rewards sheet: back to it, so the next reward is one tap away. (The reminders ask no longer
    // follows a chest: it waits for the first home open after the first park day.)
    if (backToRewards.current) { backToRewards.current = false; setView({ k: 'rewards' }); return; }
    setView(null);
  };

  /** A claim whose answer was lost: read back what the server paid for that exact chest. */
  const recoverPaid = async (src: 'daily' | 'weekly' | 'level', level_: number, claimDate: string | null | undefined, timeoutMs = 6000): Promise<PaidRewards | null> => {
    try {
      if (src === 'level') {
        const c = await getLevelChests(timeoutMs);
        const chest = c.enabled ? c.chests.find(x => x.level === level_) : undefined;
        if (c.enabled) setChests(c.chests);
        return chest?.opened && chest.rewards ? chest.rewards : null;
      }
      const d = await getDailyThree(timeoutMs);
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
        const left = giveUp - Date.now();
        if (left < 1000) break;
        paid = await recoverPaid(current.src, current.level ?? 0, current.claimDate, Math.min(6000, left));
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
    if (tap === 'chest') { closeThen(() => { askForDailyChest(); o.onOpenChest(); }); return; }
    setView(null);
    if (tap === 'closet') RootNavigation.navigate('Inventory');
    else if (tap === 'friends') RootNavigation.navigate('Friends');
    else if (tap === 'shelf') RootNavigation.navigate('CoinShelf');
    // At home GO always means a treat (a park goal shows its home side; GO never flies to a park).
    else o.onFind(tap === 'ride' && !atPark ? 'snack' : tap);
  };

  /** Close the overlay, then run `next` once UIKit has really dismissed it (no two native sheets at once). */
  const closeThen = (next: () => void) => {
    afterHide.current = next;
    backToRewards.current = false;
    setView(null);
  };

  // ------------------------------------------------------------------ the Rewards sheet
  const passOn = flagOn(flags, 'shark_pass') && passOpen;
  const loadPassToday = useCallback(() => {
    if (!passOn) { setPassToday(null); return; }
    void getSharkPass().then(p => {
      if (!mounted.current) return;
      setPassToday(p && p.enabled && p.progress ? p.progress.today : null);
    }).catch(() => undefined);
  }, [passOn]);

  const giftLadder = dailyGift?.ladder?.length ? dailyGift.ladder.length : 7;
  const trailState = trailOpen && trail.enabled ? trail.state : null;
  const nearest = trailState ? headlineBox({ ready: [], walking: trailState.walking }) : null;
  const rewardsInput: RewardsInput = {
    dailyChest: dailyGift && player?.username
      ? { unclaimed: dailyGift.redeemed_at === null, day: Math.min(giftLadder, Math.max(1, dailyGift.day ?? 1)), of: giftLadder } : null,
    daily3: wantDaily && daily ? {
      done: doneCount(daily.goals), total: Math.max(3, daily.goals.length), claimable: daily.claimable,
      claimed: daily.claimed && !daily.claimable, flame: daily.streak.days,
    } : null,
    weekly: wantDaily && daily ? { claimable: daily.week.claimable } : null,
    levelChest: pendingChest ? { level: pendingChest.level, waiting: chests.filter(c => !c.opened).length } : null,
    trail: trailState ? { ready: trailState.ready.length, walking: trailState.walking.length + trailState.waiting.length,
      nearest: nearest ? boxFraction(nearest) : null, atPark, door: !!o.onOpenTrail || rewardsDoorOpen('trail') } : null,
    stamps: { claimable: stamps },
    events: eventsOpen && flagOn(flags, 'live_events') && liveEvt.event
      ? { chests: openableKeys(liveEvt.event).length, door: !!o.onOpenEvents || rewardsDoorOpen('events') } : null,
  };
  const rows = rewardsRows(rewardsInput);
  const summary = rewardsSummary(rewardsInput);

  const openRewards = useCallback(() => {
    playSfx('ui.tap');
    setRewardsNote(null);
    setView({ k: 'rewards' });
    // A fresh stamp read: the row never offers CLAIM ALL from a stale count.
    void refreshStamps(true);
    loadPassToday();
    void refresh(false);
  }, [refreshStamps, loadPassToday, refresh]);

  // Dev JS only: lane checks open the sheet and read its numbers before the map's Rewards button lands.
  useEffect(() => {
    if (!__DEV__) return undefined;
    const g = globalThis as { __tpsRewards?: unknown };
    g.__tpsRewards = { open: openRewards, summary: () => summary, rows: () => rows };
    return () => { if (g.__tpsRewards) delete g.__tpsRewards; };
  });

  const claimStamps = async () => {
    if (rewardsBusy) return;
    setRewardsBusy('stamps');
    let tickets = 0; let coins = 0; let energy = 0; let xp = 0; let failed = 0; let claimed = 0;
    let left: number | null = null;
    try {
      const r = await getStamps();
      for (const st of stampsToClaim(r)) {
        try {
          const got = await claimStampReward(st.id);
          claimed += 1;
          tickets += got.rewards?.tickets ?? 0; coins += got.rewards?.coins ?? 0; energy += got.rewards?.energy ?? 0; xp += got.rewards?.xp ?? 0;
        } catch { failed += 1; }
      }
      // Read back what is still waiting (the server's own count), so the row is honest after every claim.
      left = claimed > 0 || failed > 0 ? stampClaimableCount(await getStamps()) : stampClaimableCount(r);
    } catch { failed += 1; }
    if (!mounted.current) return;
    const waiting = left ?? failed;
    if (playerId != null) writeStampDotCache(playerId, waiting);
    setStamps(waiting);
    setRewardsBusy(null);
    const paid = { coins, tickets, energy, xp } as PaidRewards;
    if (coins + tickets + energy + xp > 0) { fly(paid); haptic('success'); playSfx('fx.reward'); void refreshPlayer?.(); }
    // Nothing was waiting after all (an old count): the row just updates quietly, never a "Claimed!" for nothing.
    if (claimed === 0 && failed === 0) { setRewardsNote(null); return; }
    setRewardsNote(failed && !claimed ? 'Those stamps did not go through. Try again.'
      : [tickets ? `+${tickets} ${tickets === 1 ? 'Ticket' : 'Tickets'}` : null, coins ? `+${coins} Shark Coins` : null,
        !tickets && !coins && energy ? `+${energy} Energy` : null]
        .filter(Boolean).join(', ') || 'Claimed!');
  };

  const onRewardsRow = (key: RewardsRowKey) => {
    playSfx('ui.tap');
    // A tap on a row is seeing that reward: its NEW tag clears.
    const rung = rowRung(key);
    if (rung) markRungSeen(rung);
    switch (key) {
      // The ask is made only once the overlay is really gone: the chest card (already mounted, waiting at a park)
      // would otherwise present while UIKit is still dismissing this sheet and never show.
      case 'daily_chest': closeThen(() => { askForDailyChest(); o.onOpenChest(); }); return;
      case 'daily3':
        if (daily?.claimable) { backToRewards.current = true; setView({ k: 'reveal', src: 'daily', claimDate: daily.claimable_date, rewards: null, opening: false }); }
        else openSheet(true);
        return;
      case 'level_chest':
        if (pendingChest) { backToRewards.current = true; setView({ k: 'reveal', src: 'level', level: pendingChest.level, rewards: null, opening: false }); }
        return;
      case 'weekly_box': backToRewards.current = true; setView({ k: 'reveal', src: 'weekly', rewards: null, opening: false }); return;
      // The host opens once the sheet is really gone; if it went away meanwhile, the Rewards sheet comes back (never a dead tap).
      case 'trail': closeThen(() => { if (o.onOpenTrail) o.onOpenTrail(); else if (!openRewardsDoor('trail')) setView({ k: 'rewards' }); }); return;
      case 'events': closeThen(() => { if (o.onOpenEvents) o.onOpenEvents(); else if (!openRewardsDoor('events')) setView({ k: 'rewards' }); }); return;
      case 'stamps': void claimStamps(); return;
    }
  };

  const buyFreeze = async () => {
    setBusy(true);
    try {
      const { state } = await buyStreakFreeze();
      applyDaily(state);
      haptic('success'); if (!studioMoment('loop.freeze')) playSfx('fx.purchase');
      void refreshPlayer?.();
      setView({ k: 'sheet' });
    } catch {
      gameAlert('No freeze this time', 'You may already hold the most freezes, or need a few more Shark Coins.');
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
    backToRewards.current = false;
    if (view?.k === 'sheet') setCelebrate([]);
    // Daily 3 opened from the Rewards sheet: BACK goes back to it, like the reveals do.
    if (view?.k === 'sheet' && sheetFromRewards) { setSheetFromRewards(false); setView({ k: 'rewards' }); return; }
    if (view?.k === 'push') void notePushAsked();
    if (view?.k === 'freezeSaved') void markFreezeSeen().then(r => applyDaily(r.state)).catch(() => undefined);
    setView(null);
  };

  const visible = !!view;
  // One door for every sheet (BLUEPRINT 4.3 rule 10): the overlay, opened by a tap or by itself, waits until no other
  // registered layer is up (a sheet still dismissing included), then presents.
  const layer = useNativeModalLayer(visible, 'wait');
  // Self-heal: if UIKit refused to present (another native sheet that does not register was mid-present), the
  // overlay would sit "open" in React and invisible on screen, and every later tap on its doors would do nothing.
  // No show within 2 s: let it go, and give a sheet the player asked for one more try.
  const shownRef = useRef(false);
  const dismissFallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (dismissFallback.current) clearTimeout(dismissFallback.current); }, []);
  const nativeGone = () => {
    if (dismissFallback.current) { clearTimeout(dismissFallback.current); dismissFallback.current = null; }
    layer.onDismissed();
    const next = afterHide.current;
    afterHide.current = null;
    next?.();
  };
  const presentNow = layer.present && visible;
  useEffect(() => {
    if (!presentNow) { shownRef.current = false; return undefined; }
    if (shownRef.current) return undefined;
    const asked = view;
    const timer = setTimeout(() => {
      if (shownRef.current || !mounted.current) return;
      setView(null);
      if (asked && (asked.k === 'rewards' || asked.k === 'sheet')) setTimeout(() => { if (mounted.current) setView(v => v ?? asked); }, 700);
    }, 2000);
    return () => clearTimeout(timer);
  }, [presentNow, view?.k]); // eslint-disable-line react-hooks/exhaustive-deps

  let button: ReactNode | null = null;
  if (wantDaily && daily) {
    const b = buttonState(daily, new Date().getHours());
    button = (
      <Daily3MapButton pips={b.pips} streak={b.streak} attention={b.attention} popIndex={pop.index} popKey={pop.key}
        active={o.mapFocused && !o.mapCovered && !visible} reducedMotion={reducedMotion}
        onPress={() => { playSfx('ui.tap'); openSheet(false); }} />
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
  if (view?.k === 'rewards') {
    title = 'Rewards';
    content = (
      <RewardsSheet rows={rows} flame={summary.flame} empty={emptyLine(rewardsInput)} busy={rewardsBusy} note={rewardsNote}
        reducedMotion={reducedMotion} onRow={onRewardsRow} onClose={close} />
    );
  } else if (view?.k === 'sheet' && daily) {
    content = (
      <Daily3Sheet state={daily} now={Date.now()} busy={busy} coins={player?.coins ?? 0} celebrate={celebrate}
        atPark={atPark} passToday={passOn ? passToday : null} remindersReady={flagOn(flags, 'retention_push')}
        closeLabel={sheetFromRewards ? 'BACK' : 'BACK TO MAP'}
        reducedMotion={reducedMotion} onClose={close} onGoal={onGoal} coach={coach} onCoachDone={coachDone}
        onReminders={on => { void toggleReminders(on); }}
        onClaim={() => { if (sheetFromRewards) backToRewards.current = true; setView({ k: 'reveal', src: 'daily', claimDate: daily.claimable_date, rewards: null, opening: false }); }}
        onClaimWeekly={() => { if (sheetFromRewards) backToRewards.current = true; setView({ k: 'reveal', src: 'weekly', rewards: null, opening: false }); }}
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
          <View style={styles.pips}>{[0, 1, 2, 3, 4].map(i => <View key={i} style={[styles.pip, i < 5 && styles.pipLit]} />)}</View>
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
        energySaved={!coinLevelsOpen} pinBoxes={flagOn(flags, 'pin_mystery_boxes')}
        subtitle={r.src === 'level' ? `You reached Level ${r.level}! Tap your chest.`
          : r.src === 'weekly' ? 'A whole week of flames. Tap the box!' : 'All three goals done. Tap your chest!'}
        closedArt={r.src === 'level' ? LEVEL_CHEST : r.src === 'weekly' ? WEEKLY : ICON_SOURCES.chest}
        openArt={r.src === 'level' ? LEVEL_CHEST_OPEN : r.src === 'weekly' ? WEEKLY_OPEN : ICON_SOURCES.chestOpen}
        wearBusy={wearing}
        onWear={() => { void wearItem(r.rewards); }}
        onPins={flagOn(flags, 'pin_mystery_boxes') ? () => { void finishReveal(r.rewards).then(() => RootNavigation.navigate('PinCollections')); } : undefined}
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
          accessibilityLabel={`Get a Streak Freeze for ${daily.streak.freeze_price} Shark Coins`}
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
    <Modal isVisible={layer.present && !!content} animationIn={reducedMotion ? 'fadeIn' : 'zoomIn'}
      onModalShow={() => { shownRef.current = true; }}
      // onModalHide fires when the hide animation ends, which is when UIKit only STARTS dismissing. The next native
      // sheet (the daily chest, Trail Boxes, the event sheet) waits for onDismiss, the real "gone" (a fallback covers
      // a platform that never sends it), so two native modals never present at once (the PLAY RIDE freeze).
      onModalHide={() => {
        if (dismissFallback.current) clearTimeout(dismissFallback.current);
        dismissFallback.current = setTimeout(nativeGone, NATIVE_GONE_FALLBACK_MS);
      }}
      onDismiss={nativeGone}
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

  return { button, overlay, occluding: visible, openRewards, rewards: summary };
}

/** Earned stamps whose prizes are still to claim (the Stamp Book's own rule). */
function stampsToClaim(r: { stamps: Record<string, readonly { id: number; is_earned: boolean; reward_claimed: boolean;
  rewards: { energy: number; tickets: number; xp: number; coins: number; title: string | null } }[]> }) {
  const out: { id: number }[] = [];
  for (const list of Object.values(r.stamps ?? {})) {
    for (const st of list ?? []) {
      const p = st.rewards;
      if (st.is_earned && !st.reward_claimed && !!p && (p.energy > 0 || p.tickets > 0 || p.xp > 0 || p.coins > 0 || !!p.title)) out.push({ id: st.id });
    }
  }
  return out;
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
  nextText: { fontFamily: 'Shark', fontSize: 16, color: BRAND.white, textAlign: 'center', flexShrink: 1 },
});
