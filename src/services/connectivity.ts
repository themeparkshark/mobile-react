/**
 * App-wide reachability, derived from real API traffic (NetInfo is not
 * installed). Three states (T172: slow is not offline):
 * - online: answers come back in normal time;
 * - slow: the server answers late or a call timed out, twice in a row with no
 *   quick answer between. The game still works; the player is told the game
 *   is slow right now, never to check their internet;
 * - offline: two calls in a row failed with no answer at all (refused,
 *   dropped, a captive portal). Only then does the app say offline.
 * Any quick answer, even a 4xx, puts the app back online.
 */
export type ConnectionState = 'online' | 'slow' | 'offline';
type Listener = (offline: boolean) => void;
type StateListener = (state: ConnectionState) => void;

/** Calls in a row before a state is shown (one bad call is never an outage; client.ts counts the no-answer ones). */
export const FAILURES_BEFORE_OFFLINE = 2;
/** Slow needs three late answers or timeouts in a row with no quick one between (a busy launch is not "slow"). */
export const SLOW_BEFORE_SLOW = 3;
/** An answer slower than this counts toward "slow". */
export const SLOW_ANSWER_MS = 8000;

let state: ConnectionState = 'online';
let slowInRow = 0;
const listeners = new Set<Listener>();
const stateListeners = new Set<StateListener>();

function set(next: ConnectionState): void {
  if (next === state) return;
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.log(`[net] ${state} -> ${next}`);
  const wasOffline = state === 'offline';
  state = next;
  stateListeners.forEach(listener => listener(state));
  if (wasOffline !== (state === 'offline')) listeners.forEach(listener => listener(state === 'offline'));
}

/** A quick answer: the server is reachable and keeping up. */
export const reportReachable = (): void => { slowInRow = 0; set('online'); };
/** An answer that came back, but late (>= SLOW_ANSWER_MS). Reachable, so never offline. */
export function reportSlowAnswer(): void {
  slowInRow += 1;
  if (slowInRow >= SLOW_BEFORE_SLOW) set('slow');
  else if (state === 'offline') set('slow');
}
/** A call that timed out: the server may just be busy, so this is slow, never offline. */
export function reportTimeout(): void {
  slowInRow += 1;
  if (slowInRow >= SLOW_BEFORE_SLOW && state !== 'offline') set('slow');
}
/** Calls in a row got no answer at all (client.ts waits for FAILURES_BEFORE_OFFLINE of them): offline. */
export function reportUnreachable(): void {
  set('offline');
}
export const isOffline = (): boolean => state === 'offline';
export const connectionState = (): ConnectionState => state;

export function onConnectivityChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Every change between online, slow and offline. */
export function onConnectionState(listener: StateListener): () => void {
  stateListeners.add(listener);
  return () => { stateListeners.delete(listener); };
}

/** Tests only. */
export function resetConnectivityForTests(): void {
  state = 'online'; slowInRow = 0;
  listeners.clear(); stateListeners.clear();
}

/**
 * A full-screen offline state (e.g. a social screen's "didn't load" card) can
 * own the offline mark: while it is mounted the global banner stays hidden,
 * so the player sees exactly one offline indicator.
 */
let markOwners = 0;
const ownerListeners = new Set<(owned: boolean) => void>();
export function claimOfflineMark(): () => void {
  markOwners += 1;
  if (markOwners === 1) ownerListeners.forEach(l => l(true));
  return () => {
    markOwners = Math.max(0, markOwners - 1);
    if (markOwners === 0) ownerListeners.forEach(l => l(false));
  };
}
export const isOfflineMarkOwned = (): boolean => markOwners > 0;
export function onOfflineMarkOwner(listener: (owned: boolean) => void): () => void {
  ownerListeners.add(listener);
  return () => { ownerListeners.delete(listener); };
}
