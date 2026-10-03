/**
 * F4: when the Marquee (night recap) is offered. Pure, unit tested.
 *
 * Offered ONCE per night, and only when at least one haunt was logged that
 * night (a zero-haunt night has no recap to show), at the first of:
 *  (a) the park presence leaves after 9 PM park time with 1+ haunts done;
 *  (b) the phase reaches `after`;
 *  (c) the next app open within 36 h of close.
 * The night is the server's `night_on` (park-local), never the phone's date.
 */
import type { FrightPhase, FrightTonight } from '../../api/endpoints/fright/types';
import { FRIGHT_DEFAULTS } from './config';
import { nightInstant } from './dates';

/** What the app remembers about the last night the mode was ON (AsyncStorage). */
export interface NightRecord {
  readonly slug: string;
  readonly nightOn: string;
  readonly parkId: number;
  readonly opensAt: string;
  readonly closesAt: string;
  readonly haunts: number;
  /** The Marquee was offered for this night (local mirror of recap_seen). */
  readonly offered: boolean;
}

export type RecapReason = 'exit' | 'after' | 'next_open';

export interface RecapInput {
  readonly record: NightRecord | null | undefined;
  readonly now: number;
  readonly phase: FrightPhase;
  /** Phase belongs to the record's night (tonight.night.night_on === record.nightOn). */
  readonly phaseNightOn?: string | null;
  /** Server says recap_seen for the record's night. */
  readonly serverSeen?: boolean;
  /** The player's park presence just left the record's park. */
  readonly parkLeft?: boolean;
  /** First evaluation after the app came to the foreground. */
  readonly appOpened?: boolean;
}

export function recapTrigger(input: RecapInput): { slug: string; nightOn: string; reason: RecapReason } | null {
  const { record, now, phase, phaseNightOn, serverSeen, parkLeft, appOpened } = input;
  if (!record || record.offered || serverSeen || record.haunts < 1) return null;
  const closes = Date.parse(record.closesAt);
  if (Number.isFinite(closes) && now - closes > FRIGHT_DEFAULTS.recapWindowMs) return null;
  const hit = (reason: RecapReason) => ({ slug: record.slug, nightOn: record.nightOn, reason });
  if (phase === 'after' && (!phaseNightOn || phaseNightOn === record.nightOn)) return hit('after');
  if (parkLeft) {
    const nine = nightInstant(record.nightOn, `${String(FRIGHT_DEFAULTS.recapExitHour).padStart(2, '0')}:00`, record.opensAt);
    if (nine != null && now >= nine) return hit('exit');
  }
  if (appOpened && Number.isFinite(closes) && now >= closes) return hit('next_open');
  return null;
}

/** Build or refresh the night record from tonight's payload while the mode is ON. */
export function nightRecordFrom(tonight: FrightTonight, previous: NightRecord | null | undefined): NightRecord | null {
  if (!tonight.event || !tonight.night) return previous ?? null;
  const same = previous && previous.slug === tonight.event.slug && previous.nightOn === tonight.night.night_on;
  return {
    slug: tonight.event.slug, nightOn: tonight.night.night_on, parkId: tonight.event.park_id,
    opensAt: tonight.night.opens_at, closesAt: tonight.night.closes_at,
    haunts: Math.max(tonight.me?.haunts_tonight ?? 0, same ? previous.haunts : 0),
    offered: (same ? previous.offered : false) || !!tonight.me?.recap_seen,
  };
}

export function parseNightRecord(raw: string | null | undefined): NightRecord | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value.slug === 'string' && typeof value.nightOn === 'string' && typeof value.closesAt === 'string'
      ? value as NightRecord : null;
  } catch {
    return null;
  }
}

/** The Marquee headline for zero haunts. */
export const SCOUTED_LINE = 'Scouted the reefs tonight.';
