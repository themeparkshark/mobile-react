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
- Daily chest celebrates only server-confirmed rewards, coalesces taps, reconciles
  already-collected gifts, retries failures and updates provider state on dismissal.
- Shared reduced-motion handling and cleanup cover the refined button, journal,
  shelf, map coin/ambient and chest effects. Park-day export waits for required art;
  slow/failed remote assets get a themed fallback before capture.

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

## Backend corrections

Applied to the isolated backend and the original LOCAL backend serving the preview:
- Secret shelf endpoint stops selecting absent energy_reward/ride_parts_reward
  columns; existing resource defaults (15 Energy / 2 Parts) remain. Actual endpoint
  returns 200 with ten secret coins.
- Ride logging responses include full signed-in ride_count and total_ride_count.
- New nullable player_rides memory columns: rating, reaction, photo_url, weather.
  These were already used by the model/controller but had no migration. Applied only
  this migration to the guarded local tps_local database; stats/logging now work.

## Validation and remaining work

TypeScript and git diff checks pass. Full app checks: 175 tests. Focused backend
checks: five tests, 43 assertions. PHP 8.5 emits an existing PDO deprecation. The
legacy full migration suite needs Doctrine DBAL; unrelated test-discovery warnings
remain and are not claimed clean.

Still needed: a physical park reward/first-coin arrival pass, actual park-day Story
export with confirmed game coins, archived shelf on a park that has archived coins,
small-phone and native reduced-motion QA, longer gameplay/battery/network review.
The local catalog currently classifies Space Mountain as “other”; artwork renders
that truthful fallback. Catalog classification/source repair is a separate pending
quality issue. No deployment, store upload, outbound message or social post occurred.

The polished source is saved on codex/gps-adventure-polish. Verified files are being
integrated into the original LOCAL app checkout while preserving Claude's branch and
its pre-existing untracked iOS workspace files. The goal is not complete.
