import { UserType } from './user-type';

export interface CommentType {
  readonly id: number;
  readonly children: CommentType[];
  readonly children_count: number;
  readonly user?: UserType;
  readonly content: string;
  readonly created_at: string;
  readonly deleted_at: string;
  readonly removed_at: string;
}
