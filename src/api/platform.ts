import * as Application from 'expo-application';
import Constants from 'expo-constants';

/**
 * Backend platform contract (WS1): the App-Version header, the forced-update
 * answer (426 APP_UPDATE_REQUIRED) and the rate-limit answer (429 RATE_LIMITED).
 * The backend gates retired routes, and later the whole API, on App-Version, so
 * every request must carry it. Builds before 1.6.0 never sent it.
 */

const VERSION_PATTERN = /^\d+(\.\d+){0,3}$/;

export function appVersion(): string | null {
  const candidates = [Application.nativeApplicationVersion, Constants.expoConfig?.version];
  for (const value of candidates) {
    const version = typeof value === 'string' ? value.trim() : '';
    if (VERSION_PATTERN.test(version)) return version;
  }
  return null;
}

/** Headers for client.defaults.headers.common. Empty when the version is unknown. */
export function appVersionHeaders(): Record<string, string> {
  const version = appVersion();
  return version ? { 'App-Version': version } : {};
}

export type UpdateRequired = {
  readonly kind: 'update_required';
  readonly message: string;
  readonly appStoreUrl: string | null;
  readonly minAppVersion: string | null;
};

export type RateLimited = {
  readonly kind: 'rate_limited';
  readonly message: string;
  readonly retryAfterSeconds: number;
};

export type PlatformError = UpdateRequired | RateLimited;

const UPDATE_COPY = 'A new version of Theme Park Shark is ready. Update the app to keep playing.';
const RATE_COPY = 'Too many requests. Wait a moment and try again.';

type ErrorLike = {
  response?: { status?: number; data?: unknown; headers?: Record<string, unknown> };
};

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Reads an axios error into a platform answer the UI can act on, or null when
 * it is some other failure. Server copy is used only when it is plain text.
 */
export function platformError(error: unknown): PlatformError | null {
  const response = (error as ErrorLike | null)?.response;
  if (!response) return null;
  const data = (response.data && typeof response.data === 'object' ? response.data : {}) as Record<string, unknown>;

  if (response.status === 426 || data.code === 'APP_UPDATE_REQUIRED') {
    return {
      kind: 'update_required',
      message: text(data.message) ?? UPDATE_COPY,
      appStoreUrl: text(data.app_store_url),
      minAppVersion: text(data.min_app_version),
    };
  }

  if (response.status === 429 || data.code === 'RATE_LIMITED') {
    const header = response.headers?.['retry-after'] ?? response.headers?.['Retry-After'];
    const seconds = Number.parseInt(String(header ?? ''), 10);
    return {
      kind: 'rate_limited',
      message: text(data.message) ?? RATE_COPY,
      retryAfterSeconds: Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 120) : 5,
    };
  }

  return null;
}
