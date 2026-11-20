/**
 * The began mark (T6, arcade plan Nov 20 2026): a paid try "begins" when round 1 starts on screen. From then
 * on it is a played game: a force-quit, a dead phone or a reopen counts as a loss (its Parts are paid), never
 * a free replay. A try that never began (the kid shut the app on the how-to card) resumes for free.
 *
 * The phone saves the mark first (so a dead zone or a crash cannot lose it), then tells the server
 * (POST /me/task-attempts/{id}/began, idempotent) and retries until it lands. On app start and before any
 * saved try is read or reopened, the saved marks are sent first (flushBegan).
 *
 * Today's server has no began route: a 404 or 405 drops the mark (that server treats every try as begun at
 * PLAY! anyway). A finished try (422 or any 4xx) also drops it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { markTaskAttemptBegan } from '../../api/endpoints/me/task-attempts';

export const BEGAN_KEY = 'tps.taskAttemptBegan.v1';
/** Waits between tries while a mark has not landed (the app is open). */
export const BEGAN_RETRY_MS = [2000, 5000, 15000, 30000, 60000] as const;
/** Marks older than this are dropped (the server expires a try after 30 minutes). */
export const BEGAN_KEEP_MS = 2 * 60 * 60 * 1000;

type Saved = { readonly id: number; readonly at: number };

let memory: Saved[] | null = null;
const sending = new Map<number, Promise<boolean>>();
const landed = new Set<number>();
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryStep = 0;

async function readAll(): Promise<Saved[]> {
  if (memory) return memory;
  try {
    const raw = await AsyncStorage.getItem(BEGAN_KEY);
    const list = raw ? JSON.parse(raw) as unknown : [];
    memory = Array.isArray(list) ? list.filter((v): v is Saved => !!v && Number.isInteger((v as Saved).id) && typeof (v as Saved).at === 'number') : [];
  } catch {
    memory = [];
  }
  return memory;
}

async function writeAll(list: Saved[]): Promise<void> {
  memory = list;
  await AsyncStorage.setItem(BEGAN_KEY, JSON.stringify(list));
}

/** True when this phone saw round 1 of this try start (saved or already sent). */
export function beganHere(attemptId: number | null | undefined): boolean {
  if (!attemptId) return false;
  return landed.has(attemptId) || !!memory?.some(v => v.id === attemptId);
}

function statusOf(error: unknown): number | null {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  return typeof status === 'number' ? status : null;
}

/** Sends one saved mark. True when it is done (landed, or the server cannot take it); false to try again later. */
async function sendOne(id: number): Promise<boolean> {
  const running = sending.get(id);
  if (running) return running;
  const run = (async () => {
    try {
      await markTaskAttemptBegan(id);
      landed.add(id);
      return true;
    } catch (error) {
      const status = statusOf(error);
      // A 4xx will never change on a retry (no route on today's server, someone else's try, a finished try).
      if (status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429) return true;
      return false;
    }
  })().finally(() => sending.delete(id));
  sending.set(id, run);
  return run;
}

function scheduleRetry() {
  if (retryTimer) return;
  const wait = BEGAN_RETRY_MS[Math.min(retryStep, BEGAN_RETRY_MS.length - 1)];
  retryStep += 1;
  retryTimer = setTimeout(() => { retryTimer = null; void flushBegan(); }, wait);
}

/** Sends every saved mark; keeps the ones that did not land and tries them again a little later. */
export async function flushBegan(now: number = Date.now()): Promise<void> {
  const list = await readAll();
  const keep: Saved[] = [];
  for (const mark of list) {
    if (now - mark.at > BEGAN_KEEP_MS) continue;
    const done = await sendOne(mark.id);
    if (done) landed.add(mark.id);
    else keep.push(mark);
  }
  try { await writeAll(keep); } catch { /* the marks stay in memory; the next flush writes them */ }
  if (keep.length) scheduleRetry(); else retryStep = 0;
}

/**
 * Round 1 of this try started on screen: save it on the phone first, then tell the server. Once per try
 * (Memory Match's 3 boards are one try and send one mark).
 */
export async function markBegan(attemptId: number | null | undefined, now: number = Date.now()): Promise<void> {
  if (!attemptId || !Number.isInteger(attemptId) || attemptId <= 0) return;
  if (beganHere(attemptId)) return;
  const list = await readAll();
  if (list.some(v => v.id === attemptId) || landed.has(attemptId)) return;
  try {
    await writeAll([...list, { id: attemptId, at: now }]);
  } catch {
    memory = [...list, { id: attemptId, at: now }];
  }
  await flushBegan(now);
}

/** Tests only: forget everything in memory. */
export function resetBeganForTests() {
  memory = null; sending.clear(); landed.clear(); retryStep = 0;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}
