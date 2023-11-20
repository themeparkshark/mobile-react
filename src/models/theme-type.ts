import { CurrencyType } from './currency-type';

export interface ThemeType {
  readonly bottom_bar_url: string;
  readonly currency: CurrencyType;
  readonly splash_screen_url;
  readonly top_bar_url: string;
  readonly tracks: {
    readonly id: number;
    readonly track_url: string;
  }[];
}
