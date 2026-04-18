# Pass 3 Notes

Date: 2026-03-13
Scope:
1. social feed, threads, comments, reactions, friends, reports, pin trading
2. store, purchases, VIP/subscription, ad doubling, monetization stubs
3. ride coin progression / coin shelf / stamps / sets / achievements / collections overlap
4. screens/components that are prototype, mock-backed, unreachable, dead, or misleadingly polished but not production-real
5. top 5 codebase areas to delete, merge, or quarantine

## 1. Social feed / threads / comments / reactions / friends / reports / pin trading

### Social feed and thread stack

- `src/screens/SocialScreen.tsx:813-979` is now the primary social surface.
  - Feed uses `GET /threads` with `sort`, `pinned`, `team`, and `friends` params via `src/api/endpoints/threads/getThreads.ts:4-31`.
  - Detail view is no longer a routed screen for normal browsing; it is an inline bottom sheet in `ThreadSheet` (`src/screens/SocialScreen.tsx:360-680`).
  - Reactions on threads in the sheet call `POST /threads/:id/add-reaction` and `DELETE /reactions/:id` through `src/components/ReactionsDropdown.tsx:33-67`.
  - Comments are loaded from `GET /threads/:id/comments` and created via `POST /threads/:id/comments` in `src/screens/SocialScreen.tsx:396-458`, backed by `src/api/endpoints/comments/getComments.ts:5-21` and `src/api/endpoints/comments/create.ts:6-29`.

- `src/screens/ThreadScreen.tsx:364-471` is still registered in navigation (`src/Root.tsx:169`) but duplicates the same backend surface already handled inside `SocialScreen`.
  - It still uses legacy `CreateReply` instead of the newer inline composer.
  - It still owns its own sorting, comments pagination, and thread refresh path.
  - This is overlapping product surface, not a distinct subsystem.

- `src/components/Thread.tsx:14-143` is an older thread list row that navigates to `Thread` route directly, but current `SocialScreen` does not use it.
  - It is effectively dead UI unless some uninspected screen still imports it.
  - It still assumes the legacy routed thread detail model.

- `src/components/CreateReply.tsx:19-173` is legacy reply UI coupled to `ThreadScreen`.
  - It has a one-shot `hasPressed` guard that is never reset after success, so the component can deadlock posting until remount (`src/components/CreateReply.tsx:32,145-159`).
  - `SocialScreen` already replaced this with its own inline reply bar (`src/screens/SocialScreen.tsx:638-675`).

### Reports and moderation

- Thread reports are real: `POST /threads/:id/report` via `src/api/endpoints/threads/report.ts:4-17`.
- Comment reports are real: `POST /comments/:id/report` via `src/api/endpoints/comments/report.ts:4-17`.
- UI for both is shared in `src/components/CreateReport.tsx:12-95`.
- Player reports also exist separately at `POST /players/:id/report` via `src/api/endpoints/players/report.ts`.

Observation:
- Reporting is one of the cleaner subsystems here: simple endpoint coverage, shared UI, no obvious mock layer.

### Friends

- Friends list is real and backend-driven.
  - `GET /me/friends` with pagination and optional `search` is used in `src/screens/FriendsScreen/YourList.tsx:23-67` and `src/api/endpoints/me/friends.ts:5-35`.
  - Friend suggestions use `GET /me/friend-suggestions` from `src/screens/FriendsScreen/Suggestions.tsx:16-35` and `src/api/endpoints/me/getFriendSuggestions.ts:5-12`.
  - Pending requests use `GET /me/friend-requests` from `src/screens/PendingFriendRequestsScreen.tsx:16-27` and `src/api/endpoints/me/pending-requests.ts:5-12`.
  - Actions are `POST /players/:id/send-friend-request`, `POST /players/:id/accept-friend-request`, and `DELETE /players/:id/unfriend` via `src/hooks/useFriends.tsx:10-86`.

Observation:
- Friends is more production-real than the surrounding social layer.
- Weak point is not backend coverage; it is duplicated UI behavior in `FriendPlayer` plus alert-driven orchestration in `useFriends`.

### Pin trading

- Pin trading is backend-backed and reachable from Social via the "Pin Trading" button (`src/screens/SocialScreen.tsx:916-921`).
- Screen: `src/screens/PinSwapsScreen.tsx:19-101`.
- Endpoints:
  - `GET /pin-swaps` via `src/api/endpoints/pin-swaps/all.ts:5-10`
  - `POST /pin-swaps/:id/hold` via `src/api/endpoints/pin-swaps/hold.ts:5-12`
  - `POST /pin-swaps/:id/accept` via `src/api/endpoints/pin-swaps/accept.ts:5-15`
  - `POST /pin-swaps/:id/unhold` via `src/api/endpoints/pin-swaps/unhold.ts:5-12`
  - inventory source is `GET /me/pins` via `src/api/endpoints/me/pins.ts:5-13`

Observations:
- Trading flow is real, but still primitive.
- `src/models/pin-swap-type.ts:3-7` only models `id`, `pin`, `held_from`, `held_to`; no richer status model, no owner metadata, no trade history, no pagination.
- `PinSwap` relies on hold-first modal flow and local timeout close behavior (`src/components/PinSwap.tsx:40-91`), which is workable but not robust.

## 2. Store / purchases / VIP / subscription / ad doubling / monetization stubs

### Store and purchases

- Store browsing is production-real and backend-backed.
  - Store fetch: `GET /stores/:id` via `src/api/endpoints/stores/get.ts:5-12`
  - Rotation fetch: `GET /stores/:id/rotation` via `src/api/endpoints/stores/rotation.ts:8-19`
  - Catalog fetch path is `current_catalog_id -> getCatalog/getItems` inside `src/screens/StoreScreen.tsx:267-293`
  - Purchase path is still legacy inventory purchase: `POST /me/inventory/items/:id/purchase` via `src/api/endpoints/me/inventory/purchase-item.ts:5-10`

- Secret store gating exists and is tied to subscription status.
  - Permission gate: `view_secret_store: player?.is_subscribed` in `src/hooks/usePermissions.tsx:12-22`
  - Profile store button logic routes unsubscribed users to Membership for secret stores in `src/screens/ProfileScreen.tsx:133-152`

Observation:
- Store is real, but still lives on the older inventory API surface, not the newer `/api/v2` layer.

### VIP / subscription

- Membership screen looks live, but the implementation is currently stub-backed.
  - UI activates Adapty and fetches paywall/products in `src/screens/MembershipScreen.tsx:33-45`.
  - Purchase action uses `adapty.makePurchase(...)` in `src/screens/MembershipScreen.tsx:173-191`.
  - The imported implementation is the Expo stub in `src/helpers/adapty-stub.ts:1-25`.
  - Stubbed `getPaywallProducts()` returns `[]` (`src/helpers/adapty-stub.ts:18-20`).

Result:
- On the current stub path, `product` becomes `undefined`, `loading` becomes `false`, and the main paywall only renders when `product` exists (`src/screens/MembershipScreen.tsx:101-103`).
- That makes the screen misleadingly polished but not actually purchase-capable in this environment.

### Ad doubling and rewarded ads

- Ad-doubling is presented across redeem flows as if it were real:
  - task rewards in `src/components/RedeemRedeemableModal.tsx:403-423`
  - redeemable rewards in `src/components/RedeemCurrentRedeemableModel.tsx:176-195`
  - key rewards in `src/components/RedeemKeyModal.tsx:176-195`

- But `WatchAd` is explicitly a fake countdown:
  - `src/components/WatchAd.tsx:6-7` says ads are disabled and the full version is only in git history
  - `src/components/WatchAd.tsx:12-25` simulates a 3-second watch and calls `onClose()`
  - `src/components/WatchAd.tsx:48-50` literally renders `[Ads disabled in test mode]`

Result:
- Double-XP / double-coins / double-key / double-redeemable flows are not monetization; they are local test-mode toggles exposed in production-looking UI.

### Watch / content monetization

- `WatchScreen` claims "Earn 25 Coins Per Video" in UI (`src/screens/WatchScreen.tsx:73-97`).
- Reward credit actually depends on `POST /social-posts/:id/view` from `src/components/SocialPost.tsx:83-99` and `src/api/endpoints/social-posts/view.ts:5-12`.

Observation:
- This is a real engagement-reward loop, but it is not tied to ad infrastructure.
- It is a content-view reward loop, not rewarded ads.

## 3. Ride coin progression / coin shelf / stamps / sets / achievements / collections overlap

### Ride coin progression vs Coin Shelf

- Real V2 ride-coin backend exists:
  - `GET /api/v2/me/ride-coins` via `src/api/endpoints/me/ride-coins/index.ts:4-12`
  - `POST /api/v2/me/ride-coins/:id/level-up` via `src/api/endpoints/me/ride-coins/level-up.ts:4-20`

- `CoinShelfScreen` does not use those endpoints.
  - Instead it synthesizes "coins" from visited parks, tasks, secret tasks, and local formulas (`src/screens/CoinShelfScreen.tsx:82-125`).
  - Level is simulated from `times_completed / 3` (`src/screens/CoinShelfScreen.tsx:39-69`).
  - Level-up is a fake timeout with a TODO (`src/screens/CoinShelfScreen.tsx:543-557`).

- Ride parts are also split across two incompatible APIs:
  - legacy-ish `GET /me/ride-parts` in `src/api/endpoints/me/ride-parts.ts:15-35`
  - V2 `GET /api/v2/me/ride-parts` in `src/api/endpoints/me/ride-parts/index.ts:4-13`

Result:
- Coin Shelf is currently a polished local simulation layered on top of park task data, while the actual ride-coin system lives elsewhere and is unused by the screen.

### Stamps

- Stamp screen uses `/me/stamps`, not `/api/v2/stamps`.
  - backend used by UI: `src/api/endpoints/me/stamps.ts:43-50`
  - unused V2 path: `src/api/endpoints/stamps/index.ts:4-14`

- `StampBookScreen` mixes real API data with a substantial local fallback catalog:
  - hardcoded fallback stamp set: `src/screens/StampBookScreen.tsx:93-121`
  - initial state starts from cached API stamps or fallback mock list: `src/screens/StampBookScreen.tsx:193-198`
  - fetch failure silently leaves mock data in place: `src/screens/StampBookScreen.tsx:200-217`

- Claim support exists in API (`claimStampReward`), but inspected UI does not expose a claim action.
  - `claimStampReward` exists in `src/api/endpoints/me/stamps.ts:48-50`
  - `claiming` state exists but is unused in `src/screens/StampBookScreen.tsx:198`

Result:
- Stamp Book is partly real, partly fallback fiction, and hides reward-claim mechanics even though the endpoint exists.

### Sets

- SetCollectionScreen is wired to `/me/prep-item-sets`, not `/api/v2/sets`.
  - real route used by screen: `src/api/endpoints/me/prep-item-sets/index.ts:44-145`
  - unused V2 route: `src/api/endpoints/sets/index.ts:4-14`

- The screen falls back to mock churro data on failure:
  - list fallback: `src/screens/SetCollectionScreen.tsx:371-381`
  - detail fallback: `src/screens/SetCollectionScreen.tsx:384-421`
  - mock payload source: `src/data/mockChurroSet.ts`

Result:
- Sets are more advanced than stamps, but they still have a mock rescue path that can make the subsystem look alive when the backend is unavailable.

### Achievements and collections overlap

- Ride achievements are a separate backend-driven system from player rides:
  - `GET /player-rides/achievements` via `src/api/endpoints/player-rides/index.ts:83-86`
  - rendered in `src/screens/RideTracker/RideAchievementsScreen.tsx:37-83`

- Ride collections are another separate backend system:
  - `GET /ride-collections` via `src/api/endpoints/rides/collections.ts:24-31`
  - rendered in `src/screens/RideTracker/RideCollectionsScreen.tsx:74-128`

- Stamps duplicate some of the same motivation loops with different terminology and reward structures.
  - examples in local fallback data include park visits, friends, sets, streaks, and total coins/xp (`src/screens/StampBookScreen.tsx:95-120`)

Overlap summary:
- `RideAchievementsScreen`: ride history accomplishments
- `RideCollectionsScreen`: ride group completion
- `StampBookScreen`: broader achievement-book framing, partly overlapping with rides/social/sets
- `SetCollectionScreen`: prep-item collection completion
- `CoinShelfScreen`: ride coin progression framed as collection/progression

This is too many parallel "meta progression" surfaces for one app state model. The backend contracts themselves are already split, and the UI multiplies that split.

## 4. Screens/components that are prototype, mock-backed, unreachable, dead, or misleadingly polished

### Prototype or mock-backed

- `src/screens/CoinShelfScreen.tsx`
  - polished, but progression is synthesized from tasks and fake level-up timing (`:39-69`, `:82-125`, `:543-557`)
  - real V2 ride-coin endpoints exist but are unused

- `src/screens/StampBookScreen.tsx`
  - live API path exists, but there is a full fallback mock stamp catalog (`:93-121`, `:193-217`)
  - reward claim endpoint exists but no visible claim flow

- `src/screens/SetCollectionScreen.tsx`
  - real `/me/prep-item-sets` path exists, but the screen falls back to `MOCK_CHURRO_SET_LIST` and `MOCK_CHURRO_SET_DETAIL` (`:371-421`)

- `src/screens/MembershipScreen.tsx`
  - polished paywall, but backed by `adapty-stub` in this codebase (`src/helpers/adapty-stub.ts:14-23`)
  - purchase-capable appearance exceeds current implementation reality

- `src/components/WatchAd.tsx`
  - explicit fake rewarded-ad replacement (`:6-7`, `:12-25`, `:48-50`)
  - used as if real in multiple doubling flows

- `src/screens/SharkCustomizationScreen.tsx`
  - fully mock cosmetics (`:33-165`)
  - fake load via `setTimeout` (`:392-399`)
  - TODO equip/unequip APIs only (`:414-449`)

### Unreachable or dead

- `src/components/TaskListModal.tsx`
  - Explore explicitly says it was removed: `src/screens/ExploreScreen.tsx:20`, `:600`
  - component still exists, with old task list UI and no current mount path

- `src/components/CommunityCenterModal.tsx`
  - Explore keeps `showCommunityCenterModal` state (`src/screens/ExploreScreen.tsx:128-131`) and still mounts the modal (`src/screens/ExploreScreen.tsx:873-879`)
  - but actual interaction path navigates straight to `CommunityCenter` full screen (`src/screens/ExploreScreen.tsx:193-219`)
  - there is no inspected path that sets `showCommunityCenterModal` true

- `src/components/Thread.tsx`
  - legacy thread card pointing to routed `Thread` screen, not used by current `SocialScreen`

- `src/components/CreateReply.tsx`
  - legacy reply composer only used by legacy `ThreadScreen`

- `src/screens/ThreadScreen.tsx`
  - still reachable by explicit navigation and by `CreateThreadModal` (`src/components/CreateThreadModal.tsx:239-245`)
  - but functionally superseded for browsing by `SocialScreen` bottom sheet
  - should be treated as legacy overlap

- `src/screens/MiniGameTesterScreen.tsx`
  - dev-only screen in `src/Root.tsx:280`
  - useful internally, but not product surface

### Misleadingly polished but not production-real

- `src/components/RedeemRedeemableModal.tsx`
  - looks like a full ticket/minigame/reward stack
  - but still includes server-error fallbacks that proceed anyway (`:179-195`) and local reward synthesis if completion API fails (`:285-296`)
  - ad-doubling visuals are fake because `WatchAd` is fake (`:403-423`)

- `src/screens/WatchScreen.tsx` + `src/components/SocialPost.tsx`
  - rewarded-content presentation is polished
  - real reward comes from content view endpoint, not ads, which is fine, but the rest of the app’s monetization language creates confusion

## 5. Exact top 5 areas to delete, merge, or quarantine

### 1. Merge the duplicate thread detail stack

Action: merge or delete

Files:
- `src/screens/ThreadScreen.tsx`
- `src/components/CreateReply.tsx`
- `src/components/Thread.tsx`
- `src/screens/SocialScreen.tsx`

Why:
- Two different thread detail implementations are maintained against the same `/threads` and `/comments` backend.
- `SocialScreen` bottom sheet already covers the live path.
- `CreateReply` has a one-shot submission bug and is coupled to the older screen.

Recommendation:
- Keep `SocialScreen` thread sheet.
- Quarantine then remove the legacy routed `ThreadScreen` stack after updating `CreateThreadModal` to reopen the new sheet or navigate back into Social with selected thread.

### 2. Quarantine the fake monetization layer

Action: quarantine

Files:
- `src/helpers/adapty-stub.ts`
- `src/components/WatchAd.tsx`
- `src/screens/MembershipScreen.tsx`
- `src/components/RedeemRedeemableModal.tsx`
- `src/components/RedeemCurrentRedeemableModel.tsx`
- `src/components/RedeemKeyModal.tsx`

Why:
- Subscription and rewarded-ad UX are presented as real product systems while using explicit stubs/fakes in this branch.
- That makes debugging and product understanding worse than if the feature were clearly disabled.

Recommendation:
- Gate the entire layer behind an explicit `MONETIZATION_STUB_MODE` flag and label it in UI, or remove the doubling buttons from non-native/test builds.

### 3. Merge the duplicate V2 vs non-V2 progression endpoints

Action: merge

Files:
- `src/api/endpoints/me/ride-coins/index.ts`
- `src/api/endpoints/me/ride-coins/level-up.ts`
- `src/api/endpoints/me/ride-parts.ts`
- `src/api/endpoints/me/ride-parts/index.ts`
- `src/api/endpoints/me/stamps.ts`
- `src/api/endpoints/stamps/index.ts`
- `src/api/endpoints/me/prep-item-sets/index.ts`
- `src/api/endpoints/sets/index.ts`

Why:
- The codebase contains two API families for the same conceptual systems.
- Screens are picking one ad hoc; some newer endpoints are unused while older ones remain live.

Recommendation:
- Pick one canonical namespace per subsystem.
- Move the non-canonical family into `src/api/legacy/` or remove it after migrating screens.

### 4. Quarantine Coin Shelf until it uses the real backend

Action: quarantine or rewrite

Files:
- `src/screens/CoinShelfScreen.tsx`
- `src/components/CoinLevelingModal.tsx`
- `src/components/CoinUpgradeDemo.tsx`

Why:
- The presentation is very polished, but the state model is invented locally from park tasks, not from `/api/v2/me/ride-coins`.
- This is the most misleading progression surface in the repo.

Recommendation:
- Either rewrite it to use `GET /api/v2/me/ride-coins` and `POST /api/v2/me/ride-coins/:id/level-up`, or hide it from production navigation until then.

### 5. Delete or isolate dead/unreachable polished surfaces

Action: delete or move to `legacy/`

Files:
- `src/components/TaskListModal.tsx`
- `src/components/CommunityCenterModal.tsx`
- `src/screens/SharkCustomizationScreen.tsx`

Why:
- `TaskListModal` is explicitly replaced.
- `CommunityCenterModal` appears mounted but unreachable in actual Explore behavior.
- `SharkCustomizationScreen` is pure mock/prototype and should not be confused with real cosmetics endpoints that already exist in `src/api/endpoints/cosmetics/`.

Recommendation:
- Remove dead code where no route or state path still uses it.
- Move the rest to a clear prototype folder if it is intentionally retained.

## Bottom line

The biggest pattern in this codebase section is not “missing backend.” It is duplicated truth:
- duplicate thread UIs
- duplicate API families
- duplicate progression systems
- duplicate monetization realities (real-looking UI, stubbed behavior)

The codebase will get easier to ship once those duplicates are collapsed, even before new features are added.
