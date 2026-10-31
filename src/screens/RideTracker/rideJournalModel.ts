import type { RideType } from '../../api/endpoints/rides';

/**
 * The park catalog also lists places to eat and drink (bars, taverns, snack
 * stands, all typed 'restaurant'). The ride journal is for rides and shows,
 * so those never appear in the pick list.
 */
export function journalRides(rides: readonly RideType[]): RideType[] {
  return rides.filter(ride => ride.type !== 'restaurant');
}

export type RideLogErrorView = {
  readonly title: string;
  readonly message: string;
  /**
   * 'pick-ride' sends the kid back to the ride list; 'edit' keeps the memory
   * open to fix; 'plain' offers "Save just the ride" or "Try later", so a no
   * the app cannot explain is never a dead end.
   */
  readonly action: 'pick-ride' | 'edit' | 'plain';
};

/**
 * Kid words for a ride the server read and said no to. Server text is never
 * shown: Laravel says things like "The selected ride id is invalid.", which a
 * 7-year-old cannot act on. Each answer says what to do next.
 */
export function rideLogError(error: unknown): RideLogErrorView {
  const response = (error as { response?: { status?: unknown; data?: { errors?: unknown } } } | null)?.response;
  const status = Number(response?.status);
  const errors = response?.data?.errors && typeof response.data.errors === 'object'
    ? response.data.errors as Record<string, unknown> : {};
  const field = (name: string) => Object.prototype.hasOwnProperty.call(errors, name);
  if (status === 404 || field('ride_id')) {
    return { title: 'Ride not found', message: "We can't find that ride right now. Pick it again.", action: 'pick-ride' };
  }
  if (field('note')) return { title: 'Note too long', message: 'Make your note a little shorter, then save.', action: 'edit' };
  if (field('wait_time_minutes')) return { title: 'Check the wait', message: 'Type the wait in minutes, like 30. Or leave it blank.', action: 'edit' };
  if (field('rating') || field('reaction')) return { title: 'Pick again', message: 'Tap your stars and your face again, then save.', action: 'edit' };
  return { title: 'Ride not saved', message: 'Save just the ride now. Or tap Try later to keep your stars and note for later.', action: 'plain' };
}

/**
 * The journal's step label. A journal opened on its ride (the ride step or a
 * confirmed detection) starts at the memory, so it never says "3 of 3" when
 * steps 1 and 2 never showed.
 */
export function journalStepLabel(step: 'park' | 'ride' | 'details', openedOnRide: boolean): string {
  if (openedOnRide) return 'RIDE JOURNAL';
  return `RIDE JOURNAL · ${step === 'park' ? 1 : step === 'ride' ? 2 : 3} OF 3`;
}
