/**
 * Icon names for <GameIcon> (WS0 UI kit). Pure data, safe to import from logic
 * and tests without loading any art.
 *
 * Every icon is a hand-drawn PNG. Where Dustin already has art for a thing
 * (Alex's originals or the art players already see today) the icon reuses that
 * file. Only the names in GENERATED_ICON_NAMES are new, made with GPT Image 2.5
 * from Alex's reference art and passed the review gate (see src/ui/README.md).
 */

/** Icons that reuse existing art, unchanged. */
export const ORIGINAL_ICON_NAMES = [
  // Currencies exactly as players see them today
  'energy', 'ticket', 'swords', 'parts', 'coin', 'coins',
  // Alex's originals
  'close', 'check', 'back', 'bell', 'settings', 'info', 'edit', 'lock', 'star', 'heart',
  'gift', 'chest', 'chestOpen', 'trophy', 'trophySilver', 'trophyBronze', 'map', 'xp',
  'shark', 'fin', 'search', 'new', 'member', 'queue',
] as const;

/** Icons with no original, drawn with the GPT Image 2.5 pipeline from Alex's references. */
export const GENERATED_ICON_NAMES = [
  'crown', 'streak', 'timer',
  'rush', 'wrench', 'pin', 'medal1', 'medal2', 'medal3', 'dice', 'sparkle', 'ride', 'camera',
  'pause', 'play', 'retry', 'arrow',
] as const;

export type GameIconName = typeof ORIGINAL_ICON_NAMES[number] | typeof GENERATED_ICON_NAMES[number];

export const GAME_ICON_NAMES: readonly GameIconName[] = [...ORIGINAL_ICON_NAMES, ...GENERATED_ICON_NAMES];

/** Old names from the first kit draft, kept so callers never break. */
export const ICON_ALIASES: Readonly<Record<string, GameIconName>> = {
  faq: 'info',
  trophyGold: 'trophy',
  compass: 'map',
  explore: 'map',
  down: 'wrench',
  vip: 'member',
  sword: 'swords',
  ridePart: 'parts',
};

const KNOWN = new Set<string>(GAME_ICON_NAMES);

export function isGameIconName(value: unknown): value is GameIconName {
  return typeof value === 'string' && KNOWN.has(value);
}

/** Resolve a name or alias to a real icon name, or undefined. */
export function resolveIconName(value: unknown): GameIconName | undefined {
  if (typeof value !== 'string') return undefined;
  if (KNOWN.has(value)) return value as GameIconName;
  return ICON_ALIASES[value];
}
