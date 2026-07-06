/**
 * SFX manifest — semantic sound name → bundled audio asset.
 *
 * HOW TO ADD A SOUND
 * ------------------
 * 1. Drop the audio file next to this manifest, e.g.
 *    src/assets/games/sfx/tap.mp3
 * 2. Uncomment (or add) the matching line below with a static require():
 *    tap: require('./tap.mp3'),
 *
 * The require() MUST be a literal path — Metro resolves these at build time,
 * so dynamic keys will not work. Every name that is NOT present here resolves
 * to a silent no-op at runtime (see SFX.ts), so the whole system is safe to
 * ship before any audio assets land.
 *
 * Keep this list in sync with SfxName below — the type is the contract games
 * code against; the map is what actually exists on disk today.
 */

/** Every semantic sound a game may request. Stable API surface. */
export type SfxName =
  | 'tap'
  | 'hit'
  | 'combo'
  | 'fail'
  | 'tick'
  | 'win'
  | 'lose'
  | 'star'
  | 'countdown'
  | 'go'
  | 'whoosh'
  | 'coin';

/**
 * A require()'d audio module. expo-av accepts `number` (the Metro asset id)
 * as the source for Audio.Sound.createAsync.
 */
export type SfxAsset = number;

/**
 * Present sounds only. Missing names fall back to silence.
 *
 * Intentionally empty until audio assets are produced (asset pipeline,
 * Component 4). Uncomment entries as files land — no code change needed
 * elsewhere.
 */
export const SFX_MANIFEST: Partial<Record<SfxName, SfxAsset>> = {
  // tap: require('./tap.mp3'),
  // hit: require('./hit.mp3'),
  // combo: require('./combo.mp3'),
  // fail: require('./fail.mp3'),
  // tick: require('./tick.mp3'),
  // win: require('./win.mp3'),
  // lose: require('./lose.mp3'),
  // star: require('./star.mp3'),
  // countdown: require('./countdown.mp3'),
  // go: require('./go.mp3'),
  // whoosh: require('./whoosh.mp3'),
  // coin: require('./coin.mp3'),
};
