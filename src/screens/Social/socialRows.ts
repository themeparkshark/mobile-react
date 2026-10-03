/** Reply rows for the post screen (pure, tested in social-threads-v2.test.cjs). */
import type { CommentType } from '../../models/comment-type';

export type Row =
  | { kind: 'comment'; key: string; comment: CommentType; depth: 0 | 1; topId: number }
  | { kind: 'more'; key: string; topId: number; remaining: number };

/** Flatten top-level replies and their answers into list rows. */
export function buildRows(comments: readonly CommentType[], extra: Readonly<Record<number, CommentType[]>>): Row[] {
  const rows: Row[] = [];
  for (const top of comments) {
    rows.push({ kind: 'comment', key: `c${top.id}`, comment: top, depth: 0, topId: top.id });
    const seen = new Set<number>();
    const children = [...(top.children ?? []), ...(extra[top.id] ?? [])].filter((child) => !seen.has(child.id) && seen.add(child.id));
    for (const child of children) {
      if (child.hidden && !(child.children_count > 0)) continue;
      rows.push({ kind: 'comment', key: `c${child.id}`, comment: child, depth: 1, topId: top.id });
    }
    const remaining = (top.children_count ?? 0) - children.length;
    if (remaining > 0) rows.push({ kind: 'more', key: `m${top.id}`, topId: top.id, remaining });
  }
  return rows;
}

export function hiddenLine(comment: CommentType): string {
  switch (comment.hidden) {
    case 'removed': return 'This reply was removed.';
    case 'deleted': return 'This reply was deleted.';
    case 'blocked': return 'Reply from a blocked player.';
    case 'reported': return 'You reported this reply.';
    default: return comment.deleted_at || comment.removed_at ? 'This reply was removed.' : '';
  }
}

