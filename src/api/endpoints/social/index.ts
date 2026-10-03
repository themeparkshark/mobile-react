/**
 * Shark Social API. Unlike the old endpoints these never show an alert and
 * never swallow errors: callers keep the draft and show errorLine(error).
 */
import client from '../../client';
import type { ApiResponseType } from '../../../models/api-response-type';
import type { ApiPaginatedResponseType } from '../../../models/api-paginated-response-type';
import type { ThreadType } from '../../../models/thread-type';
import type { CommentType } from '../../../models/comment-type';
import type { ReactionType } from '../../../models/reaction-type';
import type { PlayerType } from '../../../models/player-type';
import type { FeedTab, Page, TopicKey } from '../../../screens/threads/socialModel';

export async function fetchFeed(page: number, tab: FeedTab, options: { team?: string | null; topic?: TopicKey | null } = {}): Promise<Page<ThreadType>> {
  // lean: v2 reads reaction_counts, so the server skips the older grouped reactions load.
  const params: Record<string, string | number | boolean> = { page, pinned: false, lean: 1 };
  if (tab === 'friends') {
    params.friends = true;
    params.sort = 'latest';
  } else if (tab === 'team') {
    if (options.team) params.team = options.team;
    params.sort = 'latest';
  } else {
    params.sort = tab;
  }
  if (options.topic) params.topic = options.topic;
  const { data } = await client.get<ApiPaginatedResponseType<ThreadType[]>>('/threads', { params });
  return { data: data.data, hasMore: Boolean(data.links?.next) };
}

export async function fetchPinned(): Promise<ThreadType[]> {
  const { data } = await client.get<ApiResponseType<ThreadType[]>>('/threads', { params: { page: 1, pinned: true, sort: 'latest' } });
  return data.data;
}

export async function fetchThread(id: number): Promise<ThreadType> {
  const { data } = await client.get<ApiResponseType<ThreadType>>(`/threads/${id}`);
  return data.data;
}

/** Preview build: the production API only knows sort=latest (newest first) and 422s on sort=oldest. */
function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

/** Old-server fallback for oldest-first: read every page newest-first (capped), then flip it. */
const OLD_SERVER_COMMENT_PAGES = 10;
let oldCommentsServer = false;

async function fetchAllCommentsOldestFirst(threadId: number): Promise<Page<CommentType>> {
  const all: CommentType[] = [];
  for (let page = 1; page <= OLD_SERVER_COMMENT_PAGES; page += 1) {
    const { data } = await client.get<ApiPaginatedResponseType<CommentType[]>>(`/threads/${threadId}/comments`, { params: { page } });
    all.push(...data.data);
    if (!data.links?.next) break;
  }
  return { data: all.reverse(), hasMore: false };
}

export async function fetchComments(threadId: number, page: number, sort: 'latest' | 'oldest' = 'oldest'): Promise<Page<CommentType>> {
  if (sort === 'oldest' && oldCommentsServer) {
    return page === 1 ? fetchAllCommentsOldestFirst(threadId) : { data: [], hasMore: false };
  }
  try {
    const { data } = await client.get<ApiPaginatedResponseType<CommentType[]>>(`/threads/${threadId}/comments`, { params: { page, sort } });
    return { data: data.data, hasMore: Boolean(data.links?.next) };
  } catch (error) {
    if (sort !== 'oldest' || statusOf(error) !== 422) throw error;
    oldCommentsServer = true;
    return page === 1 ? fetchAllCommentsOldestFirst(threadId) : { data: [], hasMore: false };
  }
}

export async function fetchReplies(commentId: number, page: number): Promise<Page<CommentType>> {
  const { data } = await client.get<ApiPaginatedResponseType<CommentType[]>>(`/comments/${commentId}/children`, { params: { page } });
  return { data: data.data, hasMore: Boolean(data.links?.next) };
}

/** No title: the server makes it from the first line (sending it made the filter read the words twice). */
export async function postThread(body: { content: string; title?: string; topic?: TopicKey | null; team?: string | null }): Promise<ThreadType> {
  const { data } = await client.post<ApiResponseType<ThreadType>>('/threads', {
    content: body.content,
    // Preview build: the production API still requires a 10+ character title.
    ...(body.title ? { title: body.title } : {}),
    topic: body.topic ?? null,
    team: body.team ?? null,
  });
  return data.data;
}

export async function editThread(id: number, content: string): Promise<ThreadType> {
  try {
    const { data } = await client.put<ApiResponseType<ThreadType>>(`/threads/${id}`, { content });
    return data.data;
  } catch (error) {
    // Preview build: the production API saves the edit, then 500s while building
    // its reply. Read the post back; if the new words landed, the edit worked.
    if ((statusOf(error) ?? 0) < 500) throw error;
    const fresh = await fetchThread(id);
    if ((fresh.content ?? '').trim() === content.trim()) return fresh;
    throw error;
  }
}

export async function removeThread(id: number): Promise<void> {
  await client.delete(`/threads/${id}`);
}

/** parentId keeps display one level deep; replyToId is the reply being answered (its author is notified). */
export async function postComment(threadId: number, content: string, parentId?: number | null, replyToId?: number | null): Promise<CommentType> {
  const { data } = await client.post<ApiResponseType<CommentType>>(`/threads/${threadId}/comments`, {
    content,
    comment_id: parentId ?? null,
    reply_to_id: replyToId ?? null,
  });
  return data.data;
}

export async function removeComment(id: number): Promise<void> {
  await client.delete(`/comments/${id}`);
}

export async function reactToThread(threadId: number, reactionTypeId: number): Promise<ReactionType> {
  const { data } = await client.post<ApiResponseType<ReactionType>>(`/threads/${threadId}/add-reaction`, { reaction_type_id: reactionTypeId });
  return data.data;
}

export async function removeReaction(reactionId: number): Promise<void> {
  await client.delete(`/reactions/${reactionId}`);
}

export type ReportReason = 'disrespectful' | 'swearing' | 'personal_info' | 'spam' | 'unrelated' | 'selling';

export async function report(kind: 'thread' | 'comment', id: number, reason: ReportReason): Promise<void> {
  const url = kind === 'thread' ? `/threads/${id}/report` : `/comments/${id}/report`;
  try {
    await client.post(url, { reason });
  } catch (error) {
    // Preview build: the production API has no personal_info reason yet (422).
    if (reason !== 'personal_info' || statusOf(error) !== 422) throw error;
    await client.post(url, { reason: 'disrespectful' });
  }
}

export async function blockPlayer(playerId: number): Promise<void> {
  await client.post(`/players/${playerId}/block`);
}

export async function unblockPlayer(playerId: number): Promise<void> {
  await client.delete(`/players/${playerId}/block`);
}

export async function fetchBlocked(): Promise<PlayerType[]> {
  const { data } = await client.get<ApiResponseType<PlayerType[]>>('/me/blocks');
  return data.data;
}
