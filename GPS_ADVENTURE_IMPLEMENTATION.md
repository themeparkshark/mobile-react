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

TypeScript and git diff checks pass. Full app checks: 237 tests. Focused backend
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


## Souvenir-first reward finishing

A new ride coin now leads the post-win summary, with one collection action before
upgrade advice. Extra currencies, Rush details, VIP comparison and stamp rewards
sit in an expandable, illustrated receipt. Confirmed team takeover remains visible
because it explains the player's impact. Receipt amounts appear immediately at
their confirmed values; there is no temporary +0 or delayed count-up on opening.
No-coin completions bypass the coin catch and show their real reward receipt.

Repeat coins use one short feedback beat and lift (about 900 ms of scheduled UI
motion, 1100 ms completion fallback), rather than the full first-discovery wobble.
Their summary settles immediately without long hero loops. Confirmed upgrade
readiness still determines their next action. Reduced motion remains static and
all primary actions remain usable. VIP/team links now navigate only after native
reward-modal dismissal, with pending navigation cleared on unmount.

Native iOS 18.6 review used read-only first/repeat reward fixtures with the actual
Space Mountain coin artwork from the local public catalog. It verified collapsed
hierarchy, expanded first payouts/stamp, exact immediate repeat receipt amounts,
collection count, the missing-Part mastery hint, and first reward -> coin detail
after modal dismissal. No fixture reward or upgrade was granted. Source checks:
237 passing tests, TypeScript and diff checks clean.

This is not the complete coin-to-slot signature animation: the current post-win
handoff still opens the matching mastery detail through CoinShelf. It must carry
the earned collectible into the original Profile park's exact shelf slot. Physical
small-phone and native reduced-motion review, full Adventure Ticket progression,
crew contribution payoff, boss personality and longer play remain pending. The
full six-part goal remains active.

## Confirmed coin arrival in the original park shelf

The reward action now hands the server's won attempt, task namespace and asset
identity to the player's original Park screen, after the native rewards modal
finishes closing. Profile -> park -> all available coins is preserved. The real
catalog order resolves normal, secret and archived slots. A slot must also be
owned in refreshed park progress before the scene can begin; stale or unavailable
progress offers a retry without granting, moving or duplicating a reward.

The screen scrolls to that exact row and measures the real slot in the current
window. It rejects offscreen and delayed measurements. The same existing coin
art shrinks into the measured slot on the native animation thread: 720 ms for a
first collection, 360 ms for a repeat. One sound and light haptic resolve at
landing; both actions remain responsive from the start. Reduced motion presents
the finished slot immediately. The original coin stays visible after the scene,
and the explicit mastery action loads that exact coin's current server balance
and next unlock. Missing artwork completes the scene rather than substituting
an invented collectible.

Scrolling stays still until the arrival card is dismissed, keeping its gold ring
attached to the actual coin. The caption clears the compass navigation button.
Leaving the screen consumes the arrival; returning cannot reuse stale coordinates
or replay it. A frame-size change closes the scene and releases the real shelf.

Native iOS 18.6 review used existing confirmed local-player attempt 6, Snowball
asset 24/task 109. It verified row four, slot two in the current 26-coin catalog,
beside Secret Life of Pets; the anchored landing, compass clearance, dismiss
action and exact Snowball mastery screen (Level 1, one Part, 185 Energy) were
visible. No new reward, spend or upgrade was submitted. Automated validation:
246 passing checks, TypeScript and diff checks clean. An explicit mastery request
opens once; cancelling it or unmounting rejects late fetch results. Native review captured the
landed state; full normal-speed trajectory, physical small-phone and native
reduced-motion review remain pending. Adventure Ticket progression, crew payoff,
boss personality and the rest of the six-part goal remain active.

The ordinary nonstaff player session was restored with the shelf preview disabled
and the optional daily chest declined. Its wallet remained 180 Coins, seven
Tickets and 185 Energy. The normal Profile park card still opens all 26 available
coins with three owned coins and no arrival replay. No deployment or outgoing
message occurred. Legacy development-runtime warnings remain unresolved.

## Boss openings with distinct play

The existing 20-second brawl now has three readable openings. A buoy draws Kraken
aside, exposing its center for a short strike window. Robo-Shark requires a
numbered three-node circuit; wrong order restarts the circuit, and a successful
critical changes the next route. Ghost Squid telegraphs its reveal, then becomes
solid for a one-second strike window. Hidden Ghost taps do not count. The
existing boss illustrations are reused; no new generated anatomy was accepted.

Opening actions grant no hits or currency. Accepted strikes retain the server's
145 ms gap and at most one critical per three hits. The round preview and final
damage both round the full scaled contribution once, matching the backend's
remote-damage formula. Boss-specific star thresholds make a complete skilled
round achievable despite different vulnerability windows; star multipliers and
server payouts are unchanged. The HP bar explicitly labels its local preview.

Pause stops the gameplay clock, hit squash/flash/shake and particles. Resuming
preserves the circuit, lure deadline and Ghost phase. Closing rejects further
inputs; finishing is guarded once. Reduced motion removes decorative movement,
flashes, shakes, particles and floating numbers, while retaining the timed
states. The arena provides an accessibility strike action with the same timing
and critical budget. Native VoiceOver review is still pending.

The shared score display now starts each zero-score round immediately, rejects
queued UI samples from older score generations, and receives reduced motion from
GameShellV2. Its static reduced-motion personal-best and multiplier presentation
keeps the score readable without a punch or count-up. It cancels effects on
unmount.

Native iOS 18.6 practice review verified Robo's circuit/route change and Kraken's
lure with three hits/one critical/50 damage each. Ghost's faded/solid states,
pause/resume and accepted strikes were manually observed. An automated full
Ghost practice round produced 34 hits/11 criticals/560 damage and three stars,
matching the server formula and proof bounds. A subsequent Robo countdown
displayed zero immediately after the 560-score Ghost round. The practice route
has no raid submission or reward API; no Energy, Tickets, damage or loot was
submitted. 256 checks, TypeScript and diff checks pass.

This verifies the new mechanics and bounded native presentation, not voluntary
replay appeal or physical-phone accessibility/performance. Confirmed shared-map
impact, boss exit choreography, raid submission recovery, Adventure Ticket and
crew payoff still need further finishing. The six-part goal remains active.

During restoration, a development reload from the practice arena produced one
native EXC_BAD_ACCESS in folly dynamic hashing / Reanimated Fabric shadow-tree
cloning (local crash report 2026-09-29 19:48:14 Pacific). Reopening the app loaded
the ordinary player successfully; the optional chest was declined. This crash
has not been fixed or attributed to a specific source change. Native reload and
release stability require reproduction and further review; passing JavaScript
tests does not resolve that finding.

## Boss round recovery and rejected-art retirement

A finished brawl is now persisted before its first attack request. The immutable
receipt belongs to the player and park and keeps its raid ID, request ID, hit
proof, original GPS fix and explicit remote-join choice. Lost replies keep that
receipt, block another round at that park and retry the exact same request. Local
expiry never discards an uncertain spend: the backend checks the existing attack
ID before raid expiry. Account changes and unmounts cannot submit the saved proof
under another owner or apply its late result to the current map/wallet.

Storage reads fail closed; failed saves never post; rapid claims/retries coalesce
across Home and Explore. A confirmed receipt remains reserved if local cleanup
fails, and cleanup retry does not repost it. Unknown/malformed attack replies
remain unconfirmed rather than erasing proof. Zero-hit rounds submit no attack.
The raid poll is scoped to player/park and invalidates older responses when a
confirmed state arrives, preventing stale HP from returning.

The saved brawl takes the existing live-event slot, including after raid expiry.
Its compact illustrated receipt says the reply is pending and offers one action:
Confirm saved round. The boss sheet scrolls on shorter screens and retains the
same native modal when the raid disappears. A separate celebration waits until
the sheet has actually hidden. Reduced motion uses short fades; celebration seen
keys include the player, and are persisted at dismissal rather than before the
player could see the result.

Read-only iOS 18.6 recovery fixture: one simulated 50-damage attack deliberately
lost its reply; closing/reopening retained the round; confirmation showed 4,950
of 5,000 HP, 50 personal damage and four attacks left. The fixture receipt read
two requests / one simulated spend / same saved round. This is native UI and
recovery verification using an in-memory server fixture, not a real raid charge
or backend retry receipt. No normal-player Energy, Tickets or rewards were changed.

The current server's remote rate is 60%; production always uses the raid response's
rate. Tests also exercise a 25% rate to verify whole-contribution rounding and
locked join choice. No payout or rate was changed in the backend.
All 273 checks pass, including 17 new attack API/recovery/celebration cases;
TypeScript and diff checks are clean.
The final visibility guard also aborts a brawl on navigation away and rejects
stale entry/result taps. Normal play was restored with all practice flags off;
native readback showed the unchanged 180 Coins / 0 Keys / 7 Tickets / 185 Energy /
0 Swords. The optional Day 2 chest was left unclaimed. No new native crash was
observed in this restoration; the earlier crash remains unresolved.

The rejected first astronaut image was archived outside the app in workspace
work/rejected-art/space-navigation-shark-v1.png (SHA256
394707ec8655b2b08d447c8466735b8704fc47937b146ff28031311346dae541).
All four runtime consumers still use the reviewed v2 character. Its full-size
head/helmet contour was rechecked; no newly generated art was accepted in this
pass. Generated imagery remains draft until anatomy, costume/prop fit, reference
identity and actual phone-size presentation have been reviewed.

Further work remains on confirmed team takeover/featured-district celebration,
boss exit choreography, Adventure Ticket progression, crew payoff, physical
GPS/accessibility/performance and the unresolved native reload crash. The six-part
goal remains active.


## Confirmed boss map impact and art review

Boss settlement now saves the actual Ride Control contribution result in the MVP's existing atomic reward receipt and exposes it to every participant. The result includes park, asset, park day and a UTC timestamp captured at the control write. A capped MVP contributes no additional power; an already-held ride returns no flip. No prices, damage rates, payouts or schema changed.

The player dismisses the win with Back to the park. Both native presentations finish hiding before the map focuses the attraction and starts its finite exit: Kraken dives into a small pool, Robo-Shark powers down and retreats, Ghost Squid drifts away. The approved character remains intact; no fake limb animation or generated motion frames were introduced. Valid map anchors and a small geographic display offset keep the character beside the landmark rather than obscured by it. The boss's actual battle GPS coordinate and reach remain unchanged.

The featured district gets a temporary gold outline. A real pole and team pennant replace the floating team badge. Only a server-confirmed flip with matching current park day, asset, controller, flip time and exact scores triggers its raise. Exact scores conservatively suppress animation after any intervening contribution, including a loss/reclaim within timestamp precision. Existing held rides display their flags without an arrival animation. Stale map responses cannot lower same-day power or overwrite another player's/park's map. Malformed control frames fail closed.

One existing event slot carries the illustrated contribution/flag receipt, a See action and a 44-point dismiss control. It stays readable until dismissed rather than rotating or disappearing. Navigation/background interruptions skip decorative replay while retaining the receipt; late callbacks cannot affect a new owner/park. Reduced motion gives a static confirmed character stamp and stationary flag with an instant focus move. A single preference-aware star cue resolves with confirmation; reduced motion suppresses the haptic burst. Real audio and device haptics still require physical-device review. Daily-chest occlusion follows actual modal visibility, including declining the unclaimed chest.

Native read-only practice used actual MapLibre, TaskMarker, BossMapDeparture and event receipt components on TPS LinePlay QA Sep25 / iOS 18.6. Kraken, Robo-Shark and Ghost Squid were each observed beside the landmark during exit, then the stable confirmed flag receipt was read back. This is native fixture UI evidence, not a real raid charge or multiplayer/physical-GPS test. An already-running Simulator recording was left untouched; no complete normal-speed playback artifact or OS Reduce Motion walkthrough is claimed here.

Full-size art inspection found a detached edge fragment in the existing Robo-Shark reference. The first imagegen cleanup was rejected for tight cropping and archived outside app assets. The second retained a coherent metal head/visor, attached side fins and lower tail, the established palette and outlines, and comfortable visible transparent padding. It was reviewed full-size and at native map/receipt size before use. The versioned cleanup is shared by all runtime boss art consumers, with its visible character size preserved; the reference is retained unchanged. The previously rejected astronaut remains outside runtime assets and all four astronaut consumers still use reviewed v2. Generated candidates never pass automatically.

Validation: 285 app checks pass; TypeScript and diff checks are clean. Backend BossRaidTest and RideControlServiceTest pass 19 tests / 126 assertions using isolated source, in-memory SQLite and null Scout. PHP 8.5 reports the pre-existing PDO constant deprecation. No live search indexing, account boss attack or account reward claim was performed.

The six-part goal remains active. Adventure Ticket progression/substitution, complementary crew payoff, voluntary replay evidence, physical GPS/audio/haptics/accessibility/performance and the previously observed Reanimated/Fabric reload crash remain unfinished. This checkpoint is concrete progress on requirement 4 and continuity in requirement 5; it does not close the overall goal.
