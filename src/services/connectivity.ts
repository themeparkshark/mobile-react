/**
 * App-wide reachability, derived from real API traffic (NetInfo is not
 * installed). Any HTTP response, even a 4xx, proves the server is reachable;
 * a request that fails without a response counts as offline.
 */
type Listener = (offline: boolean) => void;

let offline = false;
const listeners = new Set<Listener>();

function set(next: boolean): void {
  if (next === offline) return;
  offline = next;
  listeners.forEach(listener => listener(offline));
}

export const reportReachable = (): void => set(false);
export const reportUnreachable = (): void => set(true);
export const isOffline = (): boolean => offline;

export function onConnectivityChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
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
