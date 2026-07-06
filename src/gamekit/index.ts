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
