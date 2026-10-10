/**
 * Bounded retry for idempotent reads. Park Wi-Fi and cell coverage drop
 * requests constantly; one quick retry turns most blips into a normal load.
 * Writes are never retried here (the task-attempt ledger has its own
 * idempotent recovery).
 */
export const GET_RETRY_DELAYS_MS = [700, 1800] as const;

type RetryConfig = { method?: string; tpsRetryCount?: number; tpsNoRetry?: boolean };
type RetryError = { code?: string; response?: { status?: number } };

/**
 * The HTTP status of a failed request, or undefined when no server answered.
 * On React Native, axios reports a dropped or refused connection with a
 * response object whose status is 0, so `error.response` alone does not mean
 * the server replied.
 */
export function httpStatus(error: RetryError | undefined): number | undefined {
  const status = error?.response?.status;
  return typeof status === 'number' && status > 0 ? status : undefined;
}

export function nextGetRetryDelay(config: RetryConfig | undefined, error: RetryError): number | null {
  if (!config || config.tpsNoRetry) return null;
  const method = (config.method || 'get').toLowerCase();
  if (method !== 'get' && method !== 'head') return null;
  const attempt = config.tpsRetryCount ?? 0;
  if (attempt >= GET_RETRY_DELAYS_MS.length) return null;
  // A timeout already cost the player the full timeout; do not multiply it.
  if (error.code === 'ERR_CANCELED' || error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return null;
  const status = httpStatus(error);
  const transient = status === undefined || status === 502 || status === 503 || status === 504;
  return transient ? GET_RETRY_DELAYS_MS[attempt] : null;
}

type Adapter<C, R> = (config: C) => Promise<R>;

/**
 * Wrap the axios transport so a GET is retried below the interceptor chain.
 * Interceptors (reachability, telemetry, broadcasts, the 5xx toast counter)
 * then see exactly one final result per logical request. Retrying from inside
 * a response interceptor would re-run every interceptor once per attempt.
 */
export function withGetRetry<C extends RetryConfig & { signal?: { aborted?: boolean } }, R>(
  adapter: Adapter<C, R>,
  wait: (ms: number) => Promise<unknown> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Adapter<C, R> {
  return async function retryingAdapter(config: C): Promise<R> {
    for (;;) {
      try {
        return await adapter(config);
      } catch (error) {
        const delay = nextGetRetryDelay(config, (error ?? {}) as RetryError);
        if (delay === null) throw error;
        config.tpsRetryCount = (config.tpsRetryCount ?? 0) + 1;
        await wait(delay);
        if (config.signal?.aborted) throw error;
      }
    }
  };
}

/**
 * True when the request failed at the network level: the connection was
 * refused or dropped (axios ERR_NETWORK, React Native status 0). A timeout is
 * not proof of being offline; one slow endpoint on a working connection
 * must not put up the offline banner.
 */
export function isNetworkFailure(error: RetryError & { message?: string } | undefined): boolean {
  if (!error || httpStatus(error) !== undefined) return false;
  // A captive-portal page instead of game data (jsonGuard.ts): not online yet.
  if (error.code === 'ERR_NON_JSON') return true;
  if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') return true;
  return error.response?.status === 0;
}

export function isTimeout(error: RetryError | undefined): boolean {
  return error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT';
}
