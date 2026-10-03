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
 * While a night mode leads, closed rides recede (smaller, dimmed); open ones stay.
 */
import type { EdgeInset, LayoutItem, Rect } from '../../components/map/declutter/solver';
import { markerBadge } from './mapMarkerPresentation';

/* ── Footprints (points around each marker's geo anchor) ──────────────── */

/** TaskMarker: 72x96 box anchored at (0.5, 0.9). Art plus the floating coin's headroom. */
export const RIDE_BOX = { width: 72, height: 96, anchor: { x: 36, y: 86.4 } } as const;
export const RIDE_BODY: Rect = { x: -28, y: -70, w: 56, h: 70 };
/** Coin, key and redeemable finds: a square box anchored at its centre. */
export const FIND_BOX = { width: 80, height: 80, anchor: { x: 40, y: 40 } } as const;
/** The find's root view: the art centred on the anchor, the timer chip placed around it. */
export const FIND_ROOT = { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' } as const;
export const COIN_BODY: Rect = { x: -19, y: -19, w: 38, h: 38 };
export const REDEEMABLE_BODY: Rect = { x: -29, y: -29, w: 58, h: 58 };
export const FIND_TAG = { w: 72, h: 30 } as const;
export const ITEM_BODY: Rect = { x: -30, y: -30, w: 60, h: 60 };
export const VAULT_BODY: Rect = { x: -32, y: -32, w: 64, h: 64 };
/** Haunt lantern: 96x114 box anchored at (0.5, 0.82). */
export const HAUNT_BOX = { width: 96, height: 114, anchor: { x: 48, y: 93.5 } } as const;
export const HAUNT_BODY: Rect = { x: -36, y: -86, w: 72, h: 80 };
/** Reef critters wander and stand on cloud tufts: the whole patch, not one critter. */
export const REEF_BODY: Rect = { x: -64, y: -60, w: 128, h: 120 };
export const GYM_BODY: Rect = { x: -45, y: -80, w: 90, h: 100 };
export const COMMUNITY_BODY: Rect = { x: -40, y: -50, w: 80, h: 96 };
export const SWORD_BODY: Rect = { x: -26, y: -66, w: 52, h: 60 };
export const BOSS_BODY: Rect = { x: -42, y: -100, w: 84, h: 106 };

export const RIDE_RECEDE = 0.68;
export const HAUNT_RECEDE = 0.76;

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
export function rideTagFor({ selected, rush, adventure, goal, owned, limitedText, expiresAt, near, now }: {
  readonly selected: boolean; readonly rush: boolean; readonly adventure: boolean; readonly goal: boolean;
  readonly owned: boolean; readonly limitedText: string | null; readonly expiresAt: number | null;
  readonly near: boolean; readonly now: number;
}): { w: number; h: number } | null {
  if (selected) return SELECTED_TAG;
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
  /** Rides folded under this island by the zoom pre-fold (+N). */
  readonly members: number;
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
  readonly kind: 'gym' | 'community' | 'sword' | 'boss';
}

export interface ParkLayoutInput {
  readonly rides: readonly RideLayoutInput[];
  readonly finds?: readonly FindLayoutInput[];
  readonly haunts?: readonly HauntLayoutInput[];
  readonly reefs?: readonly { readonly key: string; readonly latitude: number; readonly longitude: number }[];
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

export function buildParkLayout(input: ParkLayoutInput): LayoutItem[] {
  const items: LayoutItem[] = [];
  const { nightMode } = input;
  for (const ride of input.rides) {
    const key = ride.adventure || ride.playable || ride.goal || ride.rush;
    items.push({
      id: rideLayoutId(ride.id), latitude: ride.latitude, longitude: ride.longitude,
      priority: ridePriority(ride, nightMode), body: RIDE_BODY, group: 'ride', weight: ride.members + 1,
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
      body: HAUNT_BODY, group: 'haunt', recedeScale: HAUNT_RECEDE,
      forceRecede: haunt.closed ? true : undefined,
    });
  }
  for (const reef of input.reefs ?? []) {
    items.push({ id: reefLayoutId(reef.key), latitude: reef.latitude, longitude: reef.longitude,
      priority: PRIORITY.reef, body: REEF_BODY, minZoom: REEF_MIN_ZOOM });
  }
  for (const fixed of input.fixed ?? []) {
    items.push({
      id: fixed.id, latitude: fixed.latitude, longitude: fixed.longitude, priority: PRIORITY.fixed, fixed: true,
      body: fixed.kind === 'gym' ? GYM_BODY : fixed.kind === 'community' ? COMMUNITY_BODY : fixed.kind === 'boss' ? BOSS_BODY : SWORD_BODY,
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
  const insets: EdgeInset[] = [{ left: 0, top: 0, width: FULL, height: hudBottom }];
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
