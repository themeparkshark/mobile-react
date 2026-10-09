/**
 * Tapping the footer icon of the screen you are already on (News today)
 * tells that screen, so it can scroll back to the top like any news app.
 */
type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();

export function onTabReselect(screen: string, listener: Listener): () => void {
  let set = listeners.get(screen);
  if (!set) listeners.set(screen, (set = new Set()));
  set.add(listener);
  return () => { set?.delete(listener); };
}

/** True when a screen was listening (and has handled it). */
export function emitTabReselect(screen: string): boolean {
  const set = listeners.get(screen);
  if (!set || set.size === 0) return false;
  set.forEach(listener => listener());
  return true;
}
