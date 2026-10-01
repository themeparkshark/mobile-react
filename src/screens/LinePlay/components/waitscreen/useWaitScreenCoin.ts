/**
 * The wait screen's coin: which coin this line levels, its level and costs,
 * and the live Part balance. Works offline: the last known coin and wait ratio
 * are kept per ride, and Parts the session credits while offline add on top.
 *
 * Level up is a tap the player makes (the server spends Parts and Energy);
 * this hook only calls the existing level-up endpoint.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import getRideCoin, { type CollectedRideCoin } from '../../../../api/endpoints/me/ride-coins/show';
import levelUpRideCoin, { type LevelUpResult } from '../../../../api/endpoints/me/ride-coins/level-up';
import type { LineWaitScreenSummary } from '../../../../api/endpoints/me/inline-timer/types';
import { livePartsBanked } from '../../../../services/lineplay/waitScreen';
import { PREVIEW_WAIT_COIN } from './waitScreenPreview';

const CACHE_PREFIX = 'lineplay_wait_coin_v1:';

/** The few coin fields the wait screen draws. */
export interface WaitCoin {
  readonly id: number;
  readonly rideName: string;
  readonly coinUrl: string;
  readonly level: number;
  readonly maxLevel: number;
  readonly partsToNext: number;
  readonly energyToNext: number;
  readonly nextTierName: string | null;
  readonly boss: CollectedRideCoin['boss'] | null;
}

interface CachedWaitCoin {
  readonly assetId: number;
  readonly owned: boolean;
  readonly coin: WaitCoin | null;
  readonly banked: number | null;
  readonly creditedAtCache: number;
  readonly ratio: number | null;
}

export type WaitCoinStatus = 'loading' | 'owned' | 'unowned' | 'unavailable';

function toWaitCoin(coin: CollectedRideCoin): WaitCoin {
  return {
    id: coin.id,
    rideName: coin.ride_name,
    coinUrl: coin.coin_url,
    level: coin.current_level,
    maxLevel: coin.max_level,
    partsToNext: coin.parts_to_next_level,
    energyToNext: coin.energy_to_next_level,
    nextTierName: coin.next_tier_name ?? coin.next_tier ?? null,
    boss: coin.boss ?? null,
  };
}

export interface UseWaitScreenCoin {
  readonly status: WaitCoinStatus;
  readonly coin: WaitCoin | null;
  readonly partsBanked: number;
  /** Server ratio, or the last one seen at this ride (offline). */
  readonly waitRatio: number | null;
  readonly inLineNow: number | null;
  readonly levelUp: () => Promise<LevelUpResult>;
}

export default function useWaitScreenCoin(input: {
  readonly rideId: number | null;
  readonly waitScreen: LineWaitScreenSummary | null | undefined;
  readonly creditedParts: number | null;
  readonly enabled: boolean;
  /** Dev preview only: a fixture coin, no network. */
  readonly preview?: boolean;
}): UseWaitScreenCoin {
  const [previewCoin, setPreviewCoin] = useState<WaitCoin>(PREVIEW_WAIT_COIN);
  const [previewSpent, setPreviewSpent] = useState(0);
  const { rideId, waitScreen, enabled } = input;
  const credited = input.creditedParts ?? 0;
  const [cache, setCache] = useState<CachedWaitCoin | null>(null);
  const [status, setStatus] = useState<WaitCoinStatus>('loading');
  /** Banked after a level up, until the next server count replaces it. */
  const [override, setOverride] = useState<{ banked: number; for: LineWaitScreenSummary | null | undefined } | null>(null);
  const fetchedFor = useRef<number | null>(null);
  const creditedRef = useRef(credited);
  creditedRef.current = credited;
  const key = rideId != null ? `${CACHE_PREFIX}${rideId}` : null;

  // Last known coin for this ride: the wait screen draws instantly and offline.
  useEffect(() => {
    if (!key || !enabled || input.preview) return undefined;
    let alive = true;
    void AsyncStorage.getItem(key).then(raw => {
      if (!alive || !raw) return;
      const saved = JSON.parse(raw) as CachedWaitCoin;
      setCache(current => current ?? saved);
      setStatus(current => current === 'loading' ? saved.owned ? 'owned' : 'unowned' : current);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [key, enabled]);

  const persist = useCallback((next: CachedWaitCoin) => {
    setCache(next);
    if (key) void AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => undefined);
  }, [key]);

  // Fetch the coin once per asset (and again after a level up).
  const assetId = waitScreen?.coin_asset_id ?? cache?.assetId ?? null;
  useEffect(() => {
    if (!enabled || input.preview || assetId == null || fetchedFor.current === assetId) return undefined;
    fetchedFor.current = assetId;
    let alive = true;
    void getRideCoin(assetId).then(response => {
      if (!alive) return;
      const coin = toWaitCoin(response.data);
      setStatus('owned');
      persist({ assetId, owned: true, coin, banked: waitScreen?.parts_banked ?? response.data.available_parts ?? cache?.banked ?? null,
        creditedAtCache: creditedRef.current, ratio: waitScreen?.wait_ratio ?? cache?.ratio ?? null });
    }).catch(error => {
      if (!alive) return;
      const code = (error as { response?: { status?: number } })?.response?.status;
      if (code === 404) {
        setStatus('unowned');
        persist({ assetId, owned: false, coin: null, banked: waitScreen?.parts_banked ?? null,
          creditedAtCache: creditedRef.current, ratio: waitScreen?.wait_ratio ?? cache?.ratio ?? null });
      } else {
        // Offline: keep the cached coin; retry on the next server answer.
        fetchedFor.current = null;
        setStatus(current => current === 'loading' ? cache ? cache.owned ? 'owned' : 'unowned' : 'unavailable' : current);
      }
    });
    return () => { alive = false; };
  }, [assetId, enabled, waitScreen != null]);

  // Keep the offline baseline fresh whenever the server reports a count.
  useEffect(() => {
    if (!cache || !waitScreen || waitScreen.parts_banked == null) return;
    if (cache.banked === waitScreen.parts_banked && cache.ratio === (waitScreen.wait_ratio ?? cache.ratio)) return;
    persist({ ...cache, banked: waitScreen.parts_banked, creditedAtCache: creditedRef.current,
      ratio: waitScreen.wait_ratio ?? cache.ratio });
  }, [waitScreen?.parts_banked, waitScreen?.wait_ratio]);

  const serverBanked = waitScreen?.parts_banked ?? null;
  const banked = override && override.for === waitScreen ? override.banked
    : livePartsBanked({ serverBanked, cachedBanked: cache?.banked ?? null, creditedNow: credited,
      creditedAtCache: cache?.creditedAtCache ?? credited });

  const levelUp = useCallback(async () => {
    const coin = cache?.coin;
    if (!coin) throw new Error('No coin');
    const result = await levelUpRideCoin(coin.id, coin.level);
    if (result.success && result.ride_coin) {
      const next = toWaitCoin(result.ride_coin as CollectedRideCoin);
      const left = result.ride_coin.available_parts ?? Math.max(0, banked - (result.spent?.ride_parts ?? coin.partsToNext));
      setOverride({ banked: left, for: waitScreen });
      persist({ ...cache!, coin: { ...next, nextTierName: next.nextTierName }, banked: left, creditedAtCache: creditedRef.current });
    }
    return result;
  }, [cache, banked, waitScreen, persist]);

  if (input.preview) {
    return {
      status: 'owned', coin: previewCoin, partsBanked: Math.max(0, (waitScreen?.parts_banked ?? 0) - previewSpent),
      waitRatio: waitScreen?.wait_ratio ?? null, inLineNow: waitScreen?.in_line_now ?? null,
      levelUp: async () => {
        setPreviewSpent(previewCoin.partsToNext);
        setPreviewCoin(coin => ({ ...coin, level: coin.level + 1, partsToNext: 6, energyToNext: 30, nextTierName: 'Prismatic' }));
        return { success: true, ride_coin: {} as never, spent: { energy: 20, ride_parts: 4 } };
      },
    };
  }

  return {
    status: enabled ? status : 'unavailable',
    coin: cache?.coin ?? null,
    partsBanked: banked,
    waitRatio: waitScreen?.wait_ratio ?? cache?.ratio ?? null,
    inLineNow: waitScreen?.in_line_now ?? null,
    levelUp,
  };
}
