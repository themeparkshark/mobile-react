/**
 * The Share Studio queue. flexReveal / shareFlex can be called from anywhere
 * (a reward handler, a list row) without a hook; ShareStudioHost (mounted once
 * in Root) shows one request at a time. Calls before the host mounts wait.
 */
import type { FlexKind, FlexOptions, FlexPayload, FlexRequest } from './types';

type Listener = () => void;

let nextId = 1;
const queue: FlexRequest[] = [];
const listeners = new Set<Listener>();

function push(request: FlexRequest): void {
  // A re-share tap while a sheet is already up replaces nothing: one at a time,
  // and the same card is never queued twice in a row.
  const last = queue[queue.length - 1];
  if (last && last.mode === request.mode && last.kind === request.kind && JSON.stringify(last.payload) === JSON.stringify(request.payload)) return;
  queue.push(request);
  listeners.forEach(listener => listener());
}

/** Full-screen Flex moment right after an earn, with a big Share button. */
export function flexReveal<K extends FlexKind>(kind: K, payload: FlexPayload<K>, options: FlexOptions): void {
  push({ id: nextId++, mode: 'reveal', kind, payload, options } as FlexRequest);
}

/** The Flex sheet (preview, Story/Square, Share) for re-sharing where the thing lives. */
export function shareFlex<K extends FlexKind>(kind: K, payload: FlexPayload<K>, options: FlexOptions): void {
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

export function subscribeFlex(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Tests only. */
export function __resetFlexQueue(): void {
  queue.splice(0, queue.length);
  nextId = 1;
}
