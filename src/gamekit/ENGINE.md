# TPS Studio Game Engine (src/gamekit)

The shared engine every TPS mini-game builds on. It extends the original GameKit
and stays backward compatible: every existing import from `src/gamekit` still works.

- **UI-thread first.** Sims, particles, camera and FX run in Reanimated worklets
  and Skia. A game should not need React renders during play.
- **Pure core.** Everything in `core/` is plain TypeScript with `'worklet'`
  directives. The same code runs on the UI thread, in `node --test`, and in a
  server verifier.
- **Bright world.** No dark, neon or purple surfaces. Every FX primitive has a
  navy cartoon outline. Art comes from Alex's originals or the GPT Image
  pipeline only (see "Art rule" below).
- **QUEUE REALITY.** The line never stops moving, so movement never pauses a
  game (see "Interruptions").

Demo: **MiniGameTester, then "Studio Engine Demo: Bonk Lab"** (`demo/EngineDemo.tsx`).
Set `EXPO_PUBLIC_RIDE_GAME_PREVIEW=1 EXPO_PUBLIC_ENGINE_DEMO=1` to boot straight
into it with the scripted autoplay tour.

## Map

| Area | Files | What it gives you |
|---|---|---|
| RNG and variety | `core/rng.ts` | mulberry32, `deriveRunSeed`, weighted picks, shuffle bags (no back-to-back repeats), `pickFresh` |
| Easing and motion | `core/ease.ts`, `fx/motion.ts` | easings, keyframe tracks, springs, anticipation/overshoot/settle, squash and stretch, pop, slam, wobble |
| Time | `core/clock.ts`, `useGameClock.ts` | fixed-step sim clock plus fx clock, global and local hit-stop, freeze budget, stacking, eased slow-mo |
| Camera | `core/camera.ts`, `fx/useCamera.ts` | trauma shake (squared, capped), punch zoom, directional kick, lean, framing zoom |
| Particles | `core/particles.ts`, `fx/FxStage.tsx`, `fx/FxAtlas.ts` | struct-of-arrays pool, 17 emitters, one `<Atlas>` draw, priority culling, layer budgets, coin magnets |
| Shaders | `fx/shaders.ts`, `fx/ShaderFx.tsx` | shockwave distortion, dissolve, edge-glow vignette, sunburst, shimmer, ripple, colour matrices |
| Score | `core/scoring.ts`, `fx/CountUpText.tsx`, FxStage fly-ups | stars, next-star goal, personal best, count-ups, flurry tallies |
| Combo and fever | `core/comboFever.ts` | tiers, streak or meter fever, grace misses, milestones, event bitmasks |
| Feel grammar | `feel.ts`, `Haptics.ts`, `core/hapticGrammar.ts` | one call fires sound, haptic, hit-stop, camera and FX on the same frame |
| Audio | `audio/*`, `core/audioMix.ts`, `SFX.ts` | layered engine: Chris bank, studio library, voices, ladders, ducking, music director |
| Interruptions | `core/session.ts`, `session/*`, `GameShellV2.tsx` | hold and snapshot, quick 3-2-1, heads-up, queue wrap-up |
| Replay | `core/replay.ts` | input logs, compact encoding, ghost cursors, `replayRun` |
| Results | `results/ResultsCard.tsx`, `GameShellV2.tsx` | stars with drama, count-up, NEW BEST, NEXT STAR bar, Play again and Challenge |
| Perf | `core/perfStats.ts`, `perf/PerfOverlay.tsx` | UI fps, fps p5, JS fps, frame graph, `fps_p5` for proof meta |
| Event bridge | `core/eventRing.ts`, `fx/useEventBridge.ts` | UI-thread event ring, one runOnJS per frame (the Banana bridge fix) |
| Walk sense | `core/walkSense.ts`, `motion/useWalkSense.ts` | accelerometer steps, walking, cadence, jostle, forgiveness; never pauses |
| Beat sync | `core/beatMap.ts`, `audio/useMusicBeat.ts` | measured per-beat maps, next 8th/bar, grid error, residual gate, UI-thread beat |
| Calibration | `core/calibration.ts`, `session/calibrationStore.ts` | per-route audio latency and input offset (Rhythm, Boss, Trivia) |
| Timelines | `core/timeline.ts` | closed-form fx springs, cue timelines on the fx clock, fixed logical views |
| Sprite atlas | `core/atlasLayout.ts`, `fx/SpriteAtlas.ts` | per-theme atlas built at mount from Alex's frames (2048 px cap) |

## A game in 60 lines

```tsx
import {
  GameShellV2, FxStage, useGameClock, useCamera, useFeel, useStudioAudio, useGameMusic,
  createComboFever, comboFeverHit, hasEv, EV_TIER_UP, starsFor, createRng, deriveRunSeed,
  usePerfProbe, PerfOverlay, type FxStageHandle, type GameResult,
} from '../../gamekit';

const THRESHOLDS = { one: 1500, two: 4000, three: 7500 };

export function MyGame({ visible, seed, runIndex, onComplete, onClose }) {
  const fx = useRef<FxStageHandle>(null);
  const sim = useSharedValue(createMySim(deriveRunSeed(seed, runIndex)));
  const clock = useGameClock({
    onStep: (dt, step, c) => { 'worklet'; stepMySim(sim.value, dt, step); },
  });
  const camera = useCamera({ width: W, height: H, timeScale: clock.fxScale, walking });
  useStudioAudio('whack', ['wh_bonk', 'sh_tier_up']);
  useGameMusic(fever ? 'mus_whack_fever' : 'mus_whack_main', { at: 'bar' });
  const feel = useFeel({
    good:  { sfx: 'wh_bonk', ladder: true, spatial: true, haptic: 'goodHit', burst: [{ emitter: 'stars' }], flyUp: { size: 'md' } },
    quick: { sfx: 'wh_bonk', ladder: true, spatial: true, haptic: 'quickHit', localStop: 65,
             burst: [{ emitter: 'impact' }, { emitter: 'splash', count: 10 }], ring: { color: '#ffcf3b', to: 80 },
             flyUp: { size: 'lg', color: '#ffcf3b' }, kick: 3 },
    golden:{ sfx: 'wh_golden_hit', haptic: 'golden', hitStop: 110, hitStopSim: true, forceStop: true,
             slowMo: [0.35, 280, 120], burst: [{ emitter: 'coins', magnet: true }], vignette: { color: '#ffcf3b' } },
  }, { fx, camera, clock, width: W, calm: reducedMotion });

  const onHit = (hole, tier, x, y) => feel(tier, { x, y, slot: hole, step: streak, text: `+${pts}`, magnetTo: HUD });

  return (
    <GameShellV2 visible={visible} title="Whack" score={score} result={result} thresholds={THRESHOLDS}
      gameId="whack" sessionKey={`whack:${rideId}:${attempt}`} getSnapshot={() => ({ score, state: saveMySim() })}
      onWrapUp={(reason) => ({ score, stars: starsFor(score, THRESHOLDS), meta: { reason } })}
      onStart={start} onPause={() => clock.pause()} onResume={() => clock.resume()}
      onRematch={queue ? restart : undefined} onComplete={onComplete} onClose={onClose}>
      <Board ... />  {/* your Skia scene inside <Animated.View style={camera.style}> */}
      <FxStage ref={fx} width={W} height={H} timeScale={clock.fxScale} reducedMotion={reducedMotion} />
      <PerfOverlay probe={perf} />
    </GameShellV2>
  );
}
```

## Time: two clocks

`useGameClock` owns one `GameClock` struct on the UI thread.

- `simMs` is gameplay time: spawns, timers, scoring. It is **wall-locked**, so
  hit-stop and slow-mo never change it and replays, ghosts and multiplayer stay
  deterministic. A test proves 40 hit-stops against none give identical steps.
- `fxMs` is presentation time. Hit-stop freezes it and slow-mo scales it. Pass
  `clock.fxScale` to `FxStage` and `useCamera` so a freeze really freezes the world.

```ts
clock.hitStop(65);                                   // fx-only freeze, budgeted and stack-attenuated
clock.hitStop(110, { holdSim: true, force: true });  // golden: gameplay holds too (taps stamp the frozen time)
clock.slowMo(0.35, 280, 120);                        // 0.35x for 280ms, eased back over 120ms
clock.localStop(hole, 65);                           // only this hole's fx clock holds
// In your onFrame worklet: s.anim[i] += slotDt(c, i)
```

Budget rules (`ClockConfig`): global freezes take at most `freezeBudget` of wall
time (4% by default; Whack uses 2%). Stops inside 600 ms are scaled 1.0, 0.6, 0.35.
`minGapMs` skips stops that come too close. `force` bypasses all of it for KO,
fever entry and round end.

## FX stage

```tsx
<FxStage ref={fx} width={W} height={H} timeScale={clock.fxScale} capacity={200} reducedMotion={rm}
  onArrive={(n) => coinTicks(n)} />

fx.current.burst('stars', x, y);                                    // any EMITTERS name
fx.current.burst('coins', x, y, { count: 16, tx: hudX, ty: hudY }); // magnetize to the HUD
fx.current.burst('confetti', x, y, { color: packHex('#ffcf3b') });
fx.current.ring(x, y, { color: '#ffcf3b', from: 12, to: 90, ms: 220 });
fx.current.flash({ peak: 0.35 });                 // capped (flashCap; 0.12 over reading lanes)
fx.current.bloom(x, y, { radius: 120 });          // localized light, no full-frame flash
fx.current.vignette({ color: '#ffcf3b', peak: 0.35, holdMs: 5000 }); // fever gold edge
fx.current.flyUp('QUICK +150', x, y, { size: 'lg', color: '#ffcf3b' });
fx.current.flyUp('4 HITS +600', x, y, { key: 'tally' });            // replaces the live one with the same key
```

Emitters: `glints, stars, sparks, confetti, ribbons, coins, splash, ink, bubbles,
puff, shards, embers, trail, speedLines, sparkles, impact, hearts`. Spread one
into your own `EmitterDef` to tune it. From your own UI-thread loop:
`fxEmitUI(fx.current.state.value, EMITTERS.stars, x, y)`.

The pool is capped (200 by default; Line Party uses 640 with layer budgets
`[320, 160, 160]`). When it is full, the lowest priority and oldest particle is
culled, and ambient FX never evict hits or celebrations. Reduced motion cuts
bursts to at most 6 particles and caps flashes at 0.15.

**Atlas.** `fx/FxAtlas.ts` builds one 1024x512 texture (8x4 cells of 128 px) at
mount. It combines existing art (Alex's coin, star and sparkle, the queue-kit
outlined particles, map FX splash and bubble) with tiny procedural FX primitives
(dots, rings, droplets, streaks, confetti frames) drawn white with the navy
outline. Pass `atlasImage` to use an Alex-style FX sheet from the GPT pipeline on
the same grid and indices (`FX_SPRITE`).

## Shaders

```tsx
const wave = useShockwave();                       // wave.fire(x, y, { radius: 220, strength: 10 })
<ShockwaveGroup wave={wave}>{skiaScene}</ShockwaveGroup>
<WarmGroup amount={feverSv}>...</WarmGroup>         // fever warmth (+R, +G, lift)
<FlashGroup brightness={hit.value}>...</FlashGroup>  // const hit = useHitFlash(); hit.flash(1.6, 33)
<DesaturateGroup amount={wipeSv}>...</DesaturateGroup>
<Sunburst cx cy radius intensity={sv} width height rays={12} />
<Shimmer x y width height progress={useLoopProgress(1200, activeSv)} />
<DissolveImage image={img} x y width height progress={sv} edgeColor="#ffcf3b" />
```

Keep Skia subtrees stable: wrap boards in `React.memo` and memoize arrays and
objects passed as Skia props. A React re-render must never rebuild Skia nodes
while the UI thread is drawing them (the demo hit a heap crash until this was
fixed).

## Camera

```ts
const cam = useCamera({ width, height, timeScale: clock.fxScale, reducedMotion, walking });
cam.shake(0.25);             // trauma, squared, capped at 120ms
cam.shake(0.6, dx, dy);      // biased along a knockback vector
cam.punch(0.06);             // 1.06 punch, spring home
cam.kick(3, 0);              // directional nudge
cam.frame(1.03);             // hold a push-in (fever); cam.frame(1) to release
cam.lean(12, 0);             // lean toward a telegraph
<Animated.View style={cam.style}>...</Animated.View>   // or <Group transform={cam.transform} origin={cam.origin}>
```

Walking cuts intensity to 0.3 and reduced motion to 0. The HUD never goes
inside the camera.

## Combo and fever

```ts
const combo = createComboFever({ ...DEFAULT_COMBO_FEVER, windowMs: Infinity, graceMisses: 1,
  fever: { ...DEFAULT_COMBO_FEVER.fever, mode: 'meter', chargePerHit: 0.1 } });
const ev = comboFeverHit(combo, now, quick ? 1.5 : 1);
if (hasEv(ev, EV_TIER_UP)) feel('tierUp');
if (hasEv(ev, EV_FEVER_START)) feel('fever');
comboFeverMiss(combo, now);          // EV_GRACE when a walking bump is forgiven
comboFeverTick(combo, now, dtMs);    // timeouts, fever end, EV_FEVER_WARN
comboMultiplier(combo);
```

The tier colours are blue, teal, gold and coral. Purple is gone, both here and in
`theme.COMBO_TIER_COLORS`.

## Feel grammar and haptics

`useFeel(table, deps)` returns `feel(name, at)`. Each entry can set `sfx`,
`ladder`, `spatial`, `haptic`, `tell`, `priority`, `hitStop`, `hitStopSim`,
`localStop`, `slowMo`, `shake`, `punch`, `kick`, `burst[]`, `ring`, `flash`,
`bloom`, `vignette`, `flyUp`, `duckDb` and `custom`. Sound and haptic fire first,
on the same JS flush.

`playHaptic(pattern, { priority, tell, alignToAudio })` plays named patterns such
as `quickHit`, `crit`, `golden`, `feverStart`, `breakPart`, `finisher`, `ko`,
`winRoll`, `incoming`, `lane1/2/3`, `goldenTell` and `anglerTell`. It follows the
grammar rules:

- at most one haptic per 60 ms, and the stronger one wins
- telegraphs outrank reactions
- `HP.critical` always fires
- `HP.rival` never fires

The new intents `hitSoft` and `hitRigid` are also on `Haptic`.
`setTellHapticsEnabled` is the "Feel the tells" toggle.

## Audio

```ts
await GameAudio.init();                 // audio-api hybrid when the native module exists, else expo-av
useStudioAudio('memory', ['mm_flip', 'mm_match']);
GameAudio.play('mm_flip', { pan: -0.6, pitch: 0, volume: 1, delayMs: 0 });
GameAudio.playLadder('mm_match', chain);            // pre-rendered pitch files, no runtime rate shifts
GameAudio.duck(6, 60, 400, 300);
GameAudio.music.play('mus_whack_main');             // or useGameMusic(bed, { at: 'bar' })
GameAudio.music.switchTo('mus_whack_intense', 'bar');
GameAudio.music.setState('muffled');                // breathers and look-ups (800 Hz low-pass on audio-api)
GameAudio.music.setTrimDb(-3);                      // line moving: dip, never stop
```

- **Chris bank** (`audio/chrisBank.ts`): all 23 working Chris sounds, trimmed and
  loudness-trimmed by measured LUFS, plus his 5 music beds. `success.mp3` is a
  broken 111-byte S3 error page and is never used. Legacy `playSfx('coin')` now
  plays `coin.mp3` (0-700 ms).
- **Studio library**: run `node tools/audio/sync-studio-audio.mjs` to pull the
  ART + AUDIO lead's output from `/Users/dustinsparage/apps/tps-mg/audio`. The
  sync does the following:
  - Infers cues from file names: `wh_bonk` plus `wh_bonk_00..07` becomes a pitch
    ladder, `tv_correct_p2` and `lp_spawn_C5` become ladders, and boss lanes
    become a 9-file `tell_<boss>_lanes` ladder.
  - Converts one-shots to 16-bit WAV.
  - Keeps loops and stingers as `.m4a`.
  - Reads beat maps from `_metrics/music.json`.
  - Writes `studio.generated.ts` (approved cues, which ship) and
    `studio.dev.generated.ts` (candidates, `__DEV__` only).
  - Dustin approves by listing ids in `audio/APPROVED.json` or setting
    `"approved": true` in a `manifest.json`.
  - Until then, release builds play the closest Chris sound (`fallbackFor`).
- **Voices**: a 12-voice global cap. Each cue has a `maxVoices`, and a new play
  steals that cue's oldest voice. Impacts steal the oldest tells. `cooldownMs`
  merges rapid repeats, variants never repeat back to back, and `pitchJitter`
  adds random pitch variance.
- **Latency**: react-native-audio-api 0.6 decodes WAV and MP3 but not AAC, so the
  `HybridBackend` sends compressed files to expo-av.
  `setHapticAudioOffsetMs(GameAudio.latencyMs)` aligns patterns that pass
  `alignToAudio`.

### Studio audio manifest (optional, per game folder)

```json
{
  "cues": {
    "wh_bonk": { "file": "wh_bonk.m4a", "ladder": ["wh_bonk_00.m4a", "wh_bonk_01.m4a"], "gainDb": -1,
                 "bus": "sfx", "maxVoices": 3, "cooldownMs": 30, "priority": 2, "approved": false },
    "sh_impact": { "file": "../shared/sh_impact.m4a", "variants": ["../shared/sh_impact_b.m4a"] }
  },
  "music": { "mus_whack_main": { "file": "music/mus_whack_main.m4a", "bpm": 129.2, "beatsPerBar": 4, "loopEndMs": 29760 } }
}
```

## Interruptions: QUEUE REALITY in the shell

`GameShellV2` handles all of it. Games only freeze and unfreeze their loop in
`onPause` and `onResume`.

| Event | What happens |
|---|---|
| Line moves (`LinePlayMovementContext.moving` / `lastAdvance`) | **No pause, no sound, no buzz.** The shell acknowledges each episode with `onResume()` so LinePlay's own session keeps running. When the line advances a lot, a heads-up chip ("Heads up, the line moved") and a gold edge glow show for 2.6s, at most once per 45s. Music dips 3 dB while moving. |
| App backgrounded, phone pocketed or screen locked | The shell holds, calls `onPause`, saves `getSnapshot()` under `sessionKey` (memory and AsyncStorage, 30 min TTL) and pauses the music. When the app comes back, a quick **3-2-1** (300 ms beats and a 220 ms GO) runs, then `onResume`. |
| Pause button | Same hold, with a Resume button that runs the quick 3-2-1. `resumeStyle="instant"` skips the count. |
| Real queue event (`queueEnded: 'boarding' / 'left-queue'`, or `ref.wrapUp()`) | The run ends. `onWrapUp(reason)` returns the result (default: current score, stars from `thresholds`). The results card shows "YOUR RIDE'S UP!" and "Run saved. Enjoy the ride!". `meta.wrapUp` is passed to `onComplete`. |

`movementPolicy` and `pauseOnLineMove` are accepted for older call sites, but
movement never pauses. Restore a snapshot on mount with
`useSessionRestore(sessionKey)`.

**For LinePlay (WS5).** The shell no longer auto-pauses on movement, so the
"Auto-pause toast" in `LinePlayScreen` goes stale. When LinePlay can, it should
supply `lastAdvance: { at, metres }` and `queueEnded`.

## Results card

Pass `thresholds` (and optionally `stats`) in the `GameResult`. The card does the
following:

- slams in Alex's ribbon title
- stamps the stars one at a time; a near-miss star wobbles "so close"
- counts the score up in the Shark font with coin ticks
- slams in a NEW BEST badge
- shows a NEXT STAR bar with the points still needed, so even a 0-star run has
  a target
- shows stat chips

Queue games can pass `onRematch` (Play again) and `onChallenge`. Paid ride
challenges never show them.

## Replay and ghosts

```ts
const log = createInputLog(4096);
logInput(log, step, KIND_TAP, hole, reactionMs);
meta.proof = encodeInputLog(log);               // "v1:..." base-36, delta-coded
const entries = decodeInputLog(meta.proof);
replayRun(initialState, entries, totalSteps, (s, step, due) => applyInputs(s, due));   // server-side verify
const ghost = createGhost(entries); ghostDue(ghost, step);   // async ghosts / dropped players' stand-ins
```

## Perf harness

`usePerfProbe()` records UI-thread frame times. `<PerfOverlay probe={perf} />`
is dev only and shows UI fps, fps p5, JS fps, p95 and the percentage of frames
over 16.7 ms. Add `fps_p5: perf.summary().fpsP5` to proof meta. The studio gate
is a p5 of 55 or better on an iPhone 12 **release** build: simulator and Debug
numbers are not representative.

## Event bridge (UI thread to JS)

```ts
const bridge = useEventBridge((batch) => forEachEvent(batch, (kind, a, b, c, t) => {
  if (kind === EV_BONK) { GameAudio.play('wh_bonk', { pan: a }); playHaptic('quickHit'); }
}));
// clock onStep / onFrame worklet:
pushEvent(bridge.ring.value, EV_BONK, pan, hole, tier, c.simMs);
bridge.flush();   // once, at the end of onFrame
```

The ring is preallocated (256 by default), overwrites the oldest event when
full (`dropped` counts it) and drains into a fresh plain array, because
mutating a typed array in place inside a SharedValue never crosses threads.
Touch-down feedback can still call `runOnJS` straight from the gesture worklet
for the lowest latency; sim-driven events (spawns, escapes, bot hits, tells) go
through the ring.

## Walk sense (QUEUE REALITY)

```ts
const walk = useWalkSense({ active: playing });            // expo-sensors, 50 Hz, no prompt
const cam = useCamera({ ..., walking: walk.walking });      // shakes x0.3
const r = HIT_RADIUS * walkForgiveness(walk.state.current); // +15% walking, + up to 20% jostle
proof.meta.walking = walk.walking;
```

A step is a peak of at least 0.07 g above gravity. Walking starts after 4 steps
in 4 s and stops after 2.5 s without one. It never pauses a game.

## Beat sync and beat maps

```ts
const beat = useMusicBeat(visible);                         // UI thread, locked to the audio position
const lit = useDerivedValue(() => Math.floor(beat.beat.value * 2) % 8);  // 8th-note bulb chase
const map = GameAudio.music.beatMap();                      // measured beats when the bed has them
setTimeout(reveal, msToNext(map, await GameAudio.music.positionMs(), 0.5, 40)); // next 8th
gridErrorMs(map, tapMs, 0.5);                               // judge a tap against the grid
beatMapResidualMs(map).maxResidualMs < 5;                   // the Rhythm beat-map gate
```

The audio sync writes `beats` and `downbeat` into every loop that has
`beats_s` in `_metrics/music.json`, so Chris's live-feel edits lock to their
real onsets. `useMusicBeat` re-anchors to the backend position every 500 ms
and slews at most 2 ms per frame (snaps on a seek or bed switch).

## Calibration

```ts
const cal = await loadCalibration('bluetooth', GameAudio.backendName === 'audio-api' ? 'audio-api' : 'expo-av');
const est = estimateOffset(tapErrorsMs);                    // trimmed median, null if scattered
if (est) await saveCalibration(applyEstimate(cal, est, Date.now()));
const judged = correctedTouchMs(touchMs, cal.inputOffsetMs);
const startAt = cueStartMs(hitAtMs, nowMs, cal.audioLatencyMs); // telegraph lands when heard
```

Grading stays on sim time. Calibration only moves when cues are heard and how
taps are read.

## Timelines, springs and fixed views

```ts
const y = springAt(fxMs - popAt, 1.12, 1, { damping: 10, stiffness: 380, mass: 0.5 }); // freezes with hit-stop
const tl = createTimeline([[CUE_CARD, 0], [CUE_STAR1, 280], [CUE_STAR2, 500], [CUE_STAR3, 720]]);
startTimeline(tl, clock.fxMs);  // then each frame: for (const id of timelineDue(tl, fxMs)) fire(id)
const fit = fitView(W, H, 960, 1000);  // Sharky's fixed 960x1000 view; screenToView(fit, x, y) for input
```

`scheduleHaptics(steps, { startAt })` plays a sequence from one start
timestamp (for example `gridSteps(n, 60, 75, 'selection', 'light')` for a
Current Quest carry). Drift never piles up, steps more than 40 ms late are
dropped, and it returns a cancel function for pause and wrap-up.

## Sprite atlas

```ts
const atlas = useSpriteAtlas([finnIdle, finnPeek, finnBonk, holeLip], { cell: 256, anchors: ['base', 'base', 'base', 'center'] });
<Atlas image={atlas.image} sprites={atlas.rects} transforms={rsx} />
```

One offscreen draw at mount, capped at 2048 px (16 MB). `layoutAtlas` is pure
and tested.

## Art rule

The engine draws **no characters, icons or props**. Characters and props come
from Alex's art already in the app, or from the GPT Image 2.5 pipeline with the
quality gate. Procedural drawing is limited to FX primitives (dots, rings,
droplets, streaks, confetti) and environment shapes (water, lips), always in the
navy-outline cartoon style.

## Tests

- `tools/tests/gamekit-engine-core.test.cjs` covers RNG, easing, clock, camera,
  particles, combo, scoring, replay and perf.
- `tools/tests/gamekit-engine-systems.test.cjs` covers audio mix, GameAudio,
  haptic grammar, the session model, feel and the audio sync.
- `tools/tests/gamekit-engine-timing.test.cjs` covers the event ring, walk
  sense, beat maps, calibration, fx springs, cue timelines, fixed views, atlas
  layout and haptic scheduling.
- `tools/tests/game-shell-presentation.test.cjs` covers the QUEUE REALITY shell
  flows.
