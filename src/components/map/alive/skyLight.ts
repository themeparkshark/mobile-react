/**
 * Time-of-day lighting for the living map. Pure, unit tested.
 */

export type SkyPhase = 'day' | 'golden' | 'dusk' | 'night';

export interface SkyLight {
  readonly phase: SkyPhase;
  /** Sun elevation in degrees (negative below the horizon). */
  readonly elevation: number;
  /** Colour laid over the map tiles (under every pin), never strong enough to hurt legibility. */
  readonly tint: { readonly color: string; readonly opacity: number };
  /** Warm low-sun wash from the corner (golden hour). 0..1 */
  readonly wash: number;
  /** Soft darkening at the screen edges after sunset. 0..1 */
  readonly vignette: number;
  /** Warm lamp glows on pins and paths. 0..1 */
  readonly lamps: number;
  /** Ambient daytime life: cloud shadows, birds, sun glints on water. 0..1 */
  readonly clouds: number;
  readonly birds: number;
  readonly glints: number;
  /** Night life: fireflies around the shark. 0..1 */
  readonly fireflies: number;
}

export const DAYLIGHT: SkyLight = {
  phase: 'day', elevation: 45, tint: { color: '#ffffff', opacity: 0 }, wash: 0, vignette: 0, lamps: 0,
  clouds: 1, birds: 1, glints: 1, fireflies: 0,
};
