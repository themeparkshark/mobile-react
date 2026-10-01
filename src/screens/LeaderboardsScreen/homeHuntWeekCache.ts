/**
 * The Standings flag is the server's answer to GET /me/home-hunt/week: the
 * Home Hunt tab exists only when enabled is true. The answer is cached for the
 * session (a failure is not cached, so the next visit asks again), and a
 * fresh week read replaces it after a settings change or a pickup.
 */
import { getHomeHuntWeek, type HomeHuntWeek } from '../../api/endpoints/me/homeHunt';

let cached: HomeHuntWeek | null = null;
let cachedOwner: number | null = null;
let inFlight: Promise<HomeHuntWeek | null> | null = null;
const listeners = new Set<(week: HomeHuntWeek | null) => void>();

export function cachedHomeHuntWeek(): HomeHuntWeek | null {
  return cached;
}

export function setHomeHuntWeek(week: HomeHuntWeek | null): void {
  cached = week;
  listeners.forEach(listener => listener(week));
}

export function subscribeHomeHuntWeek(listener: (week: HomeHuntWeek | null) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Load the week once per signed-in player. Pass force to refresh. Resolves null
 * when the call fails.
 */
export function loadHomeHuntWeek(ownerId: number | null = null, force = false): Promise<HomeHuntWeek | null> {
  if (cachedOwner !== ownerId) { cached = null; cachedOwner = ownerId; }
  if (!force && cached) return Promise.resolve(cached);
  if (inFlight) return inFlight;
  inFlight = getHomeHuntWeek().then(week => {
    setHomeHuntWeek(week ?? null);
    return cached;
  }).catch(() => null).finally(() => { inFlight = null; });
  return inFlight;
}

export function homeHuntEnabled(week: HomeHuntWeek | null | undefined): boolean {
  return week?.enabled === true;
}

/** Test and sign-out hook. */
export function resetHomeHuntWeekCache(): void {
  cached = null;
  cachedOwner = null;
  inFlight = null;
}
