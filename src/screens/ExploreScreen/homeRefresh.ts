export interface Coordinates {
  lat: number;
  lng: number;
}

function distanceMeters(a: Coordinates, b: Coordinates): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(b.lat - a.lat);
  const longitudeDelta = radians(b.lng - a.lng);
  const arc = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) *
    Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6371000 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

/** Allow movement to refresh after a short floor, and stationary play after a longer ceiling. */
export function shouldThrottleHomeRequest(
  current: Coordinates,
  lastLocation: Coordinates | null,
  lastTime: number,
  now: number,
  minDistanceMeters: number,
  minIntervalMs: number,
  maxIdleMs: number,
): boolean {
  const age = now - lastTime;
  if (age < minIntervalMs) return true;
  if (lastLocation && age < maxIdleMs && distanceMeters(lastLocation, current) < minDistanceMeters) {
    return true;
  }
  return false;
}
