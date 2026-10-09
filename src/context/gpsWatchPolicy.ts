/**
 * How hard the foreground GPS watcher works. Pure rules, unit tested.
 *
 * The phone is in a hot park all day, often also navigating, so the watcher
 * only pays for precision where gameplay reads it:
 *  - `map`: a game map is on screen (coins at 16 m, the shark glide, home
 *    pickups at 50 m) or LinePlay is tracking a queue (advances need fixes
 *    under 20 m). Full precision, a fix every 3 m.
 *  - `park`: in a park (or not yet known to be outside one) on another screen
 *    (news, profile, a store). Ride detection still reads this stream, so the
 *    precision stays; fixes every 10 m (what background ride detection uses)
 *    cut the JS wakeups and app-wide updates by about 3x while walking.
 *  - `away`: verified outside every park and no map on screen. Nothing in the
 *    game reads the position precisely here, so the watcher drops to
 *    neighbourhood accuracy (mostly Wi-Fi and cell, far less GPS radio time).
 *    Walking into a park still checks in from these fixes, and returning to a
 *    map restores full precision at once.
 *
 * iOS ignores `timeInterval`; Android uses it as the sampling period.
 */

export type GpsWatchTier = 'map' | 'park' | 'away' | 'off';

export interface GpsWatchInputs {
  /** A map screen holds the compass claim (it is focused). */
  readonly mapOnScreen: boolean;
  /** LinePlay is tracking a queue session. */
  readonly queueTracking: boolean;
  /** A park is the current park presence. */
  readonly inPark: boolean;
  /** The last park lookup answered "outside" (a verified non-park position). */
  readonly confirmedOutside: boolean;
  /**
   * The app is in the foreground. Default true. In the background the
   * foreground watcher stops: ride detection and LinePlay run their own
   * background tasks, and the watcher restarts on return (watchEpoch).
   * Before this, a map left open kept 3 m High fixes running in a pocket.
   */
  readonly appActive?: boolean;
  /**
   * Power budget says rest (standing still for a while, or Battery Saver on).
   * A map that is not tracking a queue takes 6 m steps instead of 3 m: fewer
   * JS wakeups and map re-renders while you stand, same accuracy, and the
   * first real step still moves the shark.
   */
  readonly rest?: boolean;
}

export interface GpsWatchSettings {
  readonly tier: GpsWatchTier;
  readonly accuracy: 'high' | 'balanced';
  /** Metres between fixes (iOS distanceFilter). */
  readonly distanceInterval: number;
  /** Android sampling period in ms. */
  readonly timeInterval: number;
}

/** Map step while resting (standing still or Battery Saver), metres. */
export const MAP_REST_DISTANCE_M = 6;

export const GPS_WATCH: Readonly<Record<Exclude<GpsWatchTier, 'off'>, Omit<GpsWatchSettings, 'tier'>>> = {
  map: { accuracy: 'high', distanceInterval: 3, timeInterval: 500 },
  park: { accuracy: 'high', distanceInterval: 10, timeInterval: 2000 },
  away: { accuracy: 'balanced', distanceInterval: 50, timeInterval: 10_000 },
};

/** Queue play keeps map precision but samples less often on Android (the line moves slowly). */
export const QUEUE_ANDROID_TIME_INTERVAL_MS = 3000;

export function gpsWatchTier(input: GpsWatchInputs): GpsWatchTier {
  if (input.appActive === false) return 'off';
  if (input.mapOnScreen || input.queueTracking) return 'map';
  if (input.inPark || !input.confirmedOutside) return 'park';
  return 'away';
}

export function gpsWatchSettings(input: GpsWatchInputs): GpsWatchSettings {
  const tier = gpsWatchTier(input);
  if (tier === 'off') return { tier, ...GPS_WATCH.away, distanceInterval: 0, timeInterval: 0 };
  const base = GPS_WATCH[tier];
  const timeInterval = input.queueTracking ? QUEUE_ANDROID_TIME_INTERVAL_MS : base.timeInterval;
  const distanceInterval = tier === 'map' && input.rest && !input.queueTracking
    ? Math.max(base.distanceInterval, MAP_REST_DISTANCE_M) : base.distanceInterval;
  return { tier, ...base, distanceInterval, timeInterval };
}
