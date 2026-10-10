import { useEffect, useState } from 'react';
import getFeatureFlags from '../../api/endpoints/platform/feature-flags';

/**
 * The server switches the money screens read (GET /api/feature-flags), cached
 * for 5 minutes. Off unless the server sends a real true.
 * - pin_mystery_boxes: Mystery Pin Boxes are live (the Supplies coin line and
 *   VIP's free weekly box only show then).
 */
const TTL = 5 * 60_000;
let cached: { flags: Record<string, boolean>; at: number } | null = null;
let pending: Promise<Record<string, boolean>> | null = null;

export function loadMoneyFlags(): Promise<Record<string, boolean>> {
  if (cached && Date.now() - cached.at < TTL) return Promise.resolve(cached.flags);
  pending ??= getFeatureFlags().then((payload) => {
    cached = { flags: payload.flags as Record<string, boolean>, at: Date.now() };
    return cached.flags;
  }).catch(() => cached?.flags ?? {}).finally(() => { pending = null; });
  return pending;
}

export function useMoneyFlag(name: string): boolean {
  const [on, setOn] = useState(cached?.flags[name] === true);
  useEffect(() => {
    let live = true;
    void loadMoneyFlags().then(flags => { if (live) setOn(flags[name] === true); });
    return () => { live = false; };
  }, [name]);
  return on;
}

/** A Mystery Pin Box costs this many coins (pins stream, Dustin's call: 250, or 5 for 1,100). */
export const MYSTERY_BOX_COINS = 250;

/** VIP's weekly Mystery Pin Box (pins: MysteryBoxService::vipWeekly), listed only while boxes are live. */
export const VIP_WEEKLY_BOX_PERK = {
  icon: 'gift', title: '1 free Mystery Pin Box every week', body: 'Free every week you’re VIP. Odds are shown on the box.',
} as const;
