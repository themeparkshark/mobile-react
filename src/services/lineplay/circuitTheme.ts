/**
 * Per-chapter dressing for the Signal Repair circuit. The puzzle logic is the
 * same everywhere; each ride theme gets its own name, flow colour and copy so
 * a pirate queue repairs a lantern line and a space queue repairs a starport
 * panel. Colours stay on the bright house palette: never dark, neon or purple.
 */
import { deckIdForRideName, type RideDeckId } from '../rideTheme';

export interface CircuitTheme {
  readonly id: RideDeckId;
  /** Kicker place name, e.g. STARPORT. */
  readonly place: string;
  /** What the guest is repairing, e.g. "the signal". */
  readonly repairTitle: string;
  readonly solvedTitle: string;
  /** Name for the three relays on the board. */
  readonly relayNoun: string;
  /** Colour of the live flow through a connected pipe. */
  readonly flow: string;
  /** A lighter tint for the lit tile background. */
  readonly litTile: string;
}

const THEMES: Record<RideDeckId, CircuitTheme> = {
  space: { id: 'space', place: 'STARPORT', repairTitle: 'Repair the signal', solvedTitle: 'Navigation online!',
    relayNoun: 'stars', flow: '#ffcf3b', litTile: '#fff3c4' },
  pirates: { id: 'pirates', place: 'HARBOR', repairTitle: 'Relight the lantern line', solvedTitle: 'Harbor lights on!',
    relayNoun: 'lanterns', flow: '#ff9a2e', litTile: '#ffe6c7' },
  mansion: { id: 'mansion', place: 'MANOR', repairTitle: 'Wake the candle circuit', solvedTitle: 'Candles glowing!',
    relayNoun: 'candles', flow: '#ffb63b', litTile: '#fff0cc' },
  backlot: { id: 'backlot', place: 'BACKLOT', repairTitle: 'Rig the spotlights', solvedTitle: 'Lights, camera!',
    relayNoun: 'spotlights', flow: '#ffcf3b', litTile: '#fff3c4' },
  ocean: { id: 'ocean', place: 'REEF', repairTitle: 'Link the reef beacons', solvedTitle: 'Beacons shining!',
    relayNoun: 'beacons', flow: '#2fd0e0', litTile: '#d6f7fb' },
  jungle: { id: 'jungle', place: 'RIVER CAMP', repairTitle: 'Reconnect the river radio', solvedTitle: 'Radio crackles on!',
    relayNoun: 'relays', flow: '#5fcf5a', litTile: '#e0f6d5' },
  park: { id: 'park', place: 'MIDWAY', repairTitle: 'Light up the midway', solvedTitle: 'Midway sparkling!',
    relayNoun: 'lights', flow: '#ffcf3b', litTile: '#fff3c4' },
};

export function circuitThemeFor(rideName?: string, forceSpace = false): CircuitTheme {
  return THEMES[forceSpace ? 'space' : deckIdForRideName(rideName)];
}
