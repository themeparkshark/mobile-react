# Gameplay Systems Audit Pass 2

## Exact Explore Loop Wiring

- `src/screens/ExploreScreen.tsx` is the single top-level orchestrator for both park mode and travel/home mode.
- Core state in `ExploreScreen`:
  - `redeemables`: full park payload from `/me/current-redeemables` via `currentRedeemables()` (`src/api/endpoints/me/current-redeemables.js`, `src/screens/ExploreScreen.tsx:76,221-233`).
  - `activeRedeemable`: a separate singular proximity result from `/me/current-redeemable` via `checkForRedeemable()` (`src/helpers/check-for-redeemable.ts:4-11`, `src/api/endpoints/me/current-redeemable.ts:5-19`, `src/screens/ExploreScreen.tsx:77-79,358-372`).
  - `selectedTask`: only local marker-selection state for task tooltip visibility; it does not drive redemption (`src/screens/ExploreScreen.tsx:81,744-761`).
  - `failedTaskIds`: persisted in `expo-secure-store`, reset daily, used to suppress resurfacing failed tasks locally (`src/screens/ExploreScreen.tsx:80,83-121,365-369`).
  - `activePrepItem`, `activePrepItemPivotId`, `showPrepItemModal`: home-mode prep item collection state (`src/screens/ExploreScreen.tsx:123-125,188-190,525-538`).
- ExploreScreen always mounts ride detection when the user is logged in and location permission exists, regardless of park detection success: `useRideDetection(!!permissionGranted && !!player)` (`src/screens/ExploreScreen.tsx:147-150`).
- Park bootstrap:
  - `LocationProvider` continuously updates GPS via `watchPositionAsync`, then resolves park context with `/me/current-park` (`src/context/LocationProvider.tsx:223-248,250-310`).
  - When `park?.id` changes, `ExploreScreen` fetches `redeemables` and community center data (`src/screens/ExploreScreen.tsx:235-248`).
  - Gym data refreshes every 30s while in a park (`src/screens/ExploreScreen.tsx:296-303`).
- Active redemption loop:
  - Full arrays of tasks/items/coins/etc come from `/me/current-redeemables`.
  - Actual “Redeem” button availability comes from `/me/current-redeemable`, not from `selectedTask`.
  - If the singular current redeemable is a failed task id, Explore clears it locally even if backend still returns it (`src/screens/ExploreScreen.tsx:363-371`).
- Render split:
  - No player: guest/login prompt (`src/screens/ExploreScreen.tsx:507-523`).
  - Logged in, no permission: `PermissionsNotGranted` (`src/screens/ExploreScreen.tsx:502`).
  - Logged in, park not found: `HomeExplore` home loop (`src/screens/ExploreScreen.tsx:503-506`).
  - Logged in, park found: map markers + `RedeemModal` + park overlays (`src/screens/ExploreScreen.tsx:539-918`).
- Park-mode map markers are mostly passive visuals:
  - Tasks: `TaskMarker` renders tooltip and timer badge, but press only toggles `selectedTask` (`src/screens/ExploreScreen/TaskMarker.tsx:15-39`, `src/screens/ExploreScreen.tsx:755-761`).
  - Coins, keys, redeemables, items, pins, vaults are rendered from `redeemables` arrays (`src/screens/ExploreScreen.tsx:745-840`).
  - Community center marker navigates directly to `CommunityCenter`; it does not open the old modal (`src/screens/ExploreScreen.tsx:217-219,842-847`).

## Exact Task Flow

- Task availability source:
  - `redeemables.tasks` and `redeemables.secret_tasks` come from `/me/current-redeemables` (`src/models/redeemables-type.ts:8-16`).
  - `activeRedeemable` comes from `/me/current-redeemable` using live GPS, not from marker tap (`src/helpers/check-for-redeemable.ts:4-11`).
- Task marker press:
  - Only toggles `selectedTask` for tooltip opacity (`src/screens/ExploreScreen.tsx:755-761`, `src/screens/ExploreScreen/TaskMarker.tsx:62-70`).
  - No navigation, no dispatch, no validation, no task selection persistence.
- Task modal entry:
  - `RedeemModal` shows a single “Redeem” button when `activeRedeemable` exists (`src/components/RedeemModal.tsx:79-99`).
  - For tasks and secret tasks, it delegates to `RedeemRedeemableModal` (`src/components/RedeemModal.tsx:125-139`).
- Preview state in `RedeemRedeemableModal`:
  - Determines ticket cost from `ticket_cost` on model if present; otherwise derives from XP (`>=100 => 3`, `>=50 => 2`, else `1`) (`src/components/RedeemRedeemableModal.tsx:36-46`).
  - Shows XP, coins, and a hardcoded `1` park coin preview box (`src/components/RedeemRedeemableModal.tsx:383-427`).
  - Ad/watch toggles only set local `doubleXP` / `doubleCoins` booleans before completion call (`src/components/RedeemRedeemableModal.tsx:93-94,403-423`).
- Ticket spending:
  - `handleStartWheel()` spends tickets before the wheel appears via `POST /me/spend-tickets` (`src/components/RedeemRedeemableModal.tsx:159-196`, `src/api/endpoints/me/spend-tickets.ts:11-27`).
  - `refreshPlayer()` is called after spend to update the ticket UI.
  - If server returns `422`, flow stops.
  - For other API/network errors, the modal falls back and still proceeds to the wheel without confirmed deduction (`src/components/RedeemRedeemableModal.tsx:184-195`). This is a real product/accounting risk.
- Minigame dispatch:
  - Wheel chooses one of `tap | timing | memory | trivia` entirely client-side via `Math.random()` (`src/components/RedeemRedeemableModal.tsx:60-71,198-225`).
  - After 4s spin + 1.5s landed delay, modal mounts `MiniGameSelector` with `preferredGame={selectedGame}` (`src/components/RedeemRedeemableModal.tsx:213-224,523-533`).
  - There is no backend game session, seed, or anti-abuse validation.
- Success path:
  - `handleGameWin(multiplier)` calls:
    - regular task: `POST /tasks/:id/complete` (`src/api/endpoints/me/tasks/complete-task.ts:17-30`)
    - secret task: `POST /secret-tasks/:id/complete` (`src/api/endpoints/me/secret-tasks/complete-secret-task.ts:17-30`)
  - Backend response is authoritative for `coins_earned`, `xp_earned`, `energy_earned`, `ride_parts_earned` (`src/components/RedeemRedeemableModal.tsx:235-277`).
  - After success:
    - `refreshPlayer()` runs.
    - parent callback removes completed task from local `redeemables` state immediately (`src/components/RedeemRedeemableModal.tsx:277-284`, `src/screens/ExploreScreen.tsx:632-643`).
    - post-win modal displays rewards (`src/components/RedeemRedeemableModal.tsx:538-555`).
- Failure path:
  - `handleGameLose()` calls:
    - `POST /tasks/:id/fail` or `POST /secret-tasks/:id/fail` (`src/api/endpoints/tasks/fail-task.ts:4-15`, `src/api/endpoints/secret-tasks/fail-secret-task.ts:4-15`)
  - On failure, task is removed locally and added to `failedTaskIds`, then suppressed for the rest of the day (`src/components/RedeemRedeemableModal.tsx:299-317`, `src/screens/ExploreScreen.tsx:618-631`).
  - Tickets are already gone before the minigame starts.
- Local fallback on backend completion failure:
  - If `/complete` fails, the UI still computes local rewards, shows post-win, and does not re-add the task (`src/components/RedeemRedeemableModal.tsx:285-296`).
  - That means success UX can diverge from backend persistence.

## Exact Prep Item Flow

- Home-mode prep loop lives entirely in `src/screens/ExploreScreen/HomeExplore.tsx`.
- Spawn/load path:
  - `loadPrepItems()` calls `GET /me/prep-items?latitude&longitude` (`src/screens/ExploreScreen/HomeExplore.tsx:164-203`, `src/api/endpoints/me/prep-items/index.ts:12-23`).
  - Endpoint contract explicitly says it also regenerates energy and spawns new items if needed (`src/api/endpoints/me/prep-items/index.ts:7-10`).
  - Cached responses are shown first via `getCachedPrepItems()` (`src/screens/ExploreScreen/HomeExplore.tsx:177-185`).
  - First-load and refresh also call `refreshPlayer()` to sync currencies (`src/screens/ExploreScreen/HomeExplore.tsx:193-195`).
- Nearby detection:
  - Separate throttled check calls `GET /me/current-prep-item` every 3s / 5m movement when items exist (`src/screens/ExploreScreen/HomeExplore.tsx:211-240`, `src/api/endpoints/me/prep-items/current.ts:7-22`).
  - If backend says an item is near, parent `onPrepItemNearby(prep_item, pivot_id)` fires automatically (`src/screens/ExploreScreen/HomeExplore.tsx:225-232`).
- Manual marker press:
  - Also routes through `onPrepItemNearby(prepItem, prepItem.pivot_id)` (`src/screens/ExploreScreen/HomeExplore.tsx:267-283`).
- Local proximity guard:
  - `ExploreScreen.handlePrepItemNearby()` runs a Haversine distance check with `PREP_ITEM_RANGE_METERS = 28` and only then opens `PrepItemRedeemModal` (`src/screens/ExploreScreen.tsx:60-61,162-191`).
  - If no location or too far, it shows the generic “Too Far Away” modal.
- Collection:
  - `PrepItemRedeemModal.handleCollect()` calls `POST /prep-items/:id/redeem` with `pivot_id`, `double_rewards`, `lat`, `lng` (`src/components/PrepItemRedeemModal.tsx:83-156`, `src/api/endpoints/me/prep-items/redeem.ts:7-25`).
  - The modal comment says backend enforces proximity as well (`src/components/PrepItemRedeemModal.tsx:86-91`).
- Response handling:
  - Stores `rewards`, `streak`, and then `refreshPlayer()` (`src/components/PrepItemRedeemModal.tsx:108-149`).
  - Response type includes `set_progress`, `is_new_variant`, and `new_totals`, but the modal does not surface `set_progress` directly (`src/models/redeem-prep-item-response-type.ts:16-35`).
- Reward currencies:
  - `PrepItemType` exposes `energy_reward`, `ticket_reward`, `experience_reward` in the marker/preview model (`src/models/prep-item-type.ts:1-16`).
  - Actual collected payload includes `energy`, `tickets`, `experience` and optional totals (`src/models/redeem-prep-item-response-type.ts:6-20`).
  - UI also expects `coins` in local state even though `RedeemPrepItemResponseType` does not declare it; the component reads `response.data.rewards.coins` anyway (`src/components/PrepItemRedeemModal.tsx:61-66,115-141`). That type/runtime mismatch is real.
- Set progression:
  - Progress and set completion are backend-backed through `/me/prep-item-sets`, `/me/prep-item-sets/:slug`, and `/me/prep-item-sets/:slug/claim` (`src/api/endpoints/me/prep-item-sets/index.ts:44-47,117-145`).
  - `SetCollectionScreen` loads those endpoints but explicitly falls back to `mockChurroSet` data if API is unavailable (`src/screens/SetCollectionScreen.tsx:36-42`).
- Home-mode role:
  - Prep items are the only real travel-mode gameplay loop in Explore.
  - They also act as the app’s most concrete ticket source outside parks and the only always-available energy inflow shown in Explore.

## Exact Ride Tracker Flow

- Global enablement:
  - `ExploreScreen` mounts `useRideDetection()`, so ride tracking is tied to Explore being rendered, not to the Ride Tracker screen (`src/screens/ExploreScreen.tsx:147-150`).
- Detection bootstrap:
  - `useRideDetection()` fetches all rides with `getRides()` and hands them to `RideDetectionService.setRides()` (`src/hooks/useRideDetection.ts:129-146`).
  - It starts foreground watcher + background location task via `startDetection()` (`src/hooks/useRideDetection.ts:142`, `src/services/RideDetectionService.ts:189-239`).
  - It also polls queue times every 5 minutes and injects current wait times into confidence scoring (`src/hooks/useRideDetection.ts:144-150,177-226`).
- Detection rules in `RideDetectionService`:
  - Rides must have `lat/lng`; nearby check uses ride-specific `radius` or 50m fallback (`src/services/RideDetectionService.ts:139-143,325-331`).
  - Entering a ride radius opens a `zoneState`; exiting after enough dwell creates a queued detection (`src/services/RideDetectionService.ts:295-321,273-290,344-391`).
  - Defaults:
    - fallback radius: 50m
    - default min dwell: 90s
    - ignore walkthroughs under 60s
    - cooldown per ride: 2m
    - re-ride window: 3m (`src/services/RideDetectionService.ts:24-31`)
  - Confidence is derived from dwell time versus ride duration and optional live wait time (`src/services/RideDetectionService.ts:76-98,355-367`).
- Persistence/buffering:
  - Every detection is appended into AsyncStorage key `pending_ride_detections`, even for foreground detections (`src/services/RideDetectionService.ts:24,372-379,394-405`).
  - Rides list is also cached in AsyncStorage for background task cold starts (`src/services/RideDetectionService.ts:25,149-186,431-446`).
- Foreground confirmation flow:
  - `RideDetectionService.onForegroundDetection` is assigned by `useRideDetection()` and emits `rideDetected` events only while app state is active (`src/hooks/useRideDetection.ts:87-102`).
  - `RideDetectionOverlay` is mounted globally in `Root` above the navigator (`src/Root.tsx:70,282`).
  - Overlay deduplicates recent detections, queues them, and shows a slide-up popup (`src/components/RideTracker/RideDetectionOverlay.tsx:37-81`).
  - Confirming removes the pending detection and navigates to `RideLog` with `autoDetected`, `rideId`, `rideName`, `rodeAt` (`src/components/RideTracker/RideDetectionOverlay.tsx:97-111`).
  - Dismissing also removes that pending detection (`src/components/RideTracker/RideDetectionOverlay.tsx:113-120`).
- Background / return-to-app flow:
  - When app returns to foreground, `useRideDetection()` checks pending detections and navigates to `RideBatchConfirm` if medium/high confidence items exist (`src/hooks/useRideDetection.ts:104-127`, `42-79`).
  - Low-confidence detections are silently removed from queue (`src/hooks/useRideDetection.ts:53-61`).
- Batch confirm flow:
  - `RideBatchConfirmScreen` starts with route detections and defaults selection to all non-low items (`src/screens/RideTracker/RideBatchConfirmScreen.tsx:142-147`).
  - User toggles selected rides, then rates each sequentially (`src/screens/RideTracker/RideBatchConfirmScreen.tsx:168-229`).
  - Submission loops `logRide(payload)` for each selected ride; no batch endpoint exists (`src/screens/RideTracker/RideBatchConfirmScreen.tsx:182-209`).
  - After submit, queue is fully cleared and summary shows total XP (`src/screens/RideTracker/RideBatchConfirmScreen.tsx:200-209,304-350`).
- Manual/foreground log flow:
  - `RideLogScreen` loads a ride directly if opened from auto-detect params and skips park/ride selection (`src/screens/RideTracker/RideLogScreen.tsx:66-70,116-131`).
  - Submit posts `/player-rides` with ride id, optional rating/reaction/note/wait_time, and `rode_at` (`src/screens/RideTracker/RideLogScreen.tsx:156-189`, `src/api/endpoints/player-rides/index.ts:41-67`).
  - Success payload includes `xp_earned` and `new_achievements` (`src/api/endpoints/player-rides/index.ts:52-67`).
- Stats and achievements:
  - `RideTrackerScreen` uses `/player-rides/stats`, `/player-rides?per_page=5`, and `/player-rides/profile-stats` (`src/screens/RideTracker/RideTrackerScreen.tsx:125-135`, `src/api/endpoints/player-rides/index.ts:69-87`, `src/api/endpoints/player-rides/profileStats.ts:14-17`).
  - All ride history, stats, wrapped, achievements, wishlist, and detail screens are backend-driven through `/player-rides` and `/rides` endpoints.

## Economy Truth Table

| Currency | Real source(s) seen in code | Real sink(s) seen in code | Notes |
| --- | --- | --- | --- |
| Tickets | Prep item redeem (`/prep-items/:id/redeem`), prep item set claim (`/me/prep-item-sets/:slug/claim`), stamp claim (`/me/stamps/:id/claim`), community center give/claim (`/community-centers/:id/give|claim`), dev fallback on `/me` injects `10` in `__DEV__`, Shark Park milestones add local-only tickets | Task attempt via `/me/spend-tickets` before wheel | Community center UI awards hardcoded `+2/+1` ticket badges in old modal; Shark Park tickets never sync to player |
| Energy | Task completion, secret task completion, prep item redeem, prep item set claim, stamp claim, inline timer complete (`bonus_energy`) | Ride coin level-up endpoint `/api/v2/me/ride-coins/:id/level-up` | `InLineTimer` component itself is mostly simulated and not wired to backend flow |
| Coins | Task/secret task completion, coin redeem (`/coins/:id/redeem`), prep items, stamp claim, likely misc live rewards | Store item purchase, community center give (350 `player.coins`) | Community center tutorial text says park coins, but actual UI checks `player.coins` (`src/components/CommunityCenterModal.tsx:124,183-197`, `src/screens/CommunityCenterScreen.tsx:533-539`) |
| Park Coins | Frontend mainly displays backend counts from `park.park_coins_count` / `player.park_coins_count` | Gym battle / park coin placement uses park-specific coin inventory, not a simple decrement in Explore | Frontend does not explicitly mint park coins; task completion likely does server-side but client only observes refreshed park/player payloads |
| Ride Parts | Task completion, secret task completion, inline timer complete, likely backend ride-part inventory | Ride coin level-up endpoint | `CoinShelfScreen` reads ride parts, but its coin-level data is simulated from tasks rather than `/api/v2/me/ride-coins` |

Additional concrete sink/source points:

- Task attempt sink: `src/components/RedeemRedeemableModal.tsx:159-196`.
- Task reward creation: `src/components/RedeemRedeemableModal.tsx:235-277`.
- Prep item reward creation: `src/components/PrepItemRedeemModal.tsx:99-149`.
- Ride coin sink endpoint exists: `src/api/endpoints/me/ride-coins/level-up.ts:4-19`.
- Stamp reward creation exists in API contract, but `StampBookScreen` currently does not expose claim UI in the inspected section and falls back to mock display if fetch fails (`src/api/endpoints/me/stamps.ts:48-50`, `src/screens/StampBookScreen.tsx:200-215`).
- Shark Park has its own isolated `state.tickets` in AsyncStorage (`src/helpers/idle-game.ts:443-455,677-749`).

## Social Truth Table

| Surface | Backend-driven | Local/UI-only | Evidence |
| --- | --- | --- | --- |
| Friends list and friend actions | Yes | Confirmation alerts only local | `/me/friends`, `/players/:id/send-friend-request`, `/accept-friend-request`, `/unfriend`; `useFriends()` wraps them in `Alert` UI (`src/api/endpoints/me/friends.ts:5-35`, `src/hooks/useFriends.tsx:12-87`) |
| Social feed / threads / comments / reactions | Yes | Sorting/filter sheet state local | `/threads`, `/threads/:id`, `/threads/:id/comments`, reaction endpoints; `SocialScreen` local filters call backend queries (`src/api/endpoints/threads/getThreads.ts:5-33`, `src/screens/SocialScreen.tsx:84-88`) |
| Community Center full screen | Yes | Heavy local animation/state orchestration | Fetches and posts to `/parks/:parkId/community-center`, `/community-centers/:id/give`, `/claim` (`src/screens/CommunityCenterScreen.tsx:288-299,451-455,580-581`) |
| Community Center modal in Explore | Partly | Result rewards are partly hardcoded and modal is effectively unreachable | `showCommunityCenterModal` exists but is never set true; marker navigates away instead (`src/screens/ExploreScreen.tsx:130,217-219,874-879`) |
| Ride Tracker stats/history/achievements | Yes | Presentation and queue/rating state local | `/player-rides`, `/player-rides/stats`, `/profile-stats`, `/achievements` |
| Shark customization V2 screen | No in current screen | Entire screen uses mock cosmetics and local equip flags | `MOCK_COSMETICS`, `setTimeout`, `TODO: Call API` (`src/screens/SharkCustomizationScreen.tsx:33-165,391-449`) |
| Explore task marker selection | No | Pure local tooltip state | `selectedTask` only toggles marker label (`src/screens/ExploreScreen.tsx:81,755-761`) |

## Customization Architecture Split

- Legacy live customization path:
  - Player object carries `inventory: InventoryType` (`src/models/player-type.ts:20`).
  - `InventoryScreen` fetches inventory items by item type from `/me/inventory/items`, equips via `PUT /me/inventory`, and refreshes player (`src/screens/InventoryScreen.tsx:49-78,102-109`, `src/api/endpoints/me/inventory/items.ts:5-17`, `src/api/endpoints/me/inventory/update-inventory.ts:6-15`).
  - `Playercard`, `Avatar`, and even the Explore map player marker render legacy inventory slots like `skin_item`, `head_item`, `pin_item`, `background_item` (`src/components/Playercard.tsx`, `src/components/Avatar.tsx`, `src/components/Map.tsx:308-336`).
  - Store purchase path is also legacy inventory-based: `/me/inventory/items/:id/purchase` (`src/api/endpoints/me/inventory/purchase-item.ts:5-10`).
- V2 cosmetics path:
  - `PlayerType` also exposes optional `active_cosmetics?: PlayerCosmeticType[]` with categories `shark_skin | frame | badge | trail` (`src/models/player-type.ts:35-57`).
  - There are real V2 endpoints: `GET /api/v2/cosmetics` and `POST /api/v2/cosmetics/:id/equip` (`src/api/endpoints/cosmetics/index.ts:16-29`, `src/api/endpoints/cosmetics/equip.ts:3-19`).
- Actual UI split:
  - `SharkCustomizationScreen` is not registered in `Root.tsx` navigation at all.
  - The screen uses `MOCK_COSMETICS`, fake loading via `setTimeout`, and local-only equip/unequip toggles with `TODO: Call API` comments (`src/screens/SharkCustomizationScreen.tsx:33-165,391-449`).
  - So legacy inventory is the real live player-facing customization system; V2 cosmetics exist in models/endpoints but not in the app’s real interaction path.

## Shark Park Isolation Report

- `SharkParkScreen` is a fully separate idle game mode using `helpers/idle-game.ts` and local `ParkState` (`src/screens/SharkParkScreen.tsx:31-54,145-159`).
- Persistence is local-only AsyncStorage under `@shark_park_state` (`src/helpers/idle-game.ts:728-749`).
- No backend endpoints are used anywhere in `SharkParkScreen`.
- Main loop:
  - load local save or create default state (`src/screens/SharkParkScreen.tsx:166-195`)
  - auto-collect manager rides every 100ms (`src/screens/SharkParkScreen.tsx:206-245`)
  - buy rides / hire managers / buy upgrades mutate local `state` only (`src/screens/SharkParkScreen.tsx:263-359`)
  - save debounced every 2.5s (`src/screens/SharkParkScreen.tsx:197-205`)
- Tickets in Shark Park:
  - milestones grant `state.tickets` locally (`src/screens/SharkParkScreen.tsx:247-261`)
  - prestige preserves those local tickets (`src/helpers/idle-game.ts:430-455`)
  - there is no sync into `player.tickets`.
- Isolation conclusion:
  - Shark Park is mechanically substantial but economically and architecturally quarantined from the main app.
  - The only connection is menu/navigation discoverability via `QuickAccessMenu` and `Root` registration, not shared progression data.

## Dead Ends / Duplicate Systems

- `RideAutoDetect.ts` appears unused. `rg` only finds its own exports; production detection uses `RideDetectionService` + `useRideDetection` instead.
- `RideDetectedPopup.tsx` appears unused. Global overlay uses `RideDetectionOverlay` instead.
- `CommunityCenterModal` is effectively dead in Explore:
  - state exists (`showCommunityCenterModal`)
  - component is rendered
  - no code path ever sets it `true`
  - marker press navigates to `CommunityCenter` screen instead.
- `TaskListModal` still exists in codebase, but Explore comments say it was removed and no current flow references it.
- `SharkCustomizationScreen` is a dead-end prototype:
  - not in navigation
  - mock data only
  - no endpoint use despite real V2 endpoints existing.
- Ride coin architecture is duplicated:
  - real V2 ride coin endpoints exist (`/api/v2/me/ride-coins`, level-up)
  - `CoinShelfScreen` does not use them and instead synthesizes coin levels from task completion counts (`src/screens/CoinShelfScreen.tsx:38-70,82-125`).
- In-line timer architecture is duplicated:
  - real start/complete endpoints exist (`src/api/endpoints/me/inline-timer/*.ts`)
  - `InLineTimer.tsx` simulates timer rewards locally and is not visibly wired into the inspected main gameplay loop.

## Most Misleading UI Surfaces

- Task markers look selectable and central, but tapping them only reveals a label. Actual redemption is proximity-based through `activeRedeemable`.
- Community center tutorial copy and some UI imply a modal interaction and park-coin economy, but live Explore uses direct navigation and the actual give flow checks `player.coins`.
- Ride coin shelf looks like a live upgrade/inventory system, but its shelf data is synthesized from visited park tasks rather than the V2 ride-coin backend.
- Shark customization looks like a modern live system on paper, but current screen is entirely mock and unreachable.
- `PrepItemRedeemModal` flies tickets/energy to `park_coins` header targets (`src/components/PrepItemRedeemModal.tsx:124-140`), which visually suggests those rewards are park coins when they are not.
- Task preview shows a park coin reward box of `1`, but task completion responses only explicitly return coins/xp/energy/ride parts in the frontend contract.

## Critical Dependency Map

- Explore path:
  - `Root` -> `ExploreScreen`
  - `ExploreScreen` -> `AuthContext`, `LocationContext`, `ThemeContext`, `CurrencyContext`, `useTutorial`, `useRideDetection`
  - `LocationContext` -> `expo-location`, `/me/current-park`
  - `ExploreScreen` -> `/me/current-redeemables`, `/me/current-redeemable`, `/parks/:id/community-center`, gym battle endpoints
  - `RedeemModal` -> `RedeemRedeemableModal`
  - `RedeemRedeemableModal` -> `/me/spend-tickets`, `/tasks/:id/complete`, `/secret-tasks/:id/complete`, `/tasks/:id/fail`, `/secret-tasks/:id/fail`, `MiniGameSelector`, `PostWinRewardsModal`
  - Home branch: `HomeExplore` -> `/me/prep-items`, `/me/current-prep-item`, `PrepItemRedeemModal` -> `/prep-items/:id/redeem`
- Ride tracker path:
  - `ExploreScreen` -> `useRideDetection`
  - `useRideDetection` -> `/rides`, `/parks/queue-times/getWikiTimes`, `RideDetectionService`, `rideDetectionEmitter`, navigation
  - `RideDetectionService` -> `expo-location`, `expo-task-manager`, AsyncStorage
  - `Root` -> `RideDetectionOverlay`
  - `RideDetectionOverlay` -> `rideDetectionEmitter`, `removePendingDetection`, navigates to `RideLog`
  - `RideLog` -> `/rides`, `/rides/:id`, `/player-rides`
  - `RideBatchConfirm` -> `/player-rides` repeated per selected detection + `clearPendingDetections`
  - `RideTrackerScreen` -> `/player-rides/stats`, `/player-rides`, `/player-rides/profile-stats`

## Highest Risk Technical/Product Confusions

- Ticket spending can fail open. Non-422 errors still let the player into the wheel (`src/components/RedeemRedeemableModal.tsx:191-195`).
- Task success can fail open. If `/complete` errors, UI still computes local rewards and shows win state (`src/components/RedeemRedeemableModal.tsx:285-296`).
- Explore has two task notions:
  - map marker selection
  - backend-selected active redeemable
  They are visually conflated but technically separate.
- There are at least three partially overlapping “coin” systems in the app:
  - regular coins
  - park coins
  - ride coins / task coins
  The frontend frequently mixes the vocabulary.
- Legacy inventory and V2 cosmetics both exist in player types, but only legacy inventory is actually wired into avatar rendering and navigation.
- Shark Park awards tickets in a way that looks premium/relevant, but those tickets are trapped in local Shark Park state.
- Community Center modal/screen copy and implementation disagree on whether the spend currency is `coins` or `park coins`.

## Next 3 questions Dustin should answer

1. Should task attempts be strictly server-authoritative? If yes, remove the “proceed anyway” fallback after failed ticket spend and the local reward fallback after failed completion.
2. Which customization system is the real future: legacy inventory or V2 cosmetics? The app currently exposes both in data, but only one is actually live.
3. Is Shark Park meant to affect the main economy? If yes, define exact sync rules for tickets/progression. If no, quarantine it harder in UI so players do not infer shared progression.
