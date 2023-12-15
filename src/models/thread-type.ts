import { AttachmentType } from './attachment-type';
import { CommentType } from './comment-type';
import { PlayerType } from './player-type';
import { ReactionType } from './reaction-type';
import { TagType } from './tag-type';

export interface ThreadType {
  readonly attachments: AttachmentType[];
  readonly pinned_at: string;
  readonly created_at: string;
  readonly content: string;
  readonly id: number;
  readonly reactions_count: number;
  readonly player: PlayerType;
  readonly comments_count: number;
  readonly title: string;
  readonly tags: TagType[];
  readonly latest_comment: CommentType;
  readonly reactions: ReactionType[];
  readonly current_user_reaction: ReactionType;
}
