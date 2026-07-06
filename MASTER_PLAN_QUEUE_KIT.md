# QUEUE KIT — Master Architecture Plan (2026-07-05)

Architect: Fable (orchestration + review). Workers: Opus / GPT-5.5 agents. Assets: gpt-image-2 via `openclaw infer image generate`.
Mission slice: make WAITING IN LINE the best part of the app, and make every minigame feel Niantic-grade. Branch: `feat/queue-kit` off `feat/queue-mini-games-3d`.

## Non-negotiable quality bars (every worker reads this)
1. **60fps or it doesn't ship.** All game rendering on Skia (`@shopify/react-native-skia`) + Reanimated worklets. No WebViews, no CDN fetches, no JS-thread animation loops. Kill `sharky.html` and `banana-basket.html`.
2. **One-thumb, portrait, interruptible.** The player is holding a churro in a moving line. Any game can be paused instantly and auto-pauses when the line moves (speed > 0.7 m/s for 5s). Zero two-handed gestures.
3. **Juice is not optional.** Every interaction: haptic (expo-haptics pattern map), SFX, squash/stretch, particles on success, screen shake ≤ 120ms on big hits, animated score counting. Reference feel: Alto's Odyssey menus, Pokémon GO catch screen.
4. **Battery-light.** No keep-awake in games. Location drops to `Balanced` accuracy during a queue session. No polling faster than 30s.
5. **Offline-first.** All assets bundled. Games must run in airplane mode; rewards queue to `RedeemRetryQueue` (AsyncStorage) and sync on reconnect.
6. **Server-authoritative rewards stay server-authoritative.** Games report {score, duration, seed}; backend computes rewards. Never synthesize rewards client-side (PASS2 bug class).
7. **TypeScript strict, zero new `any`, `npx tsc --noEmit` clean before any commit.**

## Component 1 — `src/gamekit/` (the engine layer, Wave 1)
Shared primitives every game consumes. NO game-specific code in here.
- `GameLoop.ts` — fixed-timestep update hook on `useFrameCallback` (worklet-safe), pause/resume, timescale.
- `Particles.tsx` — Skia particle emitter (pooled, max 200): burst, trail, confetti presets; accepts sprite refs.
- `Juice.ts` — springScale (squash/stretch), shake(intensity, ms), flashOverlay, pop-in/pop-out presets (Reanimated).
- `Haptics.ts` — semantic map: tapLight, hitMedium, comboHeavy, failBuzz, tickSelection (wraps expo-haptics, debounced).
- `SFX.ts` — expo-av pooled sound manager, preload manifest, duck music on SFX, master volume from SoundEffectProvider.
- `Combo.ts` — combo/multiplier state machine (window ms, tiers x2/x3/x5, fever mode trigger at 10-streak).
- `ScoreDisplay.tsx` — tweened count-up, multiplier badge, personal-best delta flash.
- `GameShellV2.tsx` — replaces the 1142-line MiniGameShell for new games: 3-2-1 countdown (skippable), pause sheet, results screen (score → stars 1-3 → server rewards handoff → confetti), consistent header. MUST keep the exact same external contract MiniGameSelector expects (onComplete(score, meta)) so old games keep working during migration.
- `theme.ts` — TPS palette (navy #09268f, blue #00a5f5, gold #fec90e) + game-feel constants.
Acceptance: MiniGameTesterScreen gets a "GameKit Gym" entry demoing every primitive at 60fps on device.

## Component 2 — LinePlay: the queue session (Wave 1)
`src/services/lineplay/` + `src/screens/LinePlay/`.
- **Detect**: reuse `useRideDetection` signals (near ride + dwell + low speed). After 90s dwell within ride radius while wait>0 → soft banner on Explore: "In line for {ride}? Start a Line Session". NEVER a modal. Manual entry always available from QueueTimes screen rows.
- **Session**: `startInLineTimer(ride)` server call; session length = posted wait from queue-times API (cached last-known if offline). UI: top = compact wait card (ride name, posted wait, elapsed, park-themed art), bottom = activity carousel.
- **Earn while you wait**: passive tick accrual (existing InLineTimer semantics) + activity playlist: minigame rounds (90-120s each), ride trivia (about THIS ride — question pool keyed by ride id, fallback to park pool), "Line Lore" cards (fun facts, from Nova-managed content), prediction card ("will your wait beat the posted time?" — resolves at session end).
- **Session end**: `completeInLineTimer` → recap card (time survived, games played, best combo, coins/parts earned) → feeds the future Park Day Recap. Auto-detects exit (left queue radius / speed sustained) with a 60s undo grace.
- **Interruption model**: line moves → games auto-pause with "Line's moving! 🚶" toast; resume in one tap. App background → session persists (timer is server-side).
- Acceptance: full session playable in airplane mode after start; battery drain in a 45-min simulated session < 6% (measure with instruments notes, document method).

## Component 3 — Game rebuilds (Wave 2, each its own worker, each consumes GameKit)
Contract per game: `src/games/<name>/` self-contained, exports `<Name>Game` component with GameShellV2, difficulty param (1-3) chosen by session context, 60-120s rounds, personal best in AsyncStorage, reports {score, maxCombo, seed}.
1. **Sharky Swim** (replaces WebView flappy): Skia — parallax 3-layer ocean, sprite shark with trail particles, tap-to-swim with coyote-time forgiveness (120ms), speed ramps, golden-ring bonus chain.
2. **Banana Basket** (replaces WebView): Skia catch game — drag basket (one thumb, bottom third), falling bananas/bombs/golden churros, frenzy waves, near-miss slow-mo (80ms timescale dip).
3. **Whack-a-Shark** (rebuild TapChallenge): 3x3 holes, pop animation with anticipation squash, decoy anglerfish (penalty), golden shark (x5 + fever), pace curve.
4. **Rhythm Tap** (rebuild Timing): shrinking-ring timing hits, Perfect/Great/Good windows (±40/90/150ms), 8-hit patterns that sync to a bundled 100bpm loop, fever visuals on 10-streak.
5. **Memory Match+** (refactor, keep logic): Reanimated 3D card flips, themed decks from asset packs, combo timer for consecutive matches.
6. **Ride Trivia** (polish): streak fire meter, 50/50 lifeline (costs coins — server validated), ride-specific pools.

## Component 4 — Asset pipeline (Wave 1)
`tools/assets/generate.py` (python, calls `openclaw infer image generate/edit`):
- `STYLE.md` — locked style guide prompt prefix: "flat vector game asset, bold clean shapes, thick 3px outlines, TPS palette navy #09268f blue #00a5f5 gold #fec90e coral accent, subtle cel shading, transparent background, no text". Every prompt uses it → visual consistency.
- `manifest.json` — asset id → prompt → size → outputs (@1x/2x/3x via resize). Script is idempotent (skips existing), supports `--only <game>`.
- Batches: gamekit (particles: star/bubble/coin/confetti sprites), sharky (shark 3-frame swim, rings, layers), banana-basket (basket, banana, bomb, golden churro), whack (holes, shark pop frames, anglerfish, golden shark), rhythm (ring, hit-flare), memory (card backs + 2 themed decks), lineplay (wait-card art per park style, lore card frames).
- Post-process: `sips`/PIL resize + pngquant if available. Output to `src/assets/games/<game>/`.

## Worker protocol
- Branch `feat/queue-kit`. One component per worker. Commit per logical unit, message prefix `feat(queue-kit):`.
- Before finishing: `npx tsc --noEmit` MUST pass; note any new deps (do NOT add heavy deps — Skia/Reanimated/expo-av/haptics already installed; flag anything else for architect approval).
- Do not touch: HomeExplore.tsx (dirty working tree), MiniGameShell.tsx (legacy games depend on it), anything outside your component dirs + MiniGameSelector/MiniGameTesterScreen registration points.
- Report back: files created/changed, decisions made, anything infeasible + why.

## Sequencing
Wave 1 (parallel): GameKit • LinePlay service+screen • Asset pipeline + first batches.
Wave 2 (parallel, after GameKit review): 6 game workers.
Wave 3: integration (MiniGameSelector routing, LinePlay playlist wiring, QueueTimes entry points), device QA checklist, battery test, legacy WebView deletion.
Architect reviews between waves; nothing merges to the working branch without tsc-clean + review.
