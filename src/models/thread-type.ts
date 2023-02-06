import { CommentType } from './comment-type';
import { TagType } from './tag-type';
import { UserType } from './user-type';

export interface ThreadType {
  readonly pinned_at: string;
  readonly created_at: string;
  readonly content: string;
  readonly id: number;
  readonly user: UserType;
  readonly comments_count: number;
  readonly title: string;
  readonly tags: TagType[];
  readonly latest_comment: CommentType;
}
