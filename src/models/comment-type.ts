import { PlayerType } from './player-type';

export interface CommentType {
  readonly id: number;
  readonly children: CommentType[];
  readonly children_count: number;
  readonly player?: PlayerType;
  readonly content: string;
  readonly created_at: string;
}
