# Theme Park Shark app: release engineering

Every build, OTA update and store upload goes through Dustin. Nothing in this
file authorizes a prod deploy, TestFlight upload or App Store submission.

## Release blockers (open until each is checked off)

No TestFlight or App Store build ships while any of these is open.

- [ ] **Prod core-loop deploy (Dustin).** `tools/check-api-target.cjs testflight`
  fails until `https://tps-api.on-forge.com/api/me/trip-goal` and
  `/me/task-attempts/0` answer 401 instead of 404.
- [ ] **Dark navy launch frame (WS8, `src/screens/Auth/LoginScreen.tsx`).** The
  login screen paints `#09268f` behind its video, so one or two dark frames
  sit between the blue splash and the login loop (2650ms in
  `screens/ws9/11-release-launch-sequence.png`). Fix: `#0768B9` background
  and `assets/images/splash-bg.png` under the video as its poster. Then
  re-shoot the 50ms frame sheet of a Release cold start and check it goes
  blue straight into the loop.
- [ ] **Sentry DSN (Dustin).** `EXPO_PUBLIC_SENTRY_DSN` as an EAS secret per
  store profile, or release crashes report nothing.
- [ ] **App Store Connect privacy label** matches `plugins/privacy-manifest.json`,
  and Dustin has read the purpose strings below.

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
reloads mid-session. A foreground return after 6 hours also checks.

Publish with `npm run update-testflight -- "<message>"` (or `update-prod`,
or `update-internal` for the internal-tunnel tester channel), never a bare
`eas update`: it runs the API target gate, takes the API env from the
channel's eas.json profile (the shell's API_URL/EXPO_PUBLIC_API_URL are
ignored), exports iOS with source maps, refuses to upload unless the bundle
contains the profile's `/api` URL, then uploads the map to Sentry (see Crash
reporting). On Oct 1 2026 hand-run internal-tunnel publishes inlined the bare
tunnel host (no `/api`) and every tester request 404'd with no offline banner.
The app now also appends `/api` to a bare origin (src/apiTarget.ts).

**Not yet proven on a device.** The simulator check (one expo-updates request
per cold start) ran before an EAS channel existed, so every request got HTTP
400. After the first TestFlight build, run this once and log the result here:

1. Install the TestFlight build, cold start it, and leave it running.
2. `npm run update-testflight -- "OTA check"` with a visible one-line change.
3. Same session: nothing reloads. Kill the app.
4. Cold start 2: the change is live. The Sentry `dist` on a test event is the
   update id.
5. Background the app, return after 6 hours: one check, no reload.

Result: _not run yet_.

## Crash reporting

`src/services/telemetry` sends Sentry envelopes to `EXPO_PUBLIC_SENTRY_DSN`
(set it as an EAS env var per store profile). Without a DSN it is a no-op.

**JS only.** Native crashes (a Swift or Objective-C module, out-of-memory and
watchdog kills) are not captured. Plan `@sentry/react-native` together with
the Expo SDK 54 upgrade; `sentryEnvelope.ts` is the only thing it replaces.

**Readable stacks.** Release frames are Hermes bytecode offsets, so each
event needs the matching composed Hermes source map in Sentry:

| JS that is running | release | dist | map uploaded by |
| --- | --- | --- | --- |
| Embedded in a store build | `com.themeparkshark.app@<version>+<build>` | `<build>` | `eas-build-on-success` (`tools/upload-sourcemaps.cjs build`) |
| An OTA update | `com.themeparkshark.app@ota-<runtimeVersion>` | `<updateId>` | `npm run update-*` (`tools/publish-update.cjs`) |

- `SOURCEMAP_FILE=ios/main.jsbundle.map` (eas.json, store profiles) makes the
  Xcode bundle phase write the composed Hermes map.
- Every bundle frame is sent as `app:///main.jsbundle`, and Hermes offsets are
  sent as 1-based columns, so the map uploaded as `app:///main.jsbundle.map`
  resolves them.
- Needs EAS env vars `SENTRY_AUTH_TOKEN` (scope `project:releases`),
  `SENTRY_ORG`, `SENTRY_PROJECT`. With a DSN but no token a store build fails
  on purpose: its crashes would be unreadable.
- Checked locally (screens/ws9/19-hermes-symbolication.txt): a real Hermes
  stack from the release bundle resolves to the right source lines through
  the exported map, and a Release Xcode build with `SOURCEMAP_FILE` writes
  the composed map. **Not yet checked against real Sentry**: the upload uses
  Sentry's release files API, and the first real event with a symbolicated
  stack is still to be confirmed after the DSN and token exist.

## Art

Assets under `assets/` are Dustin's hand-illustrated art. Size work may
downscale or re-encode losslessly; it never palette-quantizes, redraws or
restyles. `tools/tests/asset-diet.test.cjs` rejects palette-mode stamp art.

## Binary size (measured September 30, 2026)

Unsigned Release device archive (Xcode 16.4 locally): app 199 MB, zipped
IPA about 164 MB. Assets are 146 MB of that; the Hermes bundle is 11 MB and
the arm64 binary 29 MB. The 80 MB target needs work outside this stream's
files, in this order:

1. `assets/images/screens/explore/item_animation.gif` (13.7 MB) and
   `pin_animation.gif` (8.9 MB): the marker swap WS2 owns.
2. Lossless WebP for the large PNGs (identical pixels, no restyle): about
   21 MB saved across 158 files. Each owning stream swaps its own `require`
   paths; expo-image and iOS 14+ decode WebP natively.
3. Music tracks (`assets/music`, 10.5 MB) re-encoded to AAC at 96 kbps.

To measure again: `xcodebuild -workspace ios/ThemeParkShark.xcworkspace
-scheme ThemeParkShark -configuration Release -sdk iphoneos
-destination generic/platform=iOS -archivePath /tmp/TPS.xcarchive
CODE_SIGNING_ALLOWED=NO archive`, then zip `Products/Applications/*.app`
under `Payload/`.

## Launch screen check

Record a cold start with `xcrun simctl io <udid> recordVideo` and launch with
`xcrun simctl launch`. On the simulator a `simctl launch` shows a short black
zoom before any app's launch screen (Apple Settings shows about 1 s of it the
same way), so judge the handoff from the first blue frame: launch art, the
same art in JS, then the login loop.

**Open:** in the September 30 capture a dark navy frame sits between the JS
splash and the login loop. It comes from `LoginScreen.tsx` (WS8) painting
`#09268f` behind the video. The launch item stays open until WS8 uses
`#0768B9` with `splash-bg.png` under the video as its poster and a new frame
sheet shows blue straight into the loop.

## Purpose strings

No Face ID string: the app never uses biometrics (`expo-secure-store` has
`faceIDPermission: false`). The microphone string stays only because
expo-camera links audio capture APIs, which App Store Connect's binary scan
flags as ITMS-90683 when the key is missing; the app never asks for the
microphone. The camera string leads with AR (ARView), which exists whatever
WS4 decides about the Snap the Ride game; if Snap the Ride leaves the pool,
the "ride photo when a game asks" clause can go. Photos add-only access is
real: iOS asks for it when a player taps Save Image in the share sheet on the
park day or ride card (expo-sharing), and the app crashes there without the
key. If a TestFlight upload goes through without that warning after
expo-camera is configured with `microphonePermission: false`, drop the key.

## 1.7.2 store binary (Release 2, claude/release-2)

1.7.2 is the App Store binary for Release 2. It carries one native change, the
MapLibre marker-frame patch from claude/binary-1.7.1 (`tools/maplibre/patch-marker-frame.mjs`,
run by `postinstall`). It stops a React layout pass from moving a marker that
MapLibre owns to the map's top-left corner. The patch changes the iOS runtime
fingerprint, so 1.7.0 and 1.7.2 are separate OTA lines:

| Binary | Runtime | Publish OTAs from |
|---|---|---|
| 1.7.0 (20260930.11 to .14), App Store today | `f7aa10f3...` | `claude/release-2-ota170` (Release 2 JS without the native patch), or `claude/release-rc` |
| 1.7.1 (20260930.15), TestFlight only | `92c961be...` | none (superseded by 1.7.2) |
| 1.7.2 (20260930.16), the Release 2 store binary | `637d0595...` at the version commit (re-check after any later merge) | `claude/release-2` |

- **Until Apple approves 1.7.2,** production OTAs keep publishing on `f7aa10f3`
  from `claude/release-2-ota170`. Never publish from `claude/release-2`: no
  production binary has its runtime.
- **After 1.7.2 is live,** production OTAs publish from `claude/release-2` on
  the new runtime. 1.7.0 players keep their runtime and get only what is
  published from `claude/release-2-ota170`. A JS fix that both lines need is
  published twice, once from each branch.
- Any JS-only change merged into `claude/release-2` after this point is
  merged into `claude/release-2-ota170` too, so the two lines stay the same
  apart from the native patch and the version.
- Check the runtime before every publish:
  `API_URL=<profile URL> npx expo-updates fingerprint:generate --platform ios`.
  It must print the runtime of the binary you target.
- After the 1.7.2 build, set `tools/ota-base.json` `production` to the
  build's commit, `1.7.2 (<build>)` and its runtime (the 1.7.0 entry moves
  to the release-2-ota170 line).
- Build numbers: the EAS remote counter is still at 20260930.14 unless
  someone moved it. The local project says 20260930.16 (1.7.1 used .15). For
  an EAS build, run `eas build:version:set -p ios` to .16 or higher first.
  A local archive (app-store-submit skill) uses .16 as committed.
