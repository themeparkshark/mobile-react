/**
 * The in-park map's declutter inputs: every marker's footprint, priority and
 * rules for the solver (src/components/map/declutter/solver.ts), and the HUD
 * insets no marker draws under. Pure, unit tested (map-declutter-layout).
 *
 * Priority, highest first (Pokemon GO / Apple Maps style: what you are doing
 * now beats what is merely there):
 *   selected ride (pinned) > boss, gym, community center (fixed art)
 *   > the player's picks: adventure, playable, goal, Rush rides
 *   > open haunts while Fin-ister Nights leads > timed finds (coins, keys)
 *   > open rides > items, pins, vaults > closed haunts > closed rides > reef critters.
 * While a night mode leads, closed rides recede (smaller; their art already
 * reads closed: dimmed with sleepy z's). Open rides stay full size and colour.
 *
 * Footprints are the drawn art with its glow (measured from each component's
 * layout), so settled art never overlaps: the solver allows near-zero overlap.
 */
import type { EdgeInset, LayoutItem, Rect } from '../../components/map/declutter/solver';
import { markerBadge } from './mapMarkerPresentation';

/* ── Footprints (points around each marker's geo anchor) ──────────────── */

/** TaskMarker: 72x96 box anchored at (0.5, 0.9). */
export const RIDE_BOX = { width: 72, height: 96, anchor: { x: 36, y: 86.4 } } as const;
/** The landmark (64), its ground ring and the floating coin's headroom: 72 x 88. */
export const RIDE_BODY: Rect = { x: -36, y: -84, w: 72, h: 88 };
/** Coin, key and redeemable finds: a square box anchored at its centre. */
export const FIND_BOX = { width: 80, height: 80, anchor: { x: 40, y: 40 } } as const;
/** The find's root view: the art centred on the anchor, the timer chip placed around it. */
export const FIND_ROOT = { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' } as const;
/** Coin or key with its glow ring and bob: 48 x 48. */
export const COIN_BODY: Rect = { x: -24, y: -24, w: 48, h: 48 };
/** Redeemable (50) with its 8 pt glow: 66 x 66. */
export const REDEEMABLE_BODY: Rect = { x: -33, y: -33, w: 66, h: 66 };
export const FIND_TAG = { w: 72, h: 30 } as const;
export const ITEM_BODY: Rect = { x: -35, y: -35, w: 70, h: 70 };
export const VAULT_BODY: Rect = { x: -36, y: -36, w: 72, h: 72 };
/** Haunt lantern (FrightSprites: a 168 x 136 box, ground point at 84, 82): the 96 x 100 facade canvas with its glow. */
export const HAUNT_ANCHOR_PT = { x: 84, y: 82 } as const;
export const HAUNT_BODY: Rect = { x: -48, y: -82, w: 96, h: 100 };
/** The haunt's name chip under the facade (shown from zoom 16, up to the lantern box's 168 pt): an obstacle for everything after it. */
export const HAUNT_CHIP: Rect = { x: -84, y: 18, w: 168, h: 26 };
/** Reef critters (FrightSprites ReefCritters): wander = clamp(radius m x pts/m x 0.8, 18, 110), a 2w+90 by 1.4w+120 canvas; the mist and critters fill most of it. */
export function reefBody(radiusMeters: number, latitude: number) {
  return (zoom: number): Rect => {
    const wander = Math.max(18, Math.min(110, radiusMeters * pointsPerMeter(zoom, latitude) * 0.8));
    const w = (wander * 2 + 90) * 0.96;
    const h = (wander * 1.4 + 120) * 0.8;
    return { x: -w / 2, y: -h / 2 + 8, w, h };
  };
}
/** The Fin-ister encounter critter and its ring (EncounterSprite: max(2 x ring + 60, 120), ring = clamp(radius x pts/m, 30, 120)). */
export function encounterBody(radiusMeters: number, latitude: number) {
  return (zoom: number): Rect => {
    const ring = Math.max(30, Math.min(120, radiusMeters * pointsPerMeter(zoom, latitude)));
    const size = Math.max(ring * 2 + 60, 120);
    return { x: -size / 2, y: -size / 2, w: size, h: size };
  };
}

/** Map points per metre at a zoom and latitude (MapLibre: 512-point world tiles). */
export function pointsPerMeter(zoom: number, latitude: number): number {
  const metersPerPoint = 40075016.686 * Math.cos(latitude * Math.PI / 180) / (512 * 2 ** zoom);
  return metersPerPoint > 0 ? 1 / metersPerPoint : 0;
}
export const GYM_BODY: Rect = { x: -45, y: -80, w: 90, h: 100 };
export const COMMUNITY_BODY: Rect = { x: -40, y: -50, w: 80, h: 96 };
export const SWORD_BODY: Rect = { x: -26, y: -66, w: 52, h: 60 };
export const BOSS_BODY: Rect = { x: -42, y: -100, w: 84, h: 106 };

export const RIDE_RECEDE = 0.68;
export const HAUNT_RECEDE = 0.76;
/** Haunt name chips show from this zoom (frightBudget HAUNT_CHIP_ZOOM). */
export const HAUNT_CHIP_ZOOM = 16;

/** Chips hide below this zoom (the map reads as places, not numbers). */
export const TAG_MIN_ZOOM = 16.4;
export const FIND_MIN_ZOOM = 15.6;
export const REEF_MIN_ZOOM = 16.4;

export const PRIORITY = {
  adventure: 660, playable: 640, goal: 620, rush: 600,
  hauntOpen: 520, find: 460, ride: 300, rideNear: 330, item: 220,
  hauntClosed: 200, rideClosed: 150, reef: 90,
  fixed: 1000,
} as const;

/* ── Ride chips ───────────────────────────────────────────────────────── */

export type RideTagKind = 'rush' | 'adventure' | 'goal' | 'limited' | 'timer';

/** Size of the one chip a ride island shows above its art (badge, else the timer). */
export function rideTagSize(kind: RideTagKind | null, text = ''): { w: number; h: number } | null {
  switch (kind) {
    case 'rush': return { w: 108, h: 22 };
    case 'adventure': return { w: 92, h: 22 };
    case 'goal': return { w: 66, h: 22 };
    case 'limited': return { w: Math.min(190, 36 + text.length * 6), h: 22 };
    case 'timer': return { w: 56, h: 22 };
    default: return null;
  }
}

/** Which chip a ride shows (badge first; the timer only when no badge takes the slot). */
export function rideTagKind({ badge, showTimer }: { badge: string | null; showTimer: boolean }): RideTagKind | null {
  if (badge === 'rush' || badge === 'adventure' || badge === 'goal' || badge === 'limited') return badge;
  return showTimer ? 'timer' : null;
}

/** The selected ride's info card (TaskMarker tooltip), as a tag the others keep clear of. */
export const SELECTED_TAG = { w: 200, h: 100 } as const;
export const URGENT_MS = 5 * 60_000;

/** A ride's chip for the solver, by the same rules TaskMarker draws with. */
export function rideTagFor({ selected, rush, adventure, goal, owned, limitedText, expiresAt, near, now, closed = false }: {
  readonly selected: boolean; readonly rush: boolean; readonly adventure: boolean; readonly goal: boolean;
  /** Closed, down or resting: no timer. */
  readonly closed?: boolean;
  readonly owned: boolean; readonly limitedText: string | null; readonly expiresAt: number | null;
  readonly near: boolean; readonly now: number;
}): { w: number; h: number } | null {
  if (selected) return SELECTED_TAG;
  // A closed ride never hurries the player: no countdown on it.
  if (closed) {
    const badge = markerBadge({ rush: false, adventure, goal, owned, limited: !!limitedText });
    return rideTagSize(rideTagKind({ badge, showTimer: false }), (limitedText ?? '').toUpperCase());
  }
  const badge = markerBadge({ rush, adventure, goal, owned, limited: !!limitedText });
  const timed = expiresAt !== null && expiresAt > now;
  const showTimer = timed && !rush && (near || expiresAt! - now < URGENT_MS);
  return rideTagSize(rideTagKind({ badge, showTimer }), (limitedText ?? '').toUpperCase());
}

/* ── Builders ─────────────────────────────────────────────────────────── */

export interface RideLayoutInput {
  readonly id: number;
  readonly latitude: number;
  readonly longitude: number;
  /** Rides this island already stands for (default 0). */
  readonly members?: number;
  readonly selected: boolean;
  readonly adventure: boolean;
  readonly playable: boolean;
  readonly goal: boolean;
  readonly rush: boolean;
  readonly near: boolean;
  /** Closed, down, refurbishment or resting until later. */
  readonly closed: boolean;
  readonly tag: { readonly w: number; readonly h: number } | null;
}

export interface FindLayoutInput {
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly kind: 'coin' | 'key' | 'redeemable' | 'item' | 'pin' | 'vault';
}

export interface HauntLayoutInput {
  readonly key: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly closed: boolean;
}

export interface FixedLayoutInput {
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly kind: 'gym' | 'community' | 'sword' | 'boss' | 'encounter';
  /** The encounter's ring radius (metres). */
  readonly radius?: number;
}

export interface ParkLayoutInput {
  readonly rides: readonly RideLayoutInput[];
  readonly finds?: readonly FindLayoutInput[];
  readonly haunts?: readonly HauntLayoutInput[];
  readonly reefs?: readonly { readonly key: string; readonly latitude: number; readonly longitude: number; readonly radius: number }[];
  readonly fixed?: readonly FixedLayoutInput[];
  /** Fin-ister Nights (or any night mode) leads the map: haunts primary, closed rides recede. */
  readonly nightMode: boolean;
}

export function rideLayoutId(id: number): string { return `ride:${id}`; }
export function hauntLayoutId(key: string): string { return `haunt:${key}`; }
export function reefLayoutId(key: string): string { return `reef:${key}`; }

export function ridePriority(ride: RideLayoutInput, nightMode: boolean): number {
  if (ride.adventure) return PRIORITY.adventure;
  if (ride.playable) return PRIORITY.playable;
  if (ride.goal) return PRIORITY.goal;
  if (ride.rush) return PRIORITY.rush;
  if (ride.closed) return nightMode ? PRIORITY.rideClosed : PRIORITY.ride - 20;
  return ride.near ? PRIORITY.rideNear : PRIORITY.ride;
}

/** Metres between two points (equirectangular; fine at park scale). */
function metersBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const dy = (a.latitude - b.latitude) * 111_320;
  const dx = (a.longitude - b.longitude) * 111_320 * Math.cos(((a.latitude + b.latitude) / 2) * Math.PI / 180);
  return Math.hypot(dx, dy);
}

export function buildParkLayout(input: ParkLayoutInput): LayoutItem[] {
  const items: LayoutItem[] = [];
  const { nightMode } = input;
  for (const ride of input.rides) {
    const key = ride.adventure || ride.playable || ride.goal || ride.rush;
    items.push({
      id: rideLayoutId(ride.id), latitude: ride.latitude, longitude: ride.longitude,
      priority: ridePriority(ride, nightMode), body: RIDE_BODY, group: 'ride', weight: (ride.members ?? 0) + 1,
      pinned: ride.selected || undefined,
      recedeScale: RIDE_RECEDE,
      forceRecede: nightMode && ride.closed && !key && !ride.selected ? true : undefined,
      ...(ride.tag ? { tag: { ...ride.tag, minZoom: key ? undefined : TAG_MIN_ZOOM } } : {}),
    });
  }
  for (const find of input.finds ?? []) {
    const timed = find.kind === 'coin' || find.kind === 'key' || find.kind === 'redeemable';
    items.push({
      id: find.id, latitude: find.latitude, longitude: find.longitude,
      priority: timed ? PRIORITY.find : PRIORITY.item,
      body: find.kind === 'redeemable' ? REDEEMABLE_BODY : find.kind === 'vault' ? VAULT_BODY : timed ? COIN_BODY : ITEM_BODY,
      group: timed ? undefined : 'item',
      minZoom: FIND_MIN_ZOOM,
      ...(timed ? { tag: { ...FIND_TAG, minZoom: TAG_MIN_ZOOM } } : {}),
    });
  }
  for (const haunt of input.haunts ?? []) {
    items.push({
      id: hauntLayoutId(haunt.key), latitude: haunt.latitude, longitude: haunt.longitude,
      priority: haunt.closed ? PRIORITY.hauntClosed : nightMode ? PRIORITY.hauntOpen : PRIORITY.ride + 10,
      body: HAUNT_BODY, extras: [HAUNT_CHIP], group: 'haunt', recedeScale: HAUNT_RECEDE,
      forceRecede: haunt.closed ? true : undefined,
    });
  }
  // The Fin-ister encounter swims AT a reef: that reef's performers are its stage, drawn with it,
  // never hidden under it (the encounter is fixed art, so a plain reef there always lost).
  const encounters = (input.fixed ?? []).filter(item => item.kind === 'encounter');
  const hostsEncounter = (reef: { latitude: number; longitude: number; radius: number }) =>
    encounters.some(enc => metersBetween(enc, reef) <= reef.radius + 5);
  for (const reef of input.reefs ?? []) {
    const bodyFor = reefBody(reef.radius, reef.latitude);
    items.push({ id: reefLayoutId(reef.key), latitude: reef.latitude, longitude: reef.longitude,
      priority: PRIORITY.reef, body: bodyFor(17.6), bodyFor, minZoom: REEF_MIN_ZOOM,
      ...(hostsEncounter(reef) ? { fixed: true } : {}) });
  }
  for (const fixed of input.fixed ?? []) {
    items.push({
      id: fixed.id, latitude: fixed.latitude, longitude: fixed.longitude, priority: PRIORITY.fixed, fixed: true,
      ...(fixed.kind === 'encounter'
        ? (() => { const bodyFor = encounterBody(fixed.radius ?? 40, fixed.latitude); return { body: bodyFor(17.6), bodyFor }; })()
        : { body: fixed.kind === 'gym' ? GYM_BODY : fixed.kind === 'community' ? COMMUNITY_BODY : fixed.kind === 'boss' ? BOSS_BODY : SWORD_BODY }),
    });
  }
  return items;
}

/* ── HUD insets ───────────────────────────────────────────────────────── */

export const FULL = 9999;

/**
 * Where the HUD sits over the map view: the one status row (and whatever the
 * expanded stack shows), the suggestion chips under it, and the two bottom
 * button columns. The map's own button column is added by Map.
 */
export function parkMapInsets({ hudBottom, left, right, bottomLeft, bottomRight }: {
  /** Bottom edge of the status row, map-view points. */
  readonly hudBottom: number;
  /** Suggestion chip under the HUD on the left: stub (56pt) or full card. */
  readonly left: { readonly top: number; readonly stub: boolean } | null;
  readonly right: { readonly top: number; readonly stub: boolean } | null;
  /** Bottom-left button column height (help, queue times, stores). */
  readonly bottomLeft: number;
  /** Bottom-right column height (energy, swords, avatar). */
  readonly bottomRight: number;
}): EdgeInset[] {
  // The HUD row hides art that barely reaches under it (share 0.1): nothing peeks between the pills.
  const insets: EdgeInset[] = [{ left: 0, top: 0, width: FULL, height: hudBottom, share: 0.1 }];
  if (left) insets.push({ left: 0, top: left.top, width: left.stub ? 72 : 196, height: left.stub ? 60 : 112 });
  if (right) insets.push({ right: 0, top: right.top, width: right.stub ? 72 : 184, height: right.stub ? 60 : 100 });
  if (bottomLeft > 0) insets.push({ left: 0, bottom: 0, width: 104, height: bottomLeft });
  if (bottomRight > 0) insets.push({ right: 0, bottom: 0, width: 150, height: bottomRight });
  return insets;
}

/** Bottom-left column: 32 pt margin, help (54), queue times (80), one row per store (83). */
export function bottomLeftColumnHeight(stores: number): number {
  return 32 + 54 + 80 + Math.max(0, stores) * 83;
}
/** Bottom-right column: 32 pt margin, energy and swords pills (~88), the avatar (~96). */
export const BOTTOM_RIGHT_COLUMN = 32 + 88 + 96;
