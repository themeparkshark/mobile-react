import { UserType } from './user-type';

export interface CommentType {
  readonly id: number;
  readonly children: CommentType[];
  readonly children_count: number;
  readonly user: UserType;
  readonly content: string;
  readonly updated_at: string;
}
