import type { LocationType } from '../models/location-type';
import type { TaskType } from '../models/task-type';

export interface RideSuggestion {
  readonly task: TaskType;
  readonly distanceMeters: number;
}

const MAX_SUGGESTION_DISTANCE_METERS = 5_000;

function distanceMeters(a: LocationType, b: LocationType): number {
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(b.latitude - a.latitude);
  const longitudeDelta = toRadians(b.longitude - a.longitude);
  const arc = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(toRadians(a.latitude)) *
    Math.cos(toRadians(b.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

/** Approximate ride-area suggestion, never a walking route or a saved goal. */
export function nearbyUncollectedRide(
  rides: readonly TaskType[],
  completed: readonly TaskType[],
  location: LocationType | undefined,
  eligible: (task: TaskType) => boolean = () => true,
): RideSuggestion | null {
  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude) ||
    Math.abs(location.latitude) > 90 || Math.abs(location.longitude) > 180) return null;
  const ownedIds = new Set(completed.map(task => task.id));
  let nearest: RideSuggestion | null = null;
  for (const task of rides) {
    if (ownedIds.has(task.id) || !eligible(task)) continue;
    const latitude = Number(task.latitude);
    const longitude = Number(task.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180 ||
      !task.latitude?.trim() || !task.longitude?.trim()) continue;
    const candidate = { task, distanceMeters: distanceMeters(location, { latitude, longitude }) };
    if (candidate.distanceMeters > MAX_SUGGESTION_DISTANCE_METERS) continue;
    if (!nearest || candidate.distanceMeters < nearest.distanceMeters ||
      (candidate.distanceMeters === nearest.distanceMeters && task.name.localeCompare(nearest.task.name) < 0)) {
      nearest = candidate;
    }
  }
  return nearest;
}
