/**
 * The ride question ledger: what the phone remembers so a ride is asked about
 * once, even after the app is closed and opened again (core loop 4.3).
 *
 * It keeps, per player:
 *  - holds: rides the ride step ("I got to the ride") logged, with when the
 *    30 minute hold ends,
 *  - lastPromptAt: when the last ride question was put on screen (at most one
 *    every 20 minutes),
 *  - waits: LinePlay waits (ride, from, to). A detection of that ride whose
 *    visit overlaps one of them belonged to LinePlay, which asked its own
 *    question (or the guest told it they left), so it is never asked again.
 *    A boarding signal heard while the phone slept in a pocket is kept on its
 *    wait (boardingSeenAt) for LinePlay to ask about once, when the app is
 *    back in front (boardingAsked marks that the one question was put).
 *
 * Reads are synchronous from memory; the record loads from AsyncStorage once
 * (ensureRideQuestionLedger) and every change writes it back. Stored under
 * "tps.ride_question.v1@p<player id>". A background wake after an app kill has
 * no signed-in player yet, so the last player's id is kept beside it.
 *
 * No React or native imports beyond AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { gameSavesPlayer, playerKey } from '../../gamekit/core/playerStorage';

export const RIDE_QUESTION_KEY = 'tps.ride_question.v1';
const OWNER_KEY = 'tps.ride_question.owner';
/** A LinePlay wait older than this no longer decides anything. */
export const LINEPLAY_WAIT_KEEP_MS = 6 * 60 * 60_000;
/** A visit that started or ended this close to a LinePlay wait is the same line. */
export const LINEPLAY_WAIT_GRACE_MS = 2 * 60_000;
/**
 * A wait never marked ended (the app was killed and LinePlay never came back) stops counting after this,
 * so a lost end is never a mute on that ride for the rest of the day.
 */
export const LINEPLAY_OPEN_WAIT_CAP_MS = 3 * 60 * 60_000;
const MAX_WAITS = 12;

export interface LinePlayWait {
  readonly rideId: number;
  readonly startedAt: number;
  /** null while the wait is still running. */
  readonly endedAt: number | null;
  /** When ride detection saw the guest leave this ride's zone during the wait (the boarding signal), if it did. */
  readonly boardingSeenAt?: number | null;
  /** LinePlay already put this wait's one ride question (or the guest answered how it ended). */
  readonly boardingAsked?: boolean;
}

interface LedgerRecord {
  v: 1;
  holds: Record<string, number>;
  lastPromptAt: number | null;
  waits: LinePlayWait[];
}

const fresh = (): LedgerRecord => ({ v: 1, holds: {}, lastPromptAt: null, waits: [] });

let record: LedgerRecord = fresh();
let owner: string | null = null;
let loaded: Promise<void> | null = null;

function parse(raw: string | null): LedgerRecord | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || value.v !== 1) return null;
    const waits = Array.isArray(value.waits) ? value.waits.filter((w: LinePlayWait) =>
      w && Number.isInteger(w.rideId) && w.rideId > 0 && Number.isFinite(w.startedAt) &&
      (w.endedAt == null || Number.isFinite(w.endedAt))).map((w: LinePlayWait) => ({ rideId: w.rideId,
      startedAt: w.startedAt, endedAt: w.endedAt ?? null,
      boardingSeenAt: Number.isFinite(w.boardingSeenAt) ? w.boardingSeenAt : null, boardingAsked: w.boardingAsked === true })) : [];
    const holds: Record<string, number> = {};
    for (const [id, until] of Object.entries(value.holds ?? {})) {
      if (Number.isFinite(until as number)) holds[id] = until as number;
    }
    return { v: 1, holds, waits, lastPromptAt: Number.isFinite(value.lastPromptAt) ? value.lastPromptAt : null };
  } catch {
    return null;
  }
}

/** Merge what was stored with what changed in memory before the load finished (newest wins). */
function merge(stored: LedgerRecord, live: LedgerRecord): LedgerRecord {
  const holds = { ...stored.holds };
  for (const [id, until] of Object.entries(live.holds)) holds[id] = Math.max(holds[id] ?? 0, until);
  const waits = [...stored.waits];
  for (const wait of live.waits) {
    const i = waits.findIndex(w => w.rideId === wait.rideId && w.startedAt === wait.startedAt);
    if (i >= 0) {
      const kept = wait.endedAt != null || waits[i].endedAt == null ? wait : waits[i];
      // A boarding signal or an asked question on either copy is kept.
      waits[i] = { ...kept, boardingSeenAt: wait.boardingSeenAt ?? waits[i].boardingSeenAt ?? null,
        boardingAsked: wait.boardingAsked === true || waits[i].boardingAsked === true };
    } else waits.push(wait);
  }
  const lastPromptAt = Math.max(stored.lastPromptAt ?? 0, live.lastPromptAt ?? 0) || null;
  return { v: 1, holds, lastPromptAt, waits: waits.slice(-MAX_WAITS) };
}

function currentOwner(): string | null {
  return gameSavesPlayer();
}

/**
 * Whose phone record this is: the signed-in player, or after a background wake with nobody signed in yet,
 * the last player who was (null: never known). Ride detections are tagged with it, so one account's rides
 * never become another account's ride questions on a shared phone.
 */
export function rideQuestionOwner(): string | null {
  return currentOwner() ?? owner;
}

/** Load the signed-in player's record (once per player). Safe to call often. */
export function ensureRideQuestionLedger(): Promise<void> {
  const signedIn = currentOwner();
  if (loaded && (signedIn == null || signedIn === owner)) return loaded;
  // Another player signed in: their own record. The first load keeps what changed before it.
  if (loaded) record = fresh();
  loaded = (async () => {
    let id = signedIn;
    try {
      if (id) await AsyncStorage.setItem(OWNER_KEY, id);
      else id = await AsyncStorage.getItem(OWNER_KEY);
    } catch { /* no owner: the guest record */ }
    owner = id;
    try {
      const stored = parse(await AsyncStorage.getItem(playerKey(RIDE_QUESTION_KEY, id)));
      if (stored) record = merge(stored, record);
    } catch { /* start fresh: a lost hold only means one more question */ }
    prune(Date.now());
  })();
  return loaded;
}

/** Where a wait ends for every rule: its real end, or the cap for one whose end was lost. */
function waitEnd(w: LinePlayWait, now: number): number {
  return w.endedAt ?? Math.min(now, w.startedAt + LINEPLAY_OPEN_WAIT_CAP_MS);
}

function prune(now: number): void {
  for (const [id, until] of Object.entries(record.holds)) if (until <= now) delete record.holds[id];
  record.waits = record.waits.filter(w => waitEnd(w, now) > now - LINEPLAY_WAIT_KEEP_MS).slice(-MAX_WAITS);
}

function save(): void {
  if (!loaded) void ensureRideQuestionLedger();
  // Written after the load, so the stored record is merged first and never overwritten by a partial one.
  void loaded!.then(() => AsyncStorage.setItem(playerKey(RIDE_QUESTION_KEY, owner), JSON.stringify(record)))
    .catch(() => undefined);
}

// -- holds -------------------------------------------------------------------

export function setRideHold(rideId: number, until: number): void {
  if (!Number.isInteger(rideId) || rideId <= 0 || !Number.isFinite(until)) return;
  record.holds[String(rideId)] = Math.max(record.holds[String(rideId)] ?? 0, until);
  save();
}

/** When the ride step's hold on this ride ends (null: no hold). */
export function rideHoldUntil(rideId: number, now = Date.now()): number | null {
  const until = record.holds[String(rideId)];
  if (until == null) return null;
  if (until <= now) { delete record.holds[String(rideId)]; return null; }
  return until;
}

// -- the prompt clock --------------------------------------------------------

export function setLastRidePromptAt(at: number): void {
  if (!Number.isFinite(at)) return;
  record.lastPromptAt = Math.max(record.lastPromptAt ?? 0, at);
  save();
}

export function ledgerLastPromptAt(): number | null {
  return record.lastPromptAt;
}

// -- LinePlay waits ----------------------------------------------------------

/** A LinePlay wait is running at this ride (since `startedAt`; an earlier real start widens a running one). */
export function noteLinePlayWaitStarted(rideId: number, startedAt: number): void {
  if (!Number.isInteger(rideId) || rideId <= 0 || !Number.isFinite(startedAt)) return;
  const now = Date.now();
  // A running wait whose end was lost long ago is closed at its cap; this is a new wait.
  record.waits = record.waits.map(w => w.rideId === rideId && w.endedAt == null &&
    w.startedAt + LINEPLAY_OPEN_WAIT_CAP_MS <= Math.max(now, startedAt) ? { ...w, endedAt: w.startedAt + LINEPLAY_OPEN_WAIT_CAP_MS } : w);
  const i = record.waits.findIndex(w => w.rideId === rideId && w.endedAt == null);
  if (i >= 0) {
    if (record.waits[i].startedAt <= startedAt) return;
    record.waits = record.waits.map((w, k) => k === i ? { ...w, startedAt } : w);
  } else {
    record.waits = [...record.waits, { rideId, startedAt, endedAt: null }];
  }
  prune(now);
  save();
}

/** The LinePlay wait at this ride ended (any way: rode, left, or the screen closed). */
export function noteLinePlayWaitEnded(rideId: number, endedAt: number): void {
  let changed = false;
  record.waits = record.waits.map(w => {
    if (w.rideId !== rideId || w.endedAt != null || w.startedAt > endedAt) return w;
    changed = true;
    return { ...w, endedAt };
  });
  if (!changed) record.waits = [...record.waits, { rideId, startedAt: endedAt, endedAt }];
  prune(Date.now());
  save();
}

/**
 * Did this ride visit happen during a LinePlay wait at the same ride? Then
 * LinePlay owned its ride question, and nothing asks about it again.
 */
export function visitInLinePlayWait(rideId: number, enteredAt: number, exitedAt: number | null, now = Date.now()): boolean {
  const to = exitedAt ?? now;
  return record.waits.some(w => w.rideId === rideId &&
    enteredAt <= waitEnd(w, now) + LINEPLAY_WAIT_GRACE_MS && to >= w.startedAt - LINEPLAY_WAIT_GRACE_MS);
}

/** The LinePlay wait at this ride that `at` falls in (the newest when several do), or -1. */
function waitIndexAt(rideId: number, at: number, now: number): number {
  for (let i = record.waits.length - 1; i >= 0; i--) {
    const w = record.waits[i];
    if (w.rideId === rideId && at >= w.startedAt - LINEPLAY_WAIT_GRACE_MS && at <= waitEnd(w, now) + LINEPLAY_WAIT_GRACE_MS) return i;
  }
  return -1;
}

/**
 * Ride detection saw the guest leave this ride's zone at `at`, inside a LinePlay wait there (the boarding
 * signal). Kept on that wait so LinePlay can ask its one "Did you get to the ride?" when the app is back
 * in front, even after a relaunch. The newest signal wins; nothing changes once the question was put.
 */
export function noteLinePlayBoardingSeen(rideId: number, at: number, now = Date.now()): boolean {
  if (!Number.isInteger(rideId) || rideId <= 0 || !Number.isFinite(at)) return false;
  const i = waitIndexAt(rideId, at, now);
  if (i < 0 || record.waits[i].boardingAsked) return false;
  record.waits = record.waits.map((w, k) => k === i ? { ...w, boardingSeenAt: Math.max(w.boardingSeenAt ?? 0, at) } : w);
  save();
  return true;
}

/**
 * LinePlay's wait (ride, started at `startedAt`) is about to put its one ride question about a boarding
 * signal kept while the phone slept: returns when the guest left the zone, and marks the question put.
 * Null when there is none, or the question was already put for this wait.
 */
export function takeLinePlayBoarding(rideId: number, startedAt: number, now = Date.now()): number | null {
  if (!Number.isInteger(rideId) || !Number.isFinite(startedAt)) return null;
  const i = waitIndexAt(rideId, startedAt, now);
  if (i < 0) return null;
  const w = record.waits[i];
  if (w.boardingAsked || w.boardingSeenAt == null) return null;
  record.waits = record.waits.map((x, k) => k === i ? { ...x, boardingAsked: true } : x);
  save();
  return w.boardingSeenAt;
}

/** Is a boarding signal kept on the LinePlay wait that `startedAt` falls in, still waiting for its question? */
export function linePlayBoardingPending(rideId: number, startedAt: number, now = Date.now()): boolean {
  const i = waitIndexAt(rideId, startedAt, now);
  return i >= 0 && record.waits[i].boardingSeenAt != null && !record.waits[i].boardingAsked;
}

/** Has this wait's one ride question already been put (or answered)? */
export function linePlayBoardingAsked(rideId: number, startedAt: number, now = Date.now()): boolean {
  const i = waitIndexAt(rideId, startedAt, now);
  return i >= 0 && record.waits[i].boardingAsked === true;
}

/** A wait LinePlay can still reopen to ask about: its checkpoint lasts 3 hours from the start (a margin kept). */
export const LINEPLAY_REOPEN_MAX_MS = LINEPLAY_OPEN_WAIT_CAP_MS - 10 * 60_000;

/** LinePlay waits with a boarding signal whose question was never put (newest first), still reopenable. */
export function unaskedLinePlayBoardings(now = Date.now()): readonly LinePlayWait[] {
  return record.waits.filter(w => w.boardingSeenAt != null && !w.boardingAsked &&
    now - w.startedAt <= LINEPLAY_REOPEN_MAX_MS).slice().reverse();
}

/** This wait's one ride question was put or answered some other way (the boarding sheet, the end sheet). */
export function markLinePlayBoardingAsked(rideId: number, startedAt: number, now = Date.now()): void {
  if (!Number.isInteger(rideId) || !Number.isFinite(startedAt)) return;
  const i = waitIndexAt(rideId, startedAt, now);
  if (i < 0 || record.waits[i].boardingAsked) return;
  record.waits = record.waits.map((x, k) => k === i ? { ...x, boardingAsked: true } : x);
  save();
}

export function ledgerWaits(): readonly LinePlayWait[] {
  return record.waits;
}

/** Tests only: forget everything in memory (the stored copy stays, as after an app relaunch). */
export function __forgetLedgerForTests(): void {
  record = fresh();
  owner = null;
  loaded = null;
}
