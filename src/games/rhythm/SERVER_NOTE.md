# Parade Beat: server change requests (WS7 / multiplayer lead)

The app side of Parade Beat (game key `timing`) is complete on `claude/mg-rhythm`.
Nothing here was changed in the backend. These are the requests.

## 1. Ride proofs keep verifying today

`TaskGameProofService::validate` checks `{game, score, elapsed_ms, seed}`.
The result meta still carries `score` and `seed` at the top level, and a
ride sprint lasts about 28-30 s (well over the 12 000 ms floor), so the
current service accepts Parade Beat results unchanged. `timing` is still
excluded from `TaskAttemptController::GAMES`. Keep it that way until item 2
lands.

## 2. Proof v4 and exact replay (design rhythm.md 9.2-9.3)

`meta.rhythmProof` is the v4 proof (`src/games/rhythm/core/proof.ts`):
- `inputs`: the note-level rows `[noteIndex, signedDeltaMs, kind, zone]`.
- `touches`: the raw touch log in judged song time. Integer ms, delta-coded
  base 36: `dt.type.zone.y.pid|...`.

`replayProof()` rebuilds the chart from `(stage, format, difficulty, seed)`.
It then replays every touch through the same judge and returns the server's
score, stars and ride win. The judge rounds touch times to integer ms at the
input boundary. So a replay with 8 ms ticks is bit-exact against a live run
judged on irregular frames (tested).

What the PHP port needs:
- **generate.** It reads `src/games/rhythm/stages/<stage>.json`. Ship it as
  data with the backend and check `beatmap_hash`. The seed draws, in order:
  1. every `fill` group takes `floor(r*3)`;
  2. a Fisher-Yates over the `echo` groups, first 2 on;
  3. the same draw over the `freeze` groups;
  4. one draw per `either` CYMBAL in note order, where `< 0.5` keeps the CYMBAL.
  The generator is mulberry32 on the raw seed.
- **judge.** Port `core/judge.ts` line for line. Every rule is in that one
  file.
- **Plausibility checks (9.3.3):**
  - offset in [-100, 350];
  - `elapsed_ms` at least the chart length minus 300, allowing for the
    declared `pause_spans`;
  - touch rate of at most 15 per second;
  - delta sd of 6 ms or more over at least 20 hits;
  - 2-6 steps per March bar.
- **Round tokens and flags (9.3.4-5).** Round tokens are single use. Flags
  are the outlier sigma check, lag-1 autocorrelation under 0.02, and a March
  share outside the park band. Flags hold a run for review. They never
  reject it.
- **Win (9.1).** Cleared, hit rate of 75% or more, and 12 or fewer strays.
  First Parade (`ftue: true`) can never fail.

## 3. Line Party: `parade-beat` in the PartyGames registry

The client already races the same `Rival` shape (`multiplayer/drumline.ts`)
from local ghosts and house crew. The live room needs these pieces:
- **Game entry.** Register `parade-beat` with its key, version `pb-1.0`,
  `roundMs` from the stage, a timeline that returns the chart, and `resolve`
  as the replayed judge score. Bots use the human model in `core/sim.ts`.
- **Telemetry.** A 250 ms whisper of `[noteIndex, grade]` pairs per player.
  The client flashes rival rails at each note's beat-map time, not at packet
  arrival.
- **Ghost fill.** A dropped player's seat plays on from their touch log, then
  the house model.
- **Async challenges.** Store `touches` + seed + `march_bars` as the ghost
  run. The client renders it with `ghostRival()`.
- **Band Mode (design 11.2).** Only the host phone plays the song. This needs
  the route module from WS9, so every live round is Synced mode until then.
