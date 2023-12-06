import { AttachmentType } from './attachment-type';
import { CommentType } from './comment-type';
import { ReactionType } from './reaction-type';
import { TagType } from './tag-type';
import { UserType } from './user-type';

export interface ThreadType {
  readonly attachments: AttachmentType[];
  readonly pinned_at: string;
  readonly created_at: string;
  readonly content: string;
  readonly id: number;
  readonly reactions_count: number;
  readonly user: UserType;
  readonly comments_count: number;
  readonly title: string;
  readonly tags: TagType[];
  readonly latest_comment: CommentType;
  readonly reactions: ReactionType[];
}
