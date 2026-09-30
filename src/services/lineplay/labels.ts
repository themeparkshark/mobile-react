/**
 * Display-label overrides for LinePlay copy that names a third party.
 *
 * Dustin decides the trademark calls (Apple 5.2.1): whether "Source: Disney
 * Parks Blog" becomes "Park fact", and whether chapter kickers keep the park
 * name. Until he does, the defaults render exactly what ships today. Flip a
 * value here, or set the matching EXPO_PUBLIC_ variable for a build, to change
 * every LinePlay surface at once without touching the authored content.
 */
import type { LinePlayChapter } from './chapters';

export interface LinePlayLabelOverrides {
  /** Replaces the whole "Source: <publisher>" line, e.g. "Park fact". null keeps the source. */
  readonly sourceLabel: string | null;
  /** Drop the park name from chapter kickers ("SHARK FAN MISSION" alone). */
  readonly hideParkInKicker: boolean;
}

function envFlag(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

export const LINEPLAY_LABEL_OVERRIDES: LinePlayLabelOverrides = {
  sourceLabel: process.env.EXPO_PUBLIC_LINEPLAY_SOURCE_LABEL?.trim() || null,
  hideParkInKicker: envFlag(process.env.EXPO_PUBLIC_LINEPLAY_HIDE_PARK_KICKER),
};

/** The attribution line under a fact, or null when there is nothing to show. */
export function factSourceLine(source: string | undefined | null,
  overrides: LinePlayLabelOverrides = LINEPLAY_LABEL_OVERRIDES): string | null {
  if (!source?.trim()) return null;
  return overrides.sourceLabel ?? `Source: ${source.trim()}`;
}

/** The small caps kicker over a ride chapter title. */
export function chapterKicker(chapter: Pick<LinePlayChapter, 'parkLabel' | 'episodeLabel'>,
  overrides: LinePlayLabelOverrides = LINEPLAY_LABEL_OVERRIDES): string {
  const park = chapter.parkLabel?.trim();
  const lead = chapter.episodeLabel?.trim() || 'SHARK FAN MISSION';
  return overrides.hideParkInKicker || !park ? lead : `${lead} · ${park}`;
}
