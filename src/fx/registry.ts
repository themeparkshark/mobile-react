import GEOMETRY from './geometry.json';
import { KIT, KitItem, kitSides } from './kit';

/**
 * Secret Shop animated items (secret-shop/DESIGN.md 8). An item with an
 * `fx_key` this build knows plays its rig on the shark; any other key (a newer
 * server) falls back to the item's paper_url, which is the rig's rest frame.
 */
/** The launch set (Night Flight, October 2026): hand-written rigs. */
export const CORE_KEYS = ['jetpack', 'plasma_blade', 'reef_halo', 'saucer', 'midway_fireworks', 'ghost_lantern'] as const;
/**
 * Wave 2 (secret-shop/DESIGN-WAVE2.md): the Pumpkin Rocket Pack rides the jetpack rig; the rest
 * are kit items (src/fx/kit.json, drawn by rigs/Kit.tsx). A test checks this list against kit.json.
 */
export const WAVE2_KEYS = [
  // Batch 1
  'pumpkin_pack', 'plaid_backpack', 'swirl_specs', 'bubble_wand', 'pocket_dragon', 'snow_globe',
  // Batch 2 (Dustin: "spinny propeller hat as well as more animated head items")
  'propeller_hat', 'wizard_hat', 'firework_crown', 'heart_halo', 'party_hat', 'holo_cape',
  // Batch 3
  'top_hat', 'snow_beanie', 'glow_boppers', 'cocoa_mug', 'love_bug', 'storm_surge',
  // Batch 4
  'pumpkin_cap', 'blossom_crown', 'cloud_halo', 'butterfly_wings', 'heart_balloon', 'starlight_wand',
  // Batch 5
  'chef_hat', 'party_popper', 'neon_visor', 'snorkel_mask', 'coaster_buddy', 'splash_zone',
] as const;
export const FX_KEYS = [...CORE_KEYS, ...WAVE2_KEYS] as const;
export type FxKey = typeof FX_KEYS[number];

/** Kit items, by key (everything in WAVE2_KEYS but the jetpack variants). */
export const FX_KIT: Partial<Record<FxKey, KitItem>> = KIT as Partial<Record<FxKey, KitItem>>;

/** Jetpack-rig variants: the same calm float and boost, other art. */
export const JETPACK_VARIANTS = ['jetpack', 'pumpkin_pack'] as const;

/** full: stages. lite: shop tiles and recordings (the loop, no particles). still: the rest frame only. */
export type FxLod = 'full' | 'lite' | 'still';

export type FxGeometry = typeof GEOMETRY;
export const FX_GEOMETRY: FxGeometry = GEOMETRY;
export const PAPER_W = GEOMETRY.canvas[0];
export const PAPER_H = GEOMETRY.canvas[1];

type Slot = 'neck_item' | 'hand_item' | 'head_item' | 'face_item' | 'background_item';
const fromKit = <T,>(pick: (item: KitItem) => T): Partial<Record<FxKey, T>> =>
  Object.fromEntries(Object.entries(KIT).map(([k, item]) => [k, pick(item)])) as Partial<Record<FxKey, T>>;

/** Which look slot each rig is worn in (the server's item type decides; this is for checks and tests). */
export const FX_SLOT = {
  jetpack: 'neck_item',
  plasma_blade: 'hand_item',
  reef_halo: 'head_item',
  saucer: 'neck_item',
  midway_fireworks: 'background_item',
  ghost_lantern: 'hand_item',
  pumpkin_pack: 'neck_item',
  ...fromKit(item => item.slot),
} as Record<FxKey, Slot>;

/** What each piece does, in words a 7-year-old reads in one breath (try-on sheet). */
export const FX_BLURB = {
  jetpack: 'Rockets fire and your shark floats. Every few seconds: BOOST!',
  plasma_blade: 'Glows, hums and swings with a trail of light.',
  reef_halo: 'Three tiny fish swim circles around your head.',
  saucer: 'Hovers by your fin and beams up sparkles.',
  midway_fireworks: 'Fireworks pop over the midway all night long.',
  ghost_lantern: 'A friendly ghost peeks out to say hi.',
  pumpkin_pack: 'A jack-o-lantern rocket! Your shark floats, then BOOST!',
  ...fromKit(item => item.blurb),
} as Record<FxKey, string>;

/** Each rig's moment: its cue name and how long it lasts (ms). Taps wait until 60% of it has played. */
export const FX_MOMENT = {
  jetpack: { cue: 'boost', ms: 2400 },
  plasma_blade: { cue: 'swing', ms: 4500 * 0.22 },
  reef_halo: { cue: 'flip', ms: 6500 * 0.14 },
  saucer: { cue: 'beam', ms: 5000 * 0.42 },
  midway_fireworks: { cue: 'finale', ms: 9000 * 0.32 },
  ghost_lantern: { cue: 'peek', ms: 6000 * 0.4 },
  pumpkin_pack: { cue: 'pumpkin_boost', ms: 2400 },
  ...fromKit(item => ({ cue: item.moment.cue, ms: item.moment.period * item.moment.length })),
} as Record<FxKey, { cue: string; ms: number }>;

/**
 * Rigs that lift the shark, in fractions of the stage height: the steady hover (rest), the slow
 * bob around it and the boost on top, plus the most it leans (degrees). The one source of truth:
 * the rig's motion (jetpackFloat) and the framing that keeps it in frame (liftFraming) both read
 * it, so a future lifting rig frames itself by adding a row here.
 */
export const FX_LIFT: Partial<Record<FxKey, { readonly rest: number; readonly bob: number; readonly boost: number; readonly lean: number }>> = {
  jetpack: { rest: 0.09, bob: 0.011, boost: 0.033, lean: 2.3 },
  // Wave 2: the pumpkin pack flies on the jetpack's own float (jetpackFloat), so it frames with the same numbers.
  pumpkin_pack: { rest: 0.09, bob: 0.011, boost: 0.033, lean: 2.3 },
};

/** Rigs that also move the shark itself. */
export const FX_FLOATS: Partial<Record<FxKey, number>> = Object.fromEntries(Object.keys(FX_LIFT).map(k => [k, 1]));

/**
 * Where the shark sits in a Playercard box, in fractions: the art starts 5% of the width down,
 * moves about 55% / 85% (its tail), the tallest hat reaches the paper's top and the tail tip and
 * the resting jet flame end at 86% of it. Pads keep the peak off the very edge.
 */
export const SHARK_FRAME = { inset: 0.05, originX: 0.55, originY: 0.85, artTop: 0, headTop: 0.183, artBottom: 0.86,
  padTop: 0.06, padBottom: 0.02, sink: 0.05, rise: 0.07 } as const;

/** Small cards (profile rows, recaps) float less: full lift from 240 pt tall, half at 120 pt or less. */
export function liftScaleFor(height: number): number {
  return height >= 240 ? 1 : Math.max(0.5, height / 240);
}

export interface LiftFraming {
  /** Scale about the tail (1 = untouched). */
  readonly scale: number;
  /** px the resting shark moves: down into the room under the tail, or up (negative) over a plinth with headroom. */
  readonly shift: number;
  /** Multiplier on the rig's lift for this card size. */
  readonly lift: number;
}

/**
 * Keeps a lifting rig's whole flight inside its card: at the boost peak the tallest hat stays
 * below the top pad, and at the lowest hover the tail and flame stay above the bottom pad.
 * Uses the room under the tail first (a small sink, never over a plinth), then shrinks the shark
 * slightly about its tail. Pure, so tests can check every card size.
 */
export function liftFraming(fx: Pick<WornFx, 'rigs'>, width: number, height: number, roomAbove = 0, floored = false,
  hatWorn = true): LiftFraming {
  const lifts = fx.rigs.map(r => FX_LIFT[r.key]).filter((l): l is NonNullable<typeof l> => !!l);
  if (lifts.length === 0 || width <= 0 || height <= 0) return { scale: 1, shift: 0, lift: 1 };
  const k = liftScaleFor(height);
  const peak = Math.max(...lifts.map(l => l.rest + l.bob + l.boost)) * k * height;
  const low = Math.min(...lifts.map(l => l.rest - l.bob)) * k * height;
  const lean = Math.max(...lifts.map(l => l.lean));
  const F = SHARK_FRAME;
  const paper = containBox(width, height);
  // Headroom for the tallest hat only when a head piece is worn; otherwise the head top.
  const top = F.inset * width + paper.y + (hatWorn ? F.artTop : F.headTop) * paper.h;
  const bottom = F.inset * width + paper.y + F.artBottom * paper.h;
  const ya = F.originY * height;
  // A lean swings the far top corner down or up by about this much.
  const leanPad = Math.sin((lean * Math.PI) / 180) * Math.max(F.originX, 1 - F.originX) * width;
  const reach = ya - top + peak + leanPad;
  // The frame's top: the card's own top, or higher when the surface shows room above it (a stage's sky).
  const limit = F.padTop * height - Math.max(0, roomAbove);
  // Over a plinth, spare headroom becomes hover height, so the shark reads as flying, not parked.
  const rise = (peakTop: number) => (floored ? Math.min(F.rise * k * height, Math.max(0, peakTop - limit)) : 0);
  if (ya - reach >= limit) return { scale: 1, shift: -rise(ya - reach), lift: k };
  // Room under the tail at the lowest hover, kept above the bottom pad.
  const room = Math.max(0, (1 - F.padBottom) * height - (bottom - low));
  // Over a plinth the hover gap is the point: never sink toward the floor there, only shrink.
  const shift = floored ? 0 : Math.min(F.sink * k * height, room);
  const scale = Math.min(1, (ya + shift - limit) / reach);
  return { scale, shift: shift - rise(ya + shift - scale * reach), lift: k };
}

/** Rigs drawn as the backdrop (they replace the background paper). */
export const FX_SCENES: readonly FxKey[] = ['midway_fireworks', ...(Object.keys(KIT) as FxKey[]).filter(k => KIT[k].slot === 'background_item')];

/** Which layers each rig draws: behind the shark, in front of the outfit, or as the backdrop. */
export const FX_SIDES = {
  jetpack: ['front'],
  plasma_blade: ['front'],
  reef_halo: ['back', 'front'],
  saucer: ['front'],
  midway_fireworks: ['scene'],
  ghost_lantern: ['back', 'front'],
  pumpkin_pack: ['front'],
  ...fromKit(kitSides),
} as Record<FxKey, readonly ('back' | 'front' | 'scene')[]>;

/** Outfit slots that can carry a rig, back to front (the same order as OUTFIT_LAYER_ORDER). */
export const RIG_SLOTS = ['body_item', 'face_item', 'neck_item', 'hand_item', 'head_item'] as const;
export type RigSlot = typeof RIG_SLOTS[number];

export interface WornFx {
  /** The backdrop's scene rig, if the worn backdrop is animated. */
  readonly scene: FxKey | null;
  /** Animated outfit pieces, back to front. Their paper layer is replaced by the rig. */
  readonly rigs: readonly { slot: RigSlot; key: FxKey }[];
  /** The shark floats (jetpack). */
  readonly floats: boolean;
  readonly any: boolean;
}

type FxCarrier = { readonly fx_key?: string | null } | null | undefined;

/** What animates on this look. Pure: tests and the Playercard share it. */
export function wornFx(inventory: object | null | undefined): WornFx {
  const look = inventory as Record<string, unknown> | null | undefined;
  const rigs: { slot: RigSlot; key: FxKey }[] = [];
  for (const slot of RIG_SLOTS) {
    const key = fxKeyOf(look?.[slot] as FxCarrier);
    if (key && FX_SIDES[key].some(side => side !== 'scene')) rigs.push({ slot, key });
  }
  const sceneKey = fxKeyOf(look?.background_item as FxCarrier);
  const scene = sceneKey && FX_SIDES[sceneKey].includes('scene') ? sceneKey : null;
  const floats = rigs.some(r => !!FX_FLOATS[r.key]);
  return { scene, rigs, floats, any: !!scene || rigs.length > 0 };
}

export function isFxKey(key: unknown): key is FxKey {
  return typeof key === 'string' && (FX_KEYS as readonly string[]).includes(key);
}

/** The rig this build plays for an item, or null (no key, or a key from a newer server). */
export function fxKeyOf(item: { readonly fx_key?: string | null } | null | undefined): FxKey | null {
  const key = item?.fx_key;
  return isFxKey(key) ? key : null;
}

/** A Secret Shop item: animated, or flagged secret by the server. */
export function isSecretItem(item: { readonly fx_key?: string | null; readonly source?: string } | null | undefined): boolean {
  return !!item && (!!item.fx_key || item.source === 'secret');
}

export interface PaperBox { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

/** The paper canvas drawn with contentFit="contain" inside a width x height box. */
export function containBox(width: number, height: number, aspectW = PAPER_W, aspectH = PAPER_H): PaperBox {
  if (width <= 0 || height <= 0) return { x: 0, y: 0, w: 0, h: 0 };
  const scale = Math.min(width / aspectW, height / aspectH);
  const w = aspectW * scale;
  const h = aspectH * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

/** A square backdrop drawn with contentFit="cover" inside a width x height box. */
export function coverBox(width: number, height: number, size = 1): PaperBox {
  const side = Math.max(width, height) * size;
  return { x: (width - side) / 2, y: (height - side) / 2, w: side, h: side };
}

export interface PartSpec {
  readonly cx?: number; readonly cy?: number; readonly w: number;
  readonly ax?: number; readonly ay?: number; readonly rot?: number; readonly aspect?: number;
}

/**
 * Absolute style for a rig part, matching compose.py's place(): the part's
 * anchor (ax, ay) lands on (cx, cy) of the box, rotated clockwise about it.
 */
export function partLayout(box: PaperBox, spec: PartSpec, aspectFallback = 1) {
  const width = spec.w * box.w;
  const height = width * (spec.aspect ?? aspectFallback);
  const ax = spec.ax ?? 0.5;
  const ay = spec.ay ?? 0.5;
  return {
    left: box.x + (spec.cx ?? 0.5) * box.w - ax * width,
    top: box.y + (spec.cy ?? 0.5) * box.h - ay * height,
    width,
    height,
    // Whole pixels: React Native's transformOrigin parser reads integer percents only, so
    // '56.88%' became '88%' and parts turned about the wrong point (the jetpack flame stretch).
    origin: `${Math.round(ax * width)}px ${Math.round(ay * height)}px`,
    rot: spec.rot ?? 0,
  };
}

/**
 * The paper-canvas rectangle a rig's art covers, for tiles that show the
 * item alone (no shark), zoomed so the item fills the tile.
 */
export const FX_FOCUS = {
  jetpack: { cx: 0.63, cy: 0.56, span: 0.56 },
  plasma_blade: { cx: 0.18, cy: 0.4, span: 0.44 },
  reef_halo: { cx: 0.585, cy: 0.21, span: 0.4 },
  saucer: { cx: 0.85, cy: 0.29, span: 0.34 },
  midway_fireworks: { cx: 0.5, cy: 0.5, span: 1 },
  ghost_lantern: { cx: 0.31, cy: 0.58, span: 0.4 },
  pumpkin_pack: { cx: 0.63, cy: 0.56, span: 0.56 },
  ...fromKit(item => item.focus),
} as Record<FxKey, { cx: number; cy: number; span: number }>;

/** A paper box placed so the rig's focus rectangle fills a size x size tile. */
export function focusBox(key: FxKey, size: number): PaperBox {
  const f = FX_FOCUS[key];
  const w = size / f.span;
  const h = w * (PAPER_H / PAPER_W);
  return { x: size / 2 - f.cx * w, y: size / 2 - f.cy * h, w, h };
}

export { hash01, NO_KICK, momentAt, phaseOf, windowOf } from './registry-core';
