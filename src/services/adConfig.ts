/**
 * AdMob ids in one place.
 *
 * Store builds (1.7.0) ship with ads OFF: there is no AdMob account yet, and
 * Google's TEST ad units must never reach the App Store. With no real unit
 * ids, ADS_ENABLED is false, the SDK is never started, offers are hidden for
 * regular players (VIP still gets the reward with no ad).
 *
 * Turning ads on later (monetization/SETUP.md section 3):
 *   1. Put the real rewarded unit ids in REWARDED_AD_UNITS below.
 *   2. Put the real AdMob app id in app.config.js, ios Info.plist
 *      (GADApplicationIdentifier) and ADMOB_IOS_APP_ID here. The app id lives
 *      in Info.plist, so it needs a native build; the unit ids alone can ship
 *      over the air only once that binary is out.
 *   3. Turn ADS_TRUST_CLIENT_CLAIMS off on the production server.
 *
 * Google's TEST units are only used by dev builds and the internal tester
 * profile (EXPO_PUBLIC_TPS_TEST_ADS=1 in eas.json). They always fill,
 * pay nothing and send no server-side verification callback (the server needs
 * ADS_TRUST_CLIENT_CLAIMS=true while they are in use).
 */
import type { AdPlacement } from '../api/endpoints/me/ad-rewards';

/** Google's sample iOS app id (GADApplicationIdentifier). Real one: SETUP.md. */
export const ADMOB_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';

/** Real rewarded unit ids from Dustin's AdMob account. null until it exists. */
export const REWARDED_AD_UNITS: Record<AdPlacement, string | null> = {
  double_coins: null,
  daily_ticket: null,
  retry: null,
  line_energy: null,
};

const hasRealUnits = Object.values(REWARDED_AD_UNITS).every(id => !!id);

/** Dev and internal tester bundles only (EXPO_PUBLIC_TPS_TEST_ADS=1 in eas.json). */
const allowTestAds = __DEV__ || process.env.EXPO_PUBLIC_TPS_TEST_ADS === '1';

/**
 * No real units: Google's rewarded TEST unit (the SDK's own TestIds.REWARDED,
 * so no test id is written in app code). Store bundles never use it.
 */
export const USING_TEST_ADS = !hasRealUnits && allowTestAds;

/** Ads can be shown at all: real units, or test units in a dev/tester bundle. */
export const ADS_ENABLED = hasRealUnits || USING_TEST_ADS;

/**
 * Kids-friendly and no tracking: G-rated ads only, non-personalized requests
 * (no IDFA, no App Tracking Transparency prompt).
 */
export const AD_REQUEST = {
  requestNonPersonalizedAdsOnly: true,
  maxAdContentRating: 'G',
} as const;
