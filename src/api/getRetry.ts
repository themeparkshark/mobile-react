/**
 * Bounded retry for idempotent reads. Park Wi-Fi and cell coverage drop
 * requests constantly; one quick retry turns most blips into a normal load.
 * Writes are never retried here (the task-attempt ledger has its own
 * idempotent recovery).
 */
export const GET_RETRY_DELAYS_MS = [700, 1800] as const;

type RetryConfig = { method?: string; tpsRetryCount?: number; tpsNoRetry?: boolean };
type RetryError = { code?: string; response?: { status?: number } };

export function nextGetRetryDelay(config: RetryConfig | undefined, error: RetryError): number | null {
  if (!config || config.tpsNoRetry) return null;
  const method = (config.method || 'get').toLowerCase();
  if (method !== 'get' && method !== 'head') return null;
  const attempt = config.tpsRetryCount ?? 0;
  if (attempt >= GET_RETRY_DELAYS_MS.length) return null;
  // A timeout already cost the player the full timeout; do not multiply it.
  if (error.code === 'ERR_CANCELED' || error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return null;
  const status = error.response?.status;
  const transient = status === undefined || status === 502 || status === 503 || status === 504;
  return transient ? GET_RETRY_DELAYS_MS[attempt] : null;
}
