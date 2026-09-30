/**
 * rides.type values that have a real queue to play in. This is the same list the
 * server uses to decide which rides can host an Adventure Ticket
 * (backend config/adventure.php ADVENTURE_TICKET_RIDE_TYPES default), so a dwell
 * "Play" suggestion never lands on a ride the adventure would refuse.
 *
 * The live catalog stores rides as 'attraction', 'show' or 'restaurant'; the
 * finer coaster / dark_ride / flat_ride / water_ride values come from the
 * catalog migration and are accepted when present. 'show', 'walk_through',
 * 'transport' and 'other' (anything the catalog could not classify, such as
 * meet-and-greets and play areas) have no line to play in.
 * Keep in sync with tests/Unit/AdventureRideTypesTest.php in the backend.
 */
export const QUEUE_RIDE_TYPES = ['attraction', 'coaster', 'dark_ride', 'flat_ride', 'water_ride'] as const;
