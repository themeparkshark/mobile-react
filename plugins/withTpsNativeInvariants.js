// Native invariants the committed ios/ project depends on, expressed as a
// config plugin so a regular `expo prebuild` re-applies them instead of
// silently dropping them.
//
// What this covers:
// - Podfile: MapLibre pinned to its CocoaPods binary, the fmt consteval patch
//   Xcode 26 needs for React Native 0.76, and the MapLibre framework search
//   path fix for App Store archives. (The @maplibre config plugin is not used:
//   its $MLRN.post_install switches MapLibre to SPM, which breaks archives.)
// - Info.plist: background modes stay exactly [location] (expo-task-manager's
//   plugin adds an unused `fetch`), and the unused image picker's Expo-default
//   photo-library read string is dropped. No CADisableMinimumFrameDurationOnPhone
//   (120 Hz off, 1.7.0).
// - Xcode project: no ENABLE_BITCODE build setting. Bitcode is deprecated
//   since Xcode 14 and the App Store no longer accepts it.
//
// This plugin is listed first in app.config.js so its mods run last.
//
// What it cannot cover (why `prebuild --clean` stays forbidden, see
// assertPrebuildAllowed and RELEASE.md): the LinePlayWidget Live Activity
// extension target in ThemeParkShark.xcodeproj. A clean prebuild deletes it.
const { withInfoPlist, withPodfile, withXcodeProject } = require('@expo/config-plugins');

const MAPLIBRE_POD = "  pod 'MapLibre', '6.17.1'";

const FMT_PATCH = `    # Xcode 26 (required by the App Store since Apr 2026) rejects fmt's consteval format
    # strings as used by React Native 0.76. Turn consteval off in fmt's header.
    fmt_base = File.join(installer.sandbox.root.to_s, 'fmt', 'include', 'fmt', 'base.h')
    if File.exist?(fmt_base)
      src = File.read(fmt_base)
      marker = '#if !defined(__cpp_lib_is_constant_evaluated)'
      if src.include?(marker) && !src.include?('TPS: consteval off')
        File.chmod(0644, fmt_base)
        File.write(fmt_base, src.sub(marker, '#if 1  // TPS: consteval off for Xcode 26 + RN 0.76'))
      end
    end
`;

const MAPLIBRE_SEARCH_PATHS = `
    # MapLibre comes from its CocoaPods binary (below), not SPM: the SPM route links the
    # xcframework into two targets and App Store archives fail on a duplicate signature.
    installer.pods_project.targets.each do |t|
      next unless t.name == 'maplibre-react-native'
      t.build_configurations.each do |c|
        c.build_settings['FRAMEWORK_SEARCH_PATHS'] = ['$(inherited)', '"\${PODS_XCFRAMEWORKS_BUILD_DIR}/MapLibre"']
      end
    end
`;

/**
 * Pure and idempotent: returns the Podfile with every TPS invariant present.
 * Throws when an anchor is missing so a template change fails loudly.
 */
function applyPodfilePatches(src) {
  let out = src;
  if (!out.includes("pod 'MapLibre'")) {
    const anchor = /^( *use_expo_modules!\n)/m;
    if (!anchor.test(out)) throw new Error('withTpsNativeInvariants: use_expo_modules! not found in Podfile');
    out = out.replace(anchor, `$1${MAPLIBRE_POD}\n`);
  }
  const needsFmt = !out.includes('TPS: consteval off');
  const needsSearch = !out.includes("t.name == 'maplibre-react-native'");
  if (needsFmt || needsSearch) {
    // Insert right after the react_native_post_install(...) call closes.
    const anchor = /(react_native_post_install\([\s\S]*?\n\s*\)\n)/;
    if (!anchor.test(out)) throw new Error('withTpsNativeInvariants: react_native_post_install not found in Podfile');
    out = out.replace(anchor, `$1${needsFmt ? FMT_PATCH : ''}${needsSearch ? MAPLIBRE_SEARCH_PATHS : ''}`);
  }
  return out;
}

/**
 * `expo prebuild --clean` regenerates ios/ from scratch and deletes the
 * LinePlayWidget extension target. Refuse it unless someone opts in knowingly.
 */
function assertPrebuildAllowed(argv = process.argv, env = process.env) {
  const args = argv.map(String);
  const isPrebuild = args.includes('prebuild');
  const isClean = args.includes('--clean');
  if (isPrebuild && isClean && env.TPS_ALLOW_PREBUILD_CLEAN !== '1') {
    throw new Error(
      'Refusing `expo prebuild --clean`: it deletes the LinePlayWidget Live Activity target in ios/. ' +
        'Run `npx expo prebuild` without --clean (the config plugins are idempotent), ' +
        'or set TPS_ALLOW_PREBUILD_CLEAN=1 and restore the widget target by hand. See RELEASE.md.',
    );
  }
}

const EXPO_DEFAULT_PURPOSE = /^Allow \$\(PRODUCT_NAME\) to /;

/** Pure: returns a copy of the Info.plist dictionary with TPS invariants applied. */
function applyInfoPlistInvariants(plist) {
  const out = { ...plist };
  out.UIBackgroundModes = ['location'];
  out.ITSAppUsesNonExemptEncryption = false;
  // 60 Hz everywhere: ProMotion's 120 Hz was the biggest heat source (perf PERF.md).
  delete out.CADisableMinimumFrameDurationOnPhone;
  for (const [key, value] of Object.entries(out)) {
    if (/UsageDescription$/.test(key) && typeof value === 'string' && EXPO_DEFAULT_PURPOSE.test(value)) {
      if (key === 'NSPhotoLibraryUsageDescription') delete out[key];
      else throw new Error(`withTpsNativeInvariants: ${key} is an Expo default; write a real purpose string in app.config.js`);
    }
  }
  return out;
}

/**
 * Pure over the xcode project's build configuration map
 * (project.pbxXCBuildConfigurationSection()): removes ENABLE_BITCODE from
 * every configuration. Returns how many settings were removed.
 */
function stripBitcode(buildConfigurations) {
  let removed = 0;
  for (const entry of Object.values(buildConfigurations || {})) {
    if (entry && typeof entry === 'object' && entry.buildSettings && 'ENABLE_BITCODE' in entry.buildSettings) {
      delete entry.buildSettings.ENABLE_BITCODE;
      removed += 1;
    }
  }
  return removed;
}

const withTpsNativeInvariants = config => {
  config = withXcodeProject(config, mod => {
    stripBitcode(mod.modResults.pbxXCBuildConfigurationSection());
    return mod;
  });
  config = withPodfile(config, mod => {
    mod.modResults.contents = applyPodfilePatches(mod.modResults.contents);
    return mod;
  });
  return withInfoPlist(config, mod => {
    mod.modResults = applyInfoPlistInvariants(mod.modResults);
    return mod;
  });
};

module.exports = withTpsNativeInvariants;
module.exports.applyPodfilePatches = applyPodfilePatches;
module.exports.assertPrebuildAllowed = assertPrebuildAllowed;
module.exports.applyInfoPlistInvariants = applyInfoPlistInvariants;
module.exports.stripBitcode = stripBitcode;
