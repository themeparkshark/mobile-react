# TPS GPS game polish — September 29, 2026

The goal remains active. Dustin approved continuing local implementation and the
reviewed two-hour normal-access session for the existing nonstaff localqa player.
There is no pending sign-in approval. The old blocked notes were superseded and
archived outside the repo in work/implementation-notes-before-current-checkpoint.md.

## Product constraints

Preserve Profile -> scroll to parks -> tap a park -> all available coin shelves.
Keep the app's existing navigation, authored game loops, and recognizable art style.
Refine artwork, motion, readability, touch behavior, collection and meaningful queue
play. Do not resurrect the discarded structural/tycoon pass. New sharing features
must reflect confirmed activity; exporting a card never means it was sent.

## Implemented polish

- Seven additive illustrated assets: three shelf variants, three mystery coins in
  one atlas, six Profile stat icons, eight ride types, and six shark reactions.
  Original assets remain. Shelf artwork fits the existing five-coin rows and actual
  visible alpha bounds. The original persisted reaction codes remain unchanged.
- Profile stats have consistent filled cards, stable counters, accessibility and
  restrained press feedback. Park cards have themed image fallbacks. Existing
  collection header counts jump to the same normal/secret shelves in place.
- Ride logging retains the three original steps with themed park/ride selectors,
  clear full names, illustrated reaction choices, safe duplicate-save handling and
  note/wait validation. History paginates Today, deduplicates overlap, ignores late
  filter responses and retries a failed page without skipping it.
- Ride share cards use confirmed full ride totals, fit long names, handle unavailable
  sharing and duplicate export taps. Journal cards, wrapped summaries and detail
  views use matching shark reaction art.
- Map refresh runs at opportunity boundaries and once per minute while foregrounded.
  It resumes on return, coalesces requests and ignores another player/park's late
  responses. UTC database and ISO timestamps both work. Expired/future opportunities
  hide while refreshing; permanent uncollected ride coins remain. Nearby checks and
  daily gift overlays cannot interrupt another screen. Ride markers use compact
  tap areas so invisible neighboring marker bounds cannot steal taps.
- Queue arcade retains its existing illustrated choices. Ride names fit, missing
  reward connections distinguish nearby checks, sign-in and network problems, and
  local game time is not called verified queue time. Completed sessions settle into
  a finished header and recap; inactive carousel pages are hidden from accessibility.
- Paid challenges keep their opened opportunity snapshot when map data changes.
  Reward presentation waits for the game modal's native dismissal; coin/stamp
  navigation waits for reward dismissal. A won marker cannot erase its celebration.
  Fresh native QA exposed a second presentation issue: a GameKit native Modal was
  nested inside the ride flow's native Modal. Paid games now render inside the ride
  presentation; practice and queue games keep their own presentation. Native game
  layout is preserved and Android back still pauses/uses the existing exit flow.
  Reward effects stop on close/skip; reduced motion settles without ambient loops,
  counters show confirmed amounts and primary actions remain immediately available.
  GameKit countdowns, result stars, progress meters and confetti also respect reduced
  motion and cancel when closing; changing the preference never restarts a countdown.
  Ticket/crown/collection flourishes use existing illustrated assets.
- Upgrade taps coalesce, failures offer a themed retry, and a lost response is read
  back before another spend. Reduced-motion upgrades settle without charge/confetti.
- Forbidden Journey Memory Match uses original Enchanted Keepsakes artwork: eight
  illustrated faces plus two extra faces, authored from the existing blue/gold/coral
  card reference with built-in imagegen. Other games and seeded random-deck order
  stay unchanged. Card flips, entrances, matched pops and fever glow respect reduced
  motion, cancel on close and keep face-up state when the preference changes.
  Failed atlas/individual/frame art falls through to readable symbols. Ride sprints
  show one progress readout; the goal label stays legible over its golden fill.
- Daily chest celebrates only server-confirmed rewards, coalesces taps, reconciles
  already-collected gifts, retries failures and updates provider state on dismissal.
- Shared reduced-motion handling and cleanup cover the refined button, journal,
  shelf, map coin/ambient and chest effects. Park-day export waits for required art;
  slow/failed remote assets get a themed fallback before capture. Story capture
  uses platform/density-aware dimensions for actual 1080x1920 output, emphasizes
  positive confirmed activity and names a lone earned coin. Queue Parts stay distinct
  from ride-win Parts. A dev-only live recap QA mode uses the signed-in local player.

## Verified native player experience

The iOS 18.6 simulator runs the signed-in LOCAL player against localhost:8000/api,
with isolated Metro 8096. No production rewards or player records were changed.

- Profile six-stat grid, park header, normal shelves and secret shelves inspected.
  Normal rows and secret chains/supports/lock fit their original slots.
- One local QA Space Mountain journal entry saved: five-star rating, Loved it,
  note “Local QA — share-card export check”. History and totals reflect one entry;
  journal logging grants no invented XP. Native share sheet opened, then canceled.
  Actual exported PNG inspected: 1200x1071 with art, stars, reaction, date, 1x and note.
  Deliverable: outputs/tps-polish/local-qa-ride-share-export.png (outside repo).
- Day-one LOCAL daily chest added 25 Shark Coins (125 -> 150). A stale repeated chest
  reconciled to already collected and left the wallet at 150. No duplicate reward.
- Stale 0:00 map timers were reproduced and then replaced by fresh countdowns.
  A direct wizard-marker tap selected Forbidden Journey and opened its real queue
  experience. Server rejected rewards outside the ride's geofence, as expected.
- Native queue arcade inspected with five illustrated games. Trivia played through
  a complete five-question round, pause/resume, result and return to Play again.
  Ending via “I left the line” showed one completed activity and no unearned rewards.
  Finished header and recap fit the phone with the full ride name.

- Actual LOCAL Forbidden Journey Memory Match completed through native UI. The
  server confirmed the first coin, +10 Shark Coins, +25 XP, +4 Parts, +40 Energy
  and team takeover. Native QA exposed competing modal transitions; after repair
  the preserved win displayed its reward summary. Profile -> park still shows 1/26,
  and the coin occupies its original second-row shelf slot. Tapping it opens detail.
- Actual native upgrade to Level 2 Silver confirmed by server readback: 160 -> 150
  Energy, 4 -> 2 Parts, one upgrade event. The silver rim/success screen appeared.
- New magical deck played in dev-only native practice: owl, quill, wand and book
  pairs matched; all four pairs completed, 400-point result, Continue returned to
  practice. Practice grants no server rewards. Artwork is readable at phone size.
- Fresh LOCAL Secret Life of Pets trivia expired during simulator inspection.
  The server returned its first-coin Ticket and the original retry flow restored it.
  A native Snap the Ride retry used the existing camera-off fallback and won:
  +10 Shark Coins, +25 XP, +2 Parts, +25 Energy. The old nested presentation still
  dropped that fresh reward. After repair the preserved reward displayed and its
  Upgrade Your Coin button opened the correct Secret Life of Pets detail.
- Fresh LOCAL Snowball Memory Match completed all four pairs after the single-modal
  repair. Coin Catch appeared automatically, followed by its confirmed reward:
  +10 Shark Coins, +25 XP, +1 Part, +10 Energy, Team Mouse takeover, next Ticket.
  See Your Coin opened Snowball's actual detail (Level 1, 1 Part, 185 Energy).
  No reload or recovery was needed for this fresh win. Current local player owns
  Forbidden Journey Level 2, Secret Life of Pets Level 1 and Snowball Level 1.
  Upgrade hints show exact missing Parts without promising queue rewards at a
  non-ride collectible.

- Actual LOCAL park-day share export inspected at 1080x1920 with Forbidden Journey,
  its coin art, 1 new coin, 1 upgrade and 1 ride win. The real recap component ran in
  its dev-only live QA surface using confirmed server data; the native share sheet
  showed a JPEG thumbnail (425 KB), then was canceled. No message or post sent.
  Deliverable: outputs/tps-polish/local-qa-park-day-share-export.jpg (outside repo).

- Fresh original Profile -> Universal Studios Hollywood verified 3/26 coins.
  Forbidden Journey remains row 2 slot 1, Secret Life of Pets row 4 slot 1 and
  Snowball row 4 slot 2. All 26 normal slots and ten secret slots are intact.
  Sharing from this original park screen produced an inspected 1080x1920 JPEG
  with three coin artworks, three new coins, one upgrade and three challenge wins.
  Native share sheet showed the 452 KB image and was canceled without publishing.
  Deliverable: outputs/tps-polish/local-qa-three-coin-park-day-share-export.jpg.

- Ride goal planner now coalesces rapid saves, rejects older refresh responses,
  resumes a refresh requested during saving, retries the exact failed selection,
  and ignores delayed work after unmount. Opening the planner no longer creates
  redundant goal requests. Coin upgrade/home collection navigation waits for its
  native modal to close. Reduced motion uses an immediate fade presentation.
  Saving/retry cards, a 44-point close target and precise mastery readiness copy
  use the existing style and preserve the same planner/navigation structure.
  Native in-memory preview checked choose Space Mountain -> owned coin -> one
  missing Part -> upgrade ready, with clean close/reopen. Preview fixture buttons
  grant no real player coins or Parts; the actual local player remains at three
  owned coins. Native reduce-motion preference and real planner-navigation QA
  remain pending.

- Daily chest now offers Back to map before opening, plus backdrop/native-back
  dismissal while idle. Claiming remains deliberate and cannot be interrupted
  by these exits. Native signed-in decline returned to the original map with
  180 Coins, seven Tickets and 185 Energy unchanged; day-two chest remains unclaimed.
  The new day-two chest is valid: local backend uses UTC and crossed Sep 30 while
  the simulator was still Sep 29 Pacific. The seven-day ladder rules are unchanged.
  Header identifies today's reward; the reveal uses the confirmed response's
  ladder/day instead of an older preview. Switching to reduced motion during a
  pending claim cancels decorative movement and prevents delayed spring motion.

## Backend corrections

Applied to the isolated backend and the original LOCAL backend serving the preview:
- Secret shelf endpoint stops selecting absent energy_reward/ride_parts_reward
  columns; existing resource defaults (15 Energy / 2 Parts) remain. Actual endpoint
  returns 200 with ten secret coins.
- Ride logging responses include full signed-in ride_count and total_ride_count.
- New nullable player_rides memory columns: rating, reaction, photo_url, weather.
  These were already used by the model/controller but had no migration. Applied only
  this migration to the guarded local tps_local database; stats/logging now work.

- Resource spending now locks only player_ride_parts rows using matching IDs in a
  subquery. Native upgrade failed because PostgreSQL rejects FOR UPDATE on nullable
  outer joins; the original query was reproduced read-only and the repaired upgrade
  verified through the real LOCAL player. Regression checks cover owner/asset
  isolation, oldest-first spending, insufficient balance and PostgreSQL lock shape.

## Validation and remaining work

TypeScript and git diff checks pass. Full app checks: 207 tests. Focused backend
checks: seven tests, 53 assertions. PHP 8.5 emits an existing PDO deprecation. The
legacy full migration suite needs Doctrine DBAL; unrelated test-discovery warnings
remain and are not claimed clean.

Still needed: physical park GPS QA, archived shelf on a park that has archived coins,
small-phone and native reduced-motion QA, longer gameplay/battery/network review.
The local catalog currently classifies Space Mountain as “other”; artwork renders
that truthful fallback. Catalog classification/source repair is a separate pending
quality issue. No deployment, store upload, outbound message or social post occurred.

The polished source is saved on codex/gps-adventure-polish; the first source/art
checkpoint is 630d910 and the paid-challenge snapshot fix is c8d6648. Further reward
and upgrade fixes are being checkpointed and integrated into the original LOCAL
checkout with baseline checks, preserving Claude's branch and its pre-existing
untracked iOS workspace files. Backend initial checkpoint: abb33629.
The goal remains active and is not complete.
