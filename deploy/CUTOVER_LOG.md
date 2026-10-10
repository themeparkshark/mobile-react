# Cutover log (app binaries and OTAs). No secrets here.

## Oct 9 2026: 1.7.2 (20260930.17) TestFlight preview binary
- Source: `claude/dustin-preview-oct9` @ e7ce0667, worktree ~/apps/tps-ws/preview-oct9. Native tree identical to `claude/release-2` (.16).
- Local archive (cert JMLKT3J357, profiles TMY8Z8L8TW / YU39GCD47U), script
  ~/apps/tps-prime-time-audit/release-1.7.1/archive-1.7.2-testflight-17.sh. Expo.plist channel `testflight` and
  Info.plist build .17 for the archive only, restored after.
- Archive checks: 1.7.2 (20260930.17), widget .17, channel testflight, runtime 637d059501eda1b26d924f69ba04470f082cd91a,
  apiUrl https://tps-api.on-forge.com/api (app.config and main.jsbundle), patch ivar `_tpsOnMap`, aps-environment production.
- altool delivery 848a8ab5-ef7b-4a9a-9ff5-82fba6ace998 = ASC build id, VALID, internal IN_BETA_TESTING.
  Internal group "dustin" only (it has access to all builds). Not in external "Sharks". App Store version and
  in-review submission d4c4ec1c not touched. EAS remote iOS build counter set to 20260930.17.
- tools/ota-base.json `testflight` = e7ce0667 / .17 / 637d0595 (OTAs re-send only media changed since the binary).
- OTA: update group cfe3282d-4949-4a0f-be26-b1b58ebad53b, branch/channel testflight, runtime 637d0595, "Oct 9 preview",
  0 media assets uploaded.
- Stray group 2444c94e-5631-4f18-9580-4a5ed9d249fb (runtime ec02704b): first publish, after the archive left
  ios/main.jsbundle.map in the tree and changed the fingerprint. No binary has that runtime, so nothing receives it.
  Root fix: `.fingerprintignore` now lists ios/main.jsbundle.map.
- Rollback: `npx eas-cli update:republish --group <previous testflight group for 637d0595>` if one exists, else
  `npx eas-cli update:roll-back-to-embedded --branch testflight --runtime-version 637d059501eda1b26d924f69ba04470f082cd91a --platform ios`
  (devices fall back to the JS embedded in .17, which is the same e7ce0667 code). Never update-prod from this branch.
