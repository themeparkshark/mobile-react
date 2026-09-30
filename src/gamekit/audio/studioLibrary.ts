/**
 * studioLibrary.ts: the ElevenLabs one-shot library and Chris loop edits made
 * by the ART + AUDIO lead, as engine cues.
 *
 * Files are synced with `node tools/audio/sync-studio-audio.mjs` from
 * /Users/dustinsparage/apps/tps-mg/audio/<game>/ into
 * src/assets/games/audio/. Approved cues (Dustin, by ear) live in
 * studio.generated.ts and ship. Candidates live in studio.dev.generated.ts,
 * which is only required under __DEV__, so release bundles never contain them.
 *
 * Every studio cue gets a Chris fallback: until Dustin approves it, a
 * release build plays Chris's closest sound instead (never silence).
 *
 *   registerStudioAudio('whack');          // shared + whack cues
 *   useStudioAudio('memory', ['mm_flip', 'mm_match']);  // + preload
 *   GameAudio.playLadder('mm_match', chain);
 */

import { useEffect } from 'react';
import { STUDIO_BEDS, STUDIO_CUES } from '../../assets/games/audio/studio.generated';
import type { BedDef, CueDef } from './chrisBank';
import { GameAudio } from './GameAudio';

type CueTable = Record<string, Record<string, CueDef>>;
type BedTable = Record<string, Record<string, BedDef>>;

let devCues: CueTable = {};
let devBeds: BedTable = {};
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  // Dead-code eliminated in release builds (Metro constant-folds __DEV__).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const dev = require('../../assets/games/audio/studio.dev.generated');
  devCues = dev.STUDIO_CUES ?? {};
  devBeds = dev.STUDIO_BEDS ?? {};
}

/**
 * Closest Chris sound for each studio cue family (release fallback).
 * Matched by prefix/keyword; first match wins.
 */
const FALLBACK_RULES: [RegExp, string][] = [
  [/coin|tally|tick/, 'fx.coin'],
  [/whoosh|dash|slide|swipe|squeegee|launch/, 'fx.whoosh'],
  [/win|victory|crown|ko_|clear|reward|chest/, 'fx.reward'],
  [/lose|oops|fail|wipeout|nope|stall|zero|retreat|break|fizz/, 'fx.nopeShort'],
  [/tier|reveal|sparkle|twinkle|star|golden|fever_start|ignite|phase|glock|pearl|match|note/, 'fx.reveal'],
  [/tell|ping|sonar|pip|count|select|resume|heads_up|aim|scout/, 'ui.select'],
  [/lock|confirm|stamp|verified|clank|anchor/, 'ui.confirm'],
  [/impact|bonk|hit|crit|chomp|plop|pop|thud|slam|splat|boing|punch|knock|perfect/, 'fx.hit'],
  [/tap|flip|button|press/, 'ui.tap'],
];

export function fallbackFor(id: string): string {
  for (const [re, cue] of FALLBACK_RULES) if (re.test(id)) return cue;
  return 'ui.tap';
}

function withFallbacks(cues: Record<string, CueDef> | undefined): Record<string, CueDef> {
  const out: Record<string, CueDef> = {};
  if (!cues) return out;
  Object.keys(cues).forEach((id) => {
    const def = cues[id];
    out[id] = def.approved ? def : { ...def, fallback: def.fallback ?? fallbackFor(id) };
  });
  return out;
}

const registered = new Set<string>();

/** Register shared + the named games' cues and beds (idempotent). */
export function registerStudioAudio(games: string | string[]): void {
  const list = ['shared', ...(Array.isArray(games) ? games : [games])];
  list.forEach((game) => {
    if (registered.has(game)) return;
    registered.add(game);
    GameAudio.registerCues(withFallbacks(devCues[game]));
    GameAudio.registerCues(withFallbacks(STUDIO_CUES[game]));
    if (devBeds[game]) GameAudio.registerBeds(devBeds[game]);
    if (STUDIO_BEDS[game]) GameAudio.registerBeds(STUDIO_BEDS[game]);
  });
}

/** Studio cue ids available for a game (approved + dev candidates in dev). */
export function studioCueIds(game: string): string[] {
  return Array.from(new Set([...Object.keys(STUDIO_CUES[game] ?? {}), ...Object.keys(devCues[game] ?? {})])).sort();
}

export function studioBedIds(game: string): string[] {
  return Array.from(new Set([...Object.keys(STUDIO_BEDS[game] ?? {}), ...Object.keys(devBeds[game] ?? {})])).sort();
}

/** Hook: register a game's library and preload the listed cues on mount. */
export function useStudioAudio(game: string, preload: string[] = []): void {
  const key = preload.join('|');
  useEffect(() => {
    registerStudioAudio(game);
    void GameAudio.preload(preload.length ? preload : studioCueIds(game)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, key]);
}
