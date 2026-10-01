// Native modules that stay in package.json until the lockfile can be
// regenerated, but must NOT be linked into the iOS binary:
// (react-native-google-mobile-ads is linked again from 1.7.0 for opt-in
// rewarded ads: non-personalized, no ATT prompt. See src/services/ads.ts.)
// - react-native-worklets-core: no imports anywhere in the app.
// - react-native-maps: the game map is MapLibre; dev previews use it too.
// Remove the packages themselves with `npm uninstall` (needs a lockfile update).
module.exports = {
  dependencies: {
    'react-native-worklets-core': { platforms: { ios: null, android: null } },
    'react-native-maps': { platforms: { ios: null, android: null } },
  },
};
