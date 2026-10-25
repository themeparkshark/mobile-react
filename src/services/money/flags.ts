import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../context/AuthProvider';
import getFeatureFlags from '../../api/endpoints/platform/feature-flags';

/**
 * The server switches the money screens read (GET /api/feature-flags), cached
 * for 5 minutes. Off unless the server sends a real true.
 * - pin_mystery_boxes: Mystery Pin Boxes are live (the Supplies coin line and
 *   VIP's free weekly box only show then).
 */
const TTL = 5 * 60_000;
// Keyed by the signed-in player: preview flags are per player, and the signed-out read at launch
// (always off, cached by the phone for a minute) must never answer for the player who signs in.
let cached: { flags: Record<string, boolean>; at: number; who: string } | null = null;
let pending: Promise<Record<string, boolean>> | null = null;
let pendingFor = '';

export function loadMoneyFlags(who: string | number = ''): Promise<Record<string, boolean>> {
  const key = String(who);
  if (cached && cached.who === key && Date.now() - cached.at < TTL) return Promise.resolve(cached.flags);
  if (pending && pendingFor === key) return pending;
  pendingFor = key;
  const mine: Promise<Record<string, boolean>> = getFeatureFlags(key || undefined).then((payload) => {
    const flags = payload.flags as Record<string, boolean>;
    if (pendingFor === key) cached = { flags, at: Date.now(), who: key };
    return flags;
  }).catch(() => (cached?.who === key ? cached.flags : {})).finally(() => { if (pending === mine) pending = null; });
  pending = mine;
  return mine;
}

export function useMoneyFlag(name: string): boolean {
  const who = String(useContext(AuthContext).player?.id ?? '');
  const [on, setOn] = useState(cached?.who === who && cached.flags[name] === true);
  useEffect(() => {
    let live = true;
    void loadMoneyFlags(who).then(flags => { if (live) setOn(flags[name] === true); });
    return () => { live = false; };
  }, [name, who]);
  return on;
}

/** A Mystery Pin Box costs this many coins (pins stream, Dustin's call: 250, or 5 for 1,100). */
export const MYSTERY_BOX_COINS = 250;

/** VIP's weekly Mystery Pin Box (pins: MysteryBoxService::vipWeekly), listed only while boxes are live. */
export const VIP_WEEKLY_BOX_PERK = {
  icon: 'gift', title: '1 free Mystery Pin Box every week', body: 'Free every week you’re VIP. Odds are shown on the box.',
} as const;
