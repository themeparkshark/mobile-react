/**
 * GameKit — shared engine primitives for every TPS minigame.
 *
 * Import surface for games and screens:
 *   import { useGameLoop, ParticleField, useSpringScale, GameShellV2 } from '../gamekit';
 *
 * NO game-specific code lives here. Everything is 60fps, UI-thread, pooled,
 * offline-first, and server-authoritative-friendly (games report {score,
 * duration, seed}; the shell never synthesizes rewards).
 */

// Theme / constants
export * from './theme';

// Loop
export { useGameLoop } from './GameLoop';
export type { GameLoopOptions, GameLoopControls } from './GameLoop';

// Particles
export { ParticleField } from './Particles';
export type {
  ParticleHandle,
  ParticlePreset,
  EmitOptions,
} from './Particles';

// Juice
export {
  useSpringScale,
  useShake,
  useFlash,
  usePopIn,
  usePulse,
} from './Juice';
export type {
  SpringScaleResult,
  ShakeResult,
  FlashResult,
  PopInResult,
  PulseResult,
} from './Juice';

// Haptics
export { haptic, Haptic, setHapticsEnabled, areHapticsEnabled } from './Haptics';
export type { HapticIntent } from './Haptics';

// SFX
export { SFX, playSfx } from './SFX';
export type { SfxName } from './SFX';

// Combo
export {
  useCombo,
  createComboState,
  registerHit,
  registerMiss,
  tick as comboTick,
  multiplierForStreak,
  DEFAULT_COMBO_CONFIG,
  FEVER_STREAK,
} from './Combo';
export type { ComboConfig, ComboState, UseComboResult } from './Combo';

// Score display
export { ScoreDisplay } from './ScoreDisplay';

// Shell
export { GameShellV2 } from './GameShellV2';
export type {
  GameShellV2Handle,
  GameResult,
  ShellPhase,
} from './GameShellV2';

// =============================================================================
// Studio engine (see src/gamekit/ENGINE.md)
// =============================================================================

// Core: pure, worklet-safe, node-tested.
export * from './core/rng';
export * from './core/ease';
export * from './core/clock';
export * from './core/camera';
export * from './core/particles';
export * from './core/comboFever';
export * from './core/scoring';
export * from './core/replay';
export * from './core/session';
export * from './core/perfStats';
export * from './core/audioMix';
export * from './core/hapticGrammar';

// Loop + time
export { useGameClock } from './useGameClock';
export type { GameClockOptions, GameClockHandle } from './useGameClock';

// FX
export { FxStage, fxEmitUI, fxFlyUpUI, fxFlashUI, fxBloomUI, fxVignetteUI, createFxState } from './fx/FxStage';
export type { FxStageHandle, FxStageProps, FxState, FlyUpOptions } from './fx/FxStage';
export { useFxAtlas, buildFxAtlas, fxCellRect, FX_CELL } from './fx/FxAtlas';
export type { FxAtlas } from './fx/FxAtlas';
export { useCamera } from './fx/useCamera';
export type { CameraRig, CameraOptions } from './fx/useCamera';
export {
  ShockwaveGroup, useShockwave, DissolveImage, Sunburst, Shimmer, useLoopProgress,
  FlashGroup, WarmGroup, DesaturateGroup, useHitFlash,
} from './fx/ShaderFx';
export type { ShockwaveHandle } from './fx/ShaderFx';
export { Shaders, brightnessMatrix, tintMatrix, warmMatrix, desaturateMatrix, rgba } from './fx/shaders';
export { withPop, withPopIn, withSlam, withAnticipation, withWobble, after, useSquashStretch, SPRING } from './fx/motion';
export type { SquashStretch } from './fx/motion';
export { CountUpText } from './fx/CountUpText';

// Feel grammar (sound + haptic + time + camera + FX in one call)
export { useFeel, fireFeel } from './feel';
export type { FeelDef, FeelAt, FeelDeps, FeelBurst, FeelFire } from './feel';
export {
  playHaptic, firePrimitive, setTellHapticsEnabled, areTellHapticsEnabled,
  setHapticAudioOffsetMs, setHapticGapMs,
} from './Haptics';
export type { PatternOptions } from './Haptics';

// Audio
export { GameAudio, MusicDirector } from './audio/GameAudio';
export type { PlayOptions, BackendChoice, MusicState, AppMusicBridge } from './audio/GameAudio';
export { CHRIS_CUES, CHRIS_BEDS, LEGACY_SFX_TO_CUE } from './audio/chrisBank';
export type { CueDef, BedDef, ChrisCueName, ChrisBedName } from './audio/chrisBank';
export { registerStudioAudio, useStudioAudio, studioCueIds, studioBedIds, fallbackFor } from './audio/studioLibrary';
export { useGameMusic } from './audio/useGameMusic';
export type { GameMusicOptions } from './audio/useGameMusic';

// Session (interruptions, snapshots, queue wrap-up)
export { saveSnapshot, loadSnapshot, clearSnapshot } from './session/snapshotStore';
export { useSessionRestore } from './session/useSessionRestore';
export { LinePlayMovementContext } from './LinePlayMovementContext';
export type { LinePlayMovement } from './LinePlayMovementContext';

// Results + perf
export { ResultsCard, defaultMessage as resultsMessage } from './results/ResultsCard';
export type { ResultsCardProps, ResultStat } from './results/ResultsCard';
export { usePerfProbe, PerfOverlay } from './perf/PerfOverlay';
export type { PerfProbe } from './perf/PerfOverlay';
export type { ShellSnapshotData } from './GameShellV2';
