/**
 * A tap on a sheet that is on its way out reaches what is under it (fix pass w4, lane press, N01).
 *
 * Read on the simulator with the hosts' phase log (ui/pressTrace.ts), release-like JS: after BACK TO MAP the Rewards
 * sheet stays on screen natively for 1.0 to 1.3 s (the 180 ms shrink, its answer back to JS, the commit that hides
 * the native sheet, then UIKit taking it down). Its dim is already gone, so a kid sees the map and taps it, but iOS
 * hands that touch to the leaving sheet's own view: 10 of 16 first presses on Rewards in that window did nothing,
 * and the same happens to every button under every sheet. Only PLAY! claimed such a tap (fix round w3).
 *
 * So the app's one native door (ui/DoorModal.tsx) keeps the first tap that lands on a leaving top-level sheet, and the
 * moment that sheet is gone from the screen it presses whatever is now under that point: the nearest button there,
 * found with React Native's own hit test (the one the element inspector uses). Nothing new presents while the old
 * sheet is still leaving, so UIKit never refuses it. A tap a button claimed itself (PLAY!'s own claim) is not pressed
 * twice. If the hit test is not available the tap is simply not replayed (today's behavior), never a crash.
 */
import { pressTrace } from './pressTrace';

/** The parts of a React fiber this reads (React Native's renderer gives the hit test's answer as one). */
export interface ChainNode {
  readonly return?: ChainNode | null;
  readonly tag?: number;
  readonly type?: unknown;
  readonly memoizedProps?: Record<string, unknown> | null;
  readonly stateNode?: unknown;
}

const HOST_COMPONENT = 5;
const MAX_DEPTH = 60;
/** A tap older than this when its sheet finally goes is not replayed (the kid has moved on). */
export const TAP_THROUGH_MAX_AGE_MS = 2500;

/** Props that mark a map or a map pin: a tap there needs a real map coordinate, so it is never replayed. */
const MAP_PROPS = ['coordinate', 'region', 'initialRegion', 'onRegionChangeComplete'];

/**
 * The press a hit lands on: the nearest ancestor with an onPress, unless it is disabled, inside another sheet, or a
 * map. Pure, so it is tested without a phone.
 */
export function pressTargetFromChain(hit: ChainNode | null | undefined): { onPress: (event: unknown) => void; depth: number } | null {
  let node = hit ?? null;
  let target: { onPress: (event: unknown) => void; depth: number } | null = null;
  for (let depth = 0; node && depth < 400; depth++, node = node.return ?? null) {
    // A hit inside a sheet's own subtree is on that sheet, not on the screen under it.
    if (node.tag === HOST_COMPONENT && node.type === 'RCTModalHostView') return null;
    const props = node.memoizedProps;
    if (!target && depth < MAX_DEPTH && props) {
      if (MAP_PROPS.some(key => key in props)) return null;
      if (typeof props.onPress === 'function') {
        const state = props.accessibilityState as { disabled?: boolean } | undefined;
        if (props.disabled === true || state?.disabled === true) return null;
        target = { onPress: props.onPress as (event: unknown) => void, depth };
      }
    }
  }
  return target;
}

/** The outermost host view above a fiber: the screen's root view, where the hit test starts. */
export function rootHostFromChain(from: ChainNode | null | undefined): ChainNode | null {
  let node = from ?? null;
  let root: ChainNode | null = null;
  for (let depth = 0; node && depth < 400; depth++, node = node.return ?? null) {
    if (node.tag === HOST_COMPONENT) root = node;
  }
  return root;
}

/** The press event a replayed press carries (handlers here read nothing from it; it is shaped like a real one). */
export function replayEvent(x: number, y: number, now: number): unknown {
  return {
    nativeEvent: { pageX: x, pageY: y, locationX: 0, locationY: 0, timestamp: now, identifier: 0, touches: [], changedTouches: [] },
    persist: () => undefined, preventDefault: () => undefined, stopPropagation: () => undefined,
    isDefaultPrevented: () => false, isPropagationStopped: () => false,
  };
}

type FindNodeAtPoint = (node: unknown, x: number, y: number, callback: (hit: ChainNode | null) => void) => void;

/** One kept tap: the first that landed on a leaving top-level sheet. */
export interface KeptTap { x: number; y: number; at: number; claimed: boolean }

export function createTapThrough(deps: {
  findNodeAtPoint: () => FindNodeAtPoint | null;
  now?: () => number;
}) {
  const now = deps.now ?? (() => Date.now());
  let kept: KeptTap | null = null;
  let screenRoot: ChainNode | null = null;
  return {
    /** The screen's root view (found once from any top-level sheet host: it never changes). */
    setScreenRoot(from: ChainNode | null | undefined): void {
      if (!screenRoot) screenRoot = rootHostFromChain(from);
    },
    hasScreenRoot: () => screenRoot !== null,
    /** A tap on a leaving top-level sheet; the first one is kept until that sheet is gone. */
    keep(x: number, y: number): KeptTap {
      const tap: KeptTap = { x, y, at: now(), claimed: false };
      if (!kept) kept = tap;
      return kept;
    },
    kept: () => kept,
    /** The sheet is gone from the screen: press what is under the kept tap. */
    deliver(): 'none' | 'claimed' | 'stale' | 'no_hit_test' | 'pending' {
      const tap = kept;
      kept = null;
      if (!tap) return 'none';
      if (tap.claimed) return 'claimed';
      if (now() - tap.at > TAP_THROUGH_MAX_AGE_MS) return 'stale';
      const find = deps.findNodeAtPoint();
      // Fabric keeps each view's newest shadow node on its fiber; the hit test reads the newest revision of the tree.
      const shadow = (screenRoot?.stateNode as { node?: unknown } | undefined)?.node;
      if (!find || !shadow) return 'no_hit_test';
      try {
        find(shadow, tap.x, tap.y, hit => {
          const target = pressTargetFromChain(hit);
          pressTrace('tapThrough.hit', () => `x=${Math.round(tap.x)} y=${Math.round(tap.y)} target=${target ? `depth${target.depth}` : 'none'}`);
          if (!target) return;
          try { target.onPress(replayEvent(tap.x, tap.y, now())); } catch (error) { pressTrace('tapThrough.error', () => String(error)); }
        });
      } catch {
        return 'no_hit_test';
      }
      return 'pending';
    },
    /** The kept tap's sheet came back instead of going (asked to show again): nothing to replay. */
    drop(): void { kept = null; },
    /** Tests only. */
    reset(): void { kept = null; screenRoot = null; },
  };
}

/** The app's one: React Native's Fabric hit test, when this build has it. */
export const tapThrough = createTapThrough({
  findNodeAtPoint: () => {
    const ui = (globalThis as { nativeFabricUIManager?: { findNodeAtPoint?: FindNodeAtPoint } }).nativeFabricUIManager;
    return typeof ui?.findNodeAtPoint === 'function' ? ui.findNodeAtPoint.bind(ui) : null;
  },
});
