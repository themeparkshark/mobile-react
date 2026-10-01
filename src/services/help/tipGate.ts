/**
 * When a one-time tip may appear on the map or in line. Pure, unit tested
 * (tools/tests/help-seen-tips.test.cjs). Tips wait for a calm moment: they
 * never sit on a mini-game, a ride challenge, a dialog, a Finn lesson or a
 * moving line.
 */

export interface MapTipState {
  readonly mapFocused: boolean;
  readonly finnActive: boolean;
  readonly rideOpen: boolean;
  readonly findOpen: boolean;
  readonly dialogOpen: boolean;
  readonly bossOrChest: boolean;
  readonly adventureOpen: boolean;
  readonly coinFlying: boolean;
}

export function mapTipReady(state: MapTipState): boolean {
  return state.mapFocused && !state.finnActive && !state.rideOpen && !state.findOpen && !state.dialogOpen
    && !state.bossOrChest && !state.adventureOpen && !state.coinFlying;
}

export interface LinePlayTipState {
  readonly screenReady: boolean;
  readonly gameOpen: boolean;
  readonly lineMoving: boolean;
  readonly sheetOpen: boolean;
  readonly finished: boolean;
}

/** In line: only between games, with the line still, no sheet up. */
export function linePlayTipReady(state: LinePlayTipState): boolean {
  return state.screenReady && !state.gameOpen && !state.lineMoving && !state.sheetOpen && !state.finished;
}

/** Which park tip fits right now. A ride coin in range beats the welcome. */
export function parkTipFor(input: { readonly inPark: boolean; readonly rideCoinInRange: boolean; readonly arrivalLessonDone: boolean }):
  'coin_in_range' | 'park_hud' | null {
  if (!input.inPark || !input.arrivalLessonDone) return null;
  return input.rideCoinInRange ? 'coin_in_range' : 'park_hud';
}
