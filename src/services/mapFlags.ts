import { useEffect, useState } from 'react';
import getFeatureFlags from '../api/endpoints/platform/feature-flags';

/**
 * Park map switches from GET /feature-flags, read once per app run and shared. `map_gym_swords` (Gym and
 * Sword markers, an unfinished feature) is off unless the server sends true; an absent flag reads as off.
 */
export interface MapFlags {
  readonly gymSwords: boolean;
}

const OFF: MapFlags = { gymSwords: false };
let cached: MapFlags | null = null;
let pending: Promise<MapFlags> | null = null;

export function loadMapFlags(read: typeof getFeatureFlags = getFeatureFlags): Promise<MapFlags> {
  if (cached) return Promise.resolve(cached);
  pending ??= read().then(payload => {
    cached = { gymSwords: payload.flags.map_gym_swords === true };
    return cached;
  }).catch(() => { pending = null; return OFF; });
  return pending;
}

/** Tests only. */
export function resetMapFlagsForTests(): void {
  cached = null;
  pending = null;
}

export function useMapFlags(): MapFlags {
  const [flags, setFlags] = useState<MapFlags>(cached ?? OFF);
  useEffect(() => {
    let active = true;
    void loadMapFlags().then(value => { if (active) setFlags(value); });
    return () => { active = false; };
  }, []);
  return flags;
}
