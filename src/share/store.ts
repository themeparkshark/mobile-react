/**
 * The Share Studio queue. flexReveal / shareFlex can be called from anywhere
 * (a reward handler, a list row) without a hook; ShareStudioHost (mounted once
 * in Root) shows one request at a time. Calls before the host mounts wait.
 */
import type { FlexKind, FlexOptions, FlexPayload, FlexRequest } from './types';

type Listener = () => void;

let nextId = 1;
const queue: FlexRequest[] = [];
/** Reveals held back while the player is in the park (they replay after leaving). */
const held: FlexRequest[] = [];

/** Kinds whose art identifies the park: no automatic full-screen reveal while the player is there. */
export const HOLD_IN_PARK: ReadonlySet<string> = new Set(['park_day', 'ride_coin']);

/** True when this request should wait until the player has left the park. */
export function holdWhileInPark(request: Pick<FlexRequest, 'mode' | 'kind'>, inPark: boolean): boolean {
  return inPark && request.mode === 'reveal' && HOLD_IN_PARK.has(request.kind);
}
const listeners = new Set<Listener>();

function push(request: FlexRequest): void {
  // A re-share tap while a sheet is already up replaces nothing: one at a time,
  // and the same card is never queued twice in a row.
  const last = queue[queue.length - 1];
  if (last && last.mode === request.mode && last.kind === request.kind && JSON.stringify(last.payload) === JSON.stringify(request.payload)) return;
  queue.push(request);
  listeners.forEach(listener => listener());
}

/* ------------------------------------------------------------------- warm */
/** Kinds whose art should be decoded ahead of time (a share-eligible screen is up, or a share was asked for). */
const warm = new Set<FlexKind>();
const warmListeners = new Set<Listener>();

export function warmFlex(kind: FlexKind): void {
  if (warm.has(kind)) return;
  warm.add(kind);
  warmListeners.forEach(listener => listener());
}

export function warmKinds(): readonly FlexKind[] {
  return [...warm];
}

export function subscribeWarm(listener: Listener): () => void {
  warmListeners.add(listener);
  return () => { warmListeners.delete(listener); };
}

/** Full-screen Flex moment right after an earn, with a big Share button. */
export function flexReveal<K extends FlexKind>(kind: K, payload: FlexPayload<K>, options: FlexOptions): void {
  warmFlex(kind);
  push({ id: nextId++, mode: 'reveal', kind, payload, options } as FlexRequest);
}

/** The Flex sheet (preview, Story/Square, Share) for re-sharing where the thing lives. */
export function shareFlex<K extends FlexKind>(kind: K, payload: FlexPayload<K>, options: FlexOptions): void {
  warmFlex(kind);
  push({ id: nextId++, mode: 'sheet', kind, payload, options } as FlexRequest);
}

export function currentFlex(): FlexRequest | null {
  return queue[0] ?? null;
}

/** Close a request; the next queued one (if any) shows. */
export function finishFlex(id: number): void {
  const index = queue.findIndex(request => request.id === id);
  if (index < 0) return;
  queue.splice(index, 1);
  listeners.forEach(listener => listener());
}

/** Set a request aside until releaseHeldFlex() (the host calls this when the player leaves the park). */
export function holdFlex(id: number): void {
  const index = queue.findIndex(request => request.id === id);
  if (index < 0) return;
  held.push(...queue.splice(index, 1));
  listeners.forEach(listener => listener());
}

/** Replay held reveals, newest only per kind (one park day, not five). */
export function releaseHeldFlex(): void {
  if (!held.length) return;
  const latest = new Map<string, FlexRequest>();
  held.splice(0, held.length).forEach(request => latest.set(request.kind, request));
  latest.forEach(request => queue.push({ ...request, id: nextId++ }));
  listeners.forEach(listener => listener());
}

export function subscribeFlex(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Tests only. */
export function __resetFlexQueue(): void {
  queue.splice(0, queue.length);
  held.splice(0, held.length);
  hosts.splice(0, hosts.length);
  warm.clear();
  nextId = 1;
}

/* ------------------------------------------------------------------ hosts */
/**
 * Every mounted ShareStudioHost registers here; only the newest one shows the
 * current request. Root mounts the base host, and a screen that is itself an
 * RN Modal mounts its own (<ShareStudioHost portal />) so the sheet presents
 * from that modal instead of from a root that is already presenting (iOS would
 * silently refuse).
 */
const hosts: { readonly id: number; readonly portal: boolean }[] = [];
let nextHost = 1;
const hostListeners = new Set<Listener>();

/** Portal hosts (inside a modal) always outrank Root's host, whatever order they mounted in. */
export function registerFlexHost(portal = false): number {
  const id = nextHost++;
  hosts.push({ id, portal });
  hostListeners.forEach(listener => listener());
  return id;
}

export function unregisterFlexHost(id: number): void {
  const index = hosts.findIndex(host => host.id === id);
  if (index >= 0) hosts.splice(index, 1);
  hostListeners.forEach(listener => listener());
}

export function topFlexHost(): number | null {
  const portals = hosts.filter(host => host.portal);
  const pool = portals.length ? portals : hosts;
  return pool.length ? pool[pool.length - 1].id : null;
}

export function subscribeFlexHosts(listener: Listener): () => void {
  hostListeners.add(listener);
  return () => { hostListeners.delete(listener); };
}
