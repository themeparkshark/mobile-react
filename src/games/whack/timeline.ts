/**
 * timeline.ts: the deterministic Burst timeline (design 5.1).
 *
 *   buildBurst({ seed, burstIndex, format, difficulty, theme, unlockLevel, xform, walkBoost, incoming })
 *
 * Pure and seed-only: nothing a player does changes a timeline. The client,
 * the ghost renderer and the server replay (PHP port, vectors in __vectors__/)
 * build the identical event list from the same inputs. Tells land on the 8th
 * note grid of the Burst music (EIGHTH_MS), so tells feel musical.
 */

import { createRng, mixSeed, rngFloat, rngInt, type Rng } from '../../gamekit/core/rng';
import { BASIC_FORMATIONS, FORMATIONS, RIDE_FORMATIONS, xformHole } from './formations';
import {
  BOSS_CADENCE, BOSS_HP, EIGHTH_MS, FIRST_CALLOUT, FIRST_TELL_MS, GAP_SCALE, HELMET_EXT_MS, K_ANGLER, K_BRUISER,
  K_FINN, K_GOLDEN, K_HELMET, K_PUFFER, K_SPRINTER, K_TENTACLE, K_TWIN, RIDE_ANGLER_FROM, RIDE_BRUISER_EVERY,
  RIDE_BRUISER_FROM, SHAPES, TELL_MS, UNLOCK, quantize, upTimeFor,
  type BurstShape, type BurstShapeId, type Difficulty, type WhackFormat,
} from './waves';

export type WhackThemeId = 'park' | 'pirates' | 'mansion' | 'space' | 'jungle' | 'backlot';
export type WalkBoost = 'golden' | 'meter' | null;

export interface SpawnEvent {
  id: number;
  tellAt: number;
  emergeAt: number;
  duckAt: number;
  hole: number;
  kind: number;
  /** Formation id + 1 (0 = free spawn). */
  formation: number;
  /** First step of its formation (path dots preview anchor). */
  formationLead: boolean;
  linkId: number;
  first: boolean;
}

// Attack types (boss and duel sabotage).
export const A_INK = 1;
export const A_FADE = 2;
export const A_SCAN = 3;
export const A_CANDY = 4;

export interface Attack {
  id: number;
  type: number;
  tellAt: number;
  landAt: number;
  hole: number;
  hole2: number;
  row: number;
}

export const BOSS_KRAKEN = 0;
export const BOSS_GHOST = 1;
export const BOSS_ROBO = 2;
export const BOSS_NAMES = ['THE KRAKEN', 'GHOST SQUID', 'ROBO-SHARK'];

export function bossForTheme(theme: WhackThemeId): number {
  if (theme === 'mansion') return BOSS_GHOST;
  if (theme === 'space' || theme === 'backlot') return BOSS_ROBO;
  return BOSS_KRAKEN;
}

export interface BurstInput {
  seed: number;
  burstIndex: number;
  format: WhackFormat;
  difficulty: Difficulty;
  theme: WhackThemeId;
  /** Lifetime Bursts played before this Run (server profile). */
  unlockLevel: number;
  xform?: number;
  walkBoost?: WalkBoost;
  /** Duel sabotage queued by the rival's previous Burst (10.2 A). */
  incoming?: { matchSeed: number; senderEventIds: number[] } | null;
}

export interface Timeline {
  input: BurstInput;
  burstSeed: number;
  shape: BurstShapeId;
  lengthMs: number;
  banner: string;
  callout: string | null;
  /** Lifetime Burst number (1-based) that gates the roster. */
  lifetime: number;
  difficulty: Difficulty;
  ride: boolean;
  butterfingers: boolean;
  fever: boolean;
  boss: boolean;
  /**
   * Auto Look-Up on (every solo format). Off for live party rounds: the room's
   * clock is shared, so a look-up is a personal HOLD there, never a freeze.
   */
  lookUp: boolean;
  bossKind: number;
  bossHp: number;
  meterStart: number;
  events: SpawnEvent[];
  attacks: Attack[];
}

/** Lifetime number used for roster gating. Shared seeds (daily/weekly) give everyone the same roster. */
export function lifetimeFor(input: BurstInput): number {
  if (input.format === 'daily' || input.format === 'weekly') return 19;
  if (input.format === 'duel') return Math.max(1, input.unlockLevel);
  if (input.format === 'raid') return 19;
  // Live party rounds: everyone gets the same roster (formations, helmets, twins, sprinters; no puffer).
  if (input.format === 'party') return 9;
  return Math.max(0, input.unlockLevel) + input.burstIndex + 1;
}

export function shapeFor(input: BurstInput, lifetime: number): BurstShapeId {
  const i = input.burstIndex;
  switch (input.format) {
    case 'ride': return 'ride';
    case 'raid': return 'raid';
    case 'party': return 'party';
    case 'duel': return (['b2', 'b3', 'b4'] as const)[Math.min(2, i)];
    case 'daily': return (['b2', 'b3', 'b5'] as const)[Math.min(2, i)];
    default: {
      const s = (['b1', 'b2', 'b3', 'b4'] as const)[i];
      if (s) return s;
      return lifetime >= UNLOCK.boss ? 'b5' : 'rush';
    }
  }
}

interface Builder {
  rng: Rng;
  d: Difficulty;
  events: SpawnEvent[];
  quiet: [number, number][];
  lengthMs: number;
}

function upWindow(e: SpawnEvent): number {
  return e.duckAt + (e.kind === K_HELMET ? HELMET_EXT_MS : 0);
}

/** A hole can take a new tell at `tell` if no event occupies it (plus clear time for the bonk animation). */
function holeFree(b: Builder, hole: number, tell: number, until: number): boolean {
  for (const e of b.events) {
    if (e.hole !== hole) continue;
    const busyTo = upWindow(e) + 400;
    if (tell < busyTo && until + 400 > e.tellAt) return false;
  }
  return true;
}

function upCount(b: Builder, at: number): number {
  let n = 0;
  for (const e of b.events) if (e.tellAt <= at && at < upWindow(e)) n++;
  return n;
}

function makeEvent(b: Builder, tellAt: number, hole: number, kind: number, opts: { first?: boolean; formation?: number; lead?: boolean; link?: number } = {}): SpawnEvent {
  const tell = opts.first ? FIRST_TELL_MS : TELL_MS[kind];
  const emergeAt = tellAt + tell;
  return {
    id: 0, tellAt, emergeAt, duckAt: emergeAt + upTimeFor(kind, b.d), hole, kind,
    formation: opts.formation ?? 0, formationLead: !!opts.lead, linkId: opts.link ?? 0, first: !!opts.first,
  };
}

function place(b: Builder, at: number, kind: number, preferred: number[] | null, opts: { first?: boolean; link?: number } = {}): SpawnEvent | null {
  for (let shift = 0; shift < 8; shift++) {
    const t = quantize(at + shift * EIGHTH_MS);
    const probe = makeEvent(b, t, 0, kind, opts);
    const pool = preferred ?? [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const free = pool.filter((h) => holeFree(b, h, t, upWindow(probe)));
    if (free.length === 0) continue;
    const hole = preferred ? free[0] : free[rngInt(b.rng, 0, free.length - 1)];
    const e = { ...probe, hole };
    b.events.push(e);
    return e;
  }
  return null;
}

function placeFormation(b: Builder, at: number, fid: number, lifetime: number, previewMs: number): void {
  const f = FORMATIONS[fid];
  const base = quantize(at);
  let last = base;
  for (let k = 0; k < f.steps.length; k++) {
    const [hole, eighths, kindOverride] = f.steps[k];
    const t = quantize(base + eighths * EIGHTH_MS);
    let kind = kindOverride >= 0 ? kindOverride : K_FINN;
    if (kind === K_FINN && lifetime >= UNLOCK.helmet && f.steps.length <= 3 && k === f.steps.length - 1 && rngFloat(b.rng) < 0.3) kind = K_HELMET;
    const e = makeEvent(b, t, hole, kind, { formation: fid + 1, lead: k === 0, link: kind === K_TWIN ? 100 + fid * 10 + Math.floor(eighths / 2) : 0 });
    if (!holeFree(b, hole, t, upWindow(e))) continue;
    b.events.push(e);
    last = Math.max(last, t);
  }
  b.quiet.push([base - previewMs - 500, last + 700]);
}

function formationPool(input: BurstInput, lifetime: number): number[] {
  if (input.format === 'ride') return RIDE_FORMATIONS;
  if (lifetime < UNLOCK.allFormations) return BASIC_FORMATIONS;
  return FORMATIONS.filter((f) => (!f.twins || lifetime >= UNLOCK.twins) && (!f.trap || lifetime >= UNLOCK.angler)).map((f) => f.id);
}

/** Walk Charge boosts apply to queue formats only (never ride, duel or raid). */
export function walkOk(format: WhackFormat): boolean {
  return format === 'queue' || format === 'daily' || format === 'weekly';
}

const TWIN_PAIRS = [[3, 5], [0, 2], [6, 8], [1, 7], [0, 8], [2, 6]];

export function buildBurst(input: BurstInput): Timeline {
  const d = input.difficulty;
  const lifetime = lifetimeFor(input);
  const shapeId = shapeFor(input, lifetime);
  const base: BurstShape = SHAPES[shapeId];
  const lengthMs = input.format === 'duel' ? 15000 : base.lengthMs;
  const burstSeed = mixSeed(input.seed >>> 0, (input.burstIndex + 1) >>> 0);
  const rng = createRng(burstSeed);
  const b: Builder = { rng, d, events: [], quiet: [], lengthMs };
  const ride = input.format === 'ride';
  const queueFirsts = input.format === 'queue';
  const first = queueFirsts ? lifetime : -1;
  const scale = GAP_SCALE[d];
  const has = (k: keyof typeof UNLOCK) => ride ? false : lifetime >= UNLOCK[k];
  const anglersOn = ride || has('angler');

  // 1. First encounters (queue only): one new thing, alone, with a long tell.
  if (first === UNLOCK.angler) { place(b, 2000, K_ANGLER, [4], { first: true }); b.quiet.push([1300, 3600]); }
  if (first === UNLOCK.golden) { place(b, 2400, K_GOLDEN, [4], { first: true }); b.quiet.push([1700, 4000]); }
  if (first === UNLOCK.helmet) { place(b, 2000, K_HELMET, [4], { first: true }); b.quiet.push([1300, 4000]); }
  if (first === UNLOCK.twins) {
    place(b, 2000, K_TWIN, [3], { first: true, link: 1 });
    place(b, 2000, K_TWIN, [5], { first: true, link: 1 });
    b.quiet.push([1300, 3800]);
  }
  if (first === UNLOCK.sprinter) { place(b, 3000, K_SPRINTER, [4], { first: true }); b.quiet.push([1500, 4200]); }
  if (first === UNLOCK.puffer) { place(b, 2000, K_PUFFER, [4], { first: true }); b.quiet.push([1300, 3800]); }

  // 2. Formations.
  const slots = [...base.formations];
  if (first === UNLOCK.formations) slots.unshift(4200);
  if (ride || has('formations') || first === UNLOCK.formations) {
    const pool = formationPool(input, lifetime);
    let lastPick = -1;
    for (const s of slots) {
      let fid = pool[rngInt(rng, 0, pool.length - 1)];
      if (fid === lastPick && pool.length > 1) fid = pool[(pool.indexOf(fid) + 1) % pool.length];
      lastPick = fid;
      placeFormation(b, s, fid, lifetime, first === UNLOCK.formations && s === slots[0] ? 400 : 300);
    }
  }

  // 3. Goldens (seeded within +-2 beats of the window), walk boost, fever intro.
  const goldenOn = ride || has('golden');
  if (goldenOn) {
    for (const [from, to] of base.goldens) place(b, from + rngFloat(rng) * (to - from), K_GOLDEN, null);
  }
  if (first === UNLOCK.fever && !base.goldens.some(([a]) => a < 5000)) place(b, 2600, K_GOLDEN, null);
  if (input.walkBoost === 'golden' && walkOk(input.format)) place(b, 2000 + rngFloat(rng) * 1500, K_GOLDEN, null);

  // 4. Tricksters (B4): seeded from the unlocked set.
  if (base.tricksters.length) {
    const pool: number[] = [];
    if (has('sprinter')) pool.push(K_SPRINTER);
    if (has('twins')) pool.push(K_TWIN);
    if (has('puffer') && input.format === 'queue') pool.push(K_PUFFER);
    let prev = -1;
    for (const s of base.tricksters) {
      if (!pool.length) break;
      let k = pool[rngInt(rng, 0, pool.length - 1)];
      if (k === prev && pool.length > 1) k = pool[(pool.indexOf(k) + 1) % pool.length];
      prev = k;
      if (k === K_TWIN) {
        const t = quantize(s);
        const order = TWIN_PAIRS.map((p, i) => [p, (i * 7 + rngInt(rng, 0, 5)) % 6] as const).sort((x, y) => x[1] - y[1]);
        for (const [pair] of order) {
          const a = makeEvent(b, t, pair[0], K_TWIN);
          if (holeFree(b, pair[0], t, upWindow(a)) && holeFree(b, pair[1], t, upWindow(a))) {
            const link = 10 + Math.round(s / 100);
            b.events.push({ ...a, linkId: link }, { ...makeEvent(b, t, pair[1], K_TWIN), linkId: link });
            break;
          }
        }
      } else {
        place(b, s, k, null);
      }
      b.quiet.push([s - 500, s + 900]);
    }
  }

  // 5. Ride finale: the Bruiser pops from seeded holes (one 6-HP Bruiser).
  if (ride) {
    for (let t = RIDE_BRUISER_FROM; t < lengthMs - 1400; t += RIDE_BRUISER_EVERY) place(b, t, K_BRUISER, null);
  }

  // 6. Free spawns: gap eases from gapFrom to gapTo, capped at maxUp live targets.
  let t = base.startMs;
  let lastHole = -1;
  const stopAt = lengthMs - 900;
  while (t < stopAt) {
    const q = b.quiet.find(([a, z]) => t >= a && t < z);
    if (q) { t = q[1]; continue; }
    const p = t / lengthMs;
    let gap = (base.gapFrom + (base.gapTo - base.gapFrom) * p) * scale;
    let maxUp = Math.round(base.maxUpFrom + (base.maxUpTo - base.maxUpFrom) * p);
    if (base.boss && d === 3) maxUp += 1;
    if (ride && t >= RIDE_BRUISER_FROM) { gap = 1000 * scale; maxUp = 2; }
    const tq = quantize(t);
    const r = rngFloat(rng);
    let kind = K_FINN;
    if (base.boss && r < base.tentacle) kind = K_TENTACLE;
    else if (anglersOn && (!ride || t >= RIDE_ANGLER_FROM) && r < base.tentacle + base.angler) kind = K_ANGLER;
    else if (has('helmet') && r < base.tentacle + base.angler + base.helmet) kind = K_HELMET;
    const probe = makeEvent(b, tq, 0, kind);
    if (upCount(b, probe.emergeAt) >= maxUp) { t += EIGHTH_MS; continue; }
    const free: number[] = [];
    for (let h = 0; h < 9; h++) if (h !== lastHole && holeFree(b, h, tq, upWindow(probe))) free.push(h);
    if (!free.length) { t += EIGHTH_MS; continue; }
    const hole = free[rngInt(rng, 0, free.length - 1)];
    b.events.push({ ...probe, hole });
    lastHole = hole;
    t += gap * (0.85 + 0.3 * rngFloat(rng));
  }

  // 7. Order, ids, symmetry.
  const x = (input.xform ?? 0) & 7;
  const events = b.events
    .filter((e) => e.tellAt < lengthMs - 600)
    .sort((a, z) => a.tellAt - z.tellAt || a.hole - z.hole)
    .map((e, i) => ({ ...e, id: i, hole: xformHole(e.hole, x) }));

  // 8. Attacks: boss cadence, or duel sabotage splats.
  const attacks: Attack[] = [];
  const bossKind = bossForTheme(input.theme);
  if (base.boss) {
    const cadence = BOSS_CADENCE[d];
    const arng = createRng(mixSeed(burstSeed, 0xb055));
    for (let at = base.startMs + 1000; at < lengthMs - 1800; at += cadence) {
      const type = bossKind === BOSS_GHOST ? A_FADE : bossKind === BOSS_ROBO ? A_SCAN : A_INK;
      const tell = type === A_INK ? 700 : type === A_FADE ? 500 : 450;
      const hole = rngInt(arng, 0, 8);
      let hole2 = rngInt(arng, 0, 7);
      if (hole2 >= hole) hole2 += 1;
      attacks.push({ id: attacks.length, type, tellAt: Math.round(at), landAt: Math.round(at + tell), hole: xformHole(hole, x), hole2: xformHole(hole2, x), row: rngInt(arng, 0, 2) });
    }
  }
  if (input.incoming && input.incoming.senderEventIds.length) {
    const { matchSeed, senderEventIds } = input.incoming;
    senderEventIds.slice(0, 3).forEach((sender, j) => {
      const h = mixSeed(matchSeed >>> 0, sender >>> 0);
      const landAt = 2500 + j * 3500 + (h % 8) * 232;
      attacks.push({ id: attacks.length, type: A_CANDY, tellAt: landAt - 600, landAt, hole: mixSeed(h, j + 1) % 9, hole2: -1, row: -1 });
    });
  }
  attacks.sort((a, z) => a.tellAt - z.tellAt || a.id - z.id);
  attacks.forEach((a, i) => { a.id = i; });

  let callout: string | null = null;
  if (first >= 1 && FIRST_CALLOUT[first] && (first !== UNLOCK.boss || base.boss)) callout = FIRST_CALLOUT[first];
  if (first === UNLOCK.golden) callout = 'GOLDEN FINN! BONK IT FAST';

  return {
    input, burstSeed, shape: shapeId, lengthMs,
    banner: base.banner,
    callout,
    lifetime,
    difficulty: d,
    ride,
    butterfingers: ride || lifetime >= UNLOCK.butterfingers,
    fever: !ride && lifetime >= UNLOCK.fever,
    boss: base.boss,
    lookUp: input.format !== 'party',
    bossKind,
    bossHp: base.boss ? (input.format === 'raid' ? BOSS_HP[d] + 8 : BOSS_HP[d]) : 0,
    meterStart: input.walkBoost === 'meter' && walkOk(input.format) ? 50 : 0,
    events,
    attacks,
  };
}

/** Every Burst of a Run, each on its own derived seed. */
export function buildRun(base: Omit<BurstInput, 'burstIndex'>, count: number): Timeline[] {
  const out: Timeline[] = [];
  for (let i = 0; i < count; i++) out.push(buildBurst({ ...base, burstIndex: i }));
  return out;
}

/** Stable text fingerprint of a timeline (golden vectors; the PHP port hashes the same string). */
export function timelineFingerprint(tl: Timeline): string {
  const ev = tl.events.map((e) => `${e.id}:${e.tellAt}:${e.emergeAt}:${e.duckAt}:${e.hole}:${e.kind}:${e.formation}:${e.linkId}:${e.first ? 1 : 0}`).join(',');
  const at = tl.attacks.map((a) => `${a.type}:${a.tellAt}:${a.landAt}:${a.hole}:${a.hole2}:${a.row}`).join(',');
  return `${tl.shape}|${tl.lengthMs}|${tl.bossHp}|${tl.meterStart}|${ev}|${at}`;
}

export { K_BRUISER, K_TENTACLE };
