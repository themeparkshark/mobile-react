/**
 * Sentry release and dist for the JS that is running, in the exact form the
 * source map upload (tools/upload-sourcemaps.cjs) uses, so every event finds
 * its map:
 *
 * - The JS embedded in a store build: release `<id>@<version>+<build>`,
 *   dist `<build>`. The EAS build hook uploads that build's Hermes map.
 * - An OTA update: release `<id>@ota-<runtimeVersion>`, dist `<updateId>`.
 *   An update runs on every binary with its runtime, so its map is keyed by
 *   the update id, not by a build number. `npm run update:*` uploads it.
 */
export const SENTRY_APP_ID = 'com.themeparkshark.app';

export type RunningJs = {
  readonly version?: string | null;
  readonly build?: string | null;
  readonly updateId?: string | null;
  readonly runtimeVersion?: string | null;
  readonly isEmbeddedLaunch?: boolean;
};

export function sentryReleaseAndDist(js: RunningJs): { release?: string; dist?: string } {
  if (js.isEmbeddedLaunch === false && js.updateId && js.runtimeVersion) {
    return { release: `${SENTRY_APP_ID}@ota-${js.runtimeVersion}`, dist: js.updateId };
  }
  if (!js.version) return {};
  const build = js.build || '0';
  return { release: `${SENTRY_APP_ID}@${js.version}+${build}`, dist: build };
}
