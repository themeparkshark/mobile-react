/**
 * The player's switches for the guide and the unlock ladder (GET /feature-flags, read once per app
 * run and shared). An absent switch reads as off, so the guide never promises a switched-off
 * feature: the line Ticket copy needs queue_tickets, rung 4 needs daily_three or level_chests, and
 * so on (core loop blueprint 4.4 and 9). Owned by the guide-map lane.
 */
import { useEffect, useState } from 'react';
import getFeatureFlags from '../../api/endpoints/platform/feature-flags';

export type GuideFlags = Readonly<Record<string, boolean>>;

const OFF: GuideFlags = Object.freeze({});
let cached: GuideFlags | null = null;
let cachedFor: number | null = null;
let pending: Promise<GuideFlags> | null = null;
let fetchedAt = 0;
/** The server caches flags for 60 s; the guide re-reads them at most every 5 minutes. */
const REFRESH_MS = 5 * 60 * 1000;

/** Only true booleans count: anything else is off. */
export function cleanFlags(raw: unknown): GuideFlags {
  const out: Record<string, boolean> = {};
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) out[key] = value === true;
  }
  return Object.freeze(out);
}

/** Switches are per player (preview lists): a different player never reads another's cache. */
export function loadGuideFlags(playerId: number | null, read: typeof getFeatureFlags = getFeatureFlags, now = Date.now()): Promise<GuideFlags> {
  if (cachedFor !== playerId) { cached = null; pending = null; cachedFor = playerId; }
  if (cached && now - fetchedAt < REFRESH_MS) return Promise.resolve(cached);
  const forPlayer = playerId;
  pending ??= read().then(payload => {
    const flags = cleanFlags(payload?.flags);
    if (cachedFor === forPlayer) { cached = flags; fetchedAt = Date.now(); }
    return flags;
  }).catch(() => cached ?? OFF).finally(() => { pending = null; });
  return pending;
}

/** Sign-out and tests: forget the switches (a new player may have other preview switches). */
export function resetGuideFlags(): void {
  cached = null;
  cachedFor = null;
  pending = null;
  fetchedAt = 0;
}

export function useGuideFlags(playerId: number | null): GuideFlags {
  const [flags, setFlags] = useState<GuideFlags>(cachedFor === playerId && cached ? cached : OFF);
  useEffect(() => {
    if (playerId == null) { setFlags(OFF); return undefined; }
    let active = true;
    void loadGuideFlags(playerId).then(value => { if (active) setFlags(value); });
    return () => { active = false; };
  }, [playerId]);
  return flags;
}
