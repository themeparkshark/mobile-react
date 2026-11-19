/**
 * GameIconName to Alex's art, for the props GameButton, GameDialog and SharkLoader callers pass
 * as `icon` (46 GameButton uses, about 23 dialog calls). Only the original names (Alex's files and
 * the currency art players see today) map; a generated icon name draws nothing in the kit and
 * warns in development, so step 2 lists those sites instead of shipping new drawing.
 */
import { ICON_SOURCES } from '../GameIcon';
import { ORIGINAL_ICON_NAMES, type GameIconName } from '../iconNames';
import { warnOnce } from './level';

const ORIGINAL = new Set<string>(ORIGINAL_ICON_NAMES);

/** Alex's art for an icon name, or undefined (no name, or a generated icon the kit does not draw). */
export function iconArt(name: GameIconName | undefined, where: string = 'kit'): number | undefined {
  if (!name) return undefined;
  if (ORIGINAL.has(name)) return ICON_SOURCES[name];
  warnOnce(`icon-${name}`, __DEV__, m => console.warn(m), `${where}: icon "${name}" is not one of Alex's files; the kit draws no generated icons. Pass Alex's art as \`image\`.`);
  return undefined;
}
