/**
 * Lane-only slow server (platform lane, T172): makes this simulator's API answers arrive late, so a
 * slow-server state can be proven on a device. The request goes out at once (the server does its work)
 * and only the answer waits; past the call's timeout the app gets a real timeout, exactly like a
 * loaded server whose answer never came back in time.
 *
 * It can never run in a store or OTA bundle: it only exists when the polish lane tooling sets
 * EXPO_PUBLIC_STUDIO_MUTE=1 at bundle time (lane.sh always does; store and OTA bundles never do), and it
 * is off until a delay is asked for, either at bundle time (EXPO_PUBLIC_LANE_DELAY_MS, with an optional
 * EXPO_PUBLIC_LANE_DELAY_MATCH regex on the URL) or in dev JS over the debugger:
 *   globalThis.__tpsLaneDelay = { ms: 5000, match: 'feature-flags|/me$', method: 'put' }   // null turns it off
 */
// (typeof guards: plain test loaders have no process; Metro inlines each EXPO_PUBLIC_ value at bundle time.)
const LANE_BUNDLE = typeof process !== 'undefined' && process.env.EXPO_PUBLIC_STUDIO_MUTE === '1';
const ENV_MS = typeof process !== 'undefined' ? Number(process.env.EXPO_PUBLIC_LANE_DELAY_MS ?? 0) : 0;
const ENV_MATCH = typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_LANE_DELAY_MATCH ?? '' : '';

type Rule = { readonly ms: number; readonly match?: string | null; readonly method?: string | null };
type DelayConfig = { url?: string; timeout?: number; method?: string };
type Adapter<C, R> = (config: C) => Promise<R>;

let override: Rule | null | undefined;
/** Tests (and a dev debugger session) can set the rule directly; undefined goes back to the global and env. */
export function setLaneDelay(next: Rule | null | undefined): void { override = next; }

function rule(): Rule | null {
  const runtime = override !== undefined ? override : (globalThis as { __tpsLaneDelay?: Rule | null }).__tpsLaneDelay;
  if (runtime !== undefined) return runtime && runtime.ms > 0 ? runtime : null;
  return ENV_MS > 0 ? { ms: ENV_MS, match: ENV_MATCH || null } : null;
}

/** How late this call's answer comes back (0: on time). Always 0 outside a lane bundle. */
export function laneDelayMs(url: string | undefined, lane: boolean = LANE_BUNDLE, method?: string): number {
  if (!lane) return 0;
  const r = rule();
  if (!r) return 0;
  if (r.method && (method ?? 'get').toLowerCase() !== r.method.toLowerCase()) return 0;
  if (r.match) {
    try { if (!new RegExp(r.match).test(url ?? '')) return 0; } catch { return 0; }
  }
  return r.ms;
}

/**
 * Wraps the transport. Outside a lane bundle it returns the adapter itself (nothing added to the
 * request path). `timeoutError` builds the same error axios gives for a timeout.
 */
export function withLaneDelay<C extends DelayConfig, R>(adapter: Adapter<C, R>, timeoutError: (config: C) => Error,
  lane: boolean = LANE_BUNDLE, wait: (ms: number) => Promise<unknown> = ms => new Promise(resolve => setTimeout(resolve, ms))): Adapter<C, R> {
  if (!lane) return adapter;
  return async function laneDelayedAdapter(config: C): Promise<R> {
    const ms = laneDelayMs(config.url, lane, config.method);
    if (!ms) return adapter(config);
    const timeout = config.timeout ?? 0;
    // The server gets the request now and does its work; only its answer is late.
    const answer = adapter({ ...config, timeout: 0 });
    answer.catch(() => undefined);
    await wait(timeout > 0 ? Math.min(ms, timeout) : ms);
    if (timeout > 0 && ms >= timeout) throw timeoutError(config);
    return answer;
  };
}
