import { CurrencyType } from './currency-type';

export interface RedeemableType {
  readonly id: number;
  readonly currency: CurrencyType;
  readonly latitude: string;
  readonly longitude: string;
  readonly active_from: string;
  readonly active_to: string;
}
