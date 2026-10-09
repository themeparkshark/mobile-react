/**
 * Non-JSON reply guard.
 *
 * Hotel, park and airport Wi-Fi often answer every request with their own
 * sign-in page (a "captive portal"): HTTP 200 with an HTML body. axios then
 * resolves with `data` as that HTML string, so `data.data` is undefined and
 * the first `.map` or `.length` on it crashes the screen, or the whole app
 * when the caller is a launch-time provider.
 *
 * Every API endpoint answers JSON or an empty body (204), so a non-empty text
 * body on a JSON request is never a real answer. The client turns it into a
 * rejected request that looks like being offline, which every caller already
 * handles.
 */

export const NON_JSON_CODE = 'ERR_NON_JSON';

type HeaderBag = { get?: (name: string) => unknown; [key: string]: unknown } | undefined;
type GuardResponse = {
  data?: unknown;
  headers?: HeaderBag;
  config?: { responseType?: string };
};

function contentType(headers: HeaderBag): string {
  if (!headers) return '';
  let value: unknown;
  try {
    value = typeof headers.get === 'function' ? headers.get('content-type') : undefined;
  } catch {
    value = undefined;
  }
  if (value == null) value = headers['content-type'] ?? headers['Content-Type'];
  return typeof value === 'string' ? value.toLowerCase() : '';
}

/**
 * True when a successful response to a JSON request carries a body that is
 * not JSON: an HTML page, or text that failed to parse. Empty bodies (204),
 * objects, arrays, numbers, booleans and null are all fine. A JSON string
 * literal (content-type json, not markup) is fine too.
 */
export function isNonJsonBody(response: GuardResponse | undefined): boolean {
  if (!response) return false;
  const responseType = response.config?.responseType;
  if (responseType && responseType !== 'json') return false;
  const { data } = response;
  if (typeof data !== 'string') return false;
  const text = data.trim();
  if (!text) return false;
  if (text.startsWith('<')) return true;
  if (!contentType(response.headers).includes('json')) return true;
  // Labeled JSON but still a string: axios could not parse it (cut off mid
  // transfer, or a proxy mangled it). A parsed JSON string literal never
  // starts with { or [, so raw object/array text here means a broken body.
  return text.startsWith('{') || text.startsWith('[');
}

export type NonJsonError = Error & {
  code: typeof NON_JSON_CODE;
  config?: unknown;
  request?: unknown;
  isAxiosError: true;
  nonJson: true;
};

/**
 * The rejection a caller receives instead of the HTML. It deliberately has no
 * `response`: callers that branch on `error.response.status` or read
 * `error.response.data.message` treat it exactly like a dropped connection,
 * and nothing can read into the portal page.
 */
export function nonJsonError(response: GuardResponse & { request?: unknown }): NonJsonError {
  const error = new Error('The connection answered with a web page instead of game data') as NonJsonError;
  error.name = 'NonJsonResponseError';
  error.code = NON_JSON_CODE;
  error.config = response.config;
  error.request = (response as { request?: unknown }).request;
  error.isAxiosError = true;
  error.nonJson = true;
  return error;
}

export function isNonJsonError(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { code?: unknown }).code === NON_JSON_CODE;
}

export const BAD_SHAPE_CODE = 'ERR_BAD_SHAPE';

/**
 * A 200 that is JSON but not the shape the screen needs (an empty body, an
 * error object, an old server). Read endpoints throw this instead of handing
 * the screen something it would crash on; callers already treat a rejection
 * as "could not load".
 */
export function badShapeError(what: string): Error & { code: typeof BAD_SHAPE_CODE } {
  const error = new Error(`Unexpected reply for ${what}`) as Error & { code: typeof BAD_SHAPE_CODE };
  error.name = 'BadShapeResponseError';
  error.code = BAD_SHAPE_CODE;
  return error;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * A map coordinate as the API sends it: a number, or a Laravel decimal cast
 * string like "33.81210000". Values are checked, never rewritten.
 */
export const isCoordinate = (value: unknown): boolean =>
  (typeof value === 'number' && Number.isFinite(value)) ||
  (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));

/**
 * One odd reply is not an outage. The app is marked offline only after this
 * many non-JSON replies in a row with no good reply between them (a real
 * captive portal answers every request, so it trips at once).
 */
export const NON_JSON_BEFORE_OFFLINE = 2;
/** A non-JSON GET is tried once more after this short pause. */
export const NON_JSON_RETRY_MS = 600;

export function shouldRetryNonJson(config: { method?: string; tpsNonJsonRetried?: boolean; tpsNoRetry?: boolean; responseType?: string } | undefined): boolean {
  if (!config || config.tpsNonJsonRetried || config.tpsNoRetry) return false;
  if (config.responseType && config.responseType !== 'json') return false;
  const method = (config.method || 'get').toLowerCase();
  return method === 'get' || method === 'head';
}

/** The raw transport body (before axios parses it) is not usable JSON. */
export function rawBodyIsNonJson(response: GuardResponse | undefined): boolean {
  if (!response || typeof response.data !== 'string') return false;
  const text = response.data.trim();
  if (!text) return false;
  if (text.startsWith('<') || !contentType(response.headers).includes('json')) return true;
  try {
    JSON.parse(text);
    return false;
  } catch {
    return true;
  }
}

type Adapter<C, R> = (config: C) => Promise<R>;

/**
 * Transport wrapper (below the interceptors, like the GET retry): a GET that
 * comes back as a web page or broken JSON is tried once more after a short
 * pause, so one flaky hop costs a moment, not a screen. Interceptors see one
 * final answer per request, so nothing (broadcasts, counters) runs twice.
 */
export function withNonJsonRetry<C extends { method?: string; tpsNonJsonRetried?: boolean; tpsNoRetry?: boolean; responseType?: string; signal?: { aborted?: boolean } }, R extends GuardResponse>(
  adapter: Adapter<C, R>,
  wait: (ms: number) => Promise<unknown> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Adapter<C, R> {
  return async function nonJsonRetryingAdapter(config: C): Promise<R> {
    const first = await adapter(config);
    if (!shouldRetryNonJson(config) || !rawBodyIsNonJson(first)) return first;
    await wait(NON_JSON_RETRY_MS);
    if (config.signal?.aborted) return first;
    config.tpsNonJsonRetried = true;
    return adapter(config);
  };
}
