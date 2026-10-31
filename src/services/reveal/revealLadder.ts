/**
 * The unlock ladder (core loop blueprint 4.4, October 2026): one feature at a time.
 *
 * Shared contract, owned by the guide-map lane. Every other lane imports from
 * here and never edits it:
 *   const { open, isNew, markSeen } = useRung('daily');
 *   recordProgress('line_played', { taskId, parkId });
 *
 * The pure rules (eligible, nextToOpen, the veteran, reveal_all and reinstall
 * rules, the one-NEW-per-open rule) live in ladderRules.ts and are re-exported
 * here. This file adds the store: phone counters and opened rungs saved per
 * player id (AsyncStorage key "tps.reveal.v1@p<id>"), the app-open clock, and
 * the useRung hook.
 *
 * Who feeds it:
 * - recordProgress: lineplay-ride (line_played, line_part_earned) and
 *   guide-map (park_day_started, park_day_done, home_day). Nobody else.
 * - feedLadder: the map (guide-map) passes the server progress (coins won,
 *   level up ready, level, team, keys, Trail Boxes, pins, reveal_all), the
 *   player's switches, whether the player is at a park and the in-line state.
 * Until the first feed (and the saved record) arrive, every paced rung reads
 * closed, so nothing flashes open and away.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { gameSavesPlayer } from '../../gamekit/core/playerStorage';
import {
  EMPTY_PROGRESS, RUNG_ORDER, initialOpened, localDay, nextToOpen, pickNewTag, rungVisible,
  type Progress, type ProgressEvent, type Rung,
} from './ladderRules';

export * from './ladderRules';

/** A return to the app after this long in the background is a new app open. */
export const APP_OPEN_GAP_MS = 10 * 60 * 1000;
const STORAGE_PREFIX = 'tps.reveal.v1';
const KEEP_DAYS = 40;

type Counters = Pick<Progress, 'linesPlayed' | 'linePartsOnOwned' | 'parkDaysStarted' | 'parkDaysDone' | 'homeDays'>;
type ServerProgress = Omit<Progress, keyof Counters>;

interface LadderRecord {
  v: 1;
  /** The first-sight rules (veteran, reinstall) already ran for this player. */
  initialized: boolean;
  opened: Partial<Record<Rung, number>>;
  seen: Partial<Record<Rung, boolean>>;
  shown: { rung: Rung; appOpenId: string } | null;
  counters: Counters;
  /** Dedupe keys per event: one park day start, one park day done and one home day per local day. */
  days: { started: string[]; done: string[]; home: string[] };
  firstCoinToday: { day: string; at: number } | null;
  lastCoinsWon: number | null;
}

const freshRecord = (): LadderRecord => ({
  v: 1, initialized: false, opened: {}, seen: {}, shown: null,
  counters: { linesPlayed: 0, linePartsOnOwned: 0, parkDaysStarted: 0, parkDaysDone: 0, homeDays: 0 },
  days: { started: [], done: [], home: [] }, firstCoinToday: null, lastCoinsWon: null,
});

let player: string | null = null;
let record: LadderRecord = freshRecord();
let hydrated = false;
let loading: Promise<void> | null = null;
let server: ServerProgress | null = null;
let flags: Record<string, boolean> = {};
let atPark = false;
let appOpenId = `open-${Date.now()}`;
let appOpenAt = Date.now();
let backgroundAt: number | null = null;
let appStateSub: { remove(): void } | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let version = 0;
let now: () => number = () => Date.now();
const listeners = new Set<() => void>();

function emit(): void {
  version += 1;
  listeners.forEach(listener => {
    try { listener(); } catch { /* one bad listener never stops the rest */ }
  });
}

const storageKey = (id: string) => `${STORAGE_PREFIX}@p${id}`;

function persist(): void {
  if (!player) return;
  const snapshot = JSON.stringify(record);
  AsyncStorage.setItem(storageKey(player), snapshot).catch(() => { /* the ladder reopens from server facts */ });
}

function parseRecord(raw: string | null): LadderRecord | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || value.v !== 1 || typeof value.opened !== 'object') return null;
    const base = freshRecord();
    return {
      ...base, ...value,
      counters: { ...base.counters, ...(value.counters ?? {}) },
      days: { ...base.days, ...(value.days ?? {}) },
      seen: value.seen ?? {}, opened: value.opened ?? {},
    };
  } catch {
    return null;
  }
}

/** Follow the signed-in player. A different player gets their own record. */
function syncPlayer(): void {
  const id = gameSavesPlayer();
  if (id === player && (hydrated || loading)) return;
  player = id;
  record = freshRecord();
  hydrated = false;
  loading = null;
  if (!id) { emit(); return; }
  const mine = id;
  loading = AsyncStorage.getItem(storageKey(mine))
    .then(raw => {
      if (player !== mine) return;
      record = parseRecord(raw) ?? record;
    })
    .catch(() => { /* start fresh; server facts reopen what they can */ })
    .finally(() => {
      if (player !== mine) return;
      hydrated = true;
      loading = null;
      evaluate();
      emit();
    });
}

function progress(): Progress {
  return { ...EMPTY_PROGRESS, ...(server ?? {}), ...record.counters };
}

function firstCoinTodayAt(at: number): number | null {
  const today = localDay(at);
  return record.firstCoinToday?.day === today ? record.firstCoinToday.at : null;
}

/** Open what the pace allows. Runs after every input change and once a minute at a park. */
function evaluate(): void {
  if (!player || !hydrated || !server) return;
  const at = now();
  let changed = false;
  if (!record.initialized) {
    const first = initialOpened(progress(), flags);
    record = { ...record, initialized: true, opened: { ...first.opened, ...record.opened } };
    changed = true;
  }
  for (let i = 0; i < RUNG_ORDER.length; i += 1) {
    const rung = nextToOpen(record.opened, progress(), flags,
      { atPark, now: at, appOpenId, appOpenAt, firstCoinTodayAt: firstCoinTodayAt(at) });
    if (!rung) break;
    record = { ...record, opened: { ...record.opened, [rung]: at } };
    changed = true;
  }
  const tag = pickNewTag(record.opened, record.seen, record.shown, appOpenId);
  if (tag && (record.shown?.appOpenId !== appOpenId || record.shown.rung !== tag)) {
    record = { ...record, shown: { rung: tag, appOpenId } };
    changed = true;
  }
  if (changed) { persist(); emit(); }
}

function onAppState(state: string): void {
  const at = now();
  if (state === 'active') {
    if (backgroundAt !== null && at - backgroundAt >= APP_OPEN_GAP_MS) startAppOpen(at);
    backgroundAt = null;
  } else if (state === 'background') {
    backgroundAt = at;
  }
}

function startTimers(): void {
  if (!appStateSub) {
    try { appStateSub = AppState.addEventListener('change', onAppState); } catch { appStateSub = null; }
  }
  if (atPark && listeners.size > 0 && !timer) timer = setInterval(evaluate, 60_000);
  if ((!atPark || listeners.size === 0) && timer) { clearInterval(timer); timer = null; }
}

/** This app open's id (cold start, or back after APP_OPEN_GAP_MS away): the attention rules key on it. */
export function currentAppOpen(): string {
  return appOpenId;
}

/** A new app open (cold start, or back after APP_OPEN_GAP_MS away). */
export function startAppOpen(at: number = now()): void {
  appOpenId = `open-${at}`;
  appOpenAt = at;
  evaluate();
  emit();
}

/**
 * Record a phone-side progress event for the signed-in player. Callers:
 * lineplay-ride (line_played on a wait's first verified minute, line_part_earned
 * when a Part lands on a coin the player owns) and guide-map (park_day_started,
 * park_day_done, home_day). Day events count once per local day.
 */
export function recordProgress(event: ProgressEvent, data?: { taskId?: number; parkId?: number }): void {
  syncPlayer();
  if (!player) return;
  const apply = () => {
    const day = localDay(now());
    const c = { ...record.counters };
    const days = { started: [...record.days.started], done: [...record.days.done], home: [...record.days.home] };
    const once = (list: string[], key: string) => {
      if (list.includes(key)) return false;
      list.push(key);
      if (list.length > KEEP_DAYS) list.splice(0, list.length - KEEP_DAYS);
      return true;
    };
    switch (event) {
      case 'line_played': c.linesPlayed += 1; break;
      case 'line_part_earned': c.linePartsOnOwned += 1; break;
      case 'park_day_started': if (once(days.started, day)) c.parkDaysStarted += 1; else return; break;
      case 'park_day_done': if (once(days.done, day)) c.parkDaysDone += 1; else return; break;
      case 'home_day': if (once(days.home, day)) c.homeDays += 1; else return; break;
      default: return;
    }
    void data;
    record = { ...record, counters: c, days };
    persist();
    evaluate();
    emit();
  };
  if (hydrated) apply();
  else if (loading) loading.then(apply, apply);
}

/**
 * The map's feed: server progress, the player's switches, and the place.
 * Partial updates merge. Coins won going up at a park marks the day's first
 * coin, which starts the park's hourly pace.
 */
export function feedLadder(input: {
  progress?: Partial<ServerProgress>;
  flags?: Record<string, boolean>;
  atPark?: boolean;
}): void {
  syncPlayer();
  const at = now();
  if (input.flags) flags = { ...input.flags };
  if (typeof input.atPark === 'boolean') atPark = input.atPark;
  if (input.progress) {
    const next = { ...EMPTY_PROGRESS, ...(server ?? {}), ...input.progress } as Progress;
    const { linesPlayed: _a, linePartsOnOwned: _b, parkDaysStarted: _c, parkDaysDone: _d, homeDays: _e, ...rest } = next;
    server = rest;
    const coins = Number.isFinite(rest.coinsWon) ? rest.coinsWon : 0;
    if (hydrated) {
      const last = record.lastCoinsWon;
      if (last !== null && coins > last && atPark && firstCoinTodayAt(at) === null) {
        record = { ...record, firstCoinToday: { day: localDay(at), at } };
      }
      if (last !== coins) { record = { ...record, lastCoinsWon: coins }; persist(); }
    }
  }
  startTimers();
  evaluate();
  emit();
}

/** Clear a rung's NEW tag (call when the player opens or taps the feature). */
export function markRungSeen(rung: Rung): void {
  if (!player || record.seen[rung]) return;
  record = { ...record, seen: { ...record.seen, [rung]: true } };
  persist();
  emit();
}

function rungKey(rung: Rung): string {
  if (!player || !hydrated || !server) return '00';
  const visible = rungVisible(rung, record.opened, progress(), flags);
  const isNew = visible && !progress().revealAll &&
    pickNewTag(record.opened, record.seen, record.shown, appOpenId) === rung;
  return `${visible ? 1 : 0}${isNew ? 1 : 0}`;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  syncPlayer();
  startTimers();
  return () => {
    listeners.delete(listener);
    startTimers();
  };
}

/** Whether a rung shows, whether it wears its NEW tag, and how to clear the tag. */
export function useRung(rung: Rung): { open: boolean; isNew: boolean; markSeen(): void } {
  const key = useSyncExternalStore(subscribe, () => rungKey(rung), () => '00');
  const markSeen = useCallback(() => markRungSeen(rung), [rung]);
  return { open: key[0] === '1', isNew: key[1] === '1', markSeen };
}

/** The phone counters for the signed-in player (park days, home days, lines played), read only. */
export function ladderCounters(): Readonly<Counters> {
  return { ...record.counters };
}

const countersKey = () => (player && hydrated ? JSON.stringify(record.counters) : '');

/** The phone counters as a hook (the home menu's Practice games appear from the 2nd home visit). */
export function useLadderCounters(): Readonly<Counters> {
  const key = useSyncExternalStore(subscribe, countersKey, () => '');
  return key ? (JSON.parse(key) as Counters) : freshRecord().counters;
}

/** Read without React (tests, captures, the map's own logic). */
export function rungState(rung: Rung): { open: boolean; isNew: boolean } {
  const key = rungKey(rung);
  return { open: key[0] === '1', isNew: key[1] === '1' };
}

/** Tests only: a fresh store with an injectable clock. */
export const __ladderTest = {
  reset(clock?: () => number): void {
    if (timer) clearInterval(timer);
    timer = null;
    appStateSub?.remove();
    appStateSub = null;
    now = clock ?? (() => Date.now());
    player = null; record = freshRecord(); hydrated = false; loading = null;
    server = null; flags = {}; atPark = false; backgroundAt = null;
    appOpenId = `open-${now()}`; appOpenAt = now();
    listeners.clear();
  },
  whenReady(): Promise<void> { return loading ?? Promise.resolve(); },
  record(): LadderRecord { return record; },
  appState: onAppState,
  version(): number { return version; },
};
