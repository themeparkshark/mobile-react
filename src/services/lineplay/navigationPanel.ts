/**
 * Signal Repair: an original circuit puzzle. No attraction facts, clock,
 * network or reward math. Every board is generated from (seed, round): a
 * seeded self-avoiding route crosses the grid from the entry port to the exit
 * port, three star relays sit on it, and every other tile is a decoy. Tiles
 * start scrambled (at least three route tiles are wrong) and the guest turns
 * them until the signal flows through all three stars to the exit.
 */
export interface NavigationPanelProgress {
  readonly round: number;
  readonly rotations: readonly number[];
  readonly taps: number;
}
export interface NavigationPanel {
  /** Grid edge length: 3 for a first repair, 4 once the crew warms up. */
  readonly size: number;
  readonly masks: readonly number[];
  readonly route: readonly number[];
  readonly relays: readonly number[];
  /** Tile index whose west edge takes the incoming signal. */
  readonly entry: number;
  /** Tile index whose east edge must carry the signal out. */
  readonly exit: number;
  readonly name: string;
}
export const PANEL_PORTS = { north: 1, east: 2, south: 4, west: 8 } as const;
/** Most taps a fresh board can need: one-thumb play stays short. */
const PAR_CAP_3 = 8;
const PAR_CAP_4 = 12;
const NAMES = ['Comet crossing', 'Moon loop', 'Nebula weave', 'Starlight switchback',
  'Orbit ladder', 'Meteor zigzag', 'Aurora bend', 'Pulsar spiral'];

function rng(seed: number): () => number {
  let value = (seed >>> 0) || 0x9e3779b9;
  return () => {
    value ^= value << 13; value >>>= 0;
    value ^= value >>> 17;
    value ^= value << 5; value >>>= 0;
    return value;
  };
}

export function rotatePanelMask(mask: number, turns: number): number {
  let result = mask;
  for (let turn = 0; turn < ((turns % 4) + 4) % 4; turn++) result = ((result << 1) & 15) | (result >> 3);
  return result;
}

/** Board size for a seed and round: first repairs are 3x3, replays grow to 4x4. */
export function panelSizeFor(seed: number, round = 0): number {
  return round >= 1 || (((seed >>> 0) >>> 3) & 1) === 1 ? 4 : 3;
}

function direction(from: number, to: number, size: number): number {
  return to === from - size ? 1 : to === from + 1 ? 2 : to === from + size ? 4 : 8;
}

function neighbors(index: number, size: number): number[] {
  const row = Math.floor(index / size), column = index % size;
  const out: number[] = [];
  if (row > 0) out.push(index - size);
  if (column < size - 1) out.push(index + 1);
  if (row < size - 1) out.push(index + size);
  if (column > 0) out.push(index - 1);
  return out;
}

/** Seeded self-avoiding walk from entry to exit, at least minLength tiles. */
function buildRoute(next: () => number, size: number, entry: number, exit: number, minLength: number): number[] {
  const maxLength = size === 3 ? 7 : 10;
  for (let attempt = 0; attempt < 64; attempt++) {
    const path = [entry];
    const seen = new Set(path);
    let budget = 400;
    const walk = (): boolean => {
      if (budget-- <= 0) return false;
      const here = path[path.length - 1];
      if (here === exit) return path.length >= minLength;
      if (path.length >= maxLength) return false;
      const options = neighbors(here, size).filter(cell => !seen.has(cell));
      for (let i = options.length - 1; i > 0; i--) {
        const j = next() % (i + 1);
        [options[i], options[j]] = [options[j], options[i]];
      }
      for (const cell of options) {
        path.push(cell); seen.add(cell);
        if (walk()) return true;
        path.pop(); seen.delete(cell);
      }
      return false;
    };
    if (walk()) return path;
  }
  // Unreachable in practice; a straight row keeps the board playable.
  const row = Math.floor(entry / size);
  return Array.from({ length: size }, (_, column) => row * size + column);
}

export function createNavigationPanel(seed: number, round = 0): NavigationPanel {
  const size = panelSizeFor(seed, round);
  const next = rng(((seed >>> 0) ^ Math.imul(round + 1, 0x85ebca6b)) >>> 0);
  // Mix the stream a little so neighbouring seeds do not share a first draw.
  next(); next();
  const entryRow = next() % size;
  let exitRow = next() % size;
  if (size === 3 && entryRow === exitRow && next() % 2 === 0) exitRow = (exitRow + 1) % size;
  const entry = entryRow * size;
  const exit = exitRow * size + size - 1;
  const route = buildRoute(next, size, entry, exit, size + 2);
  const masks: number[] = Array.from({ length: size * size }, () => {
    const straight = next() % 2 === 0;
    return rotatePanelMask(straight ? 5 : 3, next() % 4);
  });
  route.forEach((index, step) => {
    masks[index] = (step === 0 ? 8 : direction(index, route[step - 1], size)) |
      (step === route.length - 1 ? 2 : direction(index, route[step + 1], size));
  });
  const relays = [route[1], route[Math.floor(route.length / 2)], route[route.length - 2]];
  return { size, masks, route, relays, entry, exit,
    name: NAMES[(((seed >>> 0) % NAMES.length) + round) % NAMES.length] };
}

export function traceNavigationPanel(panel: NavigationPanel, rotations: readonly number[]) {
  const size = panel.size;
  const masks = panel.masks.map((mask, index) => rotatePanelMask(mask, rotations[index] ?? 0));
  const connected = new Set<number>();
  /** Order in which the signal reaches each tile, for the flow animation. */
  const depth: Record<number, number> = {};
  const pending: Array<[number, number]> = masks[panel.entry] & 8 ? [[panel.entry, 0]] : [];
  while (pending.length) {
    const [index, level] = pending.shift()!;
    if (connected.has(index)) continue;
    connected.add(index);
    depth[index] = level;
    const row = Math.floor(index / size), column = index % size;
    const around = [[1, index - size, 4, row > 0], [2, index + 1, 8, column < size - 1],
      [4, index + size, 1, row < size - 1], [8, index - 1, 2, column > 0]] as const;
    for (const [port, other, opposite, inside] of around)
      if (inside && (masks[index] & port) && (masks[other] & opposite)) pending.push([other, level + 1]);
  }
  const signals = panel.relays.filter(index => connected.has(index)).length;
  const reachesExit = connected.has(panel.exit) && !!(masks[panel.exit] & 2);
  return { masks, connected: [...connected], depth, signals, reachesExit, solved: signals === 3 && reachesExit };
}

export function createNavigationPanelProgress(seed: number, round = 0, alreadyComplete = false): NavigationPanelProgress {
  const panel = createNavigationPanel(seed, round);
  const tiles = panel.size * panel.size;
  if (alreadyComplete) return { round, rotations: Array(tiles).fill(0), taps: 0 };
  const next = rng(((seed >>> 0) ^ Math.imul(round + 1, 0x9e3779b9)) >>> 0);
  const rotations = Array.from({ length: tiles }, () => next() % 4);
  const wrong = panel.route.filter(index => rotatePanelMask(panel.masks[index], rotations[index]) !== panel.masks[index]);
  // Every round starts with work to do; no pre-solved board or single lucky tap.
  for (const index of panel.route) {
    if (wrong.length >= 3) break;
    if (!wrong.includes(index)) { rotations[index] = 1; wrong.push(index); }
  }
  // Keep a round glanceable while shuffling forward in line: cap the repair
  // work so a 4x4 board is still a 30-60 second job.
  const cap = panel.size === 3 ? PAR_CAP_3 : PAR_CAP_4;
  const turnsNeeded = (index: number) => {
    for (let turns = 0; turns < 4; turns++)
      if (rotatePanelMask(panel.masks[index], rotations[index] + turns) === panel.masks[index]) return turns;
    return 0;
  };
  let total = panel.route.reduce((sum, index) => sum + turnsNeeded(index), 0);
  while (total > cap) {
    const stillWrong = panel.route.filter(index => turnsNeeded(index) > 0);
    const heaviest = stillWrong.reduce((best, index) => turnsNeeded(index) > turnsNeeded(best) ? index : best);
    const turns = turnsNeeded(heaviest);
    // Fix a tile outright while at least three stay broken; otherwise leave it one tap away.
    const keep = stillWrong.length > 3 ? 0 : 1;
    if (turns <= keep) break;
    total -= turns - keep;
    rotations[heaviest] = (rotations[heaviest] + turns - keep) % 4;
  }
  return { round, rotations, taps: 0 };
}

export function turnNavigationTile(seed: number, progress: NavigationPanelProgress, index: number): NavigationPanelProgress {
  if (!Number.isInteger(index) || index < 0 || index >= progress.rotations.length ||
      traceNavigationPanel(createNavigationPanel(seed, progress.round), progress.rotations).solved) return progress;
  return { ...progress, taps: Math.min(2000, progress.taps + 1),
    rotations: progress.rotations.map((turn, tile) => tile === index ? (turn + 1) % 4 : turn) };
}

export function nextNavigationRepair(panel: NavigationPanel, progress: NavigationPanelProgress): number | null {
  return panel.route.find(index => rotatePanelMask(panel.masks[index], progress.rotations[index]) !== panel.masks[index]) ?? null;
}

/** Fewest taps that can solve this round from its scrambled start. */
export function navigationPanelPar(seed: number, round: number): number {
  const panel = createNavigationPanel(seed, round);
  const start = createNavigationPanelProgress(seed, round);
  return panel.route.reduce((sum, index) => {
    for (let turns = 0; turns < 4; turns++)
      if (rotatePanelMask(panel.masks[index], start.rotations[index] + turns) === panel.masks[index]) return sum + turns;
    return sum;
  }, 0);
}

/** Three stars at par, two within double par, one for any repair. */
export function navigationPanelStars(seed: number, progress: NavigationPanelProgress): number {
  const par = Math.max(1, navigationPanelPar(seed, progress.round));
  return progress.taps <= par ? 3 : progress.taps <= par * 2 ? 2 : 1;
}

export function isNavigationPanelProgress(value: unknown): value is NavigationPanelProgress {
  const progress = value as NavigationPanelProgress | null;
  return !!progress && Number.isInteger(progress.round) && progress.round >= 0 && progress.round <= 999 &&
    Number.isInteger(progress.taps) && progress.taps >= 0 && progress.taps <= 2000 &&
    Array.isArray(progress.rotations) && (progress.rotations.length === 9 || progress.rotations.length === 16) &&
    progress.rotations.every(turn => Number.isInteger(turn) && turn >= 0 && turn <= 3);
}
