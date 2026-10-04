import { PlayerType } from './player-type';

export interface CommentType {
  readonly id: number;
  readonly children: CommentType[];
  readonly children_count: number;
  readonly player?: PlayerType | null;
  readonly content: string | null;
  readonly created_at: string;
  readonly deleted_at: string;
  readonly removed_at: string;
  /** Threads v2: why the text is not shown (removed, deleted, blocked, reported). */
  readonly hidden?: 'removed' | 'deleted' | 'blocked' | 'reported' | null;
  readonly thread_id?: number;
  readonly parent_id?: number | null;
  /** Held for a quick safety look: only the author sees it. */
  readonly review?: 'pending' | 'person' | 'care' | null;
}
