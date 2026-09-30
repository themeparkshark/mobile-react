// Native modules that stay in package.json until the lockfile can be
// regenerated, but must NOT be linked into the iOS binary:
// - react-native-google-mobile-ads: unused (ads were stubbed out); linking it
//   ships the Google Mobile Ads SDK and its IDFA / ATT surface to App Review.
// - react-native-worklets-core: no imports anywhere in the app.
// Remove the packages themselves with `npm uninstall` (needs a lockfile update).
module.exports = {
  dependencies: {
    'react-native-google-mobile-ads': { platforms: { ios: null, android: null } },
    'react-native-worklets-core': { platforms: { ios: null, android: null } },
  },
};
