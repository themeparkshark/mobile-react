/**
 * SimVersion (design rev 7, 11.2): what this build tells the server at join.
 *
 * A room plays one sim version per game. The phone states the version of
 * every party sim it carries plus the content hash of the bundle; a Bonk Race
 * version the server does not schedule is refused at join with an update
 * card (never mid-round), and a mismatched secondary game is simply left out
 * of this phone's rotation.
 */
import { PARTY_SIMS } from '../../games-registry/partySims';
import { SIM_BUNDLE } from '../../games-registry/simBundle';

export { SIM_BUNDLE };

/** game -> sim version for the games this build can draw. */
export function simVersions(games: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of games) {
    const sim = (PARTY_SIMS as Record<string, { version: number }>)[g];
    if (sim) out[g] = sim.version;
  }
  // The join gate keys on Bonk Race even when a build only draws trivia.
  if (out.bonk_race === undefined) out.bonk_race = PARTY_SIMS.bonk_race.version;
  return out;
}

/** The server refused this build's sims: show the update card. */
export const UPDATE_READY = 'UPDATE_READY';
