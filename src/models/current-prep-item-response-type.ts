import { PrepItemType } from './prep-item-type';

export interface CurrentPrepItemResponseType {
  readonly type: 'prep_item';
  readonly prep_item: PrepItemType;
  readonly pivot_id: number;
}
