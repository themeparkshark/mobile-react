# Pass 4: Survive / Die / Core Read

This read is grounded in the current codebase, especially the app shell in `src/Root.tsx`, the dual-mode explore orchestrator in `src/screens/ExploreScreen.tsx`, home-mode prep loop in `src/screens/ExploreScreen/HomeExplore.tsx`, ride tracker stack in `src/screens/RideTracker/*`, social stack in `src/screens/SocialScreen.tsx`, park progression in `src/screens/ParkScreen.tsx`, and the prior audit artifacts in `AUDIT_GAME_SYSTEMS.md`, `AUDIT_GAME_SYSTEMS_PASS2.md`, and `PASS3_NOTES.md`.

## 1. Core Systems To Protect

### Explore as the primary product shell

`ExploreScreen` is the only place where the app feels like one product instead of a menu of ideas. It already owns the live park loop, the home/travel loop switch, ride detection mounting, community center entry, gym presence, and the bottom redeem flow. If the app has a center of gravity today, this is it.

Protect:

- `src/screens/ExploreScreen.tsx` as the main orchestration layer
- `src/context/LocationProvider.tsx` park resolution and live GPS updates
- proximity-based redemption via `/me/current-redeemables` and `/me/current-redeemable`
- the “park mode vs home mode” branch, because it gives the app a reason to exist both inside and outside the park

### The in-park task / redemption / completion loop

This is still the most product-defining system in the codebase. It is location-native, park-specific, progress-bearing, and visibly connected to map exploration. Tasks, secret tasks, map spawns, park coins, and park completion already form a coherent loop even with rough edges.

Protect:

- task and secret-task surfaces
- park map spawns and proximity redemption
- park progress dashboard in `src/screens/ParkScreen.tsx`
- park-specific completion state and trophy framing

### Ride Tracker as the strongest second pillar

Ride Tracker is the cleanest “newer” system in the app. Unlike several V2/meta systems, it is not mock-backed, not hidden behind fallback fiction, and not obviously fake in UX. It has a credible data model, real screens, real stats, real history, real achievements, and a meaningful auto-detection architecture.

Protect:

- `src/hooks/useRideDetection.ts`
- `src/services/RideDetectionService.ts`
- `src/components/RideTracker/RideDetectionOverlay.tsx`
- `src/screens/RideTracker/RideTrackerScreen.tsx` and its downstream detail/history/stats screens

### Friends + lightweight social identity

The social feed itself is not the strongest system, but the broader social identity layer matters: profiles, friends, player cards, reactions, comments, and player-to-player recognition. The app needs some social graph and identity expression. Friends is more production-real than most of the surrounding social ambition.

Protect:

- profiles and player card identity
- friends list, requests, search, and suggestions
- thread/comments/reactions at a minimal level

## 2. Systems That Should Become Core But Aren’t Ready Yet

### Ride Tracker as a true co-equal progression pillar

Ride Tracker is already real, but it is not yet integrated enough to be “core” in the product architecture. Right now it behaves like a well-built sidecar. It should become a primary progression pillar alongside park progression, but that requires stronger integration with identity, rewards, and the main app shell.

What is missing:

- clearer link from ride logging to player identity and home screen status
- stronger connection from ride history into park progress and social status
- less dependence on `ExploreScreen` being mounted for detection

### Home-mode prep loop

Prep items are currently the only credible out-of-park loop, so they matter. But the loop is still too thin and too food-set specific. It generates tickets/energy/xp, yet those rewards still do not ladder into one unmistakable long-term reason to care.

What is missing:

- a cleaner why behind collecting prep items beyond “numbers go up”
- less reliance on set-collection framing as the only emotional payoff
- tighter relationship between prep items and the main progression spine

### Community Center, if repositioned as the main cooperative social mechanic

Community Center has the right shape: park-local, social, recurring, and meaningfully tied to real visits. But right now it is more a feature than a spine. The full-screen experience exists, yet the system is still muddy in economy language and entry flow.

What is missing:

- one clear player promise
- economy cleanup around coins vs park coins
- a clear reason this should matter weekly, not just once

### Team / gym control, only if it becomes much simpler

There is real leverage in a park-specific team rivalry layer. But the current gym + swords + team setup is more complexity than impact. It should only become core if reduced to something users can understand in one sentence.

What is missing:

- simpler rules
- clearer rewards
- a better connection to visible park status and social bragging rights

## 3. Systems To Quarantine

These are systems worth preserving in the codebase for now, but they should stop shaping the main product narrative until they are either integrated properly or retired.

### Coin Shelf / ride coin progression

This is the clearest quarantine candidate. The app has real V2 ride-coin endpoints, but `src/screens/CoinShelfScreen.tsx` ignores them and synthesizes progression from park tasks and local formulas. It is polished enough to mislead product decision-making, which is dangerous.

Quarantine because:

- it looks live but is largely simulated
- it duplicates other progression surfaces
- it is not trustworthy enough to anchor strategy

### Stamps

Stamp Book is not useless, but it is another meta-progression surface in a codebase already overloaded with them. It mixes live API data with a full fallback mock catalog, and the reward-claim path is not meaningfully surfaced.

Quarantine because:

- it duplicates achievements/collections/set logic
- it can appear healthy even when backend support is weak
- it is not important enough to keep in the main product story

### Prep-item sets as a standalone destination

Sets are serving the home loop, which is good. But `SetCollectionScreen` as its own major destination is too much product weight for what is currently a supporting collection mechanic.

Quarantine because:

- sets are useful as scaffolding for the prep loop
- sets are not strong enough to be a major top-level promise
- the screen still has fallback mock behavior

### Team gym battle in its current form

The raw idea has upside, but the current system is still too sidecar and too rules-heavy. Keep it out of the main product pitch until simplified.

### Watch/content reward and monetization-looking doubles

The app should not treat fake rewarded-ad UX as a core product system. `src/components/WatchAd.tsx` is explicitly a countdown stub, yet reward-doubling UI appears throughout the app as if it were real.

Quarantine because:

- it distorts product truth
- it creates fake leverage in reward balancing
- it should not influence future architecture decisions

## 4. Systems To Delete Or Sunset

### Shark Park as a product pillar

`src/screens/SharkParkScreen.tsx` and `src/helpers/idle-game.ts` are mechanically substantial but architecturally isolated. It has its own local persistence, its own ticket economy, and no meaningful sync to the main player backend. As a separate game, it is interesting. As part of this app’s core future, it is a distraction.

Delete or sunset it as a first-class destination. If anything survives, it should be mined for small mechanics, not preserved as a parallel game.

### Shark Customization V2 screen in its current form

`src/screens/SharkCustomizationScreen.tsx` is mock-backed, uses fake loading, and is not in navigation. This is prototype residue, not product reality.

Delete the screen or leave the V2 cosmetics backend dormant until there is a real integration path.

### Legacy thread-detail stack duplication

`ThreadScreen`, `Thread.tsx`, and `CreateReply.tsx` are legacy overlap now that `SocialScreen` owns an inline thread sheet and composer. Keeping both models alive increases surface area without adding product value.

Sunset:

- `src/screens/ThreadScreen.tsx`
- `src/components/Thread.tsx`
- `src/components/CreateReply.tsx`

### Dead or misleading modals and abandoned shells

Delete or hard-remove:

- `src/components/CommunityCenterModal.tsx` from the live Explore path
- `src/components/TaskListModal.tsx`
- unused ride-detection leftovers like `src/services/RideAutoDetect.ts` and `src/components/RideTracker/RideDetectedPopup.tsx`

### Fake reward-doubling UX if it cannot be made real soon

If rewarded ads are not becoming real in the near term, remove the doubling affordances from task/redeem flows. Fake monetization UX corrodes product clarity and makes the reward economy harder to reason about.

## 5. Best Candidate For The Single Main Progression Spine

The best candidate is:

**Park exploration -> task completion -> park completion -> ride logging as the permanent memory layer.**

Why this should be the spine:

- It is the most native-to-category loop in the code.
- It uses the app’s real moat: theme-park location context.
- It already connects map activity to persistent progress.
- Ride logging naturally extends the visit into lasting identity and memory, instead of feeling like a separate minigame economy.

What should not be the spine:

- stamps
- sets
- coin shelf
- Shark Park
- generic social posting

Those are satellites at best.

## 6. Best Candidate For The Single Main Social Spine

The best candidate is:

**Friends + park/ride identity + lightweight park-local interaction.**

That means:

- profiles and player cards
- friends and friend discovery
- shared ride stats / ride history identity
- park-local cooperative or competitive presence through Community Center or a simplified team layer

The main social spine should not be “be a general forum.” The thread feed is useful, but it should support identity and park culture, not define the app. A generic social feed is easy to build and hard to make defensible here.

## 7. Best Candidate For The Single Main Home Loop

The best current candidate is:

**Prep-item collection in home/travel mode, but re-scoped as visit preparation and continuity, not as a standalone collector game.**

Why:

- it is already the only real always-available exploration loop
- it uses the map and movement in a way that fits the app
- it already pays into tickets/energy/xp

What needs to change:

- make prep items feel like “gear up for the next park day” instead of “collect themed food because it exists”
- demote standalone set obsession
- tie rewards directly into the main visit progression spine

## 8. Best Candidate For The Single Main In-Park Loop

The answer is straightforward:

**Explore the park map, find live opportunities, complete tasks/secret tasks, log rides, and build park completion.**

That loop already exists in code and already feels like the app’s sharpest identity. The work is not inventing a better in-park loop. The work is reducing clutter around it and integrating ride logging into it more explicitly.

## 9. The Cleanest Future IA / navigation hierarchy for the app

The current stack in `src/Root.tsx` overpromotes too many parallel systems. The clean future IA should reduce the app to four top-level domains:

### 1. Explore

This remains the default home.

Inside it:

- In Park
  - live map
  - active redeemable/task state
  - community center / team interaction
  - queue times as supporting utility
- Away From Park
  - prep items
  - next-visit preparation

### 2. Progress

This should merge today’s fragmented meta surfaces.

Inside it:

- Ride Tracker
- Park Progress
- Collections

Collections here should absorb only the survivors:

- ride collections
- maybe achievements
- maybe prep sets if still justified

Do not keep Coin Shelf, Stamp Book, Sets, and Ride Achievements all competing as peer destinations.

### 3. Social

Inside it:

- feed
- friends
- park/player profiles
- pin trading only if still strategic

Social should become identity-centered, not forum-centered.

### 4. Profile / Shop

Inside it:

- player card and inventory
- stores
- membership
- settings
- notifications

Recommended principle:

Everything that is not one of these four domains should be a subflow, not a home-level destination.

## 10. The smallest set of product pillars that could make this a category-defining app

The app only needs three pillars.

### 1. The best in-park progression companion

Make the park visit itself better through live exploration, tasks, secrets, and completion.

### 2. The definitive ride memory and ride identity layer

Let users build a permanent, sharable record of what they have ridden, loved, rated, completed, and accomplished.

### 3. A social layer built around park people, not generic posting

Friends, local park presence, shared progress, lightweight rivalry/cooperation, and identity expression.

That is enough. Anything beyond those three pillars should justify itself very aggressively.

## 11. Biggest strategic mistakes to avoid from here

### Mistake 1: letting every half-real meta system survive as a top-level bet

This is the central failure mode in the current app. Stamps, sets, Coin Shelf, Shark Park, gyms, ride achievements, ride collections, membership, watch rewards, and customization are all competing for product significance.

### Mistake 2: treating polished UI as proof of product validity

Several systems look more mature than they are:

- Coin Shelf
- Membership
- WatchAd-powered reward doubles
- Shark customization
- fallback-backed stamps and sets

Future product decisions should be based on real system truth, not presentation polish.

### Mistake 3: keeping ride tracking as a sidecar forever

Ride Tracker is one of the strongest things in the app. If it remains separated from the main progression and social identity model, the app will keep feeling fragmented.

### Mistake 4: confusing “more loops” with “more retention”

The app does not need more loops. It needs one dominant loop, one secondary continuity loop, and one social identity layer.

### Mistake 5: building a generic social app attached to a theme park shell

The category-defining opportunity is not “Reddit for park fans.” It is a location-native park companion with memory and identity. Social should amplify that, not replace it.

### Mistake 6: keeping disconnected economies alive

Right now the app has too many currencies and too many reward stories. Any future system that introduces more parallel economy logic without strengthening the main visit/progress spine should be rejected.

## 12. One-paragraph product thesis for the app as it should become

Theme Park Shark should become the definitive theme park progression and ride-memory app: a product that turns a real park visit into a live map-based adventure, preserves that visit through automatic and manual ride logging, and gives players a lightweight social identity built around the parks they visit, the rides they conquer, and the progress they earn. Its future is not in accumulating more side systems; it is in fusing park exploration, ride history, and park-native social status into one clear, repeatable product loop that feels indispensable before, during, and after a park day.
