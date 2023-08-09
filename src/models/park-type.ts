import { StoreType } from './store-type';

export interface ParkType {
  readonly catalog_id: number;
  readonly coin_url: string;
  readonly completed_secret_tasks_count: number;
  readonly completed_tasks_count: number;
  readonly completion_rate: number;
  readonly display_name: string;
  readonly id: number;
  readonly image_url: string;
  readonly name: string;
  readonly park_coins_count: number;
  readonly secret_tasks_count: number;
  readonly store: StoreType;
  readonly tasks_count: number;
}
