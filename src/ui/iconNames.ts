/** Icon names for <GameIcon>, importable from pure logic without loading art. */
import { VECTOR_ICONS, type VectorIconName } from './gameIconArt';

/** Icons that reuse existing repo PNG art (mapped to files in GameIcon.tsx). */
export const RASTER_ICON_NAMES = ['energy', 'ticket', 'coin', 'crown', 'swords', 'star'] as const;

export type RasterIconName = typeof RASTER_ICON_NAMES[number];
export type GameIconName = RasterIconName | VectorIconName;

export const GAME_ICON_NAMES: readonly GameIconName[] = [
  ...RASTER_ICON_NAMES,
  ...(Object.keys(VECTOR_ICONS) as VectorIconName[]),
];

const KNOWN = new Set<string>(GAME_ICON_NAMES);

export function isGameIconName(value: unknown): value is GameIconName {
  return typeof value === 'string' && KNOWN.has(value);
}

export function isRasterIconName(value: string): value is RasterIconName {
  return (RASTER_ICON_NAMES as readonly string[]).includes(value);
}
