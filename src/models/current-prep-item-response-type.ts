import { PrepItemType } from './prep-item-type';

export interface CurrentPrepItemResponseType extends PrepItemType {
  readonly pivot_id: number;
  readonly distance_meters: number;
}
