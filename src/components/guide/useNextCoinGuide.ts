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
import { guideCoinsFor, inLineTaskFor, ridesByTask, withAdventureCoin, withPlayRange } from './guideCoins';

export interface NextCoinGuideInput {
  readonly enabled: boolean;
  /**
   * The map's data has arrived (the islands, and the live feed and today's Adventure, or a short wait
   * for them ran out). Until then the guide picks nothing: a first pick made on half the data would
   * hold (the target does not flip-flop), so Today's Adventure could lose to the nearest ride.
   */
  readonly ready?: boolean;
  readonly parkId: number | null;
  readonly parkName: string | null;
  readonly location: { readonly latitude: number; readonly longitude: number } | null | undefined;
  readonly tasks: readonly TaskType[];
  readonly live: LivePark | null;
  readonly adventure: AdventureTicket | null;
  /** The ride detector's 90 s dwell (a catalog ride id), or null. */
  readonly dwellRideId: number | null;
  readonly starTaskIds?: ReadonlySet<number>;
  readonly rushTaskIds?: ReadonlySet<number>;
  /** Coins on the player's shelf in this park (the map's own list carries no ownership). */
  readonly ownedTaskIds?: ReadonlySet<number>;
  readonly starRushUnlocked: boolean;
  readonly coinLevelsUnlocked: boolean;
  readonly wallet: FreeTicketsInput | null;
  readonly queueTicketsOn: boolean;
  /** The coin PLAY! is up for right now (the server's own range check), or null. It decides "You're here". */
  readonly playableTaskId?: number | null;
  /** Whole days since the last app open (14 or more is a welcome back), or null. */
  readonly daysAway?: number | null;
  readonly welcomeBackDone?: boolean;
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
  /** The first in-park reading of this visit (epoch ms), or null: the attention rules' 30 s quiet. */
  readonly arrivedAt: number | null;
}

const adventureFor = (ticket: AdventureTicket | null, parkId: number | null): GuideAdventure | null =>
  ticket && parkId != null && ticket.park_id === parkId
    ? { taskId: ticket.ride.task_id, parkId: ticket.park_id, phase: ticket.phase } : null;

/** The guide as the map sees it. */
export default function useNextCoinGuide(input: NextCoinGuideInput): NextCoinGuide {
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
  }), input.adventure, parkId), [input.tasks, parkId, rides, liveTaskIds, input.starTaskIds, input.rushTaskIds, input.ownedTaskIds, input.adventure]);
  const inLineTaskId = useMemo(() => inLineTaskFor(input.dwellRideId, rides, coins), [input.dwellRideId, rides, coins]);

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
  const coinsKey = coins.map(c => `${c.taskId}:${+c.owned}${c.kind[0]}${+!!c.queue}${+!!c.star}${+!!c.rush}`).join('|');
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
  // Any screen's guide.setTarget lands on the next resolve: re-run it when the store says so.
  const [pickTick, setPickTick] = useState(0);
  useEffect(() => guide.subscribe(() => setPickTick(t => t + 1)), []);
  const lastPick = useRef(0);
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
    queueTicketsOn: input.queueTicketsOn, adventureDots,
  }), shown, ridesResting);
  const targetTask = shown ? input.tasks.find(task => task.id === shown.taskId) ?? null : null;
  return { target: shown, state, copy, inLineTaskId, rides, targetTask, arrivedAt };
}
