import { ThemeType } from './theme-type';

export interface RedeemableType {
  readonly id: number;
  readonly theme: ThemeType;
  readonly latitude: string;
  readonly longitude: string;
  readonly active_from: string;
  readonly active_to: string;
}
