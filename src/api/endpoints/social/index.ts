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

export async function fetchComments(threadId: number, page: number, sort: 'latest' | 'oldest' = 'oldest'): Promise<Page<CommentType>> {
  const { data } = await client.get<ApiPaginatedResponseType<CommentType[]>>(`/threads/${threadId}/comments`, { params: { page, sort } });
  return { data: data.data, hasMore: Boolean(data.links?.next) };
}

export async function fetchReplies(commentId: number, page: number): Promise<Page<CommentType>> {
  const { data } = await client.get<ApiPaginatedResponseType<CommentType[]>>(`/comments/${commentId}/children`, { params: { page } });
  return { data: data.data, hasMore: Boolean(data.links?.next) };
}

/** No title: the server makes it from the first line (sending it made the filter read the words twice). */
export async function postThread(body: { content: string; topic?: TopicKey | null; team?: string | null }): Promise<ThreadType> {
  const { data } = await client.post<ApiResponseType<ThreadType>>('/threads', {
    content: body.content,
    topic: body.topic ?? null,
    team: body.team ?? null,
  });
  return data.data;
}

export async function editThread(id: number, content: string): Promise<ThreadType> {
  const { data } = await client.put<ApiResponseType<ThreadType>>(`/threads/${id}`, { content });
  return data.data;
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

export type ReportReason = 'asked_about_me' | 'disrespectful' | 'swearing' | 'personal_info' | 'spam' | 'unrelated' | 'selling';

export async function report(kind: 'thread' | 'comment', id: number, reason: ReportReason): Promise<void> {
  await client.post(kind === 'thread' ? `/threads/${id}/report` : `/comments/${id}/report`, { reason });
}

export async function blockPlayer(playerId: number): Promise<void> {
  await client.post(`/players/${playerId}/block`);
}

export async function unblockPlayer(playerId: number): Promise<void> {
  await client.delete(`/players/${playerId}/block`);
}

/** The rules promise, kept on the server with the time. */
export async function acceptSocialRules(): Promise<string | null> {
  const { data } = await client.post<ApiResponseType<{ social_rules_accepted_at: string | null }>>('/me/social-rules');
  return data.data.social_rules_accepted_at;
}

export async function fetchSocialRules(): Promise<string | null> {
  const { data } = await client.get<ApiResponseType<{ social_rules_accepted_at: string | null }>>('/me/social-rules');
  return data.data.social_rules_accepted_at;
}

/**
 * A blocked personal-info or grooming draft was tapped. Only the category is
 * sent, never the words; three in a day pause posting on the server.
 */
export async function reportFilterHit(code: 'personal_info' | 'grooming'): Promise<{ paused: boolean; paused_until: string | null }> {
  const { data } = await client.post<ApiResponseType<{ paused: boolean; paused_until: string | null }>>('/me/filter-hit', { code });
  return data.data;
}

export async function fetchBlocked(): Promise<PlayerType[]> {
  const { data } = await client.get<ApiResponseType<PlayerType[]>>('/me/blocks');
  return data.data;
}
