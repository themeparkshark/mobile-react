/**
 * The Marquee (night recap) model: the display lines, kept separable from the
 * card art so Share Studio can take the same data. Pure, unit tested (F4).
 */
import type { FrightRecap } from '../../api/endpoints/fright/types';
import { critterName, marqueeCatchLine } from './critters';
import { formatMinutes, nightDateLabel } from './dates';

export interface MarqueeModel {
  readonly date: string;
  readonly headline: string;
  readonly hauntsSurvived: number;
  /** The player's own top-ranked haunt tonight (highest fins, first finished on a tie). */
  readonly topHaunt: string | null;
  readonly timeInLine: string | null;
  readonly caseFiles: number;
  /** The caught critter's name (null when unknown or nothing was caught). */
  readonly encounter: string | null;
  /** "Caught Ringmaster Riptide", "Caught a Chaos critter" when only the catch is known, or null. */
  readonly caught: string | null;
  readonly tenInOne: boolean;
  readonly nightNumber: number;
}

export function marqueeModel(recap: FrightRecap): MarqueeModel {
  const haunts = recap.totals.haunts ?? recap.haunts.length;
  const ranked = recap.haunts.filter(h => h.score != null).slice()
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || Date.parse(a.at) - Date.parse(b.at));
  const minutes = recap.totals.minutes_in_line;
  return {
    date: nightDateLabel(recap.night_on) ?? recap.night_on,
    headline: haunts > 0 ? (haunts === 1 ? '1 haunt survived!' : `${haunts} haunts survived!`) : 'Scouted the reefs tonight.',
    hauntsSurvived: haunts,
    topHaunt: ranked[0]?.name ?? null,
    timeInLine: minutes > 0 ? `${formatMinutes(minutes)} in line` : null,
    caseFiles: recap.case_files.length,
    encounter: recap.encounter && typeof recap.encounter === 'object' ? critterName(recap.encounter) : null,
    caught: marqueeCatchLine(recap.encounter),
    tenInOne: !!recap.ten_in_one,
    nightNumber: recap.night_number,
  };
}
