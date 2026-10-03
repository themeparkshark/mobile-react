/** Development-only screens that intentionally own their initial navigation. */
export function isStandalonePreviewMode(): boolean {
  return __DEV__ && (
    process.env.EXPO_PUBLIC_MAP_ALIVE_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_HOME_CATCH_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_BOSS_MECHANICS_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_BOSS_MAP_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_SHELF_ARRIVAL_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_LINEPLAY_FLOW_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_TRIVIA_GAME_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_QUEUE_TIMES_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_PARK_CHECKLIST_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_PARK_ARRIVAL_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_PARK_RESCUE_GOAL_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_PARK_DOWN_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_PARK_PASSPORT_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_PARK_PASSPORT_COMPLETE_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_RESCUE_PASS_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_STAMP_BOOK_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_STAMP_BOOK_LIVE === '1' ||
    process.env.EXPO_PUBLIC_QUEUE_STAMP_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_CREW_RELAY_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_CREW_GRID_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_SET_COLLECTION_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_PARK_PROJECT_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_TRIP_GOAL_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_PARK_DAY_RECAP_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_POST_WIN_REWARDS_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_POST_WIN_FIRST_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_COIN_LEVELING_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_COIN_SHELF_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_RIDE_TRACKER_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_RIDE_GAME_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_HOME_HUNT_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_HOME_SAVED_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_TUTORIAL_PREVIEW === '1' ||
    process.env.EXPO_PUBLIC_INVENTORY_PREVIEW === '1'
    || process.env.EXPO_PUBLIC_PROFILE_PREVIEW === '1'
    || process.env.EXPO_PUBLIC_RIDE_LOG_SUCCESS_PREVIEW === '1'
    || process.env.EXPO_PUBLIC_RIDE_LOG_PREVIEW === '1'
    || process.env.EXPO_PUBLIC_RIDE_BATCH_PREVIEW === '1'
    || process.env.EXPO_PUBLIC_RIDE_DETECTION_PREVIEW === '1'
  );
}
