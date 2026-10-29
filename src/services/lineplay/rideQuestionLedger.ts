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
      (w.endedAt == null || Number.isFinite(w.endedAt))) : [];
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
    if (i >= 0) waits[i] = wait.endedAt != null || waits[i].endedAt == null ? wait : waits[i];
    else waits.push(wait);
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

export function ledgerWaits(): readonly LinePlayWait[] {
  return record.waits;
}

/** Tests only: forget everything in memory (the stored copy stays, as after an app relaunch). */
export function __forgetLedgerForTests(): void {
  record = fresh();
  owner = null;
  loaded = null;
}
