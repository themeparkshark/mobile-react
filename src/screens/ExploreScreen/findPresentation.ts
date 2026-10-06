import { formatFindDistance } from './homeFindCopy';
import { colors } from '../../design-system';

/**
 * Home Hunt v3: how a find looks on the home map and how a catch plays out.
 * Pure, so the marker, the catch moment and the nudge chip agree, and tests
 * can pin the rules without a renderer.
 */

/**
 * Rarity colours: the app-wide palette (design-system `colors.rarity`), the same as the dex, stamps and
 * wearables: Common green, Uncommon blue, Rare purple, Epic orange, Legendary gold. Every rarity also has
 * a shape mark (pips, gem, crown), so colour is never the only cue.
 */
export const RARITY_COLORS: Readonly<Record<number, string>> = {
  1: colors.rarity.common.main, 2: colors.rarity.uncommon.main, 3: colors.rarity.rare.main,
  4: colors.rarity.epic.main, 5: colors.rarity.legendary.main,
};
export const RARITY_LABELS: Readonly<Record<number, string>> = {
  1: 'Common', 2: 'Uncommon', 3: 'Rare', 4: 'Epic', 5: 'Legendary',
};

/** Clamp a server rarity (1 to 5, or missing) to a known tier. */
export function rarityTier(rarity: number | null | undefined): 1 | 2 | 3 | 4 | 5 {
  const tier = Math.round(Number(rarity));
  return (Number.isFinite(tier) ? Math.max(1, Math.min(5, tier)) : 1) as 1 | 2 | 3 | 4 | 5;
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
/** A server colour only when it is a plain hex string; otherwise the fallback. */
export function safeColor(value: string | null | undefined, fallback: string): string {
  return typeof value === 'string' && HEX.test(value.trim()) ? value.trim() : fallback;
}

/** The app owns the rarity palette (CONTRACT.md: the server's rarity_color is only a hint). */
export function rarityColor(rarity: number | null | undefined): string {
  return RARITY_COLORS[rarityTier(rarity)];
}

export function rarityLabel(rarity: number | null | undefined, serverLabel?: string | null): string {
  return typeof serverLabel === 'string' && serverLabel.trim() ? serverLabel.trim() : RARITY_LABELS[rarityTier(rarity)];
}

/**
 * What a find marker draws. Common finds are just the item; uncommon gets a
 * soft ground glow; rare and up add an aura and twinkling sparkles; a
 * legendary also turns slow light rays. In range, everything is bigger and
 * brighter and the item hops; out of range it sits smaller and dimmer.
 */
export interface FindLook {
  readonly scale: number;
  readonly opacity: number;
  readonly hop: boolean;
  readonly groundGlow: boolean;
  readonly aura: boolean;
  readonly sparkles: number;
  readonly rays: boolean;
}

export function findLook(rarity: number | null | undefined, inRange: boolean): FindLook {
  const tier = rarityTier(rarity);
  return {
    scale: inRange ? 1 : 0.6,
    opacity: inRange ? 1 : 0.55,
    hop: inRange,
    groundGlow: tier >= 2 || inRange,
    aura: tier >= 3,
    sparkles: tier >= 5 ? 4 : tier === 4 ? 3 : tier === 3 ? 2 : 0,
    rays: tier >= 5,
  };
}

/**
 * "70 m away · Golden Crisp Churro": the distance first, so a long name is what truncates (the line is one
 * line, cut at the tail). "Walk closer · name" while the distance is unknown.
 */
export function peekLine(name: string | null | undefined, distance: number | null): string {
  const far = distance != null && Number.isFinite(distance) ? formatFindDistance(distance) : '';
  return [far ? `${far} away` : 'Walk closer', name?.trim() || null].filter(Boolean).join(' · ');
}

/** "Walk closer · 65 m", or just "Walk closer" while the distance is unknown. */
export function walkCloserLine(distanceMeters: number | null | undefined): string {
  const distance = distanceMeters != null && Number.isFinite(distanceMeters) ? formatFindDistance(distanceMeters) : '';
  return distance ? `Walk closer · ${distance}` : 'Walk closer';
}

/**
 * The nudge arrow's angle in degrees, clockwise from screen-up, from the shark
 * to the find in screen points. Screen space already includes the map's
 * rotation, so the arrow points where the guest should walk on screen.
 */
export function screenBearing(from: { x: number; y: number } | null, to: { x: number; y: number } | null): number | null {
  if (!from || !to) return null;
  const dx = to.x - from.x, dy = to.y - from.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 1) return null;
  const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return Math.round((angle + 360) % 360);
}

/** Catch moment timeline (ms). The whole beat stays inside 2 to 4 seconds. */
export const CATCH_TIMING = {
  pop: 220,
  /** The server confirms within this window in the common case; the item wobbles while it waits. */
  minHover: 260,
  fly: 520,
  reveal: 380,
  hold: 1300,
  exit: 260,
} as const;

export function catchDurationMs(timing: typeof CATCH_TIMING = CATCH_TIMING): number {
  return timing.pop + timing.minHover + timing.fly + timing.reveal + timing.hold + timing.exit;
}

/** Sparks in the pop burst: more for rarer finds, capped for battery. */
export function burstSparkCount(rarity: number | null | undefined): number {
  return [0, 8, 9, 10, 12, 14][rarityTier(rarity)];
}

export interface CatchSummary {
  readonly isNew: boolean;
  readonly replayed: boolean;
  readonly setName: string | null;
  readonly setColor: string;
  readonly collected: number | null;
  readonly total: number | null;
  readonly complete: boolean;
  /** 0..1 before and after this catch, for the progress tick. */
  readonly progressFrom: number;
  readonly progressTo: number;
  readonly rarityColor: string;
  readonly rarityLabel: string;
}

/** Fallback set colour when the server sends none (the house gold). */
export const DEFAULT_SET_COLOR = '#FFB020';

/**
 * Everything the catch moment says, from the redeem response with the find as
 * a fallback. Every v3 field is optional: `dex` (distinct found of total) wins
 * over the older `set_progress`. The app owns the rarity palette.
 */
export function catchSummary(item: {
  readonly rarity?: number | null; readonly rarity_label?: string | null;
  readonly set_name?: string | null; readonly set_color?: string | null; readonly is_new_variant?: boolean;
}, data: {
  readonly is_new_variant?: boolean; readonly replayed?: boolean;
  readonly set_progress?: { readonly total?: number; readonly collected?: number; readonly is_complete?: boolean } | null;
  readonly dex?: { readonly found?: number; readonly total?: number; readonly reward_status?: string | null } | null;
  readonly item?: { readonly rarity?: number; readonly rarity_label?: string | null;
    readonly set_name?: string | null; readonly set_color?: string | null } | null;
} | null | undefined): CatchSummary {
  const dex = data?.dex && Number.isFinite(data.dex.total) && (data.dex.total ?? 0) > 0 ? data.dex : null;
  const progress = data?.set_progress ?? null;
  const rawTotal = dex ? dex.total : progress?.total;
  const rawCollected = dex ? dex.found : progress?.collected;
  const total = rawTotal != null && Number.isFinite(rawTotal) && rawTotal > 0 ? rawTotal : null;
  const collected = total != null && rawCollected != null && Number.isFinite(rawCollected)
    ? Math.max(0, Math.min(rawCollected, total)) : null;
  const isNew = data?.is_new_variant ?? item.is_new_variant ?? false;
  const replayed = data?.replayed === true;
  const after = total != null && collected != null ? collected / total : 0;
  const before = total != null && collected != null && isNew && !replayed ? Math.max(0, collected - 1) / total : after;
  const rarity = data?.item?.rarity ?? item.rarity;
  const complete = progress?.is_complete === true || (total != null && collected === total);
  return {
    isNew: isNew && !replayed,
    replayed,
    setName: (data?.item?.set_name ?? item.set_name)?.trim() || null,
    setColor: safeColor(data?.item?.set_color ?? item.set_color, DEFAULT_SET_COLOR),
    collected, total,
    complete,
    progressFrom: before, progressTo: after,
    rarityColor: rarityColor(rarity),
    rarityLabel: rarityLabel(rarity, data?.item?.rarity_label ?? item.rarity_label),
  };
}

/** "Snack Stand 4/12", "Set complete!", or just the set name. */
export function catchProgressLine(summary: Pick<CatchSummary, 'setName' | 'collected' | 'total' | 'complete'>): string | null {
  if (summary.complete) return summary.setName ? `${summary.setName} complete!` : 'Set complete!';
  if (summary.collected != null && summary.total != null) {
    return `${summary.setName ?? 'Set'} ${summary.collected}/${summary.total}`;
  }
  return summary.setName;
}

/** The catch moment's error line: the server's words when it sends them, plain words otherwise. */
export function catchErrorLine(status: number | null, serverError: string | null | undefined): string {
  if (status === 410) return 'It wandered off. More finds are on the way!';
  if (typeof serverError === 'string' && serverError.trim()) return serverError.trim();
  return 'Could not catch it. Tap to try again.';
}

/** Image order for a find: server art first (v3 catalog), then bundled art by slug, then the old churro map. */
export function findImageOrder<T>(iconUrl: string | null | undefined, bySlug: T | null, byName: T | null): T | { uri: string } | null {
  if (typeof iconUrl === 'string' && /^https?:\/\//i.test(iconUrl)) return { uri: iconUrl };
  return bySlug ?? byName ?? (typeof iconUrl === 'string' && iconUrl ? { uri: iconUrl } : null);
}

export interface MapStatusLine {
  readonly text: string;
  readonly tone: 'info' | 'error';
  readonly action: 'retry' | 'collections' | 'standings' | null;
}

/** The home map's state as one short line (a chip, never a card), or null while finds are up. */
export function mapStatusLine({ homeLocationConfirmed, isLoading, empty, loadError, rankLine = null }: {
  homeLocationConfirmed: boolean; isLoading: boolean; empty: boolean; loadError: boolean; rankLine?: string | null;
}): MapStatusLine | null {
  if (!homeLocationConfirmed) return { text: 'Checking your map...', tone: 'info', action: null };
  if (isLoading) return { text: 'Scouting for finds...', tone: 'info', action: null };
  if (empty && loadError) return { text: 'Map didn’t load · tap to try again', tone: 'error', action: 'retry' };
  // A quiet map still shows this week's standing when there is one (tap opens the board).
  if (empty) return rankLine ? { text: `All quiet · ${rankLine}`, tone: 'info', action: 'standings' }
    : { text: 'All quiet · tap for your collection', tone: 'info', action: 'collections' };
  if (loadError) return { text: 'Saved map · tap to refresh', tone: 'info', action: 'retry' };
  return null;
}
