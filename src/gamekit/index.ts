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
export * from './core/eventRing';
export * from './core/walkSense';
export * from './core/beatMap';
export * from './core/calibration';
export * from './core/timeline';
export * from './core/atlasLayout';
export * from './core/fxGovernor';
export * from './core/perfTier';
export * from './core/trail';
export * from './core/color';
export * from './core/hitTest';
export * from './core/flip';
export * from './core/nearMiss';

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
export { useEventBridge } from './fx/useEventBridge';
export type { EventBridge } from './fx/useEventBridge';
export { buildSpriteAtlas, useSpriteAtlas } from './fx/SpriteAtlas';
export { RibbonTrail, BrushStroke, useRibbonTrail, INK } from './fx/RibbonTrail';
export type { RibbonTrailHandle } from './fx/RibbonTrail';
export type { SpriteAtlas, SpriteAtlasOptions } from './fx/SpriteAtlas';
export { useWalkSense } from './motion/useWalkSense';
export type { WalkSense, WalkSenseOptions } from './motion/useWalkSense';
export { loadCalibration, saveCalibration } from './session/calibrationStore';

// Feel grammar (sound + haptic + time + camera + FX in one call)
export { useFeel, fireFeel } from './feel';
export type { FeelDef, FeelAt, FeelDeps, FeelBurst, FeelFire } from './feel';
export {
  playHaptic, firePrimitive, setTellHapticsEnabled, areTellHapticsEnabled,
  setHapticAudioOffsetMs, setHapticGapMs, scheduleHaptics,
  configureHaptics, hapticBusStats, playPattern, setNativeHapticPlayer, hasNativeHaptics,
} from './Haptics';
export type { PatternOptions, NativeHapticPlayer } from './Haptics';

// Audio
export { GameAudio, MusicDirector } from './audio/GameAudio';
export type { PlayOptions, BackendChoice, MusicState, AppMusicBridge } from './audio/GameAudio';
export { CHRIS_CUES, CHRIS_BEDS, LEGACY_SFX_TO_CUE } from './audio/chrisBank';
export type { CueDef, BedDef, ChrisCueName, ChrisBedName } from './audio/chrisBank';
export { registerStudioAudio, useStudioAudio, studioCueIds, studioBedIds, fallbackFor } from './audio/studioLibrary';
export { useGameMusic } from './audio/useGameMusic';
export { useMusicBeat } from './audio/useMusicBeat';
export type { MusicBeat } from './audio/useMusicBeat';
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
export { usePerfTier } from './perf/usePerfTier';
export type { PerfTierHandle } from './perf/usePerfTier';
export type { ShellSnapshotData } from './GameShellV2';

// Engine pass 4: haptic bus + Core Haptics patterns, stamps, finisher cam, thermal ladder
export * from './core/hapticBus';
export * from './core/hapticPattern';
export * from './core/stamps';
export * from './core/finisher';
export * from './core/thermal';
export { StampLayer } from './fx/StampLayer';
export type { StampLayerHandle, StampLayerProps, StampOptions } from './fx/StampLayer';
export { useFinisher } from './fx/useFinisher';
export type { FinisherDeps, FinisherAt } from './fx/useFinisher';
export { useThermal } from './perf/useThermal';
export type { ThermalHandle } from './perf/useThermal';
