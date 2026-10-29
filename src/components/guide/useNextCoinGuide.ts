/**
 * The map's side of the Next Coin guide (core loop blueprint 4.1, October 2026).
 *
 * The map is the only caller of guide.resolve: it turns its islands, the live feed, today's
 * Adventure, the in-line dwell and the wallet into one target and one card state, on every
 * location, live or data change. Every other screen only calls guide.setTarget.
 * Owned by the guide-map lane.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { TaskType } from '../../models/task-type';
import type { RideType } from '../../api/endpoints/rides';
import type { LivePark } from '../../api/endpoints/parks/live';
import type { AdventureTicket } from '../../api/endpoints/me/trip-goal';
import { loadParkRides } from '../../services/lineplay/resolveRide';
import {
  ARRIVE_MS, guide, guideMeters, guideState, liveAnswers, MAX_TARGET_METERS,
  type GuideAdventure, type GuideState, type GuideTarget, type LiveMemo,
} from '../../services/guide/nextCoin';
import { nextFreeTicket, type FreeTicketsInput } from '../../services/guide/freeTickets';
import { guideCardCopy, restingSightCopy, type GuideCardCopy } from '../../services/guide/guideCopy';
import { adventureAfterWin, guideCoinsFor, inLineTaskFor, ridesByTask, showLikeTaskIds, withAdventureCoin, withPlayRange } from './guideCoins';

export interface NextCoinGuideInput {
  readonly enabled: boolean;
  /**
   * The map's data has arrived (the islands, and the live feed and today's Adventure, or a short wait
   * for them ran out). Until then the guide picks nothing: a first pick made on half the data would
   * hold (the target does not flip-flop), so Today's Adventure could lose to the nearest ride.
   */
  readonly ready?: boolean;
  /**
   * Today's trip goal (and its Adventure) has answered. A coin the guide chose before it and the ride
   * catalog answered (a slow server) gives way once, when both are in, so a late Adventure is never lost.
   */
  readonly tripGoalLoaded?: boolean;
  readonly parkId: number | null;
  readonly parkName: string | null;
  readonly location: { readonly latitude: number; readonly longitude: number } | null | undefined;
  readonly tasks: readonly TaskType[];
  readonly live: LivePark | null;
  readonly adventure: AdventureTicket | null;
  /**
   * Today's Adventure coin was just won on this map, before the trip goal re-read says so: the guide
   * treats the ticket as on its line story already (the won coin leaves the map list at once, and
   * without this the guide would grab the nearest ride first and hold it).
   */
  readonly adventureWonTaskId?: number | null;
  /** The ride detector's 90 s dwell (a catalog ride id), or null. */
  readonly dwellRideId: number | null;
  readonly starTaskIds?: ReadonlySet<number>;
  readonly rushTaskIds?: ReadonlySet<number>;
  /** Coins on the player's shelf in this park (the map's own list carries no ownership). */
  readonly ownedTaskIds?: ReadonlySet<number>;
  /** Owned coins ready to level up now (the trip goal's paid-for next level). */
  readonly levelUpTaskIds?: ReadonlySet<number>;
  readonly starRushUnlocked: boolean;
  readonly coinLevelsUnlocked: boolean;
  readonly wallet: FreeTicketsInput | null;
  readonly queueTicketsOn: boolean;
  /** The coin PLAY! is up for right now (the server's own range check), or null. It decides "You're here". */
  readonly playableTaskId?: number | null;
  /** Whole days since the last app open (14 or more is a welcome back), or null. */
  readonly daysAway?: number | null;
  readonly welcomeBackDone?: boolean;
  /** Today's Adventure ride's line is in reach (the Adventure sheet's play gate is not 'far'). */
  readonly lineStoryNear?: boolean;
}

export interface NextCoinGuide {
  readonly target: GuideTarget | null;
  readonly state: GuideState;
  readonly copy: GuideCardCopy;
  /** The coin whose line the player stands in, or null. */
  readonly inLineTaskId: number | null;
  /** Catalog rides by coin (for LinePlay and the queue checks). */
  readonly rides: ReadonlyMap<number, RideType>;
  /** The resolved task behind the target (coin art, position), when it is on today's map. */
  readonly targetTask: TaskType | null;
  /**
   * Where the target is, from the guide's own coin: set even when the coin is not on today's map
   * (today's Adventure ride after its coin is won, kept for its Line story), so the card, the dotted
   * path and the edge arrow always agree (one owner of the pointer).
   */
  readonly targetPoint: { readonly latitude: number; readonly longitude: number } | null;
  /**
   * Today's Adventure is active in this park but the card points elsewhere: the card shows the
   * Adventure's ticket tab (its door to the sheet), so steps 2 and 3 and the detour picker stay reachable.
   */
  readonly adventureTab: boolean;
  /** The target is not one of today's map islands (a won Adventure coin waiting on its Line story). */
  readonly targetOffMap: boolean;
  /** The first in-park reading of this visit (epoch ms), or null: the attention rules' 30 s quiet. */
  readonly arrivedAt: number | null;
}

const adventureFor = (ticket: AdventureTicket | null, parkId: number | null): GuideAdventure | null =>
  ticket && parkId != null && ticket.park_id === parkId
    ? { taskId: ticket.ride.task_id, parkId: ticket.park_id, phase: ticket.phase } : null;

/** The guide as the map sees it. */
export default function useNextCoinGuide(raw: NextCoinGuideInput): NextCoinGuide {
  const wonAdventure = useMemo(() => adventureAfterWin(raw.adventure, raw.adventureWonTaskId),
    [raw.adventure, raw.adventureWonTaskId]);
  const input = wonAdventure === raw.adventure ? raw : { ...raw, adventure: wonAdventure };
  const { enabled, parkId } = input;
  // The park's ride catalog: which coins are rides, which have a real queue, and the dwell's coin.
  const [catalog, setCatalog] = useState<{ parkId: number; rides: Map<number, RideType> } | null>(null);
  useEffect(() => {
    if (!enabled || parkId == null) return undefined;
    let active = true;
    void loadParkRides(parkId).then(rides => {
      if (active) setCatalog({ parkId, rides: ridesByTask(rides) });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [enabled, parkId]);
  const rides = useMemo(() => (catalog && catalog.parkId === parkId ? catalog.rides : new Map<number, RideType>()), [catalog, parkId]);

  // Live status, honestly: a known-closed ride stays closed until a fresh open answer (liveAnswers).
  const memo = useRef<{ parkId: number | null; value: Record<number, LiveMemo> }>({ parkId: null, value: {} });
  if (memo.current.parkId !== parkId) memo.current = { parkId, value: {} };
  const [minute, setMinute] = useState(0);
  useEffect(() => {
    if (!enabled || parkId == null) return undefined;
    const timer = setInterval(() => setMinute(m => m + 1), 60_000);
    return () => clearInterval(timer);
  }, [enabled, parkId]);
  const answers = useMemo(() => {
    const next = liveAnswers(memo.current.value, input.live, Date.now());
    memo.current = { parkId, value: next.memo };
    return next.answers;
  }, [input.live, parkId, minute]); // eslint-disable-line react-hooks/exhaustive-deps

  const liveTaskIds = useMemo(() => new Set((input.live?.rides ?? []).map(ride => ride.task_id)), [input.live]);
  const coins = useMemo(() => withAdventureCoin(guideCoinsFor(input.tasks, parkId, {
    rides, liveTaskIds, starTaskIds: input.starTaskIds, rushTaskIds: input.rushTaskIds, ownedTaskIds: input.ownedTaskIds,
    levelUpTaskIds: input.levelUpTaskIds,
  }), input.adventure, parkId), [input.tasks, parkId, rides, liveTaskIds, input.starTaskIds, input.rushTaskIds, input.ownedTaskIds,
    input.levelUpTaskIds, input.adventure]);
  // Rides the feed has ever posted a wait for this session: a show (open, never a wait) is not a line.
  const waitSeen = useRef<{ parkId: number | null; ids: Set<number> }>({ parkId: null, ids: new Set() });
  if (waitSeen.current.parkId !== parkId) waitSeen.current = { parkId, ids: new Set() };
  for (const row of input.live?.rides ?? []) if (typeof row.wait === 'number') waitSeen.current.ids.add(row.task_id);
  const showLike = useMemo(() => showLikeTaskIds(input.live, waitSeen.current.ids), [input.live, parkId]); // eslint-disable-line react-hooks/exhaustive-deps
  const inLineTaskId = useMemo(() => inLineTaskFor(input.dwellRideId, rides, coins, showLike), [input.dwellRideId, rides, coins, showLike]);

  // Arrival: the first in-park reading of this visit starts the 30 s welcome.
  const arrived = useRef<{ parkId: number | null; at: number | null }>({ parkId: null, at: null });
  if (arrived.current.parkId !== parkId) arrived.current = { parkId, at: parkId != null && input.location ? Date.now() : null };
  else if (arrived.current.at === null && parkId != null && input.location) arrived.current = { parkId, at: Date.now() };
  const arrivedAt = arrived.current.at;
  const [, setArriveTick] = useState(0);
  useEffect(() => {
    if (arrivedAt === null) return undefined;
    const left = arrivedAt + ARRIVE_MS - Date.now();
    if (left <= 0) return undefined;
    const timer = setTimeout(() => setArriveTick(t => t + 1), left + 50);
    return () => clearTimeout(timer);
  }, [arrivedAt]);

  const adventure = adventureFor(input.adventure, parkId);
  const lat = input.location ? Math.round(input.location.latitude * 20000) / 20000 : null;
  const lng = input.location ? Math.round(input.location.longitude * 20000) / 20000 : null;
  const coinsKey = coins.map(c => `${c.taskId}:${+c.owned}${c.kind[0]}${+!!c.queue}${+!!c.star}${+!!c.rush}${+!!c.levelUpReady}`).join('|');
  const answersKey = Object.entries(answers).map(([k, v]) => `${k}${v[0]}`).join(',');
  const ready = input.ready !== false;
  useEffect(() => {
    if (!enabled || parkId == null || !ready) return;
    guide.resolve({
      mode: 'park', parkId, location: input.location ? { latitude: input.location.latitude, longitude: input.location.longitude } : null,
      coins, live: answers, adventure, inLineTaskId, playableTaskId: input.playableTaskId,
      starRushUnlocked: input.starRushUnlocked, coinLevelsUnlocked: input.coinLevelsUnlocked,
    });
  }, [enabled, ready, parkId, lat, lng, coinsKey, answersKey, adventure?.taskId, adventure?.phase, inLineTaskId, input.playableTaskId, // eslint-disable-line react-hooks/exhaustive-deps
    input.starRushUnlocked, input.coinLevelsUnlocked]);
  // Any screen's guide.setTarget lands on the next resolve: re-run it when the store's input version
  // moves (a pick, a skipped step, a reset), never on resolve's own target notice.
  const [pickTick, setPickTick] = useState(() => guide.version());
  useEffect(() => guide.subscribe(() => setPickTick(guide.version())), []);
  const lastPick = useRef(pickTick);
  useEffect(() => {
    if (pickTick === lastPick.current) return;
    lastPick.current = pickTick;
    if (!enabled || parkId == null || !ready) return;
    guide.resolve({
      mode: 'park', parkId, location: input.location ? { latitude: input.location.latitude, longitude: input.location.longitude } : null,
      coins, live: answers, adventure, inLineTaskId, playableTaskId: input.playableTaskId,
      starRushUnlocked: input.starRushUnlocked, coinLevelsUnlocked: input.coinLevelsUnlocked,
    });
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // A coin the guide chose on partial data (no trip goal or no ride catalog yet) gives way once when both
  // land: the player never picked it, and the full data may hold today's Adventure (rule 1 or 5).
  const complete = input.tripGoalLoaded !== false && catalog?.parkId === parkId;
  const partialPick = useRef<{ parkId: number | null; taskId: number } | null>(null);
  useEffect(() => {
    if (!enabled || parkId == null || !ready) return undefined;
    const held = guide.current();
    if (!complete) {
      if (held && held.source === 'guide' && held.parkId === parkId) partialPick.current = { parkId, taskId: held.taskId };
      return undefined;
    }
    const partial = partialPick.current;
    partialPick.current = null;
    if (partial && partial.parkId === parkId && held?.taskId === partial.taskId) guide.releaseGuidePick();
    return undefined;
  });
  const target = useSyncExternalStore(guide.subscribe, guide.current, guide.current);
  const held = enabled && ready && target && target.parkId === parkId ? target : null;
  // "You're here" only while PLAY! is really up for this coin (the server's range check wins over geometry).
  const shown = withPlayRange(held, input.playableTaskId);
  const state = !ready && enabled ? 'arrive' : guideState({
    mode: 'park', parkId, location: input.location ?? null, coins, live: answers, adventure, inLineTaskId,
    now: Date.now(), arrivedAt, daysAway: input.daysAway ?? null, welcomeBackDone: input.welcomeBackDone,
    wallet: input.wallet,
  }, shown);

  // Resting = closed for the night: no ride known open, and some known closed (one ride down is not a closed park).
  const known = Object.values(answers);
  const ridesResting = known.some(answer => answer === 'closed') && !known.some(answer => answer === 'open');
  const allOwned = coins.length > 0 && coins.every(coin => coin.owned);
  const here = input.location ? { latitude: input.location.latitude, longitude: input.location.longitude } : null;
  const outOfReach = !!here && coins.some(coin => !coin.owned) &&
    coins.filter(coin => !coin.owned).every(coin => guideMeters(here, coin) > MAX_TARGET_METERS);
  const adventureDots: [boolean, boolean, boolean] | null = input.adventure && shown &&
    input.adventure.ride.task_id === shown.taskId && input.adventure.park_id === parkId
    ? [!!input.adventure.discover, !!input.adventure.play, input.adventure.phase === 'complete'] : null;
  const copy = restingSightCopy(guideCardCopy(state, shown, {
    parkName: input.parkName, ridesResting, allOwned, outOfReach,
    tickets: input.wallet?.tickets ?? 0, freeStep: input.wallet ? nextFreeTicket(input.wallet) : null,
    queueTicketsOn: input.queueTicketsOn, adventureDots, lineStoryNear: input.lineStoryNear,
    adventureStep: adventureDots && input.adventure?.phase === 'celebrate' ? 'celebrate' : 'play',
  }), shown, ridesResting);
  const targetTask = shown ? input.tasks.find(task => task.id === shown.taskId) ?? null : null;
  const targetCoin = shown ? coins.find(coin => coin.taskId === shown.taskId) ?? null : null;
  const targetPoint = targetTask
    ? { latitude: Number(targetTask.latitude), longitude: Number(targetTask.longitude) }
    : targetCoin ? { latitude: targetCoin.latitude, longitude: targetCoin.longitude } : null;
  // Today's Adventure stays one tap away while the card points at another coin (after "Pick another
  // coin", a tapped island, a pick from the shelf, or its ride closing): the card wears its ticket tab.
  const adventureTab = !!input.adventure && input.adventure.park_id === parkId && input.adventure.phase !== 'complete'
    && !adventureDots && state !== 'arrive' && state !== 'welcome_back';
  return { target: shown, state, copy, inLineTaskId, rides, targetTask, targetPoint, targetOffMap: !!shown && !targetTask && !!targetCoin,
    arrivedAt, adventureTab };
}
