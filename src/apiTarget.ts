/**
 * Which API a build talks to.
 *
 * Store builds carry an EAS Update channel. For those the API is fixed per
 * channel in code, so an `eas update` published from a laptop whose .env
 * points at localhost or a tunnel can never redirect shipped players.
 * Development and local (channel-less) builds keep the Metro or baked URL.
 */
export const CHANNEL_API_URLS: Readonly<Record<string, string>> = {
  production: 'https://tps-api.on-forge.com/api',
  testflight: 'https://tps-api.on-forge.com/api',
};

/** Every TPS backend serves its routes under this path. */
export const API_PATH = '/api';

export type ApiTargetInput = {
  readonly isDev: boolean;
  readonly channel: string | null | undefined;
  readonly publicEnvUrl: string | undefined;
  readonly bakedUrl: string | undefined;
};

/**
 * The API base URL, always ending in /api.
 *
 * An OTA published with EXPO_PUBLIC_API_URL set to the bare tunnel host
 * (https://<tunnel>.trycloudflare.com, no /api) sent every request to
 * /me, /crumbs, ... at the site root. Laravel answered 404, which counts as
 * "reachable", so the app showed no offline banner, no API call was ever
 * logged, the park lookup never confirmed home, and trip goals failed.
 * A bare origin now gets /api; a URL that already has a path is kept.
 */
export function normalizeApiUrl(url: string | undefined): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  const withoutSlash = trimmed.replace(/\/+$/, '');
  const origin = withoutSlash.match(/^(https?:\/\/[^/?#]+)$/i);
  return origin ? `${origin[1]}${API_PATH}` : withoutSlash;
}

export function resolveApiUrl({ isDev, channel, publicEnvUrl, bakedUrl }: ApiTargetInput): string | undefined {
  if (!isDev && channel && CHANNEL_API_URLS[channel]) return CHANNEL_API_URLS[channel];
  return normalizeApiUrl(publicEnvUrl) || normalizeApiUrl(bakedUrl);
}
