/**
 * Tiny cross-screen bus so the feed stays true after the post screen changes
 * something (a reply, a delete, a block) without refetching the whole feed.
 */
import type { ThreadType } from '../../models/thread-type';

export type SocialEvent =
  | { readonly type: 'thread-updated'; readonly thread: Partial<ThreadType> & { id: number } }
  | { readonly type: 'thread-gone'; readonly id: number }
  | { readonly type: 'player-blocked'; readonly playerId: number }
  | { readonly type: 'player-unblocked'; readonly playerId: number }
  | { readonly type: 'replies-changed'; readonly id: number; readonly delta: number };

type Listener = (event: SocialEvent) => void;
const listeners = new Set<Listener>();

export function emitSocial(event: SocialEvent): void {
  listeners.forEach((listener) => listener(event));
}

export function onSocial(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Apply an event to a list of threads (pure, used by the feed and tests). */
export function applySocialEvent(threads: readonly ThreadType[], event: SocialEvent): ThreadType[] {
  switch (event.type) {
    case 'thread-gone':
      return threads.filter((thread) => thread.id !== event.id);
    case 'player-blocked':
      return threads.filter((thread) => thread.player?.id !== event.playerId);
    case 'thread-updated':
      return threads.map((thread) => (thread.id === event.thread.id ? { ...thread, ...event.thread } as ThreadType : thread));
    case 'replies-changed':
      return threads.map((thread) => (thread.id === event.id
        ? { ...thread, comments_count: Math.max(0, (thread.comments_count ?? 0) + event.delta) }
        : thread));
    default:
      return [...threads];
  }
}
