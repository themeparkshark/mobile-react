/**
 * One network request for identical GETs that are already in flight.
 *
 * At launch and on returning to the map several components ask for the same
 * thing at once (the park gym, current redeemable, park projects, me). The
 * duplicates now join the request already on the wire instead of opening a
 * second one. Nothing is cached: once the answer lands, the next GET goes to
 * the server again.
 *
 * This wraps the transport (below the interceptors), so every caller still
 * runs its own interceptors and transformResponse on its own copy: at this
 * level the body is the raw response text, parsed separately per caller.
 * A request that can be cancelled (signal or cancelToken) never joins or
 * leads a shared request, so one caller's abort cannot fail another's load.
 */

type DedupeConfig = {
  method?: string;
  url?: string;
  baseURL?: string;
  params?: unknown;
  headers?: Record<string, unknown>;
  responseType?: string;
  timeout?: number;
  signal?: unknown;
  cancelToken?: unknown;
  tpsNoDedupe?: boolean;
};

type Adapter<C, R> = (config: C) => Promise<R>;

/** The shared-request key, or null when this request must go out on its own. */
export function inflightKey(config: DedupeConfig | undefined): string | null {
  if (!config || config.tpsNoDedupe || config.signal || config.cancelToken) return null;
  const method = (config.method || 'get').toLowerCase();
  if (method !== 'get') return null;
  const headers = config.headers ?? {};
  const auth = headers.Authorization ?? headers.authorization ?? '';
  let params = '';
  try { params = config.params === undefined ? '' : JSON.stringify(config.params); } catch { return null; }
  return [config.baseURL ?? '', config.url ?? '', params, String(auth), config.responseType ?? '', config.timeout ?? ''].join('\u0001');
}

export function withInflightDedupe<C extends DedupeConfig, R extends { config?: unknown }>(adapter: Adapter<C, R>): Adapter<C, R> {
  const inflight = new Map<string, Promise<R>>();
  return function dedupingAdapter(config: C): Promise<R> {
    const key = inflightKey(config);
    if (key === null) return adapter(config);
    const shared = inflight.get(key);
    // A joiner gets its own response object carrying its own config.
    if (shared) return shared.then(response => ({ ...response, config }));
    const request = adapter(config);
    // axios replaces response.data with the parsed body on the leader's object
    // right after this resolves. Copy the raw response first (this callback is
    // attached before the leader's), so joiners parse their own copy.
    const raw = request.then(response => ({ ...response }));
    inflight.set(key, raw);
    const release = () => { if (inflight.get(key) === raw) inflight.delete(key); };
    raw.then(release, release);
    return request;
  };
}
