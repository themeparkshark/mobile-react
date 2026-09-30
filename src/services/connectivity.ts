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
