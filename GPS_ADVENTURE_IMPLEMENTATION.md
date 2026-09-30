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

## Native navigation-repair checkpoint

The signed-in local simulator played Nebula weave through a hint, first tile,
Pause, Resume and a completed three-star route. Replay changed to Starlight
switchback; its second completed route automatically revealed the success and
next-clue controls. Find the next signal opened mission two. After describing a
visible detail and logging it, the original chapter showed 2/3 signals found and
selected the star-chart finale. The finale launch and matching navigator art were
inspected at phone size, then practice was quit. No server reward was granted.

The dev-only flow fixture starts another session on source Fast Refresh; this is
not evidence of player checkpoint recovery. Actual controller tests cover exact
rotations after remount, pause guards, replay persistence and once-only mission
completion. Native restart recovery and physical/small-phone QA remain pending.


- Magic Kingdom Space Mountain now has a real navigation repair in the existing
  first chapter activity. Rotate a 3x3 circuit through three star relays to the
  exit. Four authored routes replay with deterministic scrambled orientations;
  the hint points to the next actual broken tile. Other ride chapters and the
  remaining trivia pool keep their existing activities. The original activity ID
  remains compatible with older completed checkpoints.
- The repair saves rotations and replay round in bounded local checkpoints, pauses
  tile input immediately, completes the chapter mission once and preserves that
  completion on replay. Local taps never award server Parts, Coins or Tickets.
  Circuit glows, stars, precise entry/exit arrows, tactile taps and one win sound
  accompany a short success reveal. A new win scrolls its next action into view;
  restored completion stays quiet. Reduced motion gives a static reveal/scroll.
- Active LinePlay uses a focused status card: ride, Pause, Arcade, confirmed Parts
  status and an accessible Details disclosure remain reachable. Detailed verified
  wait/reward rules stay available. The chapter and all three mission cards use a
  new original astronaut shark, also used by the Star Chart Memory banner. Asset
  decode failure falls back to existing mascot art. Original artwork is retained.
  The new transparent asset and exact reference/prompt JSON are additive files;
  generated with the built-in image tool, whose model-version selector is not exposed.

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

TypeScript and git diff checks pass. Full app checks: 232 tests. Focused backend
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

## Character-art correction after Dustin review

Dustin rejected the space navigator's head/helmet in v1. It had competing fin
shapes and an awkward compressed head silhouette; it should not have passed the
initial visual review. One edit candidate was rejected for retaining the internal
head spike. The second correction, space-navigation-shark-v2.png, gives the head
a single continuous contour and the helmet a coherent surrounding dome. All four
active image consumers now use v2; v1 remains an unused archive. Exact prompts,
references and the rejected candidate reason are saved in the v2 prompt JSON.

Art review must inspect anatomy, costume fit, silhouette, character identity,
edge cleanup and actual phone-size rendering. An image is not accepted merely
because it generated successfully, has polished shading or compiles. The reaction
and magical-card atlases were also reinspected; no additional structural defect
was identified in that bounded review. The broader asset review continues.

Native artwork review checked the corrected version in the chapter, circuit,
observation and finale cards, plus the Memory banner without countdown overlay.
Practice was quit without completing the finale or claiming rewards. TypeScript
and diff checks pass; the preceding 220-test gameplay result remains unchanged.


## Hands-on first park welcome

Park-first onboarding and first park arrival now offer a free four-pair Memory
warm-up followed by one collection handoff. The home first-find flow is unchanged.
The final guide names the original Profile -> scroll parks -> tap park -> all coins
path. Warm-up play never calls a reward API; only a verified ride challenge earns
real coins. Quitting returns to the welcome. Attempt tokens reject late callbacks.

Guides now start only while the map is focused. Ride suggestions remain queued
while a guide is active. Delayed step transitions and spotlight measurements are
canceled/ignored after closing or unmounting. Finn keeps the original teacher art
with restrained bob/sway and one greeting accent; reduced motion cancels the loops
and uses static transitions. Tutorial buttons have a 48-point minimum target.

Native iOS 18.6 local-player review verified welcome layout, pause/quit/restart,
four matched pairs, the settled winning screen, Continue -> collection guide,
and the final map return. The optional day-two chest was declined; the visible
wallet stayed 180 Coins / seven Tickets / 185 Energy. The preview resets tutorial
state in memory only and never overwrites veteran progress. Automated validation:
227 passing checks, clean TypeScript and diff checks.

The native QA also exposed an existing GPS quality issue: nearby dining, shops
and overlapping attractions can become multiple possible-ride suggestions while
the player stays in one area. No suggested ride was confirmed in this pass. This
must be repaired before claiming ride-journal accuracy or physical GPS readiness.
Small-phone/native reduced-motion and real first-earned-souvenir finishing remain
pending. The broader goal stays active.


## GPS suggestion quality repair

Local API inspection confirmed that the ride catalog includes raw `restaurant`
records alongside `attraction` and `show`. The detector previously accepted all
coordinates, including dining, and started a dwell for every overlapping radius.
Stopping it finalized all unfinished dwell records as exits.

The detector now accepts known attraction types only, applies the same filter to
old background caches, and ignores invalid coordinates. It tracks one clearly
nearest attraction at a time; new entry waits when two candidates are within a
15-meter distance margin, and an active zone remains until actual GPS exit. This
is a conservative heuristic requiring physical park review. Stopping discards
unfinished zones without manufacturing an exit or erasing existing pending
reviews. Tests cover real dwell/exit, dining/shop exclusion, overlaps, ambiguous
entry, cache filtering, invalid samples and stationary stop.

232 app checks, TypeScript and diff checks pass. Native normal-player session was
restored with the first-play preview off, the optional chest declined and wallet
still 180 Coins / seven Tickets / 185 Energy. The map is usable after Fast Refresh.
This does not prove real GPS accuracy, exact adjacent-ride discrimination or
battery behavior. Old queued suggestions are preserved for explicit review, not
silently deleted. No ride suggestion was confirmed and no social post was sent.
