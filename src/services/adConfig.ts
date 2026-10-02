/**
 * AdMob ids in one place. Swapping Google's test ids for the real ones is
 * this file plus the app id in app.config.js / ios Info.plist (SETUP.md).
 *
 * Google's official TEST ids: they always fill with a test ad, pay nothing and
 * send no server-side verification callback (the server needs
 * ADS_TRUST_CLIENT_CLAIMS=true while these are in use).
 */
import type { AdPlacement } from '../api/endpoints/me/ad-rewards';

/** Google's sample iOS app id (GADApplicationIdentifier). Real one: SETUP.md. */
export const ADMOB_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';

/** Google's iOS rewarded test unit. */
const TEST_REWARDED_IOS = 'ca-app-pub-3940256099942544/1712485313';

/** One rewarded ad unit per placement, so each has its own SSV and reporting. */
export const REWARDED_AD_UNITS: Record<AdPlacement, string> = {
  double_coins: TEST_REWARDED_IOS,
  daily_ticket: TEST_REWARDED_IOS,
  retry: TEST_REWARDED_IOS,
  line_energy: TEST_REWARDED_IOS,
};

export const USING_TEST_ADS = Object.values(REWARDED_AD_UNITS).every(id => id === TEST_REWARDED_IOS);

/**
 * Kids-friendly and no tracking: G-rated ads only, non-personalized requests
 * (no IDFA, no App Tracking Transparency prompt).
 */
export const AD_REQUEST = {
  requestNonPersonalizedAdsOnly: true,
  maxAdContentRating: 'G',
} as const;
