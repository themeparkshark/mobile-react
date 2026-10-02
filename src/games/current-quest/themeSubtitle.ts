/**
 * Header subtitle (design 10.2): a land / theme id maps to a display name.
 * The ride name field is never shown (trademarked names stay out of game UI).
 */

const THEMES: Record<string, string> = {
  lagoon: 'Lagoon',
  tropical: 'Tropical Cove',
  pirates: 'Pirate Harbor',
  jungle: 'Jungle River',
  rapids: 'River Rapids',
  harbor: 'Sunset Harbor',
  space: 'Star Lagoon',
  mansion: 'Misty Bayou',
  backlot: 'Studio Lagoon',
  frontier: 'Frontier Falls',
  kingdom: 'Castle Moat',
  arctic: 'Icy Inlet',
};

export function themeSubtitle(themeId?: string | null): string {
  if (!themeId) return 'Lagoon';
  const key = themeId.toLowerCase().replace(/[^a-z]/g, '');
  return THEMES[key] ?? 'Lagoon';
}
