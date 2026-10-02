/**
 * modes/album.ts: the collection album (design 5.6, Card-Jitsu / TCG Pocket).
 *
 * Every face you match fills its slot on that deck's page. A face foils after
 * FOIL_AT lifetime recall matches of it, so the collection grows from playing
 * well, not from grinding luck. A PERFECT run adds a sparkle edge to the deck.
 * Ride pages get a stamp from an at-or-under-par Daily on that ride's deck.
 * A full foil deck unlocks its gold card back and a gold token rim.
 *
 * Pure reducer here; persistence in storage.ts (AsyncStorage, cosmetic only).
 */

export const FOIL_AT = 5;
export const ALBUM_VERSION = 1;

export interface AlbumFace {
  /** Lifetime matches of this face. */
  m: number;
  /** Lifetime recall matches (foil progress). */
  r: number;
}

export interface AlbumDeck {
  faces: Record<string, AlbumFace>;
  perfect: boolean;
}

export interface AlbumStamp {
  day: string;
  deck: string;
  label: string;
}

export interface Album {
  v: number;
  decks: Record<string, AlbumDeck>;
  stamps: Record<string, AlbumStamp>;
}

export function emptyAlbum(): Album {
  return { v: ALBUM_VERSION, decks: {}, stamps: {} };
}

export interface RunMatch {
  /** Deck face index (specials such as the Golden Coin and gulls are not collected). */
  face: number;
  recall: boolean;
}

export interface AlbumDelta {
  album: Album;
  newCards: number[];
  newFoils: number[];
  /** Face -> recall count after this run for faces one recall from foil. */
  nearFoil: number[];
  /** This run completed the deck's foil set (gold back + token rim). */
  foilDeckDone: boolean;
  newPerfect: boolean;
}

function cloneDeck(d: AlbumDeck | undefined): AlbumDeck {
  const faces: Record<string, AlbumFace> = {};
  if (d) for (const k of Object.keys(d.faces)) faces[k] = { ...d.faces[k] };
  return { faces, perfect: !!d?.perfect };
}

export function isFoil(f: AlbumFace | undefined): boolean {
  return !!f && f.r >= FOIL_AT;
}

/** Record a run's matches for one deck. `deckSize` is the number of faces on the page. */
export function recordRun(album: Album, deckId: string, deckSize: number, matches: readonly RunMatch[], perfect: boolean): AlbumDelta {
  const before = album.decks[deckId];
  const deck = cloneDeck(before);
  const newCards: number[] = [];
  const newFoils: number[] = [];
  for (const mt of matches) {
    if (mt.face < 0 || mt.face >= deckSize) continue;
    const key = String(mt.face);
    const f = deck.faces[key] ?? { m: 0, r: 0 };
    const wasFoil = isFoil(f);
    if (f.m === 0 && newCards.indexOf(mt.face) < 0) newCards.push(mt.face);
    f.m += 1;
    if (mt.recall) f.r += 1;
    if (!wasFoil && isFoil(f)) newFoils.push(mt.face);
    deck.faces[key] = f;
  }
  const wasDone = foilDeckComplete(before, deckSize);
  const newPerfect = perfect && !deck.perfect;
  if (perfect) deck.perfect = true;
  const next: Album = { ...album, decks: { ...album.decks, [deckId]: deck } };
  const nearFoil: number[] = [];
  for (let i = 0; i < deckSize; i++) {
    const f = deck.faces[String(i)];
    if (f && f.r === FOIL_AT - 1) nearFoil.push(i);
  }
  return { album: next, newCards, newFoils, nearFoil, foilDeckDone: !wasDone && foilDeckComplete(deck, deckSize), newPerfect };
}

export function collected(deck: AlbumDeck | undefined, deckSize: number): number {
  if (!deck) return 0;
  let n = 0;
  for (let i = 0; i < deckSize; i++) if ((deck.faces[String(i)]?.m ?? 0) > 0) n++;
  return n;
}

export function foils(deck: AlbumDeck | undefined, deckSize: number): number {
  if (!deck) return 0;
  let n = 0;
  for (let i = 0; i < deckSize; i++) if (isFoil(deck.faces[String(i)])) n++;
  return n;
}

export function foilDeckComplete(deck: AlbumDeck | undefined, deckSize: number): boolean {
  return deckSize > 0 && foils(deck, deckSize) === deckSize;
}

/** Stamp a ride page. Returns the same album when that ride already has a stamp. */
export function stampRide(album: Album, rideKey: string, stamp: AlbumStamp): { album: Album; isNew: boolean } {
  if (album.stamps[rideKey]) return { album, isNew: false };
  return { album: { ...album, stamps: { ...album.stamps, [rideKey]: stamp } }, isNew: true };
}

/** Defensive parse of a stored album (unknown versions start fresh). */
export function parseAlbum(raw: string | null): Album {
  if (!raw) return emptyAlbum();
  try {
    const a = JSON.parse(raw) as Album;
    if (!a || a.v !== ALBUM_VERSION || typeof a.decks !== 'object' || typeof a.stamps !== 'object') return emptyAlbum();
    return a;
  } catch {
    return emptyAlbum();
  }
}

/** A stable ride key for stamps (no trademarked names are ever displayed from it). */
export function rideKeyFor(taskName?: string | null): string | null {
  if (!taskName) return null;
  const k = taskName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return k || null;
}
