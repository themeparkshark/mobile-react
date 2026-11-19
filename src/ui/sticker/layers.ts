/**
 * The kit's layer queue (pure, no React rendering): one floating sheet or dialog at a time, in
 * the order asked, drawn in the tree by the one LayerHost (Overlay.tsx), never by a native Modal.
 * A second native modal presented while the first is still leaving is how the live app drops first
 * presses today; here the next layer only shows once the one before has finished leaving.
 *
 * present -> (front) shown -> close -> leaving (the host peels it off) -> done -> the next shows.
 * The host also registers the front layer with src/ui/modalLayers, so the app's native dialogs and
 * the kit's layers wait for each other instead of stacking.
 */
import type { ReactNode } from 'react';

export type LayerSpec = {
  /** What the host draws (a SheetBody or DialogBody). */
  readonly element: ReactNode;
  /** The way out: the wave foot's ghost, the scrim (when dismissible), VoiceOver escape, Android back. */
  readonly wayOut?: () => void;
  /** A scrim tap takes the way out (default true when there is one). */
  readonly dismissible?: boolean;
  readonly testID?: string;
};

export type LayerEntry = LayerSpec & {
  readonly id: number;
  readonly leaving: boolean;
  /** A host has drawn it. One never drawn (no host had focus) is simply dropped on close: nothing to peel. */
  readonly drawn: boolean;
};

type Listener = () => void;

export function createLayerQueue() {
  let nextId = 1;
  let entries: LayerEntry[] = [];
  const listeners = new Set<Listener>();
  const emit = () => listeners.forEach(l => l());
  return {
    /** Ask for a layer; it shows when every layer asked before it is gone. */
    present(spec: LayerSpec): number {
      const id = nextId++;
      entries = [...entries, { ...spec, id, leaving: false, drawn: false }];
      emit();
      return id;
    },
    /** New content for a layer already asked for (a sheet re-rendered). */
    update(id: number, spec: Partial<LayerSpec>): void {
      if (!entries.some(e => e.id === id)) return;
      entries = entries.map(e => (e.id === id ? { ...e, ...spec } : e));
      emit();
    },
    /** Take a layer away: the front one leaves (peeled off) first; one still waiting is simply dropped. */
    close(id: number): void {
      const at = entries.findIndex(e => e.id === id);
      if (at < 0) return;
      if (at === 0 && entries[0].drawn) {
        if (entries[0].leaving) return;
        entries = entries.map(e => (e.id === id ? { ...e, leaving: true } : e));
      } else {
        entries = entries.filter(e => e.id !== id);
      }
      emit();
    },
    /** A host drew this layer (from now on closing it peels it off). */
    drawn(id: number): void {
      if (!entries.some(e => e.id === id && !e.drawn)) return;
      entries = entries.map(e => (e.id === id ? { ...e, drawn: true } : e));
      emit();
    },
    /** The host finished peeling the front layer off. */
    done(id: number): void {
      if (!entries.some(e => e.id === id)) return;
      entries = entries.filter(e => e.id !== id);
      emit();
    },
    /** The layer the host draws (the first one asked), or null. */
    front(): LayerEntry | null {
      return entries[0] ?? null;
    },
    count(): number {
      return entries.length;
    },
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export type LayerQueue = ReturnType<typeof createLayerQueue>;

/** The app's one kit layer queue. */
export const stickerLayers = createLayerQueue();

/** The scrim tap: takes the way out only when the layer allows it. */
export function scrimAction(entry: Pick<LayerSpec, 'wayOut' | 'dismissible'>): (() => void) | null {
  if (!entry.wayOut) return null;
  return entry.dismissible === false ? null : entry.wayOut;
}

/**
 * The hosts in the tree (a kit Screen's, and the root one mounted once above the navigator), and
 * which one draws: the kit Screen that gained navigation focus most recently and still has it.
 * When no kit Screen has focus (a legacy screen is on top, or a kit screen was covered), the root
 * host draws, so a dialog or toast is always drawn where the player is looking, never inside a
 * covered screen. With no host focused and no root, nothing draws and layers wait for one.
 */
export function createHostRegistry() {
  type Host = { readonly id: number; readonly root: boolean; focused: boolean; seq: number };
  let hosts: Host[] = [];
  let next = 1;
  let clock = 0;
  const listeners = new Set<Listener>();
  const emit = () => listeners.forEach(l => l());
  const active = (): number | null => {
    let best: Host | null = null;
    for (const h of hosts) if (!h.root && h.focused && (!best || h.seq > best.seq)) best = h;
    if (best) return best.id;
    for (let i = hosts.length - 1; i >= 0; i -= 1) if (hosts[i].root) return hosts[i].id;
    return null;
  };
  return {
    add(opts: { readonly root?: boolean; readonly focused?: boolean } = {}): number {
      const id = next++;
      clock += 1;
      hosts = [...hosts, { id, root: !!opts.root, focused: opts.focused ?? true, seq: clock }];
      emit();
      return id;
    },
    remove(id: number): void { hosts = hosts.filter(h => h.id !== id); emit(); },
    /** Navigation focus changed for a screen's host; gaining focus makes it the newest. */
    setFocused(id: number, focused: boolean): void {
      const h = hosts.find(x => x.id === id);
      if (!h || h.focused === focused) return;
      h.focused = focused;
      if (focused) { clock += 1; h.seq = clock; }
      hosts = [...hosts];
      emit();
    },
    active,
    isActive(id: number): boolean { return active() === id; },
    count(): number { return hosts.length; },
    subscribe(listener: Listener): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

export const layerHosts = createHostRegistry();
