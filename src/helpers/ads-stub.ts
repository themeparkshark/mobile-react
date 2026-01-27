// Stub for react-native-google-mobile-ads when running in Expo Go
// Original package.json saved as package.json.full-native

// Default export - mobileAds function
const mobileAds = () => ({
  setRequestConfiguration: async () => {},
  initialize: async () => {},
});

export default mobileAds;

export const InterstitialAd = {
  createForAdRequest: () => ({
    load: () => {},
    show: () => Promise.resolve(),
    addAdEventListener: () => () => {},
  }),
};

export const RewardedAd = {
  createForAdRequest: () => ({
    load: () => {},
    show: () => Promise.resolve(),
    addAdEventListener: () => () => {},
  }),
};

export const MaxAdContentRating = {
  G: 'G',
  PG: 'PG',
  T: 'T',
  MA: 'MA',
};

export const RewardedAdEventType = {
  LOADED: 'loaded',
  EARNED_REWARD: 'earned_reward',
};

export const AdEventType = {
  CLOSED: 'closed',
  ERROR: 'error',
  LOADED: 'loaded',
};

export const TestIds = {
  REWARDED: 'test-rewarded',
  INTERSTITIAL: 'test-interstitial',
  BANNER: 'test-banner',
};

// Hook stub
export const useInterstitialAd = () => ({
  isLoaded: false,
  isClosed: false,
  load: () => {},
  show: () => {},
});

export const useRewardedAd = () => ({
  isLoaded: false,
  isClosed: false,
  load: () => {},
  show: () => {},
});
