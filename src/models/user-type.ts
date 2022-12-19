import { InventoryType } from './inventory-type';

export interface UserType {
  readonly coins: number;
  readonly created_at: string;
  readonly current_park_id: number;
  readonly email: string;
  readonly experience: number;
  readonly id: number;
  readonly inventory: InventoryType;
  readonly name: string;
  readonly pivot: {
    readonly tasks_completed: number;
  };
  readonly purple_diamonds: number;
  readonly total_coins: number;
  readonly total_experience: number;
  readonly username: string;
  readonly verified_at: string;
}
