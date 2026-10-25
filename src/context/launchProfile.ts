/**
 * Launch: a kid with a saved profile is never held on the Loading screen by a slow network.
 *
 * The fresh profile (/me) gets LAUNCH_CACHED_PROFILE_MS to answer. On park cell data it can take
 * its whole 15 s timeout, so after this wait the saved profile opens the game and the fresh one
 * keeps loading in the background (`late`). Normal networks answer first and nothing changes.
 * No saved profile: wait for the fresh one exactly as before.
 */
export const LAUNCH_CACHED_PROFILE_MS = 6000;

export type LaunchProfile<P> =
  | { readonly kind: 'fresh'; readonly player: P }
  | { readonly kind: 'cached'; readonly player: P; readonly late: Promise<P> }
  | { readonly kind: 'failed'; readonly error: unknown };

type Settled<P> = { readonly ok: true; readonly player: P } | { readonly ok: false; readonly error: unknown };

export async function loadLaunchProfile<P extends { readonly id?: unknown }>(
  fetchFresh: () => Promise<P>,
  readCached: () => Promise<P | null>,
  waitMs: number = LAUNCH_CACHED_PROFILE_MS,
  sleep: (ms: number) => Promise<unknown> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<LaunchProfile<P>> {
  const fresh = fetchFresh();
  const state: { done: Settled<P> | null } = { done: null };
  const settled = fresh.then(
    (player): Settled<P> => (state.done = { ok: true, player }),
    (error): Settled<P> => (state.done = { ok: false, error }),
  );
  const outcome = (s: Settled<P>): LaunchProfile<P> =>
    s.ok ? { kind: 'fresh', player: s.player } : { kind: 'failed', error: s.error };

  const first = await Promise.race([settled, sleep(waitMs).then(() => null)]);
  if (first) return outcome(first);

  const cached = await readCached().catch(() => null);
  // The fresh profile may have landed while the saved one was read: the fresh one wins.
  if (state.done) return outcome(state.done);
  if (cached && cached.id) return { kind: 'cached', player: cached, late: fresh };
  return outcome(await settled);
}
