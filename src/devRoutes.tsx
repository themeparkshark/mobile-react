import type { ComponentType } from 'react';

/**
 * Development-only screens (previews, testers, the game kit gym).
 *
 * Everything here sits behind a literal `__DEV__ ? ... : ...`, which Metro
 * constant-folds in release bundles, so none of these modules (or what they
 * import) ship to players. Screens load lazily through getComponent.
 */
export type DevScreen = {
  readonly name: string;
  readonly getComponent: () => ComponentType<any>;
};

export const DEV_SCREENS: readonly DevScreen[] = __DEV__
  ? [
      { name: 'LiveEventPreview', getComponent: () => require('./screens/LiveEventPreviewScreen').default },
      { name: 'QueueTimesPreview', getComponent: () => require('./screens/QueueTimesPreviewScreen').default },
      { name: 'TriviaGamePreview', getComponent: () => require('./screens/LinePlay/TriviaGamePreviewScreen').default },
      { name: 'QueueStampPreview', getComponent: () => require('./screens/LinePlay/QueueStampPreviewScreen').default },
      { name: 'MiniGameTester', getComponent: () => require('./screens/MiniGameTesterScreen').default },
      { name: 'GameKitGym', getComponent: () => require('./screens/GameKitGymScreen').default },
      { name: 'ShelfArrivalPreview', getComponent: () => require('./screens/ShelfArrivalPreviewScreen').default },
      { name: 'BossMechanicsPreview', getComponent: () => require('./screens/BossMechanicsPreviewScreen').default },
      { name: 'BossMapPreview', getComponent: () => require('./screens/BossMapPreviewScreen').default },
      { name: 'PostWinRewardsPreview', getComponent: () => require('./screens/PostWinRewardsPreviewScreen').default },
      { name: 'CoinLevelingPreview', getComponent: () => require('./screens/CoinLevelingPreviewScreen').default },
      { name: 'RescuePassPreview', getComponent: () => require('./screens/RescuePassPreviewScreen').default },
      { name: 'ParkChecklistPreview', getComponent: () => require('./screens/ParkChecklistPreviewScreen').default },
      { name: 'ParkArrivalPreview', getComponent: () => require('./screens/ParkArrivalPreviewScreen').default },
      { name: 'CrewRelayPreview', getComponent: () => require('./screens/LinePlay/CrewRelayPreviewScreen').default },
      { name: 'ParkProjectPreview', getComponent: () => require('./screens/ExploreScreen/ParkProjectPreviewScreen').default },
      { name: 'TripGoalPreview', getComponent: () => require('./screens/ExploreScreen/TripGoalPreviewScreen').default },
      { name: 'MapAlivePreview', getComponent: () => require('./screens/ExploreScreen/MapAlivePreviewScreen').default },
      { name: 'MapDeclutterPreview', getComponent: () => require('./components/map/declutter/preview/MapDeclutterPreview').default },
      { name: 'ParkDayRecapPreview', getComponent: () => require('./screens/ParkDayRecapPreviewScreen').default },
      { name: 'ShareStudioPreview', getComponent: () => require('./screens/ShareStudioPreviewScreen').default },
      { name: 'ShareModalEvidence', getComponent: () => require('./screens/ShareModalEvidenceScreen').default },
      { name: 'LineGroupPreview', getComponent: () => require('./screens/LinePlay/LineGroupPreviewScreen').default },
      { name: 'CrewGridPreview', getComponent: () => require('./screens/LinePlay/CrewGridPreviewScreen').default },
      { name: 'StreakFlamePreview', getComponent: () => require('./components/retention/StreakFlamePreview').default },
      { name: 'MenuPreview', getComponent: () => require('./screens/MenuPreviewScreen').default },
      { name: 'SetCollectionPreview', getComponent: () => require('./screens/SetCollectionPreviewScreen').default },
      { name: 'HomeHuntPreview', getComponent: () => require('./screens/ExploreScreen/HomeHuntPreviewScreen').default },
      { name: 'HomeCatchPreview', getComponent: () => require('./screens/ExploreScreen/HomeCatchPreviewScreen').default },
      { name: 'InventoryPreview', getComponent: () => require('./screens/InventoryPreviewScreen').default },
      { name: 'ProfilePreview', getComponent: () => require('./screens/ProfilePreviewScreen').default },
      { name: 'SocialPreview', getComponent: () => require('./screens/SocialPreviewScreen').default },
      { name: 'RideLogSuccessPreview', getComponent: () => require('./screens/RideLogSuccessPreviewScreen').default },
      { name: 'UiKitGym', getComponent: () => require('./ui/UiKitGym').default },
      { name: 'SetRevealPreview', getComponent: () => require('./screens/StoreScreen/SetRevealPreviewScreen').default },
      { name: 'FrightIntroPreview', getComponent: () => require('./components/fright/tutorial/FrightIntroPreviewScreen').default },
      { name: 'SecretShopPreview', getComponent: () => require('./screens/StoreScreen/SecretShopPreviewScreen').default },
      { name: 'MoneyPreview', getComponent: () => require('./screens/MoneyPreviewScreen').default },
      { name: 'TrailPreview', getComponent: () => require('./screens/TrailPreviewScreen').default },
      { name: 'ShopLifecyclePreview', getComponent: () => require('./screens/StoreScreen/ShopLifecyclePreviewScreen').default },
      { name: 'ShopTabsPreview', getComponent: () => require('./screens/StoreScreen/ShopTabsPreviewScreen').default },
    ]
  // Release-mode frame-time captures only (EXPO_PUBLIC_PERF_CAPTURE=1 with `expo start --no-dev`); store builds never set it,
  // so this branch folds away like the dev list.
  : process.env.EXPO_PUBLIC_PERF_CAPTURE === '1'
    ? [{ name: 'BossMapPreview', getComponent: () => require('./screens/BossMapPreviewScreen').default }]
    : [];

/**
 * First matching EXPO_PUBLIC_*_PREVIEW flag wins; order matches the original
 * Root chain. Each flag is a literal process.env access so Expo inlines it.
 */
export function devInitialRoute(): string | null {
  if (!__DEV__) return process.env.EXPO_PUBLIC_PERF_CAPTURE === '1' ? 'BossMapPreview' : null;
  const on = (value: string | undefined) => value === '1';
  const table: readonly (readonly [boolean, string])[] = [
    [!!process.env.EXPO_PUBLIC_SHOP_TABS_PREVIEW, 'ShopTabsPreview'],
    [!!process.env.EXPO_PUBLIC_TRAIL_PREVIEW, 'TrailPreview'],
    [!!process.env.EXPO_PUBLIC_SHOP_LIFE_PREVIEW, 'ShopLifecyclePreview'],
    [on(process.env.EXPO_PUBLIC_PINS_PREVIEW), 'PinCollections'],
    [on(process.env.EXPO_PUBLIC_HOME_CATCH_PREVIEW), 'HomeCatchPreview'],
    [on(process.env.EXPO_PUBLIC_MAP_ALIVE_PREVIEW), 'MapAlivePreview'],
    [on(process.env.EXPO_PUBLIC_DECLUTTER_PREVIEW), 'MapDeclutterPreview'],
    [on(process.env.EXPO_PUBLIC_BOSS_MAP_PREVIEW), 'BossMapPreview'],
    [on(process.env.EXPO_PUBLIC_BOSS_MECHANICS_PREVIEW), 'BossMechanicsPreview'],
    [on(process.env.EXPO_PUBLIC_SHELF_ARRIVAL_PREVIEW), 'ShelfArrivalPreview'],
    [on(process.env.EXPO_PUBLIC_TRIVIA_GAME_PREVIEW), 'TriviaGamePreview'],
    [on(process.env.EXPO_PUBLIC_LINEPLAY_FLOW_PREVIEW), 'LinePlay'],
    [on(process.env.EXPO_PUBLIC_LINE_GROUP_PREVIEW), 'LineGroupPreview'],
    [on(process.env.EXPO_PUBLIC_QUEUE_TIMES_PREVIEW), 'QueueTimesPreview'],
    [on(process.env.EXPO_PUBLIC_PARK_ARRIVAL_PREVIEW), 'ParkArrivalPreview'],
    [on(process.env.EXPO_PUBLIC_PARK_CHECKLIST_PREVIEW) ||
      on(process.env.EXPO_PUBLIC_PARK_RESCUE_GOAL_PREVIEW) ||
      on(process.env.EXPO_PUBLIC_PARK_DOWN_PREVIEW) ||
      on(process.env.EXPO_PUBLIC_PARK_PASSPORT_PREVIEW) ||
      on(process.env.EXPO_PUBLIC_PARK_PASSPORT_COMPLETE_PREVIEW), 'ParkChecklistPreview'],
    [on(process.env.EXPO_PUBLIC_INVENTORY_PREVIEW), 'InventoryPreview'],
    [on(process.env.EXPO_PUBLIC_PROFILE_PREVIEW), 'ProfilePreview'],
    [on(process.env.EXPO_PUBLIC_SOCIAL_PREVIEW), 'SocialPreview'],
    [on(process.env.EXPO_PUBLIC_RIDE_LOG_SUCCESS_PREVIEW), 'RideLogSuccessPreview'],
    [on(process.env.EXPO_PUBLIC_RIDE_LOG_PREVIEW), 'RideLog'],
    [on(process.env.EXPO_PUBLIC_RIDE_BATCH_PREVIEW), 'RideBatchConfirm'],
    [on(process.env.EXPO_PUBLIC_RIDE_DETECTION_PREVIEW), 'RideTracker'],
    [on(process.env.EXPO_PUBLIC_RESCUE_PASS_PREVIEW), 'RescuePassPreview'],
    [on(process.env.EXPO_PUBLIC_FRIEND_BOOK_PREVIEW), 'FriendStampBook'],
    [on(process.env.EXPO_PUBLIC_STAMP_BOOK_PREVIEW) || on(process.env.EXPO_PUBLIC_STAMP_BOOK_LIVE), 'StampBook'],
    [on(process.env.EXPO_PUBLIC_QUEUE_STAMP_PREVIEW), 'QueueStampPreview'],
    [on(process.env.EXPO_PUBLIC_RIDE_GAME_PREVIEW), 'MiniGameTester'],
    [!!process.env.EXPO_PUBLIC_LIVE_EVENT_PREVIEW, 'LiveEventPreview'],
    [on(process.env.EXPO_PUBLIC_COIN_SHELF_PREVIEW), 'CoinShelf'],
    [on(process.env.EXPO_PUBLIC_RIDE_TRACKER_PREVIEW), 'RideTracker'],
    [on(process.env.EXPO_PUBLIC_COIN_LEVELING_PREVIEW), 'CoinLevelingPreview'],
    [on(process.env.EXPO_PUBLIC_HOME_HUNT_PREVIEW) ||
      on(process.env.EXPO_PUBLIC_HOME_SAVED_PREVIEW) ||
      on(process.env.EXPO_PUBLIC_TUTORIAL_PREVIEW), 'HomeHuntPreview'],
    [on(process.env.EXPO_PUBLIC_SET_COLLECTION_PREVIEW), 'SetCollectionPreview'],
    [on(process.env.EXPO_PUBLIC_MENU_PREVIEW), 'MenuPreview'],
    [on(process.env.EXPO_PUBLIC_STREAK_FLAME_PREVIEW), 'StreakFlamePreview'],
    [on(process.env.EXPO_PUBLIC_HOW_TO_PLAY_PREVIEW), 'HowToPlay'],
    [on(process.env.EXPO_PUBLIC_CREW_GRID_PREVIEW), 'CrewGridPreview'],
    [on(process.env.EXPO_PUBLIC_PARK_DAY_RECAP_PREVIEW), 'ParkDayRecapPreview'],
    [on(process.env.EXPO_PUBLIC_SHARE_EVIDENCE_PREVIEW), 'ShareModalEvidence'],
    [on(process.env.EXPO_PUBLIC_SHARE_STUDIO_PREVIEW), 'ShareStudioPreview'],
    [on(process.env.EXPO_PUBLIC_TRIP_GOAL_PREVIEW), 'TripGoalPreview'],
    [on(process.env.EXPO_PUBLIC_PARK_PROJECT_PREVIEW), 'ParkProjectPreview'],
    [on(process.env.EXPO_PUBLIC_CREW_RELAY_PREVIEW), 'CrewRelayPreview'],
    [on(process.env.EXPO_PUBLIC_POST_WIN_REWARDS_PREVIEW) || on(process.env.EXPO_PUBLIC_POST_WIN_FIRST_PREVIEW), 'PostWinRewardsPreview'],
    [on(process.env.EXPO_PUBLIC_UI_KIT_PREVIEW), 'UiKitGym'],
    [!!process.env.EXPO_PUBLIC_FRIGHT_INTRO_PREVIEW, 'FrightIntroPreview'],
    [!!process.env.EXPO_PUBLIC_SECRET_SHOP_PREVIEW, 'SecretShopPreview'],
    [on(process.env.EXPO_PUBLIC_SET_REVEAL_PREVIEW), 'SetRevealPreview'],
    [on(process.env.EXPO_PUBLIC_NEWS_PREVIEW), 'News'],
  ];
  return table.find(([enabled]) => enabled)?.[1] ?? null;
}
