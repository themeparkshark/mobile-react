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

export type ApiTargetInput = {
  readonly isDev: boolean;
  readonly channel: string | null | undefined;
  readonly publicEnvUrl: string | undefined;
  readonly bakedUrl: string | undefined;
};

export function resolveApiUrl({ isDev, channel, publicEnvUrl, bakedUrl }: ApiTargetInput): string | undefined {
  if (!isDev && channel && CHANNEL_API_URLS[channel]) return CHANNEL_API_URLS[channel];
  return publicEnvUrl || bakedUrl;
}
