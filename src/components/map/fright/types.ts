import type { FrightShopStall, FrightTonight } from '../../../api/endpoints/fright/types';

/**
 * What the map needs to run the Fin-ister Nights takeover. ExploreScreen builds
 * it and passes it to <Map fright={...} />; null (or no prop) means off.
 *
 * Pass it while the mode is ON (DESIGN R6) and keep passing it through the
 * `after` phase: the layer fades out over 10 minutes there, then draws nothing.
 */
export interface FrightMapInput {
  /** GET /parks/{id}/fright, as last polled. */
  readonly tonight: FrightTonight;
  /** Mode ON per R6: in the event park and phase early, live or last_call. */
  readonly active: boolean;
  /** server_now minus the request midpoint (R5); the layer runs on Date.now() + this. */
  readonly nowOffsetMs: number;
  readonly player: { readonly latitude: number; readonly longitude: number } | null;
  /** The Spooky effects toggle. Off means calm: tint and still lanterns only, no sound. */
  readonly spooky: boolean;
  /** Haunts finished tonight (spot keys; a key repeated counts extra beads). */
  readonly doneKeys: readonly string[];
  /** Phones-down (an open haunt run before its minimum dwell): no thunder, pops, haptics or sound. */
  readonly quiet?: boolean;
  /** The season's first activation: play the ~4 s intro once when this flips to 'intro'. */
  readonly cinematic?: 'intro' | null;
  /** Called once when the intro finishes (or is skipped). */
  readonly onCinematicDone?: () => void;
  /**
   * The map's night show is live (ExploreScreen: nightShow.phase === 'live').
   * Optional: without it the layer reads show spots' `times`. While a show runs,
   * the fright sprites hold still and the sky stays clear of lightning.
   */
  readonly showLive?: boolean;
  /** A haunt facade was tapped (open the haunt sheet at that haunt). */
  readonly onHauntPress?: (spotKey: string) => void;
  /** The live encounter's critter was tapped (encounter.key). */
  readonly onEncounterPress?: (encounterKey: string) => void;
  /** The Halloween Shop stall was tapped (opens the shop, or the "Only at Fin-ister Nights" teaser). */
  readonly onShopPress?: (stall: FrightShopStall) => void;
  /**
   * Screen rects (points) of HUD the haunt chips keep clear of, beyond the map's
   * own right rail (which Map measures): a joystick, the energy meter.
   */
  readonly hudRects?: readonly { readonly x: number; readonly y: number; readonly width: number; readonly height: number }[];
  /**
   * Highest FX tier (server config.fx_tier_cap). Absent: 'lite' while the mode
   * is ON, until battery use is measured.
   */
  readonly tierCap?: 'full' | 'lite' | 'calm' | null;
  /** The ambient sound bed (eerie loop, gusts, lantern buzz) is opt-in. Default off. */
  readonly ambience?: boolean;
}
