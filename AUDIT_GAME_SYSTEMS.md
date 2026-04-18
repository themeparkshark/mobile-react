# Theme Park Shark Game Systems Audit

## Executive Summary Of Current App Identity

Theme Park Shark is currently a multi-loop theme park companion game built around location, collection, park completion, and social identity.

At its core, the app does four real things today:

1. It turns a real theme park visit into a map-based collection/completion game.
2. It gives players a park-specific progression layer through tasks, secret tasks, park coins, tickets, and completion tracking.
3. It adds social identity through profiles, friends, teams, threads/comments/reactions, pin trading, and shared ride stats.
4. It is evolving toward a broader meta-game with ride tracking, prep-item collections, ride coin leveling, stamps, team gym control, community gifting, and an at-home collection mode.

The app does not feel like a single cleanly prioritized product yet. It feels like a live location game with one mature loop, plus several newer V2 systems at different levels of readiness:

- Mature/live-feeling: park map collection, tasks, core profile/store/social, leaderboards, ride logging basics, team selection, gym battle shell, community center shell.
- Emerging but uneven: prep items/sets, ride tracker auto-detection, ride collections/wrapped, ride parts/energy/tickets economy.
- Mostly prototype or partially simulated: coin leveling, cosmetics customization, some V2 endpoints, ads/subscription flows in Expo/stub mode, Shark Park idle game.

The dominant current identity is:

- "Pokemon GO for theme parks" when in-park.
- "Light social collector/meta-profile app" outside the park.
- "Ride journal" as a secondary but increasingly important pillar.

## Major System Inventory

### 1. App Shell And Navigation

- Root app bootstraps auth, location, currencies, theme, notifications, forum reactions, daily gifts, tutorial, and a global ride detection overlay.
- Primary navigation is a stack navigator.
- Core bottom-nav tabs are `News`, `Leaderboard`, `Explore`, `Social`, and `Profile`.
- Explore is the center of the product.

### 2. Identity And Session

- Apple sign-in based auth.
- Guest/non-auth flows exist but many systems assume an authenticated player.
- Player object is the main state anchor and includes both older economy fields (`coins`, `park_coins`) and newer V2 fields (`tickets`, `energy`, `ride_parts`, `player_level`, `active_cosmetics`).

### 3. Location And Park Context

- Foreground location permission is requested globally.
- App continuously tracks position and heading.
- Park context is resolved from the backend using the current coordinates.
- There is explicit travel mode/home mode when you are not at a park.
- Dev joystick mode exists for simulated walking.

### 4. In-Park Explore Loop

- When the player is at a park, Explore becomes a live map with redeemables.
- Supported park map object types:
  - tasks
  - secret tasks
  - coins
  - keys
  - pins
  - items
  - redeemables/theme currency
  - vaults
  - gym
  - swords
  - community center
- Active nearby redeemable is surfaced through a bottom redeem CTA rather than requiring tapping every marker.

### 5. Home/Travel Explore Loop

- When the player is not in a park, Explore switches to `HomeExplore`.
- HomeExplore loads prep items around the user location.
- Prep items are collectible map spawns with rarity, timers, and rewards.
- This is the main out-of-park gameplay loop today.

### 6. Tasks And Secret Tasks

- Tasks and secret tasks are park-specific map objectives.
- Completing them awards coins/xp/energy/ride parts.
- Secret tasks are treated as a sibling system, not merely a hidden flag on tasks.
- Tasks can be failed and locally suppressed for the rest of the day.

### 7. Task Mini-Game Layer

- Task attempts consume tickets before the game starts.
- A wheel randomly selects one of four mini-games:
  - tap challenge
  - timing
  - memory match
  - trivia
- Winning completes the task and pays rewards.
- Losing marks the task failed and consumes the ticket cost.

### 8. Prep Items And Set Collections

- Prep items are collectible world spawns in home mode.
- They reward energy, tickets, and experience.
- They also feed collection sets with progress and completion rewards.
- Current themed implementation is food-collection heavy, especially churros and pretzel-style variants.

### 9. Park Progress / Park Profile

- Each park tracks:
  - tasks completed
  - secret tasks completed
  - park coins earned
  - completion percentage
  - archived tasks
- Park screen is a progress dashboard for a player at a specific park.

### 10. Ride Tracker

- Separate ride logging/journaling pillar.
- Includes:
  - manual ride logging
  - auto-detection based on GPS dwell time
  - ride history
  - ride detail pages
  - ride stats
  - ride achievements
  - ride collections
  - wishlist
  - wrapped summaries
  - community ride stats

### 11. Team And Gym Battle

- Players join one of three teams: mouse, globe, shark.
- Gyms are park-level control points.
- Teams can:
  - check in
  - place coins
  - defend
  - attack using swords
- Sword pickups spawn on the park map.

### 12. Community Center

- Park-level community gifting building.
- Players can leave gifts for other players.
- Claiming and giving are cooldown-based.
- Giving costs park coins and returns tickets through social exchange.

### 13. Social / Community

- Social feed with threads, comments, reactions, replies, reports.
- Feed modes:
  - public
  - team
  - friends
- Friends system with requests, accept, remove, suggestions, search.
- Player profiles support gifting mascot items, complimenting, friending, and reporting.
- Pin trading exists as a separate social collection/trade layer.
- Watch tab offers rewarded video content.

### 14. Economy / Monetization / Store

- Store sells cosmetic/equipment inventory items tied to player card customization.
- VIP membership exists and affects reward doubling in several places.
- Watch-ad doubling exists in UI, but Expo/test stubs replace real ads.

### 15. Meta Progression / Achievements / Collection Surfaces

- Experience and level.
- Stamps.
- Prep item sets.
- Ride achievements.
- Ride collections.
- Park completion.
- Ride coin leveling concept.
- Cosmetics concept.
- Shark Park idle progression.

### 16. Shark Park Idle Game

- Full local idle-game subsystem with cash, rides, managers, profit/speed upgrades, prestige, star points, milestones, and offline earnings.
- Mechanically complete as a self-contained game.
- Not obviously connected to the main live economy or player backend.

## Core Loops Currently Implemented

### Home Loop

Current loop:

1. Open Explore while not at a park.
2. App loads nearby prep items for your current location.
3. Walk close enough to a prep item.
4. Open prep-item redeem modal.
5. Collect the item for energy, tickets, and experience.
6. Progress one or more prep-item sets.
7. Use quick access to check collections, stamps, or Shark Park.

What makes it work:

- Real location
- Spawn timers
- rarity
- streak data
- collection set progress

What is missing:

- deeper strategy
- clearer long-term reason to care about energy
- stronger connection from prep-item collecting into the rest of the game

### Park Loop

Current loop:

1. Enter a supported park and get park context.
2. Explore map spawns for tasks, coins, keys, items, vaults, pins, redeemables, swords.
3. Walk into range of a task or secret task.
4. Spend tickets to attempt a mini-game.
5. Win to receive coins, xp, energy, and ride parts.
6. Increase park completion and park coin totals.
7. Use park coins in leaderboards, gym contribution, and community center gifting.
8. Visit Park screen to review task completion and trophy shelf.

What makes it work:

- location
- visible map spawns
- park-specific currencies and stats
- map-to-dashboard continuity

What weakens it:

- too many reward types introduced without one clear priority
- task progression and ride coin progression are not yet fully unified in production

### Social Loop

Current loop:

1. Add friends or browse suggestions.
2. Join a team.
3. Read or create threads.
4. Comment/react/reply.
5. Visit player profiles.
6. Trade pins.
7. Watch rewarded content.
8. Compare standings and ride stats.

This loop is real and fairly broad, but it is not yet tightly tied to the exploration and collection loops. Social mostly observes or decorates progression rather than driving it.

### Progression Loop

Current progression loop appears to be:

1. Visit parks and/or collect prep items.
2. Earn xp, tickets, coins, park coins, energy, and ride parts.
3. Complete park tasks and item sets.
4. Improve player profile, standings, and ride history.
5. Unlock more status surfaces: stamps, collections, achievements, ride tracker stats, team affiliation.

This is broad, but fragmented. There is no single clearly dominant long-term spend loop besides "keep completing more things."

## Data / Economy Map

## Currencies And Resources

### 1. Shark Coins / Coins

Source:

- player base currency on profile/store
- coins from tasks
- watch/video rewards
- redeemables
- various rewards

Uses:

- store purchases
- community center gifting cost appears to use player coins/park coins logic depending endpoint/UI context
- general premium-feeling reward surface

Notes:

- The codebase still mixes older `coins` and newer reward surfaces.

### 2. Park Coins

Source:

- task completion at specific parks
- park coin totals tracked per park

Uses:

- park leaderboard standings
- gym battle coin placement and contribution identity
- park completion prestige
- community center gifting cost messaging

Notes:

- Park coins are one of the most coherent currencies in the current product.

### 3. Tickets

Source:

- prep item collection
- community center
- set completions
- potentially other V2 rewards

Uses:

- consumed before task mini-games start

Behavior:

- tickets are a gating currency for task attempts
- higher-xp tasks can cost more tickets
- ticket spend occurs even if the player loses the mini-game

This is one of the clearest actual sinks in the app.

### 4. Energy

Source:

- prep items
- task rewards
- set rewards
- stamps and V2 rewards
- regeneration via prep-item API response/player stats

Uses:

- intended for ride coin leveling
- displayed prominently in Explore

Notes:

- Energy has strong UI presence, but limited fully wired sinks today.
- It is more "future-central" than currently central.

### 5. Experience / XP

Source:

- tasks
- prep items
- ride logging
- sets
- stamps

Uses:

- player level and leaderboard
- ride coin gating concept
- status progression

This is a real cross-system meta progression currency.

### 6. Ride Parts

Source:

- task rewards
- stamps
- sets
- intended mini-game and passive sources

Uses:

- ride coin leveling

Notes:

- Important in the V2 design.
- Live acquisition is more real than live spending.

### 7. Keys

Source:

- map spawns

Uses:

- vault opening

This is a classic exploration resource.

### 8. Redeemable Theme Currency

Source:

- redeemable pickups on the park map

Uses:

- theme currency accumulation via theme definitions

Notes:

- This feels older and more theme/CMS-driven than the newer V2 resource model.

### 9. Swords

Source:

- sword spawns on the map

Uses:

- gym attack actions

Notes:

- Swords are narrow but very clear in purpose.

### 10. Shark Park Cash And Star Points

Source:

- local idle game only

Uses:

- buying rides, upgrades, prestige upgrades in Shark Park

Notes:

- currently separate from the live app economy.

## Collections And Progress Objects

### Prep Items

- collectible variants with rarity
- location/time gated
- now framed as collectible items/sets rather than loadout strategy

### Prep Item Sets

- themed set containers
- track collected variants and quantity
- have completion rewards
- currently most visibly implemented around churro-style collections

### Park Completion

- per park:
  - completed tasks
  - completed secret tasks
  - archived task completion
  - park coin count
  - completion rate

### Ride History

- each logged ride stores:
  - ride id
  - rating
  - reaction
  - wait time
  - note
  - photo url
  - ride timestamp
  - weather

### Ride Collections

- ride-themed grouped collections with xp and coin rewards

### Ride Wishlist

- desired rides, used as a filter in history and on detail pages

### Stamps

- achievement book with categories/rarity/progress/reward claiming

### Ride Coins

- conceptual levelable park/ride coin objects
- derived visually from task coins today in the shelf screen

### Cosmetics

- shark skins
- frames
- badges
- trails

### Inventory

- equippable profile card items:
  - background
  - body
  - face
  - hand
  - head
  - neck
  - pin
  - skin

## Ride Progression

The intended ride progression stack appears to be:

1. Complete a ride/task repeatedly.
2. Earn that ride's coin and/or times-completed count.
3. Gather ride parts and energy.
4. Level the ride coin.
5. Unlock visual tiers/perks/boss-tier concepts.

In current implementation, this is only partially real:

- ride/task completion is real
- ride parts are real
- energy is real
- coin shelf presentation is real
- actual coin leveling is still simulated in the UI

## Teams

Three teams:

- Team Mouse
- Team Globe
- Team Shark

Team impacts:

- social feed mode
- gym battle affiliation
- team identity messaging
- likely future competitive meta

## Cosmetics

Two cosmetic tracks currently coexist:

1. Real inventory-driven profile card gear from the legacy store/inventory system.
2. New cosmetic categories (`shark_skin`, `frame`, `badge`, `trail`) in player types and V2 endpoints.

These are not yet one unified customization system.

## Social Systems Map

### Friends

- browse your friend list
- search all players
- see suggestions
- send requests
- accept pending requests
- unfriend

### Player Interaction

- visit player profile
- send friend request
- accept friend request
- gift mascot-linked items
- compliment player
- report player

### Threads / Feed

- create thread
- attach media
- view pinned threads
- sort by hot/new/friends
- team-only feed mode if player has a team
- comment/reply/reaction/report/delete

### Reactions

- reaction types are fetched globally
- threads and comments both use reaction systems

### Pin Trading

- dedicated screen backed by pin swap endpoints
- board-like browsing and accepting/holding swaps

### Watch

- YouTube/social post feed
- rewarded viewing proposition
- watch state tracked

### Community Center

- asynchronous social gifting at the park level
- closest thing in the app to ambient anonymous cooperation

## Ride Tracking / Detection Map

### Logging

- manual ride logging is fully present
- supports park selection, ride selection, rating, reaction, note, wait time

### Auto Detection

Current detection model:

- load all rides with coordinates
- use foreground and background location tracking
- detect entry/exit from ride zones
- use dwell time thresholds
- compare against ride duration and live wait times when available
- assign confidence
- queue all detections
- require explicit player confirmation before logging

Foreground behavior:

- popup asks "Did you just ride X?"
- confirm opens RideLog prefilled for that ride

Background behavior:

- detections accumulate in storage
- returning to the app can open batch confirm

Important strengths:

- explicit non-auto-log design
- queue persistence
- confidence filtering
- re-ride detection and cooldown logic

Important limitations:

- heavily GPS/dwell dependent
- ride accuracy depends on ride coordinate quality and wait-time name matching
- onboarding screen exists but is not obviously wired into first-time entry

## Mini-Game System Map

### Current Mini-Games

- Tap challenge: rapid whack-a-target
- Timing challenge: hit moving targets in a zone
- Memory match: find pairs under time pressure
- Trivia: local question bank, all-correct fail-state

### Current Use

- integrated into task completion flow via a spin wheel
- also available in a dev tester screen

### Reward Logic

- mini-game returns a multiplier
- task completion still calls backend completion endpoints for actual rewards
- post-win modal highlights ride parts and energy

### Important Observation

The mini-games are meaningfully integrated into the park loop. They are not just toy demos. The weak point is not integration, it is economy clarity around what winning should feel like versus why tickets are the right gate.

## Collections / Completion Systems Map

There are six overlapping completion surfaces:

1. Park completion
2. Prep item sets
3. Stamps
4. Ride achievements
5. Ride collections
6. Ride wishlist/history completionism

This creates strong completionist energy, but also fragments player focus because multiple systems are asking for similar behavior with different framing and reward languages.

## What Is Production-Real Vs Mock Vs Placeholder Vs Partially Wired

## Production-Real Or Close To Real

- Auth and player refresh
- Explore map and location flow
- park detection
- park map redeemables
- task completion endpoints
- secret task completion endpoints
- ticket spending endpoint
- prep item collection endpoint
- store browsing and inventory equipping
- social threads/comments/reactions
- friends and friend requests
- park leaderboards and xp leaderboard
- team join endpoint and gym battle endpoints
- community center endpoint shell
- ride logging/history/detail/stats/wishlist/community stats
- ride auto-detection service and overlay architecture

## Partially Wired

- Prep item sets:
  - real `/me/prep-item-sets` path exists
  - UI falls back to mock churro data when API fails
- Stamps:
  - real `/me/stamps` path exists
  - screen still contains large placeholder/mock stamp catalog fallback
- Ride collections:
  - endpoint exists and screen works
  - interaction depth is shallow; detail is an alert, not a dedicated progression surface
- Ride wrapped:
  - data path exists and screen works
  - feels like a feature slice rather than a deeply integrated meta loop
- Gym battle:
  - core endpoints and battle screens exist
  - still feels like a strong shell around a narrower live loop
- Community center:
  - real endpoint and real claim/give interactions
  - still isolated from the rest of the social/game economy

## Mock / Simulated / Placeholder

- Coin leveling in `CoinShelfScreen`:
  - data is synthesized from tasks and secret tasks
  - actual level-up API call is TODO/simulated
- Ride coin leveling modal:
  - simulates success locally
- Shark customization screen:
  - built on mock cosmetics
  - not obviously navigable from the live product
  - equip/unequip API TODOs remain
- Set collection:
  - explicit mock churro fallback path
- Stamp book:
  - explicit placeholder art and fallback/mock content
- Watch ads:
  - Expo/test mode simulates ad watching with countdown
- Membership in Expo/stub environment:
  - adapty stub returns no real products
  - production concept exists, but test/runtime path is incomplete
- Shark Park:
  - mechanically complete, but local-only and disconnected from backend player progression

## Important Backend / Data Split Signals

- There are parallel endpoint styles:
  - older `client` routes like `/me/stamps`, `/me/prep-item-sets`
  - newer `/api/v2/...` routes for stamps/sets/cosmetics/ride-coins/ride-parts
- Screens do not consistently use the same generation of API.
- This is a major sign of migration-in-progress rather than a settled product model.

## Most Important Product Inconsistencies

1. The app has multiple competing "main progression" stories.
   - Park coins, xp, tickets, energy, ride parts, stamps, sets, ride tracker, team control, and Shark Park all want to matter.

2. V2 progression is more conceptually coherent than the currently shipped UI wiring.
   - Energy + ride parts + ride coin leveling is a clear arc on paper, but the live app still relies on partial implementations and simulated screens.

3. Profile customization exists in two different architectures.
   - Legacy inventory equipment is live.
   - New cosmetics categories exist separately and are not yet the real player-facing customization loop.

4. Home-mode prep items and in-park tasks feel like separate games.
   - They share some resources, but the player motivation chain is still weak.

5. Shark Park is a full game that barely connects to the main game.
   - It adds surface area and cognitive load without obvious benefit to the core live product.

6. Stamps, sets, ride collections, and ride achievements overlap heavily.
   - All are valid, but the app has not yet decided which one is the headline completion layer.

7. Ride tracker is one of the strongest feature pillars, but it is not framed as centrally as the code investment suggests.
   - It is buried behind profile and secondary navigation rather than being treated as a top-level pillar.

8. Community center and gym battle are both park-social structures, but they are not presented as one coherent park metagame.

9. Trivia exists in two forms.
   - Real task-trivia endpoints exist.
   - The mini-game component still uses a local question pool rather than a clearly backend-driven session flow.

10. News/watch/social/store all coexist in the shell, but only some of them materially affect the game loop.
   - That makes the product feel broader than it feels deep.

## Top 10 Highest-Leverage Opportunities

These are grounded improvements, not fantasy additions.

1. Decide and enforce one primary meta progression spine.
   - Right now the best candidate is `xp + tickets + energy + ride parts + ride coin progression`.

2. Finish real ride coin leveling and replace the synthetic `CoinShelfScreen` model.
   - This would turn several currently loose currencies into one meaningful loop.

3. Unify legacy inventory customization and V2 cosmetics.
   - The player should not effectively have two separate appearance systems.

4. Make home-mode prep item collecting feed a clearly visible long-term goal.
   - Right now it mostly feeds sets and resources, but the motivational bridge is weak.

5. Consolidate completion surfaces.
   - Pick one headline achievement/completion layer and demote the others into supporting roles.

6. Treat ride tracker as a first-class product pillar.
   - It already has enough real implementation depth to justify clearer surfacing.

7. Normalize endpoint generations.
   - The current mix of legacy and V2 endpoints creates product ambiguity and raises integration risk.

8. Resolve monetization stubs and environment gaps.
   - Ads, membership, and reward-doubling logic should have one clearly reliable runtime story.

9. Connect community center and gym battle into one park meta narrative.
   - Today they are both good ideas living as neighbors rather than collaborators.

10. Either connect Shark Park to the main progression or quarantine it more explicitly as a side mode.
   - Its current in-between status increases fragmentation.

## What The Current Dominant Meta Progression Appears To Be

The dominant meta progression currently appears to be:

1. Visit parks and complete tasks.
2. Earn xp and park coins.
3. Use tickets to attempt more tasks.
4. Accumulate energy and ride parts from task/prep-item rewards.
5. Build status through profile level, park completion, social visibility, and ride history.

The intended next-stage meta progression appears to be:

1. Do the above.
2. Spend energy + ride parts to level ride coins.
3. Use stamps, set completions, cosmetics, and ride collections as long-tail motivation.

The problem is that the intended next-stage loop is only partially made real, so the current dominant loop remains "complete tasks and collect things because that is what the app has available," rather than "optimize a clear long-term build."

## What Feels Unified Vs Fragmented

## Unified

- Explore map + park context + tasks + redeemables
- park completion + park leaderboard
- social feed + player profiles + friends
- ride tracker feature family internally
- team selection + gym endpoints + map sword spawns

## Fragmented

- home prep-item game versus in-park task game
- legacy inventory/store versus new cosmetics
- stamps versus sets versus ride collections versus ride achievements
- ride parts/energy economy versus actual sinks
- Shark Park versus the rest of the app
- community center versus gym battle as separate park meta systems
- old API model versus V2 API model

## Bottom-Line Product Read

Theme Park Shark already contains a real, interesting product:

- a location-based theme park collection/completion game
- with meaningful social identity
- and a surprisingly strong ride journal/tracker pillar

What holds it back today is not lack of features. It is lack of hierarchy.

The codebase suggests a product moving toward a stronger unified meta based on:

- park tasks
- ride tracking
- tickets
- energy
- ride parts
- ride coin progression
- collection/status rewards

That direction is credible. The current app just has not fully collapsed its older systems, newer systems, and side-mode experiments into one dominant player story yet.
