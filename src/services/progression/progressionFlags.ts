import { useEffect, useState } from 'react';
import getFeatureFlags, { onFeatureFlags } from '../../api/endpoints/platform/feature-flags';

/**
 * The server's progression switches (S2): `progression_v2` (coins to Level 10,
 * perks, Ride Masters) and `ride_boss`. Read once per app run and shared; off
 * until the server says otherwise, so nothing new shows on an old server.
 */
export interface ProgressionFlags {
  readonly progressionV2: boolean;
  readonly rideBoss: boolean;
}

const OFF: ProgressionFlags = { progressionV2: false, rideBoss: false };
let cached: ProgressionFlags | null = null;
let pending: Promise<ProgressionFlags> | null = null;
const listeners = new Set<(flags: ProgressionFlags) => void>();
// T095: a later answer (a retry after a slow read) updates every reader in place.
onFeatureFlags?.(payload => {
  cached = { progressionV2: payload.flags?.progression_v2 === true, rideBoss: payload.flags?.ride_boss === true };
  listeners.forEach(listener => listener(cached as ProgressionFlags));
});

export function loadProgressionFlags(read: typeof getFeatureFlags = getFeatureFlags): Promise<ProgressionFlags> {
  if (cached) return Promise.resolve(cached);
  pending ??= read().then(payload => {
    cached = { progressionV2: payload.flags.progression_v2 === true, rideBoss: payload.flags.ride_boss === true };
    return cached;
  }).catch(() => { pending = null; return OFF; });
  return pending;
}

export function useProgressionFlags(): ProgressionFlags {
  const [flags, setFlags] = useState<ProgressionFlags>(cached ?? OFF);
  useEffect(() => {
    let active = true;
    void loadProgressionFlags().then(value => { if (active) setFlags(value); });
    const listener = (value: ProgressionFlags) => { if (active) setFlags(value); };
    listeners.add(listener);
    return () => { active = false; listeners.delete(listener); };
  }, []);
  return flags;
}
