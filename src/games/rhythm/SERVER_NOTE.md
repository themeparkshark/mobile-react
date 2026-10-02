# Parade Beat: server change requests (WS7 / multiplayer lead)

The app side of Parade Beat (game key `timing`, design rhythm.md revision 6) is
on `claude/mg-rhythm`. Nothing in the backend was changed. These are the
requests, in priority order.

## 1. Line Party: register `parade_sprint` (the live Same-Minute Race)

The client is done and advertises `parade_sprint` in `/party/play` `games`
(`DEFAULT_GAMES` in `src/gamekit/net/PartyClient.ts`). The rotation will only
pick it once the backend knows the key.

- **Sim.** `src/games-registry/partySims.ts` now has `parade_sprint` (v1,
  `src/games/rhythm/multiplayer/paradeSprint.ts`). `tools/build-sim-bundle.mjs`
  bundles it. Drop the new `party-sims.<hash>.cjs` into the sidecar's
  `bundles/` folder.
- **Driver.** The Parade Beat judge is not integer-only (its beat map is
  float milliseconds), so there is **no PHP port**. Route `parade_sprint` to the
  Node sidecar driver only. If the sidecar is down, treat the round as
  no_contest (never a loss) rather than falling back to PHP.
- **Golden vectors.** `tools/fixtures/party-sim/parade_sprint.json` holds
  208 seeds x 4 logs (human, bot, ghost_fill, empty) with exact `{score, hash}`,
  a prefix resolve and the explain moment. Copy it to the backend's
  `tests/Fixtures/party-sim/` next to bonk_race and trivia_sprint. The app test
  `tools/tests/party-sim-bundle.test.cjs` already checks source vs bundle.
- **Round.** `roundMs` = `ROUND_MS` (27,770 ms: 2 count-in bars, the 12-bar
  ride sprint, 2 outro bars). `maxTaps` 600. Seeds pick the stage
  (`seed % 2`: Opening Day, Waiting Room).
- **Taps.** Rows are `[songMs, code]`, `code = type*100000 + zone*10000 + pointer`
  (type 0 down, 1 up, 3 Fever launch, 4 MARCH pill). The phone records each
  input at the exact ms its UI-thread judge used (`PartyClient.recordTapAt`),
  so the replay lands on the phone's own number (verified on the simulator:
  "Replay 1355 vs live 1355 MATCH", media/rhythm/parade-sprint-*).
- **Score.** Duel Points: per playable bar `round(bar accuracy)`, x1.5 in bars
  under the player's own Fever. Layer-normalised, so a player who taps MARCH
  while walking is never punished. Ties break on `points` (raw judge score).
- **HOLD.** A Parade Beat HOLD freezes the song and the board clock together,
  so the log stays continuous and nothing is voided. The usual 6 s budget and
  ghost fill apply. `ghostFill` closes any held touch at the drop, then the
  house drummer plays on.
- **Walk Hold.** Keep it off for this game (Dustin: the line is always moving).

## 2. Ride proofs keep verifying today

`TaskGameProofService::validate` checks `{game, score, elapsed_ms, seed}`.
The result meta still carries `score` and `seed` at the top level. Rhythm is
**queue-only** until item 3 lands: `timing` was removed from the client's
task-attempt fallback in `MiniGameSelector.tsx`, and `TaskAttemptController::GAMES`
must keep excluding it.

## 3. Proof v5 and exact replay (design 9.2-9.3)

`meta.rhythmProof` is now v5 (`src/games/rhythm/core/proof.ts`). New since v4:
`grip`, `assist`, `limp`, `no_fail_until_ms`, `touch_ts`, `march_sections`,
`fever_deploys` as `[launchMs, dropBar]` pairs, `dares_received`. Removed:
`walk_source`, `steps_per_march_bar`, `poppers`/`freeze_faults` stay empty at
launch (those note types are post-launch content drops).

- `replayProof()` rebuilds the canonical chart (`chart_version` `pb-2.0`; the
  seed no longer changes the chart) and replays the touch log, including
  type 3 launches, through `core/judge.ts`. The sidecar can run exactly this
  file; a PHP port is only needed if you want ride verification without Node.
- **Assist (design 3.5).** Honour `assist: true` only if the server recorded a
  lost ride sprint by this account at this ride in the last 24 hours.
- **Plausibility (9.3.3):** offset in [-100, 350]; elapsed vs chart length and
  `pause_spans`; at most 15 touch-downs per second; delta sd >= 6 ms over 20+
  hits. Flags hold a leaderboard entry, never reject a ride.
- **Win (9.1):** never stalled, hit rate >= 75%, strays <= 12. First Parade
  (`ftue: true`) cannot fail.

## 4. Async challenges (Ghost Drumline)

`RhythmTapGame` takes `onChallengeCrew(ghost)`: when the host can deliver a
Line Party challenge, the results card shows "Challenge" and hands over the
canonical run `{stage, format, difficulty, touches, marchBars, autoFever,
chartVersion, score}`. The receiver passes it back as the `challenge` prop. The
ghost replays through the judge, races on the rails and its Fever launches
deliver Hidden Dares (deterministic, logged as `dares_received`).
