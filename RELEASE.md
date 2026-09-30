# Theme Park Shark app: release engineering

Every build, OTA update and store upload goes through Dustin. Nothing in this
file authorizes a prod deploy, TestFlight upload or App Store submission.

## Everyday gates

- `npm run verify` runs `tsc --noEmit` and the node tests (`tools/tests`).
- `npm run hooks:install` once per clone turns on the pre-commit hook that
  runs the same checks. `.github/workflows/app-ci.yml` runs them in CI.

## Build profiles (`eas.json`)

| Profile | Where it points | Notes |
|---|---|---|
| `development` | Metro (`EXPO_PUBLIC_API_URL`) | Simulator, Debug. No API baked in. |
| `development-device` | Metro | Device, Debug. |
| `production` | `https://tps-api.on-forge.com/api` | Store. Remote build numbers (`appVersionSource: remote`, `autoIncrement`). |
| `testflight` | same as production | Store, `testflight` channel. |

All profiles use an Xcode 26 image (App Store SDK rule). Every EAS build runs
`tools/check-api-target.cjs` in `eas-build-pre-install`: store profiles fail on
tunnels (trycloudflare, ngrok, localtunnel), localhost and private addresses,
and the live probe needs `/crumbs` plus a 401 from `/me/trip-goal`, which
proves the core loop is deployed on that host.

## Native project rules

The `ios/` folder is committed and EAS builds it as is (no prebuild on EAS).

**Never run `expo prebuild --clean`.** It deletes the `LinePlayWidget` Live
Activity extension target, which no config plugin recreates. `app.config.js`
refuses it (override with `TPS_ALLOW_PREBUILD_CLEAN=1` only if you will
restore the widget target by hand).

A plain `npx expo prebuild --platform ios --no-install` is safe.
`plugins/withTpsNativeInvariants.js` re-applies what the committed project
needs:

- Podfile: `pod 'MapLibre', '6.17.1'` from CocoaPods, the fmt consteval patch
  for Xcode 26 with React Native 0.76, and the MapLibre framework search path.
  The `@maplibre/maplibre-react-native` config plugin is deliberately not used:
  its `$MLRN.post_install` moves MapLibre to SPM and archives then fail on a
  duplicate signature.
- Info.plist: background modes stay `[location]`, export compliance is
  `false`, and no Expo default "Allow $(PRODUCT_NAME)" purpose string ships.
- Privacy manifest: `plugins/privacy-manifest.json` is the source for
  `ios.privacyManifests` and matches `PrivacyInfo.xcprivacy`.
- Xcode project: no `ENABLE_BITCODE` setting (deprecated since Xcode 14).
- `newArchEnabled: true` matches `Podfile.properties.json`.

After any prebuild, `npm test` (`native-invariants`, `release-native-config`)
fails on drift. The only expected leftovers are cosmetic: the launch image is
re-exported from `assets/images/splash-bg.png` as PNG instead of the committed
JPG, and pbxproj quoting changes.

Purpose strings live in `app.config.js` and are mirrored in
`ios/ThemeParkShark/Info.plist`; the tests keep the two identical.

## Unused native modules

These stay in `package.json` until the lockfile is regenerated, but are not
linked into the binary:

- `expo-gl`, `expo-image-picker` (`package.json` `expo.autolinking.exclude`)
- `react-native-google-mobile-ads`, `react-native-worklets-core`,
  `react-native-maps` (`react-native.config.js`)

To remove them for good (needs a lockfile update, run by Dustin):
`npm uninstall react-native-google-mobile-ads react-native-worklets-core react-native-maps expo-gl expo-image-picker three-stdlib @expo/ngrok @react-navigation/drawer`
then drop the matching exclusions.

## OTA updates

`runtimeVersion` uses the fingerprint policy, so an update only reaches
binaries whose native code matches. The app checks once per cold start,
downloads in the background and applies on the next cold start. It never
reloads mid-session.

## Crash reporting

`src/services/telemetry` sends Sentry envelopes to `EXPO_PUBLIC_SENTRY_DSN`
(set it as an EAS secret per profile). Without a DSN it is a no-op.

## Art

Assets under `assets/` are Dustin's hand-illustrated art. Size work may
downscale or re-encode losslessly; it never palette-quantizes, redraws or
restyles. `tools/tests/asset-diet.test.cjs` rejects palette-mode stamp art.
