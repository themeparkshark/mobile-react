# Whack-a-Shark proof v2: server replay note (for WS7)

The client is done and ships v2 proofs today. The backend change belongs to WS7 (`TaskGameProofService`); this note is the spec. Nothing in the backend was touched by the Whack stream.

## What the client sends now

- The ride flow (`MiniGameSelector`) still posts the v1 fields the live server checks: `game: 'tap'`, `score`, `elapsed_ms`, `seed` and `hits`.
  - `hits` is the legacy count (a golden counts 2). A v2 ride win always has 14 or more, so the current `TAP_GOAL = 10` rule keeps passing.
- `onComplete(multiplier, meta)` also carries `meta.proof`: one `WhackProofV2` for a ride, or an array (one per Burst) for queue, daily, weekly, duel and raid.
  - Shape: `src/games/whack/proof.ts` (`WhackProofV2`), matching design section 11.1.
  - It adds `carry` (meter, fever_left and streak carried into the Burst) and `incoming` (duel splat senders).
- To switch the ride to v2, WS7 forwards `meta.proof` as `proof.whack` in `resolveTaskAttempt` (`src/api/endpoints/me/task-attempts.ts`, not in this stream's scope). The server then replays it.

## Reference implementation

The TypeScript reference is in `src/games/whack/`:

- `timeline.ts` builds the Burst from the seed.
- `sim.ts` runs a 1 ms integer game-time resolver.
- `proof.ts` holds `verifyProof`, `replayProof` and `plausibility`.

The PHP port (`App\Domains\Game\Services\Whack\{Timeline,Resolver}.php`) must reproduce these exactly:

- **mulberry32 and mixSeed.** They live in `src/gamekit/core/rng.ts` and use `Math.imul` and `>>> 0`. In PHP, mask every multiply with `& 0xFFFFFFFF`. Line Party already ports mulberry32 (`App\Domains\Party\Sim\Mulberry32`).
- **Quantization.** `quantize(ms)` is `Math.round(Math.round(ms / EIGHTH_MS) * EIGHTH_MS)`, where `EIGHTH_MS = 60000 / 129.199 / 2`. JS `Math.round` rounds .5 up, and PHP's `round()` rounds half away from zero. They agree for positive values.
- **Timeline tables.** Port `waves.ts` and `formations.ts` 1:1.
- **Resolver order per ms tick.** Activate tells, advance each hole (emerge, puffer inflate, escape, cleanup), tick fever, run attacks, apply Auto Look-Up, then check the end of the Burst.
- **Taps.** A tap resolves after that ms's tick. The replay advances to each tap's game time and must arrive exactly on it. If it can't, the log is corrupt: reject it.
- **Special taps.** Hole `-1` with flag 1 is a resume without a bonk. Flag 2 is a swipe.

## Validation (design 11.2)

1. The seed equals the attempt HMAC seed, and `unlock_level` is at most the profile value. For `walk_boost`, check it against the LinePlay distance. If that check fails, strip the boost and re-resolve.
2. The replayed result must equal the client's `result`, compared on score, win, hits (legacy), maxStreak and freezes.
3. A ride win needs coin 100 within 30000 ms of game time.
4. `wall_ms` must be at most the attempt age plus 5000.
5. Plausibility filters apply to ride-coin wins only; they return a 422. Every other format gets a flag and the shadow leaderboard instead. Hits within 600 ms of a resume are excluded. The filters are:
   - more than 35% of reactions (measured from emerge) under 170 ms
   - a reaction SD under 25 ms over 10 or more hits
   - more than 3 non-adjacent jumps under 60 ms

Error copy: `WHACK_PROOF_ERROR` in `proof.ts`.

## Golden vectors

`src/games/whack/__vectors__/vectors.json` is produced by `node tools/whack/gen-vectors.cjs`. It contains:

- **1,920 timelines** (seed × format × difficulty × Burst index, plus symmetry and walk boosts), each stored as the sha256 of `timelineFingerprint()`.
- **60 autoplayed runs** (every profile, with freezes, whiffs, Butterfingers and splat swipes), each with its full proof and expected results.

`tools/tests/whack-bonk-rush.test.cjs` keeps the file in sync with the TypeScript. The PHP tests should load the same file.

## Multiplayer endpoints (for the Line Party backend)

The client contract is `WhackNetAdapter` in `net/types.ts`. The server rules in `net/duel.ts` and `net/raid.ts` are pure and tested:

- duel Burst seed: `mixSeed(matchSeed, 0xd0e1)`
- sabotage senders
- splat schedule
- best-of-3 with tie-breaks
- 3-minute windows
- raid HP (30 × crew, minimum 45)
- 3 slots per member
- Tag Team (+15% within 60 s)

The server must port them next to `PartyGames`. Until then, the dev build plays duels and raids against `createLocalNetAdapter`, which verifies locally and uses house-crew bots.

## Line Party: Whack Rush (live head-to-head in the queue)

Whack Rush is Whack-a-Shark as a live Line Party game: everyone in the ride's line plays the same 20 s Bonk Rush Burst at the same GO on their own board, with a live scoreboard, stickers, the Party Series and ghosts for anyone who drops. The app side is done on `claude/mg-whack`:

- Sim: `src/games/whack/party/whackRush.ts`, registered as `whack_rush` (version 1) in `src/games-registry/partySims.ts`. It uses the real Bonk Rush timeline and resolver (`format: 'party'`, the 20 s `party` shape: formations, helmets, twins, sprinters, two goldens, fever; no boss, no puffer, no splats) with **Auto Look-Up off**: the room shares one clock, so looking away is the player's personal HOLD, never a board freeze.
- Taps are plain `[ms since GO, hole]`, at most 400, like Bonk Race. The board runs the sim on the UI thread and hands each touch-down's sim stamp to `PartyClient.recordTapAt`, so the submitted log is exactly what the player saw scored.
- Golden vectors: `tools/fixtures/party-sim/whack_rush.json` (208 seeds x 4 logs: human-like, bot, ghost fill, empty), built with `node tools/party/gen-sim-vectors.mjs --only whack_rush`.
- Verified against the backend's own sidecar: `sim-runner/server.mjs` (read-only, run from a scratch bundle dir) replayed all 832 vectors exactly, about 0.6 ms each.
- The client advertises `whack_rush` in `/party/play` (`DEFAULT_GAMES`). The server's rotation already drops games it has not registered, so this is safe before the backend change lands.

### What the backend (Line Party owner) needs to add

1. `App\Domains\Party\Games\WhackRushGame implements PartyGame`, registered in `PartyGames::GAMES` as `'whack_rush'`:
   - `key()` `whack_rush`, `version()` 1, `roundMs()` 20000, `maxTaps()` 400.
   - `validTaps`: the same rule as Bonk Race (pairs of integers, 0 to 20000 ms, holes 0-8, non-decreasing, at most 400).
   - `resolve`, `botTaps`, `ghostFill`, `resultHash`: **sidecar only**. There is no PHP port of the Bonk Rush resolver for party rounds (the autoplayer bots use seeded floats, which only the same JavaScript reproduces). With the sidecar down, the rotation should skip `whack_rush` (fall back to `bonk_race`) instead of using a PHP driver.
   - `reactions($result)`: `$result['reactions']` (ms from emerge to bonk, scored hits only).
   - `stats($result)`: `hits`, `quick`, `goldens`, `maxStreak`, `crits`.
   - `anticheat()`: reaction floor 120 ms (the design's 170 ms-from-tell rule equals about 120 ms from emerge after the Finn tell), robotic SD under 25 ms over 10 or more hits, at most 12 taps/s.
2. Copy `tools/fixtures/party-sim/whack_rush.json` to `tests/Fixtures/party-sim/` and add it to the sidecar vector test.
3. Add `whack_rush` to `PARTY_ROTATION` (for example `bonk_race,whack_rush,trivia_sprint`) and deploy a sim bundle built from this branch.
