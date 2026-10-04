/**
 * Fin-ister payloads for Share Studio (share-studio/CONTRACT.md kinds 9-11).
 * Parody names and server headlines only: no dates, park names or usernames.
 * Pure, unit tested.
 */
import type { FrightCard, FrightRecap, FrightSlot } from '../../api/endpoints/fright/types';
import type { FlexPayloads } from '../../share/types';

/** Full night recap (Marquee data) -> fright_night. */
export function recapFlex(recap: FrightRecap): FlexPayloads['fright_night'] {
  return {
    cardTitle: recap.card_title,
    headline: recap.headline || (recap.totals.haunts === 1 ? '1 haunt survived!' : `${recap.totals.haunts} haunts survived!`),
    nightNumber: recap.night_number,
    haunts: recap.totals.haunts,
    minutesInLine: recap.totals.minutes_in_line,
    badgeUrls: recap.haunts.map(haunt => haunt.badge).filter((url): url is string => !!url).slice(0, 10),
    statLines: recap.share?.stat_lines?.slice(0, 2) ?? [],
  };
}

/** A night from the Deep Lantern's history (no badge list on the card) -> fright_night. */
export function nightFlex(card: Pick<FrightCard, 'card_title'>, night: { haunts: number; minutes_in_line: number },
  nightNumber?: number): FlexPayloads['fright_night'] {
  return {
    cardTitle: card.card_title,
    headline: night.haunts === 1 ? '1 haunt survived!' : `${night.haunts} haunts survived!`,
    nightNumber, haunts: night.haunts, minutesInLine: night.minutes_in_line,
  };
}

/** An earned haunt slot (house badge, pin beside it) -> fright_badge. */
export function badgeFlex(card: Pick<FrightCard, 'card_title'>, slot: FrightSlot): FlexPayloads['fright_badge'] | null {
  if (!slot.earned || slot.kind !== 'haunt') return null;
  return {
    cardTitle: card.card_title, hauntName: slot.name,
    badgeUrl: slot.badge ?? slot.pin?.image ?? slot.pin_art?.image ?? null,
    pinUrl: slot.pin?.image ?? slot.pin_art?.image ?? null,
    runs: slot.runs,
  };
}

/** The whole Deep Lantern -> fright_lifetime (this season's card numbers). */
export function lanternFlex(card: FrightCard): FlexPayloads['fright_lifetime'] {
  const haunts = card.slots.filter(slot => slot.kind === 'haunt');
  const runs = haunts.reduce((sum, slot) => sum + Math.max(0, slot.runs), 0);
  const distinct = haunts.filter(slot => slot.earned).length;
  return { hauntsSurvived: runs, reSwims: Math.max(0, runs - distinct), nights: card.nights, cardTitle: card.card_title };
}

/**
 * The night a Marquee "Share from your Lantern" tap asked for: its recap row
 * and its night number (1 = the first night on the card), or null when the
 * card has no shareable row for that night (no haunts yet, or not on the card).
 */
export function featuredNight(card: Pick<FrightCard, 'recaps'>, nightOn: string | null | undefined):
  { readonly night: FrightCard['recaps'][number]; readonly number: number } | null {
  if (!nightOn) return null;
  const ordered = card.recaps.slice().sort((a, b) => a.night_on.localeCompare(b.night_on));
  const index = ordered.findIndex(item => item.night_on === nightOn);
  if (index < 0 || ordered[index].haunts <= 0) return null;
  return { night: ordered[index], number: index + 1 };
}
