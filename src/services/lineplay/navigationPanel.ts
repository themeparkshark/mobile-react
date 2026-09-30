/** Original starport puzzle. No attraction facts, clock, network or reward math. */
export interface NavigationPanelProgress {
  readonly round: number;
  readonly rotations: readonly number[];
  readonly taps: number;
}
export interface NavigationPanel {
  readonly masks: readonly number[];
  readonly route: readonly number[];
  readonly relays: readonly number[];
  readonly name: string;
}
export const PANEL_PORTS = { north: 1, east: 2, south: 4, west: 8 } as const;
const ROUTES = [
  [3, 0, 1, 2, 5], [3, 6, 7, 8, 5],
  [3, 0, 1, 4, 7, 8, 5], [3, 6, 7, 4, 1, 2, 5],
] as const;
const NAMES = ['Comet crossing', 'Moon loop', 'Nebula weave', 'Starlight switchback'];

export function rotatePanelMask(mask: number, turns: number): number {
  let result = mask;
  for (let turn = 0; turn < ((turns % 4) + 4) % 4; turn++) result = ((result << 1) & 15) | (result >> 3);
  return result;
}
function direction(from: number, to: number): number {
  return to === from - 3 ? 1 : to === from + 1 ? 2 : to === from + 3 ? 4 : 8;
}
export function createNavigationPanel(seed: number, round = 0): NavigationPanel {
  const variant = (((seed >>> 0) % ROUTES.length) + round) % ROUTES.length;
  const route = ROUTES[variant];
  const masks: number[] = Array.from({ length: 9 }, (_, index) => (index + variant) % 2 ? 3 : 5);
  route.forEach((index, step) => {
    masks[index] = (step === 0 ? 8 : direction(index, route[step - 1])) |
      (step === route.length - 1 ? 2 : direction(index, route[step + 1]));
  });
  return { masks, route, relays: [route[1], route[Math.floor(route.length / 2)], route[route.length - 2]], name: NAMES[variant] };
}
export function traceNavigationPanel(panel: NavigationPanel, rotations: readonly number[]) {
  const masks = panel.masks.map((mask, index) => rotatePanelMask(mask, rotations[index] ?? 0));
  const connected = new Set<number>();
  const pending = masks[3] & 8 ? [3] : [];
  while (pending.length) {
    const index = pending.pop()!;
    if (connected.has(index)) continue;
    connected.add(index);
    const row = Math.floor(index / 3), column = index % 3;
    const neighbors = [[1, index - 3, 4, row > 0], [2, index + 1, 8, column < 2],
      [4, index + 3, 1, row < 2], [8, index - 1, 2, column > 0]] as const;
    for (const [port, other, opposite, inside] of neighbors)
      if (inside && (masks[index] & port) && (masks[other] & opposite)) pending.push(other);
  }
  const signals = panel.relays.filter(index => connected.has(index)).length;
  const reachesExit = connected.has(5) && !!(masks[5] & 2);
  return { masks, connected: [...connected], signals, reachesExit, solved: signals === 3 && reachesExit };
}
export function createNavigationPanelProgress(seed: number, round = 0, alreadyComplete = false): NavigationPanelProgress {
  if (alreadyComplete) return { round, rotations: Array(9).fill(0), taps: 0 };
  let value = ((seed >>> 0) ^ Math.imul(round + 1, 0x9e3779b9)) >>> 0;
  const rotations = Array.from({ length: 9 }, () => {
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
    return (value >>> 0) % 4;
  });
  const panel = createNavigationPanel(seed, round);
  const wrong = panel.route.filter(index => rotatePanelMask(panel.masks[index], rotations[index]) !== panel.masks[index]);
  // Every round starts with work to do; no pre-solved board or single lucky tap.
  for (const index of panel.route) {
    if (wrong.length >= 3) break;
    if (!wrong.includes(index)) { rotations[index] = 1; wrong.push(index); }
  }
  return { round, rotations, taps: 0 };
}
export function turnNavigationTile(seed: number, progress: NavigationPanelProgress, index: number): NavigationPanelProgress {
  if (!Number.isInteger(index) || index < 0 || index > 8 ||
      traceNavigationPanel(createNavigationPanel(seed, progress.round), progress.rotations).solved) return progress;
  return { ...progress, taps: Math.min(2000, progress.taps + 1),
    rotations: progress.rotations.map((turn, tile) => tile === index ? (turn + 1) % 4 : turn) };
}
export function nextNavigationRepair(panel: NavigationPanel, progress: NavigationPanelProgress): number | null {
  return panel.route.find(index => rotatePanelMask(panel.masks[index], progress.rotations[index]) !== panel.masks[index]) ?? null;
}
export function isNavigationPanelProgress(value: unknown): value is NavigationPanelProgress {
  const progress = value as NavigationPanelProgress | null;
  return !!progress && Number.isInteger(progress.round) && progress.round >= 0 && progress.round <= 999 &&
    Number.isInteger(progress.taps) && progress.taps >= 0 && progress.taps <= 2000 &&
    Array.isArray(progress.rotations) && progress.rotations.length === 9 &&
    progress.rotations.every(turn => Number.isInteger(turn) && turn >= 0 && turn <= 3);
}
