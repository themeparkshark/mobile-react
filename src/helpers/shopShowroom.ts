/**
 * The Secret Shop showroom's pure logic (SecretShowroom.tsx), unit tested in
 * tools/tests/shop-oct8.test.cjs.
 */
import { dailyPill, eventEndPill, featuredPill } from './shopShelves';
import type { ShopItem, ShopSection } from '../models/shop-today';

/** The showroom panel's inner width at a screen width (10 pt margins, 3 pt gold rim). */
export function showroomInnerW(screenW: number): number { return screenW - 26; }

/**
 * The stage takes what the screen has left, so the whole room (top row, stage, plate, the picker)
 * fits on one screen: about 300 pt on an iPhone 16 Pro, less for a guest (their note), never under 220.
 */
export function showroomStageH(screenW: number, windowH: number, insetTop: number, insetBottom: number, guest: boolean): number {
  const chrome = insetTop + 96 + 50 + (guest ? 64 : 0) + 150 + 172 + Math.max(insetBottom, 12);
  return Math.round(Math.max(220, Math.min(330, showroomInnerW(screenW) * 0.86, windowH - chrome)));
}

export type ShowroomKind = 'vault' | 'season' | 'tonight';
export type ShowroomEntry = { readonly item: ShopItem; readonly section: ShopSection; readonly kind: ShowroomKind };

/** Every piece in the room, in one order: the Vault's star, the rest of the Vault, each season drop, Tonight's Pick. */
export function showroomEntries(sections: readonly ShopSection[], heroId: number | null | undefined): ShowroomEntry[] {
  const out: ShowroomEntry[] = [];
  const seen = new Set<number>();
  const add = (item: ShopItem, section: ShopSection, kind: ShowroomKind) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    out.push({ item, section, kind });
  };
  const featured = sections.find(s => s.type === 'featured');
  if (featured) {
    const hero = featured.items.find(i => i.id === (heroId ?? featured.hero_id));
    if (hero) add(hero, featured, 'vault');
    featured.items.forEach(i => add(i, featured, 'vault'));
  }
  sections.filter(s => s.type === 'event').forEach(s => s.items.forEach(i => add(i, s, 'season')));
  sections.filter(s => s.type === 'daily').forEach(s => s.items.forEach(i => add(i, s, 'tonight')));
  return out;
}

/** "New on Monday" for the Vault (it flips Monday), "New tonight" for Tonight's Pick, "Ends Nov 1" for a season. */
export function shelfWhen(entry: Pick<ShowroomEntry, 'kind' | 'section'>, now: number): string {
  if (entry.kind === 'vault') {
    const p = featuredPill(entry.section, now).label;
    return p === 'New tonight' ? 'New tomorrow' : p;
  }
  if (entry.kind === 'tonight') return dailyPill(entry.section, now).label === 'New stuff now' ? 'New now' : 'New tonight';
  return eventEndPill(entry.section, now).label;
}

