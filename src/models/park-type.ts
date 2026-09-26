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
  readonly ride_coins_collected?: number;
  readonly ride_coins_available?: number;
  readonly ride_coin_completion_rate?: number | null;
  readonly ride_passport_collected?: number;
  readonly ride_passport_available?: number;
  readonly ride_passport_completion_rate?: number | null;
  readonly ride_passport_task_ids?: number[];
  readonly secret_tasks_count: number;
  readonly stores: StoreType[];
  readonly tasks_count: number;
  readonly welcome_tickets_granted?: number;
}
