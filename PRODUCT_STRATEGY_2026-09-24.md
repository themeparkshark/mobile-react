# Theme Park Shark — product strategy

**Date:** September 24, 2026  
**Status:** Product direction and hypotheses. This is a design standard for future work, not a claim that these systems are built or that the game is already fun.  
**Source of truth:** Dustin's home → park → queue → coin mastery premise, the current app/backend audit in `CORE_LOOP_AUDIT_2026-09-24.md`, and the existing TPS art and screen designs.

## The promise

**Turn a park day into a game worth remembering, make the wait part of the fun, and let fandom continue between visits.**

The main object is a **Ride Coin** tied to a real attraction. A first visit earns the base coin; repeat visits, queue play, home preparation, and community events develop its appearance and mastery. The shark avatar displays the player's choices and achievements. The Stamp Book records meaningful milestones across all of it. A player should always know the next worthwhile action and what it changes.

The quality bar is unusually high. We should aim for the most enjoyable theme park game we can make, then verify that claim with actual guests. App downloads, feature count, animations, and chart position cannot substitute for observed fun.

## Visual standard for new gameplay

Dustin's existing app artwork and current built screens are the source of truth. The five reference screenshots shared September 24 show the intended character and UI spirit, but some pictured screens have already been upgraded, so they are directional references rather than a frozen layout specification. Before shipping a new screen, inspect its current neighboring screens and assets.

- Use the existing illustrated shark characters, ocean and park artwork, collectible objects, and the loaded Shark and Knockout display fonts where they fit. Bright blue, white, and coin gold are the core game palette; seasonal art can vary it.
- Make gameplay controls feel like illustrated game objects: ride banners, quest tickets, badges, shelves, coins, and collectible tiles. Keep functional text readable and controls native and accessible.
- Avoid default dark dashboard cards as finished gameplay surfaces. Prototype utilities can be plain, but a player-facing feature needs a visual pass before it is called ready.
- Review the real app on an iPhone at both first use and completion. Image generation may explore art direction, but generated screen mockups are references, not shipped UI or evidence that the feature works.

## Current iPhone reference check (September 24, 2026)

The [US App Store free games chart](https://apps.apple.com/us/iphone/charts/6014?chart=top-free) includes fast session games alongside Roblox, Block Blast, MONOPOLY GO!, and Fortnite. A chart position is not evidence that any one mechanic caused retention. The useful product hypothesis is to let a fan start a satisfying action in seconds, then make the result matter to a lasting collection or shared world. [Pokémon GO's Daily Adventure Incense](https://pokemongo.com/news/daily-adventure-incense-update) shows a bounded walking session with a recap; [Pikmin Bloom](https://www.pikminbloom.com/) connects everyday walks, a broad decor collection, remote Party Walks, and weekly challenges. For Theme Park Shark, test a short home story challenge, a meaningful map find, and a queue chapter as three different session lengths feeding the same ride, shark, and Park Project goals. These are comparisons to test with actual theme park fans, not a reason to copy a daily login calendar.

## Four connected loops

| Context | Player question | Action | Immediate payoff | Lasting payoff |
| --- | --- | --- | --- | --- |
| At home | "What can I do before my next visit?" | Explore nearby, finish a rotating preparation set, choose a target park/ride, help a crew project. | Energy, XP, Tickets, set variants, small cosmetic progress. | Enter the next park day prepared; build a fan collection and shark identity. |
| In park | "What should I do now?" | Follow a clear ride checklist, approach a ride, complete a short challenge, collect the base coin. | Coin reveal, XP, ride-specific Parts, a meaningful next goal. | Complete the park, master favorite coins, record the visit. |
| In line | "How do we enjoy this wait?" | Start LinePlay; play short ride-themed rounds, solve a crew challenge, or put the phone away while a capped timer continues. | Verified ride Parts and game scores; a line recap. | First or next coin upgrade, line mastery, shared memories. |
| Between visits | "Why return?" | Review passport, swap fair duplicates, join a remote fan expedition, contribute to a live park project, customize shark. | Visible progress and social response. | A collection, profile, and friend group that evolve with the parks. |

**Connection rule:** Every major activity advances one of three things: a ride coin, the shark's visible identity, or a time-limited shared park story. If a feature advances none of them, it needs a stronger reason to exist.

## The most important design call: first coin versus mastery

A guest physically at a ride should have a fair path to its base coin during that visit. A Ticket can start the challenge; if the wallet is empty, a small in-park earn path should be available at that ride or nearby. A failed first mini-game should lead to a retry or a reduced reward, not erase the visit's defining souvenir for the day. XP gates can open mastery tiers, rare variants, optional bosses, and prestige events. This preserves a deep collector ladder without making a once-a-year guest feel excluded.

**Test, do not assume:** Compare the current spend-then-random-game rule with a first-coin-accessible version in a small on-device park test. Ask players whether the coin felt earned, whether the rules were clear, and whether they want another ride immediately.

## A living park that players can change

The park map should change because of **bounded, visible player actions**. The first candidate is a weekly **Park Project** at one featured district or ride. Verified ride play and LinePlay automatically add to the project; remote fans add a smaller amount through home sets, trivia, or a crew expedition. There is no extra spendable project currency. When the shared meter reaches stages, everyone sees a map treatment evolve, a story clue open, a community challenge change, and a timed cosmetic or stamp opportunity appear. Players can vote between two editorially prepared next chapters. The result changes the following week's challenge deck and map art.

This makes participation consequential without letting a crowd delete someone else's progress or alter real park operations. The state lives on the server and updates in the app in near real time. Each project has a start, end, cap per player, published reward rules, and a fallback for quiet parks. Remote contributions matter, but a physical-visit coin and its visit edition remain proof of being there.

The weekly project is the backdrop. Players also need an **immediate response**: during a LinePlay chapter, completing a crew puzzle can reveal the next clue or bonus round for other active players at that ride within minutes. A solo player can reveal it through a personal threshold if the queue is quiet. These changes affect game content and art, never actual ride access or wait data. No one should be rewarded for gathering in a walkway, chasing another player, or sharing precise live location.

**Social entry points:** A private friend crew can work on the same project, compare collections, and help one another complete sets. A public park contribution meter makes the wider player population visible. Synchronous play is optional; asynchronous contributions work when friends are in different time zones or queue attendance is sparse. Public content, names, and player-authored submissions need moderation, reporting, blocking, and age-appropriate controls before launch. [Apple's App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) require these for user-generated social content and require clear location consent.

**Later, if the first project works:** Player-authored fan trails or clue sets with moderation, park faction rivalries, and a boss event. Pokémon GO's player-created Routes show how player-authored paths can extend a location game, but the review and safety work is part of the feature. [Niantic Routes guidance](https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/4176-how-do-i-create-a-route/).

## LinePlay must earn its own place in the app

A passive Parts timer is a useful floor. It is not the solution to a 45-minute wait. The first substantial LinePlay session should contain:

1. **A ride-specific chapter.** A short sequence of trivia, park lore, observation puzzles, and one-thumb arcade rounds that fits that attraction. The story advances after completed rounds, with a 30–90 second unit of play. No prompt should require filming strangers, blocking the queue, or ignoring the person in front.
2. **A group mode that works on one or more phones.** A family can answer together; a friend crew can pass a turn; solo players receive the same core chapter. Later, nearby or asynchronous crews can unlock a shared clue or beat a community score. Pokémon GO Party Play demonstrates the appeal of small-group challenges, while Disney's Play Disney Parks explicitly treats queues as a place for interactive games. [Party Play](https://niantic.helpshift.com/hc/en/6-pokemon-go/section/499-party-play/), [Play Disney Parks](https://disneyworld.disney.go.com/faq/play-disney-parks-app/play-disney-parks-app/).
3. **A fair passive track.** Ride Parts accrue at a capped, server-computed rate while eligibility is credible. Active games add modest bonuses and entertainment, not a large penalty for a guest who puts the phone away. A session can pause instantly when the line moves, survive app backgrounding, and recover after poor service.
4. **A real end.** The recap names games actually played, the crew's result, verified Parts, and the next upgrade. If a ride shuts down or a guest leaves, keep earned progress and close the session honestly.

**Eligibility rule:** GPS alone is too weak inside many queues. Use a manual start plus ride proximity, dwell, motion, and later confirmation, with limits and an appeal/correction path. Provisional offline progress must be labeled provisional until reconciled; the client cannot mint Parts. Test in real indoor/outdoor queues before tuning anti-spoof rules. A guest must be able to enjoy the games when location confidence is low even if rewards are pending.

## Collection depth without filler

The collection has layers with different emotional meanings:

- **Permanent Ride Passport:** one base coin per attraction, dated visit history, park completion, and favorite rides. It never expires.
- **Coin mastery:** five visible levels backed by Energy and that coin's Parts. Each level needs a real cosmetic change; functional perks must be implemented and explainable before being advertised. A future boss is a capstone, not a reason to make the base coin inaccessible.
- **Editions:** a small number of well-designed event/season variants for favorite rides, with clear ways to earn them and a later return path. Edition scarcity should create stories, not force daily park attendance.
- **Home sets:** keep the 40+ color/variant ambition as a prestige collection, but give the monthly set a smaller attainable core (for example 8 meaningful item types). Duplicates convert toward a wildcard; rare weather/time finds have an alternate path. Completion should be possible in ordinary local conditions.
- **Shark wardrobe:** an earned visual language for all of the above. Players can recognize another fan's shark by park specialty, favorite ride, season, or crew achievement. Cosmetics should be mixable so profiles look personal.
- **Stamp Book:** the index of verified feats, including home, park, queue, social, and historic editions. It records the same actions rather than creating a second set of unrelated chores.

A collector should be able to pursue breadth (many rides), depth (one beloved ride), style (shark), or rare history (editions). A casual family should see a satisfying collection after one trip. A local superfan should still have a long horizon. Pikmin Bloom's growing location-linked Decor collection and remote Party Walks are useful references for breadth and distant participation. [Pikmin Bloom](https://www.pikminbloom.com/), [Party Walk](https://pikminbloom.com/news/june24-partywalk).

**Trade design, later:** Let friends swap eligible duplicate home variants under class and daily limits. Do not make a paid random pack the sole route to completion. If randomized virtual items are ever sold, Apple requires odds disclosure before purchase. [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).

## Real-time freshness engine

Freshness should come from a **small set of reliable inputs**, not a random feature barrage:

| Input | What changes for players | Control |
| --- | --- | --- |
| Park and ride | Ride chapter, coin, challenge, map target, fandom content. | Curated ride content and server catalog. |
| Day, season, weather | Set variants, cosmetic editions, themed challenge deck. | Scheduled windows with a fair alternate path. |
| Community actions | Park Project stage, vote outcome, temporary map treatment, shared unlock. | Server event ledger, caps, reversible editorial configuration. |
| Player history and group | Next suggested coin, duplicate protection, friend goal, difficulty, relevant lore. | Explainable recommendation rules; no hidden punishment. |
| Operational conditions | Reroute a guest when a ride is unavailable; shorten/interleave play to match a moving queue. | Clearly sourced data with timestamps; no claim of official control. |

A daily seed selects from curated content; the server records event version, source, start/end time, eligibility, and rewards. Editors can switch off an event or correct bad content without an app release. The app caches a safe fallback when data is stale. The user sees what changed and why: “The community opened Chapter 2,” “Rain set is active,” or “Your crew is one coin from the goal.”

**Do not simulate live activity.** If only three guests are playing, show three contributions or provide a solo/crew target. If a queue wait estimate is stale, label it. If an event is offline, preserve earned state and explain when it will reconcile. Real-time adaptation is valuable only when the account and world remain trustworthy.

## Theme park fan pain points and the game response

| Pain point | Product response |
| --- | --- |
| I cannot visit often | Home walking sets, remote fan expeditions, crew contribution, shark cosmetics, lore and planning progress; park presence still owns visit coins. |
| Lines are boring | Ride-specific LinePlay chapters, quick arcade rounds, crew puzzles, passive Parts, and a recap; instantly interruptible when the line moves. |
| I do not know what to do next | One current park objective and one next coin/upgrade recommendation; reroute when a ride is unavailable. |
| My trip becomes a blur | Ride Passport, dated coins, ride history, park-day recap, and a few shareable milestones. |
| I am missing one item forever | Duplicate conversion, wildcard path, clear variant availability, and weather alternatives. |
| I am a casual visitor among locals | Park-visit and friends-first boards, participation prizes, and distinct mastery ladders; no single all-time XP board as the only status measure. |
| We are visiting as a family | One-device crew play, cooperative goals, pause-friendly activities, and clear privacy defaults. |
| The app feels dead between events | Weekly projects, curated rotating sets, community outcomes, and a visible next chapter—not a flood of unrelated currencies. |

This is an entertainment product. It should not claim to replace official admission, reservations, queue rules, accessibility programs, or live operational guidance. Official apps already own many of those utilities; Theme Park Shark wins by making the fan experience playable and memorable. [Disney's planning app](https://disneyworld.disney.go.com/experience-updates/genie/), [Play Disney Parks](https://disneyworld.disney.go.com/faq/play-disney-parks-app/play-disney-parks-app/).

## Distinct position and monetization boundary

Official park apps can offer park operations and some queue games. Theme Park Shark's distinct promise is a **portable fan identity across parks and between trips**: real ride souvenirs, deep mastery, an expressive shark, community projects, and queue chapters that feed the same collection. The app should use original shark art and clearly identify itself as an independent fan product unless a park partnership exists.

The base ride-coin path, a useful home loop, and substantial LinePlay should be enjoyable for free. If the game retains players, paid value can come from clearly priced cosmetic collections, extra wardrobe options, and optional fan passes with transparent contents. Do not make a paid random pack the only way to complete a monthly set or a park passport. Monetization needs its own balance and App Store review before it becomes part of the core loop.

## Build order and proof gates

### 1. Trustworthy first park day

Finish the server-owned ticket attempt and resolution flow; reconcile interrupted attempts; remove remaining mock rewards and false progress; make base-coin access fair; connect win → shelf → first real upgrade → next ride. Keep the current visual language. Restore a clean app build and test on a physical device. **Gate:** a new guest earns a verified coin and sees a verified upgrade on the same visit, survives relaunch and a network interruption, and can explain the loop unaided.

### 2. One excellent LinePlay ride

Ship one 15–45 minute ride-specific chapter with three genuinely different activities, passive Parts, solo and one-device crew play, movement interruption, offline recovery, a verified recap, and a measured battery budget. **Gate:** real guests choose to start it, report that the wait felt better, and the Parts ledger matches the UI after reconnect.

### 3. One living Park Project

Build one server-driven project that park and remote players can both affect. Include a stage change visible to every player, one vote on the next chapter, a low-population fallback, and safe moderation. **Gate:** a contribution visibly changes the shared world, and non-visitors feel involved without receiving a physical-visit coin.

### 4. Collector season and identity

Run one attainable home set with deep variants, duplicate conversion, a coin edition, an earned shark cosmetic, and a Stamp Book milestone. Connect the park-day recap and friend crew. **Gate:** casual and superfan testers both identify a desirable next collection goal, and no core set requires improbable weather or daily park attendance.

### 5. Live operations and growth

Create an editorial event tool, content calendar, server event ledger, feature flags, rollback, support path, and telemetry. Only then scale ride chapters, projects, park coverage, trades, and later bosses. Use Theme Park Shark editorial reach after gameplay retention and crash/battery quality are established. **Gate:** the team can change an event safely without an app update and can measure first coin, first upgrade, LinePlay completion, between-trip return, later-trip return, and player-perceived fun.

## Product review standard

For each new feature, answer:

1. Which fan pain does it relieve, and which of the four loops does it strengthen?
2. What changes in the player's coin, shark, Stamp Book, or shared park world?
3. What can a first-time visitor do, what can a remote fan do, and what happens with no other players nearby?
4. Is the result server verified, fairly earned, accessible, interruptible, and safe at a physical park?
5. What observed playtest result would make us simplify or remove it?

**Immediate strategic priority:** Build a great first park day and a great first LinePlay session. Community world changes and deep collecting then have something people genuinely want to return to.
