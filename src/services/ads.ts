/**
 * Opt-in rewarded ads (AdMob through react-native-google-mobile-ads).
 *
 * The rules this file keeps:
 * - Only ever shown after a player taps an offer. Never forced, never during
 *   a mini-game, never while the line is moving (offers live on result and
 *   recap screens only).
 * - VIP players get the reward with no ad: the server pays them as soon as
 *   the offer is made.
 * - Non-personalized, G-rated requests. No App Tracking Transparency prompt,
 *   no IDFA. The server-side verification custom data is a one-time nonce,
 *   never a player id.
 * - Light on battery: the SDK starts on the first offer, never at launch, and
 *   an ad loads only when the player asks for it.
 * - The server grants, never the app: it waits for AdMob's signed callback.
 *
 * The native module ships in 1.7.0. On an older binary (1.6.0) the module is
 * missing: adsAvailable() is false, nothing is required, and offers are hidden
 * (VIP players still get theirs, which needs no ad).
 */
import { TurboModuleRegistry, NativeModules, Platform } from 'react-native';
import {
  adErrorCode, claimAdReward, getAdReward, offerAdReward, type AdPlacement, type AdReward,
} from '../api/endpoints/me/ad-rewards';
import { AD_REQUEST, REWARDED_AD_UNITS, USING_TEST_ADS } from './adConfig';

type Gma = typeof import('react-native-google-mobile-ads');

/** True when this binary has the Google Mobile Ads module (1.7.0 and later, iOS only). */
export function adsAvailable(): boolean {
  if (Platform.OS !== 'ios') return false;
  try {
    return !!(TurboModuleRegistry.get('RNGoogleMobileAdsModule') ?? NativeModules.RNGoogleMobileAdsModule);
  } catch {
    return false;
  }
}

function gma(): Gma {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('react-native-google-mobile-ads') as Gma;
}

let started: Promise<void> | null = null;

/** Starts the SDK once, on the first offer a player taps. */
function start(): Promise<void> {
  if (!started) {
    started = (async () => {
      const ads = gma();
      await ads.default().setRequestConfiguration({ maxAdContentRating: ads.MaxAdContentRating[AD_REQUEST.maxAdContentRating] });
      await ads.default().initialize();
    })().catch((error) => {
      started = null;
      throw error;
    });
  }
  return started;
}

type Watched = 'earned' | 'closed' | 'failed';

/** Loads and shows one rewarded ad; resolves once it is dismissed. */
function watch(placement: AdPlacement, nonce: string): Promise<Watched> {
  const { RewardedAd, RewardedAdEventType, AdEventType } = gma();
  const ad = RewardedAd.createForAdRequest(REWARDED_AD_UNITS[placement], {
    requestNonPersonalizedAdsOnly: AD_REQUEST.requestNonPersonalizedAdsOnly,
    serverSideVerificationOptions: { customData: nonce },
  });
  return new Promise<Watched>((resolve) => {
    let earned = false;
    let done = false;
    const unsubs: (() => void)[] = [];
    const finish = (result: Watched) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsubs.forEach(off => off());
      resolve(result);
    };
    // A fill that never comes must not leave the player waiting.
    const timer = setTimeout(() => finish('failed'), 20000);
    unsubs.push(ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      clearTimeout(timer);
      ad.show().catch(() => finish('failed'));
    }));
    unsubs.push(ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => { earned = true; }));
    unsubs.push(ad.addAdEventListener(AdEventType.CLOSED, () => finish(earned ? 'earned' : 'closed')));
    unsubs.push(ad.addAdEventListener(AdEventType.ERROR, () => finish('failed')));
    ad.load();
  });
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Waits for the server to see AdMob's signed callback (usually a few seconds). */
async function awaitGrant(nonce: string): Promise<AdReward | null> {
  if (USING_TEST_ADS) {
    // Google's test units send no callback; the server accepts the app's own
    // word only while ADS_TRUST_CLIENT_CLAIMS is on (testing).
    const claimed = await claimAdReward(nonce).catch(() => null);
    if (claimed) return claimed;
  }
  for (let i = 0; i < 8; i++) {
    await sleep(i === 0 ? 1200 : 1800);
    const reward = await getAdReward(nonce).catch(() => null);
    if (reward && reward.status !== 'offered') return reward;
  }
  return null;
}

export type AdOutcome =
  | { status: 'granted'; reward: AdReward } // paid (VIP: with no ad)
  | { status: 'checking'; nonce: string } // ad watched; the server has not confirmed yet
  | { status: 'skipped' } // the player closed the ad early: nothing is paid
  | { status: 'capped' | 'claimed' | 'not_eligible' | 'unavailable' | 'no_fill' | 'failed' };

/**
 * The whole opt-in flow for one offer the player tapped: ask the server for
 * the offer (VIP is paid here), show one ad, wait for the server's grant.
 */
export async function watchForReward(
  placement: AdPlacement, ref: string | number | null, vip: boolean,
): Promise<AdOutcome> {
  if (!vip && !adsAvailable()) return { status: 'unavailable' };
  let offer: AdReward;
  try {
    offer = await offerAdReward(placement, ref);
  } catch (error) {
    const code = adErrorCode(error);
    if (code === 'ADS_DAILY_CAP') return { status: 'capped' };
    if (code === 'ADS_ALREADY_CLAIMED') return { status: 'claimed' };
    if (code === 'ADS_NOT_ELIGIBLE') return { status: 'not_eligible' };
    return { status: 'failed' };
  }
  if (offer.status === 'granted') return { status: 'granted', reward: offer };
  if (!adsAvailable()) return { status: 'unavailable' };

  let watched: Watched;
  try {
    await start();
    watched = await watch(placement, offer.nonce);
  } catch {
    return { status: 'no_fill' };
  }
  if (watched === 'failed') return { status: 'no_fill' };
  if (watched === 'closed') return { status: 'skipped' };

  const reward = await awaitGrant(offer.nonce);
  if (reward?.status === 'granted') return { status: 'granted', reward };
  if (reward?.refused_reason === 'daily_cap') return { status: 'capped' };
  if (reward?.refused_reason === 'already_claimed') return { status: 'claimed' };
  return { status: 'checking', nonce: offer.nonce };
}

/** "+60 Shark Coins", "+1 Park Ticket", "+20 Energy". */
export function rewardText(reward: AdReward['reward']): string {
  const parts: string[] = [];
  if (reward.tickets) parts.push(`+${reward.tickets} Park Ticket${reward.tickets === 1 ? '' : 's'}`);
  if (reward.coins) parts.push(`+${reward.coins} Shark Coins`);
  if (reward.energy) parts.push(`+${reward.energy} Energy`);
  return parts.join(' and ');
}
