import type { PrepItemType } from '../../models/prep-item-type';
import { HOME_PREP_PICKUP_RADIUS_METERS } from './homePickupRange';

export interface HomeHuntTarget {
  readonly item: PrepItemType;
  readonly distanceMeters: number;
  readonly kind?: 'new' | 'spare';
}

function metersBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const arc = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) *
    Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6371000 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

/**
 * Offer a quick pickup first, then a missing book slot within a reasonable
 * detour. A distant new variant should not hide a spare the player can collect
 * now for Ticket progress.
 */
export function nearestHomeHuntTarget(
  items: readonly PrepItemType[],
  location: { latitude: number; longitude: number } | null | undefined,
  now = Date.now(),
  selectedPivotId?: number | null,
): HomeHuntTarget | null {
  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return null;
  let closestNew: HomeHuntTarget | null = null;
  let closestSpare: HomeHuntTarget | null = null;
  for (const item of items) {
    if (typeof item.is_new_variant !== 'boolean' || !Number.isFinite(item.latitude) || !Number.isFinite(item.longitude) ||
        !item.pivot_id || (item.active_to && Date.parse(item.active_to) <= now)) continue;
    const distanceMeters = metersBetween(location, { latitude: item.latitude!, longitude: item.longitude! });
    const target = { item, distanceMeters, kind: item.is_new_variant ? 'new' : 'spare' } as const;
    if (item.pivot_id === selectedPivotId) return target;
    if (item.is_new_variant) {
      if (!closestNew || distanceMeters < closestNew.distanceMeters) closestNew = target;
    } else if (!closestSpare || distanceMeters < closestSpare.distanceMeters) {
      closestSpare = target;
    }
  }
  if (!closestNew) return closestSpare;
  if (!closestSpare) return closestNew;

  // A new slot in pickup range always wins. Otherwise a ready spare gives the
  // player a useful first action before the longer walk to that new variant.
  if (closestNew.distanceMeters <= HOME_PREP_PICKUP_RADIUS_METERS) return closestNew;
  if (closestSpare.distanceMeters <= HOME_PREP_PICKUP_RADIUS_METERS) return closestSpare;

  // New variants justify a modest detour, not a trip across the entire map.
  const worthwhileDetourMeters = Math.max(100, closestSpare.distanceMeters * 0.5);
  return closestNew.distanceMeters <= closestSpare.distanceMeters + worthwhileDetourMeters
    ? closestNew : closestSpare;
}

export function nearestNewVariant(items: readonly PrepItemType[], location: {
  latitude: number; longitude: number
} | null | undefined, now = Date.now()): HomeHuntTarget | null {
  const target = nearestHomeHuntTarget(items.filter(item => item.is_new_variant), location, now);
  return target?.kind === 'new' ? target : null;
}
