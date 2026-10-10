import type { NextUpAction } from '../../api/endpoints/live-events/nextUp';

/** Height the rail takes in the suggestion slot (54 pt row plus an 8 pt gap), so toasts sit under it. */
export const NEXT_UP_RAIL_SPACE = 62;

export type NextUpRoute =
  | { readonly kind: 'event' }
  | { readonly kind: 'daily_chest' }
  | { readonly kind: 'retention'; readonly open: 'chest' | 'daily3' }
  | { readonly kind: 'trail' }
  | { readonly kind: 'task'; readonly taskId: number }
  | { readonly kind: 'nearest_ride' }
  | { readonly kind: 'home_find' }
  | { readonly kind: 'none' };

/** What a rail GO opens on the map (pure; the map does the opening). Unknown actions from a newer server do nothing. */
export function nextUpRoute(action: NextUpAction | { readonly type: string } | null | undefined): NextUpRoute {
  switch (action?.type) {
    case 'open_event': return { kind: 'event' };
    case 'daily_chest': return { kind: 'daily_chest' };
    case 'level_chest': return { kind: 'retention', open: 'chest' };
    case 'daily_three': return { kind: 'retention', open: 'daily3' };
    case 'trail': return { kind: 'trail' };
    case 'show_ride': {
      const id = Number((action as { task_id?: unknown }).task_id);
      return Number.isFinite(id) ? { kind: 'task', taskId: id } : { kind: 'none' };
    }
    case 'ride': return { kind: 'nearest_ride' };
    case 'home_find': return { kind: 'home_find' };
    default: return { kind: 'none' };
  }
}
